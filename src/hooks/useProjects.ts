import { useState, useEffect, useRef } from 'react';
import { fetchProjects, fetchCategories } from '../services/projectService';
import type { SanityCategory } from '../services/projectService';
import type { ProjectData } from '../types/project';

interface UseProjectsResult {
  projects: ProjectData[];
  categories: SanityCategory[];
  loading: boolean;
  error: string | null;
}

// Simple in-memory cache to avoid refetching on remount
let cachedProjects: ProjectData[] | null = null;
let cachedCategories: SanityCategory[] | null = null;

// Invalidate cache on HMR so dev always gets fresh data
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cachedProjects = null;
    cachedCategories = null;
  });
}

export function useProjects(lang: 'fr' | 'en' = 'fr'): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectData[]>(cachedProjects ?? []);
  const [categories, setCategories] = useState<SanityCategory[]>(cachedCategories ?? []);
  const [loading, setLoading] = useState(!cachedProjects);
  const [error, setError] = useState<string | null>(null);
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    if (cachedProjects) return;

    let cancelled = false;

    async function load() {
      try {
        const [fetchedProjects, fetchedCategories] = await Promise.all([
          fetchProjects(langRef.current),
          fetchCategories(),
        ]);

        if (cancelled) return;

        cachedProjects = fetchedProjects;
        cachedCategories = fetchedCategories;
        setProjects(fetchedProjects);
        setCategories(fetchedCategories);
      } catch (err) {
        if (cancelled) return;
        if (import.meta.env.DEV) console.warn('Sanity fetch failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch projects');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { projects, categories, loading, error };
}
