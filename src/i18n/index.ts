import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import frCommon from './locales/fr/common.json';
import frHome from './locales/fr/home.json';
import frProject from './locales/fr/project.json';

import enCommon from './locales/en/common.json';
import enHome from './locales/en/home.json';
import enProject from './locales/en/project.json';

const detectedLng = navigator.language.startsWith('fr') ? 'fr' : 'en';

i18n
  .use(initReactI18next)
  .init({
    lng: detectedLng,
    resources: {
      fr: {
        common: frCommon,
        home: frHome,
        project: frProject
      },
      en: {
        common: enCommon,
        home: enHome,
        project: enProject
      }
    },
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
    ns: ['common', 'home', 'project'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false
    }
  });
