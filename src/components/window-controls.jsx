import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { toast } from 'sonner'
import { friendlyError } from '../errors.js'
import { t } from '../i18n.js'
import { ShortcutButton } from './shortcut-button.jsx'

const BUTTONS = [
  ['minimize', 'window.minimize', Minus],
  ['toggleMaximize', 'window.maximize', Square],
  ['close', 'window.close', X],
]

export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform)

/** Minimize, maximize and close. On macOS they are the traffic lights at the left. */
export function WindowControls({ mac = false }) {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    if (mac || /Android/i.test(navigator.userAgent)) return
    const appWindow = getCurrentWindow()
    let active = true
    let unlisten
    const refresh = async () => {
      try {
        const value = await appWindow.isMaximized()
        if (active) setMaximized(value)
      } catch {
        // Window controls remain usable even if the state query fails.
      }
    }
    refresh()
    appWindow
      .onResized(refresh)
      .then((stop) => {
        if (active) unlisten = stop
        else stop()
      })
      .catch(() => {})
    return () => {
      active = false
      unlisten?.()
    }
  }, [mac])
  if (/Android/i.test(navigator.userAgent)) return null
  const run = async (action) => {
    try {
      await getCurrentWindow()[action]()
      if (action === 'toggleMaximize') setMaximized(await getCurrentWindow().isMaximized())
    } catch (error) {
      toast.error(friendlyError(error))
    }
  }
  return (
    <div className={mac ? 'window-controls mac' : 'window-controls'}>
      {(mac ? [BUTTONS[2], BUTTONS[0], BUTTONS[1]] : BUTTONS).map(([action, label, Icon]) => {
        const restore = !mac && action === 'toggleMaximize' && maximized
        const ButtonIcon = restore ? Copy : Icon
        return (
          <ShortcutButton
            key={action}
            className={mac ? `traffic-light window-${action}` : `icon-button window-${action}`}
            label={t(restore ? 'window.restore' : label)}
            onClick={() => run(action)}
          >
            <ButtonIcon size={mac ? 8 : 15} strokeWidth={mac ? 3 : 2} aria-hidden="true" />
          </ShortcutButton>
        )
      })}
    </div>
  )
}
