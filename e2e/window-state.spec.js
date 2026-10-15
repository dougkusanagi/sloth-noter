import { expect, test } from '@playwright/test'

test('minimizing and transient zero-size events preserve usable window geometry', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  const states = await page.evaluate(async () => {
    const key = 'sloth-note:window-state'
    const initial = { version: 2, x: 60, y: 80, width: 980, height: 780, maximized: false }
    localStorage.setItem(key, JSON.stringify(initial))
    const callbacks = new Map()
    const listeners = new Map()
    let minimized = true
    let size = { width: 0, height: 0 }
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' } },
      transformCallback(handler) {
        const id = callbacks.size + 1
        callbacks.set(id, handler)
        return id
      },
      async invoke(command, args) {
        if (command === 'plugin:event|listen') {
          listeners.set(args.event, callbacks.get(args.handler))
          return args.handler
        }
        if (command === 'plugin:window|is_minimized') return minimized
        if (command === 'plugin:window|outer_position') return { x: 120, y: 160 }
        if (command === 'plugin:window|inner_size') return size
        if (command === 'plugin:window|is_maximized') return false
        if (['plugin:window|set_position', 'plugin:window|set_size'].includes(command)) return
        throw new Error(`Unexpected window command: ${command}`)
      },
    }
    const { restoreWindowState } = await import('/src/window-state.js')
    await restoreWindowState()
    const saved = () => JSON.parse(localStorage.getItem(key))
    const resize = async () => {
      listeners.get('tauri://resize')({ payload: size })
      // Tauri's resize wrapper does not return the async save handler's promise.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    await resize()
    const afterMinimize = saved()
    minimized = false
    await resize()
    const afterZeroSize = saved()
    size = { width: 1100, height: 820 }
    await resize()
    return { initial, afterMinimize, afterZeroSize, afterRestore: saved() }
  })
  expect(states.afterMinimize).toEqual(states.initial)
  expect(states.afterZeroSize).toEqual(states.initial)
  expect(states.afterRestore).toEqual({
    version: 2,
    x: 120,
    y: 160,
    width: 1100,
    height: 820,
    maximized: false,
  })
})
