import { useRef, useEffect } from 'react';
import type { ProjectData } from '../../types';
import { hasPendingTransition, finishHeroTransition, getTransitionImageUrl } from '../../services/heroTransition';

interface ProjectHeroProps {
  project: ProjectData;
  totalProjects: number;
  onBack: () => void;
}

export const ProjectHero = ({ project, onBack }: ProjectHeroProps) => {
  const hasTransition = useRef(hasPendingTransition()).current;
  const heroUrl = useRef(getTransitionImageUrl() ?? project.heroImage).current;
  const targetRef = useRef<HTMLDivElement>(null);

  // Remove the overlay — the hero target is hidden until the overlay is gone
  useEffect(() => {
    if (!hasTransition || !targetRef.current) return;
    requestAnimationFrame(() => {
      finishHeroTransition(targetRef.current ?? undefined);
    });
  }, [hasTransition]);

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
          ...(hasTransition ? { visibility: 'hidden' as const } : {}),
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
