import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { usePageTransition } from './usePageTransition';
import { localizedPath, DEFAULT_LANG, isSupportedLang } from '../i18n/routes';
import type { SupportedLang } from '../i18n/routes';

export const useLocalizedNavigate = () => {
  const { lang } = useParams<{ lang: string }>();
  const { transitionTo, isNavigating } = usePageTransition();

  const currentLang: SupportedLang = lang && isSupportedLang(lang) ? lang : DEFAULT_LANG;

  const navigateTo = useCallback(
    (route: 'home' | 'about' | 'project', params?: { slug?: string }) => {
      const path = localizedPath(currentLang, route, params);
      transitionTo(path);
    },
    [currentLang, transitionTo]
  );

  return { navigateTo, currentLang, isNavigating };
};
