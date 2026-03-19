import { useEffect, useRef, useMemo } from 'react';
import { gsap } from 'gsap';
import type { ProjectData } from '../../types';

interface SliderOverlayProps {
  active: boolean;
  currentIndex: number;
  projects: ProjectData[];
  onJumpTo: (index: number) => void;
}

const VISIBLE_THUMBS = 15;
const HALF_VISIBLE = Math.floor(VISIBLE_THUMBS / 2);

const SliderOverlay = ({ active, currentIndex, projects, onJumpTo }: SliderOverlayProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const prevIndexRef = useRef(currentIndex);

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

  if (!project) return null;

  return (
    <div
      ref={containerRef}
      className="slider-overlay"
      // Start visible if active is already true (projects loaded after intro)
      style={{ opacity: active ? 1 : 0 }}
    >
      <div className="slider-overlay__center">
        <div className="slider-overlay__crosshair">
          <span className="slider-overlay__crosshair-title">{project.title}</span>
        </div>
      </div>

      <div className="slider-overlay__panel">
        <div className="slider-overlay__panel-content">
          <div className="slider-overlay__panel-inner">
            <span className="slider-overlay__category">{project.category}</span>
            <h2 className="slider-overlay__title">{project.title}</h2>
            <p className="slider-overlay__subtitle">{project.subtitle}</p>
            <span className="slider-overlay__counter">
              {String(currentIndex + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </span>
          </div>
        </div>

        <div className="slider-overlay__minimap">
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
    </div>
  );
};

export default SliderOverlay;
