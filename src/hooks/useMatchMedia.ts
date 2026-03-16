import { useCallback, useSyncExternalStore } from 'react';

/**
 * Hook wrapping window.matchMedia via useSyncExternalStore —
 * fires only when the threshold is crossed.
 */
const useMatchMedia = (query: string): boolean => {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
};

export default useMatchMedia;
