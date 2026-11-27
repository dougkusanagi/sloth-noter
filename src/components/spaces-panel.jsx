import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { t } from '../i18n.js'
import { Segmented } from './controls.jsx'

const ROLE_OPTIONS = [
  { value: 'editor', label: 'spaces.role.editor' },
  { value: 'viewer', label: 'spaces.role.viewer' },
]

function roleLabel(role) {
  if (role === 'owner') return t('spaces.role.owner')
  if (role === 'editor') return t('spaces.role.editor')
  return t('spaces.role.viewer')
}

function errorMessage(code) {
  const known = new Set([
    'account_not_found',
    'recipient_no_keys',
    'already_member',
    'cannot_invite_self',
    'forbidden',
    'offline',
    'unauthorized',
  ])
  return t(known.has(code) ? `spaces.error.${code}` : 'spaces.error.failed')
}

/**
 * Shared spaces management panel (ADR 0054), used in both desktop SettingsDialog
 * and mobile Settings. Follows project CSS tokens without inline styles.
 */
export function SpacesPanel({ sync }) {
  const account = sync?.status?.account
  const [spaces, setSpaces] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [details, setDetails] = useState({})
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')
  const [busyId, setBusyId] = useState(null)

  const refresh = useCallback(async () => {
    const client = sync?.spacesClient?.()
    if (!client) return
    setLoading(true)
    setError('')
    try {
      const [list, inv] = await Promise.all([client.listSpaces(), client.listInvites()])
      setSpaces(list)
      setInvites(inv)
    } catch (err) {
      setError(errorMessage(err?.code))
    } finally {
      setLoading(false)
    }
  }, [sync])

  useEffect(() => {
    if (account) void refresh()
  }, [account, refresh])

  async function loadDetail(spaceId) {
    const client = sync?.spacesClient?.()
    if (!client) return
    try {
      const detail = await client.getSpace(spaceId)
      setDetails((prev) => ({ ...prev, [spaceId]: detail }))
    } catch (err) {
      setError(errorMessage(err?.code))
    }
  }

  function toggleExpand(spaceId) {
    if (expandedId === spaceId) {
      setExpandedId(null)
      return
    }
    setExpandedId(spaceId)
    void loadDetail(spaceId)
  }

  async function handleCreate(event) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    const client = sync?.spacesClient?.()
    const keys = sync?.accountKeys?.()
    if (!client || !keys?.publicKey) {
      setError(t('spaces.error.noKeys'))
      return
    }
    setCreating(true)
    setError('')
    try {
      await client.createSpace({ name, ownerPublicKey: keys.publicKey })
      setNewName('')
      await refresh()
    } catch (err) {
      setError(errorMessage(err?.code))
    } finally {
      setCreating(false)
    }
  }

  async function handleAcceptInvite(inviteId) {
    const client = sync?.spacesClient?.()
    if (!client) return
    setBusyId(inviteId)
    setError('')
    try {
      await client.acceptInvite(inviteId)
      await refresh()
    } catch (err) {
      setError(errorMessage(err?.code))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDeclineInvite(inviteId) {
    const client = sync?.spacesClient?.()
    if (!client) return
    setBusyId(inviteId)
    setError('')
    try {
      await client.declineInvite(inviteId)
      await refresh()
    } catch (err) {
      setError(errorMessage(err?.code))
    } finally {
      setBusyId(null)
    }
  }

  async function handleInviteMember(event, space) {
    event.preventDefault()
    const email = inviteEmail.trim()
    if (!email) return
    const client = sync?.spacesClient?.()
    const keys = sync?.accountKeys?.()
    if (!client || !keys?.privateKey) {
      setError(t('spaces.error.noKeys'))
      return
    }
    setBusyId(space.id)
    setError('')
    try {
      const spaceKey = await client.unwrapKey(space.wrappedSpaceKey, keys.privateKey)
      await client.inviteMember({
        spaceId: space.id,
        email,
        role: inviteRole,
        spaceKey,
      })
      setInviteEmail('')
      await loadDetail(space.id)
    } catch (err) {
      setError(errorMessage(err?.code))
    } finally {
      setBusyId(null)
    }
  }

  async function handleRoleChange(spaceId, accountId, role) {
    const client = sync?.spacesClient?.()
    if (!client) return
    setBusyId(accountId)
    setError('')
    try {
      await client.updateMemberRole(spaceId, accountId, role)
      await loadDetail(spaceId)
    } catch (err) {
      setError(errorMessage(err?.code))
    } finally {
      setBusyId(null)
    }
  }

  async function handleRemoveMember(spaceId, accountId) {
    const client = sync?.spacesClient?.()
    if (!client) return
    setBusyId(accountId)
    setError('')
    try {
      await client.removeMember(spaceId, accountId)
      const detail = await client.getSpace(spaceId)
      if (detail?.members?.length) {
        await client.rotateSpaceKey(spaceId, detail.members)
      }
      await loadDetail(spaceId)
      await refresh()
    } catch (err) {
      setError(errorMessage(err?.code))
    } finally {
      setBusyId(null)
    }
  }

  async function handleCancelInvite(spaceId, inviteId) {
    const client = sync?.spacesClient?.()
    if (!client) return
    setBusyId(inviteId)
    setError('')
    try {
      await client.cancelInvite(spaceId, inviteId)
      await loadDetail(spaceId)
    } catch (err) {
      setError(errorMessage(err?.code))
    } finally {
      setBusyId(null)
    }
  }

  async function handleLeave(spaceId) {
    const client = sync?.spacesClient?.()
    if (!client) return
    setBusyId(spaceId)
    setError('')
    try {
      await client.leaveSpace(spaceId)
      setExpandedId(null)
      await refresh()
    } catch (err) {
      setError(errorMessage(err?.code))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(spaceId) {
    const client = sync?.spacesClient?.()
    if (!client) return
    setBusyId(spaceId)
    setError('')
    try {
      await client.deleteSpace(spaceId)
      setExpandedId(null)
      await refresh()
    } catch (err) {
      setError(errorMessage(err?.code))
    } finally {
      setBusyId(null)
    }
  }

  if (!account) {
    return (
      <div className="spaces-panel">
        <div className="spaces-header">
          <div className="spaces-title-group">
            <Users size={18} aria-hidden="true" />
            <h3>{t('spaces.title')}</h3>
          </div>
        </div>
        <p className="spaces-empty">{t('spaces.requireAccount')}</p>
      </div>
    )
  }

  return (
    <div className="spaces-panel">
      <div className="spaces-header">
        <div className="spaces-title-group">
          <Users size={18} aria-hidden="true" />
          <h3>{t('spaces.title')}</h3>
        </div>
        <button
          type="button"
          className="button spaces-refresh-btn"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label={t('spaces.refresh')}
        >
          <RefreshCw size={14} aria-hidden="true" />
          <span>{t('spaces.refresh')}</span>
        </button>
      </div>

      <p className="spaces-hint">{t('spaces.hint')}</p>

      {error && (
        <p className="spaces-error" role="alert">
          {error}
        </p>
      )}

      {invites.length > 0 && (
        <div className="spaces-section">
          <h4 className="spaces-section-title">{t('spaces.pendingInvites')}</h4>
          <ul className="spaces-list">
            {invites.map((inv) => (
              <li key={inv.id} className="space-card space-invite-card">
                <div className="space-card-info">
                  <strong className="space-card-name">{inv.spaceName}</strong>
                  <span className="space-card-meta">
                    {inv.inviterName} · {roleLabel(inv.role)}
                  </span>
                </div>
                <div className="space-card-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={busyId === inv.id}
                    onClick={() => void handleAcceptInvite(inv.id)}
                  >
                    <Check size={14} aria-hidden="true" />
                    <span>{t('spaces.accept')}</span>
                  </button>
                  <button
                    type="button"
                    className="button"
                    disabled={busyId === inv.id}
                    onClick={() => void handleDeclineInvite(inv.id)}
                  >
                    <X size={14} aria-hidden="true" />
                    <span>{t('spaces.decline')}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="spaces-create-form" onSubmit={handleCreate}>
        <input
          type="text"
          className="spaces-input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('spaces.newPlaceholder')}
          maxLength={80}
          aria-label={t('spaces.newPlaceholder')}
        />
        <button type="submit" className="button button-primary" disabled={creating || !newName.trim()}>
          <Plus size={15} aria-hidden="true" />
          <span>{t('spaces.create')}</span>
        </button>
      </form>

      {spaces.length === 0 ? (
        <p className="spaces-empty">{t('spaces.empty')}</p>
      ) : (
        <ul className="spaces-list">
          {spaces.map((space) => {
            const expanded = expandedId === space.id
            const detail = details[space.id]
            return (
              <li key={space.id} className="space-card">
                <div className="space-card-head">
                  <div className="space-card-info">
                    <strong className="space-card-name">{space.name}</strong>
                    <span className="space-card-meta">
                      <span className={`space-badge space-badge-${space.role}`}>
                        {roleLabel(space.role)}
                      </span>
                      <span>
                        {space.memberCount} {space.memberCount === 1 ? t('spaces.memberSingular') : t('spaces.memberPlural')}
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button spaces-toggle-btn"
                    onClick={() => toggleExpand(space.id)}
                    aria-expanded={expanded}
                  >
                    {expanded ? (
                      <ChevronUp size={15} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={15} aria-hidden="true" />
                    )}
                    <span>{expanded ? t('spaces.close') : t('spaces.manage')}</span>
                  </button>
                </div>

                {expanded && (
                  <div className="space-card-body">
                    {space.role === 'viewer' && (
                      <div className="space-readonly-banner" role="status">
                        <Eye size={15} aria-hidden="true" />
                        <span>{t('spaces.viewerBanner')}</span>
                      </div>
                    )}

                    {detail?.members && (
                      <div className="spaces-subsection">
                        <h5 className="spaces-subsection-title">{t('spaces.members')}</h5>
                        <ul className="space-members-list">
                          {detail.members.map((m) => (
                            <li key={m.accountId} className="space-member-row">
                              <div className="space-member-info">
                                <span className="space-member-name">{m.name}</span>
                                <span className="space-member-email">{m.email}</span>
                              </div>
                              <div className="space-member-controls">
                                {space.role === 'owner' && m.role !== 'owner' ? (
                                  <>
                                    <Segmented
                                      name={`role-${space.id}-${m.accountId}`}
                                      label={t('spaces.roleLabel')}
                                      value={m.role}
                                      options={ROLE_OPTIONS.map((opt) => ({
                                        value: opt.value,
                                        label: t(opt.label),
                                      }))}
                                      onChange={(role) =>
                                        void handleRoleChange(space.id, m.accountId, role)
                                      }
                                    />
                                    <button
                                      type="button"
                                      className="button button-danger"
                                      disabled={busyId === m.accountId}
                                      onClick={() => void handleRemoveMember(space.id, m.accountId)}
                                      aria-label={t('spaces.removeMember')}
                                    >
                                      <Trash2 size={14} aria-hidden="true" />
                                    </button>
                                  </>
                                ) : (
                                  <span className={`space-badge space-badge-${m.role}`}>
                                    {roleLabel(m.role)}
                                  </span>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {space.role === 'owner' && (
                      <>
                        <form
                          className="space-invite-form"
                          onSubmit={(e) => void handleInviteMember(e, space)}
                        >
                          <input
                            type="email"
                            className="spaces-input"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder={t('spaces.inviteEmailPlaceholder')}
                            aria-label={t('spaces.inviteEmailPlaceholder')}
                          />
                          <Segmented
                            name={`invite-role-${space.id}`}
                            label={t('spaces.roleLabel')}
                            value={inviteRole}
                            options={ROLE_OPTIONS.map((opt) => ({
                              value: opt.value,
                              label: t(opt.label),
                            }))}
                            onChange={setInviteRole}
                          />
                          <button
                            type="submit"
                            className="button button-primary"
                            disabled={busyId === space.id || !inviteEmail.trim()}
                          >
                            <UserPlus size={14} aria-hidden="true" />
                            <span>{t('spaces.invite')}</span>
                          </button>
                        </form>

                        {detail?.invites?.length > 0 && (
                          <div className="spaces-subsection">
                            <h5 className="spaces-subsection-title">{t('spaces.sentInvites')}</h5>
                            <ul className="space-members-list">
                              {detail.invites.map((inv) => (
                                <li key={inv.id} className="space-member-row">
                                  <div className="space-member-info">
                                    <span className="space-member-name">{inv.name}</span>
                                    <span className="space-member-email">
                                      {inv.email} · {roleLabel(inv.role)}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    className="button"
                                    disabled={busyId === inv.id}
                                    onClick={() => void handleCancelInvite(space.id, inv.id)}
                                  >
                                    {t('spaces.cancelInvite')}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="space-footer-actions">
                          <button
                            type="button"
                            className="button button-danger"
                            disabled={busyId === space.id}
                            onClick={() => void handleDelete(space.id)}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                            <span>{t('spaces.deleteSpace')}</span>
                          </button>
                        </div>
                      </>
                    )}

                    {space.role !== 'owner' && (
                      <div className="space-footer-actions">
                        <button
                          type="button"
                          className="button button-danger"
                          disabled={busyId === space.id}
                          onClick={() => void handleLeave(space.id)}
                        >
                          <LogOut size={14} aria-hidden="true" />
                          <span>{t('spaces.leaveSpace')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
