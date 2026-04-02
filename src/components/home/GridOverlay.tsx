import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { revealIn, revealOut } from '../../utils/revealText';
import type { ProjectData, ViewMode } from '../../types';
import type { SanityCategory } from '../../services/projectService';

interface GridOverlayProps {
  active: boolean;
  projects: ProjectData[];
  categories: SanityCategory[];
  activeCategory: string | null;
  lang: 'fr' | 'en';
  onFilter: (slug: string | null) => void;
  viewMode: ViewMode;
  revealed: boolean;
  revealComplete: boolean;
  revealBoundsRef: React.RefObject<DOMRect | null>;
  revealedSlug: string | null;
}

const GridOverlay = ({
  active, projects,
  categories, activeCategory, lang, onFilter,
  viewMode,
  revealed, revealComplete, revealBoundsRef, revealedSlug,
}: GridOverlayProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLElement>(null);
  const hasEnteredRef = useRef(false);

  // Title + subtitle refs for reveal
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const splitRefsRef = useRef<any[]>([]);
  const titleShownRef = useRef(false);
  const wasRevealedRef = useRef(false);

  const revealedProject = revealedSlug
    ? projects.find((p) => p.slug === revealedSlug)
    : null;

  // Fade in/out container
  useEffect(() => {
    if (!containerRef.current) return;
    gsap.to(containerRef.current, {
      opacity: active ? 1 : 0,
      duration: 0.4,
      ease: 'power2.out',
    });

    if (!active) {
      hasEnteredRef.current = false;
      if (filtersRef.current) {
        const btns = filtersRef.current.querySelectorAll('.grid-overlay__filter');
        btns.forEach((btn) => { (btn as HTMLElement).style.visibility = 'hidden'; });
      }
    }
  }, [active]);

  // Entrance animations — only when viewMode settles to 'grid'
  useEffect(() => {
    if (viewMode !== 'grid' || hasEnteredRef.current) return;
    hasEnteredRef.current = true;

    gsap.delayedCall(0.15, () => {
      if (filtersRef.current) {
        const btns = filtersRef.current.querySelectorAll('.grid-overlay__filter');
        btns.forEach((btn, i) => {
          revealIn(btn as HTMLElement, { duration: 0.6, delay: i * 0.04 });
        });
      }
    });
  }, [viewMode]);

  // Transition to slider: animate out filters
  useEffect(() => {
    if (viewMode !== 'transitioning-to-slider') return;
    if (filtersRef.current) {
      const btns = filtersRef.current.querySelectorAll('.grid-overlay__filter');
      btns.forEach((btn, i) => {
        gsap.delayedCall(i * 0.03, () => {
          revealOut(btn as HTMLElement, { duration: 0.3 });
        });
      });
    }
  }, [viewMode]);

  // ── REVEAL: hide filters + crosshair, toggle ──
  useEffect(() => {
    if (!revealed) return;
    const filters = filtersRef.current;
    if (filters) {
      const btns = filters.querySelectorAll('.grid-overlay__filter');
      btns.forEach((btn, i) => {
        gsap.delayedCall(i * 0.04, () => {
          revealOut(btn as HTMLElement, { duration: 0.3 });
        });
      });
      filters.style.pointerEvents = 'none';
    }

    // Hide crosshairs
    const crosshairs = containerRef.current?.querySelectorAll('.grid-overlay__crosshair');
    crosshairs?.forEach(el => gsap.to(el, { opacity: 0, duration: 0.3, ease: 'power2.in' }));

    // Hide toggle
    const toggle = document.querySelector('.home-page__mode-toggle') as HTMLElement | null;
    if (toggle) {
      revealOut(toggle, { duration: 0.3 });
      toggle.style.pointerEvents = 'none';
    }
  }, [revealed]);

  // ── REVEAL COMPLETE: show title + subtitle ──
  useEffect(() => {
    const titleEl = titleRef.current;
    const subEl = subtitleRef.current;
    if (!titleEl || !subEl || !revealComplete || !revealedProject || titleShownRef.current) return;

    titleShownRef.current = true;
    splitRefsRef.current.forEach(s => s.revert());
    splitRefsRef.current = [];

    titleEl.textContent = revealedProject.title;
    subEl.textContent = revealedProject.subtitle ?? '';

    const { split: s1 } = revealIn(titleEl, { duration: 0.6 });
    const { split: s2 } = revealIn(subEl, { duration: 0.6, delay: 0.1 });
    splitRefsRef.current = [s1, s2];
  }, [revealComplete, revealedProject]);

  // ── Position title + subtitle relative to reveal bounds ──
  useEffect(() => {
    if (!revealed) return;
    let raf: number;
    let lastX = 0, lastY = 0, lastW = 0, lastH = 0;
    const update = () => {
      const b = revealBoundsRef.current;
      const tw = titleRef.current;
      const sw = subtitleRef.current;
      if (b && tw && sw && (b.x !== lastX || b.y !== lastY || b.width !== lastW || b.height !== lastH)) {
        lastX = b.x; lastY = b.y; lastW = b.width; lastH = b.height;
        tw.style.left = `${b.x}px`;
        tw.style.bottom = `${window.innerHeight - b.y + 8}px`;
        sw.style.right = `${window.innerWidth - b.x - b.width}px`;
        sw.style.top = `${b.y + b.height + 8}px`;
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [revealed, revealBoundsRef]);

  // ── COLLAPSE: title/subtitle out, filters + crosshair back ──
  useEffect(() => {
    const titleEl = titleRef.current;
    const subEl = subtitleRef.current;
    const wasRevealed = wasRevealedRef.current;
    wasRevealedRef.current = revealed;

    if (revealed || !wasRevealed) return;

    // Title + subtitle out
    if (titleEl && subEl && titleShownRef.current) {
      titleShownRef.current = false;
      splitRefsRef.current.forEach(s => s.revert());
      splitRefsRef.current = [];

      const { split: s1 } = revealOut(titleEl, {
        duration: 0.3,
        onComplete: () => { titleEl.style.visibility = 'hidden'; },
      });
      const { split: s2 } = revealOut(subEl, {
        duration: 0.3,
        onComplete: () => { subEl.style.visibility = 'hidden'; },
      });
      splitRefsRef.current = [s1, s2];
    }

    // Filters back
    const filters = filtersRef.current;
    if (filters) {
      filters.style.pointerEvents = 'auto';
      const btns = filters.querySelectorAll('.grid-overlay__filter');
      btns.forEach((btn, i) => {
        revealIn(btn as HTMLElement, { duration: 0.4, delay: 0.15 + i * 0.04 });
      });
    }

    // Crosshairs back
    const crosshairs = containerRef.current?.querySelectorAll('.grid-overlay__crosshair');
    crosshairs?.forEach(el => gsap.to(el, { opacity: 1, duration: 0.4, delay: 0.15, ease: 'power2.out' }));

    // Toggle back
    const toggle = document.querySelector('.home-page__mode-toggle') as HTMLElement | null;
    if (toggle) {
      toggle.style.pointerEvents = '';
      revealIn(toggle, { duration: 0.4, delay: 0.15 });
    }
  }, [revealed]);

  return (
    <div ref={containerRef} className="grid-overlay" style={{ opacity: active ? 1 : 0 }}>
      <div className="grid-overlay__crosshair grid-overlay__crosshair--h" />
      <div className="grid-overlay__crosshair grid-overlay__crosshair--v" />

      <h2 ref={titleRef} className="grid-overlay__reveal-title" />
      <p ref={subtitleRef} className="grid-overlay__reveal-subtitle" />

      {categories.length > 0 && (
        <nav ref={filtersRef} className="grid-overlay__filters">
          <button
            className={`grid-overlay__filter${activeCategory === null ? ' grid-overlay__filter--active' : ''}`}
            style={{ visibility: 'hidden' }}
            onClick={() => onFilter(null)}
          >
            {lang === 'fr' ? 'Tous' : 'All'}
          </button>
          {categories.map((cat) => (
            <button
              key={cat._id}
              className={`grid-overlay__filter${activeCategory === cat.slug ? ' grid-overlay__filter--active' : ''}`}
              style={{ visibility: 'hidden' }}
              onClick={() => onFilter(cat.slug)}
            >
              {cat.title[lang] ?? cat.title.fr}
            </button>
          ))}
        </nav>
      )}

    </div>
  );
};

export default GridOverlay;
