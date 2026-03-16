import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { projectsData } from '../../data/projectsData';

interface SliderOverlayProps {
  active: boolean;
  currentIndex: number;
  onJumpTo: (index: number) => void;
}

const SliderOverlay = ({ active, currentIndex, onJumpTo }: SliderOverlayProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const project = projectsData[currentIndex];
  const total = projectsData.length;

  useEffect(() => {
    if (!containerRef.current) return;
    gsap.to(containerRef.current, {
      opacity: active ? 1 : 0,
      duration: 0.4,
      ease: 'power2.out',
    });
  }, [active]);

  if (!project) return null;

  return (
    <div ref={containerRef} className="slider-overlay" style={{ opacity: 0 }}>
      <nav className="slider-overlay__minimap">
        {projectsData.map((p, i) => (
          <button
            key={p.slug}
            className={`slider-overlay__thumb${i === currentIndex ? ' slider-overlay__thumb--active' : ''}`}
            onClick={() => onJumpTo(i)}
            aria-label={p.title}
          >
            {p.heroImage && (
              <img src={p.heroImage} alt={p.title} loading="lazy" />
            )}
          </button>
        ))}
      </nav>

      <div className="slider-overlay__center">
        <div className="slider-overlay__crosshair">
          <span className="slider-overlay__crosshair-title">{project.title}</span>
        </div>
      </div>

      <div className="slider-overlay__panel">
        <div className="slider-overlay__panel-inner">
          <span className="slider-overlay__category">{project.category}</span>
          <h2 className="slider-overlay__title">{project.title}</h2>
          <p className="slider-overlay__subtitle">{project.subtitle}</p>
          <span className="slider-overlay__counter">
            {String(currentIndex + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
        </div>
      </div>
    </div>
  );
};

export default SliderOverlay;
