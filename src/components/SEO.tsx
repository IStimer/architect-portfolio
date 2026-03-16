import { Helmet } from 'react-helmet-async';
import { useParams } from 'react-router-dom';
import { isSupportedLang, DEFAULT_LANG, SUPPORTED_LANGS, localizedPath } from '../i18n/routes';
import type { SupportedLang } from '../i18n/routes';

const SITE_NAME = 'Portfolio';
const SITE_URL = 'https://example.com';

const LOCALE_MAP: Record<SupportedLang, string> = {
  fr: 'fr_FR',
  en: 'en_US'
};

interface SEOProps {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: 'website' | 'article';
}

const SEO = ({ title, description, path, image, type = 'website' }: SEOProps) => {
  const { lang } = useParams<{ lang: string }>();
  const currentLang: SupportedLang = lang && isSupportedLang(lang) ? lang : DEFAULT_LANG;

  const fullTitle = `${title} | ${SITE_NAME}`;
  const url = `${SITE_URL}${path}`;
  const imageUrl = image ? `${SITE_URL}${image}` : undefined;

  const buildAlternates = () => {
    const pathWithoutLang = path.replace(`/${currentLang}`, '');
    const segments = pathWithoutLang.split('/').filter(Boolean);

    if (segments.length === 0) {
      return SUPPORTED_LANGS.map(l => ({
        lang: l,
        href: `${SITE_URL}${localizedPath(l, 'home')}`
      }));
    }

    if (segments[0] === 'a-propos' || segments[0] === 'about') {
      return SUPPORTED_LANGS.map(l => ({
        lang: l,
        href: `${SITE_URL}${localizedPath(l, 'about')}`
      }));
    }

    if ((segments[0] === 'projet' || segments[0] === 'project') && segments[1]) {
      return SUPPORTED_LANGS.map(l => ({
        lang: l,
        href: `${SITE_URL}${localizedPath(l, 'project', { slug: segments[1] })}`
      }));
    }

    return [];
  };

  const alternates = buildAlternates();

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:locale" content={LOCALE_MAP[currentLang]} />
      <meta property="og:site_name" content={SITE_NAME} />
      {imageUrl && <meta property="og:image" content={imageUrl} />}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {imageUrl && <meta name="twitter:image" content={imageUrl} />}

      {alternates.map(alt => (
        <link key={alt.lang} rel="alternate" hrefLang={alt.lang} href={alt.href} />
      ))}
      {alternates.length > 0 && (
        <link rel="alternate" hrefLang="x-default" href={alternates[0].href} />
      )}

      <script type="application/ld+json">
        {JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebSite',
              name: SITE_NAME,
              url: SITE_URL
            },
            {
              '@type': 'Person',
              name: SITE_NAME,
              url: SITE_URL
            }
          ]
        })}
      </script>
    </Helmet>
  );
};

export default SEO;
