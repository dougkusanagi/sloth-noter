import { openUrl } from '@tauri-apps/plugin-opener'
import { tauriBridge } from './persistence-desktop.js'

export function openExternalLink(href, target = window, nativeOpen = openUrl) {
  if (!/^(https?:\/\/|mailto:|tel:)/i.test(href)) return Promise.resolve(false)
  if (tauriBridge(target)) return nativeOpen(href)
  target.open(href, '_blank', 'noopener,noreferrer')
  return Promise.resolve(true)
}
