export const DEFAULT_IMAGE_COMPRESSION = 'balanced'

export const IMAGE_COMPRESSION_PRESETS = {
  original: { id: 'original', maxDimension: null, quality: 1 },
  balanced: { id: 'balanced', maxDimension: 1920, quality: 0.82 },
  small: { id: 'small', maxDimension: 1280, quality: 0.68 },
}

const SKIP_MIMES = new Set(['image/gif', 'image/svg+xml'])

export function getCompressionPreset(id) {
  return IMAGE_COMPRESSION_PRESETS[id] ?? IMAGE_COMPRESSION_PRESETS[DEFAULT_IMAGE_COMPRESSION]
}

export function shouldCompressImage(mimeType, presetId = DEFAULT_IMAGE_COMPRESSION) {
  const preset = getCompressionPreset(presetId)
  if (preset.id === 'original') return false
  const mime = String(mimeType ?? '').toLowerCase()
  if (!mime.startsWith('image/') || SKIP_MIMES.has(mime)) return false
  return true
}

/**
 * Computes proportional target dimensions without upscaling smaller images.
 */
export function targetImageDimensions(width, height, maxDimension) {
  if (!maxDimension || width <= 0 || height <= 0) return { width, height }
  const longest = Math.max(width, height)
  if (longest <= maxDimension) return { width, height }
  const ratio = maxDimension / longest
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

/**
 * Compresses a browser Blob to WebP (stripping EXIF and preserving alpha) when smaller than
 * the original. Falls back cleanly to the original blob if Canvas/WebP is unavailable.
 */
export async function compressImageBlob(blob, presetId = DEFAULT_IMAGE_COMPRESSION) {
  if (!blob || !shouldCompressImage(blob.type, presetId)) {
    return { blob, compressed: false, savedBytes: 0 }
  }
  const preset = getCompressionPreset(presetId)
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    return { blob, compressed: false, savedBytes: 0 }
  }
  let bitmap = null
  try {
    bitmap = await createImageBitmap(blob)
    const { width, height } = targetImageDimensions(bitmap.width, bitmap.height, preset.maxDimension)
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return { blob, compressed: false, savedBytes: 0 }
    ctx.drawImage(bitmap, 0, 0, width, height)
    const webp = await canvas.convertToBlob({ type: 'image/webp', quality: preset.quality })
    if (!webp || webp.size >= blob.size) {
      return { blob, compressed: false, savedBytes: 0 }
    }
    return {
      blob: webp,
      compressed: true,
      savedBytes: blob.size - webp.size,
      width,
      height,
    }
  } catch {
    return { blob, compressed: false, savedBytes: 0 }
  } finally {
    bitmap?.close?.()
  }
}

/**
 * Estimates total bytes before/after for a list of `{ mimeType, sizeBytes }` entries.
 */
export function estimateCompressionPreview(entries, presetId = DEFAULT_IMAGE_COMPRESSION) {
  const preset = getCompressionPreset(presetId)
  const factor = preset.id === 'small' ? 0.35 : preset.id === 'balanced' ? 0.55 : 1
  let eligibleCount = 0
  let currentBytes = 0
  let estimatedBytes = 0
  for (const entry of entries ?? []) {
    const size = Math.max(0, Number(entry?.sizeBytes) || 0)
    currentBytes += size
    if (shouldCompressImage(entry?.mimeType, preset.id)) {
      eligibleCount += 1
      estimatedBytes += Math.round(size * factor)
    } else {
      estimatedBytes += size
    }
  }
  return {
    eligibleCount,
    currentBytes,
    estimatedBytes,
    estimatedSavedBytes: Math.max(0, currentBytes - estimatedBytes),
  }
}
