import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { projectsData } from '../../data/projectsData';

interface GridOverlayProps {
  active: boolean;
  hoveredSlug: string | null;
}

const GridOverlay = ({ active, hoveredSlug }: GridOverlayProps) => {
  const labelRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const project = hoveredSlug
    ? projectsData.find((p) => p.slug === hoveredSlug)
    : null;

  // Fade in/out based on active
  useEffect(() => {
    if (!containerRef.current) return;
    gsap.to(containerRef.current, {
      opacity: active ? 1 : 0,
      duration: 0.4,
      ease: 'power2.out',
    });
  }, [active]);

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
    <div ref={containerRef} className="grid-overlay" style={{ opacity: 0 }}>
      <div ref={labelRef} className="grid-overlay__label" style={{ opacity: 0 }}>
        {project && (
          <>
            <span className="grid-overlay__title">{project.title}</span>
            <span className="grid-overlay__category">{project.category}</span>
          </>
        )}
      </div>
    </div>
  );
};

export default GridOverlay;
