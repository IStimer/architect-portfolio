import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { projectsData } from '../../data/projectsData';

interface SliderOverlayProps {
  active: boolean;
  currentIndex: number;
  onJumpTo: (index: number) => void;
}

function getThumbCenter(track: HTMLElement, index: number) {
  const thumb = track.querySelectorAll<HTMLElement>('.slider-overlay__thumb')[index];
  if (!thumb) return 0;
  return thumb.offsetLeft + thumb.offsetWidth / 2;
}

function getTx(track: HTMLElement, thumbIndex: number) {
  const containerWidth = track.parentElement!.getBoundingClientRect().width;
  return -(getThumbCenter(track, thumbIndex) - containerWidth / 2);
}

const SliderOverlay = ({ active, currentIndex, onJumpTo }: SliderOverlayProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const prevIndexRef = useRef(currentIndex);

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

  // Center the active thumbnail — seamless infinite loop
  useEffect(() => {
    if (!trackRef.current) return;
    const track = trackRef.current;
    const prev = prevIndexRef.current;
    prevIndexRef.current = currentIndex;

    // Kill any in-flight animation to avoid conflicts
    gsap.killTweensOf(track);

    // 1. Snap instantly to middle-copy position of PREVIOUS index
    //    (visually identical — same images in every copy)
    gsap.set(track, { x: getTx(track, total + prev) });

    // 2. Determine shortest-path direction around the loop
    let delta = currentIndex - prev;
    if (delta > total / 2) delta -= total;
    if (delta < -total / 2) delta += total;

    // 3. Pick target in the correct copy so animation goes the right way
    let targetIndex: number;
    if (delta >= 0 && currentIndex < prev) {
      // Forward wrap (e.g. last→first): animate into 3rd copy
      targetIndex = 2 * total + currentIndex;
    } else if (delta < 0 && currentIndex > prev) {
      // Backward wrap (e.g. first→last): animate into 1st copy
      targetIndex = currentIndex;
    } else {
      // Normal move within middle copy
      targetIndex = total + currentIndex;
    }

    // 4. Animate
    gsap.to(track, {
      x: getTx(track, targetIndex),
      duration: 0.6,
      ease: 'power2.out',
    });
  }, [currentIndex, total]);

  if (!project) return null;

  // Triple the array for infinite illusion
  const tripled = [...projectsData, ...projectsData, ...projectsData];

  return (
    <div ref={containerRef} className="slider-overlay" style={{ opacity: 0 }}>
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
            {tripled.map((p, i) => {
              const realIndex = i % total;
              return (
                <button
                  key={`${p.slug}-${i}`}
                  className={`slider-overlay__thumb${realIndex === currentIndex ? ' slider-overlay__thumb--active' : ''}`}
                  onClick={() => onJumpTo(realIndex)}
                  aria-label={p.title}
                >
                  {p.heroImage && (
                    <img src={p.heroImage} alt={p.title} loading="lazy" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SliderOverlay;
