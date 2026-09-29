import Prism from 'prismjs'
import 'prismjs/components/prism-markup.js'
import 'prismjs/components/prism-css.js'
import 'prismjs/components/prism-python.js'
import 'prismjs/components/prism-bash.js'
import 'prismjs/components/prism-json.js'
import 'prismjs/components/prism-typescript.js'
import 'prismjs/components/prism-php.js'
import 'prismjs/components/prism-sql.js'
import 'prismjs/components/prism-yaml.js'
import 'prismjs/components/prism-markdown.js'
import 'prismjs/components/prism-java.js'
import 'prismjs/components/prism-c.js'
import 'prismjs/components/prism-cpp.js'
import 'prismjs/components/prism-csharp.js'
import 'prismjs/components/prism-go.js'
import 'prismjs/components/prism-rust.js'
import 'prismjs/components/prism-ruby.js'
import 'prismjs/components/prism-jsx.js'
import 'prismjs/components/prism-tsx.js'

const aliases = {
  js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', shell: 'bash',
  html: 'markup', xml: 'markup', svg: 'markup', yml: 'yaml', md: 'markdown',
  cxx: 'cpp', 'c++': 'cpp', cs: 'csharp', 'c#': 'csharp', golang: 'go', rb: 'ruby',
}

export function codeTokens(text, language = '') {
  const requested = language.trim().toLowerCase()
  const name = aliases[requested] ?? requested
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
