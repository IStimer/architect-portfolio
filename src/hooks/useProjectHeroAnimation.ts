import { useEffect, type RefObject } from 'react';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { scrambleIn, scrambleInLines, SCRAMBLE_CHARS } from '../utils/scrambleText';
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

    // Wait for fonts to be ready before animating
    Promise.all([
      document.fonts.ready,
    ]).then(() => {
      if (cancelled) return;

      const reduced = prefersReducedMotion();

      if (reduced) {
        const allScramble = container.querySelectorAll<HTMLElement>('.scramble-text');
        allScramble.forEach(el => {
          el.textContent = el.dataset.text || el.textContent || '';
          gsap.set(el, { visibility: 'visible', clipPath: '' });
          if (el.parentElement) el.parentElement.style.height = '';
        });
        if (titleRef.current) gsap.set(titleRef.current, { visibility: 'visible' });
        if (subtitleRef.current) gsap.set(subtitleRef.current, { visibility: 'visible' });
        const linkEls = container.querySelectorAll<HTMLElement>('.project-hero__link');
        const arrowEl = container.querySelector<HTMLElement>('.project-hero__scroll-arrow');
        linkEls.forEach(el => gsap.set(el, { opacity: 1 }));
        if (arrowEl) gsap.set(arrowEl, { opacity: 1 });
        return;
      }

      const TRANSITION_DELAY = 0.3;

      const descriptionEl = container.querySelector<HTMLElement>('.project-hero__description .scramble-text');
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
              const { split } = scrambleInLines(descriptionEl, {
                duration: 1.2,
                revealDelay: 0.15,
                speed: 0.4,
                stagger: 0.2
              });
              splits.push(split);
              gsap.set(descriptionEl, { visibility: 'visible' });
            }

            let completed = 0;
            scrambleEls.forEach((el, index) => {
              gsap.set(el, { visibility: 'visible', clipPath: 'inset(0 100% 0 0)' });
              gsap.delayedCall(index * 0.04, () => {
                scrambleIn(el, {
                  duration: isMobile ? 0.6 : 1.5,
                  revealDelay: isMobile ? 0.1 : 0.2,
                  speed: isMobile ? 0.5 : 0.3,
                  withClip: true,
                  clipDuration: isMobile ? 0.4 : 0.6,
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
