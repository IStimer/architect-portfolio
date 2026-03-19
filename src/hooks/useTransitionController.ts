import { useEffect, useRef } from 'react';
import { Mesh } from 'ogl';
import { gsap } from 'gsap';
import type { ViewMode, ProjectData } from '../types';
import type { OGLContext } from './useOGLRenderer';
import type { SliderModeHandle } from './useSliderMode';
import type { GridModeHandle } from './useInfiniteGridMode';
import { buildLayout } from './useInfiniteGridMode';

interface TransitionControllerProps {
  getContext: () => OGLContext | null;
  viewMode: ViewMode;
  currentIndex: number;
  projects: ProjectData[];
  sliderHandle: SliderModeHandle;
  gridHandle: GridModeHandle;
  onTransitionComplete: (target: 'slider' | 'grid') => void;
  onIndexChange?: (index: number) => void;
}

// ── Helpers ──────────────────────────────────────────────────────

const SLIDE_SPACING = 0.04;
const STAGGER_INTERVAL = 0.03; // tighter stagger for fewer meshes

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Compute slider positions for all projects, centered on `idx`. */
function sliderTargets(
  projects: ProjectData[],
  vp: { width: number; height: number },
  idx: number,
) {
  const minimapW = (80 / window.innerWidth) * vp.width;
  const panelW = vp.width * 0.25;
  const cx = (-vp.width / 2 + minimapW + vp.width / 2 - panelW) / 2;
  const w = 0.35 * vp.width;
  const h = 0.50 * vp.height;
  const sp = SLIDE_SPACING * vp.height;

  const out: { slug: string; x: number; y: number; w: number; h: number }[] = [];
  let cum = 0;
  for (let i = 0; i < projects.length; i++) {
    out.push({ slug: projects[i].slug, x: cx, y: -cum, w, h });
    cum += h + sp;
  }

  const totalH = cum;
  const shift = -(out[idx]?.y ?? 0);

  return out.map((t) => {
    let y = t.y + shift;
    y = ((y + totalH / 2) % totalH + totalH) % totalH - totalH / 2;
    return { ...t, y };
  });
}

function byDist(pts: { x: number; y: number }[]) {
  const m = pts.map((p, i) => ({ i, d: Math.hypot(p.x, p.y) }));
  m.sort((a, b) => a.d - b.d);
  return m.map((e) => e.i);
}

function rankMap(sorted: number[], n: number) {
  const r = new Array<number>(n);
  sorted.forEach((orig, rank) => { r[orig] = rank; });
  return r;
}

/** Find which slug is closest to viewport center in an array of positioned meshes */
function findCenterSlug(items: { slug: string; x: number; y: number }[]): string | null {
  let bestSlug: string | null = null;
  let bestD = Infinity;
  for (const item of items) {
    const d = Math.hypot(item.x, item.y);
    if (d < bestD) { bestD = d; bestSlug = item.slug; }
  }
  return bestSlug;
}

// ── Mesh info for matching ──────────────────────────────────────

interface TransitionMesh {
  mesh: Mesh;
  slug: string;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
}

// ── Hook ────────────────────────────────────────────────────────

