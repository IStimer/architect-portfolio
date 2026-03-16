import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook pour suivre la progression du scroll sur la page
 * Met a jour directement le DOM via un ref (pas de re-render React)
 */
export const useScrollProgress = (enabled: boolean = true) => {
  const progressRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (!progressRef.current) return;
    const winScroll = document.documentElement.scrollTop || document.body.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = height > 0 ? winScroll / height : 0;
    progressRef.current.style.transform = `scaleY(${scrolled})`;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll, enabled]);

  return progressRef;
};
