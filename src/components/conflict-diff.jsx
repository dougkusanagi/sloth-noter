import { useMemo, useState } from 'react'
import { AlertTriangle, Check, GitCompareArrows, X } from 'lucide-react'
import { Modal } from './dialogs.jsx'
import { applyHunkChoices, mergeLines } from '../sync/merge.js'
import { displayName } from '../note-title.js'
import { t } from '../i18n.js'

const CONTEXT_LINES = 2

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
 * VS Code-inspired hunk-by-hunk diff reviewer for sync conflicts.
 * Lets the user accept/reject each difference individually or all at once.
 */
export function ConflictDiffModal({ note, conflict, onResolve, onClose }) {
  const merged = useMemo(
    () => mergeLines(conflict.base ?? null, note.body, conflict.theirs),
    [conflict.base, note.body, conflict.theirs],
  )
  const hunks = useMemo(() => {
    const list = []
    let hunkIndex = 0
    merged.chunks.forEach((chunk, chunkIndex) => {
      if (!chunk.conflict) return
      const prev = merged.chunks[chunkIndex - 1]?.lines ?? []
      const next = merged.chunks[chunkIndex + 1]?.lines ?? []
      list.push({
        index: hunkIndex++,
        before: prev.slice(-CONTEXT_LINES),
        after: next.slice(0, CONTEXT_LINES),
        ours: chunk.conflict.ours,
        theirs: chunk.conflict.theirs,
      })
    })
    return list
  }, [merged.chunks])

  const [choices, setChoices] = useState(() => hunks.map(() => 'theirs'))

  const setAll = (choice) => setChoices(hunks.map(() => choice))
  const setOne = (index, choice) =>
    setChoices((prev) => prev.map((value, i) => (i === index ? choice : value)))

  const apply = () => {
    const resolvedBody = applyHunkChoices(merged.chunks, choices)
    onResolve(resolvedBody)
  }

  return (
    <Modal
      label={t('sync.conflictDialogTitle', { name: displayName(note.name) })}
      className="sync-conflict-modal"
      backdropClose={onClose}
      onEscape={onClose}
    >
      <div className="sync-conflict-head">
        <div className="sync-conflict-head-title">
          <GitCompareArrows size={18} aria-hidden="true" />
          <div>
            <h2>{t('sync.conflictDialogTitle', { name: displayName(note.name) })}</h2>
            <p>
              {t(hunks.length === 1 ? 'sync.conflictCount.one' : 'sync.conflictCount.other', {
                count: hunks.length,
              })}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="sync-conflict-close"
          aria-label={t('dialog.close')}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="sync-conflict-toolbar">
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
      </div>

      <div className="sync-conflict-list">
        {hunks.length === 0 ? (
          <p className="sync-conflict-empty">{t('sync.conflictNoDiff')}</p>
        ) : (
          hunks.map((hunk) => {
            const current = choices[hunk.index] ?? 'theirs'
            return (
              <section key={hunk.index} className="sync-conflict-hunk">
                <div className="sync-conflict-hunk-bar">
                  <span className="sync-conflict-hunk-label">
                    {t('sync.conflictHunkLabel', { number: hunk.index + 1 })}
                  </span>
                  <div className="sync-conflict-hunk-actions" role="group">
                    <button
                      type="button"
                      className={`sync-conflict-chip${current === 'ours' ? ' is-selected' : ''}`}
                      aria-pressed={current === 'ours'}
                      onClick={() => setOne(hunk.index, 'ours')}
                    >
                      {t('sync.conflictPickLocal')}
                    </button>
                    <button
                      type="button"
                      className={`sync-conflict-chip${current === 'theirs' ? ' is-selected' : ''}`}
                      aria-pressed={current === 'theirs'}
                      onClick={() => setOne(hunk.index, 'theirs')}
                    >
                      {t('sync.conflictPickRemote')}
                    </button>
                    <button
                      type="button"
                      className={`sync-conflict-chip${current === 'both' ? ' is-selected' : ''}`}
                      aria-pressed={current === 'both'}
                      onClick={() => setOne(hunk.index, 'both')}
                    >
                      {t('sync.conflictPickBoth')}
                    </button>
                  </div>
                </div>

                {hunk.before.length > 0 && (
                  <pre className="sync-conflict-context">{hunk.before.join('\n')}</pre>
                )}

                <div
                  className={`sync-conflict-pane is-ours${
                    current === 'ours' || current === 'both' ? ' is-active' : ' is-dim'
                  }`}
                >
                  <div className="sync-conflict-pane-tag">{t('sync.thisDevice')}</div>
                  <pre>{hunk.ours.length ? hunk.ours.join('\n') : t('sync.conflictEmptySide')}</pre>
                </div>

                <div
                  className={`sync-conflict-pane is-theirs${
                    current === 'theirs' || current === 'both' ? ' is-active' : ' is-dim'
                  }`}
                >
                  <div className="sync-conflict-pane-tag">{t('sync.otherDevice')}</div>
                  <pre>
                    {hunk.theirs.length ? hunk.theirs.join('\n') : t('sync.conflictEmptySide')}
                  </pre>
                </div>

                {hunk.after.length > 0 && (
                  <pre className="sync-conflict-context">{hunk.after.join('\n')}</pre>
                )}
              </section>
            )
          })
        )}
      </div>
    </Modal>
  )
}
