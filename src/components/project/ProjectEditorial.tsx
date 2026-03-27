import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProjectData } from '../../types';
import { EditorialBlock } from './EditorialBlock';
import { TextBlock } from './TextBlock';
import { ProgressiveImage } from '../ProgressiveImage';

interface ProjectEditorialProps {
  project: ProjectData;
}

export const ProjectEditorial = forwardRef<HTMLDivElement, ProjectEditorialProps>(
  ({ project }, ref) => {
    const { t } = useTranslation('project');
    const hasEditorial = project.editorialContent && project.editorialContent.length > 0;

    // Fallback to legacy galleryImages
    if (!hasEditorial) {
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

    return (
      <div className="project-editorial" ref={ref}>
        {project.editorialContent!.map((block) => {
          if (block._type === 'textBlock') {
            return (
              <div key={block._key} data-reveal="fade-up" style={{ visibility: 'hidden' }}>
                <TextBlock block={block} />
              </div>
            );
          }
          return (
            <div key={block._key} data-reveal="fade-up" style={{ visibility: 'hidden' }}>
              <EditorialBlock block={block} />
            </div>
          );
        })}
      </div>
    );
  }
);

ProjectEditorial.displayName = 'ProjectEditorial';
