// Text sharing for mobile. Android exposes `SlothShare` (MainActivity.kt); a browser
// may offer the Web Share API. Without either, `canShare()` is false and the UI offers copy.
export function canShare(env = globalThis) {
  return (
    typeof env.SlothShare?.shareText === 'function' || typeof env.navigator?.share === 'function'
  )
}

export function canShareFile(env = globalThis) {
  return typeof env.SlothShare?.shareFile === 'function'
}

// Shares the note as a UTF-8 .md file. Only the Android bridge supports it.
export async function shareFile({ name, text }, env = globalThis) {
  if (!canShareFile(env)) return 'unavailable'
  if (!env.SlothShare.shareFile(name, text)) throw new Error('share-failed')
  return 'shared'
}

// Resolves 'shared' (system sheet opened or accepted), 'cancelled' (user closed the web sheet)
// or 'unavailable'. Rejects when the system sheet cannot be opened.
export async function shareText({ title, text }, env = globalThis) {
  if (typeof env.SlothShare?.shareText === 'function') {
    if (!env.SlothShare.shareText(title, text)) throw new Error('share-failed')
    return 'shared'
  }
  if (typeof env.navigator?.share === 'function') {
    try {
      await env.navigator.share({ title, text })
      return 'shared'
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled'
      throw error
    }
  }
  return 'unavailable'
}
