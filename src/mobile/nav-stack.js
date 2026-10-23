// Serializable navigation state. Note text stays in the notes store, never in history/storage.
export const NAV_SESSION_KEY = 'sloth.mobile.navigation.v1'
const roots = new Set(['notes', 'tasks', 'images'])
const details = new Set(['note', 'trash', 'settings', 'history', 'table', 'image'])
const layers = new Set(['sheet', 'dialog', 'find'])

export function initialNavigation(tab = 'notes') {
  return { screens: [{ name: roots.has(tab) ? tab : 'notes' }], layers: [] }
}

function validRoute(route, names) {
  return (
    route &&
    names.has(route.name) &&
    (route.id === undefined || (typeof route.id === 'string' && route.id.length > 0))
  )
}

function copyRoute(route) {
  const result = { name: route.name }
  if (route.id !== undefined) result.id = route.id
  if (typeof route.query === 'string') result.query = route.query
  if (Number.isFinite(route.scroll) && route.scroll >= 0) result.scroll = route.scroll
  if (Number.isSafeInteger(route.cursor) && route.cursor >= 0) result.cursor = route.cursor
  return result
}

export function restoreNavigation(value, noteExists = () => true) {
  if (!value || !Array.isArray(value.screens) || !roots.has(value.screens[0]?.name)) {
    return initialNavigation()
  }
  const screens = [copyRoute(value.screens[0])]
  for (const route of value.screens.slice(1)) {
    if (!validRoute(route, details)) break
    if (['note', 'history', 'table', 'image'].includes(route.name) && !route.id) break
    if (['note', 'history', 'table'].includes(route.name) && !noteExists(route.id)) break
    screens.push(copyRoute(route))
  }
  // Transient layers must not reopen after a restart.
  return { screens, layers: [] }
}

export function navigate(state, action) {
  switch (action.type) {
    case 'tab':
      return roots.has(action.name) ? initialNavigation(action.name) : state
    case 'push':
      if (!validRoute(action.route, details)) return state
      if (['note', 'history', 'table', 'image'].includes(action.route.name) && !action.route.id)
        return state
      return { screens: [...state.screens, copyRoute(action.route)], layers: [] }
    case 'layer':
      return validRoute(action.route, layers)
        ? { ...state, layers: [...state.layers, copyRoute(action.route)] }
        : state
    case 'position': {
      const screens = [...state.screens]
      screens[screens.length - 1] = copyRoute({
        ...screens.at(-1),
        ...action.position,
        name: screens.at(-1).name,
        id: screens.at(-1).id,
      })
      return { ...state, screens }
    }
    case 'back':
      if (state.layers.length) return { ...state, layers: state.layers.slice(0, -1) }
      if (state.screens.length > 1) return { ...state, screens: state.screens.slice(0, -1) }
      return state
    default:
      return state
  }
}

// Back dispatch is kept separate from state so keyboard/exit effects stay with the host.
export function backTarget(state, keyboardOpen = false) {
  if (state.layers.length) return 'layer'
  if (keyboardOpen) return 'keyboard'
  return state.screens.length > 1 ? 'screen' : 'exit'
}

export function loadNavigation(storage, noteExists) {
  try {
    return restoreNavigation(JSON.parse(storage.getItem(NAV_SESSION_KEY)), noteExists)
  } catch {
    return initialNavigation()
  }
}

export function saveNavigation(storage, state) {
  try {
    storage.setItem(NAV_SESSION_KEY, JSON.stringify(restoreNavigation(state)))
    return true
  } catch {
    // Navigation still works when storage is disabled or full.
    return false
  }
}

// Browser adapter: screens/layers add history entries; positions replace the current one.
// The host handles keyboard dismissal before requesting back(), using backTarget().
export function createNavigation({ history, events, storage, noteExists, onChange = () => {} }) {
  let state = loadNavigation(storage, noteExists)
  const entry = () => ({ ...history.state, slothMobile: { version: 1, state } })
  const publish = () => {
    saveNavigation(storage, state)
    onChange(state)
  }
  // A new WebView can restore a detail from sessionStorage without any back entries.
  // Rebuild its parent screens; a reload already has browser entries and must not duplicate them.
  const restored = state
  if (history.state?.slothMobile?.version !== 1 && restored.screens.length > 1) {
    state = { screens: [restored.screens[0]], layers: [] }
    history.replaceState(entry(), '')
    for (const screen of restored.screens.slice(1)) {
      state = { screens: [...state.screens, screen], layers: [] }
      history.pushState(entry(), '')
    }
  } else history.replaceState(entry(), '')
  const pop = (event) => {
    const saved = event.state?.slothMobile
    if (saved?.version !== 1) return
    const restored = restoreNavigation(saved.state, noteExists)
    // In-session browser history restores layers, unlike a persisted session.
    const savedLayers = saved.state?.layers
    state = {
      ...restored,
      layers: Array.isArray(savedLayers)
        ? savedLayers.filter((route) => validRoute(route, layers)).map(copyRoute)
        : [],
    }
    publish()
  }
  events.addEventListener('popstate', pop)
  return {
    getState: () => state,
    dispatch(action) {
      if (action.type === 'back') {
        if (backTarget(state) !== 'exit') history.back()
        return
      }
      const next = navigate(state, action)
      if (next === state) return
      state = next
      if (action.type === 'push' || action.type === 'layer') history.pushState(entry(), '')
      else history.replaceState(entry(), '')
      publish()
    },
    dispose() {
      events.removeEventListener('popstate', pop)
    },
  }
}
