import { useEffect, useRef, useMemo } from "react";
import useMatchMedia from "../hooks/useMatchMedia";
import { CursorEngine } from "../utils/cursorEngine";

const CustomCursor = () => {
  const elRef = useRef<HTMLDivElement>(null);
  const cRef = useRef<HTMLDivElement[]>([]);
  const isTouch = useMatchMedia("(pointer: coarse)");
  const prefersReduced = useMatchMedia("(prefers-reduced-motion: reduce)");

  const refs = useMemo(
    () =>
      [0, 1, 2, 3].map((i) => (node: HTMLDivElement | null) => {
        if (node) cRef.current[i] = node;
      }),
    [],
  );

  useEffect(() => {
    if (isTouch || prefersReduced) return;
    const el = elRef.current;
    const corners = cRef.current;
    if (!el || corners.length < 4) return;

    const engine = new CursorEngine(el, corners);
    engine.start();
    return () => engine.destroy();
  }, [isTouch, prefersReduced]);

  if (isTouch || prefersReduced) return null;

  return (
    <div ref={elRef} className="custom-cursor">
      <div ref={refs[0]} className="custom-cursor__corner custom-cursor__corner--tl" />
      <div ref={refs[1]} className="custom-cursor__corner custom-cursor__corner--tr" />
      <div ref={refs[2]} className="custom-cursor__corner custom-cursor__corner--bl" />
      <div ref={refs[3]} className="custom-cursor__corner custom-cursor__corner--br" />
    </div>
  );
};

export default CustomCursor;
