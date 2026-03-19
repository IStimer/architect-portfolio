import { useParams } from 'react-router-dom';
import { useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate } from '../hooks/useLocalizedNavigate';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { useMinimap } from '../hooks/useMinimap';
import useMatchMedia from '../hooks/useMatchMedia';
import { useNextProjectAnimation } from '../hooks/useNextProjectAnimation';
import { useProjects } from '../hooks/useProjects';
import { localizedPath } from '../i18n/routes';
import {
  ProjectHero,
  ProjectGallery,
  ProjectMinimap,
  ProjectNextSection,
  ProjectNextMobile,
  ProjectInfo
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

  const project = useMemo(() => projects.find(p => p.slug === slug) ?? null, [slug, projects]);
  const nextProject = useMemo(() => {
    if (!project || projects.length === 0) return null;
    const currentIndex = projects.findIndex(p => p.slug === slug);
    const nextSlug = projects[(currentIndex + 1) % projects.length].slug;
    return projects.find(p => p.slug === nextSlug) ?? null;
  }, [slug, projects, project]);

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

  const {
    nextProjectRef,
    nextProjectBgRef,
    progressCircleRef,
    progressNumberRef,
    handleClickNavigate
  } = useNextProjectAnimation({
    nextProject,
    currentSlug: slug,
    onNavigateToProject: handleNavigateToProject,
    isMobile
  });

  // Preload next project gallery when visible
  useEffect(() => {
    if (!nextProject || !nextProjectRef.current) return;
    const el = nextProjectRef.current;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextProject]);

  if (!project) {
    return <div>{t('common:errors.projectNotFound')}</div>;
  }

  return (
    <main className="project-page">
      <SEO
        title={project.title}
        description={t('project:seo.descriptionTemplate', { description: project.description, client: project.client, stack: project.stack.join(', ') })}
        path={localizedPath(currentLang, 'project', { slug: project.slug })}
        image={project.galleryImages[0]}
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
        totalProjects={projects.length}
        onBack={() => navigateTo('home')}
      />

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

        {isMobile && <ProjectInfo project={project} />}

        <ProjectGallery
          ref={contentRef}
          project={project}
        />
      </div>

      {nextProject && (
        isMobile ? (
          <ProjectNextMobile nextProject={nextProject} onNavigate={handleNavigateToProject} />
        ) : (
          <ProjectNextSection
            ref={nextProjectRef}
            nextProject={nextProject}
            nextProjectBgRef={nextProjectBgRef}
            progressCircleRef={progressCircleRef}
            progressNumberRef={progressNumberRef}
            onClickNavigate={handleClickNavigate}
          />
        )
      )}
    </main>
  );
};

export default Project;
