import { useEffect, useRef, useCallback } from 'react';
import { Mesh, Program, Plane, Transform, RenderTarget, Raycast, Vec2 } from 'ogl';
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
}

// ── Constants ─────────────────────────────────────────────────────

const WINDOW_SIZE = 9;           // current ± 4 = 9 physical meshes
const SLIDE_W_FRAC = 0.35;      // slide width  = 35% viewport
const SLIDE_H_FRAC = 0.50;      // slide height = 50% viewport
const SLIDE_SPACING = 0.04;     // 4% viewport height between slides
const SCROLL_LERP = 0.1;
const VELOCITY_MULTIPLIER = 8.0;
const VELOCITY_LERP = 0.12;
const SLIDE_DISTORTION_MULT = 1.5;

// ── Hook ──────────────────────────────────────────────────────────

export const useSliderMode = ({
  getContext,
  active,
  projects,
  textures,
  texturesLoaded,
  currentIndex,
  onIndexChange,
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

  const mouseRef = useRef(new Vec2());
  const raycastRef = useRef<Raycast | null>(null);
  const hoveredRef = useRef<string | null>(null);

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

      const proxy = { value: current };
      jumpTweenRef.current = gsap.to(proxy, {
        value: finalTarget,
        duration: 0.8,
        ease: 'power3.inOut',
        onUpdate: () => { scrollTargetRef.current = proxy.value; },
        onComplete: () => { jumpTweenRef.current = null; },
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
    const w = SLIDE_W_FRAC * viewport.width;
    const h = SLIDE_H_FRAC * viewport.height;
    const spacing = SLIDE_SPACING * viewport.height;
    const slideH = h + spacing;
    slideHeightRef.current = slideH;
    totalHeightRef.current = N * slideH;

    // ── Center X ──
    const minimapW = (80 / window.innerWidth) * viewport.width;
    const panelW = viewport.width * 0.25;
    const centerX = (-viewport.width / 2 + minimapW + viewport.width / 2 - panelW) / 2;

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
      const sharedGeometry = new Plane(gl, { widthSegments: 16, heightSegments: 16 });
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
        scrollTargetRef.current += inertiaVelocityRef.current;
        inertiaVelocityRef.current *= 0.95;
        if (Math.abs(inertiaVelocityRef.current) < 0.0001) inertiaVelocityRef.current = 0;
      }

      // Lerp scroll
      const prevScroll = scrollRef.current;
      scrollRef.current += (scrollTargetRef.current - scrollRef.current) * SCROLL_LERP;
      scrollVelocityRef.current = scrollRef.current - prevScroll;

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

        // Visibility — request full-res for all visible slides (not just hovered)
        const inView = Math.abs(y) < curCtx.viewport.height * 1.5;
        if (inView) {
          visibleSlugs.add(slides[i].slug);
          requestFull?.(slides[i].slug);
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

        // Per-slide distortion
        const distFromCenter = Math.abs(y) / (curCtx.viewport.height / 2);
        slides[i].program.uniforms.u_distortionAmount.value =
          Math.abs(scrollVelocityRef.current) * (1 - Math.min(distFromCenter, 1)) * SLIDE_DISTORTION_MULT;

        // Track closest to center
        if (Math.abs(y) < closestDist) {
          closestDist = Math.abs(y);
          closestIndex = projectIdx;
        }
      }

      markVisible?.(visibleSlugs);

      if (closestIndex !== activeIndexRef.current) {
        activeIndexRef.current = closestIndex;
        onIndexChange(closestIndex);
      }

      // Post-FX distortion
      if (postfxMeshRef.current) {
        const prog = postfxMeshRef.current.program;
        const target = Math.abs(scrollVelocityRef.current) * VELOCITY_MULTIPLIER;
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
      geometry: new Plane(gl, { widthSegments: 32, heightSegments: 32 }),
      program: postfxProgram,
    });
    postfxMesh.scale.set(viewport.width, viewport.height, 1);
    postfxMesh.setParent(scene);
    postfxMeshRef.current = postfxMesh;

    // ── Wheel ──
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (jumpTweenRef.current) { jumpTweenRef.current.kill(); jumpTweenRef.current = null; }
      scrollTargetRef.current += e.deltaY * 0.005;
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
          requestFull?.(slide.slug);
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

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      ctx.canvas.style.cursor = '';
      if (Math.abs(e.clientY - dragStartYRef.current) < 5) {
        const curCtx = getContext();
        if (curCtx && raycastRef.current) {
          raycastRef.current.castMouse(curCtx.camera, mouseRef.current);
          const hits = raycastRef.current.intersectMeshes(slides.map((s) => s.mesh));
          if (hits.length > 0) {
            const hitSlide = slides.find((s) => s.mesh === hits[0]);
            if (hitSlide) {
              onIndexChange(hitSlide.projectIndex);
              jumpTo(hitSlide.projectIndex);
            }
          }
        }
      }
    };

    ctx.canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      gsap.ticker.remove(tick);
      if (jumpTweenRef.current) { jumpTweenRef.current.kill(); jumpTweenRef.current = null; }
      ctx.canvas.removeEventListener('wheel', handleWheel);
      ctx.canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

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
  }, [active, texturesLoaded, getContext, projects, textures, onIndexChange, jumpTo, markVisible, requestFull, getTier]);

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

      const w = SLIDE_W_FRAC * viewport.width;
      const h = SLIDE_H_FRAC * viewport.height;
      const spacing = SLIDE_SPACING * viewport.height;
      slideHeightRef.current = h + spacing;
      totalHeightRef.current = projects.length * slideHeightRef.current;

      const minimapW = (80 / window.innerWidth) * viewport.width;
      const panelW = viewport.width * 0.25;
      const centerX = (-viewport.width / 2 + minimapW + viewport.width / 2 - panelW) / 2;

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
    takeOwnership: () => {
      takenOverRef.current = true;
      const snapshot = [...slidesRef.current];
      slidesRef.current = [];
      return snapshot;
    },
  };
};
