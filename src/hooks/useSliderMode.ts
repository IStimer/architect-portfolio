import { useEffect, useRef, useCallback } from 'react';
import { Mesh, Program, Transform, RenderTarget, Raycast, Vec2 } from 'ogl';
import { getSharedPlane } from '../services/sharedGeometry';
import { gsap } from 'gsap';
import type { OGLContext } from './useOGLRenderer';
import type { ProjectData } from '../types';
import vertexShader from '../shaders/slider/vertex.glsl';
import fragmentShader from '../shaders/slider/fragment.glsl';
import postfxVertexShader from '../shaders/slider/postfx-vertex.glsl';
import postfxFragmentShader from '../shaders/slider/postfx-fragment.glsl';

import { TextureTier, getPlaceholderTexture } from './useTextureManager';
import type { TextureEntry } from './useTextureManager';

export interface SlideData {
  mesh: Mesh;
  program: Program;
  slug: string;
  baseY: number;
  width: number;
  height: number;
  xOffset: number;
  projectIndex: number;
}

interface SliderModeProps {
  getContext: () => OGLContext | null;
  active: boolean;
  projects: ProjectData[];
  textures: Map<string, TextureEntry>;
  texturesLoaded: boolean;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onNavigate: (slug: string) => void;
  onRevealChange?: (revealed: boolean, complete: boolean) => void;
  revealBoundsRef?: React.MutableRefObject<DOMRect | null>;
  jumpToRef?: React.MutableRefObject<((index: number) => void) | null>;
  markVisible?: (slugs: Set<string>) => void;
  requestFull?: (slug: string) => void;
  getTier?: (slug: string) => TextureTier;
  initialMeshes?: SlideData[];
}

export interface SliderModeHandle {
  getSlides: () => SlideData[];
  getSlidesScene: () => Transform | null;
  getPostfxMesh: () => Mesh | null;
  getRenderTarget: () => RenderTarget | null;
  getTotalHeight: () => number;
  getScroll: () => number;
  takeOwnership: () => SlideData[];
  getRevealedScreenRect: () => DOMRect | null;
  selectSlide: (index: number) => void;
}

// ── Constants ─────────────────────────────────────────────────────

const WINDOW_SIZE = 9;           // current ± 4 = 9 physical meshes
const SLIDE_SIZE_FRAC = 0.35;    // slide = 35% viewport height (square, based on height)
const SLIDE_SPACING = 0.04;     // 4% viewport height between slides
const SCROLL_LERP = 0.1;
const VELOCITY_MULTIPLIER = 16.0;
const VELOCITY_LERP = 0.15;
const SLIDE_DISTORTION_MULT = 3.0;
const MAX_SCROLL_VELOCITY = 0.25;  // clamp scroll speed
const MAX_DISTORTION = 1.5;        // clamp per-slide distortion
const MAX_POSTFX_DISTORTION = 3.0; // clamp post-fx distortion
const MAX_INERTIA = 0.12;          // clamp drag inertia
const REVEAL_DURATION = 0.6;     // s — expand on centered slide (no jump needed)
const COLLAPSE_DURATION = 0.45;  // s — shrink back to cropped
const JUMP_DURATION = 1.6;       // s — scroll to center a slide

// Cubic out easing — fast start, smooth landing
function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }

// ── Hook ──────────────────────────────────────────────────────────

