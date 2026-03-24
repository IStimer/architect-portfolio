import { defineType, defineField, defineArrayMember } from 'sanity'
import { DocumentIcon } from '@sanity/icons'

export const project = defineType({
  name: 'project',
  title: 'Project',
  type: 'document',
  icon: DocumentIcon,
  groups: [
    { name: 'identity', title: 'Identity', default: true },
    { name: 'content', title: 'Content' },
    { name: 'media', title: 'Media' },
    { name: 'seo', title: 'SEO' },
  ],
  fields: [
    // ── Identity ────────────────────────────────────────────────
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      group: 'identity',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'identity',
      options: { source: 'title' },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'reference',
      group: 'identity',
      to: [{ type: 'category' }],
    }),
    defineField({
      name: 'year',
      title: 'Year',
      type: 'number',
      group: 'identity',
    }),
    defineField({
      name: 'client',
      title: 'Client',
      type: 'string',
      group: 'identity',
    }),
    defineField({
      name: 'sortOrder',
      title: 'Sort Order',
      type: 'number',
      group: 'identity',
      initialValue: 0,
    }),
    defineField({
      name: 'featured',
      title: 'Featured',
      type: 'boolean',
      group: 'identity',
      initialValue: false,
    }),

    // ── Content ─────────────────────────────────────────────────
    defineField({
      name: 'subtitle',
      title: 'Subtitle',
      type: 'object',
      group: 'content',
      fields: [
        defineField({ name: 'fr', title: 'Français', type: 'string' }),
        defineField({ name: 'en', title: 'English', type: 'string' }),
      ],
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'object',
      group: 'content',
      fields: [
        defineField({ name: 'fr', title: 'Français', type: 'text' }),
        defineField({ name: 'en', title: 'English', type: 'text' }),
      ],
    }),
    defineField({
      name: 'role',
      title: 'Role',
      type: 'object',
      group: 'content',
      fields: [
        defineField({ name: 'fr', title: 'Français', type: 'string' }),
        defineField({ name: 'en', title: 'English', type: 'string' }),
      ],
    }),
    defineField({
      name: 'stack',
      title: 'Stack',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({ type: 'string' })],
    }),
    defineField({
      name: 'contractType',
      title: 'Contract Type',
      type: 'object',
      group: 'content',
      fields: [
        defineField({ name: 'fr', title: 'Français', type: 'string' }),
        defineField({ name: 'en', title: 'English', type: 'string' }),
      ],
    }),

    // ── Editorial ──────────────────────────────────────────────
    defineField({
      name: 'editorialContent',
      title: 'Editorial Content',
      type: 'array',
      group: 'content',
      of: [
        defineArrayMember({ type: 'editorialBlock' }),
        defineArrayMember({ type: 'textBlock' }),
      ],
    }),

    // ── Media ───────────────────────────────────────────────────
    defineField({
      name: 'heroImage',
      title: 'Hero Image',
      type: 'image',
      group: 'media',
      description: 'Preview image used on homepage listings and project hero banner.',
      options: { hotspot: true },
    }),
    defineField({
      name: 'galleryImages',
      title: 'Gallery Images (Legacy)',
      type: 'array',
      group: 'media',
      description: 'Deprecated — use Editorial Content instead. Kept for backward compatibility.',
      of: [defineArrayMember({ type: 'image', options: { hotspot: true } })],
    }),

    // ── SEO ─────────────────────────────────────────────────────
    defineField({
      name: 'seo',
      title: 'SEO Overrides',
      type: 'object',
      group: 'seo',
      description: 'Leave empty to use defaults from Site Configuration.',
      fields: [
        defineField({ name: 'title', title: 'Meta Title', type: 'string' }),
        defineField({
          name: 'description',
          title: 'Meta Description',
          type: 'text',
          validation: (rule) => rule.max(160).warning('Keep under 160 characters'),
        }),
        defineField({ name: 'image', title: 'OG Image', type: 'image' }),
      ],
    }),
  ],
  orderings: [
    {
      title: 'Sort Order',
      name: 'sortOrderAsc',
      by: [{ field: 'sortOrder', direction: 'asc' }],
    },
    {
      title: 'Year (newest first)',
      name: 'yearDesc',
      by: [{ field: 'year', direction: 'desc' }],
    },
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'client',
      media: 'heroImage',
      year: 'year',
    },
    prepare({ title, subtitle, media, year }) {
      return {
        title,
        subtitle: [subtitle, year].filter(Boolean).join(' · '),
        media,
      }
    },
  },
})
