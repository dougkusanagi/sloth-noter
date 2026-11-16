// Administration of the sync server (ADR 0024) through wrangler, without a web panel:
// it uses the Cloudflare login wrangler already has and opens no new route on the Worker.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { FREE_LIMITS, STORED_BYTES } from './cloudflare-store.js'

const DATABASE = 'sloth-note-sync'
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const EMAIL = /^[^\s@'"\\;]+@[^\s@'"\\;]+\.[^\s@'"\\;]+$/

export const HELP = `Administração do servidor de sincronização do Sloth Note.

Uso: node server/admin.js <comando> [--local]

Comandos:
  convite            cria um código de convite e já o grava no servidor
  convites           lista os convites: pendentes e usados (por quem)
  contas             lista as contas: nome, e-mail, criação, notas e sessões ativas
  uso                mostra o uso do mês no R2 e o limite grátis (ADR 0021)
  revogar <e-mail>   encerra todas as sessões da conta; ela precisa entrar de novo
  ajuda              mostra esta ajuda

--local usa o banco do "wrangler dev" em vez do servidor publicado.
É preciso ter feito "bunx wrangler login" na pasta server/.`

/** Single-use invite: 16 Crockford base32 characters (80 bits) and its SHA-256. */
export function newInvite(bytes = randomBytes(10)) {
  let bits = 0
  let value = 0
  let code = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      code += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return {
    code: code.match(/.{4}/g).join('-'),
    hash: createHash('sha256').update(code).digest('hex'),
  }
}

// wrangler d1 execute has no parameters: every value that reaches SQL is checked first.
export const SQL = {
  invite: (hash) => {
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('hash inválido')
    return `INSERT INTO invites (code_hash) VALUES ('${hash}')`
  },
  invites: `SELECT i.created_at, i.used_at, a.email AS used_by
    FROM invites i LEFT JOIN accounts a ON a.id = i.used_by ORDER BY i.created_at`,
  accounts: `SELECT a.name, a.email, a.created_at,
      (SELECT COUNT(*) FROM account_notes n WHERE n.space_id = a.id AND n.deleted = 0) AS notes,
      (SELECT COUNT(*) FROM sessions s WHERE s.account_id = a.id AND s.revoked_at IS NULL) AS sessions
    FROM accounts a ORDER BY a.created_at`,
  usage: `SELECT (${STORED_BYTES.replace(/\s+AS total$/, '')}) AS bytes,
      COALESCE((SELECT writes FROM usage WHERE month = strftime('%Y-%m', 'now')), 0) AS writes,
      COALESCE((SELECT reads FROM usage WHERE month = strftime('%Y-%m', 'now')), 0) AS reads`,
  revoke: (email) => {
    const clean = String(email ?? '')
      .trim()
      .toLowerCase()
    if (!EMAIL.test(clean)) throw new Error('e-mail inválido')
    return `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE revoked_at IS NULL
      AND account_id = (SELECT id FROM accounts WHERE email = '${clean}')`
  },
}

const percent = (used, limit) => `${((used / limit) * 100).toFixed(1).replace('.', ',')}%`
const gb = (bytes) => `${(bytes / 1e9).toFixed(2).replace('.', ',')} GB`
const count = (value) => Number(value).toLocaleString('pt-BR')

/** Text for `uso`, from the row of SQL.usage. */
export function usageReport({ bytes, writes, reads }, limits = FREE_LIMITS) {
  return [
    `Imagens guardadas: ${gb(bytes)} de ${gb(limits.bytes)} (${percent(bytes, limits.bytes)})`,
    `Escritas no mês:   ${count(writes)} de ${count(limits.writes)} (${percent(writes, limits.writes)})`,
    `Leituras no mês:   ${count(reads)} de ${count(limits.reads)} (${percent(reads, limits.reads)})`,
    'Ao chegar a um limite, o servidor recusa imagens novas; as notas continuam sincronizando.',
  ].join('\n')
}

// The versioned wrangler.toml has a placeholder database id; the real one lives in
// wrangler.local.toml (ignored by git), as in the deploy steps.
export function configArgs(exists = existsSync) {
  const local = fileURLToPath(new URL('./wrangler.local.toml', import.meta.url))
  return exists(local) ? ['--config', local] : []
}

