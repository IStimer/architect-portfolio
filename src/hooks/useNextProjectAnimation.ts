import { useEffect, useRef, useCallback } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { useLenis } from './useLenis';
import type { ProjectData } from '../types';
import { viewTransitionFinished } from '../utils/viewTransitions';
import { prefersReducedMotion } from '../utils/prefersReducedMotion';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

type NavigationState = 'idle' | 'triggered' | 'navigating';

const CIRCUMFERENCE = 2 * Math.PI * 40;

interface UseNextProjectAnimationOptions {
  nextProject: ProjectData | null;
  currentSlug: string | undefined;
  onNavigateToProject: (slug: string) => void;
  isMobile?: boolean;
}

export const useNextProjectAnimation = ({
  nextProject,
  currentSlug,
  onNavigateToProject,
  isMobile
}: UseNextProjectAnimationOptions) => {
  const { service: lenisService } = useLenis();

  const nextProjectRef = useRef<HTMLDivElement>(null);
  const nextProjectBgRef = useRef<HTMLDivElement>(null);
  const progressCircleRef = useRef<SVGCircleElement>(null);
  const progressNumberRef = useRef<HTMLSpanElement>(null);

  const navigationStateRef = useRef<NavigationState>('idle');
  const hasSeenLowProgressRef = useRef(false);
  const scrollTriggerRef = useRef<ScrollTrigger | null>(null);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isMobile) return;

    if (scrollTriggerRef.current) {
      scrollTriggerRef.current.kill();
      scrollTriggerRef.current = null;
    }

    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }

    let cancelled = false;

    const transitionDone = Promise.race([
      viewTransitionFinished,
      new Promise<void>(resolve => setTimeout(resolve, 1200))
    ]);

    transitionDone.then(() => {
      if (cancelled) return;

      setTimeout(() => {
        if (cancelled) return;

        navigationStateRef.current = 'idle';
        hasSeenLowProgressRef.current = false;
        if (progressNumberRef.current) {
          progressNumberRef.current.textContent = '0';
        }
        const reduced = prefersReducedMotion();
        if (nextProjectBgRef.current) {
          if (reduced) {
            nextProjectBgRef.current.style.transform = '';
            nextProjectBgRef.current.style.clipPath = '';
            nextProjectBgRef.current.style.opacity = '0';
          } else {
            nextProjectBgRef.current.style.transform = 'scale(1.3)';
            nextProjectBgRef.current.style.clipPath = 'inset(20% 40% 20% 40%)';
          }
          void nextProjectBgRef.current.offsetHeight;
        }
        if (progressCircleRef.current && !reduced) {
          progressCircleRef.current.style.strokeDashoffset = String(CIRCUMFERENCE);
        }
        lenisService.start();
        window.scrollTo(0, 0);
        lenisService.scrollTo(0, { duration: 0 });

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!cancelled) ScrollTrigger.refresh();
          });
        });
      }, 50);
    });

    return () => {
      cancelled = true;
    };
  }, [currentSlug, isMobile, lenisService]);

  useEffect(() => {
    if (isMobile) return;
    if (!nextProjectRef.current || !nextProjectBgRef.current || !nextProject || !currentSlug) return;

    // nextProject is already computed and passed in by the parent

    const bgEl = nextProjectBgRef.current;
    const circleEl = progressCircleRef.current;
    const numberEl = progressNumberRef.current;

    const reduced = prefersReducedMotion();
    if (reduced) {
      bgEl.style.transform = '';
      bgEl.style.clipPath = '';
      bgEl.style.opacity = '0';
    } else {
      bgEl.style.transform = 'scale(1.3)';
      bgEl.style.clipPath = 'inset(20% 40% 20% 40%)';
    }
    void bgEl.offsetHeight;

    if (circleEl && !reduced) {
      circleEl.style.strokeDashoffset = String(CIRCUMFERENCE);
    }

    if (scrollTriggerRef.current) {
      scrollTriggerRef.current.kill();
      scrollTriggerRef.current = null;
    }

    scrollTriggerRef.current = ScrollTrigger.create({
      trigger: nextProjectRef.current,
      start: "top top",
      end: "bottom bottom",
      scrub: 1,
      onUpdate: (self) => {
        const progress = self.progress;
        const progressPercent = Math.round(progress * 100);
        const velocity = Math.abs(self.getVelocity());

        if (progress < 0.3) {
          hasSeenLowProgressRef.current = true;
        }

        const displayPercent = progressPercent >= 99 ? 100 : progressPercent;
        if (numberEl) {
          numberEl.textContent = String(displayPercent);
        }

        if (reduced) {
          if (bgEl) {
            bgEl.style.transform = '';
            bgEl.style.clipPath = '';
            bgEl.style.opacity = String(progress);
          }
        } else {
          if (bgEl) {
            const bgScale = 1.3 - (0.3 * progress);
            const insetValue = Math.max(0, 20 - (20 * progress));
            const insetHorizontal = Math.max(0, 40 - (40 * progress));

            bgEl.style.transform = `scale(${bgScale})`;
            bgEl.style.clipPath = `inset(${insetValue}% ${insetHorizontal}% ${insetValue}% ${insetHorizontal}%)`;
          }

          if (circleEl) {
            const offset = CIRCUMFERENCE - (progress * CIRCUMFERENCE);
            circleEl.style.strokeDashoffset = String(offset);
          }
        }

        if (velocity > 2000) return;

        if (progressPercent >= 100 && navigationStateRef.current === 'idle' && hasSeenLowProgressRef.current) {
          navigationStateRef.current = 'triggered';

          if (bgEl) {
            if (reduced) {
              bgEl.style.opacity = '1';
            } else {
              bgEl.style.transform = 'scale(1)';
              bgEl.style.clipPath = 'inset(0% 0% 0% 0%)';
            }
          }

          if (numberEl) {
            numberEl.textContent = '100';
          }

          navigationTimeoutRef.current = setTimeout(() => {
            if (navigationStateRef.current === 'triggered') {
              navigationStateRef.current = 'navigating';
              lenisService.stop();
              onNavigateToProject(nextProject.slug);
            }
          }, 250);
        }
      },
      onLeaveBack: () => {
        if (navigationStateRef.current === 'triggered') {
          if (navigationTimeoutRef.current) {
            clearTimeout(navigationTimeoutRef.current);
            navigationTimeoutRef.current = null;
          }
          navigationStateRef.current = 'idle';
          lenisService.start();
        }
      }
    });

    return () => {
      if (scrollTriggerRef.current) {
        scrollTriggerRef.current.kill();
        scrollTriggerRef.current = null;
      }
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
    };
  }, [nextProject, currentSlug, onNavigateToProject, lenisService]);

  const handleClickNavigate = useCallback(() => {
    if (!nextProject || navigationStateRef.current !== 'idle') return;
    if (!nextProjectRef.current) return;
    navigationStateRef.current = 'triggered';

    const currentProgress = scrollTriggerRef.current?.progress ?? 0;

    if (scrollTriggerRef.current) {
      scrollTriggerRef.current.kill();
      scrollTriggerRef.current = null;
    }
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
    lenisService.stop();

    const bgEl = nextProjectBgRef.current;
    const circleEl = progressCircleRef.current;
    const numberEl = progressNumberRef.current;

    const reduced = prefersReducedMotion();

    if (reduced) {
      const sectionRect = nextProjectRef.current.getBoundingClientRect();
      const targetY = window.scrollY + sectionRect.bottom - window.innerHeight;
      window.scrollTo(0, targetY);

      if (numberEl) numberEl.textContent = '100';
      if (bgEl) {
        bgEl.style.transform = '';
        bgEl.style.clipPath = '';
        bgEl.style.opacity = '1';
      }

      navigationStateRef.current = 'navigating';
      onNavigateToProject(nextProject.slug);
      return;
    }

    const sectionRect = nextProjectRef.current.getBoundingClientRect();
    const targetY = window.scrollY + sectionRect.bottom - window.innerHeight;
    const distance = Math.max(0, targetY - window.scrollY);

    if (distance > 0) {
      const scrollDuration = Math.min(Math.max(distance / 1500, 0.4), 1.0);
      gsap.to(window, {
        scrollTo: { y: targetY },
        duration: scrollDuration,
        ease: 'power3.inOut'
      });
    }

    gsap.to({ progress: currentProgress }, {
      progress: 1,
      duration: 1.0,
      ease: 'power3.inOut',
      onUpdate() {
        const p = this.targets()[0].progress;
        const percent = Math.round(p * 100);

        if (numberEl) {
          numberEl.textContent = String(percent >= 99 ? 100 : percent);
        }
        if (bgEl) {
          const bgScale = 1.3 - (0.3 * p);
          const insetValue = Math.max(0, 20 - (20 * p));
          const insetHorizontal = Math.max(0, 40 - (40 * p));
          bgEl.style.transform = `scale(${bgScale})`;
          bgEl.style.clipPath = `inset(${insetValue}% ${insetHorizontal}% ${insetValue}% ${insetHorizontal}%)`;
        }
        if (circleEl) {
          circleEl.style.strokeDashoffset = String(CIRCUMFERENCE - (p * CIRCUMFERENCE));
        }
      },
      onComplete: () => {
        navigationStateRef.current = 'navigating';
        onNavigateToProject(nextProject.slug);
      }
    });
  }, [nextProject, onNavigateToProject, lenisService]);

  return {
    nextProjectRef,
    nextProjectBgRef,
    progressCircleRef,
    progressNumberRef,
    handleClickNavigate
  };
};
