import type { StructureResolver } from 'sanity/structure'
import { HomeIcon, DocumentIcon, TagIcon, CogIcon } from '@sanity/icons'

// Singleton helper — opens the document directly, no list
function singletonItem(
  S: Parameters<StructureResolver>[0],
  typeName: string,
  title: string,
  icon: React.ComponentType,
) {
  return S.listItem()
    .title(title)
    .icon(icon)
    .child(S.document().schemaType(typeName).documentId(typeName))
}

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      // ── Homepage (singleton) ──────────────────────────────────
      singletonItem(S, 'homepage', 'Homepage', HomeIcon),

      S.divider(),

      // ── Projects ──────────────────────────────────────────────
      S.listItem()
        .title('Projects')
        .icon(DocumentIcon)
        .child(
          S.documentTypeList('project')
            .title('Projects')
            .defaultOrdering([{ field: 'sortOrder', direction: 'asc' }]),
        ),

      // ── Categories ────────────────────────────────────────────
      S.listItem()
        .title('Categories')
        .icon(TagIcon)
        .child(
          S.documentTypeList('category')
            .title('Categories')
            .defaultOrdering([{ field: 'sortOrder', direction: 'asc' }]),
        ),

      S.divider(),

      // ── Site Configuration (singleton) ────────────────────────
      singletonItem(S, 'site', 'Site Configuration', CogIcon),
    ])
