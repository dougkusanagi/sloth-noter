import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_IMAGE_COMPRESSION,
  estimateCompressionPreview,
  shouldCompressImage,
  targetImageDimensions,
} from './image-compression.js'

test('C6: respects WebP compression presets, preserves GIF/SVG, and never upscales', () => {
  assert.equal(DEFAULT_IMAGE_COMPRESSION, 'balanced')
  assert.equal(shouldCompressImage('image/jpeg', 'balanced'), true)
  assert.equal(shouldCompressImage('image/png', 'small'), true)
  assert.equal(shouldCompressImage('image/gif', 'balanced'), false)
  assert.equal(shouldCompressImage('image/svg+xml', 'small'), false)
  assert.equal(shouldCompressImage('image/jpeg', 'original'), false)

  assert.deepEqual(targetImageDimensions(4000, 3000, 1920), { width: 1920, height: 1440 })
  assert.deepEqual(targetImageDimensions(800, 600, 1920), { width: 800, height: 600 })

  const preview = estimateCompressionPreview(
    [
      { mimeType: 'image/jpeg', sizeBytes: 1_000_000 },
      { mimeType: 'image/gif', sizeBytes: 500_000 },
    ],
    'balanced',
  )
  assert.equal(preview.eligibleCount, 1)
  assert.equal(preview.currentBytes, 1_500_000)
  assert.equal(preview.estimatedSavedBytes, 450_000)
})
