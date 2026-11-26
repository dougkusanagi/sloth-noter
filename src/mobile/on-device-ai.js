import { frontmatterEnd } from '../frontmatter.js'

let nextAiRequestId = 1

/**
 * Returns `'available'` only when the native bridge reports an on-device model (Gemini Nano /
 * AICore) is ready. Otherwise returns `'unavailable'` so AI actions stay completely hidden.
 */
export function getOnDeviceAiState(env = typeof window !== 'undefined' ? window : null) {
  if (!env || typeof env.SlothSystem?.getOnDeviceAiState !== 'function') return 'unavailable'
  try {
    return env.SlothSystem.getOnDeviceAiState() === 'available' ? 'available' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/**
 * AI actions are only shown when a local model is available, the user explicitly enabled
 * on-device AI in Settings (off by default), and the note has content to process.
 */
export function canShowOnDeviceAiAction({ state, enabled, body }) {
  if (state !== 'available' || !enabled) return false
  return typeof body === 'string' && body.trim().length > 0
}

/**
 * Invokes the native on-device AI bridge (`SlothSystem.runOnDeviceAi`) and resolves with
 * `{ ok, suggestion, error }`. Never touches network or note content.
 */
export function requestOnDeviceAi({
  action,
  text,
  env = typeof window !== 'undefined' ? window : null,
  timeoutMs = 30000,
}) {
  if (action !== 'summarize' && action !== 'proofread') {
    return Promise.resolve({ ok: false, suggestion: '', error: 'invalid_action' })
  }
  if (!env || typeof env.SlothSystem?.runOnDeviceAi !== 'function') {
    return Promise.resolve({ ok: false, suggestion: '', error: 'unavailable' })
  }
  const requestId = nextAiRequestId++
  return new Promise((resolve) => {
    const prev = env.__slothAiResult
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (env.__slothAiResult === handler) {
        if (prev) env.__slothAiResult = prev
        else delete env.__slothAiResult
      }
      resolve(result)
    }
    const timer = setTimeout(() => finish({ ok: false, suggestion: '', error: 'timeout' }), timeoutMs)
    const handler = (id, raw) => {
      if (id !== requestId) {
        prev?.(id, raw)
        return
      }
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (parsed?.ok && typeof parsed.text === 'string' && parsed.text.trim()) {
          finish({ ok: true, suggestion: parsed.text.trim(), error: null })
        } else {
          finish({ ok: false, suggestion: '', error: parsed?.error || 'failed' })
        }
      } catch {
        finish({ ok: false, suggestion: '', error: 'failed' })
      }
    }
    env.__slothAiResult = handler
    try {
      const started = env.SlothSystem.runOnDeviceAi(requestId, action, String(text ?? ''))
      if (started === false) finish({ ok: false, suggestion: '', error: 'unavailable' })
    } catch {
      finish({ ok: false, suggestion: '', error: 'failed' })
    }
  })
}

/**
 * Applies an accepted AI suggestion to a note body without ever mutating before acceptance.
 * - `summarize`: inserts a `> [!NOTE] Resumo` callout right below the H1 title, preserving body.
 * - `proofread`: replaces the body below the H1 title (or full body if suggestion keeps H1).
 */
export function applyAiSuggestion({
  body = '',
  action,
  suggestion = '',
  summaryHeading = 'Resumo',
}) {
  const clean = String(suggestion).replaceAll('\r\n', '\n').trim()
  if (!clean) return body
  const fmEnd = frontmatterEnd(body)
  const fm = body.slice(0, fmEnd)
  const rest = body.slice(fmEnd)
  const newlineIdx = rest.indexOf('\n')
  const firstLine = newlineIdx < 0 ? rest : rest.slice(0, newlineIdx)
  const hasH1 = /^#\s+/.test(firstLine)
  const afterTitle = newlineIdx < 0 ? '' : rest.slice(newlineIdx + 1).replace(/^\n+/, '')

  if (action === 'summarize') {
    const quoted = clean
      .split('\n')
      .map((line) => (line.trim() ? `> ${line}` : '>'))
      .join('\n')
    const callout = `> [!NOTE] ${summaryHeading}\n${quoted}`
    if (hasH1) {
      return `${fm}${firstLine}\n\n${callout}${afterTitle ? `\n\n${afterTitle}` : '\n'}`
    }
    return `${fm}${callout}\n\n${rest}`
  }

  if (action === 'proofread') {
    if (hasH1 && !/^#\s+/.test(clean)) {
      return `${fm}${firstLine}\n\n${clean}\n`
    }
    return `${fm}${clean}\n`
  }

  return body
}
