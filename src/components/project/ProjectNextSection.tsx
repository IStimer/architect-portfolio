import { forwardRef, RefObject, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ProjectData } from '../../data/projectsData';
import { useProgressiveBackground } from '../../hooks/useProgressiveBackground';

interface ProjectNextSectionProps {
  nextProject: ProjectData;
  nextProjectBgRef: RefObject<HTMLDivElement>;
  progressCircleRef: RefObject<SVGCircleElement>;
  progressNumberRef: RefObject<HTMLSpanElement>;
  onClickNavigate: () => void;
}

const CIRCUMFERENCE = 2 * Math.PI * 40;

export const ProjectNextSection = forwardRef<HTMLDivElement, ProjectNextSectionProps>(
  ({ nextProject, nextProjectBgRef, progressCircleRef, progressNumberRef, onClickNavigate }, ref) => {
    const { t } = useTranslation('common');
    const { style: footerBgStyle } = useProgressiveBackground(nextProject.footerImage);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClickNavigate();
      }
    };

    return (
      <div className={`project-next${nextProject.footerImage ? ' project-next--has-image' : ''}`} ref={ref}>
        <div className="project-next__container">
          <div
            ref={nextProjectBgRef}
            className="project-next__background"
            style={footerBgStyle}
          />
          <div
            className="project-next__content"
            role="button"
            tabIndex={0}
            onClick={onClickNavigate}
            onKeyDown={handleKeyDown}
          >
            <div className="project-next__progress">
              <svg width="100" height="100" className="project-next__progress-circle">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.3}
                  strokeWidth="2"
                />
                <circle
                  ref={progressCircleRef}
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={CIRCUMFERENCE}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <span ref={progressNumberRef} className="project-next__progress-number">0</span>
            </div>
            <span className="project-next__label">{t('labels.nextProject')}</span>
            <h2 className="project-next__title">{nextProject.title}</h2>
          </div>
        </div>
      </div>
    );
  }
);

ProjectNextSection.displayName = 'ProjectNextSection';
