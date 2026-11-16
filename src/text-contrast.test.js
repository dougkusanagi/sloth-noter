import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

function block(selector) {
  const start = css.indexOf(`${selector} {`)
  assert.ok(start >= 0, `bloco ${selector} não encontrado`)
  return css.slice(start, css.indexOf('\n}', start))
}

function tokens(selector, inherited = {}) {
  const found = { ...inherited }
  for (const [, name, value] of block(selector).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    found[name] = value.trim()
  }
  return found
}

function hex(value, vars) {
  const ref = /^var\(--([\w-]+)\)$/.exec(value)
  if (ref) return hex(vars[ref[1]], vars)
  assert.match(value, /^#[0-9a-f]{6}$/i, `valor inesperado: ${value}`)
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a, b, vars) {
  const [hi, lo] = [luminance(hex(a, vars)), luminance(hex(b, vars))].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const light = tokens(':root')
const dark = tokens(":root[data-theme='dark']", light)

for (const [name, vars] of [
  ['claro', light],
  ['escuro', dark],
]) {
  test(`contraste do texto no tema ${name}`, () => {
    for (const token of ['text-body', 'text-heading']) {
      assert.ok(ratio(vars[token], vars.bg, vars) >= 7, `${token} abaixo de 7:1`)
    }
    assert.ok(ratio(vars['text-secondary'], vars.bg, vars) >= 4.5, 'text-secondary abaixo de 4,5:1')
    assert.ok(
      ratio(vars['text-heading'], vars.bg, vars) > ratio(vars['text-body'], vars.bg, vars),
      'títulos devem ter mais contraste que o corpo',
    )
  })
}
