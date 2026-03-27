import { useTranslation } from 'react-i18next';
import type { ProjectData } from '../../types';

interface ProjectMetaProps {
  project: ProjectData;
}

export const ProjectMeta = ({ project }: ProjectMetaProps) => {
  const { t } = useTranslation('common');

  return (
    <section className="project-meta">
      <div className="project-meta__left">
        {project.subtitle && (
          <p className="project-meta__subtitle" data-reveal="text" style={{ visibility: 'hidden' }}>{project.subtitle}</p>
        )}
        {project.description && (
          <p className="project-meta__description" data-reveal="text" data-reveal-delay="0.1" style={{ visibility: 'hidden' }}>{project.description}</p>
        )}
      </div>

      <div className="project-meta__right">
        <div className="project-meta__info-block">
          {project.client && (
            <div className="project-meta__info-item" data-reveal="slide-up" style={{ overflow: 'hidden', visibility: 'hidden' }}>
              <span className="project-meta__info-label">{t('labels.client')}</span>
              <span className="project-meta__info-value">{project.client}</span>
            </div>
          )}
          {project.year && (
            <div className="project-meta__info-item" data-reveal="slide-up" data-reveal-delay="0.04" style={{ overflow: 'hidden', visibility: 'hidden' }}>
              <span className="project-meta__info-label">{t('labels.year')}</span>
              <span className="project-meta__info-value">{String(project.year)}</span>
            </div>
          )}
          {project.role && (
            <div className="project-meta__info-item" data-reveal="slide-up" data-reveal-delay="0.08" style={{ overflow: 'hidden', visibility: 'hidden' }}>
              <span className="project-meta__info-label">{t('labels.role')}</span>
              <span className="project-meta__info-value">{project.role}</span>
            </div>
          )}
          {project.stack.length > 0 && (
            <div className="project-meta__info-item" data-reveal="slide-up" data-reveal-delay="0.12" style={{ overflow: 'hidden', visibility: 'hidden' }}>
              <span className="project-meta__info-label">{t('labels.stack')}</span>
              <span className="project-meta__info-value">{project.stack.join(', ')}</span>
            </div>
          )}
          {project.contractType && (
            <div className="project-meta__info-item" data-reveal="slide-up" data-reveal-delay="0.16" style={{ overflow: 'hidden', visibility: 'hidden' }}>
              <span className="project-meta__info-label">{t('labels.type')}</span>
              <span className="project-meta__info-value">{project.contractType}</span>
            </div>
          )}
        </div>

        {(project.liveUrl || project.githubUrl) && (
          <div className="project-meta__links" data-reveal="slide-up" data-reveal-delay="0.2" style={{ overflow: 'hidden', visibility: 'hidden' }}>
            {project.liveUrl && (
              <a
                href={project.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="project-meta__link project-meta__link--live"
              >
                <span className="project-meta__link-dot" />
                {t('labels.live')}
                <svg className="project-meta__link-arrow" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 0H12V3H11V1.5L6 6.5L5.5 6L10.5 1H9V0Z" fill="currentColor"/><path d="M10 7V11H1V2H5V1H0V12H11V7H10Z" fill="currentColor"/></svg>
              </a>
            )}
            {project.githubUrl && (
              <a
                href={project.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="project-meta__link"
              >
                GitHub
                <svg className="project-meta__link-arrow" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 0H12V3H11V1.5L6 6.5L5.5 6L10.5 1H9V0Z" fill="currentColor"/><path d="M10 7V11H1V2H5V1H0V12H11V7H10Z" fill="currentColor"/></svg>
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
