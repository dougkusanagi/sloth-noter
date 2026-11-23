import { useEffect, useMemo, useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { noteCover } from '../note-cover.js'
import { resolveImage } from '../images.js'
import { t } from '../i18n.js'

/** The note's cover, edge to edge above the properties and the title (Padrão and Leitura). */
export function NoteCoverBanner({ body, onChange }) {
  const cover = useMemo(() => noteCover(body), [body])
  const src = cover?.url ?? null
  const [resolved, setResolved] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    setResolved(null)
    setFailed(false)
    if (!src) return
    resolveImage(src)
      .then((url) => {
        if (cancelled) return
        setResolved(url)
        setFailed(!url)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [src])
  if (!src) return null
  return (
    <div className="note-cover-banner">
      {resolved && !failed ? (
        <img src={resolved} alt={cover.alt ?? ''} onError={() => setFailed(true)} />
      ) : (
        failed && <span className="image-missing">{t('cover.unavailable')}</span>
      )}
      {onChange && (
        <button type="button" className="note-cover-change" onClick={onChange}>
          <ImageIcon size={14} aria-hidden="true" />
          {t('cover.change')}
        </button>
      )}
    </div>
  )
}
