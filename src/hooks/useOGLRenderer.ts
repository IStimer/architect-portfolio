import { useEffect, useRef, useState, useCallback } from 'react';
import { Renderer, Camera, Transform, type OGLRenderingContext } from 'ogl';
import { gsap } from 'gsap';

export interface Viewport {
  width: number;
  height: number;
  aspectRatio: number;
}

export interface OGLContext {
  gl: OGLRenderingContext;
  renderer: Renderer;
  camera: Camera;
  scene: Transform;
  viewport: Viewport;
  canvas: HTMLCanvasElement;
}

export const useOGLRenderer = (containerRef: React.RefObject<HTMLDivElement | null>) => {
  const contextRef = useRef<OGLContext | null>(null);
  const [ready, setReady] = useState(false);
  const tickerCallbackRef = useRef<((time: number) => void) | null>(null);

  const getContext = useCallback(() => contextRef.current, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new Renderer({
      alpha: true,
      antialias: true,
      dpr: Math.min(window.devicePixelRatio, 2),
    });
    const gl = renderer.gl;
    const canvas = gl.canvas as HTMLCanvasElement;

    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '0';
    canvas.style.display = 'block';

    container.appendChild(canvas);

    const camera = new Camera(gl, { fov: 45 });
    camera.position.z = 5;

    const scene = new Transform();

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h);
      camera.perspective({ aspect: w / h });

      // Calculate viewport in world units at camera z
      const fovRad = (45 * Math.PI) / 180;
      const vHeight = 2 * Math.tan(fovRad / 2) * camera.position.z;
      const vWidth = vHeight * (w / h);

      const viewport: Viewport = {
        width: vWidth,
        height: vHeight,
        aspectRatio: w / h,
      };

      if (contextRef.current) {
        contextRef.current.viewport = viewport;
      }

      return viewport;
    };

    const viewport = resize();

    contextRef.current = { gl, renderer, camera, scene, viewport, canvas };

    // Render loop on gsap.ticker
    tickerCallbackRef.current = () => {
      if (contextRef.current) {
        renderer.render({ scene, camera });
      }
    };
    gsap.ticker.add(tickerCallbackRef.current);

    window.addEventListener('resize', resize);
    setReady(true);

    return () => {
      window.removeEventListener('resize', resize);
      if (tickerCallbackRef.current) {
        gsap.ticker.remove(tickerCallbackRef.current);
        tickerCallbackRef.current = null;
      }
      canvas.remove();
      contextRef.current = null;
      setReady(false);
    };
  }, [containerRef]);

  return { getContext, ready };
};
