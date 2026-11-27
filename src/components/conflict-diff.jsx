import { useMemo, useState } from 'react'
import { AlertTriangle, Check, GitCompareArrows, X } from 'lucide-react'
import { applyHunkChoices, mergeLines } from '../sync/merge.js'
import { t } from '../i18n.js'

/**
 * Discrete banner shown above a note that has a pending sync conflict.
 * Keeps the `.md` file untouched until the user reviews or chooses a version.
 */
export function ConflictBanner({ onReview, onKeepLocal, onAcceptRemote }) {
  return (
    <div className="sync-conflict-banner" role="region" aria-label={t('sync.conflictBannerTitle')}>
      <div className="sync-conflict-banner-info">
        <AlertTriangle size={16} aria-hidden="true" />
        <div className="sync-conflict-banner-copy">
          <strong>{t('sync.conflictBannerTitle')}</strong>
          <span>{t('sync.conflictBannerHint')}</span>
        </div>
      </div>
      <div className="sync-conflict-banner-actions">
        <button type="button" className="sync-conflict-btn primary" onClick={onReview}>
          <GitCompareArrows size={14} aria-hidden="true" />
          <span>{t('sync.conflictReview')}</span>
        </button>
        <button type="button" className="sync-conflict-btn" onClick={onAcceptRemote}>
          {t('sync.conflictUseRemote')}
        </button>
        <button type="button" className="sync-conflict-btn" onClick={onKeepLocal}>
          {t('sync.conflictKeepLocal')}
        </button>
      </div>
    </div>
  )
}

/**
 * Inline VS Code-inspired conflict reviewer rendered directly inside the note page.
 * Shows untouched sections of the note in place and highlights each conflicting hunk
 * with modern CodeLens-style actions to keep local, accept remote, or keep both.
 */
export function InlineConflictReview({ note, conflict, onResolve, onClose }) {
  const merged = useMemo(
    () => mergeLines(conflict.base ?? null, note.body, conflict.theirs),
    [conflict.base, note.body, conflict.theirs],
  )
  const hunkCount = useMemo(
    () => merged.chunks.filter((chunk) => Boolean(chunk.conflict)).length,
    [merged.chunks],
  )

  const [choices, setChoices] = useState(() => Array.from({ length: hunkCount }, () => 'theirs'))

  const setAll = (choice) => setChoices(Array.from({ length: hunkCount }, () => choice))
  const setOne = (index, choice) =>
    setChoices((prev) => prev.map((value, i) => (i === index ? choice : value)))

  const apply = () => {
    const resolvedBody = applyHunkChoices(merged.chunks, choices)
    onResolve(resolvedBody)
  }

  let hunkCursor = 0

  return (
    <section
      className="inline-conflict-view"
      aria-label={t('sync.conflictDialogTitle', { name: note.name })}
    >
      <header className="inline-conflict-bar">
        <div className="inline-conflict-bar-title">
          <GitCompareArrows size={16} aria-hidden="true" />
          <div>
            <strong>{t('sync.conflictInlineTitle')}</strong>
            <span>
              {t(hunkCount === 1 ? 'sync.conflictCount.one' : 'sync.conflictCount.other', {
                count: hunkCount,
              })}
            </span>
          </div>
        </div>
        <div className="inline-conflict-bar-actions">
          <button type="button" className="sync-conflict-btn" onClick={() => setAll('ours')}>
            {t('sync.conflictKeepAllLocal')}
          </button>
          <button type="button" className="sync-conflict-btn" onClick={() => setAll('theirs')}>
            {t('sync.conflictAcceptAllRemote')}
          </button>
          <button type="button" className="sync-conflict-btn primary" onClick={apply}>
            <Check size={14} aria-hidden="true" />
            <span>{t('sync.conflictApply')}</span>
          </button>
          <button
            type="button"
            className="sync-conflict-close"
            aria-label={t('dialog.close')}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="inline-conflict-doc">
        {hunkCount === 0 ? (
          <p className="sync-conflict-empty">{t('sync.conflictNoDiff')}</p>
        ) : (
          merged.chunks.map((chunk, chunkIndex) => {
            if (chunk.lines) {
              return (
                <pre key={`ctx-${chunkIndex}`} className="inline-conflict-unchanged">
                  {chunk.lines.join('\n')}
                </pre>
              )
            }
            const index = hunkCursor++
            const current = choices[index] ?? 'theirs'
            const oursActive = current === 'ours' || current === 'both'
            const theirsActive = current === 'theirs' || current === 'both'
            return (
              <div key={`hunk-${index}`} className="inline-conflict-hunk">
                <div className="inline-conflict-codelens">
                  <span className="inline-conflict-hunk-badge">
                    {t('sync.conflictHunkLabel', { number: index + 1 })}
                  </span>
                  <div className="inline-conflict-lens-group" role="group">
                    <button
                      type="button"
                      className={`inline-conflict-lens${current === 'ours' ? ' is-selected' : ''}`}
                      aria-pressed={current === 'ours'}
                      onClick={() => setOne(index, 'ours')}
                    >
                      {current === 'ours' && <Check size={12} aria-hidden="true" />}
                      <span>{t('sync.conflictPickLocal')}</span>
                    </button>
                    <button
                      type="button"
                      className={`inline-conflict-lens${current === 'theirs' ? ' is-selected' : ''}`}
                      aria-pressed={current === 'theirs'}
                      onClick={() => setOne(index, 'theirs')}
                    >
                      {current === 'theirs' && <Check size={12} aria-hidden="true" />}
                      <span>{t('sync.conflictPickRemote')}</span>
                    </button>
                    <button
                      type="button"
                      className={`inline-conflict-lens${current === 'both' ? ' is-selected' : ''}`}
                      aria-pressed={current === 'both'}
                      onClick={() => setOne(index, 'both')}
                    >
                      {current === 'both' && <Check size={12} aria-hidden="true" />}
                      <span>{t('sync.conflictPickBoth')}</span>
                    </button>
                  </div>
                </div>

                <div
                  className={`inline-conflict-side is-ours${oursActive ? ' is-active' : ' is-dim'}`}
                >
                  <div className="inline-conflict-side-head">
                    <span>{t('sync.thisDevice')}</span>
                    {oursActive && (
                      <span className="inline-conflict-selected-tag">
                        <Check size={11} aria-hidden="true" />
                        {t('sync.conflictSelected')}
                      </span>
                    )}
                  </div>
                  <pre>
                    {chunk.conflict.ours.length
                      ? chunk.conflict.ours.join('\n')
                      : t('sync.conflictEmptySide')}
                  </pre>
                </div>

                <div
                  className={`inline-conflict-side is-theirs${theirsActive ? ' is-active' : ' is-dim'}`}
                >
                  <div className="inline-conflict-side-head">
                    <span>{t('sync.otherDevice')}</span>
                    {theirsActive && (
                      <span className="inline-conflict-selected-tag">
                        <Check size={11} aria-hidden="true" />
                        {t('sync.conflictSelected')}
                      </span>
                    )}
                  </div>
                  <pre>
                    {chunk.conflict.theirs.length
                      ? chunk.conflict.theirs.join('\n')
                      : t('sync.conflictEmptySide')}
                  </pre>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
