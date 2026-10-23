// Diagnostic entry served only by Vite dev. It is not imported by the app or bundled in the APK.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorView } from '@codemirror/view'
import { VisualEditor } from '../../src/visual-editor.jsx'
import '../../src/styles.css'
import './ime-spike.css'

// Exercise older WebViews without changing the production editor.
if (new URLSearchParams(location.search).has('legacy')) EditorView.EDIT_CONTEXT = false

const initial =
  '# Spike IME\n\n**hello** world\n\n*italic* and [link](https://example.com)\n\n- [ ] task\n\nEnd'
const events = []
let view
function record(event) {
  events.push({
    type: event.type,
    target: event.target === view?.contentDOM.editContext ? 'edit-context' : 'dom',
    text: event.text ?? null,
    updateRangeStart: event.updateRangeStart ?? null,
    updateRangeEnd: event.updateRangeEnd ?? null,
    data: event.data ?? null,
    inputType: event.inputType ?? null,
    isComposing: event.isComposing ?? null,
    trusted: event.isTrusted,
    composing: view?.composing ?? false,
    body: view?.state.doc.toString(),
    selection: view?.state.selection.main.toJSON(),
  })
}
for (const type of [
  'compositionstart',
  'compositionupdate',
  'compositionend',
  'beforeinput',
  'input',
]) {
  document.addEventListener(type, record, true)
}
window.__imeSpike = {
  events,
  snapshot: () => ({
    body: view?.state.doc.toString(),
    dom: view?.contentDOM.textContent,
    composing: view?.composing,
    editContext: Boolean(view?.contentDOM.editContext),
    selection: view?.state.selection.main.toJSON(),
    events: [...events],
  }),
  reset(body = initial, anchor = 2) {
    events.length = 0
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: body },
      selection: { anchor },
    })
  },
  select(anchor, head = anchor) {
    view.dispatch({ selection: { anchor, head }, scrollIntoView: true })
  },
}
function Spike() {
  const [body, setBody] = useState(initial)
  const [theme, setTheme] = useState(() => localStorage.getItem('ime-spike-theme') || 'system')
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
    }
    localStorage.setItem('ime-spike-theme', theme)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  return (
    <main className="ime-spike">
      <header>
        <h1>Spike IME</h1>
        <label>
          Tema{' '}
          <select value={theme} onChange={(event) => setTheme(event.target.value)}>
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
            <option value="system">Sistema</option>
          </select>
        </label>
      </header>
      <p>Área de teste sem gravação de notas. Toque no texto para abrir o teclado.</p>
      <VisualEditor
        noteId="ime-spike"
        body={body}
        onChange={setBody}
        onReady={(next) => {
          view = next
          if (view?.contentDOM.editContext) {
            for (const type of ['compositionstart', 'compositionend', 'textupdate'])
              view.contentDOM.editContext.addEventListener(type, record)
          }
        }}
      />
      <details>
        <summary>Markdown atual</summary>
        <pre>{body}</pre>
      </details>
    </main>
  )
}
createRoot(document.getElementById('root')).render(<Spike />)
