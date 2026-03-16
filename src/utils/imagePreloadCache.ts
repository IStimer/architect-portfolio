// Shared cache keeping preloaded Image objects alive so the browser retains
// the decoded bitmap in memory (prevents GC -> disk-cache-only -> re-decode
// latency that causes a visible LQIP flash on navigation).
const cache = new Map<string, HTMLImageElement>();
// In-flight preload promises — deduplicates concurrent calls for the same src
const inflight = new Map<string, Promise<void>>();

export const preloadImage = (src: string): Promise<void> => {
  if (cache.has(src)) return Promise.resolve();

  const existing = inflight.get(src);
  if (existing) return existing;

  const promise = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      cache.set(src, img);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = src;
  }).finally(() => { inflight.delete(src); });

  inflight.set(src, promise);
  return promise;
};

export const isImagePreloaded = (src: string): boolean => cache.has(src);
