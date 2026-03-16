import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ProjectData } from '../../data/projectsData';
import { ProgressiveImage } from '../ProgressiveImage';

interface ProjectGalleryProps {
  project: ProjectData;
}

export const ProjectGallery = forwardRef<HTMLDivElement, ProjectGalleryProps>(
  ({ project }, ref) => {
    const { t } = useTranslation('project');
    return (
      <div className="project-content__wrapper" ref={ref}>
        <div className="project-gallery">
          {project.galleryImages.map((image, index) => (
            <div key={image} className="project-gallery__item">
              <ProgressiveImage
                src={image}
                alt={t('gallery.imageAlt', { title: project.title, number: index + 1 })}
                loading={index < 2 ? 'eager' : 'lazy'}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }
);

ProjectGallery.displayName = 'ProjectGallery';
