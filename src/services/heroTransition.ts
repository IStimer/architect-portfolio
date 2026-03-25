// Seamless transition between homepage slider and project hero.
// The overlay is created before navigation and animated on the project page.

import gsap from 'gsap';

export interface HeroTransitionData {
  imageUrl: string;
  rect: DOMRect;
}

let pending: HeroTransitionData | null = null;
let overlayEl: HTMLDivElement | null = null;

/** Call before navigation: stores data + creates a fixed overlay at the slide position. */
export function prepareHeroTransition(data: HeroTransitionData) {
  cleanup(); // remove any stale overlay
  pending = data;

  const el = document.createElement('div');
  el.className = 'hero-transition-overlay';
  el.style.cssText = `
    position: fixed;
    z-index: 9999;
    top: ${data.rect.y}px;
    left: ${data.rect.x}px;
    width: ${data.rect.width}px;
    height: ${data.rect.height}px;
    background-image: url(${data.imageUrl});
    background-size: cover;
    background-position: center;
    pointer-events: none;
    will-change: transform, top, left, width, height;
  `;
  document.body.appendChild(el);
  overlayEl = el;
}

/** Call on project page mount: animates overlay → hero bounds, then removes it. */
export function animateHeroTransition(heroBounds: DOMRect, targetEl?: HTMLElement): Promise<void> {
  if (!overlayEl || !pending) { cleanup(); return Promise.resolve(); }

  if (targetEl) targetEl.style.visibility = 'hidden';

  return new Promise((resolve) => {
    gsap.to(overlayEl!, {
      top: heroBounds.y,
      left: heroBounds.x,
      width: heroBounds.width,
      height: heroBounds.height,
      duration: 0.7,
      ease: 'power3.inOut',
      onComplete: () => {
        if (targetEl) targetEl.style.visibility = 'visible';
        cleanup();
        resolve();
      },
    });
  });
}

/** Check if a transition is pending. */
export function hasPendingTransition(): boolean {
  return pending !== null;
}

/** Get the image URL used in the transition (for the target to match). */
export function getTransitionImageUrl(): string | null {
  return pending?.imageUrl ?? null;
}

function cleanup() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  pending = null;
}
