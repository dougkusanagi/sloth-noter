import test from 'node:test'
import assert from 'node:assert/strict'
import { textStatistics } from './text-statistics.js'

test('counts selected Unicode text, whitespace and mixed line endings', () => {
  assert.deepEqual(textStatistics('Olá 😀\r\nmais\ttexto'), {
    characters: 17,
    charactersNoSpaces: 13,
    words: 4,
    lines: 2,
  })
  assert.deepEqual(textStatistics(''), { characters: 0, charactersNoSpaces: 0, words: 0, lines: 0 })
  assert.deepEqual(textStatistics(' \n'), {
    characters: 2,
    charactersNoSpaces: 0,
    words: 0,
    lines: 2,
  })
})
