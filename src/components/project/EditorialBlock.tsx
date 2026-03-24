import { useRef, useReducer, useEffect } from 'react';
import type { EditorialBlockData } from '../../types/project';

interface EditorialBlockProps {
  block: EditorialBlockData;
}

type ImgState = { loaded: boolean; inView: boolean };
type ImgAction = { type: 'SET_IN_VIEW' } | { type: 'SET_LOADED' };
function imgReducer(state: ImgState, action: ImgAction): ImgState {
  switch (action.type) {
    case 'SET_IN_VIEW': return { ...state, inView: true };
    case 'SET_LOADED': return { ...state, loaded: true };
  }
}

export const EditorialBlock = ({ block }: EditorialBlockProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [{ loaded, inView }, dispatch] = useReducer(imgReducer, { loaded: false, inView: false });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          dispatch({ type: 'SET_IN_VIEW' });
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px 200px 0px', threshold: 0.01 }
    );
    observer.observe(el);

    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      dispatch({ type: 'SET_LOADED' });
    }

    return () => observer.disconnect();
  }, [block._key]);

  const revealed = loaded && inView;
  const hasText = !!block.text;
  const isSideBySide = hasText && ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(block.textPosition);
  const isOverlay = hasText && block.textPosition === 'overlay';

  const cls = [
    'editorial-block',
    `editorial-block--width-${block.imageWidth}`,
    `editorial-block--spacing-${block.spacing}`,
    hasText && `editorial-block--text-${block.textPosition}`,
    revealed && 'editorial-block--revealed',
  ].filter(Boolean).join(' ');

  const imageElement = (
    <div className="editorial-block__image-wrap">
      {block.lqip && (
        <img
          src={block.lqip}
          alt=""
          aria-hidden
          className="editorial-block__lqip"
        />
      )}
      <img
        ref={imgRef}
        src={block.imageUrl}
        alt=""
        loading="lazy"
        onLoad={() => dispatch({ type: 'SET_LOADED' })}
        className={`editorial-block__img${loaded ? ' editorial-block__img--loaded' : ''}`}
      />
      {isOverlay && block.text && (
        <div className="editorial-block__overlay-text">
          <p>{block.text}</p>
        </div>
      )}
    </div>
  );

  const textElement = hasText && !isOverlay && (
    <div className="editorial-block__text">
      <p>{block.text}</p>
    </div>
  );

  if (isSideBySide) {
    const textFirst = block.textPosition === 'top-left' || block.textPosition === 'bottom-left';
    return (
      <div ref={containerRef} className={cls}>
        {textFirst ? textElement : imageElement}
        {textFirst ? imageElement : textElement}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cls}>
      {imageElement}
      {textElement}
    </div>
  );
};
