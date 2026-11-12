// A small menu the editor builds itself, next to a button (block and table
// handles). Arrow keys move between items, Escape or Tab closes it and gives
// the focus back to the button, and a click outside closes it.
export function openPopupMenu({ view, anchor, label, className = '', build, onClose }) {
  document.querySelector('.editor-popup-menu')?.dispatchEvent(new Event('close'))
  const menu = document.createElement('div')
  menu.className = `table-context-menu editor-popup-menu ${className}`.trim()
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', label)
  const close = (focus = true) => {
    if (!menu.isConnected) return
    menu.remove()
    document.removeEventListener('pointerdown', outside, true)
    anchor.setAttribute('aria-expanded', 'false')
    onClose?.()
    if (focus) view.focus()
  }
  const outside = (event) => {
    if (!menu.contains(event.target) && !anchor.contains(event.target)) close(false)
  }
  menu.addEventListener('close', () => close(false))
  const run = (action) => () => {
    close()
    action()
  }
  const item = (icon, text, action, { checked, active } = {}) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', checked == null ? 'menuitem' : 'menuitemcheckbox')
    if (checked != null) button.setAttribute('aria-checked', String(checked))
    if (active) button.classList.add('is-active')
    button.innerHTML = `<span class="table-context-menu-icon">${icon}</span>`
    const caption = document.createElement('span')
    caption.className = 'menu-item-label'
    caption.textContent = text
    button.append(caption)
    if (checked != null) {
      const toggle = document.createElement('span')
      toggle.className = 'table-menu-switch'
      toggle.setAttribute('aria-hidden', 'true')
      button.append(toggle)
    }
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', run(action))
    return button
  }
  const iconButton = (icon, text, action, { current } = {}) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'menuitemradio')
    button.setAttribute('aria-checked', String(Boolean(current)))
    button.setAttribute('aria-label', text)
    button.title = text
    button.className = 'editor-popup-icon'
    button.innerHTML = icon
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', run(action))
    return button
  }
  const grid = (text, buttons) => {
    const group = document.createElement('div')
    group.className = 'editor-popup-grid'
    group.setAttribute('role', 'group')
    group.setAttribute('aria-label', text)
    group.append(...buttons)
    return group
  }
  const separator = () => {
    const line = document.createElement('div')
    line.className = 'table-context-menu-separator'
    line.setAttribute('role', 'separator')
    return line
  }
  build(menu, { item, iconButton, grid, separator, close })
  menu.addEventListener('keydown', (event) => {
    const buttons = [...menu.querySelectorAll('button:not(:disabled)')]
    const index = buttons.indexOf(document.activeElement)
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key]
    if (step) {
      event.preventDefault()
      buttons[(index + step + buttons.length) % buttons.length]?.focus()
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      close(false)
      anchor.focus()
    }
  })
  document.body.append(menu)
  const box = anchor.getBoundingClientRect()
  const { offsetWidth: width, offsetHeight: height } = menu
  menu.style.left = `${Math.max(8, Math.min(box.left, innerWidth - width - 8))}px`
  menu.style.top = `${box.bottom + 6 + height > innerHeight ? Math.max(8, box.top - height - 6) : box.bottom + 6}px`
  anchor.setAttribute('aria-expanded', 'true')
  document.addEventListener('pointerdown', outside, true)
  menu.querySelector('button')?.focus()
  return close
}
