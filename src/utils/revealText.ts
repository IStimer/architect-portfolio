import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { prefersReducedMotion } from './prefersReducedMotion';

gsap.registerPlugin(SplitText);

export const revealIn = (
  el: HTMLElement,
  options?: { duration?: number; delay?: number; onComplete?: () => void }
): { split: SplitText; tween: gsap.core.Tween } => {
  const { duration = 1, delay = 0, onComplete } = options || {};

  const split = SplitText.create(el, { type: 'lines', mask: 'lines' });

  if (prefersReducedMotion()) {
    gsap.set(el, { visibility: 'visible' });
    onComplete?.();
    return { split, tween: gsap.to(el, { duration: 0 }) };
  }

  gsap.set(split.lines, { yPercent: 100 });
  gsap.set(el, { visibility: 'visible' });

  const tween = gsap.to(split.lines, {
    yPercent: 0,
    duration,
    ease: 'power2.out',
    delay,
    onComplete
  });

  return { split, tween };
};

export const revealInLines = (
  el: HTMLElement,
  options?: { duration?: number; delay?: number; onComplete?: () => void }
): { split: SplitText; tween: gsap.core.Tween } => {
  const { duration = 1, delay = 0, onComplete } = options || {};

  const split = SplitText.create(el, { type: 'lines', mask: 'lines' });

  if (prefersReducedMotion()) {
    gsap.set(el, { visibility: 'visible' });
    onComplete?.();
    return { split, tween: gsap.to(el, { duration: 0 }) };
  }

  gsap.set(split.lines, { yPercent: 100 });
  gsap.set(el, { visibility: 'visible' });

  const tween = gsap.to(split.lines, {
    yPercent: 0,
    duration,
    ease: 'power2.out',
    delay,
    onComplete
  });

  return { split, tween };
};

export const revealOut = (
  el: HTMLElement,
  options?: { duration?: number; onComplete?: () => void }
): { split: SplitText; tween: gsap.core.Tween } => {
  const { duration = 0.6, onComplete } = options || {};

  const split = SplitText.create(el, { type: 'lines', mask: 'lines' });

  if (prefersReducedMotion()) {
    gsap.set(el, { visibility: 'hidden' });
    onComplete?.();
    return { split, tween: gsap.to(el, { duration: 0 }) };
  }

  const tween = gsap.to(split.lines, {
    yPercent: -100,
    duration,
    ease: 'power3.in',
    onComplete
  });

  return { split, tween };
};
