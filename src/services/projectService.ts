import { sanityClient, urlFor } from './sanityClient';
import type { ProjectData, ContentBlock, EditorialBlockData, TextBlockData, ImageWidth } from '../types/project';

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
  galleryImages[] { ${imageFields} },
  editorialContent[] {
    _key,
    _type,
    image { ${imageFields} },
    imageWidth,
    text,
    textPosition,
    spacing,
    style,
    alignment,
    maxWidth
  }
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

interface SanityEditorialBlock {
  _key: string;
  _type: 'editorialBlock';
  image: SanityImage;
  imageWidth?: string;
  text?: { fr: string; en: string };
  textPosition?: string;
  spacing?: string;
}

interface SanityTextBlock {
  _key: string;
  _type: 'textBlock';
  text: { fr: string; en: string };
  style?: string;
  alignment?: string;
  maxWidth?: string;
}

type SanityContentBlock = SanityEditorialBlock | SanityTextBlock;

interface SanityProject {
  _id: string;
  title: string;
  slug: string;
  subtitle?: { fr: string; en: string };
  description?: { fr: string; en: string };
  heroImage: SanityImage;
  galleryImages?: SanityImage[];
  editorialContent?: SanityContentBlock[];
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

const IMAGE_WIDTH_MAP: Record<ImageWidth, number> = {
  full: 2400,
  large: 1800,
  half: 1200,
  third: 800,
};

function mapEditorialContent(
  blocks: SanityContentBlock[] | undefined,
  lang: 'fr' | 'en'
): ContentBlock[] | undefined {
  if (!blocks?.length) return undefined;

  return blocks.map((block): ContentBlock => {
    if (block._type === 'textBlock') {
      const tb = block as SanityTextBlock;
      return {
        _key: tb._key,
        _type: 'textBlock',
        text: tb.text?.[lang] ?? tb.text?.fr ?? '',
        style: (tb.style as TextBlockData['style']) ?? 'paragraph',
        alignment: (tb.alignment as TextBlockData['alignment']) ?? 'left',
        maxWidth: (tb.maxWidth as TextBlockData['maxWidth']) ?? 'medium',
      };
    }

    const eb = block as SanityEditorialBlock;
    const imageWidth = (eb.imageWidth as ImageWidth) ?? 'full';
    return {
      _key: eb._key,
      _type: 'editorialBlock',
      imageUrl: eb.image?.asset ? buildImageUrl(eb.image, IMAGE_WIDTH_MAP[imageWidth]) : '',
      lqip: eb.image?.asset?.metadata?.lqip,
      imageWidth,
      text: eb.text?.[lang] ?? eb.text?.fr ?? undefined,
      textPosition: (eb.textPosition as EditorialBlockData['textPosition']) ?? 'below',
      spacing: (eb.spacing as EditorialBlockData['spacing']) ?? 'normal',
    };
  });
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
    editorialContent: mapEditorialContent(raw.editorialContent, lang),
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
