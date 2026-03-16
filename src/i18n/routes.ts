export type SupportedLang = 'fr' | 'en';

export const DEFAULT_LANG: SupportedLang = 'fr';
export const SUPPORTED_LANGS: SupportedLang[] = ['fr', 'en'];

const ROUTE_SEGMENTS: Record<string, Record<SupportedLang, string>> = {
  about: { fr: 'a-propos', en: 'about' },
  project: { fr: 'projet', en: 'project' }
};

export function isSupportedLang(lang: string): lang is SupportedLang {
  return SUPPORTED_LANGS.includes(lang as SupportedLang);
}

export function localizedPath(
  lang: SupportedLang,
  route: 'home' | 'about' | 'project',
  params?: { slug?: string }
): string {
  if (route === 'home') return `/${lang}`;
  const segment = ROUTE_SEGMENTS[route]?.[lang] ?? route;
  const base = `/${lang}/${segment}`;
  if (params?.slug) return `${base}/${params.slug}`;
  return base;
}

export function extractBaseLang(langTag: string): SupportedLang {
  const base = langTag.split('-')[0].toLowerCase();
  return isSupportedLang(base) ? base : DEFAULT_LANG;
}
