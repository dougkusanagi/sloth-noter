import { useEffect, useRef, useState } from 'react'
import { Pin, X } from 'lucide-react'
import { moveTab, togglePinnedTab } from '../tabs.js'
import { t } from '../i18n.js'
import { displayName } from '../note-title.js'
import { Shortcut } from './main-menu.jsx'

/**
 * Tab strip behaviour: drag to reorder, context menu, keeping the active tab in view.
 * Returns the two pieces of markup so the strip can live in the header while the
 * context menu sits outside it.
 */
export function useTabs({ data, current, commit, tabsVisible, open, rename, close, trash }) {
  const [tabMenu, setTabMenu] = useState(null)
  const [draggingTab, setDraggingTab] = useState(null)
  const [tabDropIndex, setTabDropIndex] = useState(null)
  const tabDrag = useRef(null)
  const suppressTabClick = useRef(false)
  const tabListRef = useRef(null)
  const activeTabRef = useRef(null)
  const tabMenuFirst = useRef(null)
  function startTabDrag(event, id) {
    if (event.button !== 0) return
    suppressTabClick.current = false
    tabDrag.current = { id, x: event.clientX, index: null }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function moveTabDrag(event) {
    const drag = tabDrag.current
    if (!drag || (drag.index === null && Math.abs(event.clientX - drag.x) < 6)) return
    suppressTabClick.current = true
    setDraggingTab(drag.id)
    setTabMenu(null)
    const list = tabListRef.current
    const box = list.getBoundingClientRect()
    if (event.clientX < box.left + 24) list.scrollLeft -= 16
    if (event.clientX > box.right - 24) list.scrollLeft += 16
    const tabs = [...list.querySelectorAll('[data-tab-id]')].filter(
      (tab) => tab.dataset.tabId !== drag.id,
    )
    let index = tabs.findIndex((tab) => {
      const rect = tab.getBoundingClientRect()
      return event.clientX < rect.left + rect.width / 2
    })
    if (index < 0) index = tabs.length
    const next = moveTab(current.current, drag.id, index)
    drag.index = next.openIds.indexOf(drag.id)
    setTabDropIndex(drag.index)
  }
  function endTabDrag(event, cancelled = false) {
    const drag = tabDrag.current
    tabDrag.current = null
    setDraggingTab(null)
    setTabDropIndex(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    if (!cancelled && drag?.index !== null && drag?.index !== undefined) {
      const next = moveTab(current.current, drag.id, drag.index)
      if (next !== current.current) commit(next)
    }
  }
  function openTabMenu(event, id) {
    event.preventDefault()
    event.stopPropagation()
    setTabMenu({
      id,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 230)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 320)),
    })
  }
  function runTabMenu(action) {
    const menu = tabMenu
    if (!menu || !current.current.notes.some((note) => note.id === menu.id)) return
    setTabMenu(null)
    if (action === 'open') open(menu.id)
    if (action === 'rename') rename(menu.id)
    if (action === 'pin') commit(togglePinnedTab(current.current, menu.id))
    if (action === 'left' || action === 'right') {
      commit(
        moveTab(
          current.current,
          menu.id,
          current.current.openIds.indexOf(menu.id) + (action === 'left' ? -1 : 1),
        ),
      )
    }
    if (action === 'close') close(menu.id)
    if (action === 'pin' || action === 'left' || action === 'right') {
      requestAnimationFrame(() => {
        ;[...(tabListRef.current?.querySelectorAll('[data-tab-id]') ?? [])]
          .find((tab) => tab.dataset.tabId === menu.id)
          ?.querySelector('.tab')
          ?.focus()
      })
    }
    if (action === 'trash') trash(menu.id)
  }
  useEffect(() => {
    const list = tabListRef.current,
      tab = activeTabRef.current
    if (!list || !tab) return
    const showActiveTab = () => {
      const listBox = list.getBoundingClientRect(),
        tabBox = tab.getBoundingClientRect()
      if (tabBox.left < listBox.left) list.scrollLeft += tabBox.left - listBox.left
      else if (tabBox.right > listBox.right) list.scrollLeft += tabBox.right - listBox.right
    }
    showActiveTab()
    const observer = new ResizeObserver(showActiveTab)
    observer.observe(list)
    window.addEventListener('resize', showActiveTab)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', showActiveTab)
    }
  }, [data.activeId, data.openIds, tabsVisible])
  useEffect(() => {
    if (!tabMenu) return
    const onPointer = (event) => {
      if (!event.target.closest('.tab-context-menu')) setTabMenu(null)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setTabMenu(null)
      }
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    const frame = requestAnimationFrame(() => tabMenuFirst.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [tabMenu])

  const tabStrip = tabsVisible && data.openIds.length > 0 && (
    <nav className="tabs" aria-label={t('tabs.label')}>
      <div className="tab-list" ref={tabListRef}>
        {data.openIds.map((id, index) => {
          const pinned = data.pinnedIds?.includes(id)
          const note = data.notes.find((item) => item.id === id)
          return (
            note && (
              <div
                key={id}
                ref={id === data.activeId ? activeTabRef : null}
                data-tab-id={id}
                className={[
                  'tab-wrap',
                  id === data.activeId && 'active',
                  pinned && 'pinned',
                  draggingTab === id && 'dragging',
                  tabDropIndex === index &&
                    draggingTab !== id &&
                    (index < data.openIds.indexOf(draggingTab) ? 'drop-before' : 'drop-after'),
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <button
                  title={pinned ? `${note.name} · ${t('tabs.pinned')}` : note.name}
                  className={id === data.activeId ? 'tab active' : 'tab'}
                  aria-haspopup="menu"
                  aria-expanded={tabMenu?.id === id}
                  onPointerDown={(event) => startTabDrag(event, id)}
                  onPointerMove={moveTabDrag}
                  onPointerUp={endTabDrag}
                  onPointerCancel={(event) => endTabDrag(event, true)}
                  onLostPointerCapture={(event) => {
                    if (tabDrag.current) endTabDrag(event, true)
                  }}
                  onClick={() => {
                    if (suppressTabClick.current) {
                      suppressTabClick.current = false
                      return
                    }
                    open(id)
                  }}
                  onAuxClick={(event) => {
                    if (event.button === 1) {
                      event.preventDefault()
                      close(id)
                    }
                  }}
                  onContextMenu={(event) => openTabMenu(event, id)}
                  onKeyDown={(event) => {
                    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                      const rect = event.currentTarget.getBoundingClientRect()
                      event.preventDefault()
                      setTabMenu({
                        id,
                        x: Math.max(8, Math.min(rect.left, window.innerWidth - 230)),
                        y: rect.bottom,
                      })
                    }
                  }}
                  onMouseDown={(event) => {
                    if (event.button === 1) event.preventDefault()
                  }}
                >
                  {pinned && <Pin size={12} className="tab-pin-icon" aria-hidden="true" />}
                  <span>{displayName(note.name, true)}</span>
                </button>
                {!pinned && (
                  <button
                    className="tab-close"
                    aria-label={`${t('tabs.close')}: ${note.name}`}
                    title={t('tabs.close')}
                    onClick={() => close(id)}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )
          )
        })}
      </div>
    </nav>
  )

  const tabContextMenu = tabMenu && (
    <div
      className="tab-context-menu"
      role="menu"
      aria-label={t('tabs.menu')}
      style={{ left: tabMenu.x, top: tabMenu.y }}
      onKeyDown={(event) => {
        const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
        const index = buttons.indexOf(document.activeElement)
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          buttons[
            (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length
          ]?.focus()
        }
        if (event.key === 'Home') {
          event.preventDefault()
          buttons[0]?.focus()
        }
        if (event.key === 'End') {
          event.preventDefault()
          buttons.at(-1)?.focus()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setTabMenu(null)
        }
      }}
    >
      <button ref={tabMenuFirst} type="button" role="menuitem" onClick={() => runTabMenu('open')}>
        <span>{t('tabs.open')}</span>
      </button>
      <button type="button" role="menuitem" onClick={() => runTabMenu('rename')}>
        <span>{t('tabs.rename')}</span>
      </button>
      <button type="button" role="menuitem" onClick={() => runTabMenu('pin')}>
        <span>{t(data.pinnedIds?.includes(tabMenu.id) ? 'tabs.unpin' : 'tabs.pin')}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={moveTab(data, tabMenu.id, data.openIds.indexOf(tabMenu.id) - 1) === data}
        onClick={() => runTabMenu('left')}
      >
        <span>{t('tabs.moveLeft')}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={moveTab(data, tabMenu.id, data.openIds.indexOf(tabMenu.id) + 1) === data}
        onClick={() => runTabMenu('right')}
      >
        <span>{t('tabs.moveRight')}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={data.pinnedIds?.includes(tabMenu.id)}
        onClick={() => runTabMenu('close')}
      >
        <span>{t('tabs.close')}</span>
        <Shortcut keys="W" />
      </button>
      <div className="table-context-menu-separator" />
      <button type="button" role="menuitem" onClick={() => runTabMenu('trash')}>
        <span>{t('tabs.trash')}</span>
      </button>
    </div>
  )

  return { tabStrip, tabContextMenu, openTabMenu }
}
