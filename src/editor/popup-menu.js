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
    document.querySelectorAll('.editor-popup-submenu').forEach((panel) => panel.remove())
    document.removeEventListener('pointerdown', outside, true)
    window.removeEventListener('resize', position)
    anchor.setAttribute('aria-expanded', 'false')
    onClose?.()
    if (focus) view.focus()
  }
  const outside = (event) => {
    if (
      !menu.contains(event.target) &&
      !anchor.contains(event.target) &&
      !event.target.closest?.('.editor-popup-submenu')
    )
      close(false)
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
  // An item that opens a panel beside the menu, on hover, click, Enter or the right arrow.
  let openSub = null
  const closeSub = () => {
    openSub?.panel.remove()
    openSub?.button.setAttribute('aria-expanded', 'false')
    openSub = null
  }
  const sideOf = (button, width) => {
    const box = menu.getBoundingClientRect()
    if (box.right + 4 + width <= innerWidth - 8) return 'right'
    if (box.left - width - 4 >= 8) return 'left'
    return null
  }
  const submenu = (icon, text, fill) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'editor-submenu-item'
    button.setAttribute('role', 'menuitem')
    button.setAttribute('aria-haspopup', 'menu')
    button.setAttribute('aria-expanded', 'false')
    button.innerHTML = `<span class="table-context-menu-icon">${icon}</span>`
    const caption = document.createElement('span')
    caption.className = 'menu-item-label'
    caption.textContent = text
    const chevron = document.createElement('span')
    chevron.className = 'editor-submenu-chevron'
    chevron.innerHTML =
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6l4 4-4 4" /></svg>'
    button.append(caption, chevron)
    const show = (focus) => {
      if (openSub?.button === button) {
        if (focus) openSub.panel.querySelector('button')?.focus({ preventScroll: true })
        return
      }
      closeSub()
      const panel = document.createElement('div')
      panel.className = 'table-context-menu editor-popup-menu editor-popup-submenu'
      panel.setAttribute('role', 'menu')
      panel.setAttribute('aria-label', text)
      fill(panel, { item, iconButton, grid, separator, close })
      panel.addEventListener('keydown', (event) => {
        const step = { ArrowDown: 1, ArrowUp: -1 }[event.key]
        if (step) {
          event.preventDefault()
          event.stopPropagation()
          const buttons = [...panel.querySelectorAll('button:not(:disabled)')]
          const index = buttons.indexOf(document.activeElement)
          buttons[(index + step + buttons.length) % buttons.length]?.focus({ preventScroll: true })
          return
        }
        if (event.key !== 'ArrowLeft' && event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        closeSub()
        button.focus({ preventScroll: true })
      })
      document.body.append(panel)
      const box = button.getBoundingClientRect()
      const width = panel.offsetWidth
      const height = panel.offsetHeight
      const side = sideOf(button, width)
      if (side) {
        panel.style.left = `${side === 'right' ? box.right + 4 : box.left - width - 4}px`
        panel.style.top = `${Math.max(8, Math.min(box.top - 6, innerHeight - height - 8))}px`
      } else {
        // No room beside the menu (narrow screens): the panel opens under its item.
        panel.style.left = `${Math.max(8, Math.min(box.left, innerWidth - width - 8))}px`
        panel.style.top = `${Math.max(8, Math.min(box.bottom + 2, innerHeight - height - 8))}px`
      }
      button.setAttribute('aria-expanded', 'true')
      openSub = { button, panel }
      if (focus) panel.querySelector('button')?.focus({ preventScroll: true })
    }
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => show(true))
    // Hover opens the panel only when it fits beside the menu; otherwise it would cover other items.
    button.addEventListener('mouseenter', () => {
      if (sideOf(button, 260)) show(false)
    })
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight') return
      event.preventDefault()
      event.stopPropagation()
      show(true)
    })
    return button
  }
  // Pointing at another item of the main menu closes the open panel.
  menu.addEventListener('mouseover', (event) => {
    const target = event.target.closest?.('button')
    if (openSub && target && target !== openSub.button) closeSub()
  })
  build(menu, { item, iconButton, grid, separator, close, submenu })
  menu.addEventListener('keydown', (event) => {
    const buttons = [...menu.querySelectorAll('button:not(:disabled), summary')].filter(
      (element) => element.getClientRects().length && !element.closest('.editor-popup-submenu'),
    )
    const index = buttons.indexOf(document.activeElement)
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key]
    if (step) {
      event.preventDefault()
      buttons[(index + step + buttons.length) % buttons.length]?.focus({ preventScroll: true })
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      event.stopPropagation()
      close(false)
      anchor.focus({ preventScroll: true })
    }
  })
  document.body.append(menu)
  function position() {
    // Below the button, else above, else beside it; a menu taller than the
    // window scrolls. It never covers the button that opened it.
    menu.style.maxHeight = ''
    const box = anchor.getBoundingClientRect()
    const { offsetWidth: width, offsetHeight: height } = menu
    const below = innerHeight - box.bottom - 14
    const above = box.top - 14
    let left = Math.max(8, Math.min(box.left, innerWidth - width - 8))
    let top
    if (height <= below) top = box.bottom + 6
    else if (height <= above) top = box.top - height - 6
    else if (box.right + 6 + width <= innerWidth - 8 || box.left - width - 6 >= 8) {
      left = box.right + 6 + width <= innerWidth - 8 ? box.right + 6 : box.left - width - 6
      top = Math.max(8, Math.min(box.top, innerHeight - height - 8))
    } else {
      const room = Math.max(below, above)
      top = below >= above ? box.bottom + 6 : Math.max(8, box.top - Math.min(height, room) - 6)
      menu.style.maxHeight = `${room}px`
    }
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
  }
  position()
  menu.addEventListener('toggle', position, true)
  window.addEventListener('resize', position)
  anchor.setAttribute('aria-expanded', 'true')
  document.addEventListener('pointerdown', outside, true)
  menu.querySelector('summary, button')?.focus({ preventScroll: true })
  return close
}
