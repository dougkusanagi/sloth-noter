// Every operation is scoped to the space selected by the authenticated credential.
import { FREE_LIMITS, QuotaExceeded, STORED_BYTES } from './cloudflare-store.js'

// Legacy profile spaces (ADR 0023) and accounts (ADR 0024) share this store.
export const PROFILE_TABLES = {
  notes: 'profile_notes',
  blobs: 'profile_blob_sizes',
  prefix: 'spaces',
}
export const ACCOUNT_TABLES = {
  notes: 'account_notes',
  blobs: 'account_blob_sizes',
  prefix: 'accounts',
}

export function profileStore(
  db,
  bucket,
  space,
  { limits = FREE_LIMITS, now = () => new Date(), tables = PROFILE_TABLES } = {},
) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(space)) throw new Error('invalid space')
  const { notes: NOTES, blobs: BLOBS } = tables
  const key = (sha) => `${tables.prefix}/${space}/${sha}`
  const month = () => now().toISOString().slice(0, 7)
  async function meter(kind) {
    const result = await db
      .prepare(
        `INSERT INTO usage (month, ${kind}) VALUES (?1, 1)
      ON CONFLICT(month) DO UPDATE SET ${kind} = ${kind} + 1
      WHERE ${kind} < ?2 RETURNING ${kind} AS used`,
      )
      .bind(month(), limits[kind])
      .first()
    if (!result) throw new QuotaExceeded()
  }
  return {
    formatCursor: (n) => `c${n}`,
    parseCursor(cursor) {
      const m = /^c(\d{1,15})$/.exec(cursor)
      return m ? Number(m[1]) : null
    },
    async getNote(id) {
      const note = await db
        .prepare(
          `SELECT id, revision, hash, deleted, envelope FROM ${NOTES} WHERE space_id = ? AND id = ?`,
        )
        .bind(space, id)
        .first()
      return note && { ...note, deleted: Boolean(note.deleted) }
    },
    async putNote(id, expected, { hash, deleted, envelope }) {
      const seq = `(SELECT COALESCE(MAX(seq), 0) + 1 FROM ${NOTES} WHERE space_id = ?1)`
      const statement =
        expected === null
          ? db
              .prepare(
                `INSERT INTO ${NOTES} (space_id,id,revision,hash,deleted,envelope,seq) VALUES (?1,?2,1,?3,?4,?5,${seq}) ON CONFLICT(space_id,id) DO NOTHING`,
              )
              .bind(space, id, hash, deleted ? 1 : 0, envelope)
          : db
              .prepare(
                `UPDATE ${NOTES} SET revision=revision+1,hash=?3,deleted=?4,envelope=?5,seq=${seq} WHERE space_id=?1 AND id=?2 AND revision=?6`,
              )
              .bind(space, id, hash, deleted ? 1 : 0, envelope, expected)
      const result = await statement.run()
      return result.meta.changes
        ? { ok: true, revision: expected === null ? 1 : expected + 1 }
        : { ok: false }
    },
    async changes(after, limit) {
      const { results } = await db
        .prepare(
          `SELECT id,revision,hash,deleted,seq FROM ${NOTES} WHERE space_id=? AND seq>? ORDER BY seq LIMIT ?`,
        )
        .bind(space, after, limit + 1)
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
      const object = await bucket.get(key(sha))
      return object ? new Uint8Array(await object.arrayBuffer()) : null
    },
    async putBlob(sha, bytes) {
      if (
        await db
          .prepare(`SELECT 1 FROM ${BLOBS} WHERE space_id=? AND sha=?`)
          .bind(space, sha)
          .first()
      )
        return 'exists'
      const total = await db.prepare(STORED_BYTES).first()
      if (total.total + bytes.length > limits.bytes) throw new QuotaExceeded()
      await meter('writes')
      try {
        await bucket.put(key(sha), bytes, { sha256: sha })
      } catch (e) {
        if (/sha-?256|checksum|digest|BadDigest/i.test(String(e?.message))) return 'mismatch'
        throw e
      }
      await db
        .prepare(`INSERT OR IGNORE INTO ${BLOBS} (space_id,sha,size) VALUES (?,?,?)`)
        .bind(space, sha, bytes.length)
        .run()
      return 'created'
    },
  }
}
