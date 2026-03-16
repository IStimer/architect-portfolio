import { useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useLenis } from './useLenis';

interface UseMinimapOptions {
  onProjectChange?: () => void;
  indicatorOverflowX?: number;
  indicatorOverflowY?: number;
  enabled?: boolean;
  contentKey?: string | number;
}

export const useMinimap = <T extends HTMLElement = HTMLDivElement>(_options?: UseMinimapOptions) => {
  const { service: lenisService } = useLenis();

  const enabled = _options?.enabled ?? true;

  const contentRef = useRef<T>(null);
  const minimapWrapperRef = useRef<HTMLDivElement>(null);
  const minimapContentRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartScrollRef = useRef(0);

  const overflowX = _options?.indicatorOverflowX ?? 6;
  const overflowY = _options?.indicatorOverflowY ?? 5;

  const updateMinimapLayout = useCallback(() => {
    if (!viewportRef.current || !minimapWrapperRef.current || !contentRef.current || !minimapContentRef.current) return;

    const wrapperWidth = minimapWrapperRef.current.offsetWidth;
    const wrapperHeight = minimapWrapperRef.current.offsetHeight;

    const galleryRect = contentRef.current.getBoundingClientRect();
    const galleryHeight = contentRef.current.scrollHeight;
    const galleryTopInDoc = window.scrollY + galleryRect.top;

    const windowHeight = window.innerHeight;
    const scrollTop = window.scrollY;

    const contentWidth = contentRef.current.offsetWidth || 800;
    const scale = wrapperWidth / contentWidth;
    const scaledContentHeight = galleryHeight * scale;

    const maxScroll = Math.max(1, galleryHeight - windowHeight);
    const currentScrollInGallery = scrollTop - galleryTopInDoc;
    const scrollRatio = Math.max(0, Math.min(1, currentScrollInGallery / maxScroll));

    const indicatorWidth = wrapperWidth + (overflowX * 2);
    const indicatorHeight = Math.round(indicatorWidth * (10 / 16));

    const visibleHeight = Math.min(scaledContentHeight, wrapperHeight);
    const maxIndicatorTravel = Math.max(0, visibleHeight - indicatorHeight);
    const indicatorTop = scrollRatio * maxIndicatorTravel - overflowY;

    const contentOverflow = Math.max(0, scaledContentHeight - wrapperHeight);
    const contentTranslateY = -scrollRatio * contentOverflow;

    minimapContentRef.current.style.width = `${contentWidth}px`;
    minimapContentRef.current.style.transform = `translate3d(0, ${contentTranslateY}px, 0) scale(${scale})`;

    viewportRef.current.style.top = `${indicatorTop}px`;
    viewportRef.current.style.left = `${-overflowX}px`;
    viewportRef.current.style.height = `${indicatorHeight}px`;
    viewportRef.current.style.width = `${indicatorWidth}px`;
  }, [overflowX, overflowY]);

  const cloneContentToMinimap = useCallback(() => {
    if (!contentRef.current || !minimapContentRef.current) return;
    const content = contentRef.current;
    const target = minimapContentRef.current;
    const doClone = () => {
      const clone = content.cloneNode(true) as HTMLElement;
      clone.querySelectorAll<HTMLElement>('.progressive-image').forEach(container => {
        const full = container.querySelector<HTMLImageElement>('.progressive-image__full');
        if (!full || (full.complete && full.naturalWidth > 0)) return;
        container.classList.remove('progressive-image--revealed');
        full.classList.remove('progressive-image__full--loaded');
        full.onload = () => {
          full.classList.add('progressive-image__full--loaded');
          container.classList.add('progressive-image--revealed');
        };
      });
      target.replaceChildren(...Array.from(clone.childNodes));
    };
    if ('requestIdleCallback' in window) {
      (window as Window).requestIdleCallback(doClone);
    } else {
      setTimeout(doClone, 0);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let ticking = false;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          updateMinimapLayout();
          ticking = false;
        });
        ticking = true;
      }
    };

    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateMinimapLayout, 150);
    };

    updateMinimapLayout();

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [enabled, updateMinimapLayout]);

  const contentKey = _options?.contentKey;
  useEffect(() => {
    if (!enabled) return;
    cloneContentToMinimap();
  }, [enabled, contentKey, cloneContentToMinimap]);

  useLayoutEffect(() => {
    if (!enabled) return;
    updateMinimapLayout();
  }, [enabled, contentKey, updateMinimapLayout]);

  const handleMinimapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!minimapWrapperRef.current || !contentRef.current || isDraggingRef.current) return;

    const rect = minimapWrapperRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const wrapperHeight = minimapWrapperRef.current.offsetHeight;

    const clickRatio = Math.max(0, Math.min(1, clickY / wrapperHeight));

    const galleryRect = contentRef.current.getBoundingClientRect();
    const galleryTopInDoc = window.scrollY + galleryRect.top;
    const galleryHeight = contentRef.current.scrollHeight;
    const windowHeight = window.innerHeight;
    const maxScroll = galleryHeight - windowHeight;

    const targetScroll = galleryTopInDoc + (clickRatio * maxScroll);
    lenisService.scrollTo(Math.max(0, targetScroll), { duration: 1.2 });
  }, [lenisService]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!viewportRef.current || !minimapWrapperRef.current) return;

    const rect = minimapWrapperRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const indicatorTop = parseFloat(viewportRef.current.style.top) || 0;
    const indicatorHeight = parseFloat(viewportRef.current.style.height) || 0;

    if (clickY >= indicatorTop && clickY <= indicatorTop + indicatorHeight) {
      isDraggingRef.current = true;
      dragStartYRef.current = e.clientY;
      dragStartScrollRef.current = window.scrollY;
      e.preventDefault();

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current || !contentRef.current || !minimapWrapperRef.current) return;

        const wrapperHeight = minimapWrapperRef.current.offsetHeight;
        const galleryHeight = contentRef.current.scrollHeight;
        const windowHeight = window.innerHeight;
        const maxScrollInGallery = galleryHeight - windowHeight;

        const deltaY = ev.clientY - dragStartYRef.current;
        const ratioDelta = deltaY / wrapperHeight;
        const scrollDelta = ratioDelta * maxScrollInGallery;
        const newScroll = dragStartScrollRef.current + scrollDelta;

        window.scrollTo({
          top: Math.max(0, newScroll),
          behavior: 'auto'
        });
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
  }, []);

  return {
    contentRef,
    minimapWrapperRef,
    minimapContentRef,
    viewportRef,
    updateMinimapLayout,
    cloneContentToMinimap,
    handleMinimapClick,
    handleMouseDown
  };
};
