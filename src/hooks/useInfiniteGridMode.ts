import { useEffect, useRef, useCallback } from 'react';
import { Mesh, Program, Raycast, Vec2 } from 'ogl';
import { gsap } from 'gsap';
import type { OGLContext } from './useOGLRenderer';
import type { ProjectData } from '../types';
import { TextureTier, getPlaceholderTexture } from './useTextureManager';
import { getSharedPlane } from '../services/sharedGeometry';
import type { TextureEntry } from './useTextureManager';
import { hasPendingTransition } from '../services/heroTransition';
import vertexShader from '../shaders/grid/vertex.glsl';
import fragmentShader from '../shaders/grid/fragment.glsl';

// ── Types ─────────────────────────────────────────────────────────

interface GridMesh {
  mesh: Mesh;
  program: Program;
  slug: string;
  tileX: number;
  tileY: number;
  cellW: number;
  cellH: number;
}

interface InfiniteGridProps {
  getContext: () => OGLContext | null;
  active: boolean;
  projects: ProjectData[];
  textures: Map<string, TextureEntry>;
  texturesLoaded: boolean;
  onHover: (slug: string | null) => void;
  onNavigate: (slug: string) => void;
  onRevealChange?: (revealed: boolean, complete: boolean, slug?: string | null) => void;
  revealBoundsRef?: React.MutableRefObject<DOMRect | null>;
  skipEnterAnimation?: boolean;
  initialScrollTo?: { x: number; y: number };
  markVisible?: (slugs: Set<string>) => void;
  requestFull?: (slug: string) => void;
  getTier?: (slug: string) => TextureTier;
}

export interface GridModeHandle {
  getMeshes: () => GridMesh[];
  getLayout: () => TileLayout | null;
  getScroll: () => { x: number; y: number };
  takeOwnership: () => GridMesh[];
  getRevealedScreenRect: () => DOMRect | null;
}

// ── Constants ─────────────────────────────────────────────────────

const POOL_SIZE = 50;
const VISIBILITY_MARGIN = 2.0; // how far beyond viewport to consider visible
const REVEAL_DURATION = 0.6;
const COLLAPSE_DURATION = 0.45;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Layout builder (unchanged — pure computation) ─────────────────

export interface TileLayout {
  positions: { x: number; y: number; w: number; h: number; projectIndex: number }[];
  repeatW: number;
  repeatH: number;
}

export function buildLayout(
  projects: ProjectData[],
  vpW: number,
  vpH: number,
): TileLayout {
  const rng = mulberry32(42);
  const count = projects.length;

  const baseUnit = Math.min(vpW, vpH) * 0.22;

  const cols = 3;
  const rows = Math.ceil(count / cols);
  const colW = vpW / cols;
  const rowH = baseUnit * 1.5;

  const cellW = vpW;
  const cellH = rows * rowH;

  const positions: TileLayout['positions'] = [];

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const sizeMultiplier = 0.7 + rng() * 0.5;
    const w = baseUnit * sizeMultiplier;
    const h = w * (0.65 + rng() * 0.35);

    const colCenter = -cellW / 2 + colW * (col + 0.5);
    const xJitter = (rng() - 0.5) * colW * 0.2;
    const x = colCenter + xJitter;

    const yCenter = cellH / 2 - rowH * (row + 0.5);
    const yJitter = (rng() - 0.5) * rowH * 0.2;
    const y = yCenter + yJitter;

    positions.push({ x, y, w, h, projectIndex: i });
  }

  return { positions, repeatW: cellW, repeatH: cellH };
}

// ── Pool slot ─────────────────────────────────────────────────────

interface PoolSlot {
  mesh: Mesh;
  program: Program;
  assignedProject: number; // -1 = free
  slug: string;
}

// ── Hook ──────────────────────────────────────────────────────────

