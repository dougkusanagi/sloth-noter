import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, d1Directory, memoryDirectory, normalizeInvite } from './accounts.js'
import { sha256Hex } from './api.js'
import { memoryStore } from './memory-store.js'
import { ACCOUNT_TABLES, SHARED_SPACE_TABLES, profileStore } from './profile-store.js'
import { d1Spaces, memorySpaces } from './spaces.js'
import { miniflare } from './test-d1.js'

after(() => miniflare.dispose())

const authKey = (seed) => seed.repeat(43).slice(0, 43)
const wrapped = (seed) => `${seed}_wrapped_key_payload_value_1234567890_abcdef`
const pubKey = (seed) => `{"kty":"EC","crv":"P-256","x":"${seed}_x_1234567890","y":"${seed}_y_1234567890"}`

async function req(handler, method, path, { token, body, headers = {} } = {}) {
  const init = {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }
  const response = await handler(new Request(`https://sync.example${path}`, init))
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: response.status, json, headers: response.headers }
}

async function createAccount(handler, { email, name, invite, seed }) {
  const res = await req(handler, 'POST', '/v1/accounts', {
    body: {
      email,
      name,
      invite,
      authKey: authKey(seed),
      recoveryAuth: authKey(seed.toUpperCase()),
      wrappedKey: wrapped(seed),
      publicKey: pubKey(seed),
      wrappedPrivateKey: wrapped(`priv_${seed}`),
    },
  })
  assert.equal(res.status, 201)
  return res.json.token
}

