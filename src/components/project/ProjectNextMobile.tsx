import { useTranslation } from 'react-i18next';
import type { ProjectData } from '../../types';
import FitWords from '../ui/FitWords';

interface ProjectNextMobileProps {
  nextProject: ProjectData;
  onNavigate: (slug: string) => void;
}

export const ProjectNextMobile = ({ nextProject, onNavigate }: ProjectNextMobileProps) => {
  const { t } = useTranslation('common');

  return (
    <div className="project-next-mobile">
      <span className="project-next-mobile__label">{t('labels.nextProject')}</span>
      <h2 className="project-next-mobile__title">
        <FitWords text={nextProject.title} className="project-next-mobile__title-word" />
      </h2>
      <button
        className="project-next-mobile__button"
        onClick={() => onNavigate(nextProject.slug)}
      >
        {t('nav.discoverProject')}
      </button>
    </div>
  );
};
