import { Facet } from '@codemirror/state'

/** True where a properties panel shows the YAML block, so its lines can be hidden. */
export const hideFrontmatter = Facet.define({ combine: (values) => values[0] ?? false })
