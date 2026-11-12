// A small spreadsheet formula engine for table cells. A cell whose text starts
// with "=" is a formula. It never runs JavaScript from the note: the formula is
// read by a tokenizer and a parser, and only the functions listed here exist.
//
// References follow the spreadsheet layout of the Markdown table: column A is
// the first column and row 1 is the header row, so the first body row is row 2.

export const ERRORS = {
  div: '#DIV/0!',
  value: '#VALOR!',
  ref: '#REF!',
  name: '#NOME?',
  syntax: '#ERRO!',
  cycle: '#CIRC!',
  na: '#N/D',
}

class FormulaError {
  constructor(code) {
    this.code = code
  }
}
const fail = (code) => new FormulaError(code)
const isError = (value) => value instanceof FormulaError

export function isFormula(text) {
  return /^\s*=/.test(text ?? '')
}

// Removes simple Markdown emphasis so "**10**" still counts as a number.
function plainText(text) {
  return String(text ?? '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/(\*\*|__|~~|\*|_|`)(.+?)\1/g, '$2')
    .trim()
}

// Reads numbers as people type them in Brazil and elsewhere: "1.234,56",
// "1234.5", "R$ 10,00", "50%", "-3". Returns null for anything else.
export function parseNumber(input) {
  let text = plainText(input)
    .replace(/^R\$\s*/i, '')
    .replace(/\s+/g, '')
  if (!text) return null
  let percent = false
  if (text.endsWith('%')) {
    percent = true
    text = text.slice(0, -1)
  }
  if (!/^[+-]?(\d[\d.,]*|[.,]\d+)$/.test(text)) return null
  if (text.includes(',')) {
    // Comma decimal: the dots group thousands.
    if (text.indexOf(',') !== text.lastIndexOf(',')) return null
    const [whole, fraction] = text.split(',')
    if (whole.includes('.') && !/^[+-]?\d{1,3}(\.\d{3})+$/.test(whole)) return null
    text = `${whole.replace(/\./g, '')}.${fraction}`
  } else if (/^[+-]?\d{1,3}(\.\d{3}){2,}$/.test(text)) text = text.replace(/\./g, '')
  else if (text.indexOf('.') !== text.lastIndexOf('.')) return null
  const value = Number(text)
  if (!Number.isFinite(value)) return null
  return percent ? value / 100 : value
}

export function columnName(index) {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

function columnIndex(letters) {
  let index = 0
  for (const letter of letters.toUpperCase()) index = index * 26 + letter.charCodeAt(0) - 64
  return index - 1
}

const normalizeName = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

function tokenize(source) {
  const tokens = []
  let index = 0
  while (index < source.length) {
    const rest = source.slice(index)
    const space = /^\s+/.exec(rest)
    if (space) {
      index += space[0].length
      continue
    }
    let match
    if ((match = /^"((?:[^"]|"")*)"/.exec(rest)))
      tokens.push({ type: 'string', value: match[1].replace(/""/g, '"') })
    else if ((match = /^\$?([A-Za-z]{1,3})\$?(\d{1,6})(?![\w.(])/.exec(rest)))
      tokens.push({ type: 'ref', column: columnIndex(match[1]), row: Number(match[2]) - 1 })
    else if ((match = /^(\d+(?:[.,]\d+)?|[.,]\d+)/.exec(rest)))
      tokens.push({ type: 'number', value: Number(match[1].replace(',', '.')) })
    else if ((match = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*/.exec(rest)))
      tokens.push({ type: 'name', value: normalizeName(match[0]) })
    else if ((match = /^(<=|>=|<>|[-+*/^&=<>%():;,])/.exec(rest)))
      tokens.push({ type: 'op', value: match[1] })
    else throw fail(ERRORS.syntax)
    index += match[0].length
  }
  return tokens
}

// Precedence, lowest first: comparison, &, + -, * /, ^, unary minus, %.
function parse(source) {
  const tokens = tokenize(source)
  let position = 0
  const peek = () => tokens[position]
  const isOp = (value) => peek()?.type === 'op' && peek().value === value
  const take = (value) => {
    if (!isOp(value)) throw fail(ERRORS.syntax)
    position++
  }
  const binary = (operators, next) => () => {
    let left = next()
    while (peek()?.type === 'op' && operators.includes(peek().value)) {
      const op = tokens[position++].value
      left = { type: 'binary', op, left, right: next() }
    }
    return left
  }
  const primary = () => {
    const token = tokens[position++]
    if (!token) throw fail(ERRORS.syntax)
    if (token.type === 'number' || token.type === 'string')
      return { type: 'value', value: token.value }
    if (token.type === 'ref') {
      if (isOp(':')) {
        position++
        const end = tokens[position++]
        if (end?.type !== 'ref') throw fail(ERRORS.syntax)
        return { type: 'range', from: token, to: end }
      }
      return { type: 'ref', row: token.row, column: token.column }
    }
    if (token.type === 'name') {
      if (token.value === 'VERDADEIRO' || token.value === 'TRUE')
        return { type: 'value', value: true }
      if (token.value === 'FALSO' || token.value === 'FALSE') return { type: 'value', value: false }
      take('(')
      const args = []
      if (!isOp(')'))
        for (;;) {
          args.push(comparison())
          if (isOp(';') || isOp(',')) position++
          else break
        }
      take(')')
      return { type: 'call', name: token.value, args }
    }
    if (token.type === 'op' && token.value === '(') {
      const inner = comparison()
      take(')')
      return inner
    }
    throw fail(ERRORS.syntax)
  }
  const postfix = () => {
    let node = primary()
    while (isOp('%')) {
      position++
      node = { type: 'percent', node }
    }
    return node
  }
  const unary = () => {
    if (isOp('-') || isOp('+')) {
      const op = tokens[position++].value
      return { type: 'unary', op, node: unary() }
    }
    return postfix()
  }
  const power = binary(['^'], unary)
  const product = binary(['*', '/'], power)
  const sum = binary(['+', '-'], product)
  const concat = binary(['&'], sum)
  const comparison = binary(['=', '<>', '<', '>', '<=', '>='], concat)
  const tree = comparison()
  if (position < tokens.length) throw fail(ERRORS.syntax)
  return tree
}

const isBlank = (value) => value === null

function toNumber(value) {
  if (isError(value)) return value
  if (isBlank(value)) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  const number = parseNumber(value)
  return number == null ? fail(ERRORS.value) : number
}

function toText(value) {
  if (isBlank(value)) return ''
  if (typeof value === 'boolean') return value ? 'VERDADEIRO' : 'FALSO'
  return String(value)
}

function toBoolean(value) {
  if (isError(value)) return value
  if (typeof value === 'boolean') return value
  if (isBlank(value)) return false
  if (typeof value === 'number') return value !== 0
  const upper = normalizeName(String(value))
  if (upper === 'VERDADEIRO' || upper === 'TRUE') return true
  if (upper === 'FALSO' || upper === 'FALSE') return false
  return fail(ERRORS.value)
}

// Values of a function argument: a range gives every cell, a single value one.
const flatten = (args) => args.flatMap((arg) => (arg?.range ? arg.values : [arg]))

// Numbers of the arguments; in a range, text and blank cells are skipped.
function numbers(args) {
  const result = []
  for (const arg of args) {
    if (arg?.range) {
      for (const value of arg.values) {
        if (isError(value)) return value
        if (typeof value === 'number') result.push(value)
      }
      continue
    }
    const value = toNumber(arg)
    if (isError(value)) return value
    result.push(value)
  }
  return result
}

const aggregate = (reduce) => (args) => {
  const list = numbers(args)
  return isError(list) ? list : reduce(list)
}

const FUNCTIONS = {
  SOMA: aggregate((list) => list.reduce((sum, value) => sum + value, 0)),
  MEDIA: aggregate((list) =>
    list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : fail(ERRORS.div),
  ),
  MIN: aggregate((list) => (list.length ? Math.min(...list) : 0)),
  MAX: aggregate((list) => (list.length ? Math.max(...list) : 0)),
  PRODUTO: aggregate((list) => list.reduce((product, value) => product * value, 1)),
  'CONT.NUM': (args) =>
    flatten(args).filter((value) => typeof value === 'number' || parseNumber(value) != null).length,
  'CONT.VALORES': (args) => flatten(args).filter((value) => !isBlank(value) && value !== '').length,
  'CONT.VAZIO': (args) => flatten(args).filter((value) => isBlank(value) || value === '').length,
  SE: (args) => {
    if (args.length < 2 || args.length > 3) return fail(ERRORS.value)
    const condition = toBoolean(args[0])
    if (isError(condition)) return condition
    return condition ? args[1] : args.length > 2 ? args[2] : false
  },
  E: (args) => {
    const list = flatten(args).map(toBoolean)
    return list.find(isError) ?? list.every(Boolean)
  },
  OU: (args) => {
    const list = flatten(args).map(toBoolean)
    return list.find(isError) ?? list.some(Boolean)
  },
  NAO: (args) => {
    if (args.length !== 1) return fail(ERRORS.value)
    const value = toBoolean(args[0])
    return isError(value) ? value : !value
  },
  ARRED: (args) => {
    if (args.length < 1 || args.length > 2) return fail(ERRORS.value)
    const value = toNumber(args[0])
    const digits = args.length > 1 ? toNumber(args[1]) : 0
    if (isError(value)) return value
    if (isError(digits)) return digits
    const factor = 10 ** Math.trunc(digits)
    return (Math.sign(value) * Math.round(Math.abs(value) * factor + Number.EPSILON)) / factor
  },
  ABS: (args) => {
    if (args.length !== 1) return fail(ERRORS.value)
    const value = toNumber(args[0])
    return isError(value) ? value : Math.abs(value)
  },
  RAIZ: (args) => {
    if (args.length !== 1) return fail(ERRORS.value)
    const value = toNumber(args[0])
    if (isError(value)) return value
    return value < 0 ? fail(ERRORS.value) : Math.sqrt(value)
  },
  CONCAT: (args) => {
    const list = flatten(args)
    return list.find(isError) ?? list.map(toText).join('')
  },
}
// English names and accent-free spellings of the same functions.
Object.assign(FUNCTIONS, {
  SUM: FUNCTIONS.SOMA,
  AVERAGE: FUNCTIONS.MEDIA,
  PRODUCT: FUNCTIONS.PRODUTO,
  COUNT: FUNCTIONS['CONT.NUM'],
  COUNTA: FUNCTIONS['CONT.VALORES'],
  COUNTBLANK: FUNCTIONS['CONT.VAZIO'],
  IF: FUNCTIONS.SE,
  AND: FUNCTIONS.E,
  OR: FUNCTIONS.OU,
  NOT: FUNCTIONS.NAO,
  ROUND: FUNCTIONS.ARRED,
  SQRT: FUNCTIONS.RAIZ,
  CONCATENAR: FUNCTIONS.CONCAT,
  CONCATENATE: FUNCTIONS.CONCAT,
})

function compare(op, left, right) {
  const kind = (value) =>
    typeof value === 'number' ? 0 : typeof value === 'string' || isBlank(value) ? 1 : 2
  let a = isBlank(left) ? (typeof right === 'number' ? 0 : '') : left
  let b = isBlank(right) ? (typeof left === 'number' ? 0 : '') : right
  let order
  if (kind(a) !== kind(b)) order = kind(a) - kind(b)
  else if (typeof a === 'string') {
    a = a.toLowerCase()
    b = b.toLowerCase()
    order = a < b ? -1 : a > b ? 1 : 0
  } else order = a < b ? -1 : a > b ? 1 : 0
  return {
    '=': order === 0,
    '<>': order !== 0,
    '<': order < 0,
    '>': order > 0,
    '<=': order <= 0,
    '>=': order >= 0,
  }[op]
}

// Evaluates every cell of a table. `rows` holds the Markdown text of each cell,
// header row first. The result has, for each cell, the computed value, the
// text to show and, for formulas, the error code when the formula fails.
export function evaluateTable(rows) {
  const height = rows.length
  const width = Math.max(0, ...rows.map((row) => row.length))
  const results = new Map()
  const visiting = new Set()

  const cellValue = (row, column) => {
    if (row < 0 || column < 0 || row >= height || column >= width) return fail(ERRORS.ref)
    const key = `${row}:${column}`
    if (results.has(key)) return results.get(key).value
    const text = rows[row]?.[column] ?? ''
    if (!isFormula(text)) {
      const plain = plainText(text)
      if (!plain) return null
      const number = parseNumber(plain)
      return number ?? plain
    }
    if (visiting.has(key)) return fail(ERRORS.cycle)
    visiting.add(key)
    let value
    try {
      value = run(parse(text.trim().slice(1)))
      if (value?.range) value = value.values.length === 1 ? value.values[0] : fail(ERRORS.value)
      if (typeof value === 'number' && !Number.isFinite(value)) value = fail(ERRORS.value)
    } catch (error) {
      if (!isError(error)) throw error
      value = error
    }
    visiting.delete(key)
    results.set(key, { value })
    return value
  }

  const run = (node) => {
    switch (node.type) {
      case 'value':
        return node.value
      case 'ref':
        return cellValue(node.row, node.column)
      case 'range': {
        const top = Math.min(node.from.row, node.to.row)
        const bottom = Math.max(node.from.row, node.to.row)
        const left = Math.min(node.from.column, node.to.column)
        const right = Math.max(node.from.column, node.to.column)
        if (top >= height || left >= width) return fail(ERRORS.ref)
        const values = []
        for (let row = top; row <= Math.min(bottom, height - 1); row++)
          for (let column = left; column <= Math.min(right, width - 1); column++)
            values.push(cellValue(row, column))
        return { range: true, values }
      }
      case 'percent': {
        const value = toNumber(run(node.node))
        return isError(value) ? value : value / 100
      }
      case 'unary': {
        const value = toNumber(run(node.node))
        return isError(value) ? value : node.op === '-' ? -value : value
      }
      case 'call': {
        const fn = FUNCTIONS[node.name]
        if (!fn) return fail(ERRORS.name)
        const args = node.args.map(run)
        // Errors in plain arguments stop the call; functions see range errors themselves.
        const error = args.find(isError)
        if (error && node.name !== 'SE' && node.name !== 'IF') return error
        const value = fn(args)
        return value?.range ? fail(ERRORS.value) : value
      }
      case 'binary': {
        const left = run(node.left)
        const right = run(node.right)
        if (left?.range || right?.range) return fail(ERRORS.value)
        if (isError(left)) return left
        if (isError(right)) return right
        if (node.op === '&') return toText(left) + toText(right)
        if (['=', '<>', '<', '>', '<=', '>='].includes(node.op))
          return compare(node.op, left, right)
        const a = toNumber(left)
        const b = toNumber(right)
        if (isError(a)) return a
        if (isError(b)) return b
        if (node.op === '+') return a + b
        if (node.op === '-') return a - b
        if (node.op === '*') return a * b
        if (node.op === '/') return b === 0 ? fail(ERRORS.div) : a / b
        if (node.op === '^') return a ** b
        return fail(ERRORS.syntax)
      }
      default:
        return fail(ERRORS.syntax)
    }
  }

  return rows.map((row, rowIndex) =>
    Array.from({ length: width }, (_, column) => {
      const text = row[column] ?? ''
      if (!isFormula(text)) return null
      const value = cellValue(rowIndex, column)
      return isError(value) ? { error: value.code } : { value }
    }),
  )
}

// The text a formula result shows in the cell.
export function formatResult(result, language = 'pt-BR') {
  if (!result) return ''
  if (result.error) return result.error
  const { value } = result
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean')
    return language === 'en' ? (value ? 'TRUE' : 'FALSE') : value ? 'VERDADEIRO' : 'FALSO'
  if (typeof value === 'number')
    return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'pt-BR', {
      maximumFractionDigits: 10,
    }).format(Number(value.toPrecision(15)))
  return String(value)
}
