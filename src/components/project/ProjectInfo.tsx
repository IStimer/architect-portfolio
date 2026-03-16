import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ProjectData } from '../../data/projectsData';
import { scrambleIn, scrambleInLines, SCRAMBLE_CHARS } from '../../utils/scrambleText';
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
        allScramble.forEach(el => {
          el.textContent = el.dataset.text || el.textContent || '';
          gsap.set(el, { visibility: 'visible', clipPath: '' });
          if (el.parentElement) el.parentElement.style.height = '';
        });
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

      scrambleEls.forEach(el => {
        const parent = el.parentElement;
        if (parent) parent.style.height = `${parent.getBoundingClientRect().height}px`;
      });
      scrambleEls.forEach(el => {
        const target = el.dataset.text || el.textContent || '';
        el.textContent = target.replace(/[^ ]/g, () =>
          SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
        );
        gsap.set(el, { visibility: 'hidden' });
      });

      if (descriptionEl) {
        gsap.set(descriptionEl, { visibility: 'hidden' });
      }

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
              gsap.set(subtitleRef.current, { visibility: 'visible' });
              const subtitleSplit = SplitText.create(subtitleRef.current, {
                type: 'lines',
                mask: 'lines'
              });
              splits.push(subtitleSplit);

              gsap.set(subtitleSplit.lines, { yPercent: 110 });
              gsap.to(subtitleSplit.lines, {
                yPercent: 0,
                duration: 0.7,
                ease: 'power4.out'
              });
            }

            gsap.delayedCall(0.3, () => {
              if (descriptionEl) {
                gsap.set(descriptionEl, { visibility: 'visible' });
                const { split } = scrambleInLines(descriptionEl, {
                  duration: 1.2,
                  revealDelay: 0.15,
                  speed: 0.4,
                  stagger: 0.2
                });
                splits.push(split);
              }

              let completed = 0;
              scrambleEls.forEach((el, index) => {
                gsap.set(el, { visibility: 'visible', clipPath: 'inset(0 100% 0 0)' });
                gsap.delayedCall(index * 0.04, () => {
                  scrambleIn(el, {
                    duration: 1.5,
                    revealDelay: 0.2,
                    speed: 0.3,
                    withClip: true,
                    clipDuration: 0.6,
                    onComplete: () => {
                      completed++;
                      if (completed === scrambleEls.length) {
                        scrambleEls.forEach(s => {
                          if (s.parentElement) s.parentElement.style.height = '';
                        });
                      }
                    }
                  });
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
        <span className="scramble-text" data-text={project.description}>{project.description}</span>
      </p>
      <div className="project-info__meta-row">
        <span className="project-info__year">
          <span className="scramble-text" data-text={String(project.year)}>{String(project.year)}</span>
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
          <span className="project-info__info-label"><span className="scramble-text" data-text={t('labels.client')}>{t('labels.client')}</span></span>
          <span className="project-info__info-value"><span className="scramble-text" data-text={project.client}>{project.client}</span></span>
        </div>
        <div className="project-info__info-item">
          <span className="project-info__info-label"><span className="scramble-text" data-text={t('labels.role')}>{t('labels.role')}</span></span>
          <span className="project-info__info-value"><span className="scramble-text" data-text={project.role}>{project.role}</span></span>
        </div>
        <div className="project-info__info-item">
          <span className="project-info__info-label"><span className="scramble-text" data-text={t('labels.stack')}>{t('labels.stack')}</span></span>
          <span className="project-info__info-value"><span className="scramble-text" data-text={project.stack.join(', ')}>{project.stack.join(', ')}</span></span>
        </div>
        {project.contractType && (
          <div className="project-info__info-item">
            <span className="project-info__info-label"><span className="scramble-text" data-text={t('labels.type')}>{t('labels.type')}</span></span>
            <span className="project-info__info-value"><span className="scramble-text" data-text={project.contractType}>{project.contractType}</span></span>
          </div>
        )}
      </div>
      {project.keyMetric && (
        <div className="project-info__metric">
          <span className="project-info__metric-value"><span className="scramble-text" data-text={project.keyMetric.value}>{project.keyMetric.value}</span></span>
          <span className="project-info__metric-label"><span className="scramble-text" data-text={project.keyMetric.label}>{project.keyMetric.label}</span></span>
        </div>
      )}
    </div>
  );
};
