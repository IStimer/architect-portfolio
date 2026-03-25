import { Outlet, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isSupportedLang, DEFAULT_LANG } from '../i18n/routes';
import { useProjects } from '../hooks/useProjects';
import { OGLCanvasProvider } from '../contexts/OGLCanvasContext';

const LanguageLayout = () => {
  const { lang } = useParams<{ lang: string }>();
  const { i18n } = useTranslation();

  const isValid = lang && isSupportedLang(lang);

  if (!isValid) {
    return <Navigate to={`/${DEFAULT_LANG}`} replace />;
  }

  if (i18n.language !== lang) {
    i18n.changeLanguage(lang);
  }
  document.documentElement.lang = lang;

  const { projects } = useProjects(lang as 'fr' | 'en');

  return (
    <OGLCanvasProvider projects={projects}>
      <Outlet />
    </OGLCanvasProvider>
  );
};

export default LanguageLayout;
