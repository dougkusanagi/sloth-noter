import { useEffect, useId, useState } from 'react'
import { t } from '../i18n.js'
import { MAX_PROFILES, addProfile } from '../profiles.js'

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
  'quota_exceeded',
])
const errorText = (code) => t(ERRORS.has(code) ? `sync.error.${code}` : 'sync.error.failed')

function formatTime(at) {
  return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    timeStyle: 'short',
  }).format(at)
}

/** Settings → Sync: status, first setup with preview, and disconnect. */
export function SyncPanel({ sync }) {
  return (
    <>
      <ProfilesPanel invoke={sync.invoke} profileId={sync.profileId} />
      <SyncStatus sync={sync} />
    </>
  )
}

/** Local profiles: each has its own notes and its own sync space. Switching restarts the app. */
function ProfilesPanel({ invoke, profileId }) {
  const [catalog, setCatalog] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    invoke?.('profiles_load')
      .then((value) => alive && setCatalog(value))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [invoke])
  if (!invoke || !catalog) return null
  const apply = async (next, command) => {
    setBusy(true)
    setError('')
    try {
      await invoke(command, { catalog: next })
      if (command === 'profiles_save') setCatalog(next)
    } catch {
      setError(t('profiles.error'))
    } finally {
      setBusy(false)
    }
  }
  const full = catalog.profiles.length >= MAX_PROFILES
  return (
    <div className="sync-panel">
      <h4>{t('profiles.title')}</h4>
      <p className="setting-hint">{t('profiles.hint')}</p>
      <ul className="sync-preview">
        {catalog.profiles.map((profile) => (
          <li
            key={profile.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              justifyContent: 'space-between',
            }}
          >
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              {profile.name}
              {profile.id === profileId && ` — ${t('profiles.current')}`}
            </span>
            {profile.id !== profileId && (
              <button
                className="button"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(t('profiles.switchConfirm', { name: profile.name })))
                    apply({ ...catalog, active: profile.id }, 'profile_switch')
                }}
              >
                {t('profiles.switch')}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="sync-actions"
        onSubmit={(event) => {
          event.preventDefault()
          try {
            apply(addProfile(catalog, name), 'profiles_save')
            setName('')
          } catch {
            setError(t('profiles.error'))
          }
        }}
      >
        <input
          aria-label={t('profiles.newName')}
          placeholder={t('profiles.newName')}
          maxLength={100}
          value={name}
          disabled={full || busy}
          onChange={(event) => setName(event.target.value)}
        />
        <button className="button" type="submit" disabled={full || busy || !name.trim()}>
          {t('profiles.create')}
        </button>
      </form>
      {full && <p className="setting-hint">{t('profiles.full', { count: MAX_PROFILES })}</p>}
      {error && (
        <p className="sync-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function SyncStatus({ sync }) {
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
