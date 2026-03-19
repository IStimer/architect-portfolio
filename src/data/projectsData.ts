/**
 * Legacy fallback data file — kept for type re-exports and getTranslatedProject helper.
 * All project data now comes from Sanity CMS via useProjects hook.
 */
import type { ProjectData } from '../types';

export const projectsData: ProjectData[] = [];

export type { ProjectData } from '../types';

export const getTranslatedProject = (
  slug: string,
  _t: (key: string) => string,
  allProjects?: ProjectData[]
): ProjectData | undefined => {
  return allProjects?.find(p => p.slug === slug);
};