function runSuite(label, setup) {
  test(`${label}: create space, invite, accept, enforce viewer/editor/owner roles, rotate key and remove member`, async () => {
    const { handler, addInvite } = await setup()
    await addInvite('INVITE-AAAA-1111')
    await addInvite('INVITE-BBBB-2222')
    await addInvite('INVITE-CCCC-3333')

    const ownerToken = await createAccount(handler, {
      email: 'alice@example.com',
      name: 'Alice',
      invite: 'INVITE-AAAA-1111',
      seed: 'a',
    })
    const editorToken = await createAccount(handler, {
      email: 'bob@example.com',
      name: 'Bob',
      invite: 'INVITE-BBBB-2222',
      seed: 'b',
    })
    const viewerToken = await createAccount(handler, {
      email: 'carol@example.com',
      name: 'Carol',
      invite: 'INVITE-CCCC-3333',
      seed: 'c',
    })

    // Lookup public key by email
    const lookup = await req(handler, 'GET', '/v1/accounts/lookup?email=bob@example.com', {
      token: ownerToken,
    })
    assert.equal(lookup.status, 200)
    assert.equal(lookup.json.publicKey, pubKey('b'))

    // Owner creates shared space
    const created = await req(handler, 'POST', '/v1/spaces', {
      token: ownerToken,
      body: { name: 'Projeto Casa', wrappedSpaceKey: wrapped('space_owner') },
    })
    assert.equal(created.status, 201)
    const spaceId = created.json.id
    assert.equal(created.json.role, 'owner')

    // Non-member cannot access space or its notes
    const denied = await req(handler, 'GET', `/v1/spaces/${spaceId}/changes`, {
      token: editorToken,
    })
    assert.equal(denied.status, 403)

    // Owner invites Bob (editor) and Carol (viewer)
    const invBob = await req(handler, 'POST', `/v1/spaces/${spaceId}/invites`, {
      token: ownerToken,
      body: {
        email: 'bob@example.com',
        role: 'editor',
        wrappedSpaceKey: wrapped('space_bob'),
      },
    })
    assert.equal(invBob.status, 201)

    const invCarol = await req(handler, 'POST', `/v1/spaces/${spaceId}/invites`, {
      token: ownerToken,
      body: {
        email: 'carol@example.com',
        role: 'viewer',
        wrappedSpaceKey: wrapped('space_carol'),
      },
    })
    assert.equal(invCarol.status, 201)

    // Bob lists and accepts invite
    const bobInvites = await req(handler, 'GET', '/v1/spaces/invites', { token: editorToken })
    assert.equal(bobInvites.status, 200)
    assert.equal(bobInvites.json.invites.length, 1)
    assert.equal(bobInvites.json.invites[0].spaceName, 'Projeto Casa')

    const acceptBob = await req(
      handler,
      'POST',
      `/v1/spaces/invites/${bobInvites.json.invites[0].id}/accept`,
      { token: editorToken },
    )
    assert.equal(acceptBob.status, 200)
    assert.equal(acceptBob.json.role, 'editor')

    // Carol accepts invite
    const carolInvites = await req(handler, 'GET', '/v1/spaces/invites', { token: viewerToken })
    assert.equal(carolInvites.json.invites.length, 1)
    const acceptCarol = await req(
      handler,
      'POST',
      `/v1/spaces/invites/${carolInvites.json.invites[0].id}/accept`,
      { token: viewerToken },
    )
    assert.equal(acceptCarol.status, 200)
    assert.equal(acceptCarol.json.role, 'viewer')

    // Editor can write a note in the space
    const envelope = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo'
    const noteHash = await sha256Hex(new TextEncoder().encode(envelope))
    const putByEditor = await req(handler, 'PUT', `/v1/spaces/${spaceId}/notes/n1`, {
      token: editorToken,
      headers: { 'if-none-match': '*' },
      body: { deleted: false, hash: noteHash, envelope },
    })
    assert.equal(putByEditor.status, 200)
    assert.equal(putByEditor.json.revision, 1)

    // Viewer can read changes and the note
    const viewerChanges = await req(handler, 'GET', `/v1/spaces/${spaceId}/changes`, {
      token: viewerToken,
    })
    assert.equal(viewerChanges.status, 200)
    assert.equal(viewerChanges.json.changes.length, 1)

    const viewerNote = await req(handler, 'GET', `/v1/spaces/${spaceId}/notes/n1`, {
      token: viewerToken,
    })
    assert.equal(viewerNote.status, 200)
    assert.equal(viewerNote.json.envelope, envelope)

    // Viewer CANNOT write a note or a blob (server enforces 403)
    const putByViewer = await req(handler, 'PUT', `/v1/spaces/${spaceId}/notes/n2`, {
      token: viewerToken,
      headers: { 'if-none-match': '*' },
      body: { deleted: false, hash: noteHash, envelope },
    })
    assert.equal(putByViewer.status, 403)
    assert.equal(putByViewer.json.error, 'forbidden')

    const blobHash = 'a'.repeat(64)
    const blobByViewer = await handler(
      new Request(`https://sync.example/v1/spaces/${spaceId}/blobs/${blobHash}`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${viewerToken}` },
        body: new Uint8Array([1, 2, 3]),
      }),
    )
    assert.equal(blobByViewer.status, 403)

    // Owner changes Carol's role to editor and then removes Carol
    const detail = await req(handler, 'GET', `/v1/spaces/${spaceId}`, { token: ownerToken })
    const carolMember = detail.json.members.find((m) => m.email === 'carol@example.com')
    const bobMember = detail.json.members.find((m) => m.email === 'bob@example.com')
    const aliceMember = detail.json.members.find((m) => m.email === 'alice@example.com')

    const promote = await req(
      handler,
      'PATCH',
      `/v1/spaces/${spaceId}/members/${carolMember.accountId}`,
      { token: ownerToken, body: { role: 'editor' } },
    )
    assert.equal(promote.status, 200)
    assert.equal(promote.json.role, 'editor')

    const removeCarol = await req(
      handler,
      'DELETE',
      `/v1/spaces/${spaceId}/members/${carolMember.accountId}`,
      { token: ownerToken },
    )
    assert.equal(removeCarol.status, 204)

    // Carol immediately loses access
    const carolAfter = await req(handler, 'GET', `/v1/spaces/${spaceId}/changes`, {
      token: viewerToken,
    })
    assert.equal(carolAfter.status, 403)

    // Owner rotates space key for remaining members
    const rotated = await req(handler, 'POST', `/v1/spaces/${spaceId}/rotate-key`, {
      token: ownerToken,
      body: {
        keys: {
          [aliceMember.accountId]: wrapped('space_owner_v2'),
          [bobMember.accountId]: wrapped('space_bob_v2'),
        },
      },
    })
    assert.equal(rotated.status, 200)
    assert.equal(rotated.json.keyVersion, 2)

    // Bob leaves the space
    const bobLeave = await req(handler, 'POST', `/v1/spaces/${spaceId}/leave`, {
      token: editorToken,
    })
    assert.equal(bobLeave.status, 204)

    const bobAfter = await req(handler, 'GET', `/v1/spaces/${spaceId}/changes`, {
      token: editorToken,
    })
    assert.equal(bobAfter.status, 403)

    // Owner deletes the space
    const deleted = await req(handler, 'DELETE', `/v1/spaces/${spaceId}`, { token: ownerToken })
    assert.equal(deleted.status, 204)
  })
}

runSuite('memory', async () => {
  const directory = memoryDirectory()
  const spaces = memorySpaces(directory)
  const accountStores = new Map()
  const spaceStores = new Map()
  const getOrCreate = (map, id) => {
    if (!map.has(id)) map.set(id, memoryStore())
    return map.get(id)
  }
  return {
    handler: createServer({
      directory,
      spaces,
      storeFor: (id) => getOrCreate(accountStores, id),
      spaceStoreFor: (id) => getOrCreate(spaceStores, id),
    }),
    addInvite: (code) => directory.addInvite(code),
  }
})

runSuite('d1', async () => {
  const { db, bucket } = await miniflare()
  const directory = d1Directory(db)
  const spaces = d1Spaces(db)
  return {
    handler: createServer({
      directory,
      spaces,
      storeFor: (id) => profileStore(db, bucket, id, { tables: ACCOUNT_TABLES }),
      spaceStoreFor: (id) => profileStore(db, bucket, id, { tables: SHARED_SPACE_TABLES }),
    }),
    addInvite: async (code) => {
      const codeHash = await sha256Hex(new TextEncoder().encode(normalizeInvite(code)))
      await db.prepare('INSERT INTO invites (code_hash) VALUES (?)').bind(codeHash).run()
    },
  }
})
