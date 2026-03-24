import { defineType, defineField } from 'sanity'
import { ImageIcon } from '@sanity/icons'

export const editorialBlock = defineType({
  name: 'editorialBlock',
  title: 'Editorial Block',
  type: 'object',
  icon: ImageIcon,
  fields: [
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: { hotspot: true },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'imageWidth',
      title: 'Image Width',
      type: 'string',
      initialValue: 'full',
      options: {
        list: [
          { title: 'Full width (100%)', value: 'full' },
          { title: 'Large (75%)', value: 'large' },
          { title: 'Half (50%)', value: 'half' },
          { title: 'Third (33%)', value: 'third' },
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
    }),
    defineField({
      name: 'text',
      title: 'Text',
      type: 'object',
      fields: [
        defineField({ name: 'fr', title: 'Francais', type: 'text', rows: 4 }),
        defineField({ name: 'en', title: 'English', type: 'text', rows: 4 }),
      ],
    }),
    defineField({
      name: 'textPosition',
      title: 'Text Position',
      type: 'string',
      initialValue: 'below',
      options: {
        list: [
          { title: 'Below image', value: 'below' },
          { title: 'Top left', value: 'top-left' },
          { title: 'Top right', value: 'top-right' },
          { title: 'Bottom left', value: 'bottom-left' },
          { title: 'Bottom right', value: 'bottom-right' },
          { title: 'Overlay on image', value: 'overlay' },
        ],
        layout: 'radio',
      },
      hidden: ({ parent }) => !parent?.text?.fr && !parent?.text?.en,
    }),
    defineField({
      name: 'spacing',
      title: 'Spacing',
      type: 'string',
      initialValue: 'normal',
      options: {
        list: [
          { title: 'Tight', value: 'tight' },
          { title: 'Normal', value: 'normal' },
          { title: 'Loose', value: 'loose' },
        ],
        layout: 'radio',
        direction: 'horizontal',
      },
    }),
  ],
  preview: {
    select: {
      media: 'image',
      imageWidth: 'imageWidth',
      textPosition: 'textPosition',
      textFr: 'text.fr',
    },
    prepare({ media, imageWidth, textPosition, textFr }) {
      const width = imageWidth ?? 'full'
      const pos = textFr ? (textPosition ?? 'below') : 'no text'
      return {
        title: `Image ${width} — ${pos}`,
        subtitle: textFr ? textFr.substring(0, 60) + (textFr.length > 60 ? '...' : '') : '',
        media,
      }
    },
  },
})
