import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppState } from '../contexts/AppStateContext';
import { useLocalizedNavigate } from '../hooks/useLocalizedNavigate';
import IntroAnimation from '../components/IntroAnimation';
import SEO from '../components/SEO';
import OGLCanvas from '../components/home/OGLCanvas';
import SliderOverlay from '../components/home/SliderOverlay';
import GridOverlay from '../components/home/GridOverlay';
import ModeToggle from '../components/home/ModeToggle';
import { lenisService } from '../services/lenisService';
import { localizedPath } from '../i18n/routes';
import type { ViewMode } from '../types';
import '../styles/pages/Home.scss';

const Home = () => {
  const { t } = useTranslation(['home', 'common']);
  const { navigateTo, currentLang } = useLocalizedNavigate();
  const { state, setIntroCompleted } = useAppState();

  const [viewMode, setViewMode] = useState<ViewMode>('slider');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);

  const showIntro = !state.introCompleted;
  const canvasActive = !showIntro;

  const handleUnlock = useCallback(() => {
    setIntroCompleted();
  }, [setIntroCompleted]);

  // Stop Lenis on mount, start on unmount
  useEffect(() => {
    lenisService.stop();
    return () => {
      lenisService.start();
    };
  }, []);

  const handleToggleMode = useCallback(() => {
    setViewMode((prev) => {
      if (prev === 'slider') return 'transitioning-to-grid';
      if (prev === 'grid') return 'transitioning-to-slider';
      return prev; // ignore during transition
    });
    setHoveredSlug(null);
  }, []);

  const handleTransitionComplete = useCallback((target: 'slider' | 'grid') => {
    setViewMode(target);
  }, []);

  const handleIndexChange = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const handleHover = useCallback((slug: string | null) => {
    setHoveredSlug(slug);
  }, []);

  const handleNavigate = useCallback(
    (slug: string) => {
      navigateTo('project', { slug });
    },
    [navigateTo]
  );

  const handleJumpTo = useCallback((index: number) => {
    // Access the canvas element's jumpTo function
    const canvasEl = document.querySelector('.ogl-canvas') as any;
    if (canvasEl?.__jumpTo) {
      canvasEl.__jumpTo(index);
    }
    setCurrentIndex(index);
  }, []);

  const isSliderVisible = viewMode === 'slider' || viewMode === 'transitioning-to-grid';
  const isGridVisible = viewMode === 'grid' || viewMode === 'transitioning-to-slider';

  return (
    <>
      <SEO
        title={t('home:seo.title')}
        description={t('home:seo.description')}
        path={localizedPath(currentLang, 'home')}
      />
      {showIntro && <IntroAnimation onUnlock={handleUnlock} />}

      <main className={`page-content home-page${showIntro ? ' home-page--hidden' : ''}`}>
        <OGLCanvas
          active={canvasActive}
          viewMode={viewMode}
          currentIndex={currentIndex}
          onIndexChange={handleIndexChange}
          onHover={handleHover}
          onNavigate={handleNavigate}
          onTransitionComplete={handleTransitionComplete}
        />

        <SliderOverlay
          active={canvasActive && isSliderVisible}
          currentIndex={currentIndex}
          onJumpTo={handleJumpTo}
        />

        <GridOverlay
          active={canvasActive && isGridVisible}
          hoveredSlug={hoveredSlug}
        />

        <ModeToggle viewMode={viewMode} onToggle={handleToggleMode} />

        <footer className="home-page__footer">
          <button
            className="home-page__footer-link cursor-target"
            onClick={() => navigateTo('about')}
          >
            About
          </button>
        </footer>
      </main>
    </>
  );
};

export default Home;
