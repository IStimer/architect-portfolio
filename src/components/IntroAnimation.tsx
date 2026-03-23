import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { revealIn, revealOut } from '../utils/revealText';
import { prefersReducedMotion } from '../utils/prefersReducedMotion';
import '../styles/components/IntroAnimation.scss';

gsap.registerPlugin(SplitText);

interface IntroAnimationProps {
  onComplete?: () => void;
  onUnlock?: () => void;
  exiting?: boolean;
}

const IntroAnimation = ({ onUnlock, exiting = false }: IntroAnimationProps) => {
  const { t } = useTranslation(['home', 'common']);
  const [canClick, setCanClick] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const welcomeRef = useRef<HTMLDivElement>(null);
  const discoverRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  const splitTextsRef = useRef<SplitText[]>([]);
  const hasDiscoveredRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || !welcomeRef.current || !discoverRef.current) return;

    const reduced = prefersReducedMotion();

    const welcomeWrappers = welcomeRef.current.querySelectorAll<HTMLElement>('.scramble-wrapper');
    const discoverWrapper = discoverRef.current.querySelector<HTMLElement>('.scramble-wrapper');

    if (reduced) {
      if (welcomeRef.current) welcomeRef.current.style.display = 'none';
      if (discoverRef.current) gsap.set(discoverRef.current, { opacity: 1 });
      if (discoverWrapper) {
        const arrowEl = discoverWrapper.querySelector('.discover-arrow') as HTMLElement;
        if (arrowEl) gsap.set(arrowEl, { visibility: 'visible' });
      }
      if (discoverRef.current) gsap.set(discoverRef.current, { '--brackets-opacity': 1 } as any);
      setCanClick(true);
      return;
    }

    // Hide text elements before animation
    welcomeWrappers.forEach(wrapper => {
      const textEl = wrapper.querySelector('.scramble-text') as HTMLElement;
      if (textEl) gsap.set(textEl, { visibility: 'hidden' });
    });

    const welcomeAppearTimeline = gsap.timeline({ id: "welcome appear" });
    welcomeWrappers.forEach((wrapper, index) => {
      const textEl = wrapper.querySelector('.scramble-text') as HTMLElement;
      if (!textEl) return;

      welcomeAppearTimeline.add(() => {
        const { split } = revealIn(textEl, { duration: 0.8 });
        splitTextsRef.current.push(split);
      }, index * 0.15);
    });

    const welcomeLeaveTimeline = gsap.timeline({ id: "welcome leave" });
    const reversedWrappers = Array.from(welcomeWrappers).reverse();
    reversedWrappers.forEach((wrapper, index) => {
      const textEl = wrapper.querySelector('.scramble-text') as HTMLElement;

      welcomeLeaveTimeline.add(() => {
        const { split } = revealOut(textEl, { duration: 0.5 });
        splitTextsRef.current.push(split);
      }, index * 0.1);
    });

    const discoverTimeline = gsap.timeline({ id: "discover" });
    if (discoverWrapper) {
      const textEl = discoverWrapper.querySelector('.scramble-text') as HTMLElement;
      const arrowEl = discoverWrapper.querySelector('.discover-arrow') as HTMLElement;

      const arrowPaths = arrowEl ? arrowEl.querySelectorAll('path') : [];
      if (arrowEl) gsap.set(arrowEl, { visibility: 'hidden' });
      arrowPaths.forEach((path) => {
        const length = path.getTotalLength();
        gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
      });

      if (textEl) gsap.set(textEl, { visibility: 'hidden' });

      discoverTimeline
        .set(discoverRef.current, { opacity: 1 })
        .add(() => {
          const { split } = revealIn(textEl, {
            duration: 0.7,
            onComplete: () => setCanClick(true)
          });
          splitTextsRef.current.push(split);
        });

      if (arrowEl) discoverTimeline.set(arrowEl, { visibility: 'visible' });
      arrowPaths.forEach((path) => {
        discoverTimeline.to(path, {
          strokeDashoffset: 0,
          duration: 0.4,
          ease: 'power2.inOut'
        });
      });

      if (discoverRef.current) {
        gsap.set(discoverRef.current, { '--brackets-opacity': 0 });
        discoverTimeline.to(discoverRef.current, {
          '--brackets-opacity': 1,
          duration: 0.5,
          ease: 'power2.out'
        }, '+=1');
      }
    }

    const mainTimeline = gsap.timeline({ id: "intro animation" });
    timelineRef.current = mainTimeline;

    mainTimeline
      .add(welcomeAppearTimeline)
      .add(welcomeLeaveTimeline, "+=2.5")
      .add(discoverTimeline, "+=0.1");

    return () => {
      mainTimeline.kill();
      splitTextsRef.current.forEach(st => st.revert());
      splitTextsRef.current = [];
    };
  }, []);

  const handleDiscoverClick = useCallback(() => {
    if (!canClick || !discoverRef.current || hasDiscoveredRef.current) return;
    hasDiscoveredRef.current = true;

    const discoverWrapper = discoverRef.current.querySelector<HTMLElement>('.scramble-wrapper');

    if (discoverWrapper) {
      const textEl = discoverWrapper.querySelector('.scramble-text') as HTMLElement;
      if (textEl) {
        const { split } = revealOut(textEl, { duration: 0.5 });
        splitTextsRef.current.push(split);
      }
    }

    if (onUnlock) onUnlock();
  }, [canClick, onUnlock]);

  return (
    <div
      ref={containerRef}
      className={`intro-animation ${canClick ? 'clickable' : ''}${exiting ? ' intro-animation--exiting' : ''}`}
    >
        <div
          ref={welcomeRef}
          className="intro-text welcome-text"
        >
          <div className="scramble-wrapper">
            <span className="scramble-text">{t('home:intro.welcome1')}</span>
          </div>
          <div className="scramble-wrapper">
            <span className="scramble-text">{t('home:intro.welcome2')}</span>
          </div>
        </div>

        <div
          ref={discoverRef}
          className={`intro-text discover-text ${canClick ? 'clickable' : ''}`}
          onClick={handleDiscoverClick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDiscoverClick(); } }}
          role="button"
          tabIndex={canClick ? 0 : -1}
          aria-label={t('common:nav.discoverProjects')}
        >
          <div className="scramble-wrapper">
            <span className="scramble-text">{t('common:nav.discoverProjects')}</span>
            <svg className="discover-arrow" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 10L10 2" stroke="currentColor" strokeWidth="1"/><path d="M4 2H10V8" stroke="currentColor" strokeWidth="0.9"/></svg>
          </div>
        </div>
      </div>
  );
};

export default IntroAnimation;
