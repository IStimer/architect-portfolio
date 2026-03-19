import { useEffect, useRef } from 'react';
import { Mesh, Program, Plane, Raycast, Vec2 } from 'ogl';
import { gsap } from 'gsap';
import type { OGLContext } from './useOGLRenderer';
import type { ProjectData } from '../types';
import { TextureTier, getPlaceholderTexture } from './useTextureManager';
import type { TextureEntry } from './useTextureManager';
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
  skipEnterAnimation?: boolean;
  markVisible?: (slugs: Set<string>) => void;
  requestFull?: (slug: string) => void;
  getTier?: (slug: string) => TextureTier;
}

export interface GridModeHandle {
  getMeshes: () => GridMesh[];
  getLayout: () => TileLayout | null;
  getScroll: () => { x: number; y: number };
  takeOwnership: () => GridMesh[];
}

// ── Constants ─────────────────────────────────────────────────────

const POOL_SIZE = 30;
const VISIBILITY_MARGIN = 1.2; // how far beyond viewport to consider visible

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
  // skipEnterAnimation not needed with pool approach
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

  useEffect(() => {
    const ctx = getContext();
    if (!ctx || !active || !texturesLoaded) return;

    const { gl, scene, viewport } = ctx;
    const N = projects.length;
    if (N === 0) return;

    const layout = buildLayout(projects, viewport.width, viewport.height);
    layoutRef.current = layout;

    // ── Create mesh pool ──
    const sharedGeometry = new Plane(gl, { widthSegments: 16, heightSegments: 16 });
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
      // Don't add to scene yet — only when assigned to a project
      pool.push({ mesh, program, assignedProject: -1, slug: '' });
    }

    // ── Assignment tracking ──
    // projectIndex → poolSlotIndex
    const assignedMap = new Map<number, number>();
    const freeSlots: number[] = [];
    for (let i = actualPoolSize - 1; i >= 0; i--) freeSlots.push(i);

    function assignSlot(projectIdx: number, wx: number, wy: number): PoolSlot | null {
      if (assignedMap.has(projectIdx)) {
        // Already assigned — just update position
        const slot = pool[assignedMap.get(projectIdx)!];
        slot.mesh.position.x = wx;
        slot.mesh.position.y = wy;
        return slot;
      }

      if (freeSlots.length === 0) return null; // pool exhausted

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
      slot.mesh.setParent(scene); // Add to scene when assigned
      slot.program.uniforms.uMeshSize.value = [pos.w, pos.h];
      slot.program.uniforms.uHover.value = 0;

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
      slot.mesh.setParent(null); // Remove from scene when released
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

    // Transition controller calls takeOwnership() to grab active meshes
    // and stop the grid tick from repositioning them
    takeOwnershipRef.current = () => {
      takenOver = true;
      const snapshot = [...meshesRef.current];
      meshesRef.current = [];
      // Clear pool tracking — transition owns the meshes now
      assignedMap.clear();
      freeSlots.length = 0;
      return snapshot;
    };

    const raycast = new Raycast();
    scrollRef.current = { x: 0, y: 0 };
    targetScrollRef.current = { x: 0, y: 0 };
    velocityRef.current = { x: 0, y: 0 };

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
      for (const idx of toRelease) releaseSlot(idx);

      // ── Assign slots for newly visible projects ──
      const visibleSlugs = new Set<string>();

      for (const projectIdx of nowVisible) {
        const { wx, wy } = wrappedPositions.get(projectIdx)!;
        const slot = assignSlot(projectIdx, wx, wy);
        if (!slot) continue; // pool exhausted

        visibleSlugs.add(slot.slug);

        // Update position for already-assigned slots
        slot.mesh.position.x = wx;
        slot.mesh.position.y = wy;

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
      }

      markVisible?.(visibleSlugs);
      syncMeshesRef();
    };
    gsap.ticker.add(tickUpdate);

    // ── Wheel ──
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetScrollRef.current.x += e.deltaX * 0.003;
      targetScrollRef.current.y += e.deltaY * 0.003;
    };
    ctx.canvas.addEventListener('wheel', handleWheel, { passive: false });

    // ── Drag ──
    const handlePointerDown = (e: PointerEvent) => {
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
        onNavigate(hoveredRef.current);
      }
    };

    ctx.canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      gsap.ticker.remove(tickUpdate);
      ctx.canvas.removeEventListener('wheel', handleWheel);
      ctx.canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      // Only remove pool meshes if transition hasn't taken ownership
      if (!takenOver) {
        pool.forEach((slot) => slot.mesh.setParent(null));
      }
      meshesRef.current = [];
      layoutRef.current = null;
    };
  }, [active, texturesLoaded, getContext, projects, textures, onHover, onNavigate, markVisible, requestFull, getTier]);

  // ── Resize ──
  useEffect(() => {
    if (!active) return;

    const handleResize = () => {
      const ctx = getContext();
      if (!ctx) return;
      const { viewport } = ctx;

      const newLayout = buildLayout(projects, viewport.width, viewport.height);
      layoutRef.current = newLayout;
      // Pool meshes will be repositioned/resized on next tick via assignSlot
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [active, getContext, projects]);

  return {
    getMeshes: () => meshesRef.current,
    getLayout: () => layoutRef.current,
    getScroll: () => ({ ...scrollRef.current }),
    takeOwnership: () => takeOwnershipRef.current?.() ?? [],
  };
};
