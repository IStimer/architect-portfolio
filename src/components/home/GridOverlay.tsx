import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { revealIn, revealOut } from '../../utils/revealText';
import type { ProjectData, ViewMode } from '../../types';
import type { SanityCategory } from '../../services/projectService';

interface GridOverlayProps {
  active: boolean;
  hoveredSlug: string | null;
  projects: ProjectData[];
  categories: SanityCategory[];
  activeCategory: string | null;
  lang: 'fr' | 'en';
  onFilter: (slug: string | null) => void;
  viewMode: ViewMode;
}

const GridOverlay = ({
  active, hoveredSlug, projects,
  categories, activeCategory, lang, onFilter,
  viewMode,
}: GridOverlayProps) => {
  const labelRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLElement>(null);
  const hasEnteredRef = useRef(false);

  const project = hoveredSlug
    ? projects.find((p) => p.slug === hoveredSlug)
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

  // Follow cursor with lerp
  useEffect(() => {
    if (!active) return;

    const handleMouseMove = (e: MouseEvent) => {
      posRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);

    const tick = () => {
      if (!labelRef.current) return;
      const rect = labelRef.current.getBoundingClientRect();
      const currentX = rect.left;
      const currentY = rect.top;
      const targetX = posRef.current.x + 20;
      const targetY = posRef.current.y + 20;
      const newX = currentX + (targetX - currentX) * 0.15;
      const newY = currentY + (targetY - currentY) * 0.15;
      labelRef.current.style.transform = `translate(${newX}px, ${newY}px)`;
    };
    gsap.ticker.add(tick);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      gsap.ticker.remove(tick);
    };
  }, [active]);

  // Show/hide label
  useEffect(() => {
    if (!labelRef.current) return;
    gsap.to(labelRef.current, {
      opacity: project ? 1 : 0,
      scale: project ? 1 : 0.9,
      duration: 0.25,
      ease: 'power2.out',
    });
  }, [project]);

  return (
    <div ref={containerRef} className="grid-overlay" style={{ opacity: active ? 1 : 0 }}>
      <div className="grid-overlay__crosshair grid-overlay__crosshair--h" />
      <div className="grid-overlay__crosshair grid-overlay__crosshair--v" />

      <div ref={labelRef} className="grid-overlay__label" style={{ opacity: 0 }}>
        {project && (
          <>
            <span className="grid-overlay__title">{project.title}</span>
            <span className="grid-overlay__category">{project.category}</span>
          </>
        )}
      </div>

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
