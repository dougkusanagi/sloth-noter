import { t } from './i18n.js'

const CODED = /^\[([a-z-]+)\]\s*/

/**
 * Native disk failures arrive as `[code] system message` (Tauri rejects with a
 * plain string). Known codes get a message in the interface language; anything
 * else keeps the original text.
 */
export function friendlyError(cause, fallback = 'Storage is unavailable') {
  const raw = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : ''
  if (!raw) return fallback
  const code = CODED.exec(raw)?.[1]
  if (!code) return raw
  const key = `disk.${code}`
  const message = t(key)
  return message === key ? raw.replace(CODED, '') : message
}
