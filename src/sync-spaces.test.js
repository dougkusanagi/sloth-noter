import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, memoryDirectory } from '../server/accounts.js'
import { memoryStore } from '../server/memory-store.js'
import { memorySpaces } from '../server/spaces.js'
import { signIn, signUp } from './sync/account.js'
import {
  generateAccountKeyPair,
  generateKeyBytes,
  unwrapSpaceKey,
  wrapSpaceKey,
} from './sync/crypto.js'
import { emptyState, runSync } from './sync/engine.js'
import { createSpaceSyncClient, createSpacesClient } from './sync/spaces.js'

const labels = { conflict: 'Conflito', end: 'Fim', ours: 'Este', theirs: 'Outro' }

test('ECDH P-256 wraps and unwraps a 256-bit space key and rejects wrong private key', async () => {
  const alice = await generateAccountKeyPair()
  const bob = await generateAccountKeyPair()
  const spaceKey = generateKeyBytes()

  const wrapped = await wrapSpaceKey(spaceKey, bob.publicKeyJwk)
  const unwrapped = await unwrapSpaceKey(wrapped, bob.privateKeyPkcs8)
  assert.deepEqual(unwrapped, spaceKey)

  await assert.rejects(() => unwrapSpaceKey(wrapped, alice.privateKeyPkcs8))
})

