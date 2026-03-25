// Seamless transitions between homepage slider and project hero.
// Forward: slide → hero (morph on Home, then navigate)
// Reverse: hero → slide (morph on Project, then navigate back)

import gsap from 'gsap';

// ── Constants ──────────────────────────────────────────────────
const MORPH_DURATION = 0.7;
const MORPH_EASE = 'power3.inOut';
const REVERSE_FADE_DELAY = 0.3;
const REVERSE_FADE_DURATION = 0.4;

// Slider layout (must match useSliderMode.ts)
const SLIDE_SIZE_FRAC = 0.35;

// Camera (must match useOGLRenderer.ts)
const CAMERA_FOV = 45;
const CAMERA_Z = 5;

const CANVAS_SELECTOR = '.ogl-canvas canvas';

// ── State ──────────────────────────────────────────────────────
export interface HeroTransitionData {
  imageUrl: string;
  rect: DOMRect;
}

let pending: HeroTransitionData | null = null;
let overlayEl: HTMLDivElement | null = null;
let currentDirection: 'forward' | 'reverse' | null = null;

// ── Helpers ────────────────────────────────────────────────────

function createOverlay(imageUrl: string, rect: DOMRect): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'hero-transition-overlay';
  el.style.cssText = `
    position: fixed;
    z-index: 9999;
    top: ${rect.y}px;
    left: ${rect.x}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    background-image: url(${imageUrl});
    background-size: cover;
    background-position: center;
    pointer-events: none;
    will-change: top, left, width, height;
  `;
  document.body.appendChild(el);
  return el;
}

function getHeroTargetRect(): { top: number; left: number; width: number; height: number } {
  const padding = Math.min(window.innerWidth * 0.03, 48);
  return {
    top: padding,
    left: padding,
    width: window.innerWidth - padding * 2,
    height: Math.min(Math.max(300, window.innerHeight * 0.6), 800),
  };
}

function getSlideTargetRect(): { top: number; left: number; width: number; height: number } {
  const cw = window.innerWidth;
  const ch = window.innerHeight;
  const fovRad = (CAMERA_FOV * Math.PI) / 180;
  const vpH = 2 * Math.tan(fovRad / 2) * CAMERA_Z;
  const vpW = vpH * (cw / ch);

  const slideSize = SLIDE_SIZE_FRAC * vpH;

  return {
    left: ((vpW / 2 - slideSize / 2) / vpW) * cw,
    top: ((vpH / 2 - slideSize / 2) / vpH) * ch,
    width: (slideSize / vpW) * cw,
    height: (slideSize / vpH) * ch,
  };
}

function setCanvasVisible(visible: boolean) {
  const canvas = document.querySelector(CANVAS_SELECTOR) as HTMLElement | null;
  if (canvas) canvas.style.opacity = visible ? '' : '0';
}

function decodeImage(url: string): Promise<void> {
  const img = new Image();
  img.src = url;
  return img.decode();
}

function cleanup() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  setCanvasVisible(true);
  pending = null;
  currentDirection = null;
}

// ── Forward: slide → hero ──────────────────────────────────────

export function startHeroTransition(data: HeroTransitionData, onReady: () => void) {
  cleanup();
  pending = data;
  currentDirection = 'forward';

  decodeImage(data.imageUrl).then(() => {
    if (!pending) return;

    overlayEl = createOverlay(data.imageUrl, data.rect);
    setCanvasVisible(false);

    gsap.to(overlayEl, {
      ...getHeroTargetRect(),
      duration: MORPH_DURATION,
      ease: MORPH_EASE,
      onComplete: onReady,
    });
  }).catch(() => onReady());
}

export function finishHeroTransition(targetEl?: HTMLElement) {
  if (!overlayEl) return;
  if (targetEl) targetEl.style.visibility = 'visible';
  cleanup();
}

// ── Reverse: hero → slide ──────────────────────────────────────

export function startReverseTransition(imageUrl: string, heroEl: HTMLElement, onReady: () => void) {
  cleanup();
  currentDirection = 'reverse';

  const heroBounds = heroEl.getBoundingClientRect();

  decodeImage(imageUrl).then(() => {
    if (currentDirection !== 'reverse') return;

    overlayEl = createOverlay(imageUrl, heroBounds);
    heroEl.style.visibility = 'hidden';

    gsap.to(overlayEl, {
      ...getSlideTargetRect(),
      duration: MORPH_DURATION,
      ease: MORPH_EASE,
      onComplete: onReady,
    });
  }).catch(() => onReady());
}

export function finishReverseTransition() {
  if (!overlayEl) return;
  gsap.to(overlayEl, {
    opacity: 0,
    duration: REVERSE_FADE_DURATION,
    delay: REVERSE_FADE_DELAY,
    ease: 'power2.out',
    onComplete: cleanup,
  });
}

// ── Queries ────────────────────────────────────────────────────

export function hasPendingTransition(): boolean {
  return pending !== null || overlayEl !== null;
}

export function getTransitionDirection(): 'forward' | 'reverse' | null {
  return currentDirection;
}

export function getTransitionImageUrl(): string | null {
  return pending?.imageUrl ?? null;
}
