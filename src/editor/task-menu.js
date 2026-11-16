import { TASK_STATUSES } from '../tasks.js'
import { t } from '../i18n.js'

let closeOpenMenu = null

/**
 * Small menu with the five task statuses, opened at the pointer (right click, long press or
 * the menu key). Arrow keys move, Enter picks, Escape closes; focus returns to `restoreFocus`.
 */
export function openTaskMenu({ x, y, current, onSelect, onUnarchive, restoreFocus }) {
  closeOpenMenu?.()
  const menu = document.createElement('div')
  menu.className = 'task-status-menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', t('task.statusMenu'))
  const items = TASK_STATUSES.map((status, index) => {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'task-status-item'
    item.dataset.status = status
    item.setAttribute('role', 'menuitemradio')
    item.setAttribute('aria-checked', String(status === current))
    const dot = document.createElement('span')
    dot.className = 'task-status-dot'
    dot.setAttribute('aria-hidden', 'true')
    const label = document.createElement('span')
    label.textContent = t(`task.status.${status}`)
    const key = document.createElement('kbd')
    key.textContent = `Alt+${index + 1}`
    item.append(dot, label, key)
    item.addEventListener('click', () => {
      close()
      onSelect(status)
    })
    return item
  })
  if (onUnarchive) {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'task-status-item task-unarchive'
    item.setAttribute('role', 'menuitem')
    const spacer = document.createElement('span')
    const label = document.createElement('span')
    label.textContent = t('task.unarchive')
    item.append(spacer, label)
    item.addEventListener('click', () => {
      close()
      onUnarchive()
    })
    items.push(item)
  }
  menu.append(...items)
  const close = () => {
    document.removeEventListener('pointerdown', outside, true)
    document.removeEventListener('keydown', keys, true)
    menu.remove()
    closeOpenMenu = null
    restoreFocus?.()
  }
  const outside = (event) => {
    if (!menu.contains(event.target)) close()
  }
  const keys = (event) => {
    const at = items.indexOf(document.activeElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      items[(at + step + items.length) % items.length].focus()
    }
  }
  document.body.append(menu)
  const box = menu.getBoundingClientRect()
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - box.width - 4))}px`
  menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - box.height - 4))}px`
  items[Math.max(0, TASK_STATUSES.indexOf(current))].focus()
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('keydown', keys, true)
  closeOpenMenu = close
}

/** Opens the menu on a long press (touch or pen), where there is no right click. */
export function onLongPress(element, open, delay = 550) {
  let timer = null
  const cancel = () => clearTimeout(timer)
  element.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return
    const { clientX, clientY } = event
    cancel()
    timer = setTimeout(() => {
      element.dataset.longPressed = ''
      open(clientX, clientY)
    }, delay)
  })
  for (const type of ['pointerup', 'pointercancel', 'pointermove', 'pointerleave'])
    element.addEventListener(type, cancel)
  // The click that ends a long press must not also toggle the task.
  element.addEventListener(
    'click',
    (event) => {
      if (element.dataset.longPressed === undefined) return
      delete element.dataset.longPressed
      event.preventDefault()
      event.stopImmediatePropagation()
    },
    true,
  )
}
