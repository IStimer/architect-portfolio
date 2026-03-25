/**
 * TextureManager — LRU cache with 3-tier progressive loading.
 *
 * Tier 1 (LQIP):      Inline base64, ~1KB GPU, instant
 * Tier 2 (Thumbnail):  600px WebP, ~1.4MB GPU, loaded for visible items
 * Tier 3 (Full):       1200px WebP, ~3.8MB GPU, loaded on hover/active
 *
 * A single OGL Texture object per slug is reused across tiers — its `image`
 * is swapped in place so existing Program uniforms stay valid.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Texture } from 'ogl';
import { enqueueLoad, cancelLoad, LoadPriority } from '../services/textureLoadQueue';
import type { ProjectData } from '../types';

// ── Types ───────────────────────────────────────────────────────

export interface TextureEntry {
  texture: Texture;
  width: number;
  height: number;
}

export const enum TextureTier {
  NONE = 0,
  LQIP = 1,
  THUMBNAIL = 2,
  FULL = 3,
  HERO = 4,
}

interface SlotMeta {
  slug: string;
  tier: TextureTier;
  lastAccess: number;
  gpuBytes: number;
  visible: boolean;
  loading: TextureTier | null; // tier currently being fetched
}

// ── Constants ───────────────────────────────────────────────────

const GPU_BUDGET_BYTES = 150 * 1024 * 1024; // ~150 MB
// Rough estimate: width * height * 4 (RGBA)
const THUMB_GPU = 600 * 450 * 4;  // ~1.08 MB
const FULL_GPU = 1200 * 900 * 4;  // ~4.32 MB
const HERO_GPU = 2400 * 1600 * 4; // ~15.36 MB
const LQIP_GPU = 16 * 16 * 4;    // ~1 KB

// ── Placeholder ─────────────────────────────────────────────────

let _placeholderCanvas: HTMLCanvasElement | null = null;

function getPlaceholderImage(): HTMLCanvasElement {
  if (_placeholderCanvas) return _placeholderCanvas;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 4;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, 4, 4);
  _placeholderCanvas = c;
  return c;
}

function decodeLqip(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img); // fallback gracefully
    img.src = base64;
  });
}

// ── Helpers ─────────────────────────────────────────────────────

function getImageUrl(project: ProjectData, tier: TextureTier): string | null {
  if (tier === TextureTier.HERO) {
    return project.heroImageFull ?? project.heroImage ?? null;
  }
  if (tier === TextureTier.THUMBNAIL) {
    return project.thumbnailUrl ?? project.heroImage ?? null;
  }
  if (tier === TextureTier.FULL) {
    return project.heroImageUrl ?? project.heroImage ?? null;
  }
  return null;
}

function gpuForTier(tier: TextureTier): number {
  if (tier === TextureTier.HERO) return HERO_GPU;
  if (tier === TextureTier.FULL) return FULL_GPU;
  if (tier === TextureTier.THUMBNAIL) return THUMB_GPU;
  return LQIP_GPU;
}

// ── Shared placeholder texture (one per GL context) ─────────────

let _placeholderTexture: Texture | null = null;
let _placeholderGl: any = null;

export function getPlaceholderTexture(gl: any): Texture {
  if (_placeholderTexture && _placeholderGl === gl) return _placeholderTexture;
  _placeholderGl = gl;
  _placeholderTexture = new Texture(gl, {
    image: getPlaceholderImage(),
    generateMipmaps: false,
    minFilter: gl.LINEAR,
    magFilter: gl.LINEAR,
  });
  return _placeholderTexture;
}

// ── Hook ────────────────────────────────────────────────────────

export function useTextureManager(
  gl: any | null,
  projects: ProjectData[],
) {
  const texturesRef = useRef<Map<string, TextureEntry>>(new Map());
  const metaRef = useRef<Map<string, SlotMeta>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const glRef = useRef(gl);
  glRef.current = gl;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  // O(1) slug→project lookup (rebuilt when projects change)
  const projectBySlugRef = useRef<Map<string, ProjectData>>(new Map());
  useEffect(() => {
    const map = new Map<string, ProjectData>();
    projects.forEach((p) => map.set(p.slug, p));
    projectBySlugRef.current = map;
  }, [projects]);

  // ── Initialize: create one Texture per slug with placeholder ──
  useEffect(() => {
    if (!gl || projects.length === 0) return;

    const map = texturesRef.current;
    const meta = metaRef.current;

    const lqipPromises: Promise<void>[] = [];

    projects.forEach((project) => {
      if (map.has(project.slug)) return; // already initialized

      const texture = new Texture(gl, {
        image: getPlaceholderImage(),
        generateMipmaps: false,
        minFilter: gl.LINEAR,
        magFilter: gl.LINEAR,
      });

      map.set(project.slug, { texture, width: 4, height: 4 });
      meta.set(project.slug, {
        slug: project.slug,
        tier: TextureTier.NONE,
        lastAccess: performance.now(),
        gpuBytes: LQIP_GPU,
        visible: false,
        loading: null,
      });

      // If LQIP base64 available, decode and apply
      if (project.lqipBase64) {
        const p = decodeLqip(project.lqipBase64).then((img) => {
          texture.image = img;
          texture.needsUpdate = true;
          const entry = map.get(project.slug);
          if (entry) {
            entry.width = img.naturalWidth || 16;
            entry.height = img.naturalHeight || 16;
          }
          const m = meta.get(project.slug);
          if (m) m.tier = TextureTier.LQIP;
        });
        lqipPromises.push(p);
      }
    });

    // Mark loaded once all LQIPs are decoded (or immediately if none)
    const preloadCount = Math.min(9, projects.length);

    Promise.all(lqipPromises).then(() => {
      setLoaded(true);

      // Pre-load thumbnails for the initial slider window (~9 projects)
      // so textures are ready when the intro animation ends
      function loadThumb(slug: string, url: string, priority: LoadPriority) {
        const m = meta.get(slug);
        if (!m || m.tier >= TextureTier.THUMBNAIL || m.loading) return;
        m.loading = TextureTier.THUMBNAIL;
        const { promise } = enqueueLoad(slug, url, priority);
        promise.then((img) => {
          const entry = map.get(slug);
          const slotMeta = meta.get(slug);
          if (!entry || !slotMeta || !glRef.current) return;
          entry.texture.image = img;
          entry.texture.generateMipmaps = true;
          entry.texture.needsUpdate = true;
          entry.width = img.naturalWidth;
          entry.height = img.naturalHeight;
          slotMeta.tier = TextureTier.THUMBNAIL;
          slotMeta.gpuBytes = gpuForTier(TextureTier.THUMBNAIL);
          slotMeta.loading = null;
        }).catch(() => {
          const slotMeta = meta.get(slug);
          if (slotMeta) slotMeta.loading = null;
        });
      }

      for (let i = 0; i < preloadCount; i++) {
        const url = projects[i].thumbnailUrl ?? projects[i].heroImage;
        if (url) loadThumb(projects[i].slug, url, LoadPriority.VISIBLE);
      }

      // Preload remaining thumbnails at low priority after a short delay
      // so they're cached when the user triggers a filter transition
      setTimeout(() => {
        for (let i = preloadCount; i < projects.length; i++) {
          const url = projects[i].thumbnailUrl ?? projects[i].heroImage;
          if (url) loadThumb(projects[i].slug, url, LoadPriority.BUFFER);
        }
      }, 500);
    });

    // If no LQIP data at all (fallback mode), mark loaded immediately
    if (lqipPromises.length === 0) setLoaded(true);
  }, [gl, projects]);

  // ── Total GPU usage ───────────────────────────────────────────
  const getTotalGpu = useCallback((): number => {
    let total = 0;
    metaRef.current.forEach((m) => { total += m.gpuBytes; });
    return total;
  }, []);

  // ── Eviction ──────────────────────────────────────────────────
  const evictIfNeeded = useCallback(() => {
    const meta = metaRef.current;
    const map = texturesRef.current;

    while (getTotalGpu() > GPU_BUDGET_BYTES) {
      // Find least recently accessed non-visible texture with tier > LQIP
      let oldestSlug: string | null = null;
      let oldestAccess = Infinity;

      meta.forEach((m) => {
        if (m.visible || m.tier <= TextureTier.LQIP) return;
        if (m.lastAccess < oldestAccess) {
          oldestAccess = m.lastAccess;
          oldestSlug = m.slug;
        }
      });

      if (!oldestSlug) break; // nothing to evict

      const target = meta.get(oldestSlug)!;

      // Downgrade to LQIP (placeholder)
      const entry = map.get(oldestSlug);
      if (entry) {
        entry.texture.image = getPlaceholderImage();
        entry.texture.needsUpdate = true;
        entry.width = 4;
        entry.height = 4;
      }
      target.gpuBytes = LQIP_GPU;
      target.tier = TextureTier.LQIP;
    }
  }, [getTotalGpu]);

  // ── Request a tier load for a slug ────────────────────────────
  const requestTier = useCallback(
    (slug: string, tier: TextureTier) => {
      const meta = metaRef.current.get(slug);
      const map = texturesRef.current;
      if (!meta || !glRef.current) return;

      // Already at or above requested tier, or already loading it
      if (meta.tier >= tier) return;
      if (meta.loading && meta.loading >= tier) return;

      const project = projectBySlugRef.current.get(slug);
      if (!project) return;

      const url = getImageUrl(project, tier);
      if (!url) return;

      const priority = tier === TextureTier.HERO ? LoadPriority.HOVER
        : tier === TextureTier.FULL ? LoadPriority.HOVER
        : LoadPriority.VISIBLE;

      meta.loading = tier;
      const { promise } = enqueueLoad(slug, url, priority);
      promise
        .then((img) => {
          const currentMeta = metaRef.current.get(slug);
          if (!currentMeta || !glRef.current) return;

          // Only upgrade, never downgrade
          if (currentMeta.tier >= tier && currentMeta.loading !== tier) return;

          const entry = map.get(slug);
          if (!entry) return;

          entry.texture.image = img;
          entry.texture.generateMipmaps = true;
          entry.texture.needsUpdate = true;
          entry.width = img.naturalWidth;
          entry.height = img.naturalHeight;

          currentMeta.tier = tier;
          currentMeta.gpuBytes = gpuForTier(tier);
          currentMeta.loading = null;

          evictIfNeeded();
        })
        .catch(() => {
          const currentMeta = metaRef.current.get(slug);
          if (currentMeta) currentMeta.loading = null;
        });
    },
    [evictIfNeeded],
  );

  // ── Mark slugs as visible (protects from eviction) ────────────
  const markVisible = useCallback(
    (slugs: Set<string>) => {
      metaRef.current.forEach((m) => {
        const wasVisible = m.visible;
        m.visible = slugs.has(m.slug);

        if (m.visible) {
          m.lastAccess = performance.now();
          // Auto-request thumbnail for newly visible items
          if (m.tier < TextureTier.THUMBNAIL && !m.loading) {
            requestTier(m.slug, TextureTier.THUMBNAIL);
          }
        } else if (wasVisible && !m.visible) {
          // Became invisible — candidate for eviction on next budget check
        }
      });
    },
    [requestTier],
  );

  // ── Request full-res (hover/active) ───────────────────────────
  const requestFull = useCallback(
    (slug: string) => {
      const meta = metaRef.current.get(slug);
      if (meta) meta.lastAccess = performance.now();
      requestTier(slug, TextureTier.FULL);
    },
    [requestTier],
  );

  // ── Get current tier for a slug ───────────────────────────────
  const getTier = useCallback((slug: string): TextureTier => {
    return metaRef.current.get(slug)?.tier ?? TextureTier.NONE;
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      metaRef.current.forEach((m) => cancelLoad(m.slug));
    };
  }, []);

  return {
    textures: texturesRef.current,
    loaded,
    markVisible,
    requestFull,
    requestTier,
    getTier,
  };
}
