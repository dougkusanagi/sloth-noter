// Generate a credential and a D1 statement for an administrator to execute.
// The credential must be transferred securely to every device in this space.
import { randomBytes, randomUUID, createHash } from 'node:crypto'

const slot = Number(process.argv[2])
if (!Number.isInteger(slot) || slot < 1 || slot > 4) {
  console.error('Informe um número de 1 a 4. O espaço existente ocupa o primeiro perfil.')
  process.exit(1)
}
const token = randomBytes(32).toString('base64url')
const hash = createHash('sha256').update(token).digest('hex')
const id = randomUUID()
console.log(`Chave de acesso: ${token}`)
console.log(
  `SQL: INSERT INTO profile_spaces (id, slot, credential_hash) VALUES ('${id}', ${slot}, '${hash}');`,
)
