import gsap from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { SplitText } from 'gsap/SplitText';
import { prefersReducedMotion } from './prefersReducedMotion';

gsap.registerPlugin(ScrambleTextPlugin, SplitText);

export const SCRAMBLE_CHARS = 'A!B@C#D$E%F&G*H?J[K]L{M}N=O+P-QRSTUVWXYZ';

export const scrambleIn = (
  textEl: HTMLElement,
  options?: { duration?: number; revealDelay?: number; speed?: number; withClip?: boolean; clipDuration?: number; onComplete?: () => void }
): gsap.core.Tween => {
  const { duration = 2, revealDelay = 0.3, speed = 0.25, withClip = false, clipDuration = 0.6, onComplete } = options || {};
  const targetText = textEl.dataset.text || textEl.textContent || '';

  if (prefersReducedMotion()) {
    textEl.textContent = targetText;
    textEl.style.clipPath = '';
    onComplete?.();
    return gsap.to(textEl, { duration: 0 });
  }

  if (withClip) {
    textEl.style.clipPath = 'inset(0 100% 0 0)';
  }

  return gsap.to(textEl, {
    duration,
    ease: 'none',
    scrambleText: {
      text: targetText,
      chars: SCRAMBLE_CHARS,
      revealDelay,
      speed
    },
    onStart: withClip ? () => {
      gsap.to(textEl, {
        clipPath: 'inset(0 0% 0 0)',
        duration: clipDuration,
        ease: 'power2.out'
      });
    } : undefined,
    onComplete: withClip ? () => {
      textEl.style.clipPath = '';
      onComplete?.();
    } : onComplete
  });
};

export const scrambleInLines = (
  textEl: HTMLElement,
  options?: { duration?: number; revealDelay?: number; speed?: number; stagger?: number; onComplete?: () => void }
): { split: SplitText; tweens: gsap.core.Tween[] } => {
  const { duration = 1.5, revealDelay = 0.2, speed = 0.3, stagger = 0.15, onComplete } = options || {};

  const parentHeight = textEl.getBoundingClientRect().height;
  textEl.style.height = `${parentHeight}px`;

  const split = SplitText.create(textEl, {
    type: 'lines',
    linesClass: 'scramble-line'
  });

  textEl.removeAttribute('aria-label');

  if (prefersReducedMotion()) {
    split.lines.forEach(line => {
      const lineEl = line as HTMLElement;
      lineEl.style.clipPath = '';
      lineEl.style.height = '';
    });
    textEl.style.height = '';
    onComplete?.();
    return { split, tweens: [] };
  }

  const tweens: gsap.core.Tween[] = [];

  split.lines.forEach((line, index) => {
    const lineEl = line as HTMLElement;
    const lineText = lineEl.textContent || '';

    lineEl.style.height = `${lineEl.getBoundingClientRect().height}px`;
    lineEl.textContent = lineText.replace(/[^ ]/g, () =>
      SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
    );

    lineEl.style.clipPath = 'inset(0 100% 0 0)';

    const tween = gsap.to(lineEl, {
      duration,
      ease: 'none',
      delay: index * stagger,
      scrambleText: {
        text: lineText,
        chars: SCRAMBLE_CHARS,
        revealDelay,
        speed
      },
      onStart: () => {
        gsap.to(lineEl, {
          clipPath: 'inset(0 0% 0 0)',
          duration: 0.6,
          ease: 'power2.out'
        });
      },
      onComplete: () => {
        lineEl.style.clipPath = '';
        lineEl.style.height = '';
        if (index === split.lines.length - 1) {
          textEl.style.height = '';
          onComplete?.();
        }
      }
    });

    tweens.push(tween);
  });

  return { split, tweens };
};

export const scrambleOut = (
  textEl: HTMLElement,
  options?: { duration?: number; onComplete?: () => void }
): gsap.core.Tween => {
  const { duration = 1.2, onComplete } = options || {};
  const originalText = textEl.dataset.text || textEl.textContent || '';

  if (prefersReducedMotion()) {
    textEl.textContent = '';
    onComplete?.();
    return gsap.to(textEl, { duration: 0 });
  }
  const totalChars = originalText.length;

  return gsap.to({ progress: 0 }, {
    progress: 1,
    duration,
    ease: 'none',
    onUpdate: function() {
      const progress = this.progress();
      const keepCount = Math.ceil(totalChars * (1 - progress));
      let result = '';

      for (let i = 0; i < keepCount; i++) {
        if (i === keepCount - 1 && progress > 0 && progress < 1) {
          result += originalText[i] === ' ' ? ' ' : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        } else {
          result += originalText[i];
        }
      }
      textEl.textContent = result;
    },
    onComplete: () => {
      textEl.textContent = '';
      onComplete?.();
    }
  });
};
