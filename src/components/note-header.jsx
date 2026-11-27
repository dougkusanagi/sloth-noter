import { useEffect, useMemo, useRef, useState } from 'react'
import { EmojiPicker } from 'frimousse'
import { Ellipsis, ImagePlus, Search, Shuffle, SmilePlus } from 'lucide-react'
import { CoverPicker } from './cover-picker.jsx'
import { noteCover } from '../note-cover.js'
import { noteIcon } from '../note-icon.js'
import { importImage } from '../images.js'
import { friendlyError } from '../errors.js'
import { emojiLocale, randomEmoji, resolveEmojiData } from '../emoji-data.js'
import { COVER_GALLERY } from '../cover-gallery.js'
import { currentLanguage, t } from '../i18n.js'

/** Closes a popover on Escape or on a click outside it, and gives focus back to its button. */
function usePopover(open, onClose, panel, trigger) {
  useEffect(() => {
    if (!open) return undefined
    const away = (event) => {
      if (panel.current?.contains(event.target) || trigger.current?.contains(event.target)) return
      onClose(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open, onClose, panel, trigger])
  return (event) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    onClose(true)
  }
}

function NoteMenu({ actions, onClose }) {
  const menu = useRef(null)
  useEffect(() => {
    menu.current?.querySelector('button')?.focus()
  }, [])
  return (
    <div
      ref={menu}
      className="note-header-menu"
      role="menu"
      aria-label={t('noteHeader.menu')}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const items = [...menu.current.querySelectorAll('button')]
        const at = items.indexOf(document.activeElement)
        const step = event.key === 'ArrowDown' ? 1 : -1
        items[(at + step + items.length) % items.length]?.focus()
      }}
    >
      {actions.map((action, index) =>
        action === '-' ? (
          <hr key={`separator-${index}`} />
        ) : (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose(!action.opensPanel)
              action.run()
            }}
          >
            <action.icon size={15} aria-hidden="true" />
            {action.label}
          </button>
        ),
      )}
    </div>
  )
}

