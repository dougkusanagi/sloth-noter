import { t } from './i18n.js'

/** Accessible text of a section badge, with the "doing" and "waiting" counts when present. */
export function progressLabel(done, total, doing = 0, waiting = 0) {
  const extra = [
    doing && t('progress.doing', { count: doing }),
    waiting && t('progress.waiting', { count: waiting }),
  ].filter(Boolean)
  return [t('progress.label', { done, total }), ...extra].join(', ')
}

/** Width of each bar segment, in percent of the total. */
export const progressShares = (done, total, doing = 0, waiting = 0) => ({
  done: (done / total) * 100,
  doing: (doing / total) * 100,
  waiting: (waiting / total) * 100,
})

/**
 * The "2/8" badge after a heading whose section holds tasks: a small bar split by status
 * (done, doing, waiting). The count is drawn by CSS so it never becomes part of the heading text.
 */
export function progressBadge(done, total, doing = 0, waiting = 0) {
  const badge = document.createElement('span')
  badge.className = 'section-progress'
  if (done === total) badge.dataset.complete = ''
  badge.setAttribute('role', 'img')
  badge.setAttribute('aria-label', progressLabel(done, total, doing, waiting))
  badge.contentEditable = 'false'
  const share = progressShares(done, total, doing, waiting)
  badge.innerHTML = `<span class="section-progress-bar" aria-hidden="true"><span class="section-progress-done" style="width:${share.done}%"></span><span class="section-progress-doing" style="width:${share.doing}%"></span><span class="section-progress-waiting" style="width:${share.waiting}%"></span></span><span class="section-progress-count" data-count="${done}/${total}"></span>`
  return badge
}
