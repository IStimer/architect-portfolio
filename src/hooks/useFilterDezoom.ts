import { useEffect, useRef, useCallback } from 'react';
import { Mesh, Program } from 'ogl';
import { gsap } from 'gsap';
import type { OGLContext } from './useOGLRenderer';
import type { ProjectData } from '../types';
import type { SanityCategory } from '../services/projectService';
import type { SlideData, SliderModeHandle } from './useSliderMode';
import type { TextureEntry } from './useTextureManager';
import { getPlaceholderTexture } from './useTextureManager';
import { initMeshPool, acquireMesh, releaseMesh } from '../services/meshPool';
import type { PooledMesh } from '../services/meshPool';
import { addBatchPositionTween, power3InOut } from '../services/batchTween';
import type { BatchItem } from '../services/batchTween';
import vertexShader from '../shaders/slider/vertex.glsl';
import fragmentShader from '../shaders/slider/fragment.glsl';

// ── Constants ─────────────────────────────────────────────────────

const SLIDE_SIZE_FRAC = 0.35;
const SLIDE_SPACING = 0.04;
const WINDOW_SIZE = 9;

const DEZOOM_DURATION = 1.2;
const GLIDE_DURATION = 1.0;
const GLIDE_STAGGER = 0.03;
const SLIDE_OUT_COL_STAGGER = 0.08;
const SLIDE_IN_COL_STAGGER = 0.08;
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
  pooled: boolean; // true if from mesh pool (should be released back)
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
  requestFull?: (slug: string) => void;
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
  requestFull,
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
  const requestFullRef = useRef(requestFull);
  requestFullRef.current = requestFull;

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
    const meshW = SLIDE_SIZE_FRAC * vp5H;
    const meshH = SLIDE_SIZE_FRAC * vp5H;
    const slideH = meshH + SLIDE_SPACING * vp5H;

    const centerX = 0;

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
    initMeshPool(gl, vertexShader, fragmentShader);
    const fallbackTex = getPlaceholderTexture(gl);
    const allMeshes: ColumnMesh[] = [];
    const pooledItems: PooledMesh[] = []; // track for cleanup

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
        if (entry && entry.width <= 20) entry.texture.needsUpdate = true;
        allMeshes.push({ mesh: existing.mesh, program: existing.program, slug, projectIndex: i, width: meshW, height: meshH, pooled: false });
      } else {
        const entry = textures.get(slug);
        if (entry) entry.texture.needsUpdate = true;

        const pooled = acquireMesh(gl);
        pooledItems.push(pooled);
        const { mesh, program } = pooled;

        program.uniforms.uTexture.value = entry?.texture ?? fallbackTex;
        program.uniforms.uResolution.value = entry ? [entry.width, entry.height] : [1, 1];
        program.uniforms.uMeshSize.value = [meshW, meshH];
        program.uniforms.uTextureReady.value = entry && entry.width > 4 ? 1.0 : 0.3;

        mesh.scale.set(meshW, meshH, 1);

        if (comingFromFiltered) {
          const dir = mosaic.col < currentColIdx ? -1 : mosaic.col > currentColIdx ? 1 : 0;
          const offscreenY = mosaic.y + dir * (vpDezoomH + maxColHeight);
          mesh.position.set(mosaic.x, offscreenY, 0);
        } else {
          let d = i - centerIdx;
          if (d > N / 2) d -= N;
          if (d < -N / 2) d += N;
          mesh.position.set(centerX, -(d - fractional) * slideH, 0);
        }

        mesh.setParent(scene);
        allMeshes.push({ mesh, program, slug, projectIndex: i, width: meshW, height: meshH, pooled: true });
      }
    }

    // Release leftover slider meshes (not reused)
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

    // ── Frustum culling tick — skip draw calls for off-screen meshes ──
    const cullTick = () => {
      if (isComplete) { gsap.ticker.remove(cullTick); return; }
      const camZ = camera.position.z as number;
      const vpH = 2 * halfTan * camZ;
      const vpW = vpH * aspect;
      const marginX = vpW / 2 + meshW;
      const marginY = vpH / 2 + meshH;
      for (let j = 0; j < allMeshes.length; j++) {
        const pos = allMeshes[j].mesh.position;
        allMeshes[j].mesh.visible =
          Math.abs(pos.x as number) < marginX &&
          Math.abs(pos.y as number) < marginY;
      }
    };
    gsap.ticker.add(cullTick);

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
      const dezoomItems: BatchItem[] = [];

      // Current column → mosaic positions (delay=0)
      currentColMeshes.forEach((cm) => {
        const mosaic = mosaicPositions.get(cm.projectIndex)!;
        dezoomItems.push({ mesh: cm.mesh, program: cm.program, endX: mosaic.x, endY: mosaic.y, delay: 0, startX: 0, startY: 0 });
      });

      // Other columns slide in with column stagger
      const otherColIndicesIn = Array.from({ length: numCats }, (_, i) => i)
        .filter((c) => c !== currentColIdx)
        .sort((a, b) => Math.abs(a - currentColIdx) - Math.abs(b - currentColIdx));

      otherColIndicesIn.forEach((colIdx, orderIdx) => {
        const colMeshes = slideInMeshes.filter(
          (cm) => mosaicPositions.get(cm.projectIndex)?.col === colIdx
        );
        const colDelay = orderIdx * SLIDE_IN_COL_STAGGER;
        colMeshes.forEach((cm) => {
          const mosaic = mosaicPositions.get(cm.projectIndex)!;
          // endX = current X (already at mosaic.x), only Y changes
          dezoomItems.push({ mesh: cm.mesh, program: cm.program, endX: mosaic.x, endY: mosaic.y, delay: colDelay, startX: 0, startY: 0 });
        });
      });

      addBatchPositionTween(tl, 'dezoom', DEZOOM_DURATION, dezoomItems);
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
      // From unfiltered: glide center column to mosaic (1 batch with stagger + distortion)
      const meshesWithTarget = allMeshes.map((cm) => ({
        cm,
        target: mosaicPositions.get(cm.projectIndex)!,
      }));
      meshesWithTarget.sort((a, b) => Math.abs(a.target.x) - Math.abs(b.target.x));

      const glideItems: BatchItem[] = meshesWithTarget.map(({ cm, target }, idx) => ({
        mesh: cm.mesh, program: cm.program,
        endX: target.x, endY: target.y,
        delay: idx * GLIDE_STAGGER,
        startX: 0, startY: 0,
      }));

      const glideTotalDuration = addBatchPositionTween(tl, 'form', GLIDE_DURATION, glideItems, 0.8);
      t += glideTotalDuration + 0.2;
    }

    // Helper: release pooled meshes, detach non-pooled
    function releaseCm(cm: ColumnMesh) {
      if (cm.pooled) {
        releaseMesh({ mesh: cm.mesh, program: cm.program });
      } else {
        cm.mesh.setParent(null);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE C — Exit mosaic
    //   To filter: slide-out non-selected + rezoom into selected
    //   To All: converge all columns to center + rezoom
    // ═══════════════════════════════════════════════════════════════
    tl.addLabel('exit', t);

    if (goingToAll) {
      // ── To All: converge all columns back to center column (1 batch) ──
      const convergeItems: BatchItem[] = allMeshes.map((cm) => {
        let d = cm.projectIndex;
        if (d > N / 2) d -= N;
        if (d < -N / 2) d += N;
        return {
          mesh: cm.mesh, program: cm.program,
          endX: centerX, endY: -d * slideH,
          delay: 0, startX: 0, startY: 0,
        };
      });

      addBatchPositionTween(tl, 'exit', GLIDE_DURATION, convergeItems, 0.8);
      t += GLIDE_DURATION + 0.1;

      // Rezoom
      tl.addLabel('rezoom', t);

      // Request FULL textures for target slide + neighbors during rezoom
      tl.call(() => {
        const idx = currentIndexRef.current;
        const half = 4;
        for (let i = idx - half; i <= idx + half; i++) {
          const pi = ((i % allProjects.length) + allProjects.length) % allProjects.length;
          requestFullRef.current?.(allProjects[pi].slug);
        }
      }, [], 'rezoom');
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
        gsap.ticker.remove(cullTick);
        // Ensure all meshes are visible for handoff (culling may have hidden some)
        allMeshes.forEach((cm) => { cm.mesh.visible = true; });

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
        allMeshes.forEach((cm) => { if (!usedMeshes.has(cm)) releaseCm(cm); });
        handoffRef.current = handoff;
        meshesRef.current = [];
        window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(() => { onCompleteRef.current(); });
      }, [], t);

    } else {
      // ── To specific filter: slide-out + rezoom simultaneously (1 batch) ──

      // Request FULL textures for the selected filter's projects during exit
      tl.call(() => {
        const selectedProjects = projectsByCol[selectedColIdx];
        const half = Math.floor(WINDOW_SIZE / 2);
        for (let i = 0; i < Math.min(selectedProjects.length, WINDOW_SIZE); i++) {
          const offset = i - half;
          const pi = ((offset % selectedProjects.length) + selectedProjects.length) % selectedProjects.length;
          requestFullRef.current?.(allProjects[selectedProjects[pi]].slug);
        }
      }, [], 'exit');

      const exitItems: BatchItem[] = [];

      // Slide-out: non-selected columns with column stagger
      // endY is relative (+=slideOutY), so we compute it in onStart via a wrapper
      const otherColIndicesOut = Array.from({ length: numCats }, (_, i) => i)
        .filter((c) => c !== selectedColIdx)
        .sort((a, b) => Math.abs(a - selectedColIdx) - Math.abs(b - selectedColIdx));

      // Pre-compute slideOut offsets per column (relative)
      const slideOutOffsets = new Map<number, number>();
      otherColIndicesOut.forEach((colIdx) => {
        const dir = colIdx < selectedColIdx ? -1 : 1;
        slideOutOffsets.set(colIdx, dir * (vpDezoomH + maxColHeight));
      });

      otherColIndicesOut.forEach((colIdx, orderIdx) => {
        const colMeshes = otherMeshesForExit.filter(
          (cm) => mosaicPositions.get(cm.projectIndex)?.col === colIdx
        );
        const colDelay = orderIdx * SLIDE_OUT_COL_STAGGER;
        const offset = slideOutOffsets.get(colIdx)!;
        colMeshes.forEach((cm) => {
          // endX/endY = 0 as placeholder — computed from startY + offset in onStart wrapper below
          exitItems.push({ mesh: cm.mesh, program: cm.program, endX: 0, endY: offset, delay: colDelay, startX: 0, startY: 0 });
        });
      });

      // Selected column shifts to centerX (delay=0, Y unchanged)
      selectedMeshes.forEach((cm) => {
        exitItems.push({ mesh: cm.mesh, program: cm.program, endX: centerX, endY: 0, delay: 0, startX: 0, startY: 0 });
      });

      // Custom batch: slideOut items use relative Y, selected use absolute X
      const selectedSet = new Set(selectedMeshes.map((cm) => cm.mesh));
      const maxDelay = exitItems.reduce((m, b) => Math.max(m, b.delay), 0);
      const totalDuration = REZOOM_DURATION + maxDelay;
      const exitProxy = { t: 0 };

      tl.fromTo(exitProxy, { t: 0 }, {
        t: totalDuration,
        duration: totalDuration,
        ease: 'none',
        onStart: () => {
          for (let i = 0; i < exitItems.length; i++) {
            const b = exitItems[i];
            b.startX = b.mesh.position.x as number;
            b.startY = b.mesh.position.y as number;
            if (selectedSet.has(b.mesh)) {
              // Selected: endX is absolute centerX, Y unchanged
              b.endY = b.startY;
            } else {
              // SlideOut: endY is relative offset from current position
              b.endY = b.startY + b.endY; // endY was storing the offset
              b.endX = b.startX; // X unchanged
            }
          }
        },
        onUpdate: () => {
          const elapsed = exitProxy.t;
          for (let i = 0; i < exitItems.length; i++) {
            const b = exitItems[i];
            const localElapsed = elapsed - b.delay;
            if (localElapsed <= 0) continue;
            const raw = Math.min(localElapsed / REZOOM_DURATION, 1);
            const eased = power3InOut(raw);
            b.mesh.position.x = b.startX + (b.endX - b.startX) * eased;
            b.mesh.position.y = b.startY + (b.endY - b.startY) * eased;
          }
        },
      }, 'exit');

      // Camera rezoom (1 tween — no batch needed)
      tl.to(camera.position, {
        z: 5,
        duration: REZOOM_DURATION,
        ease: 'power3.inOut',
      }, 'exit');

      t += totalDuration + 0.05;

      // On complete — handoff selected column to slider
      const selectedColProjects = projectsByCol[selectedColIdx];
      const selectedCount = selectedColProjects.length;

      tl.call(() => {
        isComplete = true;
        camera.position.z = 5;
        gsap.ticker.remove(textureTick);
        gsap.ticker.remove(cullTick);
        allMeshes.forEach((cm) => { cm.mesh.visible = true; });

        otherMeshesForExit.forEach(releaseCm);

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
        selectedMeshes.forEach((cm) => { if (!usedMeshes.has(cm)) releaseCm(cm); });
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
      gsap.ticker.remove(cullTick);
      if (!isComplete) {
        allMeshes.forEach(releaseCm);
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
