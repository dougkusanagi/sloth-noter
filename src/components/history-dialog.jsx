import { useEffect, useState } from 'react'
import { Modal } from './dialogs.jsx'

const origins = {
  abertura: 'Nota aberta',
  'input.type': 'Digitado',
  'input.paste': 'Colado',
  codigo: 'Editado no modo Código',
  disco: 'Alterado fora do app',
  'disco-externo': 'Arquivo externo alterado',
  restauracao: 'Versão restaurada',
  sistema: 'Alterado pelo app',
  formatacao: 'Formatação',
  tarefa: 'Tarefa alterada',
  lista: 'Lista alterada',
  bloco: 'Bloco inserido',
  conflito: 'Cópia de conflito',
  copia: 'Copiado para minhas notas',
}
export function historyOriginLabel(origin) {
  if (origins[origin]) return origins[origin]
  if (origin.startsWith('delete')) return 'Texto apagado'
  if (origin.startsWith('input.type')) return 'Digitado'
  if (origin.startsWith('input.replace')) return 'Texto substituído'
  if (origin.startsWith('input.drop')) return 'Texto arrastado'
  if (origin === 'undo') return 'Alteração desfeita'
  if (origin === 'redo') return 'Alteração refeita'
  return 'Alterado pelo app'
}
export function HistoryDialog({
  note,
  history,
  enabled,
  onToggle,
  theme,
  onTheme,
  onRestore,
  onClose,
}) {
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(null)
  const [pendingClear, setPendingClear] = useState(null)
  useEffect(() => {
    let live = true
    history
      .list(note.id)
      .then((items) => {
        if (live) setEntries(items.reverse())
      })
      .catch(() => {
        if (live)
          setError(
            'Não foi possível ler o histórico. Feche e abra esta tela para tentar novamente.',
          )
      })
    return () => {
      live = false
    }
  }, [history, note.id])
  async function restore(entry) {
    setBusy(true)
    setError('')
    try {
      onRestore(await history.object(entry.objeto))
    } catch {
      setError('Não foi possível recuperar esta versão. Tente outra versão.')
    } finally {
      setBusy(false)
    }
  }
  async function clear(all) {
    setBusy(true)
    setError('')
    try {
      await history.clear(all ? null : note.id)
      setEntries([])
      setSelected(null)
    } catch {
      setError('Não foi possível apagar o histórico. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      label="Histórico da nota"
      className="history-dialog"
      onEscape={onClose}
      backdropClose={onClose}
      focusables={(dialog) => [...dialog.querySelectorAll('button:not(:disabled), input, summary')]}
    >
      <header>
        <h2>Histórico da nota</h2>
        <button className="button" autoFocus onClick={onClose}>
          Fechar
        </button>
      </header>
      <div className="history-theme" role="group" aria-label="Tema">
        {['light', 'dark', 'system'].map((value, index) => (
          <button
            className="button"
            key={value}
            aria-pressed={theme === value}
            onClick={() => onTheme(value)}
          >
            {['Claro', 'Escuro', 'Sistema'][index]}
          </button>
        ))}
      </div>
      <p className="history-name">{note.name}</p>
      <label>
        <input type="checkbox" checked={enabled} onChange={onToggle} /> Guardar histórico neste
        dispositivo
      </label>
      <p>
        O histórico guarda também textos apagados, por até 30 dias ou 20 MB. Ele fica fora da pasta
        de notas.
      </p>
      {!enabled && (
        <p role="status">Histórico desligado. As versões já guardadas continuam disponíveis.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {!entries && !error && <p role="status">Lendo as versões guardadas…</p>}
      {entries?.length === 0 && (
        <p>
          Nenhuma versão guardada. As próximas alterações aparecerão aqui com o histórico ligado.
        </p>
      )}
      <div className="history-versions">
        {entries?.map((entry, index) => (
          <article key={`${entry.t}-${index}`}>
            {(index === 0 || entry.dia !== entries[index - 1].dia) && (
              <h3>{new Date(entry.t).toLocaleDateString('pt-BR')}</h3>
            )}
            <button
              className="button history-version"
              aria-expanded={selected === index}
              onClick={() => setSelected(selected === index ? null : index)}
            >
              <time dateTime={new Date(entry.t).toISOString()}>
                {new Date(entry.t).toLocaleString('pt-BR')}
              </time>
              <span>{historyOriginLabel(entry.origem)}</span>
              {entry.alertas?.includes('colagem-sem-gesto') && <strong>Colado sem Ctrl+V</strong>}
              {entry.alertas?.includes('remocao-grande') && <strong>Remoção grande</strong>}
            </button>
            {selected === index && (
              <div className="history-detail">
                {entry.mudancas.map((change, i) => (
                  <div key={i}>
                    {change.removido && (
                      <>
                        <h3>Texto removido</h3>
                        <pre>{change.removido}</pre>
                      </>
                    )}
                    {change.inserido && (
                      <>
                        <h3>Texto inserido</h3>
                        <pre>{change.inserido}</pre>
                      </>
                    )}
                  </div>
                ))}
                <button className="button" disabled={busy} onClick={() => restore(entry)}>
                  {busy ? 'Recuperando versão…' : 'Restaurar esta versão'}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      <details>
        <summary>Apagar histórico</summary>
        <p>Os textos apagados do histórico não poderão ser recuperados.</p>
        <button className="button" disabled={busy} onClick={() => setPendingClear(false)}>
          Apagar histórico desta nota
        </button>
        <button className="button" disabled={busy} onClick={() => setPendingClear(true)}>
          Apagar todo o histórico
        </button>
        {pendingClear !== null && (
          <div role="group" aria-label="Confirmar exclusão do histórico">
            <p>
              {pendingClear
                ? 'Apagar o histórico de todas as notas?'
                : 'Apagar o histórico desta nota?'}{' '}
              Esta ação não pode ser desfeita.
            </p>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => {
                void clear(pendingClear)
                setPendingClear(null)
              }}
            >
              Confirmar exclusão
            </button>
            <button className="button" disabled={busy} onClick={() => setPendingClear(null)}>
              Cancelar
            </button>
          </div>
        )}
      </details>
    </Modal>
  )
}
