import { useEffect, useRef, useCallback } from 'react';
import { Mesh, Program, Plane } from 'ogl';
import { gsap } from 'gsap';
import type { OGLContext } from './useOGLRenderer';
import type { ProjectData } from '../types';
import type { SanityCategory } from '../services/projectService';
import type { SlideData, SliderModeHandle } from './useSliderMode';
import type { TextureEntry } from './useTextureManager';
import { getPlaceholderTexture } from './useTextureManager';
import vertexShader from '../shaders/slider/vertex.glsl';
import fragmentShader from '../shaders/slider/fragment.glsl';

// ── Constants ─────────────────────────────────────────────────────

const SLIDE_W_FRAC = 0.35;
const SLIDE_H_FRAC = 0.50;
const SLIDE_SPACING = 0.04;
const WINDOW_SIZE = 9;

const DEZOOM_DURATION = 1.2;
const GLIDE_DURATION = 1.0;
const GLIDE_STAGGER = 0.03;
const SLIDE_OUT_DURATION = 0.8;
const SLIDE_OUT_COL_STAGGER = 0.08;
const REZOOM_DURATION = 1.2;
const MOSAIC_PADDING = 1.15;

// ── Interfaces ────────────────────────────────────────────────────

interface ColumnMesh {
  mesh: Mesh;
  program: Program;
  slug: string;
  projectIndex: number;
  width: number;
  height: number;
}

export interface FilterDezoomHandle {
  getMeshes: () => ColumnMesh[];
  getHandoffSlides: () => SlideData[] | null;
  isActive: () => boolean;
}

interface FilterDezoomProps {
  getContext: () => OGLContext | null;
  active: boolean;
  allProjects: ProjectData[];
  categories: SanityCategory[];
  pendingCategory: string | null;
  textures: Map<string, TextureEntry>;
  texturesLoaded: boolean;
  currentIndex: number;
  sliderHandleRef: React.RefObject<SliderModeHandle | null>;
  onComplete: () => void;
  markVisible?: (slugs: Set<string>) => void;
}

// ── Hook ──────────────────────────────────────────────────────────

