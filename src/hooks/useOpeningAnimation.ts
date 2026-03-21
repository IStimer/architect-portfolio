import { useEffect, useRef, useCallback } from "react";
import { Mesh, Program } from "ogl";
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(CustomEase);
CustomEase.create("lateDezoom", "M0,0 C0.5,0 0.5,0 0.55,0.03 0.7,0.12 0.88,0.5 1,1");
import type { OGLContext } from "./useOGLRenderer";
import type { ProjectData } from "../types";
import type { SlideData } from "./useSliderMode";
import type { TextureEntry } from "./useTextureManager";
import { getPlaceholderTexture } from "./useTextureManager";
import { getSharedPlane } from "../services/sharedGeometry";
import vertexShader from "../shaders/slider/vertex.glsl";
import fragmentShader from "../shaders/slider/fragment.glsl";

// ── Constants ─────────────────────────────────────────────────────

const NUM_COLS = 5;
const CENTER_COL = 2;
const WINDOW_SIZE = 9;

const SLIDE_W_FRAC = 0.35;
const SLIDE_H_FRAC = 0.5;
const SLIDE_SPACING = 0.04;
const COL_SPACING_FRAC = 0.04;

const HERO_START = 0; // hero starts immediately
const HERO_DURATION = 3.0; // single smooth arc
const DEZOOM_START = 1.2; // delay before dezoom starts
const GROUP_START = 0; // rest starts early with hero
const GROUP_DURATION = HERO_START + HERO_DURATION - GROUP_START; // synced to end with hero
const OUTER_COL_STAGGER = 0.15; // stagger between outer column pairs
const GAP_EXTRA = 3.0; // extra gap multiplier for first gap (decreases per row)

const PHASE2_DURATION = 1.2;

const PHASE3_CONVERGE_DURATION = 1.0;
const PHASE3_REZOOM_DURATION = 1.2;

const MOSAIC_PADDING = 1.15;

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
  currentIndex: number;
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
  width: number;
  height: number;
  pooled: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────

