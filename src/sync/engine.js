// Sync engine for notes (ADR 0018). Pure apart from the client: it reads the local
// notes and the saved state and returns what to apply. The caller must save `apply`
// and `state` together, or a later push could overwrite the remote text.
//
// payload: { name, body, group?, trashed } — the encrypted part of a note.
// state:   { cursor, bases: { [id]: { revision, payload | null } } } — local only.

import { decryptNote, encryptNote } from './crypto.js'
import { mergeLines } from './merge.js'
import { SyncError } from './client.js'

const ATTEMPTS = 3

export const emptyState = () => ({ cursor: null, bases: {} })

const same = (a, b) =>
  Boolean(a) &&
  Boolean(b) &&
  a.name === b.name &&
  a.body === b.body &&
  (a.group ?? null) === (b.group ?? null) &&
  Boolean(a.trashed) === Boolean(b.trashed)

/** Picks the changed side; when both changed differently, `fallback` decides. */
function pick(base, ours, theirs, fallback) {
  if (ours === theirs || theirs === base) return { value: ours }
  if (ours === base) return { value: theirs }
  return { value: fallback, conflict: true }
}

function renderBody(base, ours, theirs, labels) {
  const result = mergeLines(base, ours, theirs)
  const lines = result.chunks.flatMap((chunk) =>
    chunk.lines
      ? chunk.lines
      : [
          `**${labels.conflict} — ${labels.ours}:**`,
          ...chunk.conflict.ours,
          `**${labels.conflict} — ${labels.theirs}:**`,
          ...chunk.conflict.theirs,
          `**${labels.end}**`,
        ],
  )
  return { body: lines.join('\n'), conflict: result.conflict }
}

export function mergePayload(base, ours, theirs, labels) {
  const body = renderBody(base.body, ours.body, theirs.body, labels)
  const name = pick(base.name, ours.name, theirs.name, ours.name)
  const group = pick(
    base.group ?? null,
    ours.group ?? null,
    theirs.group ?? null,
    ours.group ?? null,
  )
  // Trash moves conflict only as "one side restored": keep the note visible.
  const trashed = pick(Boolean(base.trashed), Boolean(ours.trashed), Boolean(theirs.trashed), false)
  const payload = { name: name.value, body: body.body, trashed: trashed.value }
  if (group.value !== null) payload.group = group.value
  return { payload, conflict: body.conflict || name.conflict || group.conflict }
}

/**
 * local: [{ id, payload }] for every note, trashed ones included; notes deleted for
 * good are absent. labels: { conflict, end, ours, theirs } in the person's language.
 */
export async function runSync({
  client,
  key,
  local,
  state,
  labels,
  newId = () => crypto.randomUUID(),
}) {
  const working = new Map(local.map((note) => [note.id, note.payload]))
  const bases = { ...state.bases }
  let cursor = state.cursor
  const upsert = new Map()
  const remove = new Set()
  const conflicts = new Set()
  const result = (error) => ({
    apply: { upsert: [...upsert].map(([id, payload]) => ({ id, payload })), remove: [...remove] },
    state: { cursor, bases },
    conflicts: [...conflicts],
    ...(error ? { error } : {}),
  })
  const set = (id, payload) => {
    working.set(id, payload)
    upsert.set(id, payload)
    remove.delete(id)
  }
  const drop = (id) => {
    working.delete(id)
    upsert.delete(id)
    remove.add(id)
  }

  async function receive(id) {
    const remote = await client.getNote(id)
    if (!remote) return
    const theirs = remote.deleted ? null : await decryptNote(key, id, remote.envelope)
    const ours = working.get(id)
    const base = bases[id]?.payload ?? null
    if (!theirs) {
      if (ours && base && !same(ours, base)) {
        // Edited here, deleted there: the text survives as a new note.
        const copy = newId()
        drop(id)
        set(copy, ours)
        conflicts.add(copy)
      } else if (ours) drop(id)
    } else if (!ours || same(ours, base) || same(ours, theirs)) set(id, theirs)
    else {
      const merged = mergePayload(base ?? { name: ours.name, body: '' }, ours, theirs, labels)
      set(id, merged.payload)
      if (merged.conflict) conflicts.add(id)
    }
    bases[id] = { revision: remote.revision, payload: theirs }
  }

  try {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      for (;;) {
        const page = await client.changes(cursor)
        for (const change of page.changes)
          if (bases[change.id]?.revision !== change.revision) await receive(change.id)
        cursor = page.cursor
        if (!page.hasMore) break
      }
      let stale = false
      for (const [id, payload] of working) {
        const base = bases[id]
        if (base && same(payload, base.payload)) continue
        const sealed = await encryptNote(key, id, payload)
        const sent = await client.putNote(id, base ? base.revision : null, {
          ...sealed,
          deleted: false,
        })
        if (sent.conflict) stale = true
        else bases[id] = { revision: sent.revision, payload }
      }
      for (const [id, base] of Object.entries(bases)) {
        if (working.has(id) || !base.payload) continue
        const sent = await client.putNote(id, base.revision, {
          hash: '0'.repeat(64),
          deleted: true,
          envelope: null,
        })
        if (sent.conflict) stale = true
        else bases[id] = { revision: sent.revision, payload: null }
      }
      if (!stale) return result()
    }
    return result('busy')
  } catch (error) {
    // A wrong key or a changed envelope is not a SyncError: report it as a failure.
    if (error instanceof SyncError) return result(error.code)
    return result(error?.name === 'OperationError' ? 'wrong_key' : 'failed')
  }
}

/** What a first sync would do, before anything is sent or changed. */
export async function previewFirstSync({ client, key, local }) {
  const remote = new Map()
  let cursor = null
  for (;;) {
    const page = await client.changes(cursor)
    for (const change of page.changes) remote.set(change.id, change)
    cursor = page.cursor
    if (!page.hasMore) break
  }
  const live = [...remote.values()].filter((change) => !change.deleted)
  const names = new Map()
  for (const change of live) {
    const note = await client.getNote(change.id)
    if (note && !note.deleted)
      names.set(change.id, (await decryptNote(key, change.id, note.envelope)).name)
  }
  const localIds = new Set(local.map((note) => note.id))
  const remoteNames = new Set([...names].filter(([id]) => !localIds.has(id)).map(([, n]) => n))
  return {
    download: live.filter((change) => !localIds.has(change.id)).length,
    upload: local.filter((note) => !remote.has(note.id)).length,
    sameName: local
      .filter((note) => !remote.has(note.id) && remoteNames.has(note.payload.name))
      .map((note) => note.payload.name),
  }
}
