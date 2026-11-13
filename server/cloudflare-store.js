// D1 + R2 store for the Worker. Each note write is a single SQL statement, so the
// compare-and-set and the new `seq` in the change feed commit together.

const NOTE = 'SELECT id, revision, hash, deleted, envelope FROM notes'
const row = (note) => note && { ...note, deleted: Boolean(note.deleted) }
const NEXT_SEQ = '(SELECT COALESCE(MAX(seq), 0) + 1 FROM notes)'

export function cloudflareStore(db, bucket) {
  return {
    formatCursor: (value) => `c${value}`,
    parseCursor(cursor) {
      const match = /^c(\d{1,15})$/.exec(cursor)
      return match ? Number(match[1]) : null
    },
    async getNote(id) {
      return row(await db.prepare(`${NOTE} WHERE id = ?`).bind(id).first())
    },
    async putNote(id, expected, { hash, deleted, envelope }) {
      const statement =
        expected === null
          ? db
              .prepare(
                `INSERT INTO notes (id, revision, hash, deleted, envelope, seq)
                 VALUES (?1, 1, ?2, ?3, ?4, ${NEXT_SEQ})
                 ON CONFLICT(id) DO NOTHING`,
              )
              .bind(id, hash, deleted ? 1 : 0, envelope)
          : db
              .prepare(
                `UPDATE notes SET revision = revision + 1, hash = ?2, deleted = ?3,
                   envelope = ?4, seq = ${NEXT_SEQ}
                 WHERE id = ?1 AND revision = ?5`,
              )
              .bind(id, hash, deleted ? 1 : 0, envelope, expected)
      const result = await statement.run()
      if (!result.meta.changes) return { ok: false }
      return { ok: true, revision: expected === null ? 1 : expected + 1 }
    },
    async changes(after, limit) {
      const { results } = await db
        .prepare(
          'SELECT id, revision, hash, deleted, seq FROM notes WHERE seq > ? ORDER BY seq LIMIT ?',
        )
        .bind(after, limit + 1)
        .all()
      const page = results.slice(0, limit)
      return {
        changes: page.map(({ id, revision, hash, deleted }) => ({
          id,
          revision,
          hash,
          deleted: Boolean(deleted),
        })),
        last: page.at(-1)?.seq,
        hasMore: results.length > limit,
      }
    },
    async getBlob(sha) {
      const object = await bucket.get(sha)
      return object ? new Uint8Array(await object.arrayBuffer()) : null
    },
    // R2 checks the SHA-256 itself, which keeps the Worker within its CPU limit.
    async putBlob(sha, bytes) {
      if (await bucket.head(sha)) return 'exists'
      try {
        await bucket.put(sha, bytes, { sha256: sha })
      } catch (error) {
        if (/sha-?256|checksum|digest|BadDigest/i.test(String(error?.message))) return 'mismatch'
        throw error
      }
      return 'created'
    },
    async exportAll() {
      const { results } = await db.prepare(`${NOTE} ORDER BY seq`).all()
      const blobs = []
      let cursor
      do {
        const list = await bucket.list({ cursor })
        for (const object of list.objects)
          blobs.push({ sha: object.key, bytes: await this.getBlob(object.key) })
        cursor = list.truncated ? list.cursor : undefined
      } while (cursor)
      return { notes: results.map(row), blobs }
    },
    async importAll(data) {
      for (const note of data.notes)
        await db
          .prepare(
            `INSERT INTO notes (id, revision, hash, deleted, envelope, seq)
             VALUES (?1, ?2, ?3, ?4, ?5, ${NEXT_SEQ})
             ON CONFLICT(id) DO UPDATE SET revision = ?2, hash = ?3, deleted = ?4,
               envelope = ?5, seq = ${NEXT_SEQ}`,
          )
          .bind(note.id, note.revision, note.hash, note.deleted ? 1 : 0, note.envelope)
          .run()
      for (const { sha, bytes } of data.blobs) await bucket.put(sha, bytes, { sha256: sha })
    },
  }
}
