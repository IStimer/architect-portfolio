import { useEffect, useRef } from 'react';
import { Mesh, Program, Plane, Texture, Raycast, Vec2 } from 'ogl';
import { gsap } from 'gsap';
import type { OGLContext } from './useOGLRenderer';
import type { ProjectData } from '../types';
import vertexShader from '../shaders/grid/vertex.glsl';
import fragmentShader from '../shaders/grid/fragment.glsl';

interface TextureEntry {
  texture: Texture;
  width: number;
  height: number;
}

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
}

export interface GridModeHandle {
  getMeshes: () => GridMesh[];
  getLayout: () => TileLayout | null;
  getScroll: () => { x: number; y: number };
}

// ---------- seeded PRNG (mulberry32) ----------
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- layout builder ----------
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

  // Cell = one complete tile block
  const cellW = vpW;
  const cellH = rows * rowH;

  const positions: TileLayout['positions'] = [];

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const sizeMultiplier = 0.7 + rng() * 0.5;
    const w = baseUnit * sizeMultiplier;
    const h = w * (0.65 + rng() * 0.35);

    // Position within cell, centered at origin
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

// ---------- hook ----------
export const useInfiniteGridMode = ({
  getContext,
  active,
  projects,
  textures,
  texturesLoaded,
  onHover,
  onNavigate,
  skipEnterAnimation = false,
}: InfiniteGridProps): GridModeHandle => {
  const meshesRef = useRef<GridMesh[]>([]);
  const duplicateMeshesRef = useRef<Mesh[]>([]);
  const allTilesRef = useRef<GridMesh[]>([]);
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
  const skipEnterAnimRef = useRef(skipEnterAnimation);
  skipEnterAnimRef.current = skipEnterAnimation;

  useEffect(() => {
    const ctx = getContext();
    if (!ctx || !active || !texturesLoaded) return;

    const { gl, scene, viewport } = ctx;

    const layout = buildLayout(projects, viewport.width, viewport.height);
    layoutRef.current = layout;

    const { repeatW, repeatH } = layout;

    const gridMeshes: GridMesh[] = [];
    const duplicates: Mesh[] = [];
    const allTiles: GridMesh[] = [];
    const raycast = new Raycast();

    // Shared geometry for all tiles
    const sharedGeometry = new Plane(gl, {
      widthSegments: 16,
      heightSegments: 16,
    });

    // 2×2 tiling offsets — wrapping at 2× cell keeps boundary far off-screen
    const tileOffsets: [number, number][] = [
      [0, 0],
      [repeatW, 0],
      [0, -repeatH],
      [repeatW, -repeatH],
    ];

    layout.positions.forEach(({ x, y, w, h, projectIndex }) => {
      const project = projects[projectIndex];
      const entry = textures.get(project.slug);
      if (!entry) return;

      // One Program shared across all copies of this tile —
      // hover uniforms update all copies at once
      const program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        uniforms: {
          uTexture: { value: entry.texture },
          uHover: { value: 0 },
          uMouse: { value: [0.5, 0.5] },
          uResolution: { value: [entry.width, entry.height] },
          uMeshSize: { value: [w, h] },
        },
        transparent: true,
      });

      tileOffsets.forEach(([dx, dy], copyIdx) => {
        const mesh = new Mesh(gl, { geometry: sharedGeometry, program });
        mesh.scale.set(w, h, 1);
        const tx = x + dx;
        const ty = y + dy;
        mesh.position.set(tx, ty, 0);
        mesh.setParent(scene);

        const tile: GridMesh = {
          mesh,
          program,
          slug: project.slug,
          tileX: tx,
          tileY: ty,
          cellW: w,
          cellH: h,
        };

        allTiles.push(tile);

        if (copyIdx === 0) {
          gridMeshes.push(tile);
        } else {
          duplicates.push(mesh);
        }
      });
    });

    meshesRef.current = gridMeshes;
    duplicateMeshesRef.current = duplicates;
    allTilesRef.current = allTiles;
    scrollRef.current = { x: 0, y: 0 };
    targetScrollRef.current = { x: 0, y: 0 };
    velocityRef.current = { x: 0, y: 0 };

    // ---- per-frame: scroll + modular wrapping ----
    const tickUpdate = () => {
      if (!getContext()) return;

      // Transition controller took ownership — stop ticking, remove duplicates
      if (meshesRef.current.length === 0) {
        duplicateMeshesRef.current.forEach((m) => m.setParent(null));
        duplicateMeshesRef.current = [];
        allTilesRef.current = [];
        return;
      }

      const currentLayout = layoutRef.current;
      if (!currentLayout) return;

      if (isDraggingRef.current) {
        // Direct follow during drag — zero latency
        scrollRef.current.x = targetScrollRef.current.x;
        scrollRef.current.y = targetScrollRef.current.y;
      } else {
        // Smooth lerp for inertia deceleration
        const lerpFactor = 0.12;
        scrollRef.current.x += (targetScrollRef.current.x - scrollRef.current.x) * lerpFactor;
        scrollRef.current.y += (targetScrollRef.current.y - scrollRef.current.y) * lerpFactor;

        targetScrollRef.current.x += velocityRef.current.x;
        targetScrollRef.current.y += velocityRef.current.y;
        velocityRef.current.x *= 0.95;
        velocityRef.current.y *= 0.95;
      }

      // Wrap at 2× cell dimensions — boundary stays well outside viewport
      const wrapW = currentLayout.repeatW * 2;
      const wrapH = currentLayout.repeatH * 2;
      const sx = scrollRef.current.x;
      const sy = scrollRef.current.y;

      allTilesRef.current.forEach((item) => {
        let px = item.tileX - sx;
        let py = item.tileY + sy;

        px = ((px + wrapW / 2) % wrapW + wrapW) % wrapW - wrapW / 2;
        py = ((py + wrapH / 2) % wrapH + wrapH) % wrapH - wrapH / 2;

        item.mesh.position.x = px;
        item.mesh.position.y = py;
      });
    };
    gsap.ticker.add(tickUpdate);

    // ---- wheel: omnidirectional ----
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetScrollRef.current.x += e.deltaX * 0.003;
      targetScrollRef.current.y += e.deltaY * 0.003;
    };
    ctx.canvas.addEventListener('wheel', handleWheel, { passive: false });

    // ---- drag: pointer events ----
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

      // ---- hover raycast (all tiles including duplicates) ----
      const currentCtx = getContext();
      if (!currentCtx) return;

      raycast.castMouse(currentCtx.camera, mouseRef.current);
      const meshList = allTilesRef.current.map((m) => m.mesh);
      const hits = raycast.intersectMeshes(meshList);

      let foundSlug: string | null = null;

      allTilesRef.current.forEach((item) => {
        const isHit = hits.some((h: any) => h === item.mesh);
        if (isHit) {
          foundSlug = item.slug;
          const localX = (e.clientX / window.innerWidth - 0.5) * currentCtx.viewport.width;
          const localY = (0.5 - e.clientY / window.innerHeight) * currentCtx.viewport.height;
          const uvX = (localX - item.mesh.position.x) / (item.mesh.scale.x as number) + 0.5;
          const uvY = (localY - item.mesh.position.y) / (item.mesh.scale.y as number) + 0.5;
          // Program is shared across copies — updates all at once
          item.program.uniforms.uMouse.value = [
            Math.max(0, Math.min(1, uvX)),
            Math.max(0, Math.min(1, uvY)),
          ];
          gsap.to(item.program.uniforms.uHover, {
            value: 1,
            duration: 0.4,
            ease: 'power2.out',
            overwrite: true,
          });
        } else {
          gsap.to(item.program.uniforms.uHover, {
            value: 0,
            duration: 0.4,
            ease: 'power2.out',
            overwrite: true,
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

      // Always remove duplicates
      duplicateMeshesRef.current.forEach((m) => m.setParent(null));
      duplicateMeshesRef.current = [];

      // Remove primaries (skipped if transition controller took ownership via src.length = 0)
      meshesRef.current.forEach((item) => {
        item.mesh.setParent(null);
      });
      meshesRef.current = [];
      allTilesRef.current = [];
      layoutRef.current = null;
    };
  }, [active, texturesLoaded, getContext, projects, textures, onHover, onNavigate]);

  // ---- resize ----
  useEffect(() => {
    if (!active) return;

    const handleResize = () => {
      const ctx = getContext();
      if (!ctx || !layoutRef.current) return;
      const { viewport } = ctx;

      const newLayout = buildLayout(projects, viewport.width, viewport.height);
      layoutRef.current = newLayout;

      const { repeatW, repeatH } = newLayout;
      const tileOffsets: [number, number][] = [
        [0, 0],
        [repeatW, 0],
        [0, -repeatH],
        [repeatW, -repeatH],
      ];

      // Update all tiles: for each base position, update its 4 copies
      newLayout.positions.forEach((pos, baseIdx) => {
        tileOffsets.forEach(([dx, dy], copyIdx) => {
          const tile = allTilesRef.current[baseIdx * 4 + copyIdx];
          if (!tile) return;
          tile.tileX = pos.x + dx;
          tile.tileY = pos.y + dy;
          tile.cellW = pos.w;
          tile.cellH = pos.h;
          tile.mesh.scale.set(pos.w, pos.h, 1);
          tile.program.uniforms.uMeshSize.value = [pos.w, pos.h];
        });
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [active, getContext, projects]);

  return {
    getMeshes: () => meshesRef.current,
    getLayout: () => layoutRef.current,
    getScroll: () => ({ ...scrollRef.current }),
  };
};