/** Turns wrangler's JSON error into a sentence that says what to do. */
export function explainFailure(output) {
  let error
  try {
    error = JSON.parse(output).error
  } catch {
    return `o wrangler recusou o comando.\n${String(output).trim().split('\n').slice(-6).join('\n')}`
  }
  const detail = [error?.text, ...(error?.notes ?? []).map((note) => note.text)]
    .filter(Boolean)
    .join('\n')
  if (/no such table/i.test(detail))
    return (
      'o banco ainda não tem as tabelas de contas. Aplique as migrações e publique o Worker:\n' +
      '  cd server && bunx wrangler d1 migrations apply sloth-note-sync --remote --config wrangler.local.toml\n' +
      '  bunx wrangler deploy --config wrangler.local.toml\n' +
      `(${detail.split('\n').at(-1)})`
    )
  if (error?.code === 7400)
    return 'o Cloudflare não encontrou o banco. Confira o database_id em server/wrangler.local.toml.'
  if (/auth|login|10000/i.test(detail) || error?.code === 10000)
    return 'o wrangler não está autenticado. Rode "bunx wrangler login" na pasta server/.'
  return `o wrangler recusou o comando.\n${detail}`
}

function d1(sql, local) {
  const result = spawnSync(
    'bunx',
    [
      'wrangler',
      'd1',
      'execute',
      DATABASE,
      ...configArgs(),
      local ? '--local' : '--remote',
      '--json',
      '--command',
      sql,
    ],
    { cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8' },
  )
  if (result.error) throw new Error(`não foi possível rodar o wrangler: ${result.error.message}`)
  if (result.status !== 0) throw new Error(explainFailure(result.stdout || result.stderr))
  const output = JSON.parse(result.stdout)
  return output.at(-1)?.results ?? []
}

function table(rows, columns) {
  if (!rows.length) return '(nenhum)'
  const cells = rows.map((row) => columns.map(([key]) => String(row[key] ?? '—')))
  const widths = columns.map(([, title], i) =>
    Math.max(title.length, ...cells.map((line) => line[i].length)),
  )
  const line = (values) => values.map((value, i) => value.padEnd(widths[i])).join('  ')
  return [line(columns.map(([, title]) => title)), ...cells.map(line)].join('\n')
}

export function run(args, { query = d1, log = console.log } = {}) {
  const local = args.includes('--local')
  const [command, value] = args.filter((arg) => arg !== '--local')
  switch (command) {
    case 'convite': {
      const invite = newInvite()
      query(SQL.invite(invite.hash), local)
      log(`Código de convite: ${invite.code}`)
      log(
        local
          ? 'Gravado no banco local (wrangler dev).'
          : 'Já está gravado no servidor. Envie o código à pessoa; ele cria uma conta.',
      )
      return 0
    }
    case 'convites': {
      const rows = query(SQL.invites, local)
      log(
        table(
          rows.map((row) => ({ ...row, state: row.used_by ? 'usado' : 'pendente' })),
          [
            ['created_at', 'Criado em'],
            ['state', 'Situação'],
            ['used_by', 'Usado por'],
            ['used_at', 'Usado em'],
          ],
        ),
      )
      log('O código só aparece ao ser criado; o servidor guarda apenas o hash.')
      return 0
    }
    case 'contas':
      log(
        table(query(SQL.accounts, local), [
          ['name', 'Nome'],
          ['email', 'E-mail'],
          ['created_at', 'Criada em'],
          ['notes', 'Notas'],
          ['sessions', 'Sessões ativas'],
        ]),
      )
      return 0
    case 'uso':
      log(usageReport(query(SQL.usage, local)[0] ?? { bytes: 0, writes: 0, reads: 0 }))
      return 0
    case 'revogar': {
      if (!value) {
        log('Informe o e-mail da conta: node server/admin.js revogar pessoa@exemplo.com')
        return 1
      }
      query(SQL.revoke(value), local)
      log(`Sessões de ${value.trim().toLowerCase()} encerradas (se a conta existir).`)
      return 0
    }
    case 'ajuda':
    case '-h':
    case '--help':
    case undefined:
      log(HELP)
      return 0
    default:
      log(`Comando desconhecido: ${command}\n\n${HELP}`)
      return 1
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = run(process.argv.slice(2))
  } catch (error) {
    console.error(`Erro: ${error.message}`)
    process.exitCode = 1
  }
}
