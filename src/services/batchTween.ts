/**
 * Batch position tween — drives N mesh positions with a single GSAP proxy.
 * Shared between useFilterDezoom and useOpeningAnimation.
 */

import type { Mesh, Program } from 'ogl';

export function power3InOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export interface BatchItem {
  mesh: Mesh;
  program: Program;
  endX: number;
  endY: number;
  delay: number;
  startX: number;
  startY: number;
}

/**
 * Single proxy tween that drives N mesh positions.
 * Positions captured in onStart (when tween plays, not at build time).
 * Stagger via per-item delay in seconds.
 * Each item animates for `itemDuration` with power3.inOut easing.
 * Returns total duration (itemDuration + max delay).
 */
export function addBatchPositionTween(
  tl: gsap.core.Timeline,
  label: string,
  itemDuration: number,
  items: BatchItem[],
  distortion = 0,
): number {
  if (items.length === 0) return 0;
  const maxDelay = items.reduce((m, b) => Math.max(m, b.delay), 0);
  const totalDuration = itemDuration + maxDelay;
  const proxy = { t: 0 };

  tl.fromTo(proxy, { t: 0 }, {
    t: totalDuration,
    duration: totalDuration,
    ease: 'none',
    onStart: () => {
      for (let i = 0; i < items.length; i++) {
        items[i].startX = items[i].mesh.position.x as number;
        items[i].startY = items[i].mesh.position.y as number;
      }
    },
    onUpdate: () => {
      const elapsed = proxy.t;
      for (let i = 0; i < items.length; i++) {
        const b = items[i];
        const localElapsed = elapsed - b.delay;
        if (localElapsed <= 0) continue;
        const raw = Math.min(localElapsed / itemDuration, 1);
        const eased = power3InOut(raw);
        b.mesh.position.x = b.startX + (b.endX - b.startX) * eased;
        b.mesh.position.y = b.startY + (b.endY - b.startY) * eased;
        if (distortion > 0) {
          b.program.uniforms.u_distortionAmount.value = Math.sin(raw * Math.PI) * distortion;
        }
      }
    },
  }, label);

  return totalDuration;
}
