import { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { flushSync } from "react-dom";
import gsap from "gsap";
import { startPageTransition } from "../utils/viewTransitions";
import { prefersReducedMotion } from "../utils/prefersReducedMotion";

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

        // ----- Fadeout animation -----
        const reduced = prefersReducedMotion();

        if (!reduced) {
          const pageContent = document.querySelector(".page-content");
          const customCursor = document.querySelector(".custom-cursor");

          const tl = gsap.timeline();
          if (pageContent)
            tl.to(pageContent, { opacity: 0, duration: TIMINGS.CONTENT_FADE, ease: EASE }, 0);
          if (customCursor)
            tl.to(customCursor, { opacity: 0, duration: TIMINGS.CONTENT_FADE, ease: EASE }, 0);

          await tl.then();
          await new Promise<void>((r) =>
            gsap.delayedCall(TIMINGS.PRE_TRANSITION, r),
          );
        }

        // ----- Wait for chunk to be ready -----
        await chunkReady;

        // View-transition with flushSync for synchronous DOM commit
        await startPageTransition(() => {
          flushSync(() => {
            navigate(path);
          });
        });

        // Restore cursor for the new page
        const cursorAfter = document.querySelector(".custom-cursor");
        if (cursorAfter) gsap.set(cursorAfter, { opacity: 1 });
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
