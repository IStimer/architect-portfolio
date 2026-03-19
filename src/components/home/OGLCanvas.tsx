import { useRef, useCallback } from 'react';
import { useOGLRenderer } from '../../hooks/useOGLRenderer';
import { useTextureManager } from '../../hooks/useTextureManager';
import { useSliderMode } from '../../hooks/useSliderMode';
import { useInfiniteGridMode } from '../../hooks/useInfiniteGridMode';
import { useTransitionController } from '../../hooks/useTransitionController';
import { useOpeningAnimation } from '../../hooks/useOpeningAnimation';
import type { ViewMode, ProjectData } from '../../types';

interface OGLCanvasProps {
  active: boolean;
  viewMode: ViewMode;
  currentIndex: number;
  projects: ProjectData[];
  onIndexChange: (index: number) => void;
  onHover: (slug: string | null) => void;
  onNavigate: (slug: string) => void;
  onTransitionComplete: (target: 'slider' | 'grid') => void;
  openingActive?: boolean;
  onOpeningComplete?: () => void;
}

const OGLCanvas = ({
  active,
  viewMode,
  currentIndex,
  projects,
  onIndexChange,
  onHover,
  onNavigate,
  onTransitionComplete,
  openingActive = false,
  onOpeningComplete,
}: OGLCanvasProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const jumpToRef = useRef<((index: number) => void) | null>(null);
  const { getContext, ready } = useOGLRenderer(containerRef);

  const gl = ready ? getContext()?.gl ?? null : null;

  const {
    textures,
    loaded: texturesLoaded,
    markVisible,
    requestFull,
    getTier,
  } = useTextureManager(gl, projects);

  // Opening animation
  const openingHandle = useOpeningAnimation({
    getContext,
    active: openingActive && ready,
    projects,
    textures,
    texturesLoaded,
    onComplete: onOpeningComplete ?? (() => {}),
    markVisible,
  });

  // Slider should not init during opening animation
  const sliderShouldInit = ready && !openingActive && (viewMode === 'slider' || viewMode === 'transitioning-to-grid');
  const sliderActive = sliderShouldInit;
  const gridActive = active && ready && (viewMode === 'grid' || viewMode === 'transitioning-to-slider');

  // Get handoff meshes from opening animation (if available)
  const handoffSlides = openingHandle.getHandoffSlides();

  const sliderHandle = useSliderMode({
    getContext,
    active: sliderActive,
    projects,
    textures,
    texturesLoaded,
    currentIndex,
    onIndexChange,
    jumpToRef,
    markVisible,
    requestFull,
    getTier,
    initialMeshes: handoffSlides ?? undefined,
  });

  const handleGridHover = useCallback(
    (slug: string | null) => {
      onHover(slug);
    },
    [onHover]
  );

  const handleGridNavigate = useCallback(
    (slug: string) => {
      onNavigate(slug);
    },
    [onNavigate]
  );

  const gridHandle = useInfiniteGridMode({
    getContext,
    active: gridActive,
    projects,
    textures,
    texturesLoaded,
    onHover: handleGridHover,
    onNavigate: handleGridNavigate,
    skipEnterAnimation: viewMode === 'transitioning-to-slider',
    markVisible,
    requestFull,
    getTier,
  });

  useTransitionController({
    getContext,
    viewMode,
    currentIndex,
    projects,
    sliderHandle,
    gridHandle,
    onTransitionComplete,
    onIndexChange,
  });

  // Expose jumpTo for parent
  const handleJumpTo = useCallback((index: number) => {
    jumpToRef.current?.(index);
  }, []);

  // Attach to ref so parent can call it (via imperative handle pattern)
  const containerCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (node) {
        (node as any).__jumpTo = handleJumpTo;
      }
    },
    [handleJumpTo]
  );

  return <div ref={containerCallbackRef} className="ogl-canvas" />;
};

export default OGLCanvas;
