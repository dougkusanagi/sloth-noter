import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  initialNavigation,
  navigate,
  backTarget,
  restoreNavigation,
  loadNavigation,
  saveNavigation,
  NAV_SESSION_KEY,
} from './mobile/nav-stack.js'

const note = (state, id = 'n1') => navigate(state, { type: 'push', route: { name: 'note', id } })

test('#5 back closes the top layer, then keyboard, then detail, then exits', () => {
  let state = note(initialNavigation())
  state = navigate(state, { type: 'layer', route: { name: 'sheet', id: 'actions' } })
  state = navigate(state, { type: 'layer', route: { name: 'dialog', id: 'rename' } })
  assert.equal(backTarget(state, true), 'layer')
  state = navigate(state, { type: 'back' })
  assert.equal(state.layers.at(-1).name, 'sheet')
  state = navigate(state, { type: 'back' })
  assert.equal(backTarget(state, true), 'keyboard')
  assert.equal(backTarget(state), 'screen')
  state = navigate(state, { type: 'back' })
  assert.equal(backTarget(state), 'exit')
  assert.equal(navigate(state, { type: 'back' }), state)
})

test('#7, #22 returning from a note preserves search and scroll without mutating prior state', () => {
  const home = navigate(initialNavigation(), {
    type: 'position',
    position: { query: 'ação 🦥', scroll: 420 },
  })
  const opened = note(home)
  const positioned = navigate(opened, { type: 'position', position: { scroll: 100, cursor: 42 } })
  assert.equal(opened.screens[1].scroll, undefined)
  assert.deepEqual(navigate(positioned, { type: 'back' }), home)
  assert.deepEqual(restoreNavigation(positioned), positioned)
})

test('top-level tabs replace details and layers', () => {
  const state = navigate(note(initialNavigation()), { type: 'layer', route: { name: 'find' } })
  for (const name of ['notes', 'tasks', 'images']) {
    assert.deepEqual(navigate(state, { type: 'tab', name }), initialNavigation(name))
  }
  assert.equal(navigate(state, { type: 'tab', name: 'unknown' }), state)
})

test('restoration removes transient layers and stops at deleted notes', () => {
  let state = note(initialNavigation('tasks'))
  state = navigate(state, { type: 'push', route: { name: 'history', id: 'n1' } })
  state = navigate(state, { type: 'layer', route: { name: 'dialog' } })
  assert.deepEqual(restoreNavigation(state).layers, [])
  assert.deepEqual(
    restoreNavigation(state, () => false),
    initialNavigation('tasks'),
  )
})

test('malformed snapshots and unknown routes fall back safely', () => {
  for (const value of [null, {}, [], { screens: [] }, { screens: [{ name: 'note' }] }]) {
    assert.deepEqual(restoreNavigation(value), initialNavigation())
  }
  const state = initialNavigation()
  assert.equal(navigate(state, { type: 'push', route: { name: 'note' } }), state)
  assert.equal(navigate(state, { type: 'layer', route: { name: 'unknown' } }), state)
  assert.deepEqual(
    restoreNavigation({
      screens: [{ name: 'notes', scroll: -1, body: 'private' }, { name: 'unknown' }],
    }),
    state,
  )
})

test('session storage persists positions without note text or transient layers', () => {
  const entries = new Map()
  const storage = {
    getItem: (key) => entries.get(key),
    setItem: (key, value) => entries.set(key, value),
  }
  const state = navigate(note(initialNavigation()), {
    type: 'position',
    position: { cursor: 9, body: 'private' },
  })
  assert.equal(saveNavigation(storage, state), true)
  assert.deepEqual(loadNavigation(storage), state)
  assert.ok(!entries.get(NAV_SESSION_KEY).includes('private'))
  entries.set(NAV_SESSION_KEY, '{broken')
  assert.deepEqual(loadNavigation(storage), initialNavigation())
  const blocked = {
    getItem() {
      throw Error('blocked')
    },
    setItem() {
      throw Error('full')
    },
  }
  assert.deepEqual(loadNavigation(blocked), initialNavigation())
  assert.equal(saveNavigation(blocked, state), false)
})

test('browser back and forward restore screens and nested layers; disposal removes listener', async () => {
  const { createNavigation } = await import('./mobile/nav-stack.js')
  let listener
  const events = {
    addEventListener: (_, callback) => {
      listener = callback
    },
    removeEventListener: (_, callback) => {
      assert.equal(callback, listener)
      listener = null
    },
  }
  const entries = [{ unrelated: 'preserved' }]
  let index = 0
  const history = {
    get state() {
      return entries[index]
    },
    replaceState(value) {
      entries[index] = value
    },
    pushState(value) {
      entries.splice(++index)
      entries[index] = value
    },
    back() {
      if (index) listener({ state: entries[--index] })
    },
    forward() {
      if (index + 1 < entries.length) listener({ state: entries[++index] })
    },
  }
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  }
  let updates = 0
  const nav = createNavigation({ history, events, storage, onChange: () => updates++ })
  nav.dispatch({ type: 'position', position: { query: 'meeting', scroll: 240 } })
  nav.dispatch({ type: 'push', route: { name: 'note', id: 'n1' } })
  nav.dispatch({ type: 'layer', route: { name: 'sheet', id: 'insert' } })
  nav.dispatch({ type: 'layer', route: { name: 'dialog', id: 'link' } })
  assert.equal(entries.length, 4)
  assert.equal(history.state.unrelated, 'preserved')
  nav.dispatch({ type: 'back' })
  assert.equal(nav.getState().layers.at(-1).id, 'insert')
  history.forward()
  assert.equal(nav.getState().layers.at(-1).id, 'link')
  history.back()
  history.back()
  history.back()
  assert.equal(nav.getState().screens[0].query, 'meeting')
  assert.equal(nav.getState().screens[0].scroll, 240)
  assert.equal(backTarget(nav.getState()), 'exit')
  assert.ok(updates > 4)
  nav.dispose()
  assert.equal(listener, null)
})

test('#7 a fresh WebView rebuilds parent history for a restored note without duplicating on reload', async () => {
  const { createNavigation } = await import('./mobile/nav-stack.js')
  const restored = note(
    navigate(initialNavigation(), { type: 'position', position: { query: 'reunião', scroll: 80 } }),
  )
  let saved = JSON.stringify(restored),
    listener
  const storage = {
    getItem: () => saved,
    setItem: (_, value) => {
      saved = value
    },
  }
  const events = {
    addEventListener: (_, fn) => {
      listener = fn
    },
    removeEventListener() {},
  }
  const entries = [null]
  let index = 0
  const history = {
    get state() {
      return entries[index]
    },
    replaceState(value) {
      entries[index] = value
    },
    pushState(value) {
      entries[++index] = value
    },
    back() {
      listener({ state: entries[--index] })
    },
  }
  const nav = createNavigation({ history, storage, events })
  assert.equal(entries.length, 2)
  assert.deepEqual(nav.getState(), restored)
  nav.dispose()
  const reloaded = createNavigation({ history, storage, events })
  assert.equal(entries.length, 2)
  reloaded.dispatch({ type: 'back' })
  assert.equal(reloaded.getState().screens[0].query, 'reunião')
  assert.equal(reloaded.getState().screens[0].scroll, 80)
})
