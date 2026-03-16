import { useState, useEffect, CSSProperties } from 'react';
import lqipData from '../data/lqip-data.json';
import { isImagePreloaded } from '../utils/imagePreloadCache';

const placeholders = lqipData as Record<string, string>;

export const useProgressiveBackground = (src: string | undefined) => {
  const cachedOnMount = !!src && isImagePreloaded(src);
  const [isLoaded, setIsLoaded] = useState(() => cachedOnMount);

  useEffect(() => {
    if (!src) return;
    const cached = isImagePreloaded(src);
    if (cached) { setIsLoaded(true); return; }
    setIsLoaded(false);
    const img = new Image();
    img.onload = () => setIsLoaded(true);
    img.onerror = () => setIsLoaded(true);
    img.src = src;
  }, [src]);

  if (!src) return { style: undefined, isLoaded: true };

  const placeholder = placeholders[src];
  const image = isLoaded ? src : placeholder;

  const bgLayers: string[] = [];
  if (image) bgLayers.push(`url(${image})`);
  if (placeholder && isLoaded) bgLayers.push(`url(${placeholder})`);

  const style: CSSProperties = bgLayers.length
    ? {
        backgroundImage: bgLayers.join(', '),
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : {};

  return { style, isLoaded };
};
