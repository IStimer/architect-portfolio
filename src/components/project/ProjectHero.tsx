import { useRef, useEffect, useCallback } from 'react';
import type { ProjectData } from '../../types';
import {
  hasPendingTransition,
  finishHeroTransition,
  getTransitionImageUrl,
  startReverseTransition,
} from '../../services/heroTransition';

interface ProjectHeroProps {
  project: ProjectData;
  onBack: () => void;
}

export const ProjectHero = ({ project, onBack }: ProjectHeroProps) => {
  const hasTransition = useRef(hasPendingTransition()).current;
  const heroUrl = useRef(getTransitionImageUrl() ?? project.heroImage).current;
  const targetRef = useRef<HTMLDivElement>(null);

  // Forward: reveal hero target once overlay is removed
  useEffect(() => {
    if (!hasTransition || !targetRef.current) return;
    requestAnimationFrame(() => {
      finishHeroTransition(targetRef.current ?? undefined);
    });
  }, [hasTransition]);

  // Reverse: morph hero → slide, then navigate back
  const handleBack = useCallback(() => {
    const el = targetRef.current;
    const url = heroUrl ?? project.heroImage;
    if (el && url) {
      startReverseTransition(url, el, onBack);
    } else {
      onBack();
    }
  }, [heroUrl, project.heroImage, onBack]);

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
        <button className="project-hero__back" onClick={handleBack}>
          &larr;
        </button>
      </div>
    </div>
  );
};
