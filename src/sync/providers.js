export const SYNC_PROVIDERS = {
  'self-hosted': { id: 'self-hosted', supportsRealtimeCursor: true, requiresVaultSecret: true },
  github: { id: 'github', supportsRealtimeCursor: false, requiresVaultSecret: true },
  folder: { id: 'folder', supportsRealtimeCursor: false, requiresVaultSecret: false },
}

const REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/
const SAFE_PATH_RE = /^(?!\/)(?!.*\.\.)[a-zA-Z0-9_./-]+$/

/**
 * Validates non-secret configuration for a sync/backup provider.
 * Secrets (tokens, passwords, keys) must stay in `src/sync/vault.js`, never in config.
 */
export function validateProviderConfig(providerId, config = {}) {
  if (!(providerId in SYNC_PROVIDERS)) {
    return { ok: false, error: 'unknown_provider' }
  }
  if (providerId === 'self-hosted') {
    const raw = String(config.url ?? '').trim()
    try {
      const parsed = new URL(raw)
      const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
      if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocal)) {
        return { ok: false, error: 'insecure_url' }
      }
      return { ok: true, normalized: { url: parsed.origin } }
    } catch {
      return { ok: false, error: 'invalid_url' }
    }
  }
  if (providerId === 'github') {
    const repository = String(config.repository ?? '').trim()
    const branch = String(config.branch ?? 'main').trim() || 'main'
    const path = String(config.path ?? 'sloth-note-backup.json').trim()
    if (!REPO_RE.test(repository)) return { ok: false, error: 'invalid_repository' }
    if (!SAFE_PATH_RE.test(path)) return { ok: false, error: 'invalid_path' }
    return { ok: true, normalized: { repository, branch, path } }
  }
  if (providerId === 'folder') {
    const folderPath = String(config.folderPath ?? '').trim()
    if (!folderPath || folderPath.includes('..')) return { ok: false, error: 'invalid_folder' }
    return { ok: true, normalized: { folderPath } }
  }
  return { ok: false, error: 'unknown_provider' }
}

/**
 * Builds a GitHub Contents API PUT request descriptor for encrypted/portable backup snapshots.
 */
export function buildGitHubBackupRequest({
  repository,
  branch = 'main',
  path = 'sloth-note-backup.json',
  contentBase64,
  sha = null,
  message = 'chore(sloth-note): update backup snapshot',
}) {
  const check = validateProviderConfig('github', { repository, branch, path })
  if (!check.ok) throw new Error(check.error)
  const url = `https://api.github.com/repos/${check.normalized.repository}/contents/${check.normalized.path}`
  const body = {
    message,
    content: String(contentBase64 ?? ''),
    branch: check.normalized.branch,
    ...(sha ? { sha } : {}),
  }
  return { url, method: 'PUT', body }
}
