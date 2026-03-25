import { useParams } from 'react-router-dom';
import { useMemo, useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate } from '../hooks/useLocalizedNavigate';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { useMinimap } from '../hooks/useMinimap';
import useMatchMedia from '../hooks/useMatchMedia';
import { useProjects } from '../hooks/useProjects';
import { fetchProjectDetail } from '../services/projectService';
import { localizedPath } from '../i18n/routes';
import type { ProjectData } from '../types';
import {
  ProjectHero,
  ProjectMeta,
  ProjectEditorial,
  ProjectMinimap,
  ProjectNextSection,
} from '../components/project';
import SEO from '../components/SEO';
import '../styles/pages/Project.scss';

const Project = () => {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation(['project', 'common']);
  const { navigateTo, currentLang } = useLocalizedNavigate();
  const { projects } = useProjects(currentLang as 'fr' | 'en');
  const isMobile = useMatchMedia('(max-width: 767px)');
  const showMinimap = useMatchMedia('(min-width: 1200px)');
  const scrollProgressRef = useScrollProgress(!isMobile);

  const listProject = useMemo(() => projects.find(p => p.slug === slug) ?? null, [slug, projects]);
  const nextProject = useMemo(() => {
    if (!listProject || projects.length === 0) return null;
    const currentIndex = projects.findIndex(p => p.slug === slug);
    const nextSlug = projects[(currentIndex + 1) % projects.length].slug;
    return projects.find(p => p.slug === nextSlug) ?? null;
  }, [slug, projects, listProject]);

  // Fetch detail to get editorialContent (not in list query)
  const [detailProject, setDetailProject] = useState<ProjectData | null>(null);
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setDetailProject(null);
    fetchProjectDetail(slug, currentLang as 'fr' | 'en').then((detail) => {
      if (!cancelled && detail) setDetailProject(detail);
    });
    return () => { cancelled = true; };
  }, [slug, currentLang]);

  // Merge: use detail data when available, fallback to list data
  const project = detailProject ?? listProject;

  const {
    contentRef,
    minimapWrapperRef,
    minimapContentRef,
    viewportRef,
    handleMinimapClick,
    handleMouseDown
  } = useMinimap({ enabled: showMinimap, contentKey: project?.slug });

  const handleNavigateToProject = useCallback((nextSlug: string) => {
    navigateTo('project', { slug: nextSlug });
  }, [navigateTo]);

  if (!project) {
    return <div>{t('common:errors.projectNotFound')}</div>;
  }

  return (
    <main className="project-page">
      <SEO
        title={project.title}
        description={t('project:seo.descriptionTemplate', { description: project.description, client: project.client, stack: project.stack.join(', ') })}
        path={localizedPath(currentLang, 'project', { slug: project.slug })}
        image={project.heroImage || project.galleryImages[0]}
        type="article"
      />
      {!isMobile && (
        <div
          ref={scrollProgressRef}
          className="progress-indicator"
          style={{ transform: 'scaleY(0)' }}
        />
      )}

      <ProjectHero
        key={slug}
        project={project}
        onBack={() => navigateTo('home')}
      />

      <ProjectMeta project={project} />

      <div className="project-content">
        {showMinimap && (
          <ProjectMinimap
            minimapWrapperRef={minimapWrapperRef}
            viewportRef={viewportRef}
            minimapContentRef={minimapContentRef}
            onMinimapClick={handleMinimapClick}
            onMouseDown={handleMouseDown}
          />
        )}

        <ProjectEditorial
          ref={contentRef}
          project={project}
        />
      </div>

      {nextProject && (
        <ProjectNextSection
          nextProject={nextProject}
          onNavigate={handleNavigateToProject}
        />
      )}
    </main>
  );
};

export default Project;
