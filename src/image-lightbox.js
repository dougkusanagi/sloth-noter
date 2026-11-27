// Full-screen lightbox for inline image thumbnails and note images.
import { t } from './i18n.js'

let activeOverlay = null

export function closeImageLightbox() {
  if (!activeOverlay) return
  const { overlay, onKeyDown, previousFocus } = activeOverlay
  window.removeEventListener('keydown', onKeyDown, true)
  overlay.remove()
  activeOverlay = null
  if (previousFocus && typeof previousFocus.focus === 'function') {
    previousFocus.focus({ preventScroll: true })
  }
}

export function openImageLightbox({ src, alt = '', title = '' }) {
  if (!src) return
  closeImageLightbox()
  const previousFocus = document.activeElement

  const overlay = document.createElement('div')
  overlay.className = 'image-lightbox'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', title || alt || t('images.zoom'))

  const closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'image-lightbox-close'
  closeBtn.setAttribute('aria-label', t('dialog.close'))
  closeBtn.textContent = '×'
  closeBtn.addEventListener('click', closeImageLightbox)

  const frame = document.createElement('div')
  frame.className = 'image-lightbox-frame'

  const img = document.createElement('img')
  img.className = 'image-lightbox-img'
  img.src = src
  img.alt = alt

  frame.append(img)

  const label = title || alt
  if (label) {
    const caption = document.createElement('div')
    caption.className = 'image-lightbox-caption'
    caption.textContent = label
    frame.append(caption)
  }

  overlay.append(closeBtn, frame)
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeImageLightbox()
  })

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeImageLightbox()
    }
  }
  window.addEventListener('keydown', onKeyDown, true)
  document.body.append(overlay)
  activeOverlay = { overlay, onKeyDown, previousFocus }
  closeBtn.focus({ preventScroll: true })
}