function CoverPanel({ images, invoke, selected, onApply }) {
  const [tab, setTab] = useState('gallery')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  async function choose(item) {
    if (busy) return
    const name = `capa-${item.id}.webp`
    // A gallery image already in the library is reused, not imported again.
    const existing = images.find((image) => image.name === name)
    if (existing) return onApply({ src: existing.src, name })
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/covers/${item.id}.webp`)
      if (!response.ok) throw new Error(t('cover.unavailable'))
      const file = new File([await response.blob()], name, { type: 'image/webp' })
      const src = await importImage(file, invoke)
      if (mounted.current) onApply({ src, name }, true)
    } catch (cause) {
      if (mounted.current) setError(t('images.importFailed', { error: friendlyError(cause) }))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  const all = COVER_GALLERY.flatMap((group) => group.items)
  return (
    <>
      <div className="note-popover-head">
        <div role="tablist" aria-label={t('cover.title')}>
          {['gallery', 'upload'].map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {t(id === 'gallery' ? 'cover.gallery' : 'cover.upload')}
            </button>
          ))}
        </div>
        <div className="note-popover-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => choose(all[Math.floor(Math.random() * all.length)])}
          >
            <Shuffle size={14} aria-hidden="true" />
            {t('noteHeader.random')}
          </button>
          {selected && (
            <button type="button" disabled={busy} onClick={() => onApply(null)}>
              {t('noteHeader.remove')}
            </button>
          )}
        </div>
      </div>
      {busy && (
        <p className="note-popover-status" role="status">
          {t('cover.importing')}
        </p>
      )}
      {error && (
        <p className="note-popover-status" role="alert">
          {error}
        </p>
      )}
      {tab === 'gallery' ? (
        <div className="cover-gallery" role="tabpanel">
          {COVER_GALLERY.map((group) => (
            <section key={group.id} aria-label={t(group.label)}>
              <h3>{t(group.label)}</h3>
              <div className="cover-gallery-grid">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={busy}
                    aria-label={t(item.label)}
                    title={t(item.label)}
                    onClick={() => choose(item)}
                  >
                    <img src={`/covers/${item.id}.webp`} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div role="tabpanel" className="cover-upload">
          <CoverPicker images={images} invoke={invoke} onApply={onApply} hideRemove />
        </div>
      )}
    </>
  )
}

function IconPanel({ icon, onApply }) {
  const language = currentLanguage()
  return (
    <>
      <div className="note-popover-head">
        <span className="note-popover-title">{t('noteHeader.emoji')}</span>
        <div className="note-popover-actions">
          <button type="button" onClick={() => randomEmoji(language).then(onApply)}>
            <Shuffle size={14} aria-hidden="true" />
            {t('noteHeader.random')}
          </button>
          {icon && (
            <button type="button" onClick={() => onApply(null)}>
              {t('noteHeader.remove')}
            </button>
          )}
        </div>
      </div>
      <EmojiPicker.Root
        className="emoji-picker"
        locale={emojiLocale(language)}
        columns={10}
        resolveEmojiData={resolveEmojiData}
        onEmojiSelect={({ emoji }) => onApply(emoji)}
      >
        <label className="emoji-picker-search">
          <Search size={15} aria-hidden="true" />
          <EmojiPicker.Search
            autoFocus
            aria-label={t('noteHeader.searchEmoji')}
            placeholder={t('noteHeader.searchEmoji')}
          />
        </label>
        <EmojiPicker.Viewport className="emoji-picker-viewport">
          <EmojiPicker.Loading className="emoji-picker-note">
            {t('noteHeader.loadingEmoji')}
          </EmojiPicker.Loading>
          <EmojiPicker.Empty className="emoji-picker-note">
            {t('noteHeader.noEmoji')}
          </EmojiPicker.Empty>
          <EmojiPicker.List
            className="emoji-picker-list"
            components={{
              CategoryHeader: ({ category, ...props }) => (
                <div className="emoji-picker-category" {...props}>
                  {category.label}
                </div>
              ),
              Emoji: ({ emoji, ...props }) => (
                <button className="emoji-picker-emoji" {...props}>
                  {emoji.emoji}
                </button>
              ),
            }}
          />
        </EmojiPicker.Viewport>
      </EmojiPicker.Root>
    </>
  )
}

/**
 * The top of a note in Padrão: the note menu (cover, icon, task note…) and, on hover, the
 * "Adicionar ícone" and "Adicionar capa" buttons. Leitura keeps the same space, without controls.
 */
export function NoteHeader({
  body,
  readOnly,
  images,
  invoke,
  actions,
  panel,
  onPanel,
  onCover,
  onIcon,
}) {
  const icon = useMemo(() => noteIcon(body), [body])
  const cover = useMemo(() => noteCover(body)?.url ?? null, [body])
  const popover = useRef(null)
  const triggers = { menu: useRef(null), icon: useRef(null), cover: useRef(null) }
  const anchor = useRef(null)
  const close = (restore) => {
    const trigger = triggers[panel]?.current ?? triggers.menu.current
    onPanel(null)
    if (restore) requestAnimationFrame(() => trigger?.focus())
  }
  const escape = usePopover(Boolean(panel), close, popover, anchor)
  if (readOnly) return <div className="note-header" aria-hidden="true" />
  const toggle = (name) => onPanel(panel === name ? null : name)
  return (
    <div className="note-header" data-open={panel ? '' : undefined}>
      <div className="note-header-bar" ref={anchor}>
        <button
          ref={triggers.menu}
          type="button"
          className="note-header-button note-header-more"
          aria-label={t('noteHeader.menu')}
          title={t('noteHeader.menu')}
          aria-haspopup="menu"
          aria-expanded={panel === 'menu'}
          onClick={() => toggle('menu')}
        >
          <Ellipsis size={16} aria-hidden="true" />
        </button>
        {!icon && (
          <button
            ref={triggers.icon}
            type="button"
            className="note-header-button note-header-hint"
            aria-expanded={panel === 'icon'}
            onClick={() => toggle('icon')}
          >
            <SmilePlus size={15} aria-hidden="true" />
            {t('noteHeader.addIcon')}
          </button>
        )}
        {!cover && (
          <button
            ref={triggers.cover}
            type="button"
            className="note-header-button note-header-hint"
            aria-expanded={panel === 'cover'}
            onClick={() => toggle('cover')}
          >
            <ImagePlus size={15} aria-hidden="true" />
            {t('noteHeader.addCover')}
          </button>
        )}
      </div>
      {panel && (
        <div
          ref={popover}
          className={panel === 'menu' ? 'note-header-popover is-menu' : 'note-header-popover'}
          role={panel === 'menu' ? undefined : 'dialog'}
          aria-label={
            panel === 'icon'
              ? t('noteHeader.icon')
              : panel === 'cover'
                ? t('cover.title')
                : undefined
          }
          onKeyDown={escape}
        >
          {panel === 'menu' && <NoteMenu actions={actions} onClose={close} />}
          {panel === 'icon' && (
            <IconPanel
              icon={icon}
              onApply={(emoji) => {
                onIcon(emoji)
                close(false)
              }}
            />
          )}
          {panel === 'cover' && (
            <CoverPanel
              images={images}
              invoke={invoke}
              selected={cover}
              onApply={(image, imported) => {
                onCover(image, imported)
                close(false)
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
