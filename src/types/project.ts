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

// ── Editorial block types ────────────────────────────────────

export type ImageWidth = 'full' | 'large' | 'half' | 'third';
export type TextPosition = 'below' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'overlay';
export type BlockSpacing = 'normal' | 'tight' | 'loose';
export type TextStyle = 'paragraph' | 'quote' | 'heading';
export type TextAlignment = 'left' | 'center' | 'right';
export type TextMaxWidth = 'narrow' | 'medium' | 'wide';

export interface EditorialBlockData {
  _key: string;
  _type: 'editorialBlock';
  imageUrl: string;
  lqip?: string;
  imageWidth: ImageWidth;
  text?: string;
  textPosition: TextPosition;
  spacing: BlockSpacing;
}

export interface TextBlockData {
  _key: string;
  _type: 'textBlock';
  text: string;
  style: TextStyle;
  alignment: TextAlignment;
  maxWidth: TextMaxWidth;
}

export type ContentBlock = EditorialBlockData | TextBlockData;

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
  heroImageFull?: string;
  footerImage?: string;
  category?: string;
  editorialContent?: ContentBlock[];
  // CMS fields
  heroImageUrl?: string;
  thumbnailUrl?: string;
  lqipBase64?: string;
  categorySlug?: string;
  sortOrder?: number;
  featured?: boolean;
}

export interface RectangleData {
  id: number;
  slug: ProjectSlug;
  title: string;
  contractType: string;
  category: ProjectCategory;
  type: string;
}

export type ViewMode = 'slider' | 'grid' | 'transitioning-to-grid' | 'transitioning-to-slider' | 'opening' | 'filter-dezoom';
