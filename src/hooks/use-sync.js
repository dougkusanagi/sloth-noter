import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '../sync/client.js'
import { runSync, previewFirstSync } from '../sync/engine.js'
import { generateKeyBytes, keyFromRecovery, recoveryKey } from '../sync/crypto.js'
import { applySync, localNotes, syncState } from '../sync/document.js'
import { platformVault, probeVault, readSyncSecrets, writeSyncSecrets } from '../sync/vault.js'
import { t } from '../i18n.js'

const INTERVAL = 5 * 60 * 1000
const AFTER_EDIT = 15 * 1000
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))

/** Reads and writes images under assets/ through the desktop or Android bridge. */
function imageAdapter(invoke) {
  if (!invoke) return null
  return {
    async read(src) {
      try {
        return new Uint8Array(await invoke('image_read', { name: src }))
      } catch {
        return null
      }
    },
    write: (src, bytes) => invoke('image_write', { name: src, bytes: Array.from(bytes) }),
  }
}

/**
 * Sync controller. status: unavailable | off | syncing | idle | error.
 * Secrets stay in the platform vault; the sync state is saved with the document.
 */
export function useSync({ current, commit, invoke, blocked }) {
  const vault = useRef(platformVault())
  const secrets = useRef(null)
  const running = useRef(false)
  const [status, setStatus] = useState({ state: 'checking' })
  // Latest values without re-creating `run` on every render.
  const live = useRef({})
  live.current = { ...live.current, commit, invoke, blocked }

  const run = useCallback(async () => {
    const saved = secrets.current
    if (!saved || running.current || live.current.blocked) return
    running.current = true
    setStatus((previous) => ({ ...previous, state: 'syncing' }))
    try {
      const client = createClient({ server: saved.server, token: saved.token })
      const document = current.current
      const snapshot = localNotes(document)
      const before = syncState(document, saved.server)
      const result = await runSync({
        client,
        key: fromBase64(saved.key),
        local: snapshot,
        state: before,
        images: imageAdapter(live.current.invoke),
        labels: {
          conflict: t('sync.conflictMark'),
          end: t('sync.conflictEnd'),
          ours: t('sync.thisDevice'),
          theirs: t('sync.otherDevice'),
        },
      })
      // Apply on the latest document: edits typed meanwhile are kept (applySync).
      // A run that changed nothing does not save, so it never triggers another run.
      const changed =
        result.apply.upsert.length ||
        result.apply.remove.length ||
        current.current.sync?.server !== saved.server ||
        JSON.stringify(result.state) !== JSON.stringify(before)
      if (changed)
        live.current.commit(
          applySync(current.current, { server: saved.server, snapshot, before, result }),
          'sistema',
        )
      setStatus({
        state: result.error ? 'error' : 'idle',
        error: result.error,
        at: Date.now(),
        conflicts: result.conflicts.length,
        server: saved.server,
      })
    } catch (error) {
      setStatus({ state: 'error', error: error?.code ?? 'failed', server: saved.server })
    } finally {
      running.current = false
    }
  }, [current])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const probe = await probeVault(vault.current)
      if (!alive) return
      if (!probe.ok) return setStatus({ state: 'unavailable', reason: probe.reason })
      secrets.current = await readSyncSecrets(vault.current).catch(() => null)
      if (!alive) return
      if (!secrets.current) return setStatus({ state: 'off' })
      setStatus({ state: 'idle', server: secrets.current.server })
      void run()
    })()
    return () => {
      alive = false
    }
  }, [run])

  useEffect(() => {
    if (status.state !== 'idle' && status.state !== 'error') return
    const timer = setInterval(() => void run(), INTERVAL)
    return () => clearInterval(timer)
  }, [run, status.state])

  // Back in the foreground, and shortly after the notes change.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [run])

  return {
    status,
    run,
    /** Call when notes change; syncs once things are quiet for a while. */
    scheduleAfterEdit: useCallback(() => {
      clearTimeout(live.current.timer)
      live.current.timer = setTimeout(() => void run(), AFTER_EDIT)
    }, [run]),
    newRecoveryKey: async () => recoveryKey(generateKeyBytes()),
    /** Checks the server and the key and returns the first-sync preview; saves nothing. */
    async prepare({ server, token, recovery }) {
      const key = await keyFromRecovery(recovery)
      if (!key) throw Object.assign(new Error(), { code: 'bad_recovery' })
      const client = createClient({ server: server.trim(), token: token.trim() })
      const preview = await previewFirstSync({ client, key, local: localNotes(current.current) })
      return { preview, key }
    },
    async connect({ server, token, key }) {
      const value = { server: server.trim(), token: token.trim(), key: toBase64(key) }
      await writeSyncSecrets(vault.current, value)
      secrets.current = value
      await run()
    },
    async disconnect() {
      await vault.current.delete()
      secrets.current = null
      setStatus({ state: 'off' })
    },
  }
}
