import { sha256Hex } from './api.js'

// In-memory store with the same contract the D1/R2 store must follow in S2.
// A change and its revision are published together: nothing is visible before `put` commits.

export function memoryStore() {
  let seq = 0
  const notes = new Map()
  const blobs = new Map()
  return {
    formatCursor: (value) => `c${value}`,
    parseCursor(cursor) {
      const match = /^c(\d+)$/.exec(cursor)
      return match ? Number(match[1]) : null
    },
    async getNote(id) {
      const note = notes.get(id)
      if (!note) return null
      const { id: noteId, revision, hash, deleted, envelope } = note
      return { id: noteId, revision, hash, deleted, envelope }
    },
    async putNote(id, expected, record) {
      const current = notes.get(id)
      if (expected === null ? current : current?.revision !== expected) return { ok: false }
      const revision = (current?.revision ?? 0) + 1
      notes.set(id, { id, revision, ...record, seq: ++seq })
      return { ok: true, revision }
    },
    async changes(after, limit) {
      const list = [...notes.values()]
        .filter((note) => note.seq > after)
        .sort((a, b) => a.seq - b.seq)
      const page = list.slice(0, limit)
      return {
        changes: page.map(({ id, revision, hash, deleted }) => ({ id, revision, hash, deleted })),
        last: page.at(-1)?.seq,
        hasMore: list.length > limit,
      }
    },
    async getBlob(sha) {
      return blobs.get(sha) ?? null
    },
    async putBlob(sha, bytes) {
      if (blobs.has(sha)) return 'exists'
      if ((await sha256Hex(bytes)) !== sha) return 'mismatch'
      blobs.set(sha, bytes)
      return 'created'
    },
    async exportAll() {
      return {
        notes: [...notes.values()]
          .sort((a, b) => a.seq - b.seq)
          .map(({ id, revision, hash, deleted, envelope }) => ({
            id,
            revision,
            hash,
            deleted,
            envelope,
          })),
        blobs: [...blobs].map(([sha, bytes]) => ({ sha, bytes })),
      }
    },
    async importAll(data) {
      for (const note of data.notes) notes.set(note.id, { ...note, seq: ++seq })
      for (const { sha, bytes } of data.blobs) blobs.set(sha, bytes)
    },
  }
}
