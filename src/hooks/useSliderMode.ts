import { useEffect, useRef, useCallback, useMemo } from 'react';
import { Mesh, Program, Plane, Texture, Transform, RenderTarget, Raycast, Vec2 } from 'ogl';
import { gsap } from 'gsap';
import type { OGLContext } from './useOGLRenderer';
import type { ProjectData } from '../types';
import vertexShader from '../shaders/slider/vertex.glsl';
import fragmentShader from '../shaders/slider/fragment.glsl';
import postfxVertexShader from '../shaders/slider/postfx-vertex.glsl';
import postfxFragmentShader from '../shaders/slider/postfx-fragment.glsl';

interface TextureEntry {
  texture: Texture;
  width: number;
  height: number;
}

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
}

export interface SliderModeHandle {
  getSlides: () => SlideData[];
  getSlidesScene: () => Transform | null;
  getPostfxMesh: () => Mesh | null;
  getRenderTarget: () => RenderTarget | null;
  getTotalHeight: () => number;
  getScroll: () => number;
}

const SLIDE_SPACING = 0.04;
const SCROLL_LERP = 0.1;
const VELOCITY_MULTIPLIER = 8.0;
const VELOCITY_LERP = 0.12;
const SLIDE_DISTORTION_MULT = 1.5;

export const useSliderMode = ({
  getContext,
  active,
  projects,
  textures,
  texturesLoaded,
  currentIndex,
  onIndexChange,
  jumpToRef,
}: SliderModeProps): SliderModeHandle => {
  const slidesRef = useRef<SlideData[]>([]);
  const slidesSceneRef = useRef<Transform | null>(null);
  const postfxMeshRef = useRef<Mesh | null>(null);
  const renderTargetRef = useRef<RenderTarget | null>(null);

  const scrollRef = useRef(0);
  const scrollTargetRef = useRef(0);
  const scrollVelocityRef = useRef(0);
  const totalHeightRef = useRef(0);
  const activeIndexRef = useRef(0);

  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragScrollStartRef = useRef(0);
  const lastPointerRef = useRef({ y: 0, t: 0 });
  const inertiaVelocityRef = useRef(0);
  const jumpTweenRef = useRef<gsap.core.Tween | null>(null);

  const mouseRef = useRef(new Vec2());
  const raycastRef = useRef<Raycast | null>(null);
  const hoveredRef = useRef<string | null>(null);

  const slidesParams = useMemo(() => {
    return projects.map(() => ({
      width: 0.35,
      height: 0.50,
      xOffset: 0,
    }));
  }, [projects]);

  const getScrollForIndex = useCallback(
    (index: number) => {
      const ctx = getContext();
      if (!ctx) return 0;
      const { viewport } = ctx;
      let offset = 0;
      for (let i = 0; i < index; i++) {
        const p = slidesParams[i];
        offset += p.height * viewport.height + SLIDE_SPACING * viewport.height;
      }
      return offset;
    },
    [getContext, slidesParams]
  );

  // Smooth jumpTo — shortest wrapping path, GSAP-controlled
  const jumpTo = useCallback(
    (index: number) => {
      if (jumpTweenRef.current) jumpTweenRef.current.kill();

      const target = getScrollForIndex(index);
      const totalH = totalHeightRef.current;
      const current = scrollTargetRef.current;

      // Shortest wrapping path
      let diff = target - current;
      if (totalH > 0 && Math.abs(diff) > totalH / 2) {
        diff = diff > 0 ? diff - totalH : diff + totalH;
      }
      const finalTarget = current + diff;

      const proxy = { value: current };
      jumpTweenRef.current = gsap.to(proxy, {
        value: finalTarget,
        duration: 0.8,
        ease: 'power3.inOut',
        onUpdate: () => {
          scrollTargetRef.current = proxy.value;
        },
        onComplete: () => {
          jumpTweenRef.current = null;
        },
      });
    },
    [getScrollForIndex]
  );

  useEffect(() => {
    if (jumpToRef) jumpToRef.current = active ? jumpTo : null;
    return () => { if (jumpToRef) jumpToRef.current = null; };
  }, [active, jumpTo, jumpToRef]);

  // Main setup
  useEffect(() => {
    const ctx = getContext();
    if (!ctx || !active || !texturesLoaded) return;

    const { gl, scene, viewport } = ctx;
    const canvasEl = gl.canvas as HTMLCanvasElement;

    const rt = new RenderTarget(gl, { width: canvasEl.width, height: canvasEl.height });
    renderTargetRef.current = rt;

    const slidesScene = new Transform();
    slidesSceneRef.current = slidesScene;

    // Center zone
    const minimapW = (80 / window.innerWidth) * viewport.width;
    const panelW = viewport.width * 0.25;
    const centerX = (-viewport.width / 2 + minimapW + viewport.width / 2 - panelW) / 2;

    const slides: SlideData[] = [];
    let cumulativeY = 0;
    const raycast = new Raycast();
    raycastRef.current = raycast;

    projects.forEach((project, i) => {
      const entry = textures.get(project.slug);
      if (!entry) return;

      const params = slidesParams[i];
      const w = params.width * viewport.width;
      const h = params.height * viewport.height;

      const baseY = -cumulativeY;
      cumulativeY += h + SLIDE_SPACING * viewport.height;

      const program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        uniforms: {
          uTexture: { value: entry.texture },
          u_distortionAmount: { value: 0 },
          u_parallax: { value: 0 },
          uHover: { value: 0 },
          uMouse: { value: [0.5, 0.5] },
          uResolution: { value: [entry.width, entry.height] },
          uMeshSize: { value: [w, h] },
        },
        transparent: true,
      });

      const geometry = new Plane(gl, { widthSegments: 16, heightSegments: 16 });
      const mesh = new Mesh(gl, { geometry, program });
      mesh.scale.set(w, h, 1);
      mesh.position.set(centerX, baseY, 0);
      mesh.setParent(slidesScene);

      slides.push({ mesh, program, slug: project.slug, baseY, width: w, height: h, xOffset: 0, projectIndex: i });
    });

    slidesRef.current = slides;
    totalHeightRef.current = cumulativeY;

    // Post-FX
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

    // Initial scroll
    const initialScroll = getScrollForIndex(currentIndex);
    scrollRef.current = initialScroll;
    scrollTargetRef.current = initialScroll;

    // Tick
    const tick = () => {
      const curCtx = getContext();
      if (!curCtx) return;

      // Inertia (skip if GSAP jumpTo is active)
      if (!isDraggingRef.current && !jumpTweenRef.current) {
        scrollTargetRef.current += inertiaVelocityRef.current;
        inertiaVelocityRef.current *= 0.95;
        if (Math.abs(inertiaVelocityRef.current) < 0.0001) inertiaVelocityRef.current = 0;
      }

      // Lerp scroll toward target
      const prevScroll = scrollRef.current;
      scrollRef.current += (scrollTargetRef.current - scrollRef.current) * SCROLL_LERP;
      scrollVelocityRef.current = scrollRef.current - prevScroll;

      const totalH = totalHeightRef.current;
      if (totalH === 0) return;

      let closestIndex = 0;
      let closestDist = Infinity;

      slides.forEach((slide) => {
        let y = slide.baseY + scrollRef.current;
        y = ((y + totalH / 2) % totalH + totalH) % totalH - totalH / 2;
        slide.mesh.position.y = y;

        // Parallax
        slide.program.uniforms.u_parallax.value = y / (curCtx.viewport.height / 2);

        // Per-slide distortion
        const distFromCenter = Math.abs(y) / (curCtx.viewport.height / 2);
        slide.program.uniforms.u_distortionAmount.value =
          Math.abs(scrollVelocityRef.current) * (1 - Math.min(distFromCenter, 1)) * SLIDE_DISTORTION_MULT;

        const dist = Math.abs(y);
        if (dist < closestDist) { closestDist = dist; closestIndex = slide.projectIndex; }
      });

      if (closestIndex !== activeIndexRef.current) {
        activeIndexRef.current = closestIndex;
        onIndexChange(closestIndex);
      }

      // Post-FX global distortion
      if (postfxMeshRef.current) {
        const prog = postfxMeshRef.current.program;
        const target = Math.abs(scrollVelocityRef.current) * VELOCITY_MULTIPLIER;
        prog.uniforms.u_distortionAmount.value += (target - prog.uniforms.u_distortionAmount.value) * VELOCITY_LERP;
      }

      curCtx.renderer.render({ scene: slidesScene, camera: curCtx.camera, target: rt });
    };
    gsap.ticker.add(tick);

    // Wheel
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (jumpTweenRef.current) { jumpTweenRef.current.kill(); jumpTweenRef.current = null; }
      scrollTargetRef.current += e.deltaY * 0.005;
    };
    ctx.canvas.addEventListener('wheel', handleWheel, { passive: false });

    // Drag
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
            if (hitSlide) { onIndexChange(hitSlide.projectIndex); jumpTo(hitSlide.projectIndex); }
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
      slides.forEach((s) => s.mesh.setParent(null));
      postfxMesh.setParent(null);
      slidesRef.current = [];
      slidesSceneRef.current = null;
      postfxMeshRef.current = null;
      renderTargetRef.current = null;
      raycastRef.current = null;
    };
  }, [active, texturesLoaded, getContext, projects, textures, slidesParams, onIndexChange, getScrollForIndex, jumpTo]);

  // Resize
  useEffect(() => {
    if (!active) return;
    const handleResize = () => {
      const ctx = getContext();
      if (!ctx) return;
      const { gl, viewport } = ctx;
      const canvasEl = gl.canvas as HTMLCanvasElement;
      if (renderTargetRef.current) renderTargetRef.current.setSize(canvasEl.width, canvasEl.height);
      if (postfxMeshRef.current) postfxMeshRef.current.scale.set(viewport.width, viewport.height, 1);

      const minimapW = (80 / window.innerWidth) * viewport.width;
      const panelW = viewport.width * 0.25;
      const centerX = (-viewport.width / 2 + minimapW + viewport.width / 2 - panelW) / 2;

      let cumulativeY = 0;
      slidesRef.current.forEach((slide, i) => {
        const params = slidesParams[i];
        const w = params.width * viewport.width;
        const h = params.height * viewport.height;
        slide.width = w;
        slide.height = h;
        slide.baseY = -cumulativeY;
        cumulativeY += h + SLIDE_SPACING * viewport.height;
        slide.mesh.scale.set(w, h, 1);
        slide.mesh.position.x = centerX;
        slide.program.uniforms.uMeshSize.value = [w, h];
      });
      totalHeightRef.current = cumulativeY;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [active, getContext, slidesParams]);

  return {
    getSlides: () => slidesRef.current,
    getSlidesScene: () => slidesSceneRef.current,
    getPostfxMesh: () => postfxMeshRef.current,
    getRenderTarget: () => renderTargetRef.current,
    getTotalHeight: () => totalHeightRef.current,
    getScroll: () => scrollRef.current,
  };
};