export const useSliderMode = ({
  getContext,
  active,
  projects,
  textures,
  texturesLoaded,
  currentIndex,
  onIndexChange,
  onNavigate,
  onRevealChange,
  revealBoundsRef,
  jumpToRef,
  markVisible,
  requestFull,
  getTier,
  initialMeshes,
}: SliderModeProps): SliderModeHandle => {
  // Store initialMeshes in a ref so it doesn't trigger effect re-runs
  // (it's consumed once at init, not a reactive dependency)
  const initialMeshesRef = useRef(initialMeshes);
  initialMeshesRef.current = initialMeshes;

  const slidesRef = useRef<SlideData[]>([]);
  const slidesSceneRef = useRef<Transform | null>(null);
  const postfxMeshRef = useRef<Mesh | null>(null);
  const renderTargetRef = useRef<RenderTarget | null>(null);

  const scrollRef = useRef(0);
  const scrollTargetRef = useRef(0);
  const scrollVelocityRef = useRef(0);
  const totalHeightRef = useRef(0);
  const activeIndexRef = useRef(0);

  const takenOverRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragScrollStartRef = useRef(0);
  const lastPointerRef = useRef({ y: 0, t: 0 });
  const inertiaVelocityRef = useRef(0);
  const jumpTweenRef = useRef<gsap.core.Tween | null>(null);

  const switchToSlideRef = useRef<((idx: number) => void) | null>(null);
  const jumpAndRevealRef = useRef<((idx: number) => void) | null>(null);
  const revealSlideRef = useRef<((idx: number) => void) | null>(null);

  const mouseRef = useRef(new Vec2());
  const raycastRef = useRef<Raycast | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const prevVisibleRef = useRef<string>(''); // joined slug string for fast comparison

  // Reveal state — tick-based so it follows the project across slot recycling
  const revealedRef = useRef(false);
  const revealedIndexRef = useRef(-1);
  const revealingRef = useRef(false);
  const revealStartTimeRef = useRef(0);
  const revealDurationRef = useRef(REVEAL_DURATION);
  const revealTargetScaleRef = useRef({ w: 0, h: 0 });

  // Tick-based collapse — independent from reveal so both can run simultaneously
  const collapsingRef = useRef(false);
  const collapseProjectIndexRef = useRef(-1);
  const collapseStartTimeRef = useRef(0);
  const collapseStartScaleRef = useRef({ w: 0, h: 0 });
  const collapseResolveRef = useRef<(() => void) | null>(null);
  const collapsePromiseRef = useRef<Promise<void> | null>(null);

  // Slide height in world units (computed once on setup, updated on resize)
  const slideHeightRef = useRef(0);

  const getScrollForIndex = useCallback(
    (index: number) => {
      return index * slideHeightRef.current;
    },
    []
  );

  // Smooth jumpTo — nearest wrapped instance, GSAP-controlled
  const jumpTo = useCallback(
    (index: number) => {
      if (jumpTweenRef.current) jumpTweenRef.current.kill();

      const N = projects.length;
      if (N === 0) return;

      const target = getScrollForIndex(index);
      const totalH = totalHeightRef.current;
      const current = scrollTargetRef.current;

      // Find nearest wrapped instance
      const k = totalH > 0 ? Math.round((current - target) / totalH) : 0;
      const finalTarget = target + k * totalH;

      // Kill any residual inertia that would drift after the jump
      inertiaVelocityRef.current = 0;

      const proxy = { value: current };
      jumpTweenRef.current = gsap.to(proxy, {
        value: finalTarget,
        duration: JUMP_DURATION,
        ease: 'expo.out',
        onUpdate: () => { scrollTargetRef.current = proxy.value; },
        onComplete: () => {
          jumpTweenRef.current = null;
        },
      });
    },
    [getScrollForIndex, projects.length]
  );

  useEffect(() => {
    if (jumpToRef) jumpToRef.current = active ? jumpTo : null;
    return () => { if (jumpToRef) jumpToRef.current = null; };
  }, [active, jumpTo, jumpToRef]);

  // ── Main setup ────────────────────────────────────────────────

  useEffect(() => {
    const ctx = getContext();
    if (!ctx || !active || !texturesLoaded) return;

    const { gl, scene, viewport } = ctx;
    const canvasEl = gl.canvas as HTMLCanvasElement;
    const N = projects.length;
    if (N === 0) return;

    // ── Dimensions ──
    const w = SLIDE_SIZE_FRAC * viewport.height;
    const h = SLIDE_SIZE_FRAC * viewport.height;
    const spacing = SLIDE_SPACING * viewport.height;
    const slideH = h + spacing;
    slideHeightRef.current = slideH;
    totalHeightRef.current = N * slideH;

    // ── Center X (centered in viewport) ──
    const centerX = 0;

    // ── Create render target + scene ──
    const rt = new RenderTarget(gl, { width: canvasEl.width, height: canvasEl.height });
    renderTargetRef.current = rt;

    const slidesScene = new Transform();
    slidesSceneRef.current = slidesScene;

    const raycast = new Raycast();
    raycastRef.current = raycast;

    // ── Create or adopt WINDOW_SIZE meshes ──
    const actualCount = Math.min(WINDOW_SIZE, N);
    const slides: SlideData[] = [];

    const initMeshes = initialMeshesRef.current;
    if (initMeshes && initMeshes.length > 0) {
      // Handoff from opening/filter animation — reparent existing meshes
      for (let i = 0; i < Math.min(initMeshes.length, actualCount); i++) {
        const hm = initMeshes[i];
        hm.mesh.setParent(slidesScene);
        slides.push({ ...hm });
      }
    } else {
      // Normal creation path
      const sharedGeometry = getSharedPlane(gl);
      const fallbackTex = getPlaceholderTexture(gl);

      for (let slot = 0; slot < actualCount; slot++) {
        const program = new Program(gl, {
          vertex: vertexShader,
          fragment: fragmentShader,
          uniforms: {
            uTexture: { value: fallbackTex },
            u_distortionAmount: { value: 0 },
            u_parallax: { value: 0 },
            uHover: { value: 0 },
            uMouse: { value: [0.5, 0.5] },
            uResolution: { value: [1, 1] },
            uMeshSize: { value: [w, h] },
            uAlpha: { value: 1.0 },
            uTextureReady: { value: 1.0 },
            uWind: { value: 0 },
            uWindDir: { value: [0, 0] },
          },
          transparent: true,
        });

        const mesh = new Mesh(gl, { geometry: sharedGeometry, program });
        mesh.scale.set(w, h, 1);
        mesh.position.set(centerX, 0, 0);
        mesh.setParent(slidesScene);

        slides.push({
          mesh,
          program,
          slug: '',
          baseY: 0,
          width: w,
          height: h,
          xOffset: 0,
          projectIndex: -1,
        });
      }
    }

    slidesRef.current = slides;

    // ── Assign texture to a slot ──
    function assignSlot(slot: SlideData, projectIdx: number) {
      const pIdx = ((projectIdx % N) + N) % N;
      if (slot.projectIndex === pIdx) return; // already assigned

      // If this slot held a collapsing or revealing slide, reset scale so the
      // new project appears at nominal. The tick will find the project in its new slot.
      const isAnimating =
        (collapsingRef.current && slot.projectIndex === collapseProjectIndexRef.current) ||
        (revealingRef.current && slot.projectIndex === revealedIndexRef.current);
      if (isAnimating) {
        const nomW = SLIDE_SIZE_FRAC * viewport.height;
        const nomH = SLIDE_SIZE_FRAC * viewport.height;
        slot.mesh.scale.set(nomW, nomH, 1);
        slot.program.uniforms.uMeshSize.value = [nomW, nomH];
        slot.width = nomW;
        slot.height = nomH;
      }

      slot.projectIndex = pIdx;
      slot.slug = projects[pIdx].slug;

      const entry = textures.get(slot.slug);
      if (entry) {
        slot.program.uniforms.uTexture.value = entry.texture;
        slot.program.uniforms.uResolution.value = [entry.width, entry.height];
      }

      // Reset hover for recycled slot
      slot.program.uniforms.uHover.value = 0;
    }

    // ── Initial scroll position ──
    const initialScroll = currentIndex * slideH;
    scrollRef.current = initialScroll;
    scrollTargetRef.current = initialScroll;

    // ── Initial assign + position ──
    const half = Math.floor(actualCount / 2);
    for (let i = 0; i < actualCount; i++) {
      const offset = i - half;
      assignSlot(slides[i], currentIndex + offset);
      slides[i].mesh.position.y = -offset * slideH + (initialScroll % slideH);
    }
    ctx.renderer.render({ scene: slidesScene, camera: ctx.camera, target: rt });

    // ── Takeover for transition ──
    takenOverRef.current = false;

    // ── Tick ──
    const tick = () => {
      if (takenOverRef.current) return;
      const curCtx = getContext();
      if (!curCtx) return;

      const totalH = totalHeightRef.current;
      if (totalH === 0) return;

      // Inertia
      if (!isDraggingRef.current && !jumpTweenRef.current) {
        inertiaVelocityRef.current = Math.max(-MAX_INERTIA, Math.min(MAX_INERTIA, inertiaVelocityRef.current));
        scrollTargetRef.current += inertiaVelocityRef.current;
        inertiaVelocityRef.current *= 0.95;
        if (Math.abs(inertiaVelocityRef.current) < 0.0001) inertiaVelocityRef.current = 0;
      }

      // Lerp scroll — during jumpTo the tween handles easing, no lerp lag
      const prevScroll = scrollRef.current;
      if (jumpTweenRef.current) {
        scrollRef.current = scrollTargetRef.current;
      } else {
        scrollRef.current += (scrollTargetRef.current - scrollRef.current) * SCROLL_LERP;
      }
      const rawVel = scrollRef.current - prevScroll;
      scrollVelocityRef.current = Math.max(-MAX_SCROLL_VELOCITY, Math.min(MAX_SCROLL_VELOCITY, rawVel));

      const scroll = scrollRef.current;

      // Virtual center index (fractional)
      const virtualCenter = scroll / slideH;
      const centerIdx = Math.round(virtualCenter);
      const fractional = virtualCenter - centerIdx;

      // Assign & position each slot
      let closestIndex = 0;
      let closestDist = Infinity;
      const visibleSlugs = new Set<string>();

      for (let i = 0; i < actualCount; i++) {
        const offset = i - half;
        const virtualIdx = centerIdx + offset;
        const projectIdx = ((virtualIdx % N) + N) % N;

        // Reassign if needed (recycling)
        assignSlot(slides[i], projectIdx);

        // Position: offset from center, adjusted by fractional scroll
        const y = -(offset - fractional) * slideH;
        slides[i].mesh.position.y = y;
        slides[i].baseY = y; // for transition controller snapshot

        // Visibility tracking (requestFull only on slot reassignment, not every frame)
        const inView = Math.abs(y) < curCtx.viewport.height * 1.5;
        if (inView) {
          visibleSlugs.add(slides[i].slug);
        }

        // Update texture resolution if tier upgraded
        const entry = textures.get(slides[i].slug);
        if (entry) {
          const res = slides[i].program.uniforms.uResolution.value;
          if (res[0] !== entry.width || res[1] !== entry.height) {
            res[0] = entry.width;
            res[1] = entry.height;
          }
        }

        // Animate uTextureReady
        const tier = getTier?.(slides[i].slug) ?? TextureTier.FULL;
        const targetReady = tier >= TextureTier.THUMBNAIL ? 1.0 : 0.3;
        const cur = slides[i].program.uniforms.uTextureReady.value;
        slides[i].program.uniforms.uTextureReady.value += (targetReady - cur) * 0.08;

        // Per-slide distortion (clamped)
        const distFromCenter = Math.abs(y) / (curCtx.viewport.height / 2);
        slides[i].program.uniforms.u_distortionAmount.value = Math.min(MAX_DISTORTION,
          Math.abs(scrollVelocityRef.current) * (1 - Math.min(distFromCenter, 1)) * SLIDE_DISTORTION_MULT);

        // Track closest to center
        if (Math.abs(y) < closestDist) {
          closestDist = Math.abs(y);
          closestIndex = projectIdx;
        }
      }

      // Only call markVisible when the visible set actually changes
      const visibleKey = Array.from(visibleSlugs).sort().join(',');
      if (visibleKey !== prevVisibleRef.current) {
        prevVisibleRef.current = visibleKey;
        markVisible?.(visibleSlugs);
      }

      if (closestIndex !== activeIndexRef.current) {
        activeIndexRef.current = closestIndex;
        onIndexChange(closestIndex);
      }

      // ── Tick-based reveal & collapse ──
      // Both find their project by index each frame, so they follow
      // projects across slot recycling. They run independently.
      if (revealingRef.current || collapsingRef.current) {
        const nomW = SLIDE_SIZE_FRAC * curCtx.viewport.height;
        const nomH = SLIDE_SIZE_FRAC * curCtx.viewport.height;
        const now = performance.now();

        if (revealingRef.current) {
          const revSlide = slides.find((s) => s.projectIndex === revealedIndexRef.current);
          if (revSlide) {
            const raw = Math.min((now - revealStartTimeRef.current) / 1000 / revealDurationRef.current, 1);
            const t = easeOutCubic(raw);
            const tw = revealTargetScaleRef.current.w;
            const th = revealTargetScaleRef.current.h;
            const rw = nomW + (tw - nomW) * t;
            const rh = nomH + (th - nomH) * t;
            revSlide.mesh.scale.set(rw, rh, 1);
            revSlide.program.uniforms.uMeshSize.value = [rw, rh];
            if (raw >= 1) {
              revealingRef.current = false;
              onRevealChange?.(true, true);
            }
          }
        }

        if (collapsingRef.current) {
          const colSlide = slides.find((s) => s.projectIndex === collapseProjectIndexRef.current);
          if (colSlide) {
            const raw = Math.min((now - collapseStartTimeRef.current) / 1000 / COLLAPSE_DURATION, 1);
            const t = easeOutCubic(raw);
            const cw = collapseStartScaleRef.current.w + (nomW - collapseStartScaleRef.current.w) * t;
            const ch = collapseStartScaleRef.current.h + (nomH - collapseStartScaleRef.current.h) * t;
            colSlide.mesh.scale.set(cw, ch, 1);
            colSlide.program.uniforms.uMeshSize.value = [cw, ch];
            if (raw >= 1) {
              colSlide.mesh.scale.set(nomW, nomH, 1);
              colSlide.program.uniforms.uMeshSize.value = [nomW, nomH];
              colSlide.width = nomW;
              colSlide.height = nomH;
              const resolve = collapseResolveRef.current;
              collapsingRef.current = false;
              collapseProjectIndexRef.current = -1;
              collapsePromiseRef.current = null;
              collapseResolveRef.current = null;
              resolve?.();
            }
          } else {
            const resolve = collapseResolveRef.current;
            collapsingRef.current = false;
            collapseProjectIndexRef.current = -1;
            collapsePromiseRef.current = null;
            collapseResolveRef.current = null;
            resolve?.();
          }
        }
      }

      // ── Push neighbors proportionally to expanded slide's extra height ──
      const vpH = curCtx.viewport.height;
      const nomH = SLIDE_SIZE_FRAC * vpH;
      const hasExpanded = revealedRef.current || revealingRef.current || collapsingRef.current;
      const expandedIdx = collapsingRef.current ? collapseProjectIndexRef.current : revealedIndexRef.current;

      if (hasExpanded) {
        const expandedSlide = slides.find((s) => s.projectIndex === expandedIdx);
        if (expandedSlide) {
          const expandH = expandedSlide.mesh.scale.y as number;
          const expandY = expandedSlide.mesh.position.y as number;
          const expandRatio = Math.max(0, (expandH - nomH) / (vpH * 0.8 - nomH));
          const push = (expandH - nomH) / 2 + expandRatio * vpH * 0.6;

          for (let i = 0; i < actualCount; i++) {
            if (slides[i].projectIndex === expandedIdx) continue;
            const curY = slides[i].mesh.position.y as number;
            if (curY > expandY) {
              slides[i].mesh.position.y += push;
            } else {
              slides[i].mesh.position.y -= push;
            }
          }
        }
      }

      // ── Update reveal bounds ref for DOM positioning (every frame, no callback) ──
      if (hasExpanded && revealBoundsRef) {
        const bSlide = slides.find((s) => s.projectIndex === expandedIdx);
        if (bSlide) {
          const cw = window.innerWidth;
          const ch = window.innerHeight;
          const mx = bSlide.mesh.position.x as number;
          const my = bSlide.mesh.position.y as number;
          const mw = bSlide.mesh.scale.x as number;
          const mh = bSlide.mesh.scale.y as number;
          const sx = ((mx - mw / 2 + curCtx.viewport.width / 2) / curCtx.viewport.width) * cw;
          const sy = ((curCtx.viewport.height / 2 - my - mh / 2) / curCtx.viewport.height) * ch;
          const sw = (mw / curCtx.viewport.width) * cw;
          const sh = (mh / curCtx.viewport.height) * ch;
          revealBoundsRef.current = new DOMRect(sx, sy, sw, sh);
        }
      }

      // Post-FX distortion
      if (postfxMeshRef.current) {
        const prog = postfxMeshRef.current.program;
        const target = Math.min(MAX_POSTFX_DISTORTION, Math.abs(scrollVelocityRef.current) * VELOCITY_MULTIPLIER);
        prog.uniforms.u_distortionAmount.value += (target - prog.uniforms.u_distortionAmount.value) * VELOCITY_LERP;
      }

      curCtx.renderer.render({ scene: slidesScene, camera: curCtx.camera, target: rt });
    };
    gsap.ticker.add(tick);

    // ── Post-FX quad ──
    const postfxProgram = new Program(gl, {
      vertex: postfxVertexShader,
      fragment: postfxFragmentShader,
      uniforms: {
        u_scene: { value: rt.texture },
        u_distortionAmount: { value: 0 },
      },
      transparent: true,
    });
    const postfxMesh = new Mesh(gl, {
      geometry: getSharedPlane(gl, 32, 32),
      program: postfxProgram,
    });
    postfxMesh.scale.set(viewport.width, viewport.height, 1);
    postfxMesh.setParent(scene);
    postfxMeshRef.current = postfxMesh;

    // ── Reveal / Collapse ──
    // Both are tick-based so they follow projects across slot recycling.
    // They run independently on different slides.

    function computeRevealTarget(projectIndex: number) {
      // Try mesh first, fallback to texture map for distant slides
      let imgW = 0, imgH = 0;
      const slide = slides.find((s) => s.projectIndex === projectIndex);
      if (slide) {
        const res = slide.program.uniforms.uResolution.value;
        imgW = res[0]; imgH = res[1];
      }
      if (imgW === 0 || imgH === 0) {
        // Fallback: read from texture cache
        const slug = projects[projectIndex]?.slug;
        if (slug) {
          const entry = textures.get(slug);
          if (entry) { imgW = entry.width; imgH = entry.height; }
        }
      }
      if (imgW === 0 || imgH === 0) return null;
      const imgAspect = imgW / imgH;

      const maxW = viewport.width * 0.70;
      const maxH = viewport.height * 0.80;
      let targetW = maxW;
      let targetH = targetW / imgAspect;
      if (targetH > maxH) {
        targetH = maxH;
        targetW = targetH * imgAspect;
      }
      return { w: targetW, h: targetH };
    }

    function revealSlide(projectIndex: number, duration = REVEAL_DURATION) {
      const target = computeRevealTarget(projectIndex);
      if (!target) return;

      revealingRef.current = true;
      revealedRef.current = true;
      revealedIndexRef.current = projectIndex;
      onRevealChange?.(true, false);
      revealStartTimeRef.current = performance.now();
      revealDurationRef.current = duration;
      revealTargetScaleRef.current = target;

      // Upgrade texture to full quality (1200px) on expand
      const slug = projects[projectIndex]?.slug
        ?? slides.find((s) => s.projectIndex === projectIndex)?.slug;
      if (slug) requestFull?.(slug);
    }

    function startCollapse(slide: SlideData) {
      collapsingRef.current = true;
      collapseProjectIndexRef.current = slide.projectIndex;
      collapseStartTimeRef.current = performance.now();
      collapseStartScaleRef.current = {
        w: slide.mesh.scale.x as number,
        h: slide.mesh.scale.y as number,
      };
    }

    function collapseReveal(instant = false): Promise<void> {
      if (!revealedRef.current) return Promise.resolve();
      if (!instant && collapsingRef.current && collapsePromiseRef.current) return collapsePromiseRef.current;

      // Stop any in-progress reveal
      revealingRef.current = false;
      onRevealChange?.(false, false);

      const slide = slides.find((s) => s.projectIndex === revealedIndexRef.current);
      if (!slide) {
        revealedRef.current = false;
        revealedIndexRef.current = -1;
        return Promise.resolve();
      }

      revealedRef.current = false;
      revealedIndexRef.current = -1;

      if (instant) {
        const nomW = SLIDE_SIZE_FRAC * viewport.height;
        const nomH = SLIDE_SIZE_FRAC * viewport.height;
        slide.mesh.scale.set(nomW, nomH, 1);
        slide.program.uniforms.uMeshSize.value = [nomW, nomH];
        slide.width = nomW;
        slide.height = nomH;
        return Promise.resolve();
      }

      startCollapse(slide);

      const promise = new Promise<void>((resolve) => {
        collapseResolveRef.current = resolve;
      });
      collapsePromiseRef.current = promise;
      return promise;
    }

    // Collapse old + jump + reveal new — all start simultaneously
    function switchToSlide(targetIndex: number) {
      const oldSlide = slides.find((s) => s.projectIndex === revealedIndexRef.current);
      revealingRef.current = false;
      if (oldSlide) startCollapse(oldSlide);
      revealedRef.current = false;
      revealedIndexRef.current = -1;
      onRevealChange?.(false, false);
      collapsePromiseRef.current = null;
      collapseResolveRef.current = null;

      onIndexChange(targetIndex);
      jumpTo(targetIndex);
      revealSlide(targetIndex, JUMP_DURATION);
    }

    // Expose internal functions via refs for external access
    switchToSlideRef.current = switchToSlide;
    jumpAndRevealRef.current = jumpAndReveal;
    revealSlideRef.current = (idx: number) => revealSlide(idx);

    // ── Wheel ──
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      collapseReveal();
      if (jumpTweenRef.current) { jumpTweenRef.current.kill(); jumpTweenRef.current = null; }
      const delta = Math.max(-50, Math.min(50, e.deltaY)) * 0.005;
      scrollTargetRef.current += delta;
    };
    ctx.canvas.addEventListener('wheel', handleWheel, { passive: false });

    // ── Drag ──
    const handlePointerDown = (e: PointerEvent) => {
      if (jumpTweenRef.current) { jumpTweenRef.current.kill(); jumpTweenRef.current = null; }
      isDraggingRef.current = true;
      inertiaVelocityRef.current = 0;
      dragStartYRef.current = e.clientY;
      dragScrollStartRef.current = scrollTargetRef.current;
      lastPointerRef.current = { y: e.clientY, t: performance.now() };
      ctx.canvas.style.cursor = 'grabbing';
    };

    const handlePointerMove = (e: PointerEvent) => {
      mouseRef.current.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );

      if (isDraggingRef.current) {
        const dy = e.clientY - dragStartYRef.current;
        const pxToWorld = viewport.height / window.innerHeight;
        scrollTargetRef.current = dragScrollStartRef.current + dy * pxToWorld;
        const now = performance.now();
        const dt = Math.max(now - lastPointerRef.current.t, 1);
        inertiaVelocityRef.current = ((e.clientY - lastPointerRef.current.y) * pxToWorld) / dt * 16;
        lastPointerRef.current = { y: e.clientY, t: now };
      }

      // Hover raycast
      const curCtx = getContext();
      if (!curCtx || !raycastRef.current) return;
      raycastRef.current.castMouse(curCtx.camera, mouseRef.current);
      const hits = raycastRef.current.intersectMeshes(slides.map((s) => s.mesh));
      let foundSlug: string | null = null;

      slides.forEach((slide) => {
        const isHit = hits.some((h: any) => h === slide.mesh);
        if (isHit) {
          foundSlug = slide.slug;
          const localX = (e.clientX / window.innerWidth - 0.5) * curCtx.viewport.width;
          const localY = (0.5 - e.clientY / window.innerHeight) * curCtx.viewport.height;
          slide.program.uniforms.uMouse.value = [
            Math.max(0, Math.min(1, (localX - slide.mesh.position.x) / (slide.mesh.scale.x as number) + 0.5)),
            Math.max(0, Math.min(1, (localY - slide.mesh.position.y) / (slide.mesh.scale.y as number) + 0.5)),
          ];
          gsap.to(slide.program.uniforms.uHover, { value: 1, duration: 0.4, ease: 'power2.out', overwrite: true });
        } else {
          gsap.to(slide.program.uniforms.uHover, { value: 0, duration: 0.4, ease: 'power2.out', overwrite: true });
        }
      });
      if (foundSlug !== hoveredRef.current) hoveredRef.current = foundSlug;
    };

    function jumpAndReveal(targetIndex: number) {
      onIndexChange(targetIndex);
      jumpTo(targetIndex);
      revealSlide(targetIndex, JUMP_DURATION);
    }

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      ctx.canvas.style.cursor = '';
      if (Math.abs(e.clientY - dragStartYRef.current) >= 5) {
        collapseReveal();
        return;
      }
      // Click detection
      const curCtx = getContext();
      if (!curCtx || !raycastRef.current) return;
      raycastRef.current.castMouse(curCtx.camera, mouseRef.current);
      const hits = raycastRef.current.intersectMeshes(slides.map((s) => s.mesh));
      if (hits.length === 0) return;
      const hitSlide = slides.find((s) => s.mesh === hits[0]);
      if (!hitSlide) return;

      if (revealedRef.current && hitSlide.projectIndex === revealedIndexRef.current) {
        onNavigate(hitSlide.slug);
      } else if (revealedRef.current) {
        switchToSlide(hitSlide.projectIndex);
      } else if (hitSlide.projectIndex === activeIndexRef.current) {
        jumpTo(hitSlide.projectIndex);
        revealSlide(hitSlide.projectIndex);
      } else {
        jumpAndReveal(hitSlide.projectIndex);
      }
    };

    // ── Keyboard ──
    function handleArrow(newIdx: number) {
      if (revealedRef.current) {
        switchToSlide(newIdx);
      } else {
        onIndexChange(newIdx);
        jumpTo(newIdx);
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        collapseReveal();
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        handleArrow(((activeIndexRef.current - 1) + N) % N);
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleArrow((activeIndexRef.current + 1) % N);
        return;
      }
    };

    ctx.canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      gsap.ticker.remove(tick);
      if (jumpTweenRef.current) { jumpTweenRef.current.kill(); jumpTweenRef.current = null; }
      if (revealedRef.current) onRevealChange?.(false, false);
      revealingRef.current = false;
      revealedRef.current = false;
      revealedIndexRef.current = -1;
      collapsingRef.current = false;
      collapseProjectIndexRef.current = -1;
      collapsePromiseRef.current = null;
      collapseResolveRef.current = null;
      ctx.canvas.removeEventListener('wheel', handleWheel);
      ctx.canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);

      // Only remove meshes if transition hasn't taken ownership
      if (!takenOverRef.current) {
        slides.forEach((s) => s.mesh.setParent(null));
      }
      postfxMesh.setParent(null);
      slidesRef.current = [];
      slidesSceneRef.current = null;
      postfxMeshRef.current = null;
      renderTargetRef.current = null;
      raycastRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, texturesLoaded, getContext, projects, textures, onIndexChange, onNavigate, onRevealChange, jumpTo, markVisible, requestFull, getTier]);

  // ── Resize ──
  useEffect(() => {
    if (!active) return;
    const handleResize = () => {
      const ctx = getContext();
      if (!ctx) return;
      const { gl, viewport } = ctx;
      const canvasEl = gl.canvas as HTMLCanvasElement;
      if (renderTargetRef.current) renderTargetRef.current.setSize(canvasEl.width, canvasEl.height);
      if (postfxMeshRef.current) postfxMeshRef.current.scale.set(viewport.width, viewport.height, 1);

      // Reset reveal state instantly on resize
      revealingRef.current = false;
      revealedRef.current = false;
      revealedIndexRef.current = -1;
      collapsingRef.current = false;
      collapseProjectIndexRef.current = -1;
      collapsePromiseRef.current = null;
      collapseResolveRef.current = null;

      const w = SLIDE_SIZE_FRAC * viewport.height;
      const h = SLIDE_SIZE_FRAC * viewport.height;
      const spacing = SLIDE_SPACING * viewport.height;
      slideHeightRef.current = h + spacing;
      totalHeightRef.current = projects.length * slideHeightRef.current;

      const centerX = 0;

      slidesRef.current.forEach((slide) => {
        slide.width = w;
        slide.height = h;
        slide.mesh.scale.set(w, h, 1);
        slide.mesh.position.x = centerX;
        slide.program.uniforms.uMeshSize.value = [w, h];
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [active, getContext, projects.length]);

  return {
    getSlides: () => slidesRef.current,
    getSlidesScene: () => slidesSceneRef.current,
    getPostfxMesh: () => postfxMeshRef.current,
    getRenderTarget: () => renderTargetRef.current,
    getTotalHeight: () => totalHeightRef.current,
    getScroll: () => scrollRef.current,
    getRevealedScreenRect: () => {
      if (!revealedRef.current) return null;
      const ctx = getContext();
      if (!ctx) return null;
      const slide = slidesRef.current.find((s) => s.projectIndex === revealedIndexRef.current);
      if (!slide) return null;

      const { viewport } = ctx;
      const cw = window.innerWidth;
      const ch = window.innerHeight;
      const meshX = slide.mesh.position.x as number;
      const meshY = slide.mesh.position.y as number;
      const meshW = slide.mesh.scale.x as number;
      const meshH = slide.mesh.scale.y as number;

      // World → screen: world origin = screen center
      const screenX = ((meshX - meshW / 2 + viewport.width / 2) / viewport.width) * cw;
      const screenY = ((viewport.height / 2 - meshY - meshH / 2) / viewport.height) * ch;
      const screenW = (meshW / viewport.width) * cw;
      const screenH = (meshH / viewport.height) * ch;

      return new DOMRect(screenX, screenY, screenW, screenH);
    },
    selectSlide: (index: number) => {
      if (revealedRef.current && revealedIndexRef.current === index) return;

      const doJumpAndReveal = () => {
        if (index === activeIndexRef.current) {
          revealSlideRef.current?.(index);
        } else {
          jumpAndRevealRef.current?.(index);
        }
      };

      if (revealedRef.current) {
        // Sequential: collapse first, then jump + reveal
        const collapseRef = collapsePromiseRef.current;
        if (collapseRef) {
          // Already collapsing, wait then proceed
          collapseRef.then(doJumpAndReveal);
        } else {
          // Start collapse, wait, then proceed
          const collapse = slidesRef.current.length > 0
            ? (() => {
                // Call collapseReveal via the internal ref
                revealingRef.current = false;
                onRevealChange?.(false, false);
                const slide = slidesRef.current.find((s) => s.projectIndex === revealedIndexRef.current);
                if (!slide) { revealedRef.current = false; revealedIndexRef.current = -1; return Promise.resolve(); }
                revealedRef.current = false;
                revealedIndexRef.current = -1;
                collapsingRef.current = true;
                collapseProjectIndexRef.current = slide.projectIndex;
                collapseStartTimeRef.current = performance.now();
                collapseStartScaleRef.current = { w: slide.mesh.scale.x as number, h: slide.mesh.scale.y as number };
                const promise = new Promise<void>((resolve) => { collapseResolveRef.current = resolve; });
                collapsePromiseRef.current = promise;
                return promise;
              })()
            : Promise.resolve();
          collapse.then(doJumpAndReveal);
        }
      } else {
        doJumpAndReveal();
      }
    },
    takeOwnership: () => {
      revealingRef.current = false;
      revealedRef.current = false;
      revealedIndexRef.current = -1;
      collapsingRef.current = false;
      collapseProjectIndexRef.current = -1;
      collapsePromiseRef.current = null;
      collapseResolveRef.current = null;
      takenOverRef.current = true;
      const snapshot = [...slidesRef.current];
      slidesRef.current = [];
      return snapshot;
    },
  };
};
