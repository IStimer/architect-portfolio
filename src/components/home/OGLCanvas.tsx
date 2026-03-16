import { useRef, useCallback } from 'react';
import { useOGLRenderer } from '../../hooks/useOGLRenderer';
import { useTextureLoader } from '../../hooks/useTextureLoader';
import { useSliderMode } from '../../hooks/useSliderMode';
import { useInfiniteGridMode } from '../../hooks/useInfiniteGridMode';
import { useTransitionController } from '../../hooks/useTransitionController';
import { projectsData } from '../../data/projectsData';
import type { ViewMode } from '../../types';

interface OGLCanvasProps {
  active: boolean;
  viewMode: ViewMode;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onHover: (slug: string | null) => void;
  onNavigate: (slug: string) => void;
  onJumpTo?: (index: number) => void;
  onTransitionComplete: (target: 'slider' | 'grid') => void;
}

const OGLCanvas = ({
  active,
  viewMode,
  currentIndex,
  onIndexChange,
  onHover,
  onNavigate,
  onTransitionComplete,
}: OGLCanvasProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const jumpToRef = useRef<((index: number) => void) | null>(null);
  const { getContext, ready } = useOGLRenderer(containerRef);

  const gl = ready ? getContext()?.gl ?? null : null;

  const { textures, loaded: texturesLoaded } = useTextureLoader(
    gl,
    projectsData
  );

  const sliderActive = active && ready && (viewMode === 'slider' || viewMode === 'transitioning-to-grid');
  const gridActive = active && ready && (viewMode === 'grid' || viewMode === 'transitioning-to-slider');

  const sliderHandle = useSliderMode({
    getContext,
    active: sliderActive,
    projects: projectsData,
    textures,
    texturesLoaded,
    currentIndex,
    onIndexChange,
    jumpToRef,
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
    projects: projectsData,
    textures,
    texturesLoaded,
    onHover: handleGridHover,
    onNavigate: handleGridNavigate,
    skipEnterAnimation: viewMode === 'transitioning-to-slider',
  });

  useTransitionController({
    getContext,
    viewMode,
    currentIndex,
    projects: projectsData,
    sliderHandle,
    gridHandle,
    onTransitionComplete,
  });

  // Expose jumpTo for parent
  const handleJumpTo = useCallback((index: number) => {
    jumpToRef.current?.(index);
  }, []);

  // Attach to ref so parent can call it (via imperative handle pattern)
  // We store it on the container's dataset for simplicity
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
