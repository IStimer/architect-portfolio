import { defineType, defineField, defineArrayMember } from 'sanity'
import { CogIcon } from '@sanity/icons'

export const site = defineType({
  name: 'site',
  title: 'Site Configuration',
  type: 'document',
  icon: CogIcon,
  fields: [
    defineField({
      name: 'title',
      title: 'Internal title',
      type: 'string',
      readOnly: true,
      initialValue: 'Site Configuration',
      hidden: true,
    }),

    // ── Identity ────────────────────────────────────────────────
    defineField({
      name: 'siteName',
      title: 'Site Name',
      type: 'string',
      group: 'identity',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'siteUrl',
      title: 'Site URL',
      type: 'url',
      group: 'identity',
      validation: (rule) => rule.uri({ scheme: ['https'] }),
    }),

    // ── Contact ─────────────────────────────────────────────────
    defineField({
      name: 'email',
      title: 'Contact Email',
      type: 'string',
      group: 'contact',
      validation: (rule) => rule.email(),
    }),
    defineField({
      name: 'phone',
      title: 'Phone',
      type: 'string',
      group: 'contact',
    }),
    defineField({
      name: 'address',
      title: 'Address',
      type: 'text',
      group: 'contact',
      rows: 3,
    }),

    // ── Social ──────────────────────────────────────────────────
    defineField({
      name: 'social',
      title: 'Social Links',
      type: 'object',
      group: 'contact',
      fields: [
        defineField({ name: 'instagram', title: 'Instagram', type: 'url' }),
        defineField({ name: 'linkedin', title: 'LinkedIn', type: 'url' }),
        defineField({ name: 'behance', title: 'Behance', type: 'url' }),
        defineField({ name: 'pinterest', title: 'Pinterest', type: 'url' }),
      ],
    }),

    // ── Navigation ──────────────────────────────────────────────
    defineField({
      name: 'mainNav',
      title: 'Main Navigation',
      type: 'array',
      group: 'navigation',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name: 'label',
              title: 'Label',
              type: 'object',
              fields: [
                defineField({ name: 'fr', title: 'Français', type: 'string' }),
                defineField({ name: 'en', title: 'English', type: 'string' }),
              ],
            }),
            defineField({ name: 'path', title: 'Path', type: 'string' }),
          ],
          preview: {
            select: { title: 'label.fr', subtitle: 'path' },
          },
        }),
      ],
    }),

    // ── Footer ──────────────────────────────────────────────────
    defineField({
      name: 'footerText',
      title: 'Footer Text',
      type: 'object',
      group: 'navigation',
      fields: [
        defineField({ name: 'fr', title: 'Français', type: 'text', rows: 2 }),
        defineField({ name: 'en', title: 'English', type: 'text', rows: 2 }),
      ],
    }),

    // ── SEO Defaults ────────────────────────────────────────────
    defineField({
      name: 'seoDefaults',
      title: 'Default SEO',
      type: 'object',
      group: 'seo',
      description: 'Fallback values used when a page does not define its own SEO fields.',
      fields: [
        defineField({ name: 'title', title: 'Default Meta Title', type: 'string' }),
        defineField({
          name: 'description',
          title: 'Default Meta Description',
          type: 'text',
          validation: (rule) => rule.max(160).warning('Keep under 160 characters'),
        }),
        defineField({ name: 'image', title: 'Default OG Image', type: 'image' }),
      ],
    }),
  ],
  groups: [
    { name: 'identity', title: 'Identity', default: true },
    { name: 'contact', title: 'Contact & Social' },
    { name: 'navigation', title: 'Navigation' },
    { name: 'seo', title: 'SEO Defaults' },
  ],
  preview: {
    prepare() {
      return { title: 'Site Configuration' }
    },
  },
})
