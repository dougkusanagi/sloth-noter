import { useId, useState } from 'react'
import { Eye, EyeOff, QrCode } from 'lucide-react'
import { t } from '../i18n.js'
import { DEFAULT_SERVER, MIN_PASSWORD } from '../sync/account.js'
import {
  decodePairingPayload,
  decodePairingRequest,
  encryptPairingForRequester,
} from '../sync/qr-pairing.js'
import { Segmented } from './controls.jsx'
import { SyncPairingModal } from './sync-pairing-modal.jsx'

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

/** A password field with a button that shows or hides what was typed. */
function PasswordInput({ shown, onToggle, ...props }) {
  return (
    <span className="password-input">
      <input {...props} type={shown ? 'text' : 'password'} />
      <button
        type="button"
        aria-label={t(shown ? 'sync.hidePassword' : 'sync.showPassword')}
        aria-pressed={shown}
        onClick={onToggle}
      >
        {shown ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </span>
  )
}

/** Settings → Account and sync: account, status, first sync preview and sign out. */
export function SyncPanel({ sync }) {
  return <SyncStatus sync={sync} />
}

function scanPairingQrCode() {
  if (typeof window.SlothSystem?.scanQrCode !== 'function') return Promise.resolve(null)
  return new Promise((resolve) => {
    const requestId = Date.now() % 1000000
    window.__slothQrScanResult = (id, raw) => {
      if (id !== requestId) return
      delete window.__slothQrScanResult
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        resolve(parsed?.ok && parsed.text ? String(parsed.text) : '')
      } catch {
        resolve('')
      }
    }
    window.SlothSystem.scanQrCode(requestId)
  })
}

