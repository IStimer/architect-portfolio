import { useEffect, useRef, useCallback } from 'react';
import { Mesh, Program, Plane } from 'ogl';
import { gsap } from 'gsap';
import type { OGLContext } from './useOGLRenderer';
import type { ProjectData } from '../types';
import type { SlideData } from './useSliderMode';
import type { TextureEntry } from './useTextureManager';
import { getPlaceholderTexture } from './useTextureManager';
import vertexShader from '../shaders/slider/vertex.glsl';
import fragmentShader from '../shaders/slider/fragment.glsl';

// ── Constants ─────────────────────────────────────────────────────

const NUM_COLS = 5;
const CENTER_COL = 2;
const CENTER_ROWS = 9; // matches slider WINDOW_SIZE

const SLIDE_W_FRAC = 0.35;
const SLIDE_H_FRAC = 0.50;
const SLIDE_SPACING = 0.04;
const COL_SPACING_FRAC = 0.04;

const PHASE1_DURATION = 1.0;
const PHASE1_FADE_DURATION = 0.4;
const PHASE1_COL_STAGGER = 0.15;
const PHASE1_ROW_STAGGER = 0.03;

const PHASE2_DURATION = 2.5;
const PHASE2_CAMERA_Z_END = 15;
const PHASE2_SCROLL_AMOUNT = 2.5;

const PHASE3A_DURATION = 0.8;
const PHASE3B_DURATION = 1.0;
const PHASE3C_DURATION = 1.2;

// Column scroll directions: true = scrolls UP (arrives from bottom)
const COL_DIRECTIONS = [true, false, true, false, true];

// ── Interfaces ────────────────────────────────────────────────────

export interface OpeningAnimationHandle {
  getHandoffSlides: () => SlideData[] | null;
}

interface OpeningAnimationProps {
  getContext: () => OGLContext | null;
  active: boolean;
  projects: ProjectData[];
  textures: Map<string, TextureEntry>;
  texturesLoaded: boolean;
  onComplete: () => void;
  markVisible?: (slugs: Set<string>) => void;
}

interface ColumnMesh {
  mesh: Mesh;
  program: Program;
  col: number;
  row: number;
  slug: string;
  projectIndex: number;
  isCenter: boolean;
  width: number;
  height: number;
}

// ── Helper ────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// ── Hook ──────────────────────────────────────────────────────────

