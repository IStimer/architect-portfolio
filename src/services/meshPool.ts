/**
 * Mesh pool — reuse Mesh+Program pairs across filter transitions.
 * Eliminates GPU resource leaks and synchronous creation bursts.
 *
 * Each pooled item has its own Program (required for per-mesh uniforms).
 * Meshes share a single Plane geometry via getSharedPlane.
 */

import { Mesh, Program } from 'ogl';
import type { OGLRenderingContext } from 'ogl';
import { getSharedPlane } from './sharedGeometry';

export interface PooledMesh {
  mesh: Mesh;
  program: Program;
}

interface PoolState {
  gl: OGLRenderingContext;
  idle: PooledMesh[];
  vertexShader: string;
  fragmentShader: string;
}

let pool: PoolState | null = null;

/**
 * Initialize the pool with a GL context and shaders.
 * Safe to call multiple times — reinitializes only if GL context changes.
 */
export function initMeshPool(
  gl: OGLRenderingContext,
  vertexShader: string,
  fragmentShader: string,
): void {
  if (pool && pool.gl === gl) return; // already initialized for this context
  pool = { gl, idle: [], vertexShader, fragmentShader };
}

/**
 * Acquire a mesh from the pool. Creates a new one if pool is empty.
 * The returned mesh is detached (no parent) with default uniforms.
 */
export function acquireMesh(gl: OGLRenderingContext): PooledMesh {
  if (!pool || pool.gl !== gl) {
    throw new Error('meshPool not initialized — call initMeshPool first');
  }

  const existing = pool.idle.pop();
  if (existing) {
    // Reset uniforms to defaults
    const u = existing.program.uniforms;
    u.u_distortionAmount.value = 0;
    u.u_parallax.value = 0;
    u.uHover.value = 0;
    u.uMouse.value = [0.5, 0.5];
    u.uAlpha.value = 1;
    u.uTextureReady.value = 1.0;
    u.uWind.value = 0;
    u.uWindDir.value = [0, 0];
    existing.mesh.position.set(0, 0, 0);
    existing.mesh.rotation.z = 0;
    return existing;
  }

  // Create new mesh+program pair
  const geometry = getSharedPlane(gl);
  const program = new Program(gl, {
    vertex: pool.vertexShader,
    fragment: pool.fragmentShader,
    uniforms: {
      uTexture: { value: null },
      u_distortionAmount: { value: 0 },
      u_parallax: { value: 0 },
      uHover: { value: 0 },
      uMouse: { value: [0.5, 0.5] },
      uResolution: { value: [1, 1] },
      uMeshSize: { value: [1, 1] },
      uAlpha: { value: 1 },
      uTextureReady: { value: 1.0 },
      uWind: { value: 0 },
      uWindDir: { value: [0, 0] },
    },
    transparent: true,
  });

  const mesh = new Mesh(gl, { geometry, program });
  return { mesh, program };
}

/**
 * Release a mesh back to the pool. Detaches from scene.
 */
export function releaseMesh(item: PooledMesh): void {
  item.mesh.setParent(null);
  if (pool) pool.idle.push(item);
}

/**
 * Release multiple meshes back to the pool.
 */
export function releaseMeshes(items: PooledMesh[]): void {
  for (let i = 0; i < items.length; i++) {
    items[i].mesh.setParent(null);
    if (pool) pool.idle.push(items[i]);
  }
}