function SyncStatus({ sync }) {
  const { status } = sync
  const [pairingModal, setPairingModal] = useState(null)
  const [pairingMsg, setPairingMsg] = useState('')
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteCode, setPasteCode] = useState('')

  async function approveReverseQr(raw) {
    setPairingMsg('')
    const parsed = decodePairingRequest(raw)
    if (!parsed.ok) {
      setPairingMsg(t('sync.qr.invalid'))
      return false
    }
    const creds = sync.exportPairingCredentials?.()
    if (!creds) {
      setPairingMsg(t('sync.qr.unavailable'))
      return false
    }
    try {
      const encrypted = await encryptPairingForRequester(parsed.request.pub, creds)
      const base = parsed.request.server.replace(/\/$/, '')
      const res = await fetch(`${base}/v1/pairing/${encodeURIComponent(parsed.request.id)}/approve`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${creds.token}`,
        },
        body: JSON.stringify({ encrypted }),
      })
      if (!res.ok) {
        setPairingMsg(t('sync.qr.expired'))
        return false
      }
      setPairingMsg(t('sync.qr.approved'))
      setPasteMode(false)
      setPasteCode('')
      return true
    } catch {
      setPairingMsg(t('sync.qr.invalid'))
      return false
    }
  }

  async function handleScanComputer() {
    const scanned = await scanPairingQrCode()
    if (scanned === null) {
      setPasteMode((v) => !v)
      return
    }
    if (scanned) await approveReverseQr(scanned)
  }

  if (status.state === 'checking') return <p className="setting-empty">{t('sync.checking')}</p>
  if (status.state === 'unavailable')
    return (
      <p className="setting-empty">
        {t(status.reason === 'none' ? 'sync.noVaultWeb' : 'sync.noVault')}
      </p>
    )
  if (status.state === 'off') return <AccountForm sync={sync} />

  const { account } = status
  return (
    <>
      <div className="sync-panel">
        <div className="setting">
          <div className="setting-text">
            <span>{t(account ? 'sync.account' : 'sync.oldConnection')}</span>
            {account ? (
              <p className="sync-server">
                {account.name} · {account.email}
              </p>
            ) : (
              <p className="setting-hint">{t('sync.oldConnectionHint')}</p>
            )}
            {status.server !== DEFAULT_SERVER && (
              <p className="sync-server setting-hint">
                {t('sync.serverAt', { server: status.server })}
              </p>
            )}
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
            type="button"
            onClick={() => setPairingModal('direct')}
          >
            <QrCode size={15} aria-hidden="true" />
            {t('sync.qr.connectDevice')}
          </button>
          <button
            className="button"
            type="button"
            onClick={handleScanComputer}
          >
            <QrCode size={15} aria-hidden="true" />
            {t('sync.qr.scanComputer')}
          </button>
          <button
            className="button"
            onClick={async () => {
              if (window.confirm(t('sync.disconnectConfirm'))) await sync.disconnect()
            }}
          >
            {t(account ? 'sync.signOut' : 'sync.disconnect')}
          </button>
        </div>
        {pasteMode && (
          <div className="sync-field">
            <input
              type="text"
              value={pasteCode}
              placeholder={t('sync.qr.pastePlaceholder')}
              onChange={(event) => setPasteCode(event.target.value)}
            />
            <button
              type="button"
              className="button primary"
              onClick={() => void approveReverseQr(pasteCode)}
            >
              {t('sync.qr.confirmCode')}
            </button>
          </div>
        )}
        {pairingMsg && (
          <p className="sync-status" role="status">
            {pairingMsg}
          </p>
        )}
      </div>
      {pairingModal && (
        <SyncPairingModal
          mode={pairingModal}
          server={status.server}
          sync={sync}
          onClose={() => setPairingModal(null)}
        />
      )}
      {!account && <AccountForm sync={sync} server={status.server} />}
    </>
  )
}

const BUSY = { signup: 'sync.creating', signin: 'sync.signingIn', recover: 'sync.resetting' }
const SUBMIT = { signup: 'sync.createAccount', signin: 'sync.signIn', recover: 'sync.resetSubmit' }
// Codes the form explains next to the fields; the rest use the general sync errors.
const FORM_ERRORS = new Set([
  'bad_email',
  'bad_name',
  'weak_password',
  'invalid_invite',
  'email_taken',
  'invalid_login',
  'invalid_recovery',
  'bad_recovery',
  'no_accounts',
])
const formError = (code) =>
  code === 'rate_limited'
    ? t('sync.error.too_many')
    : FORM_ERRORS.has(code)
      ? t(`sync.error.${code}`, { count: MIN_PASSWORD })
      : errorText(code)

/**
 * Create an account, sign in, or set a new password with the recovery key (ADR 0024).
 * Mounted while sync is off, or below an old-style connection to move it to an account.
 */
function AccountForm({ sync, server: initialServer = DEFAULT_SERVER }) {
  const id = useId()
  const [step, setStep] = useState('form')
  const [mode, setMode] = useState('signup')
  const [server, setServer] = useState(initialServer)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [invite, setInvite] = useState('')
  const [recovery, setRecovery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [prepared, setPrepared] = useState(null)
  const [reverseModal, setReverseModal] = useState(false)
  const [qrPasteOpen, setQrPasteOpen] = useState(false)
  const [qrPasteCode, setQrPasteCode] = useState('')

  async function applyDirectQr(raw) {
    setError('')
    const decoded = decodePairingPayload(raw)
    if (!decoded.ok) {
      setError(t(decoded.error === 'expired' ? 'sync.qr.expired' : 'sync.qr.invalid'))
      return
    }
    setBusy(true)
    try {
      await sync.connectFromPairing(decoded.credentials)
    } catch {
      setError(t('sync.noVault'))
    } finally {
      setBusy(false)
    }
  }

  async function handleSignInByQr() {
    const scanned = await scanPairingQrCode()
    if (scanned === null) {
      setQrPasteOpen((v) => !v)
      return
    }
    if (scanned) await applyDirectQr(scanned)
  }
  const field = (key, label, input, hint) => (
    <div className="sync-field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      {input}
      {hint && (
        <p className="setting-hint" id={`${id}-${key}-hint`}>
          {hint}
        </p>
      )}
    </div>
  )
  const back = () => {
    if (prepared) void sync.discard(prepared.session)
    setPrepared(null)
    setStep('form')
  }

  if (step === 'recovery' && prepared)
    return (
      <div className="sync-panel">
        <h4>{t('sync.created')}</h4>
        <div className="sync-recovery">
          <p>{t('sync.recoveryHint')}</p>
          <code aria-label={t('sync.recoveryKey')}>{prepared.session.recovery}</code>
          <div className="sync-actions">
            <button
              type="button"
              className="button"
              onClick={() => navigator.clipboard?.writeText(prepared.session.recovery)}
            >
              {t('sync.copy')}
            </button>
            <button type="button" className="button primary" onClick={() => setStep('preview')}>
              {t('sync.continue')}
            </button>
          </div>
        </div>
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
                await sync.connect(prepared.session)
              } catch {
                setError(t('sync.noVault'))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? t('sync.syncing') : t('sync.start')}
          </button>
          <button className="button" disabled={busy} onClick={back}>
            {t('sync.back')}
          </button>
        </div>
      </div>
    )

  // A new password is typed twice, so a typo does not lock the person out.
  const confirming = mode !== 'signin'
  const mismatch = confirming && confirm !== '' && confirm !== password
  const ready =
    email.trim() &&
    password &&
    (!confirming || confirm === password) &&
    (mode !== 'signup' || (name.trim() && invite.trim())) &&
    (mode !== 'recover' || recovery.trim())
  const switchMode = (next) => {
    setMode(next)
    setError('')
  }
  return (
    <form
      className="sync-panel"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault()
        if (!ready || busy) return
        setBusy(true)
        setError('')
        try {
          const target = server.trim()
          const result =
            mode === 'signup'
              ? await sync.signUp({ server: target, name, email, password, invite })
              : mode === 'signin'
                ? await sync.signIn({ server: target, email, password })
                : await sync.recover({ server: target, email, recovery, password })
          const session = { ...result, server: target }
          let preview
          try {
            preview = await sync.preview(session)
          } catch (failure) {
            void sync.discard(session)
            throw failure
          }
          setPassword('')
          setConfirm('')
          setPrepared({ session, preview })
          setStep(mode === 'signup' ? 'recovery' : 'preview')
        } catch (failure) {
          const code = failure?.name === 'OperationError' ? 'wrong_key' : failure?.code
          setError(formError(code))
        } finally {
          setBusy(false)
        }
      }}
    >
      <p className="setting-hint">{t('sync.intro')}</p>
      {mode === 'recover' ? (
        <div className="sync-recover-head">
          <h4>{t('sync.resetTitle')}</h4>
          <p className="setting-hint">{t('sync.resetHint')}</p>
        </div>
      ) : (
        <Segmented
          name={`${id}-mode`}
          label={t('sync.accountMode')}
          value={mode}
          onChange={switchMode}
          options={[
            { id: 'signup', text: t('sync.createAccount') },
            { id: 'signin', text: t('sync.signIn') },
          ]}
        />
      )}
      {mode === 'signup' &&
        field(
          'name',
          t('sync.name'),
          <input
            id={`${id}-name`}
            required
            maxLength={100}
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />,
        )}
      {field(
        'email',
        t('sync.email'),
        <input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          required
          maxLength={254}
          autoComplete={mode === 'signup' ? 'email' : 'username'}
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />,
      )}
      {mode === 'recover' &&
        field(
          'recovery',
          t('sync.recoveryKey'),
          <input
            id={`${id}-recovery`}
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={recovery}
            onChange={(event) => setRecovery(event.target.value)}
          />,
        )}
      {field(
        'password',
        t(mode === 'recover' ? 'sync.newPassword' : 'sync.password'),
        <PasswordInput
          id={`${id}-password`}
          shown={showPassword}
          onToggle={() => setShowPassword((value) => !value)}
          required
          minLength={mode === 'signin' ? undefined : MIN_PASSWORD}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          aria-describedby={mode === 'signin' ? undefined : `${id}-password-hint`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />,
        mode === 'signin' ? null : t('sync.passwordHint', { count: MIN_PASSWORD }),
      )}
      {confirming &&
        field(
          'confirm',
          t('sync.confirmPassword'),
          <PasswordInput
            id={`${id}-confirm`}
            shown={showPassword}
            onToggle={() => setShowPassword((value) => !value)}
            required
            autoComplete="new-password"
            aria-invalid={mismatch || undefined}
            aria-describedby={mismatch ? `${id}-confirm-error` : undefined}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />,
        )}
      {mismatch && (
        <p className="sync-error" id={`${id}-confirm-error`}>
          {t('sync.passwordMismatch')}
        </p>
      )}
      {mode === 'signup' &&
        field(
          'invite',
          t('sync.invite'),
          <input
            id={`${id}-invite`}
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-describedby={`${id}-invite-hint`}
            value={invite}
            onChange={(event) => setInvite(event.target.value)}
          />,
          t('sync.inviteHint'),
        )}
      {error && (
        <p className="sync-error" role="alert">
          {error}
        </p>
      )}
      <div className="sync-actions">
        <button className="button primary" type="submit" disabled={!ready || busy}>
          {busy ? t(BUSY[mode]) : t(SUBMIT[mode])}
        </button>
        {mode === 'signin' && (
          <button type="button" className="button" onClick={() => switchMode('recover')}>
            {t('sync.forgot')}
          </button>
        )}
        {mode === 'recover' && (
          <button type="button" className="button" onClick={() => switchMode('signin')}>
            {t('sync.back')}
          </button>
        )}
      </div>
      <div className="sync-actions">
        <button type="button" className="button" disabled={busy} onClick={handleSignInByQr}>
          <QrCode size={15} aria-hidden="true" />
          {t('sync.qr.signInByQr')}
        </button>
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => setReverseModal(true)}
        >
          <QrCode size={15} aria-hidden="true" />
          {t('sync.qr.showReverse')}
        </button>
      </div>
      {qrPasteOpen && (
        <div className="sync-field">
          <input
            type="text"
            value={qrPasteCode}
            placeholder={t('sync.qr.pastePlaceholder')}
            onChange={(event) => setQrPasteCode(event.target.value)}
          />
          <button
            type="button"
            className="button primary"
            disabled={busy || !qrPasteCode.trim()}
            onClick={() => void applyDirectQr(qrPasteCode)}
          >
            {t('sync.qr.confirmCode')}
          </button>
        </div>
      )}
      {reverseModal && (
        <SyncPairingModal
          mode="reverse"
          server={server}
          sync={sync}
          onClose={() => setReverseModal(false)}
        />
      )}
      <details className="sync-advanced">
        <summary>{t('sync.advanced')}</summary>
        {field(
          'server',
          t('sync.server'),
          <input
            id={`${id}-server`}
            type="url"
            required
            value={server}
            onChange={(event) => setServer(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />,
          t('sync.serverHint'),
        )}
      </details>
    </form>
  )
}
