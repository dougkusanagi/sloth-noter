// Small stroke icons for the editor's own DOM menus (outside React).
const svg = (body, extra = '') =>
  `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`

const heading = (level) =>
  svg(
    `<path d="M3 4.5v11M10 4.5v11M3 10h7" /><text x="12.4" y="16" font-size="8.5" font-family="system-ui, sans-serif" font-weight="600" fill="currentColor" stroke="none">${level}</text>`,
  )

export const blockIconMarkup = {
  p: svg('<path d="M4 5h12M10 5v11" />'),
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  h5: heading(5),
  h6: heading(6),
  numbered: svg(
    '<path d="M9 5h8M9 10h8M9 15h8M3.5 4l1.5-1v4.5M3 13.5c.4-.6 1-.9 1.6-.8.8.2 1 1 .5 1.6L3 17h3" />',
  ),
  list: svg(
    '<path d="M8 5h9M8 10h9M8 15h9" /><circle cx="4" cy="5" r=".8" fill="currentColor" /><circle cx="4" cy="10" r=".8" fill="currentColor" /><circle cx="4" cy="15" r=".8" fill="currentColor" />',
  ),
  task: svg('<rect x="3.5" y="3.5" width="13" height="13" rx="2.5" /><path d="M7 10l2 2 4-4.5" />'),
  code: svg('<path d="M7 5.5 2.5 10 7 14.5M13 5.5l4.5 4.5-4.5 4.5" />'),
  quote: svg('<path d="M4 15c2-1 3-3 3-5.5V5H3.5v5H7M12.5 15c2-1 3-3 3-5.5V5H12v5h3.5" />'),
  table: svg(
    '<rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M3 8h14M3 12h14M8 8v8" />',
  ),
  other: svg('<rect x="3.5" y="3.5" width="13" height="13" rx="2" /><path d="M7 8h6M7 12h4" />'),
  cut: svg(
    '<circle cx="6" cy="14.5" r="2" /><circle cx="14" cy="14.5" r="2" /><path d="M7.5 13 15 4M12.5 13 5 4" />',
  ),
  copy: svg(
    '<rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" />',
  ),
  trash: svg('<path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6M8.5 9v4M11.5 9v4" />'),
  add: svg('<rect x="3.5" y="3.5" width="13" height="13" rx="2" /><path d="M10 7v6M7 10h6" />'),
  indent: svg('<path d="M9 5h8M9 10h8M9 15h8M3 7.5 5.5 10 3 12.5" />'),
  outdent: svg('<path d="M9 5h8M9 10h8M9 15h8M5.5 7.5 3 10l2.5 2.5" />'),
  chevron: svg('<path d="M6 8l4 4 4-4" />'),
}

export const gripMarkup =
  '<svg class="cm-handle-grip" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="3.5" r="1.3"/><circle cx="10.5" cy="3.5" r="1.3"/><circle cx="5.5" cy="8" r="1.3"/><circle cx="10.5" cy="8" r="1.3"/><circle cx="5.5" cy="12.5" r="1.3"/><circle cx="10.5" cy="12.5" r="1.3"/></svg>'
