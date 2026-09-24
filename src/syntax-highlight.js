import Prism from 'prismjs'
import 'prismjs/components/prism-python.js'
import 'prismjs/components/prism-bash.js'
import 'prismjs/components/prism-json.js'
import 'prismjs/components/prism-typescript.js'

const aliases = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', html: 'markup', xml: 'markup' }

export function codeTokens(text, language = '') {
  const name = aliases[language.toLowerCase()] ?? language.toLowerCase()
  const grammar = Prism.languages[name]
  return grammar ? Prism.tokenize(text, grammar) : [text]
}

export function syntaxRanges(tokens, start = 0, inherited = []) {
  const ranges = []
  let position = start
  for (const token of tokens) {
    if (typeof token === 'string') {
      if (token && inherited.length) ranges.push({ from: position, to: position + token.length, types: inherited })
      position += token.length
    } else {
      const nested = Array.isArray(token.content) ? token.content : [token.content]
      const result = syntaxRanges(nested, position, [...inherited, token.type])
      ranges.push(...result.ranges)
      position = result.end
    }
  }
  return { ranges, end: position }
}
