import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, QrCode, X } from 'lucide-react'
import {
  createEphemeralPairingKeyPair,
  decryptPairingFromApprover,
  encodePairingPayload,
  encodePairingRequest,
} from '../sync/qr-pairing.js'
import { t } from '../i18n.js'

/**
 * Bidirectional sync account QR pairing modal (ADR 0053):
 * - `mode="direct"`: logged-in device shows a 2-minute QR for another device to scan & log in.
 * - `mode="reverse"`: logged-out device (e.g. desktop) shows a WhatsApp-style QR for the
 *   logged-in phone to scan, approve with ECDH encryption, and log the desktop in automatically.
 */
export function SyncPairingModal({ mode, server, sync, onClose }) {
  const [svg, setSvg] = useState('')
  const [payload, setPayload] = useState('')
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    let pollTimer = null

    async function start() {
      setError('')
      setStatus('loading')
      if (mode === 'direct') {
        const creds = sync.exportPairingCredentials?.()
        const encoded = creds ? encodePairingPayload(creds) : { ok: false }
        if (!encoded.ok) {
          if (alive) {
            setError(t('sync.qr.unavailable'))
            setStatus('error')
          }
          return
        }
        const markup = await QRCode.toString(encoded.payload, {
          type: 'svg',
          margin: 2,
          width: 240,
          errorCorrectionLevel: 'L',
        })
        if (!alive) return
        setPayload(encoded.payload)
        setSvg(markup)
        setStatus('ready')
        return
      }

      // Reverse (WhatsApp-style): create ephemeral ECDH key + server pairing session.
      try {
        const { privateKey, pub } = await createEphemeralPairingKeyPair()
        const base = String(server ?? '').replace(/\/$/, '')
        const res = await fetch(`${base}/v1/pairing`, { method: 'POST' })
        if (!res.ok) throw new Error('server_unavailable')
        const { id } = await res.json()
        const qrText = encodePairingRequest({ server: base, id, pub })
        const markup = await QRCode.toString(qrText, {
          type: 'svg',
          margin: 2,
          width: 240,
          errorCorrectionLevel: 'L',
        })
        if (!alive) return
        setPayload(qrText)
        setSvg(markup)
        setStatus('ready')

        const poll = async () => {
          if (!alive) return
          try {
            const check = await fetch(`${base}/v1/pairing/${encodeURIComponent(id)}`)
            if (check.status === 404) {
              if (alive) {
                setError(t('sync.qr.expired'))
                setStatus('error')
              }
              return
            }
            if (check.ok) {
              const data = await check.json()
              if (data.status === 'approved' && data.encrypted) {
                const creds = await decryptPairingFromApprover(privateKey, data.encrypted)
                await sync.connectFromPairing(creds)
                if (alive) onClose()
                return
              }
            }
          } catch {
            // Keep polling until expiry.
          }
          if (alive) pollTimer = setTimeout(poll, 2000)
        }
        pollTimer = setTimeout(poll, 2000)
      } catch {
        if (alive) {
          setError(t('sync.qr.reverseUnavailable'))
          setStatus('error')
        }
      }
    }

    void start()
    return () => {
      alive = false
      if (pollTimer) clearTimeout(pollTimer)
    }
  }, [mode, server, sync, onClose])

  async function copyCode() {
    if (!payload) return
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ignore clipboard failures.
    }
  }

  return (
    <div
      className="qr-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t(mode === 'direct' ? 'sync.qr.connectDeviceTitle' : 'sync.qr.reverseTitle')}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="qr-dialog">
        <div className="qr-dialog-header">
          <div className="qr-dialog-title">
            <QrCode size={18} aria-hidden="true" />
            <h3>{t(mode === 'direct' ? 'sync.qr.connectDeviceTitle' : 'sync.qr.reverseTitle')}</h3>
          </div>
          <button
            type="button"
            className="qr-dialog-close"
            aria-label={t('dialog.close')}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="qr-dialog-hint">
          {t(mode === 'direct' ? 'sync.qr.connectDeviceHint' : 'sync.qr.reverseHint')}
        </p>
        {mode === 'direct' && (
          <p className="qr-dialog-warning" role="status">
            {t('sync.qr.privacyWarning')}
          </p>
        )}
        {status === 'error' ? (
          <p className="qr-dialog-warning" role="alert">
            {error}
          </p>
        ) : svg ? (
          <div
            className="qr-dialog-code"
            aria-label={t('sync.qr.connectDeviceTitle')}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p className="qr-dialog-hint">{t('sync.checking')}</p>
        )}
        <div className="qr-dialog-actions">
          {payload && (
            <button type="button" className="button" onClick={copyCode}>
              <Copy size={15} aria-hidden="true" />
              {copied ? t('qr.copied') : t('qr.copyCode')}
            </button>
          )}
          <button type="button" className="button" onClick={onClose}>
            {t('dialog.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
