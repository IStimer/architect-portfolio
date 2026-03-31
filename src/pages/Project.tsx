import { useParams } from 'react-router-dom';
import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import { useLocalizedNavigate } from '../hooks/useLocalizedNavigate';
import { useScrollProgress } from '../hooks/useScrollProgress';
import { useMinimap } from '../hooks/useMinimap';
import useMatchMedia from '../hooks/useMatchMedia';
import { useProjects } from '../hooks/useProjects';
import { fetchProjectDetail } from '../services/projectService';
import { localizedPath } from '../i18n/routes';
import { revealIn, revealOut } from '../utils/revealText';
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

  // ── Animation refs ──
  const metaRef = useRef<HTMLDivElement>(null);
  const projectContentRef = useRef<HTMLDivElement>(null);
  const nextSectionRef = useRef<HTMLDivElement>(null);
  const exitingRef = useRef(false);
  const pageRef = useRef<HTMLElement>(null);

  // ── Entrance animations (IntersectionObserver) ──
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const revealEls = page.querySelectorAll<HTMLElement>('[data-reveal]');
    if (revealEls.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          observer.unobserve(el);

          const type = el.dataset.reveal;
          const delay = parseFloat(el.dataset.revealDelay ?? '0');

          if (type === 'text') {
            revealIn(el, { duration: 0.8, delay });
          } else if (type === 'slide-up') {
            // Wrapper mask: overflow hidden on parent, children slide up
            gsap.fromTo(el.children, { yPercent: 100 }, {
              yPercent: 0,
              duration: 0.7,
              delay,
              ease: 'power2.out',
              stagger: 0.05,
            });
            el.style.visibility = 'visible';
          } else if (type === 'fade-up') {
            gsap.fromTo(el, { y: 40, opacity: 0 }, {
              y: 0,
              opacity: 1,
              duration: 0.8,
              delay,
              ease: 'power2.out',
            });
            el.style.visibility = 'visible';
          }
        });
      },
      { threshold: 0.15 },
    );

    revealEls.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [project?.slug, detailProject]);

  const animateOut = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;

    const duration = 0.5;
    const ease = 'power3.in';

    // Progress indicator
    const progress = document.querySelector('.progress-indicator') as HTMLElement | null;
    if (progress) gsap.to(progress, { opacity: 0, duration: 0.3 });

    // Meta section — revealOut on text elements, stagger on info items
    if (metaRef.current) {
      const subtitle = metaRef.current.querySelector('.project-meta__subtitle') as HTMLElement | null;
      const desc = metaRef.current.querySelector('.project-meta__description') as HTMLElement | null;
      const infoItems = metaRef.current.querySelectorAll('.project-meta__info-item');
      const links = metaRef.current.querySelector('.project-meta__links') as HTMLElement | null;

      if (subtitle) revealOut(subtitle, { duration: duration });
      if (desc) revealOut(desc, { duration: duration });

      // Each info-item is its own mask — animate children up inside it
      infoItems.forEach((item, idx) => {
        const el = item as HTMLElement;
        el.style.overflow = 'hidden';
        gsap.to(el.children, {
          yPercent: -100,
          duration,
          ease,
          delay: idx * 0.04,
        });
      });

      // Links — same mask pattern
      if (links) {
        links.style.overflow = 'hidden';
        gsap.to(links.children, { yPercent: -100, duration, ease });
      }
    }

    // Editorial / gallery content — slide down and clip
    if (projectContentRef.current) {
      gsap.to(projectContentRef.current, {
        yPercent: 5,
        opacity: 0,
        duration: duration + 0.1,
        ease,
      });
    }

    // Next section
    if (nextSectionRef.current) {
      gsap.to(nextSectionRef.current, {
        yPercent: 10,
        opacity: 0,
        duration,
        ease,
      });
    }
  }, []);

  const handleBack = useCallback(() => {
    navigateTo('home');
  }, [navigateTo]);

  const handleNavigateToProject = useCallback((nextSlug: string) => {
    navigateTo('project', { slug: nextSlug });
  }, [navigateTo]);

  if (!project) {
    return <div>{t('common:errors.projectNotFound')}</div>;
  }

  return (
    <main ref={pageRef} className="project-page">
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
        onBack={handleBack}
        onExitStart={animateOut}
      />

      <div ref={metaRef}>
        <ProjectMeta project={project} />
      </div>

      <div ref={projectContentRef} className="project-content">
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
        <div ref={nextSectionRef} data-reveal="fade-up" style={{ visibility: 'hidden' }}>
          <ProjectNextSection
            nextProject={nextProject}
            onNavigate={handleNavigateToProject}
          />
        </div>
      )}
    </main>
  );
};

export default Project;