test('two accounts share a space E2EE, sync notes, enforce viewer read-only, and rotate key on removal', async () => {
  const directory = memoryDirectory()
  const spaces = memorySpaces(directory)
  const accountStores = new Map()
  const spaceStores = new Map()
  const getOrCreate = (map, id) => {
    if (!map.has(id)) map.set(id, memoryStore())
    return map.get(id)
  }
  const handler = createServer({
    directory,
    spaces,
    storeFor: (id) => getOrCreate(accountStores, id),
    spaceStoreFor: (id) => getOrCreate(spaceStores, id),
  })
  const fakeFetch = (url, init) => handler(new Request(url, init))
  const server = 'https://sync.example'

  await directory.addInvite('INV-ALICE-01')
  await directory.addInvite('INV-BOB-0002')
  await directory.addInvite('INV-CAROL-03')

  const alice = await signUp({
    server,
    name: 'Alice',
    email: 'alice@example.com',
    password: 'password123',
    invite: 'INV-ALICE-01',
    fetch: fakeFetch,
    iterations: 1000,
  })
  const bob = await signUp({
    server,
    name: 'Bob',
    email: 'bob@example.com',
    password: 'password123',
    invite: 'INV-BOB-0002',
    fetch: fakeFetch,
    iterations: 1000,
  })
  const carol = await signUp({
    server,
    name: 'Carol',
    email: 'carol@example.com',
    password: 'password123',
    invite: 'INV-CAROL-03',
    fetch: fakeFetch,
    iterations: 1000,
  })

  // Re-login retrieves the same key pair
  const aliceRelogin = await signIn({
    server,
    email: 'alice@example.com',
    password: 'password123',
    fetch: fakeFetch,
    iterations: 1000,
  })
  assert.equal(aliceRelogin.publicKey, alice.publicKey)
  assert.deepEqual(aliceRelogin.privateKey, alice.privateKey)

  const aliceSpaces = createSpacesClient({ server, token: alice.token, fetch: fakeFetch })
  const bobSpaces = createSpacesClient({ server, token: bob.token, fetch: fakeFetch })
  const carolSpaces = createSpacesClient({ server, token: carol.token, fetch: fakeFetch })

  // Alice creates a shared space
  const space = await aliceSpaces.createSpace({
    name: 'Notas da Família',
    ownerPublicKey: alice.publicKey,
  })
  assert.equal(space.name, 'Notas da Família')

  // Alice invites Bob as editor and Carol as viewer
  await aliceSpaces.inviteMember({
    spaceId: space.id,
    email: 'bob@example.com',
    role: 'editor',
    spaceKey: space.spaceKey,
  })
  await aliceSpaces.inviteMember({
    spaceId: space.id,
    email: 'carol@example.com',
    role: 'viewer',
    spaceKey: space.spaceKey,
  })

  // Bob and Carol accept
  const [bobInv] = await bobSpaces.listInvites()
  const bobJoined = await bobSpaces.acceptInvite(bobInv.id)
  const bobSpaceKey = await bobSpaces.unwrapKey(bobJoined.wrappedSpaceKey, bob.privateKey)
  assert.deepEqual(bobSpaceKey, space.spaceKey)

  const [carolInv] = await carolSpaces.listInvites()
  const carolJoined = await carolSpaces.acceptInvite(carolInv.id)
  const carolSpaceKey = await carolSpaces.unwrapKey(carolJoined.wrappedSpaceKey, carol.privateKey)
  assert.deepEqual(carolSpaceKey, space.spaceKey)

  // Alice syncs a note into the shared space
  const aliceSyncClient = createSpaceSyncClient({
    server,
    token: alice.token,
    spaceId: space.id,
    fetch: fakeFetch,
  })
  const aliceRes = await runSync({
    client: aliceSyncClient,
    key: space.spaceKey,
    local: [{ id: 'n1', payload: { name: 'Lista', body: '# Lista\n- Pão', trashed: false } }],
    state: emptyState(),
    labels,
  })
  assert.equal(aliceRes.error, undefined)

  // Bob pulls the note and edits it
  const bobSyncClient = createSpaceSyncClient({
    server,
    token: bob.token,
    spaceId: space.id,
    fetch: fakeFetch,
  })
  const bobPull = await runSync({
    client: bobSyncClient,
    key: bobSpaceKey,
    local: [],
    state: emptyState(),
    labels,
  })
  assert.equal(bobPull.error, undefined)
  assert.equal(bobPull.apply.upsert.length, 1)
  assert.equal(bobPull.apply.upsert[0].payload.body, '# Lista\n- Pão')

  const bobPush = await runSync({
    client: bobSyncClient,
    key: bobSpaceKey,
    local: [
      { id: 'n1', payload: { name: 'Lista', body: '# Lista\n- Pão\n- Leite', trashed: false } },
    ],
    state: bobPull.state,
    labels,
  })
  assert.equal(bobPush.error, undefined)

  // Carol (viewer) pulls successfully, but trying to push returns 'forbidden'
  const carolSyncClient = createSpaceSyncClient({
    server,
    token: carol.token,
    spaceId: space.id,
    fetch: fakeFetch,
  })
  const carolPull = await runSync({
    client: carolSyncClient,
    key: carolSpaceKey,
    local: [],
    state: emptyState(),
    labels,
  })
  assert.equal(carolPull.error, undefined)
  assert.equal(carolPull.apply.upsert[0].payload.body, '# Lista\n- Pão\n- Leite')

  const carolPush = await runSync({
    client: carolSyncClient,
    key: carolSpaceKey,
    local: [{ id: 'n1', payload: { name: 'Lista', body: '# Hack', trashed: false } }],
    state: carolPull.state,
    labels,
  })
  assert.equal(carolPush.error, 'forbidden')

  // Alice removes Carol and rotates the space key
  const detail = await aliceSpaces.getSpace(space.id)
  const carolMember = detail.members.find((m) => m.email === 'carol@example.com')
  await aliceSpaces.removeMember(space.id, carolMember.accountId)
  const remaining = detail.members.filter((m) => m.accountId !== carolMember.accountId)
  const rotated = await aliceSpaces.rotateSpaceKey(space.id, remaining)
  assert.equal(rotated.keyVersion, 2)

  // Bob can unwrap the new key after rotation
  const bobDetail = await bobSpaces.getSpace(space.id)
  const bobNewKey = await bobSpaces.unwrapKey(bobDetail.wrappedSpaceKey, bob.privateKey)
  assert.deepEqual(bobNewKey, rotated.spaceKey)
})
