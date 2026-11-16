import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Loader2, RotateCw } from 'lucide-react'
import { check as checkUpdate } from '@tauri-apps/plugin-updater'
import { toast } from 'sonner'
import { downloadUpdate } from '../app-updates.js'
import { t } from '../i18n.js'

const toastOptions = { id: 'app-update', position: 'bottom-right' }

export function useAppUpdates(invoke, { beforeInstall, resume }) {
  const [update, setUpdate] = useState(null)
  const [phase, setPhase] = useState('available')
  const [percent, setPercent] = useState(null)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const resource = useRef(null)
  const pending = useRef(null)
  const busy = useRef(false)
  const mounted = useRef(false)
  const callbacks = useRef({ beforeInstall, resume })
  callbacks.current = { beforeInstall, resume }
  const check = useCallback(
    async (manual = true) => {
      if (!invoke || busy.current) return
      if (pending.current) {
        if (manual) {
          pending.current.manual = true
          toast.loading(t('updates.checking'), toastOptions)
        }
        return
      }
      const request = { manual, cancelled: false }
      pending.current = request
      if (manual) toast.loading(t('updates.checking'), toastOptions)
      try {
        const supported = await invoke('update_environment')
        if (!mounted.current || request.cancelled) return
        if (!supported) {
          if (request.manual) toast.info(t('updates.installedOnly'), toastOptions)
          return
        }
        const result = await checkUpdate({ timeout: 12000 })
        if (!mounted.current || request.cancelled) {
          await result?.close()
          return
        }
        if (
          result &&
          result.version === resource.current?.version &&
          phaseRef.current === 'ready'
        ) {
          await result.close()
          if (request.manual)
            toast.success(t('updates.ready', { version: result.version }), toastOptions)
          return
        }
        await resource.current?.close().catch(() => {})
        if (!mounted.current || request.cancelled) {
          await result?.close()
          return
        }
        resource.current = result
        setUpdate(result ? { version: result.version } : null)
        setPhase('available')
        if (request.manual)
          toast.success(
            t(result ? 'updates.available' : 'updates.current', {
              version: result?.version,
            }),
            toastOptions,
          )
      } catch {
        if (mounted.current && !request.cancelled && request.manual)
          toast.error(t('updates.failed'), toastOptions)
      } finally {
        if (pending.current === request) pending.current = null
      }
    },
    [invoke],
  )
  useEffect(() => {
    mounted.current = true
    check(false)
    return () => {
      mounted.current = false
      if (pending.current) pending.current.cancelled = true
      pending.current = null
      // A download may still be finishing. Its finally block closes the resource.
      if (!busy.current) void resource.current?.close().catch(() => {})
      toast.dismiss('app-update')
    }
  }, [check])
  async function download() {
    if (!resource.current || busy.current || pending.current) return
    busy.current = true
    setPhase('downloading')
    setPercent(null)
    try {
      // Refresh the resource before a retry so previous downloaded bytes can be released.
      const fresh = await checkUpdate({ timeout: 12000 })
      if (!fresh) throw new Error('Update is no longer available')
      if (!mounted.current) {
        await fresh.close()
        return
      }
      await resource.current.close().catch(() => {})
      resource.current = fresh
      if (mounted.current) setUpdate({ version: fresh.version })
      await downloadUpdate(resource.current, ({ verifying, percent }) => {
        if (!mounted.current) return
        setPhase(verifying ? 'verifying' : 'downloading')
        setPercent(percent)
      })
      if (mounted.current) setPhase('ready')
    } catch {
      if (mounted.current) {
        setPhase('available')
        toast.error(t('updates.downloadFailed'), toastOptions)
      }
    } finally {
      busy.current = false
      if (!mounted.current) void resource.current?.close().catch(() => {})
    }
  }
  async function install() {
    if (!resource.current || busy.current || pending.current) return
    busy.current = true
    let installationStarted = false
    let installed = phase === 'restart'
    setPhase('saving')
    try {
      await callbacks.current.beforeInstall()
      if (!installed) {
        installationStarted = true
        setPhase('installing')
        await resource.current.install({ restartAfterInstall: true })
        installed = true
      }
      setPhase('restarting')
      await invoke('update_restart')
    } catch {
      callbacks.current.resume()
      setPhase(installed ? 'restart' : installationStarted ? 'available' : 'ready')
      toast.error(
        t(
          installed
            ? 'updates.restartFailed'
            : installationStarted
              ? 'updates.installFailed'
              : 'updates.saveFailed',
        ),
        toastOptions,
      )
    } finally {
      busy.current = false
      if (!mounted.current) void resource.current?.close().catch(() => {})
    }
  }
  return { update, phase, percent, check, download, install }
}

/**
 * Title bar button for an available update: "Atualizar" downloads and verifies the
 * package; then the same button installs and restarts. The full sentence with the
 * version stays in the tooltip and is announced to screen readers.
 */
export function UpdateButton({ update, phase, percent, download, install }) {
  if (!update) return null
  const locked = ['downloading', 'verifying', 'saving', 'installing', 'restarting'].includes(phase)
  const ready = phase === 'ready' || phase === 'restart'
  const status = t(phase === 'available' ? 'updates.available' : `updates.${phase}`, {
    version: update.version,
  })
  const label =
    phase === 'available'
      ? t('updates.update')
      : phase === 'downloading' && percent !== null
        ? t('updates.downloadingShort', { percent })
        : phase === 'downloading'
          ? t('updates.downloadingUnknown')
          : phase === 'restart'
            ? t('updates.restart')
            : ready
              ? t('updates.install')
              : t(`updates.${phase}Short`)
  const Icon = ready ? RotateCw : phase === 'available' ? Download : Loader2
  return (
    <div className="update-button" role="group" aria-label={t('updates.title')}>
      <button
        className={phase === 'available' ? 'button primary' : 'button primary compact'}
        disabled={locked}
        title={status}
        onClick={ready ? install : download}
      >
        <Icon size={15} aria-hidden="true" className={locked ? 'spin' : undefined} />
        <span className="update-button-label">{label}</span>
      </button>
      {phase === 'downloading' && percent !== null && (
        <progress aria-label={t('updates.progress')} max="100" value={percent} />
      )}
      <span className="sr-only" role="status">
        {status}
      </span>
    </div>
  )
}
