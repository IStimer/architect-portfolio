import { defineType, defineField } from 'sanity'
import { TextIcon } from '@sanity/icons'

export const textBlock = defineType({
  name: 'textBlock',
  title: 'Text Block',
  type: 'object',
  icon: TextIcon,
  fields: [
    defineField({
      name: 'text',
      title: 'Text',
      type: 'object',
      validation: (rule) => rule.required(),
      fields: [
        defineField({ name: 'fr', title: 'Francais', type: 'text', rows: 6 }),
        defineField({ name: 'en', title: 'English', type: 'text', rows: 6 }),
      ],
    }),
    defineField({
      name: 'style',
      title: 'Style',
      type: 'string',
      initialValue: 'paragraph',
      options: {
        list: [
          { title: 'Paragraph', value: 'paragraph' },
          { title: 'Quote', value: 'quote' },
          { title: 'Heading', value: 'heading' },
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
    }),
    defineField({
      name: 'alignment',
      title: 'Alignment',
      type: 'string',
      initialValue: 'left',
      options: {
        list: [
          { title: 'Left', value: 'left' },
          { title: 'Center', value: 'center' },
          { title: 'Right', value: 'right' },
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
    }),
    defineField({
      name: 'maxWidth',
      title: 'Max Width',
      type: 'string',
      initialValue: 'medium',
      options: {
        list: [
          { title: 'Narrow (600px)', value: 'narrow' },
          { title: 'Medium (900px)', value: 'medium' },
          { title: 'Wide (1200px)', value: 'wide' },
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
    }),
  ],
  preview: {
    select: {
      style: 'style',
      textFr: 'text.fr',
      textEn: 'text.en',
    },
    prepare({ style, textFr, textEn }) {
      const text = textFr || textEn || ''
      return {
        title: `Text — ${style ?? 'paragraph'}`,
        subtitle: text.substring(0, 80) + (text.length > 80 ? '...' : ''),
      }
    },
  },
})
