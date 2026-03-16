// View Transition API types - standalone types to avoid conflicts
interface ViewTransitionCompat {
  readonly ready: Promise<void>;
  readonly finished: Promise<void>;
  readonly updateCallbackDone: Promise<void>;
  skipTransition(): void;
}

type DocumentWithViewTransition = {
  startViewTransition?(callback: () => void | Promise<void>): ViewTransitionCompat;
} & Omit<Document, 'startViewTransition'>;

export let viewTransitionFinished: Promise<void> = Promise.resolve();

export const startPageTransition = async (callback: () => void): Promise<void> => {
  const doc = document as DocumentWithViewTransition;
  if (doc.startViewTransition) {
    const transition = doc.startViewTransition(callback);
    viewTransitionFinished = transition.finished;
    await transition.ready;
    window.scrollTo(0, 0);
  } else {
    viewTransitionFinished = Promise.resolve();
    callback();
    window.scrollTo(0, 0);
  }
};
