import { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { flushSync } from "react-dom";
import gsap from "gsap";
import { startPageTransition } from "../utils/viewTransitions";
import { prefersReducedMotion } from "../utils/prefersReducedMotion";
import { hasPendingTransition } from "../services/heroTransition";

// ---------------------------------------------------------------------------
// Chunk preloaders — Vite deduplicates identical dynamic import() calls
// ---------------------------------------------------------------------------
const chunkPreloaders = {
  about: () => import("../pages/About"),
  project: () => import("../pages/Project"),
};

/** Preload the Project page chunk (call on hover for early loading). */
export const preloadProjectChunk = () => {
  chunkPreloaders.project().catch(() => {});
};

const detectRouteChunk = (
  path: string,
): keyof typeof chunkPreloaders | null => {
  if (/\/(?:a-propos|about)(?:\/|$)/.test(path)) return "about";
  if (/\/(?:projet|project)\//.test(path)) return "project";
  return null;
};

// ---------------------------------------------------------------------------
// Transition timings (seconds)
// ---------------------------------------------------------------------------
const TIMINGS = {
  /** Fade duration for page content */
  CONTENT_FADE: 0.3,
  /** Pause before the view-transition kicks in */
  PRE_TRANSITION: 0.05,
  /** Safety delay before unlocking navigation (seconds) */
  NAV_LOCK_RESET: 0.1,
};

const EASE = "power2.inOut";

// Global navigation lock to prevent concurrent transitions
let isNavigatingGlobal = false;

export const usePageTransition = () => {
  const navigate = useNavigate();
  const isNavigatingRef = useRef(false);

  const transitionTo = useCallback(
    async (path: string) => {
      if (isNavigatingRef.current || isNavigatingGlobal) return;
      isNavigatingRef.current = true;
      isNavigatingGlobal = true;

      try {
        // ----- Fire preloads immediately (before fadeout) -----
        const routeChunk = detectRouteChunk(path);
        const chunkReady = routeChunk
          ? chunkPreloaders[routeChunk]().catch(() => {})
          : Promise.resolve();

        const flipActive = hasPendingTransition();
        const reduced = prefersReducedMotion();

        // ----- Fadeout animation (skip entirely for FLIP — overlay covers) -----
        if (!reduced && !flipActive) {
          const pageContent = document.querySelector(".page-content");

          const tl = gsap.timeline();
          if (pageContent)
            tl.to(pageContent, { opacity: 0, duration: TIMINGS.CONTENT_FADE, ease: EASE }, 0);

          await tl.then();
          await new Promise<void>((r) =>
            gsap.delayedCall(TIMINGS.PRE_TRANSITION, r),
          );
        }

        // ----- Wait for chunk to be ready -----
        await chunkReady;

        if (flipActive) {
          // FLIP transition: navigate without flushSync so the browser
          // can paint the overlay before processing the DOM swap
          navigate(path);
          window.scrollTo(0, 0);
        } else {
          // Standard view-transition with flushSync for synchronous DOM commit
          await startPageTransition(() => {
            flushSync(() => {
              navigate(path);
            });
          });
        }

      } finally {
        await new Promise<void>((r) =>
          gsap.delayedCall(TIMINGS.NAV_LOCK_RESET, r),
        );
        isNavigatingRef.current = false;
        isNavigatingGlobal = false;
      }
    },
    [navigate],
  );

  const isNavigating = useCallback(
    () => isNavigatingRef.current || isNavigatingGlobal,
    [],
  );

  return { transitionTo, isNavigating };
};
