import { useEffect, useRef } from 'react';
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

const MIN_DURATION = 2.5; // seconds — minimum time before unlock

const IntroAnimation = ({ onUnlock, exiting = false }: IntroAnimationProps) => {
  const { t } = useTranslation(['home']);
  const containerRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const roleRef = useRef<HTMLParagraphElement>(null);
  const splitTextsRef = useRef<SplitText[]>([]);
  const hasUnlockedRef = useRef(false);
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current || !nameRef.current || !roleRef.current) return;

    const reduced = prefersReducedMotion();
    if (reduced) {
      onUnlock?.();
      return;
    }

    // Reveal name + role
    document.fonts.ready.then(() => {
      if (!nameRef.current || !roleRef.current) return;
      const { split: s1 } = revealIn(nameRef.current, { duration: 1 });
      const { split: s2 } = revealIn(roleRef.current, { duration: 1, delay: 0.1 });
      splitTextsRef.current.push(s1, s2);
    });

    // Wait for minimum duration + textures loaded
    startTimeRef.current = performance.now();

    gsap.delayedCall(MIN_DURATION, triggerUnlock);

    return () => {
      splitTextsRef.current.forEach(st => st.revert());
      splitTextsRef.current = [];
    };
  }, []);

  const triggerUnlock = () => {
    if (hasUnlockedRef.current) return;
    hasUnlockedRef.current = true;

    const nameEl = nameRef.current;
    const roleEl = roleRef.current;
    if (!nameEl || !roleEl) { onUnlock?.(); return; }

    const { split: s1 } = revealOut(nameEl, { duration: 0.5 });
    const { split: s2 } = revealOut(roleEl, { duration: 0.5 });
    splitTextsRef.current.push(s1, s2);

    // Launch opening immediately — plays while text slides out
    onUnlock?.();
  };

  return (
    <div
      ref={containerRef}
      className={`intro-animation${exiting ? ' intro-animation--exiting' : ''}`}
    >
      <div className="intro-left">
        <h1 ref={nameRef} className="intro-name">{t('home:intro.welcome1')}</h1>
        <p ref={roleRef} className="intro-role">{t('home:intro.welcome2')}</p>
      </div>
    </div>
  );
};

export default IntroAnimation;
