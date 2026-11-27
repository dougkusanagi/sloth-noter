import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '../sync/client.js'
import { createSpacesClient } from '../sync/spaces.js'
import { runSync, previewFirstSync } from '../sync/engine.js'
import { recoverAccount, signIn, signOut, signUp } from '../sync/account.js'
import { applySync, localNotes, syncState } from '../sync/document.js'
import { platformVault, probeVault, readSyncSecrets, writeSyncSecrets } from '../sync/vault.js'
import { t } from '../i18n.js'

const INTERVAL = 5 * 60 * 1000
const AFTER_EDIT = 3 * 1000
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
// The sync state belongs to one server space: an account, or the old shared key.
const remoteOf = (saved) => (saved.email ? `${saved.server}#${saved.email}` : saved.server)
const statusOf = (saved) => ({
  server: saved.server,
  account: saved.email ? { name: saved.name, email: saved.email } : null,
})

/** Reads and writes images under assets/ through the desktop or Android bridge. */
function imageAdapter(invoke, onWrite) {
  if (!invoke) return null
  return {
    async read(src) {
      try {
        return new Uint8Array(await invoke('image_read', { name: src }))
      } catch {
        return null
      }
    },
    async write(src, bytes) {
      await invoke('image_write', { name: src, bytes: Array.from(bytes) })
      onWrite?.()
    },
  }
}

/**
 * Sync controller. status: unavailable | off | syncing | idle | error.
 * Secrets stay in the platform vault; the sync state is saved with the document.
 */
