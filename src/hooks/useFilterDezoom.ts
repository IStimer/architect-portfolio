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
const SLIDE_OUT_COL_STAGGER = 0.08;
const SLIDE_IN_COL_STAGGER = 0.08;
const REZOOM_DURATION = 1.2;
const MOSAIC_PADDING = 1.15;

// ── Helpers ───────────────────────────────────────────────────────

/** GSAP ease functions for manual lerp in batch updates */
function power3InOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface BatchTarget {
  mesh: Mesh;
  program: Program;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  delay: number; // normalized 0..1 within the phase
}

/**
 * Add a single proxy tween that drives N mesh positions via batch lerp.
 * Replaces N individual `tl.to()` calls with 1 tween + 1 onUpdate loop.
 * Supports per-mesh stagger via the delay field.
 */
function addBatchTween(
  tl: gsap.core.Timeline,
  label: string,
  duration: number,
  targets: BatchTarget[],
  easeFn: (t: number) => number,
  distortion = 0,
) {
  if (targets.length === 0) return;
  const proxy = { t: 0 };
  // Snapshot start positions
  for (let i = 0; i < targets.length; i++) {
    targets[i].startX = targets[i].mesh.position.x as number;
    targets[i].startY = targets[i].mesh.position.y as number;
  }
  tl.fromTo(proxy, { t: 0 }, {
    t: 1,
    duration,
    ease: 'none', // we apply easing manually to support per-item stagger
    onUpdate: () => {
      const raw = proxy.t;
      for (let i = 0; i < targets.length; i++) {
        const b = targets[i];
        // Per-mesh staggered progress: clamp [0,1] after subtracting delay
        const localT = Math.max(0, Math.min(1, (raw - b.delay) / (1 - b.delay)));
        const eased = easeFn(localT);
        b.mesh.position.x = lerp(b.startX, b.endX, eased);
        b.mesh.position.y = lerp(b.startY, b.endY, eased);
        if (distortion > 0) {
          b.program.uniforms.u_distortionAmount.value = Math.sin(localT * Math.PI) * distortion;
        }
      }
    },
  }, label);
}

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
  activeCategory: string | null;
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
  activeCategory,
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
  const activeCategoryRef = useRef(activeCategory);
  activeCategoryRef.current = activeCategory;
  const texturesRef = useRef(textures);
  texturesRef.current = textures;

  useEffect(() => {
    if (!active || !texturesLoaded || categories.length === 0) return;
    const ctx = getContextRef.current();
    if (!ctx || allProjects.length === 0) return;

    const { gl, scene, camera } = ctx;
    const N = allProjects.length;
    const numCats = categories.length;
    const selectedCatSlug = pendingCategoryRef.current;   // target
    const currentCatSlug = activeCategoryRef.current;     // source
    const comingFromFiltered = currentCatSlug !== null;
    const goingToAll = selectedCatSlug === null;

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

    // ── Slider meshes by SLUG (works for both filtered and unfiltered) ──
    const sliderBySlug = new Map<string, typeof sliderSlides[0]>();
    sliderSlides.forEach((s) => sliderBySlug.set(s.slug, s));

    // ── Group projects by category ──
    const catSlugs = categories.map((c) => c.slug);
    const catIndexMap = new Map<string, number>();
    catSlugs.forEach((slug, i) => catIndexMap.set(slug, i));

    const selectedColIdx = selectedCatSlug ? catIndexMap.get(selectedCatSlug) ?? 0 : -1;
    const currentColIdx = currentCatSlug ? catIndexMap.get(currentCatSlug) ?? -1 : -1;

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

    // ── Mosaic layout ──
    const colGap = meshW * 0.3;
    const totalColsWidth = numCats * meshW + (numCats - 1) * colGap;
    const colStartX = -totalColsWidth / 2 + meshW / 2;
    const colXs: number[] = [];
    for (let c = 0; c < numCats; c++) {
      colXs.push(colStartX + c * (meshW + colGap));
    }

    const mosaicPositions = new Map<number, { x: number; y: number; col: number }>();
    let maxColHeight = 0;
    for (let c = 0; c < numCats; c++) {
      const colProjects = projectsByCol[c];
      const colCount = colProjects.length;
      const colHeight = colCount * slideH;
      if (colHeight > maxColHeight) maxColHeight = colHeight;
      for (let r = 0; r < colCount; r++) {
        let d = r;
        if (d > colCount / 2) d -= colCount;
        mosaicPositions.set(colProjects[r], {
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
    const vpDezoomH = 2 * halfTan * dezoomCameraZ;

    // ── Create meshes ──
    // When coming from filtered: slider meshes matched by slug start at centerX.
    // When coming from unfiltered: slider meshes matched by slug start at centerX.
    // Non-slider meshes start at:
    //   - From unfiltered: centerX (center column, same as slider X)
    //   - From filtered: their mosaic X but Y off-screen (will slide in)
    const sharedGeometry = new Plane(gl, { widthSegments: 16, heightSegments: 16 });
    const fallbackTex = getPlaceholderTexture(gl);
    const allMeshes: ColumnMesh[] = [];

    for (let i = 0; i < N; i++) {
      if (!categorizedIndices.has(i)) continue;
      const slug = allProjects[i].slug;
      const mosaic = mosaicPositions.get(i)!;

      const existing = sliderBySlug.get(slug);
      if (existing) {
        sliderBySlug.delete(slug);
        const currentY = existing.mesh.position.y as number;
        existing.mesh.setParent(scene);
        existing.mesh.position.x = centerX;
        existing.mesh.position.y = currentY;
        existing.mesh.position.z = 0;
        existing.mesh.scale.set(meshW, meshH, 1);
        existing.program.uniforms.u_distortionAmount.value = 0;
        existing.program.uniforms.uAlpha.value = 1;
        existing.program.uniforms.uTextureReady.value = 1.0;
        const entry = textures.get(slug);
        if (entry) entry.texture.needsUpdate = true;
        allMeshes.push({ mesh: existing.mesh, program: existing.program, slug, projectIndex: i, width: meshW, height: meshH });
      } else {
        const entry = textures.get(slug);
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

        if (comingFromFiltered) {
          // Position at mosaic X but off-screen Y (will slide in during Phase C)
          const dir = mosaic.col < currentColIdx ? -1 : mosaic.col > currentColIdx ? 1 : 0;
          const offscreenY = mosaic.y + dir * (vpDezoomH + maxColHeight);
          mesh.position.set(mosaic.x, offscreenY, 0);
        } else {
          // Center column: all at centerX with slider-like Y
          let d = i - centerIdx;
          if (d > N / 2) d -= N;
          if (d < -N / 2) d += N;
          mesh.position.set(centerX, -(d - fractional) * slideH, 0);
        }

        mesh.setParent(scene);
        allMeshes.push({ mesh, program, slug, projectIndex: i, width: meshW, height: meshH });
      }
    }

    sliderBySlug.forEach((s) => s.mesh.setParent(null));
    meshesRef.current = allMeshes;
    activeRef.current = true;
    let isComplete = false;

    markVisibleRef.current?.(new Set(allMeshes.map((m) => m.slug)));

    // ── Partition meshes ──
    const meshByCol = (col: number) => allMeshes.filter(
      (cm) => mosaicPositions.get(cm.projectIndex)?.col === col
    );
    const selectedMeshes = selectedColIdx >= 0 ? meshByCol(selectedColIdx) : [];
    const otherMeshesForExit = selectedColIdx >= 0
      ? allMeshes.filter((cm) => mosaicPositions.get(cm.projectIndex)?.col !== selectedColIdx)
      : [];
    // For entrance: meshes NOT in current filter (need to slide in)
    const currentColMeshes = currentColIdx >= 0 ? meshByCol(currentColIdx) : [];
    const slideInMeshes = comingFromFiltered
      ? allMeshes.filter((cm) => mosaicPositions.get(cm.projectIndex)?.col !== currentColIdx)
      : [];

    // ── Texture sync tick ──
    const syncedWidths = new Map<string, number>();
    let pendingSyncs = allMeshes.length;
    allMeshes.forEach((cm) => {
      const entry = textures.get(cm.slug);
      if (entry && entry.width > 4) {
        syncedWidths.set(cm.slug, entry.width);
        pendingSyncs--;
      }
    });

    let tickCounter = 0;
    const textureTick = () => {
      if (isComplete || pendingSyncs <= 0) {
        gsap.ticker.remove(textureTick);
        return;
      }
      // Throttle: check every 5th frame (textures loading isn't time-critical)
      if (++tickCounter % 5 !== 0) return;
      const curTextures = texturesRef.current;
      for (let j = 0; j < allMeshes.length; j++) {
        const cm = allMeshes[j];
        const prev = syncedWidths.get(cm.slug) ?? 0;
        const entry = curTextures.get(cm.slug);
        if (!entry || entry.width === prev) continue;
        syncedWidths.set(cm.slug, entry.width);
        entry.texture.needsUpdate = true;
        cm.program.uniforms.uResolution.value = [entry.width, entry.height];
        if (prev === 0) pendingSyncs--;
        cm.program.uniforms.uTextureReady.value = 1.0;
      }
    };
    if (pendingSyncs > 0) gsap.ticker.add(textureTick);

    // ── Timeline ──
    const tl = gsap.timeline();
    let t = 0; // running time cursor

    // ═══════════════════════════════════════════════════════════════
    // PHASE A — Dezoom Z=5 → Z=dezoomCameraZ
    //   From filtered: simultaneously shift current column to its mosaic X
    // ═══════════════════════════════════════════════════════════════
    tl.addLabel('dezoom', t);
    tl.to(camera.position, {
      z: dezoomCameraZ,
      duration: DEZOOM_DURATION,
      ease: 'power3.inOut',
    }, 'dezoom');

    if (comingFromFiltered) {
      // Batch: current column + slide-in columns, all during dezoom
      const dezoomBatch: BatchTarget[] = [];

      // Current column → mosaic positions
      currentColMeshes.forEach((cm) => {
        const mosaic = mosaicPositions.get(cm.projectIndex)!;
        dezoomBatch.push({ mesh: cm.mesh, program: cm.program, startX: 0, startY: 0, endX: mosaic.x, endY: mosaic.y, delay: 0 });
      });

      // Other columns slide in with stagger
      const otherColIndicesIn = Array.from({ length: numCats }, (_, i) => i)
        .filter((c) => c !== currentColIdx)
        .sort((a, b) => Math.abs(a - currentColIdx) - Math.abs(b - currentColIdx));
      const maxSlideInDelay = (otherColIndicesIn.length - 1) * SLIDE_IN_COL_STAGGER;
      const normalizer = maxSlideInDelay > 0 ? DEZOOM_DURATION : 1;

      otherColIndicesIn.forEach((colIdx, orderIdx) => {
        const colMeshes = slideInMeshes.filter(
          (cm) => mosaicPositions.get(cm.projectIndex)?.col === colIdx
        );
        const colDelay = orderIdx * SLIDE_IN_COL_STAGGER;
        const normDelay = colDelay / normalizer;
        colMeshes.forEach((cm) => {
          const mosaic = mosaicPositions.get(cm.projectIndex)!;
          // X stays at mosaic.x (already positioned), only Y slides in
          dezoomBatch.push({ mesh: cm.mesh, program: cm.program, startX: 0, startY: 0, endX: mosaic.x, endY: mosaic.y, delay: Math.min(normDelay, 0.5) });
        });
      });

      addBatchTween(tl, 'dezoom', DEZOOM_DURATION, dezoomBatch, power3InOut);
    }

    t += DEZOOM_DURATION + 0.2;

    // ═══════════════════════════════════════════════════════════════
    // PHASE B — Form mosaic (only for unfiltered → filter)
    // ═══════════════════════════════════════════════════════════════
    tl.addLabel('form', t);

    if (comingFromFiltered) {
      // Already formed during dezoom — skip
      // (t already advanced past dezoom)
    } else {
      // From unfiltered: glide center column to mosaic (1 proxy, N lerps)
      const meshesWithTarget = allMeshes.map((cm) => ({
        cm,
        target: mosaicPositions.get(cm.projectIndex)!,
      }));
      meshesWithTarget.sort((a, b) => Math.abs(a.target.x) - Math.abs(b.target.x));
      const totalStagger = (meshesWithTarget.length - 1) * GLIDE_STAGGER;
      const batchDuration = GLIDE_DURATION + totalStagger;

      const glideBatch: BatchTarget[] = meshesWithTarget.map(({ cm, target }, idx) => ({
        mesh: cm.mesh, program: cm.program,
        startX: 0, startY: 0,
        endX: target.x, endY: target.y,
        delay: (idx * GLIDE_STAGGER) / batchDuration,
      }));

      addBatchTween(tl, 'form', batchDuration, glideBatch, power3InOut, 0.8);
      t += batchDuration + 0.2;
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE C — Exit mosaic
    //   To filter: slide-out non-selected + rezoom into selected
    //   To All: converge all columns to center + rezoom
    // ═══════════════════════════════════════════════════════════════
    tl.addLabel('exit', t);

    if (goingToAll) {
      // ── To All: converge all columns back to center column (1 proxy) ──
      const convergeBatch: BatchTarget[] = allMeshes.map((cm) => {
        let d = cm.projectIndex;
        if (d > N / 2) d -= N;
        if (d < -N / 2) d += N;
        return {
          mesh: cm.mesh, program: cm.program,
          startX: 0, startY: 0,
          endX: centerX, endY: -d * slideH,
          delay: 0,
        };
      });

      addBatchTween(tl, 'exit', GLIDE_DURATION, convergeBatch, power3InOut, 0.8);
      t += GLIDE_DURATION + 0.1;

      // Rezoom
      tl.addLabel('rezoom', t);
      tl.to(camera.position, {
        z: 5,
        duration: REZOOM_DURATION,
        ease: 'power3.inOut',
      }, 'rezoom');
      t += REZOOM_DURATION + 0.05;

      // On complete — handoff ALL projects to slider
      tl.call(() => {
        isComplete = true;
        camera.position.z = 5;
        gsap.ticker.remove(textureTick);

        const handoffCount = Math.min(N, WINDOW_SIZE);
        const half = Math.floor(handoffCount / 2);
        const handoff: SlideData[] = [];
        const meshByAllIdx = new Map<number, ColumnMesh>();
        allMeshes.forEach((cm) => meshByAllIdx.set(cm.projectIndex, cm));
        const usedMeshes = new Set<ColumnMesh>();

        for (let slot = 0; slot < handoffCount; slot++) {
          const offset = slot - half;
          const projIdx = ((offset % N) + N) % N;
          const cm = meshByAllIdx.get(projIdx);
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
            mesh: cm.mesh, program: cm.program, slug: cm.slug,
            baseY: slotY, width: meshW, height: meshH, xOffset: 0, projectIndex: projIdx,
          });
        }
        allMeshes.forEach((cm) => { if (!usedMeshes.has(cm)) cm.mesh.setParent(null); });
        handoffRef.current = handoff;
        meshesRef.current = [];
        window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(() => { onCompleteRef.current(); });
      }, [], t);

    } else {
      // ── To specific filter: slide-out + rezoom simultaneously (1 batch) ──
      const otherColIndicesOut = Array.from({ length: numCats }, (_, i) => i)
        .filter((c) => c !== selectedColIdx)
        .sort((a, b) => Math.abs(a - selectedColIdx) - Math.abs(b - selectedColIdx));
      const maxExitDelay = (otherColIndicesOut.length - 1) * SLIDE_OUT_COL_STAGGER;

      const exitBatch: BatchTarget[] = [];

      // Slide-out non-selected columns (relative Y offset)
      otherColIndicesOut.forEach((colIdx, orderIdx) => {
        const colMeshes = otherMeshesForExit.filter(
          (cm) => mosaicPositions.get(cm.projectIndex)?.col === colIdx
        );
        const dir = colIdx < selectedColIdx ? -1 : 1;
        const slideOutY = dir * (vpDezoomH + maxColHeight);
        const normDelay = maxExitDelay > 0 ? (orderIdx * SLIDE_OUT_COL_STAGGER) / REZOOM_DURATION : 0;
        colMeshes.forEach((cm) => {
          const curY = mosaicPositions.get(cm.projectIndex)!.y;
          exitBatch.push({
            mesh: cm.mesh, program: cm.program,
            startX: 0, startY: 0,
            endX: cm.mesh.position.x as number, endY: curY + slideOutY,
            delay: Math.min(normDelay, 0.5),
          });
        });
      });

      // Selected column shifts to centerX (delay=0)
      selectedMeshes.forEach((cm) => {
        exitBatch.push({
          mesh: cm.mesh, program: cm.program,
          startX: 0, startY: 0,
          endX: centerX, endY: cm.mesh.position.y as number, // Y stays
          delay: 0,
        });
      });

      addBatchTween(tl, 'exit', REZOOM_DURATION, exitBatch, power3InOut);

      // Rezoom camera (still needs its own tween — it's 1 tween, not N)
      tl.to(camera.position, {
        z: 5,
        duration: REZOOM_DURATION,
        ease: 'power3.inOut',
      }, 'exit');

      t += REZOOM_DURATION + 0.05;

      // On complete — handoff selected column to slider
      const selectedColProjects = projectsByCol[selectedColIdx];
      const selectedCount = selectedColProjects.length;

      tl.call(() => {
        isComplete = true;
        camera.position.z = 5;
        gsap.ticker.remove(textureTick);

        otherMeshesForExit.forEach((cm) => cm.mesh.setParent(null));

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
            mesh: cm.mesh, program: cm.program, slug: cm.slug,
            baseY: slotY, width: meshW, height: meshH, xOffset: 0, projectIndex: filteredIdx,
          });
        }
        selectedMeshes.forEach((cm) => { if (!usedMeshes.has(cm)) cm.mesh.setParent(null); });
        handoffRef.current = handoff;
        meshesRef.current = [];
        window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(() => { onCompleteRef.current(); });
      }, [], t);
    }

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
