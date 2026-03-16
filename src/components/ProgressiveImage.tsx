import { useReducer, useRef, useEffect } from 'react';
import lqipData from '../data/lqip-data.json';
import dimsData from '../data/image-dimensions.json';
import '../styles/components/_progressive-image.scss';

interface ProgressiveImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  width?: number;
  height?: number;
}

const placeholders = lqipData as Record<string, string>;
const dimensions = dimsData as Record<string, { w: number; h: number }>;

type ImgState = { loaded: boolean; inView: boolean };
type ImgAction = { type: 'RESET' } | { type: 'SET_IN_VIEW' } | { type: 'SET_LOADED' };
function imgReducer(state: ImgState, action: ImgAction): ImgState {
  switch (action.type) {
    case 'RESET': return { loaded: false, inView: false };
    case 'SET_IN_VIEW': return { ...state, inView: true };
    case 'SET_LOADED': return { ...state, loaded: true };
  }
}

export const ProgressiveImage = ({ src, alt, className, loading = 'lazy', width, height }: ProgressiveImageProps) => {
  const dim = dimensions[src];
  const imgWidth = width ?? dim?.w;
  const imgHeight = height ?? dim?.h;
  const [{ loaded, inView }, dispatch] = useReducer(imgReducer, { loaded: false, inView: false });
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const placeholder = placeholders[src];

  useEffect(() => {
    dispatch({ type: 'RESET' });

    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          dispatch({ type: 'SET_IN_VIEW' });
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    );

    observer.observe(el);

    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      dispatch({ type: 'SET_LOADED' });
    }

    return () => observer.disconnect();
  }, [src]);

  const revealed = loaded && inView;

  const containerClass = [
    'progressive-image',
    revealed && 'progressive-image--revealed',
    className
  ].filter(Boolean).join(' ');

  return (
    <div ref={containerRef} className={containerClass}>
      {placeholder && (
        <img
          src={placeholder}
          alt=""
          aria-hidden
          data-lqip
          className="progressive-image__lqip"
        />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={loading}
        onLoad={() => dispatch({ type: 'SET_LOADED' })}
        data-thumb={src.replace('/img/', '/img/thumbs/')}
        className={`progressive-image__full${loaded ? ' progressive-image__full--loaded' : ''}`}
        {...(imgWidth && imgHeight ? { width: imgWidth, height: imgHeight } : {})}
      />
    </div>
  );
};
