import { sanityClient, urlFor } from './sanityClient';
import type { ProjectData } from '../types/project';

// ── GROQ Fragments ──────────────────────────────────────────────

const imageFields = /* groq */ `
  asset->{
    _id,
    url,
    metadata { lqip, dimensions }
  }
`;

const projectListFields = /* groq */ `
  _id,
  title,
  "slug": slug.current,
  subtitle,
  description,
  heroImage { ${imageFields} },
  category->{ _id, title, "slug": slug.current },
  year,
  client,
  role,
  stack,
  contractType,
  sortOrder,
  featured
`;

const projectDetailFields = /* groq */ `
  ${projectListFields},
  galleryImages[] { ${imageFields} }
`;

// ── Queries ─────────────────────────────────────────────────────

const PROJECTS_QUERY = /* groq */ `
  *[_type == "project"] | order(sortOrder asc, _createdAt desc) {
    ${projectListFields}
  }
`;

const PROJECT_DETAIL_QUERY = /* groq */ `
  *[_type == "project" && slug.current == $slug][0] {
    ${projectDetailFields}
  }
`;

const CATEGORIES_QUERY = /* groq */ `
  *[_type == "category"] | order(sortOrder asc) {
    _id,
    title,
    "slug": slug.current
  }
`;

// ── Types for raw Sanity responses ──────────────────────────────

interface SanityImage {
  asset: {
    _id: string;
    url: string;
    metadata: {
      lqip: string;
      dimensions: { width: number; height: number };
    };
  };
}

interface SanityProject {
  _id: string;
  title: string;
  slug: string;
  subtitle?: { fr: string; en: string };
  description?: { fr: string; en: string };
  heroImage: SanityImage;
  galleryImages?: SanityImage[];
  category?: { _id: string; title: { fr: string; en: string }; slug: string };
  year?: number;
  client?: string;
  role?: { fr: string; en: string };
  stack?: string[];
  contractType?: { fr: string; en: string };
  sortOrder?: number;
  featured?: boolean;
}

export interface SanityCategory {
  _id: string;
  title: { fr: string; en: string };
  slug: string;
}

// ── Mappers ─────────────────────────────────────────────────────

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function buildImageUrl(image: SanityImage, width: number): string {
  return urlFor(image).width(width).format('webp').quality(80).url();
}

function mapProject(raw: SanityProject, lang: 'fr' | 'en'): ProjectData {
  const hasImage = raw.heroImage?.asset?.url;
  return {
    id: simpleHash(raw._id),
    slug: raw.slug,
    title: raw.title,
    subtitle: raw.subtitle?.[lang] ?? raw.subtitle?.fr ?? '',
    description: raw.description?.[lang] ?? raw.description?.fr ?? '',
    heroImage: hasImage ? buildImageUrl(raw.heroImage, 1200) : undefined,
    heroImageUrl: hasImage ? buildImageUrl(raw.heroImage, 1200) : undefined,
    thumbnailUrl: hasImage ? buildImageUrl(raw.heroImage, 600) : undefined,
    lqipBase64: raw.heroImage?.asset?.metadata?.lqip ?? undefined,
    galleryImages: raw.galleryImages?.map((img) => buildImageUrl(img, 1600)) ?? [],
    year: raw.year ?? new Date().getFullYear(),
    client: raw.client ?? '',
    role: raw.role?.[lang] ?? raw.role?.fr ?? '',
    stack: raw.stack ?? [],
    contractType: raw.contractType?.[lang] ?? raw.contractType?.fr ?? '',
    category: raw.category?.title[lang] ?? raw.category?.title.fr ?? '',
    categorySlug: raw.category?.slug,
    sortOrder: raw.sortOrder ?? 0,
    featured: raw.featured ?? false,
  };
}

// ── Public API ──────────────────────────────────────────────────

export async function fetchProjects(lang: 'fr' | 'en' = 'fr'): Promise<ProjectData[]> {
  const raw: SanityProject[] = await sanityClient.fetch(PROJECTS_QUERY);
  return raw.map((p) => mapProject(p, lang));
}

export async function fetchProjectDetail(
  slug: string,
  lang: 'fr' | 'en' = 'fr'
): Promise<ProjectData | null> {
  const raw: SanityProject | null = await sanityClient.fetch(PROJECT_DETAIL_QUERY, { slug });
  if (!raw) return null;
  return mapProject(raw, lang);
}

export async function fetchCategories(): Promise<SanityCategory[]> {
  return sanityClient.fetch(CATEGORIES_QUERY);
}
