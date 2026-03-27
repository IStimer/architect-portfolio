import { useRef, useEffect, useCallback } from 'react';
import gsap from 'gsap';
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
  onExitStart?: () => void;
}

export const ProjectHero = ({ project, onBack, onExitStart }: ProjectHeroProps) => {
  const hasTransition = useRef(hasPendingTransition()).current;
  const heroUrl = useRef(getTransitionImageUrl() ?? project.heroImage).current;
  const targetRef = useRef<HTMLDivElement>(null);
  const backBtnRef = useRef<HTMLButtonElement>(null);

  // Forward: reveal hero target once overlay is removed
  useEffect(() => {
    if (!hasTransition || !targetRef.current) return;
    requestAnimationFrame(() => {
      finishHeroTransition(targetRef.current ?? undefined);
    });
  }, [hasTransition]);

  // Reverse: morph hero → slide, then navigate back
  const handleBack = useCallback(() => {
    onExitStart?.();
    if (backBtnRef.current) {
      gsap.to(backBtnRef.current, { yPercent: -100, duration: 0.3, ease: 'power3.in' });
    }
    const el = targetRef.current;
    const url = heroUrl ?? project.heroImage;
    if (el && url) {
      startReverseTransition(url, el, onBack);
    } else {
      onBack();
    }
  }, [heroUrl, project.heroImage, onBack, onExitStart]);

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
      <div className="project-hero__header" style={{ overflow: 'hidden' }}>
        <button ref={backBtnRef} className="project-hero__back" data-reveal="slide-up" style={{ visibility: 'hidden' }} onClick={handleBack}>
          &larr;
        </button>
      </div>
    </div>
  );
};
