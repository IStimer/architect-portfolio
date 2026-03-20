/**
 * Priority-based image load queue with concurrency limit.
 * Hover > Visible > Buffer ordering ensures interactive textures load first.
 *
 * Uses 3 priority buckets instead of sorting — O(1) insert, O(1) dequeue.
 * Concurrency adapts to network conditions via navigator.connection.
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

// ── Connection-aware concurrency ──────────────────────────────────

function getMaxConcurrent(): number {
  const conn = (navigator as any).connection;
  if (!conn) return 4; // default fallback
  if (conn.saveData) return 1;
  switch (conn.effectiveType) {
    case '4g': return 6;
    case '3g': return 3;
    case '2g': return 1;
    case 'slow-2g': return 1;
    default: return 4;
  }
}

let maxConcurrent = getMaxConcurrent();

// Listen for connection changes
if ((navigator as any).connection) {
  (navigator as any).connection.addEventListener('change', () => {
    maxConcurrent = getMaxConcurrent();
  });
}

// ── 3-bucket priority queue ──────────────────────────────────────

const buckets: [QueueEntry[], QueueEntry[], QueueEntry[]] = [[], [], []];
let activeCount = 0;

function queueLength(): number {
  return buckets[0].length + buckets[1].length + buckets[2].length;
}

function dequeue(): QueueEntry | undefined {
  // Highest priority first: HOVER(2) → VISIBLE(1) → BUFFER(0)
  if (buckets[2].length > 0) return buckets[2].shift();
  if (buckets[1].length > 0) return buckets[1].shift();
  if (buckets[0].length > 0) return buckets[0].shift();
  return undefined;
}

function removeSlug(slug: string): void {
  for (let p = 0; p < 3; p++) {
    const bucket = buckets[p];
    for (let i = bucket.length - 1; i >= 0; i--) {
      if (bucket[i].slug === slug) {
        bucket[i].abortController.abort();
        bucket.splice(i, 1);
      }
    }
  }
}

function flush() {
  while (activeCount < maxConcurrent && queueLength() > 0) {
    const entry = dequeue()!;
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
    removeSlug(slug);

    buckets[priority].push({ slug, url, priority, resolve, reject, abortController });
    flush();
  });

  return { promise, abort: abortController };
}

/**
 * Update priority for a queued (not yet loading) entry.
 */
export function reprioritize(slug: string, priority: LoadPriority) {
  for (let p = 0; p < 3; p++) {
    const bucket = buckets[p];
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i].slug === slug && p !== priority) {
        const [entry] = bucket.splice(i, 1);
        entry.priority = priority;
        buckets[priority].push(entry);
        return;
      }
    }
  }
}

/**
 * Cancel a pending or queued load for a slug.
 */
export function cancelLoad(slug: string) {
  removeSlug(slug);
}