export const useFilterDezoom = ({
  getContext,
  active,
  allProjects,
  categories,
  pendingCategory,
  textures,
  texturesLoaded,
  currentIndex,
  sliderHandleRef,
  onComplete,
  markVisible,
}: FilterDezoomProps): FilterDezoomHandle => {
  const meshesRef = useRef<ColumnMesh[]>([]);
  const handoffRef = useRef<SlideData[] | null>(null);
  const activeRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const getContextRef = useRef(getContext);
  getContextRef.current = getContext;
  const markVisibleRef = useRef(markVisible);
  markVisibleRef.current = markVisible;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const pendingCategoryRef = useRef(pendingCategory);
  pendingCategoryRef.current = pendingCategory;
  const texturesRef = useRef(textures);
  texturesRef.current = textures;

  useEffect(() => {
    if (!active || !texturesLoaded || categories.length === 0) return;
    const ctx = getContextRef.current();
    if (!ctx || allProjects.length === 0) return;

    const { gl, scene, camera } = ctx;
    const N = allProjects.length;
    const numCats = categories.length;
    const selectedCatSlug = pendingCategoryRef.current;

    handoffRef.current = null;

    const slider = sliderHandleRef.current;
    if (!slider) return;

    const sliderScroll = slider.getScroll();
    const sliderSlides = slider.takeOwnership();

    const postfxMesh = slider.getPostfxMesh();
    if (postfxMesh) postfxMesh.setParent(null);

    // ── Dimensions at Z=5 ──
    const fovRad = (45 * Math.PI) / 180;
    const halfTan = Math.tan(fovRad / 2);
    const vp5H = 2 * halfTan * 5;
    const vp5W = vp5H * (window.innerWidth / window.innerHeight);
    const meshW = SLIDE_W_FRAC * vp5W;
    const meshH = SLIDE_H_FRAC * vp5H;
    const slideH = meshH + SLIDE_SPACING * vp5H;

    const minimapW = (80 / window.innerWidth) * vp5W;
    const panelW = vp5W * 0.25;
    const centerX = (-vp5W / 2 + minimapW + vp5W / 2 - panelW) / 2;

    const virtualCenter = sliderScroll / slideH;
    const centerIdx = Math.round(virtualCenter);
    const fractional = virtualCenter - centerIdx;

    // ── Slider meshes by projectIndex ──
    const sliderByProjectIdx = new Map<number, typeof sliderSlides[0]>();
    sliderSlides.forEach((s) => sliderByProjectIdx.set(s.projectIndex, s));

    // ── Group projects by category ──
    const catSlugs = categories.map((c) => c.slug);
    const catIndexMap = new Map<string, number>();
    catSlugs.forEach((slug, i) => catIndexMap.set(slug, i));

    const selectedColIdx = selectedCatSlug ? catIndexMap.get(selectedCatSlug) ?? 0 : 0;

    const projectsByCol: number[][] = Array.from({ length: numCats }, () => []);
    const categorizedIndices = new Set<number>();
    for (let i = 0; i < N; i++) {
      const catSlug = allProjects[i].categorySlug;
      const colIdx = catSlug ? catIndexMap.get(catSlug) : undefined;
      if (colIdx !== undefined) {
        projectsByCol[colIdx].push(i);
        categorizedIndices.add(i);
      }
    }

    // ── Phase 2 target positions (mosaic) ──
    const colGap = meshW * 0.3;
    const totalColsWidth = numCats * meshW + (numCats - 1) * colGap;
    const colStartX = -totalColsWidth / 2 + meshW / 2;
    const colXs: number[] = [];
    for (let c = 0; c < numCats; c++) {
      colXs.push(colStartX + c * (meshW + colGap));
    }

    const targetPositions = new Map<number, { x: number; y: number; col: number }>();
    let maxColHeight = 0;
    for (let c = 0; c < numCats; c++) {
      const colProjects = projectsByCol[c];
      const colCount = colProjects.length;
      const colHeight = colCount * slideH;
      if (colHeight > maxColHeight) maxColHeight = colHeight;
      for (let r = 0; r < colCount; r++) {
        let d = r;
        if (d > colCount / 2) d -= colCount;
        targetPositions.set(colProjects[r], {
          x: colXs[c],
          y: -d * slideH,
          col: c,
        });
      }
    }

    // ── Camera Z to fit mosaic ──
    const aspect = window.innerWidth / window.innerHeight;
    const neededZForWidth = (totalColsWidth * MOSAIC_PADDING) / (2 * halfTan * aspect);
    const neededZForHeight = (maxColHeight * MOSAIC_PADDING) / (2 * halfTan);
    const dezoomCameraZ = Math.max(neededZForWidth, neededZForHeight, 15);

    // ── Create meshes ──
    const sharedGeometry = new Plane(gl, { widthSegments: 16, heightSegments: 16 });
    const fallbackTex = getPlaceholderTexture(gl);
    const allMeshes: ColumnMesh[] = [];

    for (let i = 0; i < N; i++) {
      if (!categorizedIndices.has(i)) continue;
      const slug = allProjects[i].slug;

      let d = i - centerIdx;
      if (d > N / 2) d -= N;
      if (d < -N / 2) d += N;
      const phase1Y = -(d - fractional) * slideH;

      const existing = sliderByProjectIdx.get(i);
      if (existing) {
        sliderByProjectIdx.delete(i);
        const currentY = existing.mesh.position.y as number;
        existing.mesh.setParent(scene);
        existing.mesh.position.x = centerX;
        existing.mesh.position.y = currentY;
        existing.mesh.position.z = 0;
        existing.mesh.scale.set(meshW, meshH, 1);
        existing.program.uniforms.u_distortionAmount.value = 0;
        existing.program.uniforms.uAlpha.value = 1;
        existing.program.uniforms.uTextureReady.value = 1.0;
        // Force GPU upload — slider may have had stale needsUpdate
        const entry = textures.get(slug);
        if (entry) entry.texture.needsUpdate = true;
        allMeshes.push({ mesh: existing.mesh, program: existing.program, slug, projectIndex: i, width: meshW, height: meshH });
      } else {
        const entry = textures.get(slug);
        // Force GPU upload — the LQIP may have been decoded but never rendered
        if (entry) entry.texture.needsUpdate = true;
        const program = new Program(gl, {
          vertex: vertexShader,
          fragment: fragmentShader,
          uniforms: {
            uTexture: { value: entry?.texture ?? fallbackTex },
            u_distortionAmount: { value: 0 },
            u_parallax: { value: 0 },
            uHover: { value: 0 },
            uMouse: { value: [0.5, 0.5] },
            uResolution: { value: entry ? [entry.width, entry.height] : [1, 1] },
            uMeshSize: { value: [meshW, meshH] },
            uAlpha: { value: 1 },
            uTextureReady: { value: entry && entry.width > 4 ? 1.0 : 0.3 },
            uWind: { value: 0 },
            uWindDir: { value: [0, 0] },
          },
          transparent: true,
        });
        const mesh = new Mesh(gl, { geometry: sharedGeometry, program });
        mesh.scale.set(meshW, meshH, 1);
        mesh.position.set(centerX, phase1Y, 0);
        mesh.setParent(scene);
        allMeshes.push({ mesh, program, slug, projectIndex: i, width: meshW, height: meshH });
      }
      // Don't call requestFull here — full-res 1200px is overkill for tiny mosaic tiles.
      // markVisible (below) triggers thumbnail loading which is sufficient.
    }

    sliderByProjectIdx.forEach((s) => s.mesh.setParent(null));
    meshesRef.current = allMeshes;
    activeRef.current = true;
    let isComplete = false;

    markVisibleRef.current?.(new Set(allMeshes.map((m) => m.slug)));

    // Partition: selected column vs others
    const selectedMeshes = allMeshes.filter(
      (cm) => targetPositions.get(cm.projectIndex)?.col === selectedColIdx
    );
    const otherMeshes = allMeshes.filter(
      (cm) => targetPositions.get(cm.projectIndex)?.col !== selectedColIdx
    );

    // ── Texture sync tick ──
    // Detects when the texture manager upgrades a texture (resolution change)
    // and forces a GPU re-upload. Self-removes when all textures are synced.
    const syncedWidths = new Map<string, number>();
    let pendingSyncs = allMeshes.length;
    allMeshes.forEach((cm) => {
      const entry = textures.get(cm.slug);
      if (entry && entry.width > 4) {
        syncedWidths.set(cm.slug, entry.width);
        pendingSyncs--;
      }
    });

    const textureTick = () => {
      if (isComplete || pendingSyncs <= 0) {
        gsap.ticker.remove(textureTick);
        return;
      }
      const curTextures = texturesRef.current;
      allMeshes.forEach((cm) => {
        const prev = syncedWidths.get(cm.slug) ?? 0;
        const entry = curTextures.get(cm.slug);
        if (!entry || entry.width === prev) return;

        syncedWidths.set(cm.slug, entry.width);
        entry.texture.needsUpdate = true;
        cm.program.uniforms.uResolution.value = [entry.width, entry.height];

        if (prev === 0) pendingSyncs--; // first real texture for this slug

        // Snap uTextureReady to 1 — texture is real now
        cm.program.uniforms.uTextureReady.value = 1.0;
      });
    };
    // Only add the tick if there are textures to sync
    if (pendingSyncs > 0) gsap.ticker.add(textureTick);

    // ── Timeline ──
    const tl = gsap.timeline();

    // ═══════════════════════════════════════════════════════════════
    // PHASE 1 — Dezoom Z=5 → Z=dezoomCameraZ
    // ═══════════════════════════════════════════════════════════════
    tl.addLabel('dezoom', 0);
    tl.to(camera.position, {
      z: dezoomCameraZ,
      duration: DEZOOM_DURATION,
      ease: 'power3.inOut',
    }, 'dezoom');

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2 — Glide to category columns
    // ═══════════════════════════════════════════════════════════════
    const glideStart = DEZOOM_DURATION + 0.1;
    tl.addLabel('glide', glideStart);

    const meshesWithTarget = allMeshes.map((cm) => ({
      cm,
      target: targetPositions.get(cm.projectIndex)!,
    }));
    meshesWithTarget.sort((a, b) => Math.abs(a.target.x) - Math.abs(b.target.x));
    const glideStaggerTotal = (meshesWithTarget.length - 1) * GLIDE_STAGGER;

    // Single distortion proxy for all meshes (one onUpdate instead of N)
    const glideProxy = { t: 0 };
    const glideDistortionMeshes = meshesWithTarget.map(({ cm }) => cm);

    meshesWithTarget.forEach(({ cm, target }, idx) => {
      tl.to(cm.mesh.position, {
        x: target.x,
        y: target.y,
        duration: GLIDE_DURATION,
        ease: 'power3.inOut',
      }, `glide+=${idx * GLIDE_STAGGER}`);
    });

    tl.fromTo(glideProxy, { t: 0 }, {
      t: 1,
      duration: GLIDE_DURATION,
      ease: 'none',
      onUpdate: () => {
        const arc = Math.sin(glideProxy.t * Math.PI) * 0.8;
        for (let i = 0; i < glideDistortionMeshes.length; i++) {
          glideDistortionMeshes[i].program.uniforms.u_distortionAmount.value = arc;
        }
      },
    }, 'glide');

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3 — Rezoom into selected column
    // ═══════════════════════════════════════════════════════════════
    const phase3Start = glideStart + GLIDE_DURATION + glideStaggerTotal + 0.2;
    tl.addLabel('phase3', phase3Start);

    const vpDezoomH = 2 * halfTan * dezoomCameraZ;

    // 3A — Slide non-selected columns off-screen
    const otherColIndices = Array.from({ length: numCats }, (_, i) => i)
      .filter((c) => c !== selectedColIdx)
      .sort((a, b) => Math.abs(a - selectedColIdx) - Math.abs(b - selectedColIdx));

    otherColIndices.forEach((colIdx, orderIdx) => {
      const colMeshes = otherMeshes.filter(
        (cm) => targetPositions.get(cm.projectIndex)?.col === colIdx
      );
      if (colMeshes.length === 0) return;

      const dir = colIdx < selectedColIdx ? -1 : 1;
      const slideOutY = dir * (vpDezoomH + maxColHeight);
      const colDelay = orderIdx * SLIDE_OUT_COL_STAGGER;

      colMeshes.forEach((cm) => {
        tl.to(cm.mesh.position, {
          y: `+=${slideOutY}`,
          duration: SLIDE_OUT_DURATION,
          ease: 'power3.in',
        }, `phase3+=${colDelay}`);
      });
    });

    const slideOutTotal = SLIDE_OUT_DURATION + (otherColIndices.length - 1) * SLIDE_OUT_COL_STAGGER;

    // 3B — Rezoom after slide-out
    const phase3bStart = phase3Start + slideOutTotal + 0.1;
    tl.addLabel('phase3b', phase3bStart);

    tl.to(camera.position, {
      z: 5,
      duration: REZOOM_DURATION,
      ease: 'power3.inOut',
    }, 'phase3b');

    const selectedColProjects = projectsByCol[selectedColIdx];
    const selectedCount = selectedColProjects.length;

    selectedMeshes.forEach((cm) => {
      tl.to(cm.mesh.position, {
        x: centerX,
        duration: REZOOM_DURATION,
        ease: 'power3.inOut',
      }, 'phase3b');
    });

    // ── On Complete ──
    tl.call(() => {
      isComplete = true;
      camera.position.z = 5;

      // Stop texture tick immediately (don't wait for React cleanup)
      gsap.ticker.remove(textureTick);

      // Remove off-screen meshes
      otherMeshes.forEach((cm) => cm.mesh.setParent(null));

      // Build handoff in slider slot order
      const handoffCount = Math.min(selectedCount, WINDOW_SIZE);
      const half = Math.floor(handoffCount / 2);
      const handoff: SlideData[] = [];

      const meshByFilteredIdx = new Map<number, ColumnMesh>();
      selectedMeshes.forEach((cm, idx) => meshByFilteredIdx.set(idx, cm));
      const usedMeshes = new Set<ColumnMesh>();

      for (let slot = 0; slot < handoffCount; slot++) {
        const offset = slot - half;
        const filteredIdx = ((offset % selectedCount) + selectedCount) % selectedCount;
        const cm = meshByFilteredIdx.get(filteredIdx);
        if (!cm) continue;

        usedMeshes.add(cm);
        const slotY = -offset * slideH;

        cm.mesh.position.x = centerX;
        cm.mesh.position.y = slotY;
        cm.mesh.position.z = 0;
        cm.mesh.rotation.z = 0;
        cm.mesh.scale.set(meshW, meshH, 1);
        cm.program.uniforms.uAlpha.value = 1;
        cm.program.uniforms.u_distortionAmount.value = 0;
        cm.program.uniforms.uWind.value = 0;
        cm.program.uniforms.uWindDir.value = [0, 0];
        cm.program.uniforms.uMeshSize.value = [meshW, meshH];

        handoff.push({
          mesh: cm.mesh,
          program: cm.program,
          slug: cm.slug,
          baseY: slotY,
          width: meshW,
          height: meshH,
          xOffset: 0,
          projectIndex: filteredIdx,
        });
      }

      selectedMeshes.forEach((cm) => {
        if (!usedMeshes.has(cm)) cm.mesh.setParent(null);
      });

      handoffRef.current = handoff;
      meshesRef.current = [];

      window.dispatchEvent(new Event('resize'));
      requestAnimationFrame(() => { onCompleteRef.current(); });
    }, [], `phase3b+=${REZOOM_DURATION + 0.05}`);

    // ── Cleanup ──
    cleanupRef.current = () => {
      tl.kill();
      gsap.ticker.remove(textureTick);
      if (!isComplete) {
        allMeshes.forEach((cm) => cm.mesh.setParent(null));
      }
      meshesRef.current = [];
      activeRef.current = false;
      handoffRef.current = null;
      camera.position.z = 5;
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, texturesLoaded]);

  return {
    getMeshes: useCallback(() => meshesRef.current, []),
    getHandoffSlides: useCallback(() => handoffRef.current, []),
    isActive: useCallback(() => activeRef.current, []),
  };
};
