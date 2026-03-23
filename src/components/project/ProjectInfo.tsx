import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { ProjectData } from '../../types';
import { revealIn, revealInLines } from '../../utils/revealText';
import { prefersReducedMotion } from '../../utils/prefersReducedMotion';

gsap.registerPlugin(SplitText, ScrollTrigger);

interface ProjectInfoProps {
  project: ProjectData;
}

export const ProjectInfo = ({ project }: ProjectInfoProps) => {
  const { t } = useTranslation('common');
  const containerRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    const container = containerRef.current;
    const splits: SplitText[] = [];
    let ctx: gsap.Context;

    document.fonts.ready.then(() => {
      if (cancelled) return;

      const reduced = prefersReducedMotion();

      if (reduced) {
        const allScramble = container.querySelectorAll<HTMLElement>('.scramble-text');
        allScramble.forEach(el => gsap.set(el, { visibility: 'visible' }));
        if (subtitleRef.current) gsap.set(subtitleRef.current, { visibility: 'visible' });
        const linkEls = container.querySelectorAll<HTMLElement>('.project-info__link');
        linkEls.forEach(el => gsap.set(el, { opacity: 1 }));

        ctx = gsap.context(() => {
          gsap.set(container, { opacity: 0 });
          ScrollTrigger.create({
            trigger: container,
            start: 'top 80%',
            once: true,
            onEnter: () => gsap.to(container, { opacity: 1, duration: 0.3 })
          });
        });
        return;
      }

      const descriptionEl = container.querySelector<HTMLElement>('.project-info__description .scramble-text');
      const scrambleEls = Array.from(container.querySelectorAll<HTMLElement>('.scramble-text')).filter(el => el !== descriptionEl);

      scrambleEls.forEach(el => gsap.set(el, { visibility: 'hidden' }));
      if (descriptionEl) gsap.set(descriptionEl, { visibility: 'hidden' });

      const linkEls = container.querySelectorAll<HTMLElement>('.project-info__link');
      linkEls.forEach(el => gsap.set(el, { opacity: 0 }));

      if (subtitleRef.current) gsap.set(subtitleRef.current, { visibility: 'hidden' });

      ctx = gsap.context(() => {
        ScrollTrigger.create({
          trigger: container,
          start: 'top 80%',
          once: true,
          onEnter: () => {
            if (subtitleRef.current) {
              const subtitleSplit = SplitText.create(subtitleRef.current, {
                type: 'lines',
                mask: 'lines'
              });
              splits.push(subtitleSplit);

              gsap.set(subtitleSplit.lines, { yPercent: 110 });
              gsap.set(subtitleRef.current, { visibility: 'visible' });
              gsap.to(subtitleSplit.lines, {
                yPercent: 0,
                duration: 0.7,
                ease: 'power4.out'
              });
            }

            gsap.delayedCall(0.3, () => {
              if (descriptionEl) {
                const { split } = revealInLines(descriptionEl, {
                  duration: 0.8
                });
                splits.push(split);
              }

              scrambleEls.forEach((el, index) => {
                gsap.delayedCall(index * 0.04, () => {
                  const { split } = revealIn(el, {
                    duration: 0.8,
                  });
                  splits.push(split);
                });
              });

              linkEls.forEach((el, index) => {
                gsap.set(el, { opacity: 1, clipPath: 'inset(0 100% 0 0)' });
                gsap.to(el, {
                  clipPath: 'inset(0 0% 0 0)',
                  duration: 0.6,
                  ease: 'power2.out',
                  delay: 0.05 + index * 0.06,
                  onComplete: () => { (el as HTMLElement).style.clipPath = ''; }
                });
              });
            });
          }
        });
      });
    });

    return () => {
      cancelled = true;
      if (ctx) ctx.revert();
      splits.forEach(split => split.revert());
    };
  }, [project.id]);

  return (
    <div ref={containerRef} className="project-info">
      <p ref={subtitleRef} className="project-info__subtitle">{project.subtitle}</p>
      <p className="project-info__description">
        <span className="scramble-text">{project.description}</span>
      </p>
      <div className="project-info__meta-row">
        <span className="project-info__year">
          <span className="scramble-text">{String(project.year)}</span>
        </span>
        {(project.liveUrl || project.githubUrl) && (
          <div className="project-info__links">
            {project.liveUrl && (
              <a href={project.liveUrl} target="_blank" rel="noopener noreferrer" className="project-info__link project-info__link--live">
                <span className="project-info__link-dot" />
                {t('labels.live')}
                <svg className="project-info__link-arrow" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 0H12V3H11V1.5L6 6.5L5.5 6L10.5 1H9V0Z" fill="currentColor"/><path d="M10 7V11H1V2H5V1H0V12H11V7H10Z" fill="currentColor"/></svg>
              </a>
            )}
            {project.githubUrl && (
              <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" className="project-info__link">
                {t('labels.github')}
                <svg className="project-info__link-arrow" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 0H12V3H11V1.5L6 6.5L5.5 6L10.5 1H9V0Z" fill="currentColor"/><path d="M10 7V11H1V2H5V1H0V12H11V7H10Z" fill="currentColor"/></svg>
              </a>
            )}
          </div>
        )}
      </div>
      <div className="project-info__info-block">
        <div className="project-info__info-item">
          <span className="project-info__info-label"><span className="scramble-text">{t('labels.client')}</span></span>
          <span className="project-info__info-value"><span className="scramble-text">{project.client}</span></span>
        </div>
        <div className="project-info__info-item">
          <span className="project-info__info-label"><span className="scramble-text">{t('labels.role')}</span></span>
          <span className="project-info__info-value"><span className="scramble-text">{project.role}</span></span>
        </div>
        <div className="project-info__info-item">
          <span className="project-info__info-label"><span className="scramble-text">{t('labels.stack')}</span></span>
          <span className="project-info__info-value"><span className="scramble-text">{project.stack.join(', ')}</span></span>
        </div>
        {project.contractType && (
          <div className="project-info__info-item">
            <span className="project-info__info-label"><span className="scramble-text">{t('labels.type')}</span></span>
            <span className="project-info__info-value"><span className="scramble-text">{project.contractType}</span></span>
          </div>
        )}
      </div>
      {project.keyMetric && (
        <div className="project-info__metric">
          <span className="project-info__metric-value"><span className="scramble-text">{project.keyMetric.value}</span></span>
          <span className="project-info__metric-label"><span className="scramble-text">{project.keyMetric.label}</span></span>
        </div>
      )}
    </div>
  );
};