export const useOpeningAnimation = ({
  getContext,
  active,
  projects,
  textures,
  texturesLoaded,
  currentIndex,
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
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
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

    const { gl, scene, camera } = ctx;
    const N = projects.length;
    const targetIndex = currentIndexRef.current;

    handoffRef.current = null;

    // ── Dimensions at Z=5 ──
    const fovRad = (45 * Math.PI) / 180;
    const halfTan = Math.tan(fovRad / 2);
    const vp5H = 2 * halfTan * 5;
    const vp5W = vp5H * (window.innerWidth / window.innerHeight);
    const meshW = SLIDE_W_FRAC * vp5W;
    const meshH = SLIDE_H_FRAC * vp5H;
    const colGap = COL_SPACING_FRAC * vp5W;
    const slideH = meshH + SLIDE_SPACING * vp5H;

    // Slider X offset (accounts for minimap + panel)
    const minimapW = (80 / window.innerWidth) * vp5W;
    const panelW = vp5W * 0.25;
    const centerX = (-vp5W / 2 + minimapW + vp5W / 2 - panelW) / 2;

    // Animation center (screen center, shifts to centerX during rezoom)
    const animCenterX = 0;

    // ── Column X positions ──
    const colXs: number[] = [];
    for (let c = 0; c < NUM_COLS; c++) {
      colXs.push(animCenterX + (c - CENTER_COL) * (meshW + colGap));
    }

    // ── Balanced project distribution: round-robin across 5 columns ──
    const projectsByCol: number[][] = Array.from(
      { length: NUM_COLS },
      () => [],
    );
    for (let i = 0; i < N; i++) {
      projectsByCol[i % NUM_COLS].push(i);
    }

    const maxRowCount = Math.ceil(N / NUM_COLS);

    // ── Dynamic camera Z to fit the full mosaic ──
    const totalColsWidth = NUM_COLS * meshW + (NUM_COLS - 1) * colGap;
    const maxColHeight = maxRowCount * slideH;
    const aspect = window.innerWidth / window.innerHeight;
    const neededZW = (totalColsWidth * MOSAIC_PADDING) / (2 * halfTan * aspect);
    const neededZH = (maxColHeight * MOSAIC_PADDING) / (2 * halfTan);
    const dezoomCameraZ = Math.max(neededZW, neededZH, 10);

    // No scroll during dezoom — mosaic stays aligned as a clean grid

    // ── Create meshes ──
    const sharedGeometry = getSharedPlane(gl);
    const fallbackTex = getPlaceholderTexture(gl);
    const allMeshes: ColumnMesh[] = [];

    for (let c = 0; c < NUM_COLS; c++) {
      for (let r = 0; r < projectsByCol[c].length; r++) {
        const projIdx = projectsByCol[c][r];
        const slug = projects[projIdx].slug;
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
            uResolution: {
              value: entry ? [entry.width, entry.height] : [1, 1],
            },
            uMeshSize: { value: [meshW, meshH] },
            uAlpha: { value: 1 },
            uTextureReady: { value: entry && entry.width > 4 ? 1.0 : 0.3 },
            uWind: { value: 0 },
            uWindDir: { value: [0, 0] },
          },
          transparent: true,
        });
        if (entry) entry.texture.needsUpdate = true;

        const mesh = new Mesh(gl, { geometry: sharedGeometry, program });
        mesh.scale.set(meshW, meshH, 1);
        mesh.setParent(scene);

        allMeshes.push({
          mesh,
          program,
          col: c,
          row: r,
          slug,
          projectIndex: projIdx,
          width: meshW,
          height: meshH,
          pooled: false,
        });
      }
    }

    markVisibleRef.current?.(new Set(allMeshes.map((m) => m.slug)));

    // ── Viewport at dezoom Z ──
    const vpDezoomH = 2 * halfTan * dezoomCameraZ;

    // ── Column data ──
    const centerColMeshes = allMeshes.filter((m) => m.col === CENTER_COL);
    const centerRowCount = centerColMeshes.length;
    const centerRowOff = (centerRowCount - 1) / 2;

    const heroMesh = centerColMeshes.find((cm) => cm.row === 0)!;
    const heroBaseY = -(heroMesh.row - centerRowOff) * slideH;

    // ── Helper: compute start positions with decreasing gaps ──
    // Row 0 = closest to screen. Each subsequent row has a larger cumulative offset.
    // Gap between row i and row i+1 = slideH * (1 + GAP_EXTRA * (N-1-i)/(N-1))
    // So gap 0→1 is largest, gap N-2→N-1 is smallest (= slideH).
    function computeStartPositions(
      colMeshes: ColumnMesh[],
      edgeY: number, // just past screen edge (positive = above, negative = below)
      reverseGaps?: boolean, // true = biggest gap at BOTTOM (for columns arriving from above)
    ): Map<ColumnMesh, number> {
      // MUST maintain same order as final baseY: row0 highest, rowN lowest.
      // This guarantees zero crossing when animated with the same ease.
      const sorted = [...colMeshes].sort((a, b) => a.row - b.row);
      const count = sorted.length;
      const positions = new Map<ColumnMesh, number>();

      // Compute gap for each pair. Gap decreases from one end to the other.
      // Normal: biggest gap between row0-row1 (top), smallest at bottom.
      // Reversed: biggest gap between rowN-1 and rowN (bottom), smallest at top.
      const gaps: number[] = [];
      for (let i = 0; i < count - 1; i++) {
        const idx = reverseGaps ? i : count - 2 - i;
        const gapScale = 1 + (GAP_EXTRA * idx) / Math.max(count - 2, 1);
        gaps.push(slideH * gapScale);
      }

      // Compute total extent
      let totalGaps = 0;
      for (let i = 0; i < gaps.length; i++) totalGaps += gaps[i];

      // Row 0 at TOP (most positive Y), rowN at BOTTOM.
      const isBelow = edgeY < 0;
      let y = isBelow ? edgeY : edgeY + totalGaps;

      for (let i = 0; i < count; i++) {
        positions.set(sorted[i], y);
        if (i < count - 1) {
          y -= gaps[i]; // always stack downward
        }
      }
      return positions;
    }

    // ── Initial positions ──
    // Center: below screen, row 0 closest to edge
    const centerEdge = -(vp5H / 2 + meshH / 2); // hero top edge exactly at viewport bottom
    const centerStartYs = computeStartPositions(centerColMeshes, centerEdge);

    centerColMeshes.forEach((cm) => {
      cm.mesh.position.x = colXs[CENTER_COL];
      cm.mesh.position.y = centerStartYs.get(cm)!;
    });

    // Outer: ABOVE screen, row 0 closest to edge (slides down)
    for (let c = 0; c < NUM_COLS; c++) {
      if (c === CENTER_COL) continue;
      const colMeshes = allMeshes.filter((m) => m.col === c);
      const outerEdge = vpDezoomH / 2 + meshH;
      const outerStartYs = computeStartPositions(colMeshes, outerEdge, true);

      colMeshes.forEach((cm) => {
        cm.mesh.position.x = colXs[c];
        cm.mesh.position.y = outerStartYs.get(cm)!;
        cm.mesh.visible = false;
      });
    }

    let isComplete = false;

    // ── Animation Timeline ──
    const tl = gsap.timeline();

    // ═══════════════════════════════════════════════════════
    // ENTRANCE
    //   Beat 1: Hero slides up alone
    //   Beat 2: Single proxy per column — all slides lerp together
    //           (same t fraction = impossible to cross)
    // ═══════════════════════════════════════════════════════

    tl.addLabel("entrance", 0);

    // ── BEAT 1: Hero — single smooth arc ──
    // expo.inOut: ultra slow start (stuck to edge), explosive middle, sharp settle
    tl.to(
      heroMesh.mesh.position,
      {
        y: heroBaseY,
        duration: HERO_DURATION,
        ease: "expo.inOut",
      },
      `entrance+=${HERO_START}`,
    );

    // ── BEAT 2: dezoom + all others ──

    // Camera dezoom
    tl.to(
      camera.position,
      { z: dezoomCameraZ, duration: PHASE2_DURATION, ease: "lateDezoom" },
      `entrance+=${DEZOOM_START}`,
    );

    // Center other rows — same ease guarantees no crossing (start order = end order)
    centerColMeshes.forEach((cm) => {
      if (cm === heroMesh) return;
      const baseY = -(cm.row - centerRowOff) * slideH;
      tl.to(
        cm.mesh.position,
        {
          y: baseY,
          duration: GROUP_DURATION,
          ease: "expo.inOut",
        },
        `entrance+=${GROUP_START}`,
      );
    });

    // Outer columns — slide DOWN from above
    const outerColOrder = [1, 3, 0, 4];
    outerColOrder.forEach((c, colOrderIdx) => {
      const colMeshes = allMeshes.filter((m) => m.col === c);
      const rowOff = (colMeshes.length - 1) / 2;
      const colDelay = GROUP_START + colOrderIdx * OUTER_COL_STAGGER;

      tl.call(
        () => {
          colMeshes.forEach((cm) => {
            cm.mesh.visible = true;
          });
        },
        [],
        `entrance+=${colDelay}`,
      );

      colMeshes.forEach((cm) => {
        const baseY = -(cm.row - rowOff) * slideH;
        tl.to(
          cm.mesh.position,
          {
            y: baseY,
            duration: GROUP_DURATION,
            ease: "expo.inOut",
          },
          `entrance+=${colDelay}`,
        );
      });
    });

    // Total entrance time
    const outerEnd =
      GROUP_START +
      (outerColOrder.length - 1) * OUTER_COL_STAGGER +
      GROUP_DURATION;
    const heroEnd = HERO_START + HERO_DURATION;
    const centerEnd = Math.max(heroEnd, GROUP_START + GROUP_DURATION);
    const phase2End = Math.max(
      DEZOOM_START + PHASE2_DURATION,
      outerEnd,
      centerEnd,
    );

    // ═══════════════════════════════════════════════════════
    // PHASE 3 — Converge to center column + rezoom
    //
    //   3A: All columns converge to center column at animCenterX
    //   3B: Rezoom Z→5 + X-shift to slider offset
    // ═══════════════════════════════════════════════════════

    const phase3Start = phase2End + 0.3;
    tl.addLabel("phase3a", phase3Start);

    // 3A: Converge — each mesh moves to center column position
    allMeshes.forEach((cm) => {
      let d = (((cm.projectIndex - targetIndex) % N) + N) % N;
      if (d > N / 2) d -= N;
      const targetY = -d * slideH;

      tl.to(
        cm.mesh.position,
        {
          x: animCenterX,
          y: targetY,
          duration: PHASE3_CONVERGE_DURATION,
          ease: "expo.inOut",
        },
        "phase3a",
      );
    });

    // Distortion during convergence (single proxy)
    const convergeDistProxy = { t: 0 };
    tl.to(
      convergeDistProxy,
      {
        t: 1,
        duration: PHASE3_CONVERGE_DURATION,
        ease: "none",
        onUpdate: () => {
          const sinP = Math.sin(convergeDistProxy.t * Math.PI);
          for (let i = 0; i < allMeshes.length; i++) {
            allMeshes[i].program.uniforms.u_distortionAmount.value = sinP * 1.2;
            allMeshes[i].mesh.position.z = sinP * 0.12;
          }
        },
      },
      "phase3a",
    );

    // 3B: Rezoom + X-shift to slider offset
    const phase3bStart = phase3Start + PHASE3_CONVERGE_DURATION + 0.1;
    tl.addLabel("phase3b", phase3bStart);

    tl.to(
      camera.position,
      { z: 5, duration: PHASE3_REZOOM_DURATION, ease: "expo.inOut" },
      "phase3b",
    );

    // Shift all meshes from screen center to slider centerX
    allMeshes.forEach((cm) => {
      tl.to(
        cm.mesh.position,
        {
          x: centerX,
          duration: PHASE3_REZOOM_DURATION,
          ease: "expo.inOut",
        },
        "phase3b",
      );
    });

    // ── On Complete ──
    tl.call(
      () => {
        isComplete = true;
        camera.position.z = 5;

        // Build handoff in slider slot order
        const handoffCount = Math.min(N, WINDOW_SIZE);
        const half = Math.floor(handoffCount / 2);
        const handoff: SlideData[] = [];

        const meshByProjIdx = new Map<number, ColumnMesh>();
        allMeshes.forEach((cm) => meshByProjIdx.set(cm.projectIndex, cm));
        const usedMeshes = new Set<ColumnMesh>();

        for (let slot = 0; slot < handoffCount; slot++) {
          const offset = slot - half;
          const projIdx = (((targetIndex + offset) % N) + N) % N;
          const cm = meshByProjIdx.get(projIdx);
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
            projectIndex: projIdx,
          });
        }

        handoffRef.current = handoff;

        // Remove non-handoff meshes
        allMeshes.forEach((cm) => {
          if (!usedMeshes.has(cm)) {
            cm.mesh.setParent(null);
          }
        });

        window.dispatchEvent(new Event("resize"));
        requestAnimationFrame(() => {
          onCompleteRef.current();
        });
      },
      [],
      `phase3b+=${PHASE3_REZOOM_DURATION + 0.1}`,
    );

    // Cleanup
    cleanupRef.current = () => {
      tl.kill();
      if (!isComplete) {
        allMeshes.forEach((cm) => cm.mesh.setParent(null));
      }
      handoffRef.current = null;
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
