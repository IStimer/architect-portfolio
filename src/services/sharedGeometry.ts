/**
 * Shared geometry cache — one GPU buffer per (gl, segments) pair.
 * Avoids duplicate Plane allocations across hooks.
 */

import { Plane } from 'ogl';
import type { OGLRenderingContext } from 'ogl';

const cache = new Map<string, Plane>();
let cachedGl: OGLRenderingContext | null = null;

function key(w: number, h: number): string {
  return `${w}x${h}`;
}

/**
 * Get a shared Plane geometry. Cached per GL context + segment count.
 * Do NOT call .remove() on the returned geometry — it's shared.
 */
export function getSharedPlane(gl: OGLRenderingContext, widthSegments = 16, heightSegments = 16): Plane {
  // Invalidate cache if GL context changed (e.g., canvas recreated)
  if (cachedGl !== gl) {
    cache.clear();
    cachedGl = gl;
  }

  const k = key(widthSegments, heightSegments);
  let plane = cache.get(k);
  if (!plane) {
    plane = new Plane(gl, { widthSegments, heightSegments });
    cache.set(k, plane);
  }
  return plane;
}