export const useInfiniteGridMode = ({
  getContext,
  active,
  projects,
  textures,
  texturesLoaded,
  onHover,
  onNavigate,
  onRevealChange,
  revealBoundsRef,
  initialScrollTo,
  markVisible,
  requestFull,
  getTier,
}: InfiniteGridProps): GridModeHandle => {
  const meshesRef = useRef<GridMesh[]>([]);
  const takeOwnershipRef = useRef<(() => GridMesh[]) | null>(null);
  const scrollRef = useRef({ x: 0, y: 0 });
  const targetScrollRef = useRef({ x: 0, y: 0 });
  const hoveredRef = useRef<string | null>(null);
  const mouseRef = useRef(new Vec2());
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragScrollStartRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastPointerRef = useRef({ x: 0, y: 0, t: 0 });
  const layoutRef = useRef<TileLayout | null>(null);

  // ── Reveal / Collapse state ──
  const revealedRef = useRef(false);
  const revealedProjectIndexRef = useRef(-1);
  const revealingRef = useRef(false);
  const revealStartTimeRef = useRef(0);
  const revealDurationRef = useRef(REVEAL_DURATION);
  const revealTargetScaleRef = useRef({ w: 0, h: 0 });
  const nominalSizeRef = useRef({ w: 0, h: 0 });

  const collapsingRef = useRef(false);
  const collapseProjectIndexRef = useRef(-1);
  const collapseStartTimeRef = useRef(0);
  const collapseStartScaleRef = useRef({ w: 0, h: 0 });
  const collapseResolveRef = useRef<(() => void) | null>(null);
  const collapsePromiseRef = useRef<Promise<void> | null>(null);
  const centerTweenRef = useRef<gsap.core.Tween | null>(null);

  // Keep callbacks in refs so the effect closure always has the latest
  const onRevealChangeRef = useRef(onRevealChange);
  onRevealChangeRef.current = onRevealChange;
  const revealBoundsRefRef = useRef(revealBoundsRef);
  revealBoundsRefRef.current = revealBoundsRef;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;
  const requestFullRef = useRef(requestFull);
  requestFullRef.current = requestFull;

  useEffect(() => {
    const ctx = getContext();
    if (!ctx || !active || !texturesLoaded) return;

    const { gl, scene, viewport } = ctx;
    const N = projects.length;
    if (N === 0) return;

    const layout = buildLayout(projects, viewport.width, viewport.height);
    layoutRef.current = layout;

    // ── Create mesh pool ──
    const sharedGeometry = getSharedPlane(gl);
    const fallbackTex = getPlaceholderTexture(gl);
    const actualPoolSize = Math.min(POOL_SIZE, N);
    const pool: PoolSlot[] = [];

    for (let i = 0; i < actualPoolSize; i++) {
      const program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        uniforms: {
          uTexture: { value: fallbackTex },
          uHover: { value: 0 },
          uMouse: { value: [0.5, 0.5] },
          uResolution: { value: [4, 4] },
          uMeshSize: { value: [1, 1] },
          uAlpha: { value: 1.0 },
          uTextureReady: { value: 1.0 },
          uWind: { value: 0 },
          uWindDir: { value: [0, 0] },
        },
        transparent: true,
      });

      const mesh = new Mesh(gl, { geometry: sharedGeometry, program });
      pool.push({ mesh, program, assignedProject: -1, slug: '' });
    }

    // ── Assignment tracking ──
    const assignedMap = new Map<number, number>();
    const freeSlots: number[] = [];
    for (let i = actualPoolSize - 1; i >= 0; i--) freeSlots.push(i);

    function assignSlot(projectIdx: number, wx: number, wy: number): PoolSlot | null {
      if (assignedMap.has(projectIdx)) {
        const slot = pool[assignedMap.get(projectIdx)!];
        slot.mesh.position.x = wx;
        slot.mesh.position.y = wy;
        return slot;
      }

      if (freeSlots.length === 0) return null;

      const slotIdx = freeSlots.pop()!;
      const slot = pool[slotIdx];
      assignedMap.set(projectIdx, slotIdx);

      const currentLayout = layoutRef.current!;
      const pos = currentLayout.positions[projectIdx];
      const project = projects[projectIdx];
      const entry = textures.get(project.slug);

      slot.assignedProject = projectIdx;
      slot.slug = project.slug;
      slot.mesh.scale.set(pos.w, pos.h, 1);
      slot.mesh.position.set(wx, wy, 0);
      slot.mesh.setParent(scene);
      slot.program.uniforms.uMeshSize.value = [pos.w, pos.h];
      slot.program.uniforms.uHover.value = 0;
      slot.program.uniforms.uAlpha.value = 0;

      if (entry) {
        slot.program.uniforms.uTexture.value = entry.texture;
        slot.program.uniforms.uResolution.value = [entry.width, entry.height];
      }

      return slot;
    }

    function releaseSlot(projectIdx: number) {
      const slotIdx = assignedMap.get(projectIdx);
      if (slotIdx === undefined) return;

      const slot = pool[slotIdx];
      slot.mesh.setParent(null);
      slot.assignedProject = -1;
      slot.slug = '';
      assignedMap.delete(projectIdx);
      freeSlots.push(slotIdx);
    }

    // ── Build active GridMesh list for external consumers ──
    let takenOver = false;

    function syncMeshesRef() {
      if (takenOver) return;
      const active: GridMesh[] = [];
      for (const [projectIdx, slotIdx] of assignedMap) {
        const slot = pool[slotIdx];
        const currentLayout = layoutRef.current!;
        const pos = currentLayout.positions[projectIdx];
        active.push({
          mesh: slot.mesh,
          program: slot.program,
          slug: slot.slug,
          tileX: pos.x,
          tileY: pos.y,
          cellW: pos.w,
          cellH: pos.h,
        });
      }
      meshesRef.current = active;
    }

    takeOwnershipRef.current = () => {
      takenOver = true;
      const snapshot = [...meshesRef.current];
      meshesRef.current = [];
      assignedMap.clear();
      freeSlots.length = 0;
      return snapshot;
    };

    const raycast = new Raycast();
    const initScroll = initialScrollTo ?? { x: 0, y: 0 };
    scrollRef.current = { ...initScroll };
    targetScrollRef.current = { ...initScroll };
    velocityRef.current = { x: 0, y: 0 };

    // ── Reveal / Collapse functions ──

    function computeRevealTarget(projectIndex: number) {
      let imgW = 0, imgH = 0;
      const slotIdx = assignedMap.get(projectIndex);
      if (slotIdx !== undefined) {
        const res = pool[slotIdx].program.uniforms.uResolution.value;
        imgW = res[0]; imgH = res[1];
      }
      if (imgW === 0 || imgH === 0) {
        const slug = projects[projectIndex]?.slug;
        if (slug) {
          const entry = textures.get(slug);
          if (entry) { imgW = entry.width; imgH = entry.height; }
        }
      }
      if (imgW === 0 || imgH === 0) return null;
      const imgAspect = imgW / imgH;

      const maxW = viewport.width * 0.70;
      const maxH = viewport.height * 0.50;
      let targetW = maxW;
      let targetH = targetW / imgAspect;
      if (targetH > maxH) {
        targetH = maxH;
        targetW = targetH * imgAspect;
      }
      return { w: targetW, h: targetH };
    }

    function revealTile(projectIndex: number) {
      const target = computeRevealTarget(projectIndex);
      if (!target) return;

      const currentLayout = layoutRef.current;
      if (!currentLayout) return;
      const pos = currentLayout.positions[projectIndex];

      revealingRef.current = true;
      revealedRef.current = true;
      revealedProjectIndexRef.current = projectIndex;
      nominalSizeRef.current = { w: pos.w, h: pos.h };
      revealStartTimeRef.current = performance.now();
      revealDurationRef.current = REVEAL_DURATION;
      revealTargetScaleRef.current = target;

      const slug = projects[projectIndex]?.slug;
      if (slug) requestFullRef.current?.(slug);

      onRevealChangeRef.current?.(true, false, slug ?? null);
    }

    function centerAndReveal(projectIndex: number) {
      centerTweenRef.current?.kill();
      velocityRef.current = { x: 0, y: 0 };

      const currentLayout = layoutRef.current;
      if (!currentLayout) return;

      const pos = currentLayout.positions[projectIndex];

      // Compute target scroll that centers this tile
      const curSx = targetScrollRef.current.x;
      const curSy = targetScrollRef.current.y;
      let targetSx = pos.x;
      let targetSy = -pos.y;

      // Shortest wrap path for X
      const rW = currentLayout.repeatW;
      let dx = targetSx - curSx;
      dx = ((dx + rW / 2) % rW + rW) % rW - rW / 2;
      targetSx = curSx + dx;

      // Shortest wrap path for Y
      const rH = currentLayout.repeatH;
      let dy = targetSy - curSy;
      dy = ((dy + rH / 2) % rH + rH) % rH - rH / 2;
      targetSy = curSy + dy;

      const dist = Math.hypot(dx, dy);
      const duration = Math.min(0.8, Math.max(0.3, dist * 0.3));

      centerTweenRef.current = gsap.to(targetScrollRef.current, {
        x: targetSx,
        y: targetSy,
        duration,
        ease: 'power3.inOut',
        onComplete: () => {
          centerTweenRef.current = null;
          revealTile(projectIndex);
        },
      });
    }

    function collapseTile(instant = false): Promise<void> {
      centerTweenRef.current?.kill();
      centerTweenRef.current = null;
      if (!revealedRef.current) return Promise.resolve();
      if (!instant && collapsingRef.current && collapsePromiseRef.current)
        return collapsePromiseRef.current;

      revealingRef.current = false;
      const slug = projects[revealedProjectIndexRef.current]?.slug ?? null;
      onRevealChangeRef.current?.(false, false, slug);

      const slotIdx = assignedMap.get(revealedProjectIndexRef.current);
      if (slotIdx === undefined) {
        revealedRef.current = false;
        revealedProjectIndexRef.current = -1;
        return Promise.resolve();
      }

      const slot = pool[slotIdx];
      const curW = slot.mesh.scale.x as number;
      const curH = slot.mesh.scale.y as number;

      if (instant) {
        const nom = nominalSizeRef.current;
        slot.mesh.scale.set(nom.w, nom.h, 1);
        slot.program.uniforms.uMeshSize.value = [nom.w, nom.h];
        revealedRef.current = false;
        revealedProjectIndexRef.current = -1;
        return Promise.resolve();
      }

      collapsingRef.current = true;
      collapseProjectIndexRef.current = revealedProjectIndexRef.current;
      collapseStartTimeRef.current = performance.now();
      collapseStartScaleRef.current = { w: curW, h: curH };

      revealedRef.current = false;
      revealedProjectIndexRef.current = -1;

      const promise = new Promise<void>((resolve) => {
        collapseResolveRef.current = resolve;
      });
      collapsePromiseRef.current = promise;
      return promise;
    }

    // ── Per-frame tick ──
    const tickUpdate = () => {
      const curCtx = getContext();
      if (!curCtx) return;

      if (takenOver) return;

      const currentLayout = layoutRef.current;
      if (!currentLayout) return;

      // Scroll physics
      if (isDraggingRef.current) {
        scrollRef.current.x = targetScrollRef.current.x;
        scrollRef.current.y = targetScrollRef.current.y;
      } else {
        const lerpFactor = 0.12;
        scrollRef.current.x += (targetScrollRef.current.x - scrollRef.current.x) * lerpFactor;
        scrollRef.current.y += (targetScrollRef.current.y - scrollRef.current.y) * lerpFactor;
        targetScrollRef.current.x += velocityRef.current.x;
        targetScrollRef.current.y += velocityRef.current.y;
        velocityRef.current.x *= 0.95;
        velocityRef.current.y *= 0.95;
      }

      const sx = scrollRef.current.x;
      const sy = scrollRef.current.y;
      const vpW = curCtx.viewport.width;
      const vpH = curCtx.viewport.height;
      const marginW = vpW * VISIBILITY_MARGIN;
      const marginH = vpH * VISIBILITY_MARGIN;

      // ── Determine which projects are visible after wrapping ──
      const nowVisible = new Set<number>();
      const wrappedPositions = new Map<number, { wx: number; wy: number }>();

      for (let i = 0; i < currentLayout.positions.length; i++) {
        const pos = currentLayout.positions[i];
        let wx = pos.x - sx;
        let wy = pos.y + sy;

        // Modular wrapping
        wx = ((wx + currentLayout.repeatW / 2) % currentLayout.repeatW + currentLayout.repeatW) % currentLayout.repeatW - currentLayout.repeatW / 2;
        wy = ((wy + currentLayout.repeatH / 2) % currentLayout.repeatH + currentLayout.repeatH) % currentLayout.repeatH - currentLayout.repeatH / 2;

        if (Math.abs(wx) < marginW && Math.abs(wy) < marginH) {
          nowVisible.add(i);
          wrappedPositions.set(i, { wx, wy });
        }
      }

      // ── Release slots for projects no longer visible ──
      const toRelease: number[] = [];
      for (const projectIdx of assignedMap.keys()) {
        if (!nowVisible.has(projectIdx)) toRelease.push(projectIdx);
      }
      for (const idx of toRelease) {
        // Never release the expanded or collapsing tile
        if (idx === revealedProjectIndexRef.current) continue;
        if (idx === collapseProjectIndexRef.current) continue;
        releaseSlot(idx);
      }

      // ── Assign slots for newly visible projects ──
      const visibleSlugs = new Set<string>();

      for (const projectIdx of nowVisible) {
        const { wx, wy } = wrappedPositions.get(projectIdx)!;
        const slot = assignSlot(projectIdx, wx, wy);
        if (!slot) continue;

        visibleSlugs.add(slot.slug);

        // Update position for already-assigned slots
        // Skip position update for expanded/collapsing tile — it stays centered
        if (projectIdx !== revealedProjectIndexRef.current && projectIdx !== collapseProjectIndexRef.current) {
          slot.mesh.position.x = wx;
          slot.mesh.position.y = wy;
        }

        // Update texture resolution if tier upgraded
        const entry = textures.get(slot.slug);
        if (entry) {
          const res = slot.program.uniforms.uResolution.value;
          if (res[0] !== entry.width || res[1] !== entry.height) {
            res[0] = entry.width;
            res[1] = entry.height;
          }
        }

        // Animate uTextureReady
        const tier = getTier?.(slot.slug) ?? TextureTier.FULL;
        const targetReady = tier >= TextureTier.THUMBNAIL ? 1.0 : 0.3;
        const cur = slot.program.uniforms.uTextureReady.value;
        slot.program.uniforms.uTextureReady.value += (targetReady - cur) * 0.08;

        // Fade in newly assigned tiles
        const alpha = slot.program.uniforms.uAlpha.value;
        if (alpha < 1) {
          slot.program.uniforms.uAlpha.value = Math.min(1, alpha + 0.15);
        }
      }

      // ── Tick-based reveal animation ──
      const now = performance.now();

      if (revealingRef.current) {
        const slotIdx = assignedMap.get(revealedProjectIndexRef.current);
        if (slotIdx !== undefined) {
          const slot = pool[slotIdx];
          const raw = Math.min((now - revealStartTimeRef.current) / 1000 / revealDurationRef.current, 1);
          const t = easeOutCubic(raw);
          const tw = revealTargetScaleRef.current.w;
          const th = revealTargetScaleRef.current.h;
          const nom = nominalSizeRef.current;
          const curW = nom.w + (tw - nom.w) * t;
          const curH = nom.h + (th - nom.h) * t;
          slot.mesh.scale.set(curW, curH, 1);
          slot.program.uniforms.uMeshSize.value = [curW, curH];

          if (raw >= 1) {
            revealingRef.current = false;
            const slug = projects[revealedProjectIndexRef.current]?.slug ?? null;
            onRevealChangeRef.current?.(true, true, slug);
          }
        }
      }

      // ── Tick-based collapse animation ──
      if (collapsingRef.current) {
        const slotIdx = assignedMap.get(collapseProjectIndexRef.current);
        if (slotIdx !== undefined) {
          const slot = pool[slotIdx];
          const raw = Math.min((now - collapseStartTimeRef.current) / 1000 / COLLAPSE_DURATION, 1);
          const t = easeOutCubic(raw);
          const start = collapseStartScaleRef.current;
          const nom = nominalSizeRef.current;
          const curW = start.w + (nom.w - start.w) * t;
          const curH = start.h + (nom.h - start.h) * t;
          slot.mesh.scale.set(curW, curH, 1);
          slot.program.uniforms.uMeshSize.value = [curW, curH];

          if (raw >= 1) {
            slot.mesh.scale.set(nom.w, nom.h, 1);
            slot.program.uniforms.uMeshSize.value = [nom.w, nom.h];
            collapsingRef.current = false;
            collapseProjectIndexRef.current = -1;
            collapseResolveRef.current?.();
            collapseResolveRef.current = null;
            collapsePromiseRef.current = null;
          }
        } else {
          // Slot was released — finish collapse
          collapsingRef.current = false;
          collapseProjectIndexRef.current = -1;
          collapseResolveRef.current?.();
          collapseResolveRef.current = null;
          collapsePromiseRef.current = null;
        }
      }

      // ── Push neighbors proportionally to expanded tile's extra height ──
      const hasExpanded = revealedRef.current || revealingRef.current || collapsingRef.current;
      const expandedIdx = collapsingRef.current ? collapseProjectIndexRef.current : revealedProjectIndexRef.current;

      if (hasExpanded && expandedIdx >= 0) {
        const expandedSlotIdx = assignedMap.get(expandedIdx);
        if (expandedSlotIdx !== undefined) {
          const expandedSlot = pool[expandedSlotIdx];
          const expandH = expandedSlot.mesh.scale.y as number;
          const expandY = expandedSlot.mesh.position.y as number;
          const nom = nominalSizeRef.current;
          const expandRatio = Math.max(0, (expandH - nom.h) / (vpH * 0.8 - nom.h));
          const push = (expandH - nom.h) / 2 + expandRatio * vpH * 0.6;

          for (const [projIdx, sIdx] of assignedMap) {
            if (projIdx === expandedIdx) continue;
            const slot = pool[sIdx];
            const curY = slot.mesh.position.y as number;
            if (curY > expandY) {
              slot.mesh.position.y += push;
            } else {
              slot.mesh.position.y -= push;
            }
          }
        }
      }

      // ── Update reveal bounds ref for DOM positioning ──
      if (hasExpanded && revealBoundsRefRef.current) {
        const bIdx = collapsingRef.current ? collapseProjectIndexRef.current : revealedProjectIndexRef.current;
        const bSlotIdx = assignedMap.get(bIdx);
        if (bSlotIdx !== undefined) {
          const bSlot = pool[bSlotIdx];
          const cw = window.innerWidth;
          const ch = window.innerHeight;
          const mx = bSlot.mesh.position.x as number;
          const my = bSlot.mesh.position.y as number;
          const mw = bSlot.mesh.scale.x as number;
          const mh = bSlot.mesh.scale.y as number;
          const screenX = ((mx - mw / 2 + vpW / 2) / vpW) * cw;
          const screenY = ((vpH / 2 - my - mh / 2) / vpH) * ch;
          const sw = (mw / vpW) * cw;
          const sh = (mh / vpH) * ch;
          revealBoundsRefRef.current.current = new DOMRect(screenX, screenY, sw, sh);
        }
      }

      markVisible?.(visibleSlugs);
      syncMeshesRef();
    };
    gsap.ticker.add(tickUpdate);

    // ── Wheel ──
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (hasPendingTransition()) return;
      if (revealedRef.current || revealingRef.current) {
        collapseTile();
        return;
      }
      targetScrollRef.current.x += e.deltaX * 0.003;
      targetScrollRef.current.y += e.deltaY * 0.003;
    };
    ctx.canvas.addEventListener('wheel', handleWheel, { passive: false });

    // ── Drag ──
    const handlePointerDown = (e: PointerEvent) => {
      if (hasPendingTransition()) return;
      if (revealedRef.current || revealingRef.current) {
        collapseTile();
        return;
      }
      isDraggingRef.current = true;
      velocityRef.current = { x: 0, y: 0 };
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      dragScrollStartRef.current = { ...targetScrollRef.current };
      lastPointerRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      ctx.canvas.style.cursor = 'grabbing';
    };

    const handlePointerMove = (e: PointerEvent) => {
      mouseRef.current.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );

      if (isDraggingRef.current) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        const pxToWorld = viewport.width / window.innerWidth;
        targetScrollRef.current.x = dragScrollStartRef.current.x - dx * pxToWorld;
        targetScrollRef.current.y = dragScrollStartRef.current.y + dy * pxToWorld;

        const now = performance.now();
        const dt = Math.max(now - lastPointerRef.current.t, 1);
        velocityRef.current.x = -(e.clientX - lastPointerRef.current.x) * pxToWorld / dt * 16;
        velocityRef.current.y = (e.clientY - lastPointerRef.current.y) * pxToWorld / dt * 16;
        lastPointerRef.current = { x: e.clientX, y: e.clientY, t: now };
      }

      // ── Hover raycast (only active pool meshes) ──
      const currentCtx = getContext();
      if (!currentCtx) return;

      const activeMeshes = meshesRef.current;
      raycast.castMouse(currentCtx.camera, mouseRef.current);
      const hits = raycast.intersectMeshes(activeMeshes.map((m) => m.mesh));

      let foundSlug: string | null = null;

      activeMeshes.forEach((item) => {
        const isHit = hits.some((h: any) => h === item.mesh);
        if (isHit) {
          foundSlug = item.slug;
          requestFull?.(item.slug);
          const localX = (e.clientX / window.innerWidth - 0.5) * currentCtx.viewport.width;
          const localY = (0.5 - e.clientY / window.innerHeight) * currentCtx.viewport.height;
          const uvX = (localX - item.mesh.position.x) / (item.mesh.scale.x as number) + 0.5;
          const uvY = (localY - item.mesh.position.y) / (item.mesh.scale.y as number) + 0.5;
          item.program.uniforms.uMouse.value = [
            Math.max(0, Math.min(1, uvX)),
            Math.max(0, Math.min(1, uvY)),
          ];
          gsap.to(item.program.uniforms.uHover, {
            value: 1, duration: 0.4, ease: 'power2.out', overwrite: true,
          });
        } else {
          gsap.to(item.program.uniforms.uHover, {
            value: 0, duration: 0.4, ease: 'power2.out', overwrite: true,
          });
        }
      });

      if (foundSlug !== hoveredRef.current) {
        hoveredRef.current = foundSlug;
        onHover(foundSlug);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      ctx.canvas.style.cursor = '';

      const totalDrag = Math.hypot(
        e.clientX - dragStartRef.current.x,
        e.clientY - dragStartRef.current.y,
      );
      if (totalDrag < 5 && hoveredRef.current) {
        const clickedSlug = hoveredRef.current;
        const clickedProjectIndex = projects.findIndex(p => p.slug === clickedSlug);
        if (clickedProjectIndex < 0) return;

        if (revealedRef.current && clickedProjectIndex === revealedProjectIndexRef.current) {
          // Second click on expanded tile → navigate
          onNavigateRef.current(clickedSlug);
        } else if (revealedRef.current || revealingRef.current) {
          // Click on different tile → collapse then center + reveal
          collapseTile().then(() => centerAndReveal(clickedProjectIndex));
        } else {
          // First click → center then expand
          centerAndReveal(clickedProjectIndex);
        }
      }
    };

    // ── Keyboard ──
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (revealedRef.current || revealingRef.current)) {
        collapseTile();
      }
    };

    ctx.canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      gsap.ticker.remove(tickUpdate);
      ctx.canvas.removeEventListener('wheel', handleWheel);
      ctx.canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);

      // Only remove pool meshes if transition hasn't taken ownership
      if (!takenOver) {
        pool.forEach((slot) => slot.mesh.setParent(null));
      }
      meshesRef.current = [];
      layoutRef.current = null;

      // Reset reveal state
      centerTweenRef.current?.kill();
      centerTweenRef.current = null;
      revealingRef.current = false;
      revealedRef.current = false;
      revealedProjectIndexRef.current = -1;
      collapsingRef.current = false;
      collapseProjectIndexRef.current = -1;
    };
  }, [active, texturesLoaded, getContext, projects, textures, onHover, markVisible, requestFull, getTier]);

  // ── Resize ──
  useEffect(() => {
    if (!active) return;

    const handleResize = () => {
      const ctx = getContext();
      if (!ctx) return;
      const { viewport } = ctx;

      // Instant collapse on resize
      if (revealedRef.current || revealingRef.current || collapsingRef.current) {
        revealingRef.current = false;
        revealedRef.current = false;
        revealedProjectIndexRef.current = -1;
        collapsingRef.current = false;
        collapseProjectIndexRef.current = -1;
        collapseResolveRef.current?.();
        collapseResolveRef.current = null;
        collapsePromiseRef.current = null;
        onRevealChangeRef.current?.(false, false, null);
      }

      const newLayout = buildLayout(projects, viewport.width, viewport.height);
      layoutRef.current = newLayout;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [active, getContext, projects]);

  const getRevealedScreenRect = useCallback(() => {
    if (!revealedRef.current) return null;
    const ctx = getContext();
    if (!ctx) return null;

    return revealBoundsRefRef.current?.current ?? null;
  }, [getContext]);

  return {
    getMeshes: () => meshesRef.current,
    getLayout: () => layoutRef.current,
    getScroll: () => ({ ...scrollRef.current }),
    takeOwnership: () => takeOwnershipRef.current?.() ?? [],
    getRevealedScreenRect,
  };
};
