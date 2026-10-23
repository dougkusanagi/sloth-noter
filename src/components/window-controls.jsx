import { Minus, Square, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { toast } from 'sonner'
import { friendlyError } from '../errors.js'
import { t } from '../i18n.js'

const BUTTONS = [
  ['minimize', 'window.minimize', Minus],
  ['toggleMaximize', 'window.maximize', Square],
  ['close', 'window.close', X],
]

export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform)

/** Minimize, maximize and close. On macOS they are the traffic lights at the left. */
export function WindowControls({ mac = false }) {
  if (/Android/i.test(navigator.userAgent)) return null
  const run = async (action) => {
    try {
      await getCurrentWindow()[action]()
    } catch (error) {
      toast.error(friendlyError(error))
    }
  }
  return (
    <div className={mac ? 'window-controls mac' : 'window-controls'}>
      {(mac ? [BUTTONS[2], BUTTONS[0], BUTTONS[1]] : BUTTONS).map(([action, label, Icon]) => (
        <button
          key={action}
          className={mac ? `traffic-light window-${action}` : `icon-button window-${action}`}
          aria-label={t(label)}
          title={t(label)}
          onClick={() => run(action)}
        >
          <Icon size={mac ? 8 : 15} strokeWidth={mac ? 3 : 2} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
