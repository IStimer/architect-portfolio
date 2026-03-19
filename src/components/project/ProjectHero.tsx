import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import type { ProjectData } from '../../types';
import useMatchMedia from '../../hooks/useMatchMedia';
import { useProgressiveBackground } from '../../hooks/useProgressiveBackground';
import { useProjectHeroAnimation } from '../../hooks/useProjectHeroAnimation';
import FitWords from '../ui/FitWords';

gsap.registerPlugin(ScrollToPlugin);

const ProjectHeroInfoBlock = ({ project, t }: { project: ProjectData; t: (key: string) => string }) => (
  <div className="project-hero__info-block">
    <div className="project-hero__info-item">
      <span className="project-hero__info-label">
        <span className="scramble-text" data-text={t('labels.client')}>{t('labels.client')}</span>
      </span>
      <span className="project-hero__info-value">
        <span className="scramble-text" data-text={project.client}>{project.client}</span>
      </span>
    </div>
    <div className="project-hero__info-item">
      <span className="project-hero__info-label">
        <span className="scramble-text" data-text={t('labels.role')}>{t('labels.role')}</span>
      </span>
      <span className="project-hero__info-value">
        <span className="scramble-text" data-text={project.role}>{project.role}</span>
      </span>
    </div>
    <div className="project-hero__info-item">
      <span className="project-hero__info-label">
        <span className="scramble-text" data-text={t('labels.stack')}>{t('labels.stack')}</span>
      </span>
      <span className="project-hero__info-value">
        <span className="scramble-text" data-text={project.stack.join(', ')}>{project.stack.join(', ')}</span>
      </span>
    </div>
    {project.contractType && (
      <div className="project-hero__info-item">
        <span className="project-hero__info-label">
          <span className="scramble-text" data-text={t('labels.type')}>{t('labels.type')}</span>
        </span>
        <span className="project-hero__info-value">
          <span className="scramble-text" data-text={project.contractType}>{project.contractType}</span>
        </span>
      </div>
    )}
  </div>
);

interface ProjectHeroProps {
  project: ProjectData;
  totalProjects: number;
  onBack: () => void;
}

export const ProjectHero = ({ project, totalProjects, onBack }: ProjectHeroProps) => {
  const { t } = useTranslation('common');
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

  const handleScrollDown = () => {
    gsap.to(window, {
      scrollTo: window.innerHeight,
      duration: 1.2,
      ease: 'power3.inOut'
    });
  };

  return (
    <div ref={containerRef} className={`project-hero${project.heroImage ? ' project-hero--has-image' : ''}`}>
      <div
        className="project-hero__background"
        style={heroBgStyle}
      />

      <div className="project-hero__header">
        <button className="project-hero__back" onClick={onBack}>
          <span className="project-hero__back-text">{t('nav.back')}</span>
        </button>
        <div className="project-hero__counter">
          {String(project.id).padStart(2, '0')} — {String(totalProjects).padStart(2, '0')}
        </div>
      </div>

      {isMobile ? (
        <div className="project-hero__bottom">
          <div className="project-hero__title-wrapper">
            <h1 ref={titleRef} className="project-hero__title project-hero__title--fit">
              <FitWords text={project.title} className="project-hero__title-word" />
            </h1>
          </div>
          <button className="project-hero__scroll-indicator" onClick={handleScrollDown}>
            <span className="project-hero__scroll-text">
              <span className="scramble-text" data-text={t('labels.scroll')}>{t('labels.scroll')}</span>
            </span>
            <svg className="project-hero__scroll-arrow" viewBox="0 0 12 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 0V18L1 13M6 18L11 13" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="miter" strokeLinecap="square"/></svg>
          </button>
        </div>
      ) : (
        <div className="project-hero__main">
          <div className="project-hero__left">
            <div className="project-hero__title-wrapper">
              <h1 ref={titleRef} className="project-hero__title project-hero__title--fit">
                <FitWords text={project.title} className="project-hero__title-word" splitWords={false} />
              </h1>
            </div>
          </div>

          <div className="project-hero__right">
            <p ref={subtitleRef} className="project-hero__subtitle">
              {project.subtitle}
            </p>

            <p className="project-hero__description">
              <span className="scramble-text" data-text={project.description}>{project.description}</span>
            </p>

            <div className="project-hero__meta-row">
              <time className="project-hero__year" dateTime={String(project.year)}>
                <span className="scramble-text" data-text={String(project.year)}>{String(project.year)}</span>
              </time>
              {(project.liveUrl || project.githubUrl) && (
                <div className="project-hero__links">
                  {project.liveUrl && (
                    <a
                      href={project.liveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="project-hero__link project-hero__link--live"
                    >
                      <span className="project-hero__link-dot" />
                      {t('labels.live')}
                      <svg className="project-hero__link-arrow" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 0H12V3H11V1.5L6 6.5L5.5 6L10.5 1H9V0Z" fill="currentColor"/><path d="M10 7V11H1V2H5V1H0V12H11V7H10Z" fill="currentColor"/></svg>
                    </a>
                  )}
                  {project.githubUrl && (
                    <a
                      href={project.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="project-hero__link"
                    >
                      {t('labels.github')}
                      <svg className="project-hero__link-arrow" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 0H12V3H11V1.5L6 6.5L5.5 6L10.5 1H9V0Z" fill="currentColor"/><path d="M10 7V11H1V2H5V1H0V12H11V7H10Z" fill="currentColor"/></svg>
                    </a>
                  )}
                </div>
              )}
            </div>

            <ProjectHeroInfoBlock project={project} t={t} />

            {project.keyMetric && (
              <div className="project-hero__metric">
                <span className="project-hero__metric-value">
                  <span className="scramble-text" data-text={project.keyMetric.value}>{project.keyMetric.value}</span>
                </span>
                <span className="project-hero__metric-label">
                  <span className="scramble-text" data-text={project.keyMetric.label}>{project.keyMetric.label}</span>
                </span>
              </div>
            )}

            <button
              className="project-hero__scroll-indicator"
              onClick={handleScrollDown}
            >
              <span className="project-hero__scroll-text">
                <span className="scramble-text" data-text={t('labels.scroll')}>{t('labels.scroll')}</span>
              </span>
              <svg className="project-hero__scroll-arrow" viewBox="0 0 12 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 0V18L1 13M6 18L11 13" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="miter" strokeLinecap="square"/></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
