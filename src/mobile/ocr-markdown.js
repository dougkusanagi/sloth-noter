let nextOcrRequestId = 1

/**
 * Returns true when the native Android bridge advertises local on-device OCR support.
 */
export function isLocalOcrSupported(env = typeof window !== 'undefined' ? window : null) {
  if (!env || typeof env.SlothSystem?.isLocalOcrSupported !== 'function') return false
  try {
    return Boolean(env.SlothSystem.isLocalOcrSupported())
  } catch {
    return false
  }
}

/**
 * Invokes the native local OCR bridge (`SlothSystem.captureTextOcr`) and resolves with
 * `{ ok, text, error }`.
 */
export function requestLocalOcr({
  env = typeof window !== 'undefined' ? window : null,
  timeoutMs = 60000,
} = {}) {
  if (!env || typeof env.SlothSystem?.captureTextOcr !== 'function') {
    return Promise.resolve({ ok: false, text: '', error: 'unavailable' })
  }
  const requestId = nextOcrRequestId++
  return new Promise((resolve) => {
    const prev = env.__slothOcrResult
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (env.__slothOcrResult === handler) {
        if (prev) env.__slothOcrResult = prev
        else delete env.__slothOcrResult
      }
      resolve(result)
    }
    const timer = setTimeout(() => finish({ ok: false, text: '', error: 'timeout' }), timeoutMs)
    const handler = (id, raw) => {
      if (id !== requestId) {
        prev?.(id, raw)
        return
      }
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (parsed?.ok && typeof parsed.text === 'string' && parsed.text.trim()) {
          finish({ ok: true, text: parsed.text.trim(), error: null })
        } else {
          finish({ ok: false, text: '', error: parsed?.error || 'failed' })
        }
      } catch {
        finish({ ok: false, text: '', error: 'failed' })
      }
    }
    env.__slothOcrResult = handler
    try {
      const started = env.SlothSystem.captureTextOcr(requestId)
      if (started === false) finish({ ok: false, text: '', error: 'unavailable' })
    } catch {
      finish({ ok: false, text: '', error: 'failed' })
    }
  })
}

function splitTableColumns(line) {
  if (line.includes('|')) {
    return line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim())
  }
  if (line.includes('\t')) {
    return line.split('\t').map((cell) => cell.trim())
  }
  return line.split(/\s{2,}/).map((cell) => cell.trim())
}

/** Converts OCR text lines into a Markdown bullet list. */
export function formatOcrAsList(rawText) {
  const lines = String(rawText ?? '')
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return ''
  return lines
    .map((line) => {
      const cleaned = line.replace(/^(?:[-*•·]|\d+[.)])\s+/, '')
      return `- ${cleaned}`
    })
    .join('\n')
}

/** Converts tabular OCR lines into a Markdown pipe table. */
export function formatOcrAsTable(rawText) {
  const lines = String(rawText ?? '')
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return ''
  const rows = lines.map(splitTableColumns)
  const colCount = Math.max(2, ...rows.map((r) => r.length))
  const padRow = (row) => {
    const cells = Array.from({ length: colCount }, (_, i) => (row[i] ?? '').replace(/\|/g, '\\|'))
    return `| ${cells.join(' | ')} |`
  }
  const header = padRow(rows[0])
  const separator = `| ${Array.from({ length: colCount }, () => '---').join(' | ')} |`
  const body = rows.slice(1).map(padRow)
  return [header, separator, ...body].join('\n')
}

/**
 * Formats raw OCR text into Markdown according to `mode` (`'auto' | 'text' | 'list' | 'table'`).
 */
export function formatOcrToMarkdown(rawText, mode = 'auto') {
  const clean = String(rawText ?? '').replaceAll('\r\n', '\n').trim()
  if (!clean) return ''
  if (mode === 'text') return clean
  if (mode === 'list') return formatOcrAsList(clean)
  if (mode === 'table') return formatOcrAsTable(clean)

  // Auto-detect table when at least 2 lines have >= 2 columns separated by tab, pipe, or 2+ spaces.
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length >= 2) {
    const colCounts = lines.map((l) => splitTableColumns(l).length)
    if (colCounts.every((c) => c >= 2)) {
      return formatOcrAsTable(clean)
    }
    if (lines.every((l) => /^(?:[-*•·]|\d+[.)])\s+/.test(l))) {
      return formatOcrAsList(clean)
    }
  }
  return clean
}
