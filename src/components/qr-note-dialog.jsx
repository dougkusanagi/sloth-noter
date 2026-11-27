import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, QrCode, X } from 'lucide-react'
import { encodeNoteForQr } from '../qr-bridge.js'
import { displayName } from '../note-title.js'
import { t } from '../i18n.js'

/**
 * Offline QR Code dialog for transferring a short note to another device without account/network (C1).
 */
export function QrNoteDialog({ note, onClose }) {
  const encoded = useMemo(() => encodeNoteForQr(note?.body ?? ''), [note?.body])
  const [svg, setSvg] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    if (!encoded.ok) {
      setSvg('')
      return
    }
    QRCode.toString(encoded.payload, {
      type: 'svg',
      margin: 2,
      width: 240,
      errorCorrectionLevel: 'L',
    })
      .then((markup) => {
        if (active) setSvg(markup)
      })
      .catch(() => {
        if (active) setSvg('')
      })
    return () => {
      active = false
    }
  }, [encoded])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function copyPayload() {
    if (!encoded.ok) return
    try {
      await navigator.clipboard.writeText(encoded.payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ignore clipboard failures in restricted contexts.
    }
  }

  return (
    <div
      className="qr-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t('qr.title')}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="qr-dialog">
        <div className="qr-dialog-header">
          <div className="qr-dialog-title">
            <QrCode size={18} aria-hidden="true" />
            <h3>{t('qr.title')}</h3>
          </div>
          <button type="button" className="qr-dialog-close" aria-label={t('dialog.close')} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="qr-dialog-note-name">{displayName(note?.name ?? '')}</p>
        {encoded.ok ? (
          <>
            <p className="qr-dialog-hint">{t('qr.hint')}</p>
            {encoded.hasImages && (
              <p className="qr-dialog-warning" role="status">
                {t('qr.hasImages')}
              </p>
            )}
            <div
              className="qr-dialog-code"
              aria-label={t('qr.title')}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <div className="qr-dialog-actions">
              <button type="button" className="button" onClick={copyPayload}>
                <Copy size={15} aria-hidden="true" />
                {copied ? t('qr.copied') : t('qr.copyCode')}
              </button>
              <button type="button" className="button" onClick={onClose}>
                {t('dialog.close')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="qr-dialog-warning" role="alert">
              {t(encoded.error === 'too_large' ? 'qr.tooLarge' : 'qr.empty')}
            </p>
            <div className="qr-dialog-actions">
              <button type="button" className="button" onClick={onClose}>
                {t('dialog.close')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
