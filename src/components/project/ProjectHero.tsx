import { useRef } from 'react';
import type { ProjectData } from '../../types';
import { useProgressiveBackground } from '../../hooks/useProgressiveBackground';
import { useProjectHeroAnimation } from '../../hooks/useProjectHeroAnimation';
import useMatchMedia from '../../hooks/useMatchMedia';
import FitWords from '../ui/FitWords';

interface ProjectHeroProps {
  project: ProjectData;
  totalProjects: number;
  onBack: () => void;
}

export const ProjectHero = ({ project, totalProjects, onBack }: ProjectHeroProps) => {
  const { style: heroBgStyle, isLoaded: heroImageLoaded } = useProgressiveBackground(project.heroImage);
  const isMobile = useMatchMedia('(max-width: 767px)');

  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);

  useProjectHeroAnimation({
    containerRef,
    titleRef,
    subtitleRef,
    heroImageLoaded,
    projectId: project.id,
    projectSlug: project.slug,
    isMobile,
  });

  return (
    <div
      ref={containerRef}
      className={`project-hero${project.heroImage ? ' project-hero--has-image' : ''}`}
    >
      <div
        className="project-hero__background"
        style={heroBgStyle}
      />

      <div className="project-hero__header">
        <button className="project-hero__back" onClick={onBack}>
          &larr;
        </button>
        <div className="project-hero__counter">
          {String(project.id).padStart(2, '0')} — {String(totalProjects).padStart(2, '0')}
        </div>
      </div>

      <div className="project-hero__center">
        <h1 ref={titleRef} className="project-hero__title project-hero__title--fit">
          <FitWords text={project.title} className="project-hero__title-word" splitWords={!isMobile ? false : undefined} />
        </h1>
      </div>
    </div>
  );
};
