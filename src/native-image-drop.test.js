import test from 'node:test'
import assert from 'node:assert/strict'
import { listenNativeImageDrops } from './native-image-drop.js'
import { importImage } from './images.js'

test('native drops retain complete paths with spaces and convert physical coordinates', async () => {
  const originalWindow = globalThis.window
  globalThis.window = { devicePixelRatio: 2 }
  try {
    let handler
    const received = []
    const stop = () => {}
    const unsubscribe = await listenNativeImageDrops(
      (files, position) => received.push({ files, position }),
      async () => ({
        getCurrentWebview: () => ({
          onDragDropEvent: async (callback) => {
            handler = callback
            return stop
          },
        }),
      }),
    )
    handler({ payload: { type: 'enter', paths: ['ignore'] } })
    handler({
      payload: {
        type: 'drop',
        paths: ['/home/user/#101 Calça Jeans Básica.jpg'],
        position: { x: 600, y: 400 },
      },
    })
    assert.equal(unsubscribe, stop)
    assert.deepEqual(received, [
      {
        files: [
          {
            nativePath: '/home/user/#101 Calça Jeans Básica.jpg',
            name: '#101 Calça Jeans Básica.jpg',
          },
        ],
        position: { x: 300, y: 200 },
      },
    ])
    const calls = []
    const src = await importImage(received[0].files[0], async (command, args) => {
      calls.push({ command, args })
      return 'assets/copied.jpg'
    })
    assert.equal(src, 'assets/copied.jpg')
    assert.deepEqual(calls, [
      { command: 'image_import_drop', args: { path: '/home/user/#101 Calça Jeans Básica.jpg' } },
    ])
  } finally {
    globalThis.window = originalWindow
  }
})

test('native drops target the editor and ignore drops outside it', async () => {
  const { routeNativeImageDrop } = await import('./native-image-drop.js')
  const received = []
  const files = [{ nativePath: '/tmp/a.png', name: 'a.png' }]
  const position = { x: 200, y: 300 }
  const editor = {
    elementFromPoint: () => ({ closest: (selector) => (selector === '.editor-shell' ? {} : null) }),
  }
  assert.equal(
    routeNativeImageDrop(files, position, (...args) => received.push(args), editor),
    'editor',
  )
  assert.deepEqual(received, [[files, position]])
  assert.equal(
    routeNativeImageDrop(files, position, () => assert.fail(), { elementFromPoint: () => null }),
    null,
  )
})
