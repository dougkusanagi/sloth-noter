// Local D1 + R2 (Miniflare, no network) with every migration applied, for the tests.
import { readdir, readFile } from 'node:fs/promises'
import { Miniflare } from 'miniflare'

const folder = new URL('./migrations/', import.meta.url)
const schema = (
  await Promise.all(
    (await readdir(folder))
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => readFile(new URL(name, folder), 'utf8')),
  )
).join('\n')

const instances = []

export async function miniflare() {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch: () => new Response() }',
    d1Databases: ['DB'],
    r2Buckets: ['BLOBS'],
  })
  instances.push(mf)
  const db = await mf.getD1Database('DB')
  // exec runs one statement per line; CRLF checkouts leave `\r` on `--` comments.
  await db.exec(
    schema
      .replace(/--.*\r?\n/g, '')
      .split(';')
      .map((statement) => statement.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(';\n'),
  )
  return { db, bucket: await mf.getR2Bucket('BLOBS') }
}

miniflare.dispose = () => Promise.all(instances.splice(0).map((mf) => mf.dispose()))
