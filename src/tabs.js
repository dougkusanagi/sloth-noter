export function togglePinnedTab(document, id) {
  if (!document.openIds.includes(id)) return document
  const pinnedIds = (document.pinnedIds ?? []).includes(id)
    ? document.pinnedIds.filter((item) => item !== id)
    : [...(document.pinnedIds ?? []), id]
  const openIds = [
    ...document.openIds.filter((item) => pinnedIds.includes(item)),
    ...document.openIds.filter((item) => !pinnedIds.includes(item)),
  ]
  return { ...document, pinnedIds, openIds }
}

// Tabs stay inside their pinned/unpinned group when reordered.
export function moveTab(document, id, index) {
  if (!document.openIds.includes(id)) return document
  const pinnedIds = document.pinnedIds ?? []
  const pinned = pinnedIds.includes(id)
  const group = document.openIds.filter((item) => pinnedIds.includes(item) === pinned)
  const offset = pinned ? 0 : pinnedIds.length
  const target = Math.max(0, Math.min(group.length - 1, index - offset))
  const from = group.indexOf(id)
  if (from === target) return document
  group.splice(from, 1)
  group.splice(target, 0, id)
  const openIds = [...document.openIds]
  openIds.splice(offset, group.length, ...group)
  return { ...document, openIds }
}
