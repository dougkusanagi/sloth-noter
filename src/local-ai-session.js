/**
 * Safe selection-proposal lifecycle for local desktop AI (C3, `docs/plans/ia-local-desktop.md`).
 * Guarantees that any edit or note switch while generation is running invalidates the proposal.
 */

export function createAiProposal({ noteId, from, to, baseBody, suggestion = '' }) {
  const start = Math.max(0, Math.min(from, to))
  const end = Math.max(start, Math.max(from, to))
  const body = String(baseBody ?? '')
  return {
    noteId: String(noteId ?? ''),
    from: start,
    to: end,
    baseBody: body,
    originalText: body.slice(start, end),
    suggestion: String(suggestion ?? ''),
  }
}

export function isProposalValid(proposal, { currentNoteId, currentBody }) {
  if (!proposal || !proposal.noteId) return false
  if (proposal.noteId !== currentNoteId) return false
  if (proposal.baseBody !== currentBody) return false
  if (proposal.to > currentBody.length) return false
  return true
}

export function applyAiProposal(proposal, { currentNoteId, currentBody }) {
  if (!isProposalValid(proposal, { currentNoteId, currentBody })) {
    return { ok: false, body: currentBody, error: 'stale_proposal' }
  }
  const nextBody =
    currentBody.slice(0, proposal.from) + proposal.suggestion + currentBody.slice(proposal.to)
  return { ok: true, body: nextBody, error: null }
}
