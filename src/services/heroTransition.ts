// Seamless transition between homepage slider and project hero.
// Uses img.decode() to guarantee the overlay image is ready to paint
// before hiding the canvas. Morphs on Home, navigates when done.

import gsap from 'gsap';

export interface HeroTransitionData {
  imageUrl: string;
  rect: DOMRect;
}

let pending: HeroTransitionData | null = null;
let overlayEl: HTMLDivElement | null = null;

/** Decode image, create overlay, hide canvas, morph to hero, call onReady. */
export function startHeroTransition(
  data: HeroTransitionData,
  onReady: () => void,
) {
  cleanup();
  pending = data;

  // Decode image first so the overlay paints instantly (no blank frame)
  const img = new Image();
  img.src = data.imageUrl;
  img.decode().then(() => {
    if (!pending) return; // cancelled

    const r = data.rect;
    const el = document.createElement('div');
    el.className = 'hero-transition-overlay';
    el.style.cssText = `
      position: fixed;
      z-index: 9999;
      top: ${r.y}px;
      left: ${r.x}px;
      width: ${r.width}px;
      height: ${r.height}px;
      background-image: url(${data.imageUrl});
      background-size: cover;
      background-position: center;
      pointer-events: none;
      will-change: top, left, width, height;
    `;
    document.body.appendChild(el);
    overlayEl = el;

    // Now safe to hide the canvas — overlay is painted
    const canvas = document.querySelector('.ogl-canvas canvas') as HTMLElement | null;
    if (canvas) canvas.style.opacity = '0';

    // Morph to hero position
    const padding = Math.min(window.innerWidth * 0.03, 48);
    const heroWidth = window.innerWidth - padding * 2;
    const heroHeight = Math.min(Math.max(300, window.innerHeight * 0.6), 800);

    gsap.to(el, {
      top: padding,
      left: padding,
      width: heroWidth,
      height: heroHeight,
      duration: 0.7,
      ease: 'power3.inOut',
      onComplete: onReady,
    });
  }).catch(() => {
    // Decode failed — navigate anyway
    onReady();
  });
}

/** Called on project page mount: remove overlay (hero is behind it). */
export function finishHeroTransition(targetEl?: HTMLElement) {
  if (!overlayEl) return;
  if (targetEl) targetEl.style.visibility = 'visible';
  cleanup();
}

export function hasPendingTransition(): boolean {
  return pending !== null || overlayEl !== null;
}

export function getTransitionImageUrl(): string | null {
  return pending?.imageUrl ?? null;
}

function cleanup() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  const canvas = document.querySelector('.ogl-canvas canvas') as HTMLElement | null;
  if (canvas) canvas.style.opacity = '';
  pending = null;
}
