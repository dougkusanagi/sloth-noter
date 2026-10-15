import test from 'node:test'
import assert from 'node:assert/strict'
import { LANGUAGES } from './i18n.js'
import { markdownTree, walk, wikiReferences, imageReferences } from './markdown-model.js'
import { inlineSyntax } from './live-markdown.js'
import { headingFileName } from './notes.js'
import { codeTokens } from './syntax-highlight.js'
import { newDocument, validateDocument } from './storage.js'
import { WELCOME_BODIES, WELCOME_IMAGE, WELCOME_NAME, welcomeBody, welcomeNote } from './welcome.js'

function inventory(body) {
  const tree = markdownTree(body)
  const found = {
    headings: new Set(),
    types: new Set(),
    fences: [],
    alignments: [],
    ordered: false,
    bullet: false,
    tasks: { checked: 0, open: 0 },
    quoteDepth: 0,
  }
  walk(tree, (node) => {
    found.types.add(node.type)
    if (node.type === 'heading') found.headings.add(node.depth)
    if (node.type === 'code') found.fences.push(node.lang)
    if (node.type === 'table') found.alignments = node.align
    if (node.type === 'list') found[node.ordered ? 'ordered' : 'bullet'] = true
    if (node.type === 'listItem' && node.checked !== null)
      found.tasks[node.checked ? 'checked' : 'open']++
  })
  const depth = (node, level = 0) =>
    node.type === 'blockquote'
      ? Math.max(level + 1, ...node.children.map((child) => depth(child, level + 1)))
      : Math.max(level, ...(node.children ?? []).map((child) => depth(child, level)))
  found.quoteDepth = depth(tree)
  return found
}

for (const language of Object.keys(LANGUAGES)) {
  test(`the help page in ${language} is titled Welcome and names its own file`, () => {
    const body = welcomeBody(language)
    assert.equal(body.split('\n')[0], '# Welcome')
    assert.equal(headingFileName(body), WELCOME_NAME)
    assert.deepEqual(welcomeNote(language), { name: WELCOME_NAME, body })
  })

  test(`the help page in ${language} demonstrates every supported Markdown format`, () => {
    const body = welcomeBody(language)
    const found = inventory(body)
    assert.deepEqual([...found.headings].sort(), [1, 2, 3, 4, 5, 6])
    for (const type of [
      'strong',
      'emphasis',
      'delete',
      'inlineCode',
      'link',
      'linkReference',
      'definition',
      'image',
      'blockquote',
      'thematicBreak',
      'table',
      'footnoteReference',
      'footnoteDefinition',
      'break',
    ])
      assert.ok(found.types.has(type), `${language}: missing ${type}`)
    assert.ok(found.ordered && found.bullet)
    assert.ok(found.tasks.checked > 0 && found.tasks.open > 0)
    assert.ok(found.quoteDepth >= 2, 'nested quote')
    assert.deepEqual(found.alignments, ['left', 'center', 'right'])
    assert.ok(wikiReferences(body).length >= 2, 'wiki links')
    assert.ok(body.includes('[[Welcome|'), 'wiki link with label')
    assert.ok(/(^|\s)#[\p{L}\p{N}_/-]+/u.test(body.replace(/^#+ .*$/gm, '')), 'tags')
    assert.ok(body.includes('\\*'), 'escaped characters')
    assert.ok(/ https:\/\/[^\s)]+(\s|$)/.test(body), 'bare URL')
    assert.ok(body.includes('<https://'), 'angle-bracket URL')
  })

  test(`the help page in ${language} shows its image and highlights every code block`, () => {
    const body = welcomeBody(language)
    assert.equal(imageReferences(body)[0].src, WELCOME_IMAGE)
    assert.match(WELCOME_IMAGE, /^https:\/\//)
    const { fences } = inventory(body)
    for (const lang of ['js', 'python', 'bash', 'json', 'html', 'css', 'sql'])
      assert.ok(fences.includes(lang), `${language}: ${lang} block`)
    for (const lang of fences.filter((lang) => lang !== 'md')) {
      const tokens = codeTokens(body.split('```' + lang + '\n')[1].split('\n```')[0], lang)
      assert.ok(
        tokens.some((token) => typeof token !== 'string'),
        `${language}: ${lang} is highlighted`,
      )
    }
  })

  test(`the help page in ${language} has inline token ranges that stay inside their syntax`, () => {
    for (const line of welcomeBody(language).split('\n'))
      for (const token of inlineSyntax(line))
        assert.ok(token.start <= token.contentStart && token.contentEnd <= token.end)
  })
}

test('both languages have the same structure', () => {
  const shape = (language) => {
    const found = inventory(welcomeBody(language))
    return {
      headings: [...found.headings].sort(),
      fences: found.fences,
      lines: welcomeBody(language).split('\n').length,
      types: [...found.types].sort(),
    }
  }
  assert.deepEqual(shape('en'), shape('pt-BR'))
})

test('an unknown language falls back to Portuguese and a new document opens the help page', () => {
  assert.equal(welcomeBody('fr'), WELCOME_BODIES['pt-BR'])
  assert.equal(welcomeBody(), WELCOME_BODIES['pt-BR'])
  const document = validateDocument(newDocument())
  assert.equal(document.notes[0].name, WELCOME_NAME)
  assert.equal(document.notes[0].body, WELCOME_BODIES['pt-BR'])
  assert.equal(document.activeId, 'welcome')
})

test('the help page explains that it can be deleted and recreated', () => {
  assert.match(welcomeBody('pt-BR'), /excluir esta nota/)
  assert.match(welcomeBody('pt-BR'), /Recriar página de ajuda/)
  assert.match(welcomeBody('en'), /delete this note/)
  assert.match(welcomeBody('en'), /Recreate help page/)
})
