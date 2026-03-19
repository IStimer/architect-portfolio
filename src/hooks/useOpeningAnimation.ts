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
const NUM_OUTER_COLS = NUM_COLS - 1; // 4 outer columns

const SLIDE_W_FRAC = 0.35;
const SLIDE_H_FRAC = 0.50;
const SLIDE_SPACING = 0.04;
const COL_SPACING_FRAC = 0.04;

// Phase 1
const PHASE1_DURATION = 1.0;
const PHASE1_FADE_DURATION = 0.4;
const PHASE1_COL_STAGGER = 0.15;
const PHASE1_ROW_STAGGER = 0.03;

// Phase 2
const PHASE2_DURATION = 2.5;
const PHASE2_CAMERA_Z_END = 15;
const PHASE2_SCROLL_AMOUNT = 2.5;

// Phase 3 sub-phases
const PHASE3A_DURATION = 0.8;  // center spreads apart
const PHASE3B_DURATION = 1.0;  // outer meshes fly into gaps
const PHASE3C_DURATION = 1.2;  // collapse to slider + rezoom

// Column scroll directions: true = scrolls UP (arrives from bottom)
const COL_DIRECTIONS = [true, false, true, false, true];

// NUM_GAPS computed dynamically inside effect based on centerCount

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

    // ── Dimensions at Z=5 (slider camera position) ──
    const fovRad = (45 * Math.PI) / 180;
    const vp5H = 2 * Math.tan(fovRad / 2) * 5;
    const vp5W = vp5H * (window.innerWidth / window.innerHeight);
    const meshW = SLIDE_W_FRAC * vp5W;
    const meshH = SLIDE_H_FRAC * vp5H;
    const spacing = SLIDE_SPACING * vp5H;
    const colGap = COL_SPACING_FRAC * vp5W;
    const slideH = meshH + spacing;

    // Center X (matches slider calculation)
    const minimapW = (80 / window.innerWidth) * vp5W;
    const panelW = vp5W * 0.25;
    const centerX = (-vp5W / 2 + minimapW + vp5W / 2 - panelW) / 2;

    // Column X positions
    const colXs: number[] = [];
    for (let c = 0; c < NUM_COLS; c++) {
      colXs.push(centerX + (c - CENTER_COL) * (meshW + colGap));
    }

    // ── Phase 2 scroll offsets (precomputed so Phase 3 can account for them) ──
    const scrollDist = PHASE2_SCROLL_AMOUNT * slideH;
    const phase2Offsets: number[] = [];
    for (let c = 0; c < NUM_COLS; c++) {
      const dir = COL_DIRECTIONS[c] ? 1 : -1;
      const speed = c === CENTER_COL ? 1.15 : 1.0;
      phase2Offsets.push(dir * scrollDist * speed);
    }
    // ── Project assignment — no duplicates ──
    const half = Math.floor(CENTER_ROWS / 2);
    const centerCount = Math.min(CENTER_ROWS, N);
    const numGaps = Math.max(0, centerCount - 1);
    const centerProjectIndices: number[] = [];
    for (let i = -half; i < -half + centerCount; i++) {
      centerProjectIndices.push(((i % N) + N) % N);
    }

    // Remaining projects go to outer columns, distributed evenly, no duplicates
    const usedIndices = new Set(centerProjectIndices);
    const remainingProjects: number[] = [];
    for (let i = 0; i < N; i++) {
      if (!usedIndices.has(i)) remainingProjects.push(i);
    }

    // Compute outer rows per column based on available projects
    const outerRowCount = Math.max(0, Math.floor(remainingProjects.length / NUM_OUTER_COLS));
    let outerAssignIdx = 0;
    const outerProjectIndices: number[][] = [[], [], [], [], []];
    for (let c = 0; c < NUM_COLS; c++) {
      if (c === CENTER_COL) continue;
      for (let r = 0; r < outerRowCount; r++) {
        if (outerAssignIdx < remainingProjects.length) {
          outerProjectIndices[c].push(remainingProjects[outerAssignIdx]);
          outerAssignIdx++;
        }
      }
    }

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
      const colRows = outerProjectIndices[c].length;
      for (let r = 0; r < colRows; r++) {
        allMeshes.push(createMesh(c, r, outerProjectIndices[c][r], false));
      }
    }

    const visibleSlugs = new Set(allMeshes.map((m) => m.slug));
    markVisibleRef.current?.(visibleSlugs);

    const centerMeshes = allMeshes.filter((m) => m.isCenter);
    const outerMeshes = allMeshes.filter((m) => !m.isCenter);

    // ── Position meshes off-screen ──
    const centerRowOffset = Math.floor(centerCount / 2);

    centerMeshes.forEach((cm) => {
      const baseY = -(cm.row - centerRowOffset) * slideH;
      cm.mesh.position.x = colXs[CENTER_COL];
      cm.mesh.position.y = baseY - viewport.height * 2;
    });

    outerMeshes.forEach((cm) => {
      const rowOffset = Math.floor(outerRowCount / 2);
      const baseY = -(cm.row - rowOffset) * slideH;
      cm.mesh.position.x = colXs[cm.col];
      cm.mesh.position.y = (COL_DIRECTIONS[cm.col])
        ? baseY - viewport.height * 2
        : baseY + viewport.height * 2;
    });

    // ── Animation Timeline ──
    const tl = gsap.timeline();
    let isComplete = false;

    // ═══════════════════════════════════════════════════════
    // PHASE 1 — Columns Appear
    // ═══════════════════════════════════════════════════════

    tl.addLabel('phase1', 0);

    function animateColumnIn(meshes: ColumnMesh[], colIndex: number, colDelay: number) {
      const rowCount = colIndex === CENTER_COL ? centerCount : outerRowCount;
      const rowOffset = Math.floor(rowCount / 2);

      meshes.forEach((cm) => {
        const baseY = -(cm.row - rowOffset) * slideH;
        const startY = COL_DIRECTIONS[colIndex]
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

    const colStaggerMap = [
      PHASE1_COL_STAGGER * 2,
      PHASE1_COL_STAGGER,
      0,
      PHASE1_COL_STAGGER,
      PHASE1_COL_STAGGER * 2,
    ];

    for (let c = 0; c < NUM_COLS; c++) {
      animateColumnIn(allMeshes.filter((m) => m.col === c), c, colStaggerMap[c]);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 2 — Scroll + Dezoom
    // ═══════════════════════════════════════════════════════

    const phase2Start = PHASE1_DURATION + PHASE1_COL_STAGGER * 2 + 0.2;
    tl.addLabel('phase2', phase2Start);

    tl.to(camera.position,
      { z: PHASE2_CAMERA_Z_END, duration: PHASE2_DURATION, ease: 'power2.inOut' },
      'phase2'
    );

    for (let c = 0; c < NUM_COLS; c++) {
      const colMeshes = allMeshes.filter((m) => m.col === c);
      colMeshes.forEach((cm) => {
        tl.to(cm.mesh.position, {
          y: `+=${phase2Offsets[c]}`,
          duration: PHASE2_DURATION,
          ease: 'power2.inOut',
        }, 'phase2');
      });
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3 — Choreographed merge into single column
    //
    //   3A: Center meshes spread apart (2× spacing) to open gaps
    //       Positions are relative to POST-Phase-2 scroll offset.
    //   3B: Outer meshes fly into the gap slots (one per gap)
    //       Excess outer meshes stay put (off-screen after rezoom).
    //   3C: Center meshes collapse to final slider positions.
    //       Fill meshes stay at gap positions (off-screen after rezoom).
    //       Camera rezooms Z=15 → Z=5.
    //
    //   NO alpha/fadeout — zoom handles visibility.
    // ═══════════════════════════════════════════════════════

    const phase3Start = phase2Start + PHASE2_DURATION + 0.1;

    // Final slider positions (absolute, centered on y=0)
    const sliderYs: number[] = [];
    for (let r = 0; r < centerCount; r++) {
      sliderYs.push(-(r - centerRowOffset) * slideH);
    }

    // ── 3A: Center column spreads apart ──
    // Instead of absolute targets, use RELATIVE offsets from current position.
    // Each mesh moves away from the group center by an additional slideH * (distance from center row).
    // This doubles the spacing without needing to know the absolute post-Phase-2 position.
    tl.addLabel('phase3a', phase3Start);

    // Snapshot all center positions at phase3a start, then compute spread targets dynamically.
    const centerStartYs: number[] = new Array(centerCount).fill(0);
    const centerSpreadYs: number[] = new Array(centerCount).fill(0);
    let phase3aSnapshotDone = false;

    tl.call(() => {
      // Snapshot current positions
      centerMeshes.forEach((cm) => {
        centerStartYs[cm.row] = cm.mesh.position.y as number;
      });
      // Compute group center
      const groupCenterY = centerStartYs.reduce((a, b) => a + b, 0) / centerCount;
      // Spread: each mesh moves to 2× its distance from group center
      centerMeshes.forEach((cm) => {
        const distFromCenter = centerStartYs[cm.row] - groupCenterY;
        centerSpreadYs[cm.row] = groupCenterY + distFromCenter * 2;
      });
      phase3aSnapshotDone = true;
    }, [], 'phase3a');

    centerMeshes.forEach((cm) => {
      const proxy = { t: 0 };

      tl.to(proxy, {
        t: 1,
        duration: PHASE3A_DURATION,
        ease: 'power2.inOut',
        onUpdate: () => {
          if (!phase3aSnapshotDone) return;
          cm.mesh.position.y = lerp(centerStartYs[cm.row], centerSpreadYs[cm.row], proxy.t);
        },
      }, 'phase3a');
    });

    // ── 3B: Outer meshes fly into gap slots ──
    const phase3bStart = phase3Start + PHASE3A_DURATION + 0.05;
    tl.addLabel('phase3b', phase3bStart);

    // Sort outer meshes: nearest columns first
    const outerSorted = [...outerMeshes].sort((a, b) => {
      const dA = Math.abs(a.col - CENTER_COL) + a.row * 0.01;
      const dB = Math.abs(b.col - CENTER_COL) + b.row * 0.01;
      return dA - dB;
    });

    // First numGaps get gap slots, rest stay put
    const fillMeshes = outerSorted.slice(0, numGaps);

    // Gap targets are computed dynamically from the spread positions (midpoints).
    // gapAssign[idx] = which gap index (0..7) this fillMesh fills.
    // Assign center-outward for visual balance.
    const gapAssign: number[] = [];
    {
      const gapsByDist = Array.from({ length: numGaps }, (_, i) => i)
        .sort((a, b) => {
          // Sort by distance from center row gap (gap 3-4 is center)
          const midGap = (numGaps - 1) / 2;
          return Math.abs(a - midGap) - Math.abs(b - midGap);
        });
      for (let i = 0; i < fillMeshes.length; i++) {
        gapAssign.push(gapsByDist[i]);
      }
    }

    fillMeshes.forEach((cm, idx) => {
      const gapIdx = gapAssign[idx];
      const stagger = idx * 0.04;

      const proxy = { t: 0 };
      let startX = 0;
      let startY = 0;
      let targetX = centerX;
      let targetY = 0;

      tl.to(proxy, {
        t: 1,
        duration: PHASE3B_DURATION,
        ease: 'power3.inOut',
        onStart: () => {
          startX = cm.mesh.position.x as number;
          startY = cm.mesh.position.y as number;
          // Gap target = midpoint between spread positions of center[gapIdx] and center[gapIdx+1]
          targetY = (centerSpreadYs[gapIdx] + centerSpreadYs[gapIdx + 1]) / 2;
          targetX = centerX;
        },
        onUpdate: () => {
          const p = proxy.t;
          const sinP = Math.sin(p * Math.PI);

          // Bezier arc from current position to gap slot
          const dx = targetX - startX;
          const dy = targetY - startY;
          const dist = Math.hypot(dx, dy) || 1;
          const perpX = -dy / dist;
          const perpY = dx / dist;
          const arcOffset = dist * 0.15;
          const cpx = (startX + targetX) / 2 + perpX * arcOffset;
          const cpy = (startY + targetY) / 2 + perpY * arcOffset;

          const inv = 1 - p;
          cm.mesh.position.x = inv * inv * startX + 2 * inv * p * cpx + p * p * targetX;
          cm.mesh.position.y = inv * inv * startY + 2 * inv * p * cpy + p * p * targetY;

          // Subtle Z arc
          cm.mesh.position.z = sinP * 0.12;

          // Subtle rotation
          cm.mesh.rotation.z = sinP * 0.03 * (cm.col < CENTER_COL ? 1 : -1);

          // Wind effect
          cm.program.uniforms.uWind.value = sinP * 0.5;
          cm.program.uniforms.uWindDir.value = [dx / dist, -dy / dist];
        },
      }, `phase3b+=${stagger}`);
    });

    // ── 3C: Collapse to slider positions + rezoom ──
    const phase3cStart = phase3bStart + PHASE3B_DURATION + 0.1;
    tl.addLabel('phase3c', phase3cStart);

    // NO mesh removal during 3C — just zoom into the center column.
    // Outer columns and fill meshes exit the viewport naturally as the camera zooms in.
    // Cleanup happens only at the very end in the onComplete callback.

    // Camera rezoom
    tl.to(camera.position,
      { z: 5, duration: PHASE3C_DURATION, ease: 'power3.inOut' },
      'phase3c'
    );

    // Center meshes: spread positions → final slider positions (absolute y=0 centered)
    centerMeshes.forEach((cm) => {
      const finalY = sliderYs[cm.row];
      const proxy = { t: 0 };
      let startY = 0;

      tl.to(proxy, {
        t: 1,
        duration: PHASE3C_DURATION,
        ease: 'power3.inOut',
        onStart: () => { startY = cm.mesh.position.y as number; },
        onUpdate: () => {
          cm.mesh.position.y = lerp(startY, finalY, proxy.t);
          cm.mesh.position.x = centerX;
        },
      }, 'phase3c');
    });

    // Fill meshes: follow the closing gap and compress with it
    fillMeshes.forEach((cm, idx) => {
      const gapIdx = gapAssign[idx];
      const proxy = { t: 0 };
      let topStartY = 0;
      let botStartY = 0;

      tl.to(proxy, {
        t: 1,
        duration: PHASE3C_DURATION,
        ease: 'power3.inOut',
        onStart: () => {
          topStartY = centerMeshes[gapIdx].mesh.position.y as number;
          botStartY = centerMeshes[gapIdx + 1].mesh.position.y as number;
        },
        onUpdate: () => {
          const p = proxy.t;

          // Track the midpoint between adjacent center meshes as they collapse
          const topNow = lerp(topStartY, sliderYs[gapIdx], p);
          const botNow = lerp(botStartY, sliderYs[gapIdx + 1], p);
          cm.mesh.position.y = (topNow + botNow) / 2;
          cm.mesh.position.x = centerX;

          // Compress vertically as gap closes
          const gapSpace = Math.abs(topNow - botNow) - meshH;
          const scaleFactor = Math.max(0, Math.min(1, gapSpace / meshH));
          cm.mesh.scale.y = meshH * scaleFactor;

          // Clean up z/rotation from 3B
          cm.mesh.position.z *= (1 - p * 0.3);
          cm.mesh.rotation.z *= (1 - p * 0.3);
        },
      }, 'phase3c');
    });

    // ── On Complete ──
    // Use label-based position (not `>` which is relative to last child, not the label)
    tl.call(() => {
      isComplete = true;

      // Force camera to exactly Z=5 (tween should be done, but be explicit)
      camera.position.z = 5;

      const handoff: SlideData[] = centerMeshes.map((cm) => {
        const finalY = sliderYs[cm.row];

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

      // Remove all outer meshes from scene
      outerMeshes.forEach((cm) => cm.mesh.setParent(null));

      // Recalculate viewport for Z=5 BEFORE notifying React
      window.dispatchEvent(new Event('resize'));

      // Notify React on next frame so viewport is fully settled
      requestAnimationFrame(() => {
        onCompleteRef.current();
      });
    }, [], `phase3c+=${PHASE3C_DURATION + 0.1}`);

    // Cleanup
    cleanupRef.current = () => {
      if (!isComplete) {
        tl.kill();
        allMeshes.forEach((cm) => cm.mesh.setParent(null));
      }
      camera.position.z = 5;
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  // Only depend on active + texturesLoaded (start/stop triggers).
  // projects/textures are read via refs to avoid re-triggering mid-animation
  // when the texture manager updates Map references during progressive loading.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, texturesLoaded]);

  const getHandoffSlides = useCallback(() => handoffRef.current, []);

  return { getHandoffSlides };
};
