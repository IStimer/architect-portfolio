import { useRef, useCallback } from 'react';
import { useOGLRenderer } from '../../hooks/useOGLRenderer';
import { useTextureManager } from '../../hooks/useTextureManager';
import { useSliderMode } from '../../hooks/useSliderMode';
import { useInfiniteGridMode } from '../../hooks/useInfiniteGridMode';
import { useTransitionController } from '../../hooks/useTransitionController';
import { useOpeningAnimation } from '../../hooks/useOpeningAnimation';
import { useFilterDezoom } from '../../hooks/useFilterDezoom';
import type { SliderModeHandle } from '../../hooks/useSliderMode';
import type { ViewMode, ProjectData } from '../../types';
import type { SanityCategory } from '../../services/projectService';

interface OGLCanvasProps {
  active: boolean;
  viewMode: ViewMode;
  currentIndex: number;
  projects: ProjectData[];
  allProjects: ProjectData[];
  categories: SanityCategory[];
  pendingCategory: string | null;
  activeCategory: string | null;
  onIndexChange: (index: number) => void;
  onHover: (slug: string | null) => void;
  onNavigate: (slug: string) => void;
  onReveal: (slug: string) => void;
  onTransitionComplete: (target: 'slider' | 'grid') => void;
  onFilterDezoomComplete: () => void;
  openingActive?: boolean;
  onOpeningComplete?: () => void;
}

const OGLCanvas = ({
  active,
  viewMode,
  currentIndex,
  projects,
  allProjects,
  categories,
  pendingCategory,
  activeCategory,
  onIndexChange,
  onHover,
  onNavigate,
  onReveal,
  onTransitionComplete,
  onFilterDezoomComplete,
  openingActive = false,
  onOpeningComplete,
}: OGLCanvasProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const jumpToRef = useRef<((index: number) => void) | null>(null);
  const sliderHandleRef = useRef<SliderModeHandle | null>(null);
  const { getContext, ready } = useOGLRenderer(containerRef);

  const gl = ready ? getContext()?.gl ?? null : null;

  const {
    textures,
    loaded: texturesLoaded,
    markVisible,
    requestFull,
    requestHero,
    getTier,
  } = useTextureManager(gl, allProjects);

  // Opening animation
  const openingHandle = useOpeningAnimation({
    getContext,
    active: openingActive && ready,
    projects,
    textures,
    texturesLoaded,
    currentIndex,
    onComplete: onOpeningComplete ?? (() => {}),
    markVisible,
    requestFull,
  });

  // Slider stays active during filter-dezoom so useFilterDezoom can takeOwnership of its meshes
  const sliderShouldInit = ready && !openingActive && (viewMode === 'slider' || viewMode === 'transitioning-to-grid' || viewMode === 'filter-dezoom');
  const sliderActive = sliderShouldInit;
  const gridActive = active && ready && (viewMode === 'grid' || viewMode === 'transitioning-to-slider');
  const filterDezoomActive = active && ready && viewMode === 'filter-dezoom';

  // Get handoff meshes from opening animation (if available)
  const handoffSlides = openingHandle.getHandoffSlides();

  // Filter dezoom (uses sliderHandleRef — ref is populated below)
  const filterDezoomHandle = useFilterDezoom({
    getContext,
    active: filterDezoomActive,
    allProjects,
    categories,
    pendingCategory,
    activeCategory,
    textures,
    texturesLoaded,
    currentIndex,
    sliderHandleRef,
    onComplete: onFilterDezoomComplete,
    markVisible,
    requestFull,
  });

  const filterHandoffSlides = filterDezoomHandle.getHandoffSlides();

  const sliderHandle = useSliderMode({
    getContext,
    active: sliderActive,
    projects,
    textures,
    texturesLoaded,
    currentIndex,
    onIndexChange,
    onNavigate,
    onReveal,
    jumpToRef,
    markVisible,
    requestFull,
    requestHero,
    getTier,
    initialMeshes: handoffSlides ?? filterHandoffSlides ?? undefined,
  });

  // Keep ref in sync so filter dezoom can access the slider
  sliderHandleRef.current = sliderHandle;

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

  const gridScrollAnchorRef = useRef<{ x: number; y: number } | null>(null);

  const gridHandle = useInfiniteGridMode({
    getContext,
    active: gridActive,
    projects,
    textures,
    texturesLoaded,
    onHover: handleGridHover,
    onNavigate: handleGridNavigate,
    skipEnterAnimation: viewMode === 'transitioning-to-slider',
    initialScrollTo: gridScrollAnchorRef.current ?? undefined,
    markVisible,
    requestFull,
    getTier,
  });

  const transitionHandle = useTransitionController({
    getContext,
    viewMode,
    currentIndex,
    projects,
    sliderHandle,
    gridHandle,
    onTransitionComplete,
    onIndexChange,
    requestFull,
  });

  // Sync grid scroll anchor from transition controller
  const anchor = transitionHandle.getGridScrollAnchor();
  if (anchor) gridScrollAnchorRef.current = anchor;

  // Expose jumpTo for parent
  const handleJumpTo = useCallback((index: number) => {
    jumpToRef.current?.(index);
  }, []);

  const getRevealedScreenRect = useCallback(() => {
    return sliderHandle.getRevealedScreenRect();
  }, [sliderHandle]);

  // Attach to ref so parent can call it (via imperative handle pattern)
  const containerCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (node) {
        (node as any).__jumpTo = handleJumpTo;
        (node as any).__getRevealedScreenRect = getRevealedScreenRect;
      }
    },
    [handleJumpTo, getRevealedScreenRect]
  );

  return <div ref={containerCallbackRef} className="ogl-canvas" />;
};

export default OGLCanvas;