export function useSync({ current, commit, invoke, blocked, onImagesChanged }) {
  const vault = useRef(platformVault(globalThis))
  const secrets = useRef(null)
  const running = useRef(false)
  const retryUntil = useRef(0)
  const [status, setStatus] = useState({ state: 'checking' })
  // Latest values without re-creating `run` on every render.
  const live = useRef({})
  live.current = { ...live.current, commit, invoke, blocked, onImagesChanged }

  const run = useCallback(
    async (options) => {
      const auto = options?.auto === true
      const saved = secrets.current
      if (!saved || running.current || live.current.blocked) return
      if (auto && Date.now() < retryUntil.current) return
      running.current = true
      setStatus((previous) => ({ ...previous, state: 'syncing' }))
      let wroteImage = false
      try {
        const client = createClient({ server: saved.server, token: saved.token })
        const remote = remoteOf(saved)
        const document = current.current
        const snapshot = localNotes(document)
        const before = syncState(document, remote)
        const result = await runSync({
          client,
          key: fromBase64(saved.key),
          local: snapshot,
          state: before,
          deferConflicts: true,
          images: imageAdapter(live.current.invoke, () => {
            wroteImage = true
          }),
          labels: {
            conflict: t('sync.conflictMark'),
            end: t('sync.conflictEnd'),
            ours: t('sync.thisDevice'),
            theirs: t('sync.otherDevice'),
          },
        })
        if (wroteImage) live.current.onImagesChanged?.()
        // Apply on the latest document: edits typed meanwhile are kept (applySync).
        // A run that changed nothing does not save, so it never triggers another run.
        const changed =
          result.apply.upsert.length ||
          result.apply.remove.length ||
          current.current.sync?.server !== remote ||
          JSON.stringify(result.state) !== JSON.stringify(before)
        if (changed)
          live.current.commit(
            applySync(current.current, { server: remote, snapshot, before, result }),
            'sistema',
          )
        if (result.error === 'rate_limited' && result.retryAfter)
          retryUntil.current = Date.now() + result.retryAfter * 1000
        else if (!result.error) retryUntil.current = 0
        setStatus({
          state: result.error ? 'error' : 'idle',
          error: result.error,
          at: Date.now(),
          conflicts: result.conflicts.length,
          ...statusOf(saved),
        })
      } catch (error) {
        if (error?.code === 'rate_limited' && error.retryAfter)
          retryUntil.current = Date.now() + error.retryAfter * 1000
        setStatus({ state: 'error', error: error?.code ?? 'failed', ...statusOf(saved) })
      } finally {
        running.current = false
      }
    },
    [current],
  )

  useEffect(() => {
    let alive = true
    ;(async () => {
      const probe = await probeVault(vault.current)
      if (!alive) return
      if (!probe.ok) return setStatus({ state: 'unavailable', reason: probe.reason })
      secrets.current = await readSyncSecrets(vault.current).catch(() => null)
      if (!alive) return
      if (!secrets.current) return setStatus({ state: 'off' })
      setStatus({ state: 'idle', ...statusOf(secrets.current) })
      void run({ auto: true })
    })()
    return () => {
      alive = false
    }
  }, [run])

  useEffect(() => {
    if (status.state !== 'idle' && status.state !== 'error') return
    const timer = setInterval(() => void run({ auto: true }), INTERVAL)
    return () => clearInterval(timer)
  }, [run, status.state])

  // Sync when returning to foreground AND flush when leaving/hiding the app.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' || document.visibilityState === 'hidden')
        void run({ auto: true })
    }
    const onPageHide = () => void run({ auto: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [run])

  return {
    status,
    run,
    /** Call when notes change; syncs once things are quiet for a while. */
    scheduleAfterEdit: useCallback(() => {
      clearTimeout(live.current.timer)
      live.current.timer = setTimeout(() => void run({ auto: true }), AFTER_EDIT)
    }, [run]),
    invoke,
    /** Account calls (ADR 0024). Each returns a session; nothing is saved yet. */
    signUp,
    signIn,
    recover: recoverAccount,
    /** Ends a session that was never saved (the person went back from the preview). */
    discard: (session) => signOut(session),
    /** Checks the session and the key and returns the first-sync preview; saves nothing. */
    async preview({ server, token, key }) {
      const client = createClient({ server, token })
      return previewFirstSync({ client, key, local: localNotes(current.current) })
    },
    /** Saves the session in the vault (replacing an old key, if any) and syncs. */
    async connect({ server, token, key, email, name, publicKey, privateKey }) {
      const previous = secrets.current
      const value = {
        server,
        token,
        key: toBase64(key),
        email,
        name,
        ...(publicKey && privateKey
          ? {
              publicKey,
              privateKey: typeof privateKey === 'string' ? privateKey : toBase64(privateKey),
            }
          : {}),
      }
      await writeSyncSecrets(vault.current, value)
      secrets.current = value
      retryUntil.current = 0
      if (previous?.email) void signOut({ server: previous.server, token: previous.token })
      await run()
    },
    /** Returns a shared-spaces API client when signed in with an account, or null. */
    spacesClient() {
      const saved = secrets.current
      if (!saved?.server || !saved?.token || !saved?.email) return null
      return createSpacesClient({ server: saved.server, token: saved.token })
    },
    /** Returns the account's ECDH P-256 key pair when available, or null. */
    accountKeys() {
      const saved = secrets.current
      if (!saved?.publicKey || !saved?.privateKey) return null
      return {
        publicKey: saved.publicKey,
        privateKey: fromBase64(saved.privateKey),
      }
    },
    /** Returns current vault credentials for short-lived QR device pairing. */
    exportPairingCredentials() {
      const saved = secrets.current
      if (!saved?.server || !saved?.token || !saved?.key) return null
      return {
        server: saved.server,
        token: saved.token,
        key: saved.key,
        email: saved.email ?? '',
        name: saved.name ?? '',
      }
    },
    /** Connects directly using credentials decoded from a pairing QR code. */
    async connectFromPairing({ server, token, key, email, name }) {
      const keyBytes = typeof key === 'string' ? fromBase64(key) : key
      const previous = secrets.current
      const value = { server, token, key: toBase64(keyBytes), email, name }
      await writeSyncSecrets(vault.current, value)
      secrets.current = value
      retryUntil.current = 0
      if (previous?.email) void signOut({ server: previous.server, token: previous.token })
      await run()
    },
    async disconnect() {
      const saved = secrets.current
      clearTimeout(live.current.timer)
      retryUntil.current = 0
      await vault.current.delete()
      secrets.current = null
      setStatus({ state: 'off' })
      if (saved?.email) void signOut({ server: saved.server, token: saved.token })
    },
  }
}
