/**
 * Types for project data and related entities
 */

export type ProjectSlug = string;

export type ProjectCategory = string;

type ProjectRole = string;

interface ProjectKeyMetric {
  value: string;
  label: string;
}

export interface ProjectData {
  id: number;
  slug: ProjectSlug;
  title: string;
  subtitle: string;
  description: string;
  galleryImages: string[];
  year: number;
  client: string;
  role: ProjectRole;
  stack: string[];
  contractType?: string;
  liveUrl?: string;
  githubUrl?: string;
  keyMetric?: ProjectKeyMetric;
  heroImage?: string;
  footerImage?: string;
  category?: string;
}

export interface RectangleData {
  id: number;
  slug: ProjectSlug;
  title: string;
  contractType: string;
  category: ProjectCategory;
  type: string;
}

export type ViewMode = 'slider' | 'grid' | 'transitioning-to-grid' | 'transitioning-to-slider';
