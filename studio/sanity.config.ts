import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './schemaTypes'
import { structure } from './structure'

export default defineConfig({
  name: 'architect-portfolio',
  title: 'Architect Portfolio',

  projectId: 'b2mcdo5v',
  dataset: 'production',

  plugins: [
    structureTool({ structure }),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
  },

  // Prevent singletons from appearing in "Create new" menu
  document: {
    newDocumentOptions: (prev) =>
      prev.filter(
        (item) => !['homepage', 'site'].includes(item.templateId),
      ),
  },
})
