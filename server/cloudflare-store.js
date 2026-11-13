// D1 + R2 store for the Worker. Each note write is a single SQL statement, so the
// compare-and-set and the new `seq` in the change feed commit together.

const NOTE = 'SELECT id, revision, hash, deleted, envelope FROM notes'
const row = (note) => note && { ...note, deleted: Boolean(note.deleted) }
const NEXT_SEQ = '(SELECT COALESCE(MAX(seq), 0) + 1 FROM notes)'

/** Thrown when an operation would leave the R2 free tier; the API answers 507. */
export class QuotaExceeded extends Error {
  constructor() {
    super('quota_exceeded')
    this.name = 'QuotaExceeded'
  }
}

// Below the free tier (10 GB-month, 1M Class A, 10M Class B per month), with room
// for operations the Worker does not count, such as the dashboard and exports.
export const FREE_LIMITS = { bytes: 9e9, writes: 900_000, reads: 9_000_000 }

export function cloudflareStore(db, bucket, { limits = FREE_LIMITS, now = () => new Date() } = {}) {
  const month = () => now().toISOString().slice(0, 7)
  // Counts the operation first, so a failed call is counted too (R2 bills it as well).
  async function meter(kind) {
    const row = await db
      .prepare(
        `INSERT INTO usage (month, ${kind}) VALUES (?1, 1)
         ON CONFLICT(month) DO UPDATE SET ${kind} = ${kind} + 1
         WHERE ${kind} < ?2
         RETURNING ${kind} AS used`,
      )
      .bind(month(), limits[kind])
      .first()
    if (!row) throw new QuotaExceeded()
  }
  async function stored() {
    const row = await db.prepare('SELECT COALESCE(SUM(size), 0) AS total FROM blob_sizes').first()
    return row.total
  }
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
      await meter('reads')
      const object = await bucket.get(sha)
      return object ? new Uint8Array(await object.arrayBuffer()) : null
    },
    // R2 checks the SHA-256 itself, which keeps the Worker within its CPU limit.
    async putBlob(sha, bytes) {
      // Already stored: answer from D1 without touching R2.
      if (await db.prepare('SELECT 1 FROM blob_sizes WHERE sha = ?').bind(sha).first())
        return 'exists'
      if ((await stored()) + bytes.length > limits.bytes) throw new QuotaExceeded()
      await meter('writes')
      try {
        await bucket.put(sha, bytes, { sha256: sha })
      } catch (error) {
        if (/sha-?256|checksum|digest|BadDigest/i.test(String(error?.message))) return 'mismatch'
        throw error
      }
      await db
        .prepare('INSERT OR IGNORE INTO blob_sizes (sha, size) VALUES (?, ?)')
        .bind(sha, bytes.length)
        .run()
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
      for (const { sha, bytes } of data.blobs) {
        await bucket.put(sha, bytes, { sha256: sha })
        await db
          .prepare('INSERT OR IGNORE INTO blob_sizes (sha, size) VALUES (?, ?)')
          .bind(sha, bytes.length)
          .run()
      }
    },
  }
}
