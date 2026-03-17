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

function clusterPos(
  i: number, total: number,
  vpW: number, vpH: number,
  sx: number, sy: number,
) {
  const cols = 3;
  const col = i % cols;
  const row = Math.floor(i / cols);
  const rows = Math.ceil(total / cols);
  return {
    x: (col - (cols - 1) / 2) * vpW * sx,
    y: -(row - (rows - 1) / 2) * vpH * sy,
  };
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

function activeFirst(n: number, active: number) {
  const a = Math.max(0, Math.min(active, n - 1));
  const o = [a];
  let lo = a - 1, hi = a + 1;
  while (lo >= 0 || hi < n) {
    if (hi < n) o.push(hi++);
    if (lo >= 0) o.push(lo--);
  }
  return o;
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

    // ── Direction-specific config ──
    const gather = toGrid
      ? { sx: 0.08, sy: 0.06, scale: 0.6, ease: 'power2.in' as const }
      : { sx: 0.06, sy: 0.05, scale: 0.5, ease: 'power3.in' as const };

    const spread = toGrid
      ? { ease: 'expo.out', scaleEase: 'expo.out', dur: 0.7, stagger: 0.025 }
      : { ease: 'back.out(1.2)', scaleEase: 'power3.out', dur: 0.6, stagger: 0.03 };

    // ── Stagger orders ──
    const gatherRank = rankMap(
      toGrid ? byDist(pos0) : byDist(pos0, true),
      n,
    );
    const spreadRank = rankMap(
      toGrid ? byDist(targets.slice(0, n)) : activeFirst(n, idx),
      n,
    );

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

    // ── Timeline ──
    const tl = gsap.timeline({
      onComplete: () => {
        completed = true;
        gsap.ticker.remove(syncUniforms);

        // Signal destination mode — meshes stay visible at final positions
        onCompleteRef.current(dest);
        isAnimatingRef.current = false;

        // Defer mesh removal with gsap.delayedCall (runs inside GSAP tick,
        // guaranteed AFTER the destination mode's render tick has filled the
        // RT / created its meshes — avoids the rAF race that caused the flash)
        delayedRemoval = gsap.delayedCall(0.15, () => {
          meshes.forEach((m) => m.setParent(null));
          delayedRemoval = null;
        });
      },
    });

    // Phase 1 — Gather to center
    for (let i = 0; i < n; i++) {
      const cp = clusterPos(i, n, vpW, vpH, gather.sx, gather.sy);
      const delay = gatherRank[i] * 0.02;

      tl.to(meshes[i].position, {
        x: cp.x, y: cp.y,
        duration: 0.5, ease: gather.ease,
      }, delay);
      tl.to(meshes[i].scale, {
        x: scale0[i].w * gather.scale, y: scale0[i].h * gather.scale,
        duration: 0.5, ease: gather.ease,
      }, delay);
    }

    // Phase 2 — Spread to destination
    const p2 = 0.55;

    for (let i = 0; i < n; i++) {
      const t = targets[i];
      if (!t) continue;
      const delay = p2 + spreadRank[i] * spread.stagger;

      tl.to(meshes[i].position, {
        x: t.x, y: t.y,
        duration: spread.dur, ease: spread.ease,
      }, delay);
      tl.to(meshes[i].scale, {
        x: t.w, y: t.h,
        duration: spread.dur, ease: spread.scaleEase,
      }, delay);
    }

    return () => {
      if (completed) return;
      tl.kill();
      gsap.ticker.remove(syncUniforms);
      if (delayedRemoval) delayedRemoval.kill();
      meshes.forEach((m) => m.setParent(null));
      isAnimatingRef.current = false;
    };
  }, [viewMode]);
};
