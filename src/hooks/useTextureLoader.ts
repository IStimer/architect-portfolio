import { useEffect, useRef, useState } from 'react';
import { Texture } from 'ogl';
import type { ProjectData } from '../types';

interface TextureEntry {
  texture: Texture;
  width: number;
  height: number;
}

export const useTextureLoader = (
  gl: any | null,
  projects: ProjectData[]
) => {
  const texturesRef = useRef<Map<string, TextureEntry>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!gl) return;

    const map = new Map<string, TextureEntry>();
    let loadedCount = 0;
    const total = projects.filter((p) => p.heroImage).length;

    if (total === 0) {
      texturesRef.current = map;
      setLoaded(true);
      return;
    }

    projects.forEach((project) => {
      if (!project.heroImage) return;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const texture = new Texture(gl, {
          image: img,
          generateMipmaps: true,
        });

        map.set(project.slug, {
          texture,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });

        loadedCount++;
        setProgress(loadedCount / total);

        if (loadedCount >= total) {
          texturesRef.current = map;
          setLoaded(true);
        }
      };
      img.onerror = () => {
        loadedCount++;
        setProgress(loadedCount / total);
        if (loadedCount >= total) {
          texturesRef.current = map;
          setLoaded(true);
        }
      };
      img.src = project.heroImage;
    });

    return () => {
      // Textures are managed by OGL context lifecycle
    };
  }, [gl, projects]);

  return { textures: texturesRef.current, loaded, progress };
};
