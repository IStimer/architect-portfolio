import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { revealIn, revealOut } from '../../utils/revealText';
import type { ProjectData, ViewMode } from '../../types';
import type { SanityCategory } from '../../services/projectService';

interface SliderOverlayProps {
  active: boolean;
  revealed: boolean;
  revealComplete: boolean;
  revealBoundsRef: React.RefObject<DOMRect | null>;
  keepMinimapRef: React.MutableRefObject<boolean>;
  currentIndex: number;
  projects: ProjectData[];
  onJumpTo: (index: number) => void;
  categories: SanityCategory[];
  activeCategory: string | null;
  lang: 'fr' | 'en';
  onFilter: (slug: string | null) => void;
  viewMode: ViewMode;
  onToggleMode: () => void;
}


const SliderOverlay = ({
  active, revealed, revealComplete, revealBoundsRef, keepMinimapRef, currentIndex, projects, onJumpTo,
  categories, activeCategory, lang, onFilter,
  viewMode, onToggleMode,
}: SliderOverlayProps) => {
  // ── Refs ──
  const containerRef = useRef<HTMLDivElement>(null);

  // Category animation
  const categoryRef = useRef<HTMLSpanElement>(null);
  const prevCategoryRef = useRef(projects[currentIndex]?.category ?? '');
  const catDebounceRef = useRef<gsap.core.Tween | null>(null);
  const catHiddenRef = useRef(false);
  const catInitRef = useRef(false);

  // Minimap animation on reveal
  const minimapRef = useRef<HTMLDivElement>(null);
  const minimapShownRef = useRef(false);
  const minimapKeepVisibleRef = useRef(false);

  // Filters + toggle hide/show on reveal
  const filtersRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Title + subtitle animation on reveal
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const splitRefsRef = useRef<any[]>([]);
  const titleShownRef = useRef(false);

  // Counter digits animation (slot machine)
  const digitRefs = useRef<(HTMLSpanElement | null)[]>([null, null, null, null]);
  const prevCounterRef = useRef(String(currentIndex + 1).padStart(2, '0'));
  const activeDigitRef = useRef([0, 0]);
  const digitInitRef = useRef(false);

  const project = projects[currentIndex];
  const total = projects.length;


  // Animate opacity when active changes
  const hasEnteredRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    gsap.to(containerRef.current, {
      opacity: active ? 1 : 0,
      duration: 0.4,
      ease: 'power2.out',
    });
  }, [active]);

  // First entrance: reveal all UI elements in a single delayed block
  useEffect(() => {
    if (!active || hasEnteredRef.current) return;
    hasEnteredRef.current = true;

    gsap.delayedCall(0.5, () => {
      // Category + counter (wrapper pattern)
      ['.slider-overlay__category-wrap', '.slider-overlay__counter-wrap'].forEach((sel, i) => {
        const wrap = document.querySelector(sel) as HTMLElement | null;
        const inner = wrap?.firstElementChild as HTMLElement | null;
        if (!wrap || !inner) return;
        wrap.style.visibility = 'visible';
        gsap.fromTo(inner,
          { yPercent: 100 },
          { yPercent: 0, duration: 0.6, ease: 'power2.out', delay: i * 0.06 },
        );
      });

      // Filters (revealIn per button, same as expand/collapse)
      const filters = filtersRef.current;
      if (filters) {
        const buttons = filters.querySelectorAll('.slider-overlay__filter');
        buttons.forEach((btn, i) => {
          revealIn(btn as HTMLElement, { duration: 0.5, delay: 0.12 + i * 0.04 });
        });
      }

      // Toggle (revealIn)
      const toggle = toggleRef.current;
      if (toggle) {
        revealIn(toggle, { duration: 0.5, delay: 0.12 });
      }
    });

  }, [active]);

  // Animate category: text managed via ref, not React
  useEffect(() => {
    const el = categoryRef.current;
    if (!el || !project) return;
    const newCat = project.category ?? '';

    // First render: just set the text, no animation
    if (!catInitRef.current) {
      catInitRef.current = true;
      el.textContent = newCat;
      prevCategoryRef.current = newCat;
      return;
    }

    const catChanged = newCat !== prevCategoryRef.current;
    if (catChanged) prevCategoryRef.current = newCat;

    // Always reset debounce on any index change
    if (catDebounceRef.current) { catDebounceRef.current.kill(); catDebounceRef.current = null; }

    // Animate out only on actual category change, and only if visible
    if (catChanged && !catHiddenRef.current) {
      catHiddenRef.current = true;
      gsap.killTweensOf(el);
      gsap.to(el, { yPercent: -100, duration: 0.3, ease: 'power3.in' });
    }

    // If hidden, debounce the in — resets on every index change
    if (catHiddenRef.current) {
      catDebounceRef.current = gsap.delayedCall(0.4, () => {
        gsap.killTweensOf(el);
        el.textContent = prevCategoryRef.current;
        gsap.set(el, { yPercent: 100 });
        gsap.to(el, {
          yPercent: 0,
          duration: 0.5,
          ease: 'power2.out',
          onComplete: () => { catHiddenRef.current = false; },
        });
      });
    }
  }, [currentIndex, project]);

  // Filters, toggle, minimap — single coordinated effect on revealed
  const filtersSplitRef = useRef<any[]>([]);
  const toggleSplitRef = useRef<any[]>([]);
  const collapseTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const wasRevealedRef = useRef(false);

  // REVEAL → filters/toggle out, minimap in (on revealComplete)
  useEffect(() => {
    const filters = filtersRef.current;
    const toggle = toggleRef.current;
    if (!filters || !toggle || !revealed) return;

    // Skip if already hidden (e.g. minimap/arrow navigation between reveals)
    if (filters.style.pointerEvents === 'none') return;

    if (collapseTimelineRef.current) { collapseTimelineRef.current.kill(); collapseTimelineRef.current = null; }

    filtersSplitRef.current.forEach((s) => s.revert());
    toggleSplitRef.current.forEach((s) => s.revert());
    filtersSplitRef.current = [];
    toggleSplitRef.current = [];

    const buttons = filters.querySelectorAll('.slider-overlay__filter');
    buttons.forEach((btn, i) => {
      gsap.delayedCall(i * 0.04, () => {
        const { split } = revealOut(btn as HTMLElement, { duration: 0.3 });
        filtersSplitRef.current.push(split);
      });
    });
    filters.style.pointerEvents = 'none';

    const { split: s2 } = revealOut(toggle, { duration: 0.3 });
    toggleSplitRef.current = [s2];
    toggle.style.pointerEvents = 'none';
  }, [revealed]);

  // Minimap IN on revealComplete
  useEffect(() => {
    const el = minimapRef.current;
    if (!el || !revealComplete || minimapShownRef.current) return;
    minimapShownRef.current = true;

    const thumbs = el.querySelectorAll('.slider-overlay__thumb');
    if (!thumbs.length) return;
    gsap.killTweensOf(thumbs);
    el.style.visibility = 'visible';
    el.style.pointerEvents = 'auto';
    gsap.set(thumbs, { xPercent: 100 });
    gsap.to(thumbs, { xPercent: 0, duration: 0.4, ease: 'power3.out', stagger: 0.03 });
  }, [revealComplete]);

  // COLLAPSE → timeline: minimap out THEN filters/toggle in
  useEffect(() => {
    const filters = filtersRef.current;
    const toggle = toggleRef.current;
    const minimap = minimapRef.current;
    const wasRevealed = wasRevealedRef.current;
    wasRevealedRef.current = revealed;

    // Only fire on true → false transition, not on initial false
    if (revealed || !wasRevealed || !filters || !toggle) return;

    if (collapseTimelineRef.current) { collapseTimelineRef.current.kill(); collapseTimelineRef.current = null; }

    const tl = gsap.timeline();
    collapseTimelineRef.current = tl;

    // Step 1: minimap out (skip if triggered by minimap click or arrow keys)
    const keepMinimap = minimapKeepVisibleRef.current || keepMinimapRef.current;
    keepMinimapRef.current = false;
    if (minimapShownRef.current && minimap && !keepMinimap) {
      minimapShownRef.current = false;
      const thumbs = minimap.querySelectorAll('.slider-overlay__thumb');
      if (thumbs.length) {
        gsap.killTweensOf(thumbs);
        tl.to(thumbs, {
          xPercent: 100,
          duration: 0.25,
          ease: 'power3.in',
          stagger: 0.02,
          onComplete: () => {
            minimap.style.visibility = 'hidden';
            minimap.style.pointerEvents = 'none';
          },
        });
      }
    }
    minimapKeepVisibleRef.current = false;

    // Step 2: filters + toggle in (skip if minimap stays visible — we're switching slides)
    if (keepMinimap) return;

    tl.call(() => {
      filtersSplitRef.current.forEach((s) => s.revert());
      toggleSplitRef.current.forEach((s) => s.revert());
      filtersSplitRef.current = [];
      toggleSplitRef.current = [];

      filters.style.pointerEvents = 'auto';
      toggle.style.pointerEvents = 'auto';

      const buttons = filters.querySelectorAll('.slider-overlay__filter');
      buttons.forEach((btn, i) => {
        const { split } = revealIn(btn as HTMLElement, { duration: 0.4, delay: i * 0.04 });
        filtersSplitRef.current.push(split);
      });

      const { split: s2 } = revealIn(toggle, { duration: 0.4 });
      toggleSplitRef.current = [s2];
    });
  }, [revealed]);

  // Position title/subtitle relative to reveal bounds
  // Only update while revealed — freeze positions during out animation
  useEffect(() => {
    if (!revealed) return;
    let raf: number;
    const update = () => {
      const b = revealBoundsRef.current;
      const tw = titleRef.current;
      const sw = subtitleRef.current;
      if (b && tw && sw) {
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

  // Title + subtitle IN: when reveal animation completes
  useEffect(() => {
    const titleEl = titleRef.current;
    const subEl = subtitleRef.current;
    if (!titleEl || !subEl || !revealComplete || !project || titleShownRef.current) return;

    titleShownRef.current = true;
    splitRefsRef.current.forEach((s) => s.revert());
    splitRefsRef.current = [];

    // Set text content via ref (React doesn't touch these elements)
    titleEl.textContent = project.title;
    subEl.textContent = project.subtitle ?? '';

    const { split: s1 } = revealIn(titleEl, { duration: 0.6 });
    const { split: s2 } = revealIn(subEl, { duration: 0.6, delay: 0.1 });
    splitRefsRef.current = [s1, s2];
  }, [revealComplete]);

  // Title + subtitle OUT: when revealed goes false
  useEffect(() => {
    const titleEl = titleRef.current;
    const subEl = subtitleRef.current;
    if (!titleEl || !subEl) return;

    if (!revealed && titleShownRef.current) {
      titleShownRef.current = false;
      splitRefsRef.current.forEach((s) => s.revert());
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
  }, [revealed]);

  // Animate counter digits: slot machine, text managed via refs (not React)
  useEffect(() => {
    // Init: set text on first render
    if (!digitInitRef.current) {
      digitInitRef.current = true;
      const initVal = String(currentIndex + 1).padStart(2, '0');
      for (let i = 0; i < 2; i++) {
        const el = digitRefs.current[i * 2]; // child 0 is active initially
        if (el) el.textContent = initVal[i];
        const other = digitRefs.current[i * 2 + 1];
        if (other) gsap.set(other, { yPercent: 100 }); // park offscreen
      }
      return;
    }

    const newVal = String(currentIndex + 1).padStart(2, '0');
    const oldVal = prevCounterRef.current;
    prevCounterRef.current = newVal;

    for (let i = 0; i < 2; i++) {
      if (oldVal[i] === newVal[i]) continue;

      const activeIdx = activeDigitRef.current[i];
      const going = digitRefs.current[i * 2 + activeIdx];
      const coming = digitRefs.current[i * 2 + (1 - activeIdx)];
      if (!going || !coming) continue;

      // Swap active
      activeDigitRef.current[i] = 1 - activeIdx;

      gsap.killTweensOf(going);
      gsap.killTweensOf(coming);

      // Snap going to visible so a digit is always shown at the start
      gsap.set(going, { yPercent: 0 });
      gsap.set(coming, { yPercent: 100 });

      const dur = 0.2;
      const ease = 'power2.inOut';
      gsap.to(going, { yPercent: -100, duration: dur, ease });

      coming.textContent = newVal[i];
      gsap.to(coming, { yPercent: 0, duration: dur, ease });
    }
  }, [currentIndex]);

  if (!project) return null;

  return (
    <div
      ref={containerRef}
      className="slider-overlay"
      // Start visible if active is already true (projects loaded after intro)
      style={{ opacity: active ? 1 : 0 }}
    >
      <div className="slider-overlay__center">
        <div className="slider-overlay__crosshair" />

        <div className="slider-overlay__category-wrap">
          <span className="slider-overlay__category">
            <span ref={categoryRef} />
          </span>
        </div>

        <div className="slider-overlay__counter-wrap">
          <span className="slider-overlay__counter">
            <span className="slider-overlay__digit">
              <span ref={el => { digitRefs.current[0] = el; }} />
              <span ref={el => { digitRefs.current[1] = el; }} />
            </span>
            <span className="slider-overlay__digit">
              <span ref={el => { digitRefs.current[2] = el; }} />
              <span ref={el => { digitRefs.current[3] = el; }} />
            </span>
            {' / '}
            {String(total).padStart(2, '0')}
          </span>
        </div>

        {categories.length > 0 && (
          <nav ref={filtersRef} className="slider-overlay__filters">
            <button
              className={`slider-overlay__filter${activeCategory === null ? ' slider-overlay__filter--active' : ''}`}
              onClick={() => onFilter(null)}
            >
              {lang === 'fr' ? 'Tous' : 'All'}
            </button>
            {categories.map((cat) => (
              <button
                key={cat._id}
                className={`slider-overlay__filter${activeCategory === cat.slug ? ' slider-overlay__filter--active' : ''}`}
                onClick={() => onFilter(cat.slug)}
              >
                {cat.title[lang] ?? cat.title.fr}
              </button>
            ))}
          </nav>
        )}

        <h2 ref={titleRef} className="slider-overlay__title" />
        <p ref={subtitleRef} className="slider-overlay__subtitle" />

        <button
          ref={toggleRef}
          className="slider-overlay__mode-toggle"
          onClick={onToggleMode}
          disabled={viewMode.startsWith('transitioning')}
        >
          <span className={viewMode === 'slider' || viewMode === 'transitioning-to-grid' ? 'is-active' : ''}>
            Slider
          </span>
          <span className="slider-overlay__mode-divider">/</span>
          <span className={viewMode === 'grid' || viewMode === 'transitioning-to-slider' ? 'is-active' : ''}>
            Grid
          </span>
        </button>
      </div>

      <div ref={minimapRef} className="slider-overlay__minimap">
        <div className="slider-overlay__minimap-track">
            {projects.map((p, i) => (
              <button
                key={p.slug}
                className={`slider-overlay__thumb${i === currentIndex ? ' slider-overlay__thumb--active' : ''}`}
                onClick={() => { minimapKeepVisibleRef.current = true; onJumpTo(i); }}
                aria-label={p.title}
              >
                {p.heroImage && (
                  <img
                    src={p.thumbnailUrl ?? p.heroImage}
                    alt={p.title}
                    loading="lazy"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
    </div>
  );
};

export default SliderOverlay;
