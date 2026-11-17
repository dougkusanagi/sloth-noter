import { CloudAlert, CloudCheck, CloudOff, RefreshCw } from 'lucide-react'
import { t } from '../i18n.js'

const time = (at) =>
  new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    timeStyle: 'short',
  }).format(at)

/**
 * Sync state in the note's status bar. A click always opens Settings → Account and sync,
 * where the person can sign in, sync now or see what went wrong.
 */
export function SyncStatusButton({ status, onOpen }) {
  const { state } = status
  if (state === 'checking') return null
  const [Icon, text] =
    state === 'syncing'
      ? [RefreshCw, t('sync.syncing')]
      : state === 'error'
        ? [CloudAlert, t('sync.statusError')]
        : state === 'idle'
          ? [
              CloudCheck,
              status.at ? t('sync.statusAt', { time: time(status.at) }) : t('sync.statusOn'),
            ]
          : [CloudOff, t('sync.statusOff')]
  return (
    <button
      type="button"
      className="button small status-sync"
      data-state={state}
      aria-label={t('sync.statusLabel', { status: text })}
      onClick={onOpen}
    >
      <Icon size={14} aria-hidden="true" />
      <span aria-live="polite">{text}</span>
    </button>
  )
}
