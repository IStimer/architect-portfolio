import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppState } from '../contexts/AppStateContext';
import { useLocalizedNavigate } from '../hooks/useLocalizedNavigate';
import { useProjects } from '../hooks/useProjects';
import IntroAnimation from '../components/IntroAnimation';
import SEO from '../components/SEO';
import OGLCanvas from '../components/home/OGLCanvas';
import SliderOverlay from '../components/home/SliderOverlay';
import GridOverlay from '../components/home/GridOverlay';
import { gsap } from 'gsap';
import { lenisService } from '../services/lenisService';
import { startHeroTransition, getTransitionDirection, finishReverseTransition } from '../services/heroTransition';
import { preloadProjectChunk } from '../hooks/usePageTransition';
import { localizedPath } from '../i18n/routes';
import type { ViewMode } from '../types';
import '../styles/pages/Home.scss';

const Home = () => {
  const { t } = useTranslation(['home', 'common']);
  const { navigateTo, currentLang } = useLocalizedNavigate();
  const { state, setIntroCompleted } = useAppState();
  const { projects, categories } = useProjects(currentLang as 'fr' | 'en');

  const [viewMode, setViewMode] = useState<ViewMode>(
    state.introCompleted ? 'slider' : 'opening'
  );
  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = sessionStorage.getItem('sliderIndex');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [openingActive, setOpeningActive] = useState(false);
  const [showIntroOverlay, setShowIntroOverlay] = useState(!state.introCompleted);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isRevealComplete, setIsRevealComplete] = useState(false);
  const revealBoundsRef = useRef<DOMRect | null>(null);

  const showIntro = showIntroOverlay;
  const canvasActive = !showIntro || openingActive;

  // Prefetch Project page chunk on idle so first navigation is instant
  useEffect(() => { preloadProjectChunk(); }, []);

  // Filter projects by active category
  const filteredProjects = useMemo(() => {
    if (!activeCategory) return projects;
    return projects.filter((p) => p.categorySlug === activeCategory);
  }, [projects, activeCategory]);

  // Finish reverse transition (Project → Home) when neighbor textures are ready
  useEffect(() => {
    if (getTransitionDirection() !== 'reverse') return;

    const POLL_INTERVAL = 50;
    const TIMEOUT = 2000;
    const startTime = Date.now();

    const checkReady = () => {
      const wrapperEl = document.querySelector('.ogl-canvas') as any;
      const getTierFn = wrapperEl?.__getTier as ((slug: string) => number) | undefined;

      if (!getTierFn) {
        if (Date.now() - startTime < TIMEOUT) {
          timer = window.setTimeout(checkReady, POLL_INTERVAL);
        } else {
          finishReverseTransition();
        }
        return;
      }

      const idx = currentIndex;
      const len = filteredProjects.length;
      const slugs = [
        filteredProjects[idx]?.slug,
        filteredProjects[(idx - 1 + len) % len]?.slug,
        filteredProjects[(idx + 1) % len]?.slug,
      ].filter(Boolean);

      const THUMBNAIL = 2;
      const allReady = slugs.every(s => getTierFn(s!) >= THUMBNAIL);

      if (allReady || Date.now() - startTime >= TIMEOUT) {
        finishReverseTransition();
      } else {
        timer = window.setTimeout(checkReady, POLL_INTERVAL);
      }
    };

    let timer = window.setTimeout(checkReady, POLL_INTERVAL);
    return () => clearTimeout(timer);
  }, [currentIndex, filteredProjects]);

  const handleUnlock = useCallback(() => {
    setIntroCompleted();
    setViewMode('opening');
    setOpeningActive(true);
    // Fade out intro text overlay after a short delay
    setTimeout(() => setShowIntroOverlay(false), 1000);
  }, [setIntroCompleted]);

  const handleOpeningComplete = useCallback(() => {
    setOpeningActive(false);
    setViewMode('slider');
  }, []);

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
      return prev; // ignore during transition or opening
    });
    setHoveredSlug(null);
  }, []);

  const keepMinimapRef = useRef(false);

  const handleRevealChange = useCallback((revealed: boolean, complete: boolean, keepMinimap?: boolean) => {
    setIsRevealed(revealed);
    setIsRevealComplete(revealed && complete);
    if (keepMinimap) keepMinimapRef.current = true;
  }, []);

  const handleTransitionComplete = useCallback((target: 'slider' | 'grid') => {
    setViewMode(target);
  }, []);

  const handleIndexChange = useCallback((index: number) => {
    setCurrentIndex(index);
    sessionStorage.setItem('sliderIndex', String(index));
  }, []);

  const handleHover = useCallback((slug: string | null) => {
    setHoveredSlug(slug);
  }, []);

  const handleNavigate = useCallback(
    (slug: string) => {
      const project = filteredProjects.find(p => p.slug === slug);
      const canvasEl = document.querySelector('.ogl-canvas') as any;
      const rect = canvasEl?.__getRevealedScreenRect?.() as DOMRect | null;
      const imageUrl = project?.heroImage;

      if (imageUrl && rect) {
        // Trigger UI out animations in parallel with the morph
        setIsRevealed(false);
        setIsRevealComplete(false);

        // Animate out elements not handled by the reveal effects
        const crosshair = document.querySelector('.slider-overlay__crosshair') as HTMLElement | null;
        const catWrap = document.querySelector('.slider-overlay__category-wrap') as HTMLElement | null;
        const counterWrap = document.querySelector('.slider-overlay__counter-wrap') as HTMLElement | null;
        const catInner = catWrap?.firstElementChild as HTMLElement | null;
        const counterInner = counterWrap?.firstElementChild as HTMLElement | null;

        if (crosshair) gsap.to(crosshair, { opacity: 0, duration: 0.3, ease: 'power2.in' });
        if (catInner) gsap.to(catInner, { yPercent: 100, duration: 0.3, ease: 'power3.in' });
        if (counterInner) gsap.to(counterInner, { yPercent: 100, duration: 0.3, ease: 'power3.in' });

        // Collect neighbor thumbnail URLs for reverse transition
        const idx = filteredProjects.findIndex(p => p.slug === slug);
        const len = filteredProjects.length;
        const prevProject = filteredProjects[(idx - 1 + len) % len];
        const nextProject = filteredProjects[(idx + 1) % len];
        const neighborUrls = [
          prevProject?.thumbnailUrl ?? prevProject?.heroImage ?? '',
          nextProject?.thumbnailUrl ?? nextProject?.heroImage ?? '',
        ];

        startHeroTransition({ imageUrl, rect }, () => {
          navigateTo('project', { slug });
        }, neighborUrls);
      } else {
        navigateTo('project', { slug });
      }
    },
    [navigateTo, filteredProjects]
  );

  const handleJumpTo = useCallback((index: number) => {
    const canvasEl = document.querySelector('.ogl-canvas') as any;
    if (canvasEl?.__selectSlide) {
      canvasEl.__selectSlide(index);
    }
    setCurrentIndex(index);
  }, []);

  const handleCategoryFilter = useCallback((slug: string | null) => {
    if (viewMode === 'slider' && (slug !== activeCategory)) {
      // Trigger animated transition: unfiltered→filter, filter→filter, or filter→All
      setPendingCategory(slug);
      setViewMode('filter-dezoom');
    }
  }, [viewMode, activeCategory]);

  const handleFilterDezoomComplete = useCallback(() => {
    setActiveCategory(pendingCategory);
    setPendingCategory(null);
    setCurrentIndex(0);
    setViewMode('slider');
  }, [pendingCategory]);

  const isSliderVisible = viewMode === 'slider' || viewMode === 'transitioning-to-grid';
  const isGridVisible = viewMode === 'grid' || viewMode === 'transitioning-to-slider';
  const isOpening = viewMode === 'opening';
  const isFilterDezoom = viewMode === 'filter-dezoom';

  return (
    <>
      <SEO
        title={t('home:seo.title')}
        description={t('home:seo.description')}
        path={localizedPath(currentLang, 'home')}
      />
      {showIntroOverlay && (
        <IntroAnimation
          onUnlock={handleUnlock}
          exiting={openingActive}
        />
      )}

      <main className={`page-content home-page${showIntro && !openingActive ? ' home-page--hidden' : ''}`}>
        <OGLCanvas
          active={canvasActive}
          viewMode={viewMode}
          currentIndex={currentIndex}
          projects={filteredProjects}
          allProjects={projects}
          categories={categories}
          pendingCategory={pendingCategory}
          activeCategory={activeCategory}
          onIndexChange={handleIndexChange}
          onHover={handleHover}
          onNavigate={handleNavigate}
          onRevealChange={handleRevealChange}
          revealBoundsRef={revealBoundsRef}
          onTransitionComplete={handleTransitionComplete}
          onFilterDezoomComplete={handleFilterDezoomComplete}
          openingActive={openingActive}
          onOpeningComplete={handleOpeningComplete}
        />

        {!isOpening && (
          <>
            <SliderOverlay
              active={canvasActive && isSliderVisible && !isFilterDezoom}
              revealed={isRevealed}
              revealComplete={isRevealComplete}
              revealBoundsRef={revealBoundsRef}
              keepMinimapRef={keepMinimapRef}
              currentIndex={currentIndex}
              projects={filteredProjects}
              onJumpTo={handleJumpTo}
              categories={categories}
              activeCategory={activeCategory}
              lang={currentLang as 'fr' | 'en'}
              onFilter={handleCategoryFilter}
              viewMode={viewMode}
              onToggleMode={handleToggleMode}
            />


            <GridOverlay
              active={canvasActive && isGridVisible && !isFilterDezoom}
              hoveredSlug={hoveredSlug}
              projects={filteredProjects}
            />
          </>
        )}

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
