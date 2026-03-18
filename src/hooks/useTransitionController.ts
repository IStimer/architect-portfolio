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

// ---------- helpers ----------

const SLIDE_SPACING = 0.04;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

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

  const out: { x: number; y: number; w: number; h: number }[] = [];
  let cum = 0;
  for (let i = 0; i < projects.length; i++) {
    out.push({ x: cx, y: -cum, w, h });
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

function rankMap(sorted: number[], n: number) {
  const r = new Array<number>(n);
  sorted.forEach((orig, rank) => { r[orig] = rank; });
  return r;
}

function byDist(pts: { x: number; y: number }[], desc = false) {
  const m = pts.map((p, i) => ({ i, d: Math.hypot(p.x, p.y) }));
  m.sort((a, b) => desc ? b.d - a.d : a.d - b.d);
  return m.map((e) => e.i);
}

/** Find which project index is closest to viewport center */
function findCenterProject(positions: { x: number; y: number }[]) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const d = Math.hypot(positions[i].x, positions[i].y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ---------- hook ----------

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

  // Refs for stable access inside the effect (single dep: viewMode)
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

    const { scene, viewport } = ctx;
    const vpW = viewport.width;
    const vpH = viewport.height;
    const dest: 'grid' | 'slider' = toGrid ? 'grid' : 'slider';
    const prj = projectsRef.current;

    // ── Take ownership of source meshes ──
    const meshes: Mesh[] = [];
    let gridSlugs: string[] = [];

    if (toGrid) {
      const src = sliderRef.current.getSlides();
      const slides = [...src];
      src.length = 0;

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
        meshes.push(s.mesh);
      });
    } else {
      const src = gridRef.current.getMeshes();
      const items = [...src];
      src.length = 0;
      items.forEach((item) => meshes.push(item.mesh));

      // Build slug lookup so we can map mesh-array index → project index
      gridSlugs = items.map((item) => item.slug);

      // Re-wrap positions to nearest-to-center copy.
      // The grid uses a 2×cell wrap range, so primaries can be up to repeatW
      // away from center. Shrink to 1×cell range so they match what's visible.
      const layout = gridRef.current.getLayout();
      if (layout) {
        const { repeatW, repeatH } = layout;
        meshes.forEach((m) => {
          let px = m.position.x as number;
          let py = m.position.y as number;
          px = ((px + repeatW / 2) % repeatW + repeatW) % repeatW - repeatW / 2;
          py = ((py + repeatH / 2) % repeatH + repeatH) % repeatH - repeatH / 2;
          m.position.x = px;
          m.position.y = py;
        });
      }
    }

    const n = meshes.length;
    if (n === 0) { isAnimatingRef.current = false; return; }

    // ── Snapshot start state ──
    const pos0 = meshes.map((m) => ({ x: m.position.x as number, y: m.position.y as number }));
    const scale0 = meshes.map((m) => ({ w: m.scale.x as number, h: m.scale.y as number }));

    // ── For grid→slider: find the project closest to viewport center ──
    let idx: number;
    if (toSlider) {
      const centerMeshIdx = findCenterProject(pos0);
      // Map mesh-array index to actual project index via slug
      const slug = gridSlugs[centerMeshIdx];
      idx = prj.findIndex((p) => p.slug === slug);
      if (idx === -1) idx = 0;

      // Debug: log all mesh positions and detected center
      console.log('[transition] grid→slider detection:', {
        meshPositions: pos0.map((p, i) => ({ i, slug: gridSlugs[i], x: p.x.toFixed(3), y: p.y.toFixed(3), dist: Math.hypot(p.x, p.y).toFixed(3) })),
        centerMeshIdx,
        detectedSlug: slug,
        projectIndex: idx,
      });
    } else {
      idx = currentIndexRef.current;
    }

    // Update parent index immediately so React batches it with the viewMode change
    if (toSlider && onIndexChangeRef.current) {
      onIndexChangeRef.current(idx);
    }

    // ── Compute destination positions ──
    const targets = toGrid
      ? (gridRef.current.getLayout() ?? buildLayout(prj, vpW, vpH))
          .positions.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }))
      : sliderTargets(prj, viewport, idx);

    // ── Stagger order: center-first for both directions ──
    const staggerRank = rankMap(byDist(pos0), n);

    // ── Keep uMeshSize in sync with scale ──
    const syncUniforms = () => {
      for (let i = 0; i < n; i++) {
        const prog = (meshes[i] as any).program;
        if (prog?.uniforms?.uMeshSize) {
          prog.uniforms.uMeshSize.value = [meshes[i].scale.x, meshes[i].scale.y];
        }
      }
    };
    gsap.ticker.add(syncUniforms);

    // ── Timeline: Magnetic Morph ──
    const tl = gsap.timeline({
      onComplete: () => {
        completed = true;
        gsap.ticker.remove(syncUniforms);

        // Ensure transition uniforms are restored for all meshes
        for (let i = 0; i < n; i++) {
          const prog = (meshes[i] as any).program;
          if (prog?.uniforms?.uAlpha) prog.uniforms.uAlpha.value = 1.0;
          if (prog?.uniforms?.uWind) prog.uniforms.uWind.value = 0;
          if (prog?.uniforms?.uWindDir) prog.uniforms.uWindDir.value = [0, 0];
        }

        // Signal destination mode — meshes stay visible at final positions
        onCompleteRef.current(dest);
        isAnimatingRef.current = false;

        // Defer mesh removal with gsap.delayedCall (runs inside GSAP tick,
        // guaranteed AFTER the destination mode's render tick has filled the
        // RT / created its meshes — avoids the rAF race that caused the flash)
        delayedRemoval = gsap.delayedCall(0.15, () => {
          meshes.forEach((m) => {
            m.position.z = 0;
            m.rotation.z = 0;
            m.setParent(null);
          });
          delayedRemoval = null;
        });
      },
    });

    // Magnetic Morph — each mesh follows a quadratic bezier curve
    for (let i = 0; i < n; i++) {
      const t = targets[i];
      if (!t) continue;

      const staggerDelay = staggerRank[i] * 0.06;

      const sx = pos0[i].x, sy = pos0[i].y;
      const ex = t.x, ey = t.y;
      const dx = ex - sx, dy = ey - sy;
      const dist = Math.hypot(dx, dy);

      // Quadratic bezier control point — perpendicular offset
      let cpx = (sx + ex) / 2;
      let cpy = (sy + ey) / 2;
      if (dist > 0.001) {
        const perpX = -dy / dist;
        const perpY = dx / dist;
        const offset = dist * 0.2;
        cpx += perpX * offset;
        cpy += perpY * offset;
      }

      const sw0 = scale0[i].w, sh0 = scale0[i].h;
      const sw1 = t.w, sh1 = t.h;
      const movesMoreX = Math.abs(dx) > Math.abs(dy);

      // Wind direction in UV space — normalized movement vector
      const windDirX = dist > 0.001 ? dx / dist : 0;
      const windDirY = dist > 0.001 ? dy / dist : 0;

      // Set wind direction once (static per card)
      const prog = (meshes[i] as any).program;
      if (prog?.uniforms?.uWindDir) {
        prog.uniforms.uWindDir.value = [windDirX, -windDirY]; // flip Y for UV space
      }

      const proxy = { t: 0 };
      tl.to(proxy, {
        t: 1,
        duration: 1.0,
        ease: 'power3.inOut',
        onUpdate: () => {
          const p = proxy.t;
          const inv = 1 - p;
          const sinP = Math.sin(p * Math.PI);

          // Quadratic bezier position
          meshes[i].position.x = inv * inv * sx + 2 * inv * p * cpx + p * p * ex;
          meshes[i].position.y = inv * inv * sy + 2 * inv * p * cpy + p * p * ey;

          // Subtle Z arc
          meshes[i].position.z = sinP * 0.1;

          // Rotation Z aligned to trajectory (max ~3 degrees)
          const angle = Math.atan2(dy, dx);
          meshes[i].rotation.z = sinP * angle * 0.05;

          // Scale with squash & stretch at midpoint
          const squash = 1 - sinP * 0.08;
          const stretch = 1 + sinP * 0.04;
          const sw = lerp(sw0, sw1, p);
          const sh = lerp(sh0, sh1, p);
          meshes[i].scale.x = sw * (movesMoreX ? squash : stretch);
          meshes[i].scale.y = sh * (movesMoreX ? stretch : squash);

          // Wind intensity — peaks at midpoint, eases in/out
          const prog = (meshes[i] as any).program;
          if (prog?.uniforms?.uWind) {
            prog.uniforms.uWind.value = sinP;
          }

          // Alpha dip
          if (prog?.uniforms?.uAlpha) {
            prog.uniforms.uAlpha.value = 1 - sinP * 0.08;
          }
        },
      }, staggerDelay);
    }

    return () => {
      if (completed) return;
      tl.kill();
      gsap.ticker.remove(syncUniforms);
      if (delayedRemoval) delayedRemoval.kill();
      meshes.forEach((m) => {
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
};
