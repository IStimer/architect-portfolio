import { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProjectData } from '../../types';
import { useProgressiveBackground } from '../../hooks/useProgressiveBackground';

interface ProjectNextSectionProps {
  nextProject: ProjectData;
  onNavigate: (slug: string) => void;
}

export const ProjectNextSection = ({ nextProject, onNavigate }: ProjectNextSectionProps) => {
  const { t } = useTranslation('common');
  const { style: bgStyle } = useProgressiveBackground(nextProject.heroImage);

  const handleClick = () => onNavigate(nextProject.slug);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div className={`project-next${nextProject.heroImage ? ' project-next--has-image' : ''}`}>
      <div className="project-next__background" style={bgStyle} />
      <div
        className="project-next__content"
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <span className="project-next__label">{t('labels.nextProject')}</span>
        <h2 className="project-next__title">{nextProject.title}</h2>
        <svg className="project-next__arrow" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );
};
