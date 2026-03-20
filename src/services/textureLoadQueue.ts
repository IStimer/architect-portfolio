/**
 * Priority-based image load queue with concurrency limit.
 * Hover > Visible > Buffer ordering ensures interactive textures load first.
 */

export const enum LoadPriority {
  BUFFER = 0,
  VISIBLE = 1,
  HOVER = 2,
}

interface QueueEntry {
  slug: string;
  url: string;
  priority: LoadPriority;
  resolve: (img: HTMLImageElement) => void;
  reject: (err: Error) => void;
  abortController: AbortController;
}

const MAX_CONCURRENT = 4;

let queue: QueueEntry[] = [];
let activeCount = 0;

function flush() {
  while (activeCount < MAX_CONCURRENT && queue.length > 0) {
    // Sort descending by priority — highest first
    queue.sort((a, b) => b.priority - a.priority);
    const entry = queue.shift()!;
    activeCount++;
    loadImage(entry);
  }
}

function loadImage(entry: QueueEntry) {
  const img = new Image();
  img.crossOrigin = 'anonymous';

  const onAbort = () => {
    img.src = '';
    activeCount--;
    entry.reject(new Error('aborted'));
    flush();
  };

  entry.abortController.signal.addEventListener('abort', onAbort, { once: true });

  img.onload = () => {
    entry.abortController.signal.removeEventListener('abort', onAbort);
    // Decode off main thread before resolving — prevents decode jank during animation
    const finish = () => { activeCount--; entry.resolve(img); flush(); };
    if (img.decode) {
      img.decode().then(finish, finish);
    } else {
      finish();
    }
  };

  img.onerror = () => {
    entry.abortController.signal.removeEventListener('abort', onAbort);
    activeCount--;
    entry.reject(new Error(`Failed to load: ${entry.url}`));
    flush();
  };

  img.src = entry.url;
}

/**
 * Enqueue an image load. Returns a promise that resolves with the Image.
 * The returned AbortController can cancel the request.
 */
export function enqueueLoad(
  slug: string,
  url: string,
  priority: LoadPriority,
): { promise: Promise<HTMLImageElement>; abort: AbortController } {
  const abortController = new AbortController();

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    // Remove any existing entry for this slug (reprioritize)
    queue = queue.filter((e) => {
      if (e.slug === slug) {
        e.abortController.abort();
        return false;
      }
      return true;
    });

    queue.push({ slug, url, priority, resolve, reject, abortController });
    flush();
  });

  return { promise, abort: abortController };
}

/**
 * Update priority for a queued (not yet loading) entry.
 */
export function reprioritize(slug: string, priority: LoadPriority) {
  const entry = queue.find((e) => e.slug === slug);
  if (entry) entry.priority = priority;
}

/**
 * Cancel a pending or queued load for a slug.
 */
export function cancelLoad(slug: string) {
  queue = queue.filter((e) => {
    if (e.slug === slug) {
      e.abortController.abort();
      return false;
    }
    return true;
  });
}
