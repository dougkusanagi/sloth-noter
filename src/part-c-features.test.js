import test from 'node:test'
import assert from 'node:assert/strict'
import { applyAiProposal, createAiProposal, isProposalValid } from './local-ai-session.js'
import { buildProjectHub } from './project-hub.js'

test('C3: local AI proposal applies cleanly and invalidates on note edit or switch', () => {
  const baseBody = '# Nota\n\nTexto original aqui.'
  const proposal = createAiProposal({
    noteId: 'n1',
    from: 8,
    to: 22,
    baseBody,
    suggestion: 'Texto revisado',
  })
  assert.equal(proposal.originalText, 'Texto original')
  assert.equal(isProposalValid(proposal, { currentNoteId: 'n1', currentBody: baseBody }), true)

  // Editing or switching note invalidates proposal
  assert.equal(
    isProposalValid(proposal, { currentNoteId: 'n2', currentBody: baseBody }),
    false,
  )
  assert.equal(
    applyAiProposal(proposal, { currentNoteId: 'n1', currentBody: `${baseBody} extra` }).ok,
    false,
  )

  const applied = applyAiProposal(proposal, { currentNoteId: 'n1', currentBody: baseBody })
  assert.deepEqual(applied, { ok: true, body: '# Nota\n\nTexto revisado aqui.', error: null })
})

test('C5: project hub aggregates groups with task progress and recent activity', () => {
  const hub = buildProjectHub({
    groups: [
      { id: 'g1', name: 'Site' },
      { id: 'g2', name: 'App' },
    ],
    notes: [
      { id: 'n1', groupId: 'g1', pinned: true, modifiedAt: 100, body: '# Home\n- [x] Layout\n- [ ] SEO\n' },
      { id: 'n2', groupId: 'g2', pinned: false, modifiedAt: 200, body: '# Release\n- [x] Build\n' },
    ],
  })
  assert.equal(hub.length, 2)
  assert.equal(hub[0].id, 'g2')
  assert.equal(hub[0].progress, 100)
  assert.equal(hub[1].id, 'g1')
  assert.equal(hub[1].progress, 50)
  assert.equal(hub[1].pinnedCount, 1)
})