export const useOpeningAnimation = ({
  getContext,
  active,
  projects,
  textures,
  texturesLoaded,
  onComplete,
  markVisible,
}: OpeningAnimationProps): OpeningAnimationHandle => {
  const handoffRef = useRef<SlideData[] | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const getContextRef = useRef(getContext);
  getContextRef.current = getContext;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const markVisibleRef = useRef(markVisible);
  markVisibleRef.current = markVisible;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const texturesRef = useRef(textures);
  texturesRef.current = textures;

  useEffect(() => {
    if (!active || !texturesLoaded) return;
    const ctx = getContextRef.current();
    const projects = projectsRef.current;
    const textures = texturesRef.current;
    if (!ctx || projects.length === 0) return;

    const { gl, scene, camera, viewport } = ctx;
    const N = projects.length;

    handoffRef.current = null;

    // ── Dimensions at Z=5 ──
    const fovRad = (45 * Math.PI) / 180;
    const vp5H = 2 * Math.tan(fovRad / 2) * 5;
    const vp5W = vp5H * (window.innerWidth / window.innerHeight);
    const meshW = SLIDE_W_FRAC * vp5W;
    const meshH = SLIDE_H_FRAC * vp5H;
    const colGap = COL_SPACING_FRAC * vp5W;
    const slideH = meshH + SLIDE_SPACING * vp5H;

    // Slider X offset (accounts for minimap + panel)
    const minimapW = (80 / window.innerWidth) * vp5W;
    const panelW = vp5W * 0.25;
    const centerX = (-vp5W / 2 + minimapW + vp5W / 2 - panelW) / 2;

    // Animation starts centered on screen, shifts to centerX during rezoom
    const animCenterX = 0;

    const colXs: number[] = [];
    for (let c = 0; c < NUM_COLS; c++) {
      colXs.push(animCenterX + (c - CENTER_COL) * (meshW + colGap));
    }

    // ── Phase 2 scroll offsets ──
    const scrollDist = PHASE2_SCROLL_AMOUNT * slideH;
    const phase2Offsets: number[] = [];
    for (let c = 0; c < NUM_COLS; c++) {
      const dir = COL_DIRECTIONS[c] ? 1 : -1;
      const speed = c === CENTER_COL ? 0 : 1.0;
      phase2Offsets.push(dir * scrollDist * speed);
    }

    // ── Project assignment — interleaved for Phase 3 fill ──
    const half = Math.floor(CENTER_ROWS / 2);
    const sliderSize = Math.min(CENTER_ROWS, N);
    const centerCount = Math.ceil(sliderSize / 2);

    // Full slider sequence: e.g. [26, 27, 28, 29, 0, 1, 2, 3, 4]
    const sliderSequence: number[] = [];
    for (let i = -half; i < -half + sliderSize; i++) {
      sliderSequence.push(((i % N) + N) % N);
    }

    // Center: even-indexed positions [26, 28, 0, 2, 4]
    const centerProjectIndices: number[] = [];
    for (let i = 0; i < sliderSize; i += 2) {
      centerProjectIndices.push(sliderSequence[i]);
    }

    // Fill: odd-indexed positions [27, 29, 1, 3]
    const gapFillProjects: number[] = [];
    for (let i = 1; i < sliderSize; i += 2) {
      gapFillProjects.push(sliderSequence[i]);
    }

    // Distribute remaining projects to outer columns
    const usedIndices = new Set(centerProjectIndices);
    const fillSet = new Set(gapFillProjects);
    const extraProjects: number[] = [];
    for (let i = 0; i < N; i++) {
      if (!usedIndices.has(i) && !fillSet.has(i)) extraProjects.push(i);
    }
    extraProjects.sort((a, b) => {
      const distA = Math.min(a, N - a);
      const distB = Math.min(b, N - b);
      return distB - distA;
    });

    const outerProjectIndices: number[][] = [[], [], [], [], []];
    // Fills go to cols 1/3 (nearest center — shortest travel)
    gapFillProjects.forEach((proj, i) => {
      outerProjectIndices[i % 2 === 0 ? 1 : 3].push(proj);
    });
    // Extras round-robin: outer cols first, then inner
    const outerColOrder = [0, 4, 1, 3];
    extraProjects.forEach((proj, i) => {
      outerProjectIndices[outerColOrder[i % 4]].push(proj);
    });

    const outerRowCount = Math.max(
      ...outerProjectIndices.filter((_, c) => c !== CENTER_COL).map(a => a.length)
    );

    // ── Create meshes ──
    const sharedGeometry = new Plane(gl, { widthSegments: 16, heightSegments: 16 });
    const fallbackTex = getPlaceholderTexture(gl);
    const allMeshes: ColumnMesh[] = [];

    function createMesh(col: number, row: number, projectIdx: number, isCenter: boolean): ColumnMesh {
      const slug = projects[projectIdx].slug;
      const entry = textures.get(slug);

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
          uAlpha: { value: 0 },
          uTextureReady: { value: entry ? 1.0 : 0.3 },
          uWind: { value: 0 },
          uWindDir: { value: [0, 0] },
        },
        transparent: true,
      });

      const mesh = new Mesh(gl, { geometry: sharedGeometry, program });
      mesh.scale.set(meshW, meshH, 1);
      mesh.setParent(scene);

      return { mesh, program, col, row, slug, projectIndex: projectIdx, isCenter, width: meshW, height: meshH };
    }

    for (let r = 0; r < centerCount; r++) {
      allMeshes.push(createMesh(CENTER_COL, r, centerProjectIndices[r], true));
    }
    for (let c = 0; c < NUM_COLS; c++) {
      if (c === CENTER_COL) continue;
      for (let r = 0; r < outerProjectIndices[c].length; r++) {
        allMeshes.push(createMesh(c, r, outerProjectIndices[c][r], false));
      }
    }

    markVisibleRef.current?.(new Set(allMeshes.map((m) => m.slug)));

    const centerMeshes = allMeshes.filter((m) => m.isCenter);
    const outerMeshes = allMeshes.filter((m) => !m.isCenter);

    // ── Position meshes off-screen ──
    const centerRowOffset = Math.floor(centerCount / 2);
    const outerRowOffset = Math.floor(outerRowCount / 2);

    centerMeshes.forEach((cm) => {
      const baseY = -(cm.row - centerRowOffset) * slideH;
      cm.mesh.position.x = colXs[CENTER_COL];
      cm.mesh.position.y = baseY - viewport.height * 2;
    });

    outerMeshes.forEach((cm) => {
      const baseY = -(cm.row - outerRowOffset) * slideH;
      cm.mesh.position.x = colXs[cm.col];
      cm.mesh.position.y = COL_DIRECTIONS[cm.col]
        ? baseY - viewport.height * 2
        : baseY + viewport.height * 2;
    });

    // ── Animation Timeline ──
    const tl = gsap.timeline();
    let isComplete = false;

    // ═══════════════════════════════════════════════════════
    // PHASE 1 — Columns slide in from off-screen
    // ═══════════════════════════════════════════════════════

    tl.addLabel('phase1', 0);

    const colStaggerMap = [
      PHASE1_COL_STAGGER * 2,
      PHASE1_COL_STAGGER,
      0,
      PHASE1_COL_STAGGER,
      PHASE1_COL_STAGGER * 2,
    ];

    for (let c = 0; c < NUM_COLS; c++) {
      const colMeshes = allMeshes.filter((m) => m.col === c);
      const rowCount = c === CENTER_COL ? centerCount : outerRowCount;
      const rowOff = Math.floor(rowCount / 2);
      const colDelay = colStaggerMap[c];

      colMeshes.forEach((cm) => {
        const baseY = -(cm.row - rowOff) * slideH;
        const startY = COL_DIRECTIONS[c]
          ? baseY - viewport.height * 2
          : baseY + viewport.height * 2;
        const meshDelay = colDelay + cm.row * PHASE1_ROW_STAGGER;

        tl.fromTo(cm.mesh.position,
          { y: startY },
          { y: baseY, duration: PHASE1_DURATION, ease: 'power3.out' },
          `phase1+=${meshDelay}`
        );
        tl.fromTo(cm.program.uniforms.uAlpha,
          { value: 0 },
          { value: 1, duration: PHASE1_FADE_DURATION, ease: 'power2.out' },
          `phase1+=${meshDelay}`
        );
      });
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 2 — Scroll + Dezoom (center col stays still)
    // ═══════════════════════════════════════════════════════

    const phase2Start = PHASE1_DURATION + PHASE1_COL_STAGGER * 2 + 0.2;
    tl.addLabel('phase2', phase2Start);

    tl.to(camera.position,
      { z: PHASE2_CAMERA_Z_END, duration: PHASE2_DURATION, ease: 'power2.inOut' },
      'phase2'
    );

    for (let c = 0; c < NUM_COLS; c++) {
      allMeshes.filter((m) => m.col === c).forEach((cm) => {
        tl.to(cm.mesh.position, {
          y: `+=${phase2Offsets[c]}`,
          duration: PHASE2_DURATION,
          ease: 'power2.inOut',
        }, 'phase2');
      });
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3 — Merge all columns into one
    //
    //   3A: Center meshes spread to 2× spacing (open gaps)
    //   3B: ALL outer meshes converge to center column
    //       Fills land in gaps, extras extend above/below
    //   3C: Camera rezooms Z=15→Z=5 + X-shift to centerX
    //       Extras naturally leave viewport during rezoom
    // ═══════════════════════════════════════════════════════

    const phase3Start = phase2Start + PHASE2_DURATION + 0.1;

    // Slider positions (all 9 slots)
    const sliderRowOffset = Math.floor(sliderSize / 2);
    const sliderYs: number[] = [];
    for (let r = 0; r < sliderSize; r++) {
      sliderYs.push(-(r - sliderRowOffset) * slideH);
    }

    // ── 3A: Center spreads apart (computed statically, center speed=0) ──
    tl.addLabel('phase3a', phase3Start);

    // Center meshes are at baseY after Phase 1+2 (speed=0 → no scroll)
    const centerBaseYs = centerMeshes.map((cm) => -(cm.row - centerRowOffset) * slideH);
    const groupCenterY = centerBaseYs.reduce((a, b) => a + b, 0) / centerCount;
    const centerSpreadYs = centerBaseYs.map((y) => groupCenterY + (y - groupCenterY) * 2);

    centerMeshes.forEach((cm, i) => {
      const from = centerBaseYs[i];
      const to = centerSpreadYs[i];
      const proxy = { t: 0 };

      tl.to(proxy, {
        t: 1,
        duration: PHASE3A_DURATION,
        ease: 'power2.inOut',
        onUpdate: () => { cm.mesh.position.y = lerp(from, to, proxy.t); },
      }, 'phase3a');
    });

    // ── 3B: All outer meshes converge to center column ──
    const phase3bStart = phase3Start + PHASE3A_DURATION + 0.05;
    tl.addLabel('phase3b', phase3bStart);

    // Identify fill meshes for handoff
    const outerByProject = new Map<number, ColumnMesh>();
    outerMeshes.forEach(cm => outerByProject.set(cm.projectIndex, cm));

    const fillMeshes: ColumnMesh[] = [];
    const gapAssign: number[] = [];
    gapFillProjects.forEach((projIdx, gapIdx) => {
      const cm = outerByProject.get(projIdx);
      if (cm) {
        fillMeshes.push(cm);
        gapAssign.push(gapIdx);
      }
    });

    // Target Y: circular slider position relative to project 0
    function projectTargetY(projectIndex: number): number {
      let offset = projectIndex;
      if (offset > N / 2) offset -= N;
      return -offset * slideH;
    }

    // Sort: nearest columns first for visual flow
    const outerByColDist = [...outerMeshes].sort((a, b) =>
      Math.abs(a.col - CENTER_COL) - Math.abs(b.col - CENTER_COL)
    );

    // Positions computed statically — immune to GSAP/OGL state issues on replay
    outerByColDist.forEach((cm, idx) => {
      const targetY = projectTargetY(cm.projectIndex);
      const baseY = -(cm.row - outerRowOffset) * slideH;
      const expectedX = colXs[cm.col];
      const expectedY = baseY + phase2Offsets[cm.col];

      const proxy = { t: 0 };

      tl.to(proxy, {
        t: 1,
        duration: PHASE3B_DURATION,
        ease: 'power3.inOut',
        onStart: () => {
          cm.mesh.position.x = expectedX;
          cm.mesh.position.y = expectedY;
          console.log(`[3B] proj=${cm.projectIndex + 1} col=${cm.col} start=(${expectedX.toFixed(1)},${expectedY.toFixed(1)}) target=(${animCenterX.toFixed(1)},${targetY.toFixed(1)})`);
        },
        onUpdate: () => {
          cm.mesh.position.x = lerp(expectedX, animCenterX, proxy.t);
          cm.mesh.position.y = lerp(expectedY, targetY, proxy.t);
        },
      }, `phase3b+=${idx * 0.02}`);
    });

    // ── 3C: Rezoom + X-shift to slider offset ──
    const phase3bTotalStagger = (outerByColDist.length - 1) * 0.02;
    const phase3cStart = phase3bStart + PHASE3B_DURATION + phase3bTotalStagger + 0.1;
    tl.addLabel('phase3c', phase3cStart);

    tl.to(camera.position,
      { z: 5, duration: PHASE3C_DURATION, ease: 'power3.inOut' },
      'phase3c'
    );

    // Shift all meshes from screen center to slider offset
    const xShift = centerX - animCenterX;
    allMeshes.forEach((cm) => {
      const proxy = { t: 0 };
      let startX = 0;
      tl.to(proxy, {
        t: 1,
        duration: PHASE3C_DURATION,
        ease: 'power3.inOut',
        onStart: () => { startX = cm.mesh.position.x as number; },
        onUpdate: () => { cm.mesh.position.x = startX + xShift * proxy.t; },
      }, 'phase3c');
    });

    // ── On Complete ──
    tl.call(() => {
      isComplete = true;
      camera.position.z = 5;

      // Handoff: center (even slots) + fill (odd slots) = 9 in slider order
      const allSliderMeshes: { cm: ColumnMesh; sliderRow: number }[] = [];
      centerMeshes.forEach((cm, i) => allSliderMeshes.push({ cm, sliderRow: i * 2 }));
      fillMeshes.forEach((cm, i) => allSliderMeshes.push({ cm, sliderRow: gapAssign[i] * 2 + 1 }));
      allSliderMeshes.sort((a, b) => a.sliderRow - b.sliderRow);

      const handoff: SlideData[] = allSliderMeshes.map(({ cm, sliderRow }) => {
        const finalY = sliderYs[sliderRow];

        cm.mesh.position.x = centerX;
        cm.mesh.position.y = finalY;
        cm.mesh.position.z = 0;
        cm.mesh.rotation.z = 0;
        cm.mesh.scale.set(meshW, meshH, 1);
        cm.program.uniforms.uAlpha.value = 1;
        cm.program.uniforms.uWind.value = 0;
        cm.program.uniforms.uWindDir.value = [0, 0];
        cm.program.uniforms.uMeshSize.value = [meshW, meshH];

        return {
          mesh: cm.mesh,
          program: cm.program,
          slug: cm.slug,
          baseY: finalY,
          width: meshW,
          height: meshH,
          xOffset: 0,
          projectIndex: cm.projectIndex,
        };
      });

      handoffRef.current = handoff;

      // Remove non-slider outer meshes
      const sliderMeshSet = new Set(fillMeshes.map(f => f.mesh));
      outerMeshes.forEach((cm) => {
        if (!sliderMeshSet.has(cm.mesh)) cm.mesh.setParent(null);
      });

      window.dispatchEvent(new Event('resize'));
      requestAnimationFrame(() => { onCompleteRef.current(); });
    }, [], `phase3c+=${PHASE3C_DURATION + 0.1}`);

    // Cleanup
    cleanupRef.current = () => {
      tl.kill();
      if (!isComplete) {
        allMeshes.forEach((cm) => cm.mesh.setParent(null));
      }
      camera.position.z = 5;
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, texturesLoaded]);

  const getHandoffSlides = useCallback(() => handoffRef.current, []);

  return { getHandoffSlides };
};
