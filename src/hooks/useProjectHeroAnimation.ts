import { useEffect, type RefObject } from 'react';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { revealIn, revealInLines } from '../utils/revealText';
import { prefersReducedMotion } from '../utils/prefersReducedMotion';

gsap.registerPlugin(SplitText);

interface UseProjectHeroAnimationOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  titleRef: RefObject<HTMLHeadingElement | null>;
  subtitleRef: RefObject<HTMLParagraphElement | null>;
  heroImageLoaded: boolean;
  projectId: number;
  projectSlug: string;
  isMobile: boolean;
}

export const useProjectHeroAnimation = ({
  containerRef,
  titleRef,
  subtitleRef,
  heroImageLoaded,
  projectId,
  projectSlug: _projectSlug,
  isMobile,
}: UseProjectHeroAnimationOptions): void => {
  useEffect(() => {
    if (!heroImageLoaded || !containerRef.current) return;

    let cancelled = false;
    const container = containerRef.current;
    const splits: SplitText[] = [];
    let ctx: gsap.Context;
    let startRafId: number;

    Promise.all([
      document.fonts.ready,
    ]).then(() => {
      if (cancelled) return;

      const reduced = prefersReducedMotion();

      if (reduced) {
        if (titleRef.current) gsap.set(titleRef.current, { visibility: 'visible' });
        if (subtitleRef.current) gsap.set(subtitleRef.current, { visibility: 'visible' });
        const descriptionEl = container.querySelector<HTMLElement>('.project-hero__description .scramble-text');
        if (descriptionEl) gsap.set(descriptionEl, { visibility: 'visible' });
        const scrambleEls = container.querySelectorAll<HTMLElement>('.scramble-text');
        scrambleEls.forEach(el => gsap.set(el, { visibility: 'visible' }));
        const linkEls = container.querySelectorAll<HTMLElement>('.project-hero__link');
        const arrowEl = container.querySelector<HTMLElement>('.project-hero__scroll-arrow');
        linkEls.forEach(el => gsap.set(el, { opacity: 1 }));
        if (arrowEl) gsap.set(arrowEl, { opacity: 1 });
        return;
      }

      const TRANSITION_DELAY = 0.3;

      const descriptionEl = container.querySelector<HTMLElement>('.project-hero__description .scramble-text');
      const scrambleEls = Array.from(container.querySelectorAll<HTMLElement>('.scramble-text')).filter(el => el !== descriptionEl);

      scrambleEls.forEach(el => gsap.set(el, { visibility: 'hidden' }));
      if (descriptionEl) gsap.set(descriptionEl, { visibility: 'hidden' });

      const linkEls = container.querySelectorAll<HTMLElement>('.project-hero__link');
      const arrowEl = container.querySelector<HTMLElement>('.project-hero__scroll-arrow');
      linkEls.forEach(el => gsap.set(el, { opacity: 0 }));
      if (arrowEl) gsap.set(arrowEl, { opacity: 0 });

      startRafId = requestAnimationFrame(() => {
        if (cancelled) return;
        ctx = gsap.context(() => {
          if (titleRef.current) {
            const titleSplit = SplitText.create(titleRef.current, {
              type: 'words, chars',
              mask: 'chars'
            });
            splits.push(titleSplit);

            gsap.set(titleRef.current, { visibility: 'visible' });
            gsap.from(titleSplit.chars, {
              yPercent: 100,
              duration: isMobile ? 0.8 : 1,
              ease: 'power4.out',
              stagger: { each: 0.015, from: 'start' },
              delay: TRANSITION_DELAY
            });
          }

          if (subtitleRef.current) {
            const subtitleSplit = SplitText.create(subtitleRef.current, {
              type: 'lines',
              mask: 'lines'
            });
            splits.push(subtitleSplit);
            subtitleRef.current.removeAttribute('aria-label');

            gsap.set(subtitleSplit.lines, { yPercent: 110 });
            gsap.set(subtitleRef.current, { visibility: 'visible' });
            gsap.to(subtitleSplit.lines, {
              yPercent: 0,
              duration: isMobile ? 0.7 : 0.8,
              ease: 'power4.out',
              delay: isMobile ? TRANSITION_DELAY + 0.6 : TRANSITION_DELAY + 0.1
            });
          }

          const contentDelay = isMobile ? TRANSITION_DELAY + 1.0 : TRANSITION_DELAY + 0.3;

          gsap.delayedCall(contentDelay, () => {
            if (descriptionEl) {
              const { split } = revealInLines(descriptionEl, {
                duration: isMobile ? 0.6 : 0.8
              });
              splits.push(split);
            }

            scrambleEls.forEach((el, index) => {
              gsap.delayedCall(index * 0.04, () => {
                const { split } = revealIn(el, {
                  duration: isMobile ? 0.6 : 0.8,
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
            if (arrowEl) {
              gsap.set(arrowEl, { opacity: 1, y: 8 });
              gsap.to(arrowEl, { y: 0, duration: 0.8, ease: 'power3.out', delay: 0.15 });
            }
          });
        });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(startRafId);
      if (ctx) ctx.revert();
      splits.forEach(split => split.revert());
    };
  }, [heroImageLoaded, projectId, isMobile]);
};
