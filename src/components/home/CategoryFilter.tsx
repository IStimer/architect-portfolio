import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import type { SanityCategory } from '../../services/projectService';

interface CategoryFilterProps {
  categories: SanityCategory[];
  activeSlug: string | null; // null = "All"
  lang: 'fr' | 'en';
  onFilter: (slug: string | null) => void;
}

const CategoryFilter = ({ categories, activeSlug, lang, onFilter }: CategoryFilterProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Subtle enter animation
  useEffect(() => {
    if (!containerRef.current) return;
    gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: -8 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', delay: 0.2 },
    );
  }, []);

  if (categories.length === 0) return null;

  return (
    <div ref={containerRef} className="category-filter" style={{ opacity: 0 }}>
      <button
        className={`category-filter__pill${activeSlug === null ? ' category-filter__pill--active' : ''}`}
        onClick={() => onFilter(null)}
      >
        {lang === 'fr' ? 'Tous' : 'All'}
      </button>
      {categories.map((cat) => (
        <button
          key={cat._id}
          className={`category-filter__pill${activeSlug === cat.slug ? ' category-filter__pill--active' : ''}`}
          onClick={() => onFilter(cat.slug)}
        >
          {cat.title[lang] ?? cat.title.fr}
        </button>
      ))}
    </div>
  );
};

export default CategoryFilter;
