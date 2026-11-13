import { useId, useState } from 'react'
import { t } from '../i18n.js'

const ERRORS = new Set([
  'offline',
  'unauthorized',
  'rate_limited',
  'server_error',
  'wrong_key',
  'bad_recovery',
  'insecure_server',
  'redirect',
  'missing_image',
  'busy',
])
const errorText = (code) => t(ERRORS.has(code) ? `sync.error.${code}` : 'sync.error.failed')

function formatTime(at) {
  return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    timeStyle: 'short',
  }).format(at)
}

/** Settings → Sync: status, first setup with preview, and disconnect. */
export function SyncPanel({ sync }) {
  const { status } = sync

  if (status.state === 'checking') return <p className="setting-empty">{t('sync.checking')}</p>
  if (status.state === 'unavailable')
    return (
      <p className="setting-empty">
        {t(status.reason === 'none' ? 'sync.noVaultWeb' : 'sync.noVault')}
      </p>
    )

  if (status.state !== 'off')
    return (
      <div className="sync-panel">
        <div className="setting">
          <div className="setting-text">
            <span>{t('sync.server')}</span>
            <p className="sync-server">{status.server}</p>
          </div>
        </div>
        <p className="sync-status" role="status" aria-live="polite">
          {status.state === 'syncing'
            ? t('sync.syncing')
            : status.state === 'error'
              ? errorText(status.error)
              : status.at
                ? t('sync.doneAt', { time: formatTime(status.at) })
                : t('sync.ready')}
          {status.conflicts > 0 && ` ${t('sync.conflicts', { count: status.conflicts })}`}
        </p>
        <div className="sync-actions">
          <button className="button" disabled={status.state === 'syncing'} onClick={sync.run}>
            {t('sync.now')}
          </button>
          <button
            className="button"
            onClick={async () => {
              if (window.confirm(t('sync.disconnectConfirm'))) await sync.disconnect()
            }}
          >
            {t('sync.disconnect')}
          </button>
        </div>
      </div>
    )

  return <SetupForm sync={sync} />
}

/** First setup. Mounted only while sync is off, so it always starts from the form. */
function SetupForm({ sync }) {
  const id = useId()
  const [step, setStep] = useState('form')
  const [mode, setMode] = useState('new')
  const [server, setServer] = useState('')
  const [token, setToken] = useState('')
  const [recovery, setRecovery] = useState('')
  const [created, setCreated] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [prepared, setPrepared] = useState(null)
  const field = (key, label, input) => (
    <div className="sync-field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      {input}
    </div>
  )

  if (step === 'preview' && prepared)
    return (
      <div className="sync-panel">
        <h4>{t('sync.previewTitle')}</h4>
        <ul className="sync-preview">
          <li>{t('sync.previewDownload', { count: prepared.preview.download })}</li>
          <li>{t('sync.previewUpload', { count: prepared.preview.upload })}</li>
          {prepared.preview.sameName.length > 0 && (
            <li>{t('sync.previewSameName', { names: prepared.preview.sameName.join(', ') })}</li>
          )}
        </ul>
        <p className="setting-hint">{t('sync.previewHint')}</p>
        {error && (
          <p className="sync-error" role="alert">
            {error}
          </p>
        )}
        <div className="sync-actions">
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError('')
              try {
                await sync.connect({ server, token, key: prepared.key })
              } catch {
                setError(t('sync.noVault'))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? t('sync.syncing') : t('sync.start')}
          </button>
          <button className="button" disabled={busy} onClick={() => setStep('form')}>
            {t('sync.back')}
          </button>
        </div>
      </div>
    )

  const key = mode === 'new' ? created : recovery
  const ready = server.trim() && token.trim() && key && (mode === 'existing' || saved)
  return (
    <form
      className="sync-panel"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!ready || busy) return
        setBusy(true)
        setError('')
        try {
          setPrepared(await sync.prepare({ server, token, recovery: key }))
          setStep('preview')
        } catch (failure) {
          const code = failure?.name === 'OperationError' ? 'wrong_key' : failure?.code
          setError(errorText(code))
        } finally {
          setBusy(false)
        }
      }}
    >
      <p className="setting-hint">{t('sync.intro')}</p>
      {field(
        'server',
        t('sync.server'),
        <input
          id={`${id}-server`}
          type="url"
          required
          placeholder="https://sloth-note-sync.example.workers.dev"
          value={server}
          onChange={(event) => setServer(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />,
      )}
      {field(
        'token',
        t('sync.token'),
        <input
          id={`${id}-token`}
          type="password"
          required
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
        />,
      )}
      <fieldset className="sync-mode">
        <legend>{t('sync.keyTitle')}</legend>
        <label>
          <input
            type="radio"
            name={`${id}-mode`}
            checked={mode === 'new'}
            onChange={() => setMode('new')}
          />
          {t('sync.keyNew')}
        </label>
        <label>
          <input
            type="radio"
            name={`${id}-mode`}
            checked={mode === 'existing'}
            onChange={() => setMode('existing')}
          />
          {t('sync.keyExisting')}
        </label>
      </fieldset>
      {mode === 'new' ? (
        created ? (
          <div className="sync-recovery">
            <p>{t('sync.recoveryHint')}</p>
            <code aria-label={t('sync.recoveryKey')}>{created}</code>
            <div className="sync-actions">
              <button
                type="button"
                className="button"
                onClick={() => navigator.clipboard?.writeText(created)}
              >
                {t('sync.copy')}
              </button>
            </div>
            <label className="sync-check">
              <input
                type="checkbox"
                checked={saved}
                onChange={(event) => setSaved(event.target.checked)}
              />
              {t('sync.recoverySaved')}
            </label>
          </div>
        ) : (
          <button
            type="button"
            className="button"
            onClick={async () => setCreated(await sync.newRecoveryKey())}
          >
            {t('sync.createKey')}
          </button>
        )
      ) : (
        field(
          'recovery',
          t('sync.recoveryKey'),
          <input
            id={`${id}-recovery`}
            type="text"
            required
            value={recovery}
            onChange={(event) => setRecovery(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />,
        )
      )}
      {error && (
        <p className="sync-error" role="alert">
          {error}
        </p>
      )}
      <div className="sync-actions">
        <button className="button primary" type="submit" disabled={!ready || busy}>
          {busy ? t('sync.checkingServer') : t('sync.continue')}
        </button>
      </div>
    </form>
  )
}
