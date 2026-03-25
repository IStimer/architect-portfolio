import { useRef, useEffect, useState } from 'react';
import type { ProjectData } from '../../types';
import { hasPendingTransition, animateHeroTransition, getTransitionImageUrl } from '../../services/heroTransition';

interface ProjectHeroProps {
  project: ProjectData;
  totalProjects: number;
  onBack: () => void;
}

export const ProjectHero = ({ project, onBack }: ProjectHeroProps) => {
  const hasFlip = hasPendingTransition();
  const [flipDone, setFlipDone] = useState(!hasFlip);
  // Use the exact same URL as the overlay to avoid any reload/flash
  const heroUrl = useRef(getTransitionImageUrl() ?? project.heroImage).current;
  const targetRef = useRef<HTMLDivElement>(null);

  // FLIP: animate overlay from slider position → hero target area
  useEffect(() => {
    if (flipDone || !targetRef.current) return;
    const el = targetRef.current;
    const heroBounds = el.getBoundingClientRect();
    animateHeroTransition(heroBounds, el).then(() => setFlipDone(true));
  }, [flipDone]);

  return (
    <div className="project-hero">
      <div
        ref={targetRef}
        className="project-hero__target"
        style={{
          ...(heroUrl ? {
            backgroundImage: `url(${heroUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          } : {}),
        }}
      />
      <div className="project-hero__header">
        <button className="project-hero__back" onClick={onBack}>
          &larr;
        </button>
      </div>
    </div>
  );
};
