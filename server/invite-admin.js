// Creates a single-use invite code for a new account (ADR 0024).
// Give the code to the person; run the printed command once to save it on the server.
import { createHash, randomBytes } from 'node:crypto'

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const bytes = randomBytes(10)
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
const hash = createHash('sha256').update(code).digest('hex')
const sql = `INSERT INTO invites (code_hash) VALUES ('${hash}');`
console.log(`Código de convite: ${code.match(/.{4}/g).join('-')}`)
console.log(
  `Salvar no servidor: bunx wrangler d1 execute sloth-note-sync --remote --command "${sql}"`,
)
