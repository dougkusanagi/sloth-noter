import { toast } from 'sonner'
import { t } from './i18n.js'

/**
 * Copy, cut and paste on the editor selection, shared by the desktop toolbar
 * and the mobile formatting bar. `onPaste` lets the host route pasted files.
 */
export async function clipboardAction(view, action, { onPaste } = {}) {
  const { from, to } = view.state.selection.main
  if (action === 'paste') {
    view.focus()
    if (onPaste) return onPaste()
    try {
      const clipboardData = new DataTransfer()
      clipboardData.setData('text/plain', await navigator.clipboard.readText())
      view.contentDOM.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
      )
    } catch {
      toast.error(t('editor.pasteFailed'), { id: 'clipboard' })
    }
    return
  }
  try {
    await navigator.clipboard.writeText(view.state.sliceDoc(from, to))
  } catch {
    toast.error(t('code.copyFailed'), { id: 'clipboard' })
    return
  }
  if (action === 'cut') view.dispatch({ changes: { from, to }, userEvent: 'delete.cut' })
  else toast.success(t('code.copied'), { id: 'clipboard', duration: 1800 })
  view.focus()
}