export const useTransitionController = ({
  getContext,
  viewMode,
  currentIndex,
  projects,
  sliderHandle,
  gridHandle,
  onTransitionComplete,
  onIndexChange,
}: TransitionControllerProps) => {
  const isAnimatingRef = useRef(false);
  const gridScrollAnchorRef = useRef<{ x: number; y: number } | null>(null);

  const getContextRef = useRef(getContext);
  getContextRef.current = getContext;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const sliderRef = useRef(sliderHandle);
  sliderRef.current = sliderHandle;
  const gridRef = useRef(gridHandle);
  gridRef.current = gridHandle;
  const onCompleteRef = useRef(onTransitionComplete);
  onCompleteRef.current = onTransitionComplete;
  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;

  useEffect(() => {
    const toGrid = viewMode === 'transitioning-to-grid';
    const toSlider = viewMode === 'transitioning-to-slider';
    if ((!toGrid && !toSlider) || isAnimatingRef.current) return;

    const ctx = getContextRef.current();
    if (!ctx) return;

    isAnimatingRef.current = true;
    let completed = false;
    let delayedRemoval: gsap.core.Tween | null = null;
    let gridScrollAnchor: { x: number; y: number } | null = null;

    const { scene, viewport } = ctx;
    const vpW = viewport.width;
    const vpH = viewport.height;
    const dest: 'grid' | 'slider' = toGrid ? 'grid' : 'slider';
    const prj = projectsRef.current;

    // ── Take ownership of source meshes ──
    const sources: TransitionMesh[] = [];

    if (toGrid) {
      // Slider → Grid: take the ~9 windowed slider meshes
      const slides = sliderRef.current.takeOwnership();

      const postfx = sliderRef.current.getPostfxMesh();
      if (postfx) {
        postfx.program.uniforms.u_distortionAmount.value = 0;
        postfx.setParent(null);
      }

      slides.forEach((s) => {
        s.mesh.setParent(scene);
        s.program.uniforms.u_distortionAmount.value = 0;
        s.program.uniforms.u_parallax.value = 0;
        s.program.uniforms.uHover.value = 0;
        sources.push({
          mesh: s.mesh, slug: s.slug,
          startX: s.mesh.position.x as number, startY: s.mesh.position.y as number,
          startW: s.mesh.scale.x as number, startH: s.mesh.scale.y as number,
        });
      });
    } else {
      // Grid → Slider: take the ~30 pooled grid meshes
      const items = gridRef.current.takeOwnership();

      // Re-wrap to nearest-to-center positions
      const layout = gridRef.current.getLayout();
      if (layout) {
        const { repeatW, repeatH } = layout;
        items.forEach((item) => {
          let px = item.mesh.position.x as number;
          let py = item.mesh.position.y as number;
          px = ((px + repeatW / 2) % repeatW + repeatW) % repeatW - repeatW / 2;
          py = ((py + repeatH / 2) % repeatH + repeatH) % repeatH - repeatH / 2;
          item.mesh.position.x = px;
          item.mesh.position.y = py;
        });
      }

      items.forEach((item) => {
        sources.push({
          mesh: item.mesh,
          slug: item.slug,
          startX: item.mesh.position.x as number,
          startY: item.mesh.position.y as number,
          startW: item.mesh.scale.x as number,
          startH: item.mesh.scale.y as number,
        });
      });
    }

    const n = sources.length;
    if (n === 0) { isAnimatingRef.current = false; return; }

    // ── For grid→slider: detect which project to center on ──
    let idx: number;
    if (toSlider) {
      const centerSlug = findCenterSlug(sources.map((s) => ({
        slug: s.slug, x: s.startX, y: s.startY,
      })));
      idx = prj.findIndex((p) => p.slug === centerSlug);
      if (idx === -1) idx = 0;

      if (onIndexChangeRef.current) {
        onIndexChangeRef.current(idx);
      }
    } else {
      idx = currentIndexRef.current;
    }

    // ── Build destination target map (slug → position) ──
    const targetMap = new Map<string, { x: number; y: number; w: number; h: number }>();

    if (toGrid) {
      const existingLayout = gridRef.current.getLayout();
      const gridLayout = existingLayout ?? buildLayout(prj, vpW, vpH);
      const { repeatW, repeatH } = gridLayout;

      // Find current project's grid position to center wrapping on it
      const currentProj = gridLayout.positions.find((p) => p.projectIndex === idx);
      const anchorX = currentProj ? currentProj.x : 0;
      const anchorY = currentProj ? currentProj.y : 0;

      // Grid wrapping formula: wx = pos.x - sx, wy = pos.y + sy
      // To center on anchor: pos.x - sx = 0 → sx = anchorX
      //                       pos.y + sy = 0 → sy = -anchorY
      const gridScrollX = anchorX;
      const gridScrollY = -anchorY;

      gridLayout.positions.forEach((p) => {
        const slug = prj[p.projectIndex]?.slug;
        if (!slug) return;
        // Match grid wrapping: wx = pos.x - sx, wy = pos.y + sy
        let wx = p.x - gridScrollX;
        let wy = p.y + gridScrollY;
        wx = ((wx + repeatW / 2) % repeatW + repeatW) % repeatW - repeatW / 2;
        wy = ((wy + repeatH / 2) % repeatH + repeatH) % repeatH - repeatH / 2;
        targetMap.set(slug, { x: wx, y: wy, w: p.w, h: p.h });
      });

      // Store scroll so grid starts at matching position
      gridScrollAnchor = { x: gridScrollX, y: gridScrollY };

    } else {
      const sliderPos = sliderTargets(prj, viewport, idx);
      sliderPos.forEach((p) => {
        targetMap.set(p.slug, { x: p.x, y: p.y, w: p.w, h: p.h });
      });
    }

    // ── Match sources to targets by slug ──
    type MatchedItem = {
      mesh: Mesh;
      sx: number; sy: number; sw: number; sh: number;
      ex: number; ey: number; ew: number; eh: number;
      matched: boolean;
    };

    const items: MatchedItem[] = sources.map((src) => {
      const target = targetMap.get(src.slug);
      if (target) {
        return {
          mesh: src.mesh,
          sx: src.startX, sy: src.startY, sw: src.startW, sh: src.startH,
          ex: target.x, ey: target.y, ew: target.w, eh: target.h,
          matched: true,
        };
      }
      // No match — fade out in place
      return {
        mesh: src.mesh,
        sx: src.startX, sy: src.startY, sw: src.startW, sh: src.startH,
        ex: src.startX, ey: src.startY, ew: src.startW, eh: src.startH,
        matched: false,
      };
    });

    // ── Stagger order: center-first ──
    const pos0 = items.map((it) => ({ x: it.sx, y: it.sy }));
    const staggerRank = rankMap(byDist(pos0), n);

    // ── Keep uMeshSize in sync ──
    const allMeshes = items.map((it) => it.mesh);
    const syncUniforms = () => {
      for (let i = 0; i < n; i++) {
        const prog = (allMeshes[i] as any).program;
        if (prog?.uniforms?.uMeshSize) {
          prog.uniforms.uMeshSize.value = [allMeshes[i].scale.x, allMeshes[i].scale.y];
        }
      }
    };
    gsap.ticker.add(syncUniforms);

    // ── Timeline: Magnetic Morph ──
    const tl = gsap.timeline({
      onComplete: () => {
        completed = true;
        gsap.ticker.remove(syncUniforms);

        for (let i = 0; i < n; i++) {
          const prog = (allMeshes[i] as any).program;
          if (prog?.uniforms?.uAlpha) prog.uniforms.uAlpha.value = 1.0;
          if (prog?.uniforms?.u_distortionAmount) prog.uniforms.u_distortionAmount.value = 0;
          if (prog?.uniforms?.uWind) prog.uniforms.uWind.value = 0;
          if (prog?.uniforms?.uWindDir) prog.uniforms.uWindDir.value = [0, 0];
        }

        gridScrollAnchorRef.current = gridScrollAnchor;
        onCompleteRef.current(dest);
        isAnimatingRef.current = false;

        delayedRemoval = gsap.delayedCall(0.15, () => {
          allMeshes.forEach((m) => {
            m.position.z = 0;
            m.rotation.z = 0;
            m.setParent(null);
          });
          delayedRemoval = null;
        });
      },
    });

    for (let i = 0; i < n; i++) {
      const it = items[i];
      const staggerDelay = staggerRank[i] * STAGGER_INTERVAL;

      const { sx, sy, sw, sh, ex, ey, ew, eh, matched } = it;
      const dx = ex - sx, dy = ey - sy;
      const dist = Math.hypot(dx, dy);

      // Bezier control point
      let cpx = (sx + ex) / 2;
      let cpy = (sy + ey) / 2;
      if (dist > 0.001) {
        const perpX = -dy / dist;
        const perpY = dx / dist;
        const offset = dist * 0.2;
        cpx += perpX * offset;
        cpy += perpY * offset;
      }

      const movesMoreX = Math.abs(dx) > Math.abs(dy);

      // Wind direction
      const windDirX = dist > 0.001 ? dx / dist : 0;
      const windDirY = dist > 0.001 ? dy / dist : 0;
      const prog = (it.mesh as any).program;
      if (prog?.uniforms?.uWindDir) {
        prog.uniforms.uWindDir.value = [windDirX, -windDirY];
      }

      const proxy = { t: 0 };
      tl.to(proxy, {
        t: 1,
        duration: matched ? 1.0 : 0.5, // unmatched: quick fade out
        ease: matched ? 'power3.inOut' : 'power2.in',
        onUpdate: () => {
          const p = proxy.t;
          const inv = 1 - p;
          const sinP = Math.sin(p * Math.PI);

          if (matched) {
            // Quadratic bezier position
            it.mesh.position.x = inv * inv * sx + 2 * inv * p * cpx + p * p * ex;
            it.mesh.position.y = inv * inv * sy + 2 * inv * p * cpy + p * p * ey;

            // Z arc
            it.mesh.position.z = sinP * 0.1;

            // Rotation
            const angle = Math.atan2(dy, dx);
            it.mesh.rotation.z = sinP * angle * 0.05;

            // Squash & stretch
            const squash = 1 - sinP * 0.08;
            const stretch = 1 + sinP * 0.04;
            const curW = lerp(sw, ew, p);
            const curH = lerp(sh, eh, p);
            it.mesh.scale.x = curW * (movesMoreX ? squash : stretch);
            it.mesh.scale.y = curH * (movesMoreX ? stretch : squash);

            // Wind
            if (prog?.uniforms?.uWind) prog.uniforms.uWind.value = sinP;

            // Alpha dip
            if (prog?.uniforms?.uAlpha) prog.uniforms.uAlpha.value = 1 - sinP * 0.08;
          } else {
            // Unmatched: just fade out
            if (prog?.uniforms?.uAlpha) prog.uniforms.uAlpha.value = 1 - p;
          }
        },
      }, staggerDelay);
    }

    return () => {
      if (completed) return;
      tl.kill();
      gsap.ticker.remove(syncUniforms);
      if (delayedRemoval) delayedRemoval.kill();
      allMeshes.forEach((m) => {
        m.position.z = 0;
        m.rotation.z = 0;
        const prog = (m as any).program;
        if (prog?.uniforms?.uAlpha) prog.uniforms.uAlpha.value = 1.0;
        if (prog?.uniforms?.uWind) prog.uniforms.uWind.value = 0;
        if (prog?.uniforms?.uWindDir) prog.uniforms.uWindDir.value = [0, 0];
        m.setParent(null);
      });
      isAnimatingRef.current = false;
    };
  }, [viewMode]);

  return { getGridScrollAnchor: () => gridScrollAnchorRef.current };
};
