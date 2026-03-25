import { useEffect, useRef, useMemo } from 'react';
import { gsap } from 'gsap';
import type { ProjectData, ViewMode } from '../../types';
import type { SanityCategory } from '../../services/projectService';

interface SliderOverlayProps {
  active: boolean;
  revealed: boolean;
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

const VISIBLE_THUMBS = 15;
const HALF_VISIBLE = Math.floor(VISIBLE_THUMBS / 2);

const SliderOverlay = ({
  active, revealed, currentIndex, projects, onJumpTo,
  categories, activeCategory, lang, onFilter,
  viewMode, onToggleMode,
}: SliderOverlayProps) => {
  // ── Refs ──
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const prevIndexRef = useRef(currentIndex);

  // Category animation
  const categoryRef = useRef<HTMLSpanElement>(null);
  const prevCategoryRef = useRef(projects[currentIndex]?.category ?? '');
  const catDebounceRef = useRef<gsap.core.Tween | null>(null);
  const catHiddenRef = useRef(false);
  const catInitRef = useRef(false);

  // Counter digits animation (slot machine)
  const digitRefs = useRef<(HTMLSpanElement | null)[]>([null, null, null, null]);
  const prevCounterRef = useRef(String(currentIndex + 1).padStart(2, '0'));
  const activeDigitRef = useRef([0, 0]);
  const digitInitRef = useRef(false);

  const project = projects[currentIndex];
  const total = projects.length;

  const thumbWindow = useMemo(() => {
    if (total === 0) return [];
    const items: { realIndex: number; offset: number }[] = [];
    for (let i = -HALF_VISIBLE; i <= HALF_VISIBLE; i++) {
      const realIndex = ((currentIndex + i) % total + total) % total;
      items.push({ realIndex, offset: i });
    }
    return items;
  }, [currentIndex, total]);

  // Animate opacity when active changes OR when component first renders with active=true
  useEffect(() => {
    if (!containerRef.current) return;
    gsap.to(containerRef.current, {
      opacity: active ? 1 : 0,
      duration: 0.4,
      ease: 'power2.out',
    });
  }, [active]);

  // Animate track position when currentIndex changes
  useEffect(() => {
    if (!trackRef.current) return;
    const track = trackRef.current;
    const prev = prevIndexRef.current;
    prevIndexRef.current = currentIndex;

    gsap.killTweensOf(track);

    let delta = currentIndex - prev;
    if (delta > total / 2) delta -= total;
    if (delta < -total / 2) delta += total;

    if (delta !== 0) {
      const thumbWidth = 52;
      gsap.fromTo(track,
        { x: -delta * thumbWidth },
        { x: 0, duration: 0.5, ease: 'power2.out' }
      );
    }
  }, [currentIndex, total]);

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

        <span className="slider-overlay__category">
          <span ref={categoryRef} />
        </span>

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

        {categories.length > 0 && (
          <nav className="slider-overlay__filters">
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

        {revealed && (
          <>
            <h2 className="slider-overlay__title">{project.title}</h2>
            <p className="slider-overlay__subtitle">{project.subtitle}</p>
          </>
        )}

        <button
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

      <div className={`slider-overlay__minimap${revealed ? ' slider-overlay__minimap--visible' : ''}`}>
        <div ref={trackRef} className="slider-overlay__minimap-track">
            {thumbWindow.map(({ realIndex, offset }) => (
              <button
                key={`thumb-${offset}`}
                className={`slider-overlay__thumb${offset === 0 ? ' slider-overlay__thumb--active' : ''}`}
                onClick={() => onJumpTo(realIndex)}
                aria-label={projects[realIndex].title}
              >
                {projects[realIndex].heroImage && (
                  <img
                    src={projects[realIndex].thumbnailUrl ?? projects[realIndex].heroImage}
                    alt={projects[realIndex].title}
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
