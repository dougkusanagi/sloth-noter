import { Minus, Square, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { toast } from 'sonner'
import { friendlyError } from '../errors.js'
import { t } from '../i18n.js'

export function WindowControls() {
  const run = async (action) => {
    try {
      await getCurrentWindow()[action]()
    } catch (error) {
      toast.error(friendlyError(error))
    }
  }
  return (
    <div className="window-controls">
      {[
        ['minimize', 'window.minimize', Minus],
        ['toggleMaximize', 'window.maximize', Square],
        ['close', 'window.close', X],
      ].map(([action, label, Icon]) => (
        <button
          key={action}
          className={`icon-button window-${action}`}
          aria-label={t(label)}
          title={t(label)}
          onClick={() => run(action)}
        >
          <Icon size={15} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
