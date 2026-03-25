import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { Renderer, Camera, Transform } from 'ogl';
import { gsap } from 'gsap';
import { useTextureManager } from '../hooks/useTextureManager';
import type { TextureEntry, TextureTier } from '../hooks/useTextureManager';
import type { OGLContext, Viewport } from '../hooks/useOGLRenderer';
import type { ProjectData } from '../types';

interface OGLCanvasContextType {
  canvasReady: boolean;
  getContext: () => OGLContext | null;
  textures: Map<string, TextureEntry>;
  texturesLoaded: boolean;
  markVisible: (slugs: Set<string>) => void;
  requestFull: (slug: string) => void;
  getTier: (slug: string) => TextureTier;
}

// ── Context ────────────────────────────────────────────────────

const OGLCanvasContext = createContext<OGLCanvasContextType | null>(null);

export function useOGLCanvas(): OGLCanvasContextType {
  const ctx = useContext(OGLCanvasContext);
  if (!ctx) throw new Error('useOGLCanvas must be used within OGLCanvasProvider');
  return ctx;
}

// ── Provider ───────────────────────────────────────────────────

interface OGLCanvasProviderProps {
  children: ReactNode;
  projects: ProjectData[];
}

export function OGLCanvasProvider({ children, projects }: OGLCanvasProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<OGLContext | null>(null);
  const tickerCallbackRef = useRef<((time: number) => void) | null>(null);
  const [ready, setReady] = useState(false);

  const getContext = useCallback(() => contextRef.current, []);

  // ── Create renderer, camera, scene (once) ──
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

      const fovRad = (45 * Math.PI) / 180;
      const vHeight = 2 * Math.tan(fovRad / 2) * camera.position.z;
      const vWidth = vHeight * (w / h);

      const viewport: Viewport = { width: vWidth, height: vHeight, aspectRatio: w / h };
      if (contextRef.current) contextRef.current.viewport = viewport;
      return viewport;
    };

    const viewport = resize();
    contextRef.current = { gl, renderer, camera, scene, viewport, canvas };

    tickerCallbackRef.current = () => {
      if (contextRef.current) renderer.render({ scene, camera });
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
  }, []);

  // ── Texture manager (lives here, shares gl) ──
  const gl = ready ? contextRef.current?.gl ?? null : null;
  const {
    textures,
    loaded: texturesLoaded,
    markVisible,
    requestFull,
    getTier,
  } = useTextureManager(gl, projects);

  const value: OGLCanvasContextType = {
    canvasReady: ready,
    getContext,
    textures,
    texturesLoaded,
    markVisible,
    requestFull,
    getTier,
  };

  return (
    <OGLCanvasContext.Provider value={value}>
      <div ref={containerRef} className="ogl-canvas" />
      {children}
    </OGLCanvasContext.Provider>
  );
}
