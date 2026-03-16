import { useEffect, useRef } from 'react';
import { Mesh } from 'ogl';
import { gsap } from 'gsap';
import type { ViewMode, ProjectData } from '../types';
import type { OGLContext } from './useOGLRenderer';
import type { SliderModeHandle } from './useSliderMode';
import type { GridModeHandle } from './useInfiniteGridMode';

interface TransitionControllerProps {
  getContext: () => OGLContext | null;
  viewMode: ViewMode;
  currentIndex: number;
  projects: ProjectData[];
  sliderHandle: SliderModeHandle;
  gridHandle: GridModeHandle;
  onTransitionComplete: (target: 'slider' | 'grid') => void;
}

export const useTransitionController = ({
  getContext,
  viewMode,
  currentIndex,
  projects,
  sliderHandle,
  gridHandle,
  onTransitionComplete,
}: TransitionControllerProps) => {
  const isAnimatingRef = useRef(false);
  const transitionMeshesRef = useRef<Mesh[]>([]);

  // Slider -> Grid transition
  useEffect(() => {
    if (viewMode !== 'transitioning-to-grid' || isAnimatingRef.current) return;
    const ctx = getContext();
    if (!ctx) return;

    isAnimatingRef.current = true;

    const { scene } = ctx;
    const slides = sliderHandle.getSlides();
    const postfxMesh = sliderHandle.getPostfxMesh();

    // Remove post-FX mesh
    if (postfxMesh) {
      postfxMesh.setParent(null);
    }

    // Move slide meshes to main scene
    slides.forEach((slide) => {
      slide.mesh.setParent(scene);
      slide.program.uniforms.u_distortionAmount.value = 0;
      slide.program.uniforms.u_parallax.value = 0;
      slide.program.uniforms.uHover.value = 0;
    });

    // Get grid layout target positions
    const gridLayout = gridHandle.getLayout();
    const gridPositions = gridLayout?.positions ?? [];

    const tl = gsap.timeline({
      onComplete: () => {
        slides.forEach((slide) => {
          slide.mesh.setParent(null);
        });
        transitionMeshesRef.current = [];
        isAnimatingRef.current = false;
        onTransitionComplete('grid');
      },
    });

    slides.forEach((slide, i) => {
      const gridPos = gridPositions[i];
      if (!gridPos) return;

      tl.to(
        slide.mesh.position,
        { x: gridPos.x, y: gridPos.y, duration: 0.8, ease: 'power3.inOut' },
        0
      );

      tl.to(
        slide.mesh.scale,
        { x: gridPos.w, y: gridPos.h, duration: 0.8, ease: 'power3.inOut' },
        0
      );
    });

    return () => { tl.kill(); };
  }, [viewMode, getContext, sliderHandle, gridHandle, onTransitionComplete]);

  // Grid -> Slider transition
  useEffect(() => {
    if (viewMode !== 'transitioning-to-slider' || isAnimatingRef.current) return;
    const ctx = getContext();
    if (!ctx) return;

    isAnimatingRef.current = true;

    const gridMeshes = gridHandle.getMeshes();

    const tl = gsap.timeline({
      onComplete: () => {
        gridMeshes.forEach((item) => {
          item.mesh.setParent(null);
        });
        transitionMeshesRef.current = [];
        isAnimatingRef.current = false;
        onTransitionComplete('slider');
      },
    });

    // Stagger non-active meshes out
    gridMeshes.forEach((item, i) => {
      const isActive = item.slug === projects[currentIndex]?.slug;

      if (!isActive) {
        tl.to(
          item.mesh.scale,
          { x: 0, y: 0, duration: 0.4, ease: 'power2.in' },
          i * 0.03
        );
      }
    });

    // Then fade active mesh
    const activeMesh = gridMeshes.find(
      (item) => item.slug === projects[currentIndex]?.slug
    );
    if (activeMesh) {
      tl.to(
        activeMesh.mesh.scale,
        { x: 0, y: 0, duration: 0.3, ease: 'power2.in' },
        0.3
      );
    }

    return () => { tl.kill(); };
  }, [viewMode, getContext, currentIndex, projects, gridHandle, onTransitionComplete]);
};
