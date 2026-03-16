import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { extractBaseLang } from '../i18n/routes';

const LanguageRedirect = () => {
  const { i18n } = useTranslation();
  const lang = extractBaseLang(i18n.language);
  return <Navigate to={`/${lang}`} replace />;
};

export default LanguageRedirect;
