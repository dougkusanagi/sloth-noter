import { t } from './i18n.js'

export const RADIUS = 5.5
export const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * The "2/8" badge after a heading whose section holds tasks: a small ring that fills as
 * tasks are checked. The count is drawn by CSS so it never becomes part of the heading text.
 */
export function progressBadge(done, total) {
  const badge = document.createElement('span')
  badge.className = 'section-progress'
  if (done === total) badge.dataset.complete = ''
  badge.setAttribute('role', 'img')
  badge.setAttribute('aria-label', t('progress.label', { done, total }))
  badge.contentEditable = 'false'
  badge.innerHTML = `<svg viewBox="0 0 14 14" aria-hidden="true"><circle class="section-progress-track" cx="7" cy="7" r="${RADIUS}"/><circle class="section-progress-fill" cx="7" cy="7" r="${RADIUS}" stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="${CIRCUMFERENCE * (1 - done / total)}"/></svg><span class="section-progress-count" data-count="${done}/${total}"></span>`
  return badge
}
