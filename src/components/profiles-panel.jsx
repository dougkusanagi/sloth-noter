import { useEffect, useId, useRef, useState } from 'react'
import { Check, Pencil, Plus, UserRound } from 'lucide-react'
import { t } from '../i18n.js'
import { MAX_PROFILES, addProfile, renameProfile } from '../profiles.js'
import { PROFILES_CHANGED } from '../hooks/use-profile.js'

const nameError = (error) =>
  t(
    error?.message === 'duplicate_name'
      ? 'profiles.error.duplicate'
      : error?.message === 'invalid_name'
        ? 'profiles.error.name'
        : 'profiles.error',
  )

/** Inline name field for creating or renaming a profile. Escape cancels. */
function NameForm({ label, initial = '', submit, onSubmit, onCancel, busy }) {
  const id = useId()
  const [value, setValue] = useState(initial)
  const input = useRef(null)
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  return (
    <form
      className="profile-name-form"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(value)
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        ref={input}
        maxLength={100}
        placeholder={label}
        value={value}
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onCancel()
          }
        }}
      />
      <button className="button primary" type="submit" disabled={busy || !value.trim()}>
        {submit}
      </button>
      <button className="button" type="button" disabled={busy} onClick={onCancel}>
        {t('dialog.cancel')}
      </button>
    </form>
  )
}

/**
 * Settings → Profiles: each profile has its own notes and sync account. Rename and
 * create here; using another profile restarts the app (ADR 0023).
 */
export function ProfilesPanel({ invoke, profileId }) {
  const [catalog, setCatalog] = useState(null)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    invoke?.('profiles_load')
      .then((value) => alive && setCatalog(value))
      .catch(() => alive && setError(t('profiles.error')))
    return () => {
      alive = false
    }
  }, [invoke])
  if (!invoke) return <p className="setting-empty">{t('profiles.desktopOnly')}</p>
  if (!catalog)
    return error ? <p className="sync-error">{error}</p> : <p className="setting-empty">…</p>

  const save = async (change) => {
    let next
    try {
      next = change(catalog)
    } catch (failure) {
      setError(nameError(failure))
      return
    }
    setBusy(true)
    setError('')
    try {
      await invoke('profiles_save', { catalog: next })
      setCatalog(next)
      setEditing(null)
      window.dispatchEvent(new Event(PROFILES_CHANGED))
    } catch {
      setError(t('profiles.error'))
    } finally {
      setBusy(false)
    }
  }
  const use = async (profile) => {
    const current = catalog.profiles.find((item) => item.id === profileId)
    const message = t('profiles.switchConfirm', {
      name: profile.name,
      current: current?.name ?? '',
    })
    if (!window.confirm(message)) return
    setBusy(true)
    setError('')
    try {
      await invoke('profile_switch', { catalog: { ...catalog, active: profile.id } })
    } catch {
      setError(t('profiles.error'))
      setBusy(false)
    }
  }
  const full = catalog.profiles.length >= MAX_PROFILES

  return (
    <div className="profiles-panel">
      <p className="setting-hint">{t('profiles.hint')}</p>
      <ul className="profile-list" aria-label={t('profiles.title')}>
        {catalog.profiles.map((profile) => {
          const current = profile.id === profileId
          return (
            <li key={profile.id} className={current ? 'profile-row current' : 'profile-row'}>
              <UserRound size={18} aria-hidden="true" className="profile-icon" />
              {editing === profile.id ? (
                <NameForm
                  label={t('profiles.renameLabel', { name: profile.name })}
                  initial={profile.name}
                  submit={t('profiles.save')}
                  busy={busy}
                  onCancel={() => {
                    setEditing(null)
                    setError('')
                  }}
                  onSubmit={(name) => save((value) => renameProfile(value, profile.id, name))}
                />
              ) : (
                <>
                  <span className="profile-name">
                    <span>{profile.name}</span>
                    {current && (
                      <span className="profile-badge">
                        <Check size={12} aria-hidden="true" />
                        {t('profiles.current')}
                      </span>
                    )}
                  </span>
                  <span className="profile-actions">
                    <button
                      className="button"
                      disabled={busy || editing !== null}
                      aria-label={t('profiles.renameLabel', { name: profile.name })}
                      onClick={() => {
                        setError('')
                        setEditing(profile.id)
                      }}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      <span>{t('profiles.rename')}</span>
                    </button>
                    {!current && (
                      <button
                        className="button"
                        disabled={busy || editing !== null}
                        aria-label={t('profiles.useLabel', { name: profile.name })}
                        onClick={() => use(profile)}
                      >
                        {t('profiles.switch')}
                      </button>
                    )}
                  </span>
                </>
              )}
            </li>
          )
        })}
      </ul>
      {editing === 'new' ? (
        <NameForm
          label={t('profiles.newName')}
          submit={t('profiles.create')}
          busy={busy}
          onCancel={() => {
            setEditing(null)
            setError('')
          }}
          onSubmit={(name) => save((value) => addProfile(value, name))}
        />
      ) : (
        <div className="sync-actions">
          <button
            className="button"
            disabled={full || busy || editing !== null}
            onClick={() => {
              setError('')
              setEditing('new')
            }}
          >
            <Plus size={14} aria-hidden="true" />
            <span>{t('profiles.new')}</span>
          </button>
        </div>
      )}
      {full && <p className="setting-hint">{t('profiles.full', { count: MAX_PROFILES })}</p>}
      {error && (
        <p className="sync-error" role="alert">
          {error}
        </p>
      )}
      <p className="setting-hint">{t('profiles.newHint')}</p>
    </div>
  )
}
