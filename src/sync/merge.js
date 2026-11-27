// Three-way line merge (ADR 0018): independent changes are combined; overlapping
// changes become conflict chunks that keep both versions. Rendering is the engine's job.

// Above this many cells the middle is not diffed: it becomes one conflict, which keeps
// both texts instead of spending memory on a huge table.
const MAX_CELLS = 4_000_000

/** For each base line, the index of its match in `other` (LCS), or -1. */
function matches(base, other) {
  const map = new Int32Array(base.length).fill(-1)
  let start = 0
  while (start < base.length && start < other.length && base[start] === other[start]) {
    map[start] = start
    start++
  }
  let endBase = base.length
  let endOther = other.length
  while (endBase > start && endOther > start && base[endBase - 1] === other[endOther - 1]) {
    endBase--
    endOther--
    map[endBase] = endOther
  }
  const rows = endBase - start
  const cols = endOther - start
  if (!rows || !cols || rows * cols > MAX_CELLS) return map
  const table = new Uint32Array((rows + 1) * (cols + 1))
  const at = (i, j) => i * (cols + 1) + j
  for (let i = rows - 1; i >= 0; i--)
    for (let j = cols - 1; j >= 0; j--)
      table[at(i, j)] =
        base[start + i] === other[start + j]
          ? table[at(i + 1, j + 1)] + 1
          : Math.max(table[at(i + 1, j)], table[at(i, j + 1)])
  for (let i = 0, j = 0; i < rows && j < cols;) {
    if (base[start + i] === other[start + j]) {
      map[start + i] = start + j
      i++
      j++
    } else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) i++
    else j++
  }
  return map
}

const same = (a, b) => a.length === b.length && a.every((line, index) => line === b[index])

const TASK_LINE = /^(\s*[-*+]\s+)\[([ xX~?-])\](\s+)(.*)$/
const TASK_STAMP = /\s+[✅❌]\s+\d{4}-\d{2}-\d{2}\s*$/

/**
 * When both sides edited the exact same single task line and one side only
 * marked it completed/canceled while the other kept it open, keep the
 * completed/canceled line automatically instead of raising a conflict.
 */
function autoResolveTask(ours, theirs) {
  if (ours.length !== 1 || theirs.length !== 1) return null
  const mOurs = TASK_LINE.exec(ours[0])
  const mTheirs = TASK_LINE.exec(theirs[0])
  if (!mOurs || !mTheirs) return null
  if (mOurs[1] !== mTheirs[1]) return null
  const textOurs = mOurs[4].replace(TASK_STAMP, '').trim()
  const textTheirs = mTheirs[4].replace(TASK_STAMP, '').trim()
  if (!textOurs || textOurs !== textTheirs) return null
  const doneOurs = mOurs[2] === 'x' || mOurs[2] === 'X' || mOurs[2] === '-'
  const doneTheirs = mTheirs[2] === 'x' || mTheirs[2] === 'X' || mTheirs[2] === '-'
  if (doneOurs && mTheirs[2] === ' ') return ours
  if (doneTheirs && mOurs[2] === ' ') return theirs
  return null
}

/**
 * Two-way line merge (LCS) used when no common base is available (e.g. first
 * sync or reconnected account): identical lines merge cleanly and only truly
 * differing spans become conflict chunks.
 */
export function mergeTwoWay(oursText, theirsText) {
  const ours = oursText.split('\n')
  const theirs = theirsText.split('\n')
  const toTheirs = matches(ours, theirs)
  const chunks = []
  const push = (lines) => {
    if (!lines.length) return
    const last = chunks.at(-1)
    if (last?.lines) last.lines.push(...lines)
    else chunks.push({ lines: [...lines] })
  }
  let o = 0
  let t = 0
  for (;;) {
    let k = o
    while (k < ours.length && toTheirs[k] < 0) k++
    const end = k === ours.length
    const x = ours.slice(o, k)
    const y = theirs.slice(t, end ? theirs.length : toTheirs[k])
    if (x.length || y.length) {
      const resolved = autoResolveTask(x, y)
      if (resolved) push(resolved)
      else chunks.push({ conflict: { base: [], ours: x, theirs: y } })
    }
    if (end) break
    push([ours[k]])
    o = k + 1
    t = toTheirs[k] + 1
  }
  return { conflict: chunks.some((chunk) => chunk.conflict), chunks }
}

/**
 * Returns `{ conflict, chunks }`. Each chunk is `{ lines }` or
 * `{ conflict: { base, ours, theirs } }`, all as arrays of lines.
 * When `baseText` is null/undefined, falls back to two-way LCS merge.
 */
export function mergeLines(baseText, oursText, theirsText) {
  if (baseText === null || baseText === undefined) return mergeTwoWay(oursText, theirsText)
  const base = baseText.split('\n')
  const ours = oursText.split('\n')
  const theirs = theirsText.split('\n')
  const toOurs = matches(base, ours)
  const toTheirs = matches(base, theirs)
  const chunks = []
  const push = (lines) => {
    if (!lines.length) return
    const last = chunks.at(-1)
    if (last?.lines) last.lines.push(...lines)
    else chunks.push({ lines: [...lines] })
  }
  let i = 0
  let o = 0
  let t = 0
  for (;;) {
    let k = i
    while (k < base.length && (toOurs[k] < 0 || toTheirs[k] < 0)) k++
    const end = k === base.length
    const b = base.slice(i, k)
    const x = ours.slice(o, end ? ours.length : toOurs[k])
    const y = theirs.slice(t, end ? theirs.length : toTheirs[k])
    if (same(x, b)) push(y)
    else if (same(y, b) || same(x, y)) push(x)
    else {
      const resolved = autoResolveTask(x, y)
      if (resolved) push(resolved)
      else chunks.push({ conflict: { base: b, ours: x, theirs: y } })
    }
    if (end) break
    push([base[k]])
    i = k + 1
    o = toOurs[k] + 1
    t = toTheirs[k] + 1
  }
  return { conflict: chunks.some((chunk) => chunk.conflict), chunks }
}

/**
 * Applies per-hunk decisions (`'ours' | 'theirs' | 'both'`) to `mergeLines` chunks
 * and returns the resolved text.
 */
export function applyHunkChoices(chunks, choices) {
  let hunkIndex = 0
  const lines = []
  for (const chunk of chunks) {
    if (chunk.lines) {
      lines.push(...chunk.lines)
      continue
    }
    const choice = choices[hunkIndex++] ?? 'ours'
    if (choice === 'theirs') lines.push(...chunk.conflict.theirs)
    else if (choice === 'both') lines.push(...chunk.conflict.ours, ...chunk.conflict.theirs)
    else lines.push(...chunk.conflict.ours)
  }
  return lines.join('\n')
}
