import { ChangeSet } from '@codemirror/state'

export function documentChanges(before, after) {
  let from = 0
  while (from < before.length && from < after.length && before[from] === after[from]) from++
  let endBefore = before.length,
    endAfter = after.length
  while (endBefore > from && endAfter > from && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--
    endAfter--
  }
  return ChangeSet.of({ from, to: endBefore, insert: after.slice(from, endAfter) }, before.length)
}

export function mapSearchScope(scope, changes) {
  if (!scope) return null
  return { from: changes.mapPos(scope.from, -1), to: changes.mapPos(scope.to, 1) }
}
