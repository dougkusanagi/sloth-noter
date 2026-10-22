/** Positions use UTF-16 offsets, matching CodeMirror and JavaScript strings. */
export function diffTexts(before, after) {
  if (before === after) return []
  let from = 0,
    endBefore = before.length,
    endAfter = after.length
  while (from < endBefore && from < endAfter && before[from] === after[from]) from++
  // Keep surrogate pairs together for readable journal fragments.
  if (from && /[\uD800-\uDBFF]/.test(before[from - 1])) from--
  while (endBefore > from && endAfter > from && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--
    endAfter--
  }
  if (endBefore < before.length && /[\uDC00-\uDFFF]/.test(before[endBefore])) {
    endBefore++
    endAfter++
  }
  return [
    { de: from, removido: before.slice(from, endBefore), inserido: after.slice(from, endAfter) },
  ]
}
export function fromTransaction(tr) {
  const changes = []
  tr.changes.iterChanges((from, to, _a, _b, inserted) =>
    changes.push({
      de: from,
      removido: tr.startState.sliceDoc(from, to),
      inserido: inserted.toString(),
    }),
  )
  return changes
}
export function applyForward(text, changes) {
  for (const change of [...changes].reverse()) {
    if (text.slice(change.de, change.de + change.removido.length) !== change.removido)
      throw new Error('History base does not match')
    text =
      text.slice(0, change.de) + change.inserido + text.slice(change.de + change.removido.length)
  }
  return text
}
export function applyBackward(text, changes) {
  let offset = 0
  const inverse = changes.map((c) => {
    const result = { de: c.de + offset, removido: c.inserido, inserido: c.removido }
    offset += c.inserido.length - c.removido.length
    return result
  })
  return applyForward(text, inverse)
}
export function alerts(before, changes, origin, gesture) {
  const removed = changes.reduce((sum, c) => sum + c.removido.length, 0)
  return [
    removed > 200 || removed > before.length * 0.2 ? 'remocao-grande' : null,
    origin === 'input.paste' && gesture === 'nenhum' ? 'colagem-sem-gesto' : null,
  ].filter(Boolean)
}
// Typing, accents (compose) and small deletions form one continuous edit, so a
// burst with corrections is one entry instead of one full-text copy per key.
const typing = (origin) => /^(input\.type|delete\.(backward|forward|selection))/.test(origin)
export function canGroup(a, b) {
  return (
    a &&
    a.nota === b.nota &&
    typing(a.origem) &&
    typing(b.origem) &&
    b.t - a.t <= 2000 &&
    !a.alertas.length &&
    !b.alertas.length &&
    a.depois === b.antes
  )
}
export const HISTORY_DAYS = [7, 30, 90]
export const HISTORY_LIMITS = [20, 50, 100]
export const historyDays = (prefs) =>
  HISTORY_DAYS.includes(prefs.historyDays) ? prefs.historyDays : 30
export const historyLimit = (prefs) =>
  HISTORY_LIMITS.includes(prefs.historyLimit) ? prefs.historyLimit : 20
export function createHistory(invoke, warn = () => {}) {
  let queue = [],
    running = Promise.resolve(),
    sending = false,
    warned = false,
    enabled = false,
    policy = '30|20'
  let maintainedAt = Date.now()
  let lastEditAt = 0
  let queuedAt = null
  const opened = new Set()
  const captured = new Map()
  const fail = () => {
    if (!warned) {
      warned = true
      warn(
        'Não foi possível guardar o histórico. Suas notas continuam sendo salvas. Verifique o espaço livre e reabra o app para tentar novamente.',
      )
    }
  }
  function record(note, before, after, origin = 'sistema', gesture = 'nenhum', changes) {
    if (
      !invoke ||
      !enabled ||
      (before === after && origin !== 'abertura' && origin !== 'copia' && origin !== 'conflito')
    )
      return
    if (origin === 'abertura') {
      if (opened.has(note.id)) return
      opened.add(note.id)
    }
    if (['sistema', 'codigo'].includes(origin) && captured.get(note.id) === after) return
    changes ??= diffTexts(before, after)
    captured.set(note.id, after)
    const now = Date.now()
    lastEditAt = now
    queuedAt ??= now
    const entry = {
      v: 1,
      t: now,
      dia: new Date(now).toISOString().slice(0, 10),
      nota: note.id,
      caminho: note.external?.path ?? note.name,
      rev: note.revision,
      origem: origin,
      gesto: gesture,
      mudancas: changes,
      alertas: alerts(before, changes, origin, gesture),
      antes: before,
      depois: after,
      externa: Boolean(note.external),
    }
    if (entry.alertas.length) entry.alerta = entry.alertas[0]
    const last = queue.at(-1)
    if (canGroup(last, entry)) {
      last.depois = after
      // Recompute the combined diff once at flush, never on every keystroke.
      last.mudancas = null
      if (!last.origem.startsWith('input.type')) last.origem = entry.origem
      last.t = now
      last.rev = note.revision
    } else queue.push(entry)
  }
  function observe(previous, next, origin = 'sistema') {
    enabled = Boolean(invoke) && next.preferences.historyEnabled === true
    if (!enabled) return
    const wanted = `${historyDays(next.preferences)}|${historyLimit(next.preferences)}`
    if (wanted !== policy) {
      policy = wanted
      const [days, megabytes] = wanted.split('|').map(Number)
      // Apply the new limits first, then let the next flush prune with them.
      running = running
        .then(() => invoke('history_configure', { days, megabytes }))
        .then(() => {
          maintainedAt = 0
        })
        .catch(fail)
    }
    const openIds = new Set(next.openIds ?? next.notes.map((n) => n.id))
    const old = new Map(previous.notes.map((n) => [n.id, n]))
    for (const note of next.notes) {
      const before = old.get(note.id)
      if (!opened.has(note.id) && (openIds.has(note.id) || before?.body !== note.body)) {
        record(note, before?.body ?? note.body, before?.body ?? note.body, 'abertura')
      }
      if (before && before.body !== note.body) record(note, before.body, note.body, origin)
    }
  }
  function flush() {
    // Keep only one IPC request in flight. Further typing stays in the same
    // coalescing queue instead of building a chain of full-document payloads.
    if (sending) return running.then(() => flush())
    const maintain = invoke && Date.now() - maintainedAt > 86400000
    if (maintain) maintainedAt = Date.now()
    const batch = queue
    queue = []
    queuedAt = null
    if (!batch.length && !maintain) return running
    sending = true
    running = Promise.resolve()
      .then(async () => {
        for (const entry of batch) entry.mudancas ??= diffTexts(entry.antes, entry.depois)
        if (batch.length) await invoke('history_append', { entries: batch })
        if (maintain) await invoke('history_maintain')
      })
      .catch(fail)
      .finally(() => {
        sending = false
      })
    return running
  }
  return {
    record,
    get enabled() {
      return Boolean(invoke) && enabled
    },
    // Idle batching is independent from note saving. A continuous edit is sent
    // at most every ten seconds; explicit history/close actions still force flush.
    flushIfDue() {
      if (sending) return running
      const now = Date.now()
      if (queuedAt !== null && (now - lastEditAt >= 2000 || now - queuedAt >= 10000)) return flush()
      if (now - maintainedAt > 86400000) return flush()
      return running
    },
    setEnabled(value) {
      enabled = value
    },
    observe,
    flush,
    async list(id) {
      await flush()
      return invoke('history_list', { id })
    },
    object: (hash) => invoke('history_object', { hash }),
    async clear(id = null) {
      await flush()
      return invoke('history_clear', { id })
    },
  }
}
