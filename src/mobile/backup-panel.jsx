import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, Upload } from 'lucide-react'
import { createFullBackup, readBackupBundle, restoreBackupImages } from '../backup.js'
import { friendlyError } from '../errors.js'
import { t } from '../i18n.js'
import { canShareFile, shareFile } from './share.js'

const BACKUP_NAME = 'sloth-note-backup.json'

function browserDownload(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Backup of every note, the trash and the images. Restoring replaces this device's notes,
// so it always asks first and shows what will be replaced.
export function BackupPanel({ current, persistence, commit, blocked }) {
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(null)
  const [error, setError] = useState('')
  const input = useRef(null)

  async function exportBackup() {
    if (busy) return
    setBusy(true)
    setError('')
    toast.loading(t('backup.preparing'), { id: 'mobile-backup' })
    try {
      const text = await createFullBackup(current.current, persistence.invoke)
      if (canShareFile()) await shareFile({ name: BACKUP_NAME, text })
      else browserDownload(BACKUP_NAME, text)
      toast.success(t('mobile.backupReady'), { id: 'mobile-backup' })
    } catch (cause) {
      toast.error(t('backup.failed', { error: friendlyError(cause) }), { id: 'mobile-backup' })
    } finally {
      setBusy(false)
    }
  }

  async function chooseFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setPending(null)
    try {
      const bundle = readBackupBundle(await file.text())
      setPending({
        bundle,
        notes: bundle.document.notes.length,
        trash: bundle.document.trash.length,
      })
    } catch (cause) {
      setError(friendlyError(cause, t('error.readBackup')))
    }
  }

  async function restore() {
    if (!pending || busy) return
    setBusy(true)
    try {
      commit(await restoreBackupImages(pending.bundle, persistence.invoke))
      setPending(null)
      toast.success(t('mobile.backupRestored'))
    } catch (cause) {
      setError(friendlyError(cause, t('error.readBackup')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mobile-backup" aria-label={t('settings.backup')}>
      <h2>{t('settings.backup')}</h2>
      <p>{t('mobile.backupHint')}</p>
      <button disabled={busy || blocked} onClick={exportBackup}>
        <Download size={20} aria-hidden="true" />
        {t('mobile.backupExport')}
      </button>
      <button disabled={busy || blocked} onClick={() => input.current?.click()}>
        <Upload size={20} aria-hidden="true" />
        {t('menu.backupRestore')}
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label={t('menu.backupRestore')}
        onChange={chooseFile}
      />
      {error && <p role="alert">{error}</p>}
      {pending && (
        <div
          role="alertdialog"
          aria-label={t('menu.backupRestore')}
          className="mobile-backup-confirm"
        >
          <p>{t('dialog.backupReplace', { notes: pending.notes, trash: pending.trash })}</p>
          <button className="danger" disabled={busy} onClick={restore}>
            {t('dialog.backupReplaceConfirm')}
          </button>
          <button onClick={() => setPending(null)}>{t('dialog.cancel')}</button>
        </div>
      )}
    </section>
  )
}
