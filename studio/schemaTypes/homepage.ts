import { defineType, defineField } from 'sanity'
import { HomeIcon } from '@sanity/icons'

export const homepage = defineType({
  name: 'homepage',
  title: 'Homepage',
  type: 'document',
  icon: HomeIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Internal title',
      type: 'string',
      readOnly: true,
      initialValue: 'Homepage',
      hidden: true,
    }),

    // ── Identity ────────────────────────────────────────────────
    defineField({
      name: 'heading',
      title: 'Heading',
      type: 'object',
      group: 'identity',
      fields: [
        defineField({ name: 'fr', title: 'Français', type: 'string' }),
        defineField({ name: 'en', title: 'English', type: 'string' }),
      ],
    }),
    defineField({
      name: 'tagline',
      title: 'Tagline',
      type: 'object',
      group: 'identity',
      fields: [
        defineField({ name: 'fr', title: 'Français', type: 'string' }),
        defineField({ name: 'en', title: 'English', type: 'string' }),
      ],
    }),

    // ── SEO ─────────────────────────────────────────────────────
    defineField({
      name: 'seo',
      title: 'SEO',
      type: 'object',
      group: 'seo',
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
  groups: [
    { name: 'identity', title: 'Content', default: true },
    { name: 'seo', title: 'SEO' },
  ],
  preview: {
    prepare() {
      return { title: 'Homepage' }
    },
  },
})
