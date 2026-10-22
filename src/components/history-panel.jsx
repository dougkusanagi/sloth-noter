import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Segmented, Switch } from './controls.jsx'
import { HISTORY_DAYS, HISTORY_LIMITS, historyDays, historyLimit } from '../history.js'
import { displayName } from '../note-title.js'
import { t } from '../i18n.js'

const origins = {
  abertura: 'Nota aberta',
  'input.paste': 'Colado',
  codigo: 'Editado no modo Código',
  disco: 'Alterado fora do app',
  'disco-externo': 'Arquivo externo alterado',
  restauracao: 'Versão restaurada',
  sistema: 'Alterado pelo app',
  formatacao: 'Formatação',
  tarefa: 'Tarefa alterada',
  lista: 'Lista alterada',
  bloco: 'Bloco inserido',
  conflito: 'Cópia de conflito',
  copia: 'Copiado para minhas notas',
}
export function historyOriginLabel(origin) {
  if (origins[origin]) return origins[origin]
  if (origin.startsWith('delete')) return 'Texto apagado'
  if (origin.startsWith('input.type')) return 'Digitado'
  if (origin.startsWith('input.replace')) return 'Texto substituído'
  if (origin.startsWith('input.drop')) return 'Texto arrastado'
  if (origin === 'undo') return 'Alteração desfeita'
  if (origin === 'redo') return 'Alteração refeita'
  return 'Alterado pelo app'
}

function Row({ id, title, hint, children }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <label htmlFor={id}>{title}</label>
        {hint && <p>{hint}</p>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

/** History settings and the saved versions of the open note, inside Settings. */
export function HistoryPanel({ prefs, note, history, onChange, onRestore }) {
  const enabled = prefs.historyEnabled === true
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(null)
  const [pendingClear, setPendingClear] = useState(null)
  useEffect(() => {
    let live = true
    setEntries(null)
    setSelected(null)
    if (!note?.id) return
    history
      .list(note.id)
      .then((items) => {
        if (live) setEntries(items.reverse())
      })
      .catch(() => {
        if (live) setError(t('history.readError'))
      })
    return () => {
      live = false
    }
  }, [history, note?.id])
  async function restore(entry) {
    setBusy(true)
    setError('')
    try {
      onRestore(await history.object(entry.objeto))
    } catch {
      setError(t('history.restoreError'))
    } finally {
      setBusy(false)
    }
  }
  async function clear(all) {
    setBusy(true)
    setError('')
    try {
      await history.clear(all ? null : note.id)
      setEntries([])
      setSelected(null)
    } catch {
      setError(t('history.clearError'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Row id="settings-history" title={t('history.keep')} hint={t('history.keepHint')}>
        <Switch
          id="settings-history"
          checked={enabled}
          onChange={(historyEnabled) => onChange({ historyEnabled })}
        />
      </Row>
      <Row title={t('history.days')} hint={t('history.daysHint')}>
        <Segmented
          name="history-days"
          label={t('history.days')}
          options={HISTORY_DAYS.map((id) => ({ id, text: t('history.days.n', { count: id }) }))}
          value={historyDays(prefs)}
          onChange={(historyDays) => onChange({ historyDays })}
        />
      </Row>
      <Row title={t('history.limit')} hint={t('history.limitHint')}>
        <Segmented
          name="history-limit"
          label={t('history.limit')}
          options={HISTORY_LIMITS.map((id) => ({ id, text: `${id} MB` }))}
          value={historyLimit(prefs)}
          onChange={(historyLimit) => onChange({ historyLimit })}
        />
      </Row>
      <section className="history-versions" aria-labelledby="history-versions-title">
        <h4 id="history-versions-title">
          {t('history.versions')}
          {note && <span> · {displayName(note.name)}</span>}
        </h4>
        {!enabled && <p className="history-note">{t('history.off')}</p>}
        {error && (
          <p role="alert" className="history-error">
            {error}
          </p>
        )}
        {!note && <p className="history-note">{t('history.noNote')}</p>}
        {note && !entries && !error && (
          <p role="status" className="history-note">
            {t('history.loading')}
          </p>
        )}
        {entries?.length === 0 && (
          <p className="history-note">{t(enabled ? 'history.empty' : 'history.emptyOff')}</p>
        )}
        <ol>
          {entries?.map((entry, index) => {
            const open = selected === index
            const when = new Date(entry.t)
            return (
              <li key={`${entry.t}-${index}`}>
                {(index === 0 || entry.dia !== entries[index - 1].dia) && (
                  <h5>{when.toLocaleDateString('pt-BR', { dateStyle: 'full' })}</h5>
                )}
                <button
                  className="history-version"
                  aria-expanded={open}
                  onClick={() => setSelected(open ? null : index)}
                >
                  <ChevronRight size={14} aria-hidden="true" />
                  <time dateTime={when.toISOString()}>
                    {when.toLocaleTimeString('pt-BR', { timeStyle: 'short' })}
                  </time>
                  <span>{historyOriginLabel(entry.origem)}</span>
                  {entry.alertas?.includes('colagem-sem-gesto') && (
                    <strong>{t('history.pasted')}</strong>
                  )}
                  {entry.alertas?.includes('remocao-grande') && (
                    <strong>{t('history.bigRemoval')}</strong>
                  )}
                </button>
                {open && (
                  <div className="history-detail">
                    {entry.mudancas.map((change, i) => (
                      <div key={i}>
                        {change.removido && (
                          <>
                            <h6>{t('history.removed')}</h6>
                            <pre className="removed">{change.removido}</pre>
                          </>
                        )}
                        {change.inserido && (
                          <>
                            <h6>{t('history.inserted')}</h6>
                            <pre className="inserted">{change.inserido}</pre>
                          </>
                        )}
                      </div>
                    ))}
                    <button className="button" disabled={busy} onClick={() => restore(entry)}>
                      {busy ? t('history.restoring') : t('history.restore')}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </section>
      <div className="setting history-clear">
        <div className="setting-text">
          <span>{t('history.clear')}</span>
          <p>{t('history.clearHint')}</p>
        </div>
        <div className="setting-control">
          <button
            className="button"
            disabled={busy || !note}
            onClick={() => setPendingClear(false)}
          >
            {t('history.clearNote')}
          </button>
          <button className="button" disabled={busy} onClick={() => setPendingClear(true)}>
            {t('history.clearAll')}
          </button>
        </div>
      </div>
      {pendingClear !== null && (
        <div className="history-confirm" role="group" aria-label={t('history.clear')}>
          <p>
            {t(pendingClear ? 'history.confirmAll' : 'history.confirmNote')}{' '}
            {t('history.confirmNever')}
          </p>
          <button
            className="button danger"
            disabled={busy}
            autoFocus
            onClick={() => {
              void clear(pendingClear)
              setPendingClear(null)
            }}
          >
            {t('history.confirm')}
          </button>
          <button className="button" disabled={busy} onClick={() => setPendingClear(null)}>
            {t('history.cancel')}
          </button>
        </div>
      )}
    </>
  )
}
