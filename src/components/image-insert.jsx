import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Upload, X } from 'lucide-react'
import { t } from '../i18n.js'

export function ImageInsert({ position, busy, onFiles, onUrl, onClose }) {
  const host = useRef(null)
  const nativeUpload = useRef(null)
  nativeUpload.current = upload
  useEffect(() => {
    const panel = host.current
    const handle = (event) => nativeUpload.current(event.detail)
    panel.addEventListener('native-image-drop', handle)
    return () => panel.removeEventListener('native-image-drop', handle)
  }, [])
  const fileInput = useRef(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  async function upload(files) {
    if (!files.length || busy) return
    await onFiles(files)
    onClose()
  }
  return (
    <section
      ref={host}
      className="image-insert"
      role="dialog"
      aria-label={t('images.dialogTitle')}
      style={position}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="image-insert-heading">
        <strong>{t('images.dialogTitle')}</strong>
        <button type="button" aria-label={t('dialog.close')} onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          try {
            const parsed = new URL(url)
            if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
            onUrl(parsed.href)
            onClose()
          } catch {
            setError(t('images.urlInvalid'))
          }
        }}
      >
        <label>
          {t('images.url')}
          <input
            autoFocus
            type="url"
            value={url}
            placeholder="https://…"
            onChange={(event) => {
              setUrl(event.target.value)
              setError('')
            }}
            required
          />
        </label>
        <button type="submit" disabled={busy || !url.trim()}>
          <ImagePlus size={15} />
          {t('images.insertUrl')}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      <button
        type="button"
        className="image-upload-zone"
        disabled={busy}
        onClick={() => fileInput.current.click()}
        onDragOver={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          upload([...event.dataTransfer.files])
        }}
      >
        <Upload size={22} />
        <span>{busy ? t('images.importing') : t('images.uploadDrop')}</span>
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp"
        multiple
        hidden
        onChange={(event) => upload([...event.target.files])}
      />
    </section>
  )
}
