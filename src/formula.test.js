import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateTable, formatResult, parseNumber, columnName, isFormula } from './formula.js'

const shown = (rows) => evaluateTable(rows).map((row) => row.map((cell) => formatResult(cell)))
const one = (formula, rows = [['A', 'B', 'C']]) =>
  formatResult(evaluateTable([...rows, [formula]]).at(-1)[0])

test('numbers are read in Brazilian and plain formats', () => {
  assert.equal(parseNumber('1.234,56'), 1234.56)
  assert.equal(parseNumber('1234.5'), 1234.5)
  assert.equal(parseNumber('R$ 10,00'), 10)
  assert.equal(parseNumber('50%'), 0.5)
  assert.equal(parseNumber('-3'), -3)
  assert.equal(parseNumber('1.234.567'), 1234567)
  assert.equal(parseNumber('**12**'), 12)
  assert.equal(parseNumber('001'), 1)
  assert.equal(parseNumber('abc'), null)
  assert.equal(parseNumber('1,2,3'), null)
  assert.equal(parseNumber(''), null)
})

test('column names follow spreadsheet letters', () => {
  assert.equal(columnName(0), 'A')
  assert.equal(columnName(25), 'Z')
  assert.equal(columnName(26), 'AA')
  assert.ok(isFormula(' =1'))
  assert.ok(!isFormula('1=1'))
})

test('arithmetic follows the usual precedence', () => {
  assert.equal(one('=1+2*3'), '7')
  assert.equal(one('=(1+2)*3'), '9')
  assert.equal(one('=2^3^2'), '64')
  assert.equal(one('=-2^2'), '4')
  assert.equal(one('=10/4'), '2,5')
  assert.equal(one('=1,5+1'), '2,5')
  assert.equal(one('=50%*10'), '5')
  assert.equal(one('=0.1+0.2'), '0,3')
  assert.equal(one('="a"&"b"&1'), 'ab1')
  assert.equal(one('=1<2'), 'VERDADEIRO')
  assert.equal(one('="b">"A"'), 'VERDADEIRO')
})

test('references, ranges and functions use the table cells', () => {
  const rows = [
    ['Item', 'Qtd', 'Preço', 'Total'],
    ['Caneta', '2', 'R$ 1,50', '=B2*C2'],
    ['Caderno', '3', '10', '=B3*C3'],
    ['', '', 'texto', ''],
    ['Total', '=SOMA(B2:B4)', '=MÉDIA(C2:C4)', '=SOMA(D2:D3)'],
  ]
  const result = shown(rows)
  assert.equal(result[1][3], '3')
  assert.equal(result[2][3], '30')
  assert.equal(result[4][1], '5')
  assert.equal(result[4][2], '5,75')
  assert.equal(result[4][3], '33')
  assert.equal(result[0][0], '')
})

test('functions cover counting, logic and rounding, in Portuguese and English', () => {
  const rows = [
    ['A', 'B'],
    ['1', 'x'],
    ['2', ''],
    ['3', '4'],
  ]
  assert.equal(one('=CONT.NÚM(A2:B4)', rows), '4')
  assert.equal(one('=CONT.VALORES(A2:B4)', rows), '5')
  assert.equal(one('=CONT.VAZIO(A2:B4)', rows), '1')
  assert.equal(one('=SE(A2>0;"sim";"não")', rows), 'sim')
  assert.equal(one('=IF(A2>5,"yes","no")', rows), 'no')
  assert.equal(one('=E(A2>0;A3>0)', rows), 'VERDADEIRO')
  assert.equal(one('=OU(A2>5;FALSO)', rows), 'FALSO')
  assert.equal(one('=NÃO(VERDADEIRO)', rows), 'FALSO')
  assert.equal(one('=ARRED(2,345;2)', rows), '2,35')
  assert.equal(one('=ROUND(-2.5)', rows), '-3')
  assert.equal(one('=MÁX(A2:A4)-MIN(A2:A4)', rows), '2')
  assert.equal(one('=ABS(-4)+RAIZ(9)', rows), '7')
  assert.equal(one('=PRODUTO(A2:A4)', rows), '6')
  assert.equal(one('=CONCAT(A2;"-";B2)', rows), '1-x')
  assert.equal(one('=sum(a2:a4)', rows), '6')
})

test('errors are reported instead of thrown', () => {
  const rows = [
    ['A', 'B'],
    ['texto', '0'],
  ]
  assert.equal(one('=1/0', rows), '#DIV/0!')
  assert.equal(one('=A2+1', rows), '#VALOR!')
  assert.equal(one('=Z99', rows), '#REF!')
  assert.equal(one('=NADA(1)', rows), '#NOME?')
  assert.equal(one('=1+', rows), '#ERRO!')
  assert.equal(one('=(1', rows), '#ERRO!')
  assert.equal(one('=MÉDIA(B1:B1)', rows), '#DIV/0!')
  assert.equal(one('=SE(VERDADEIRO;1;1/0)', rows), '1')
  assert.equal(one('=alert(1)', rows), '#NOME?')
  assert.equal(one('=constructor', rows), '#ERRO!')
})

test('circular references stop with an error', () => {
  const result = shown([
    ['A', 'B'],
    ['=B2', '=A2'],
    ['=A3+1', '=A2'],
  ])
  assert.equal(result[1][0], '#CIRC!')
  assert.equal(result[1][1], '#CIRC!')
  assert.equal(result[2][0], '#CIRC!')
})

test('English results use English booleans and number format', () => {
  assert.equal(formatResult({ value: 1234.5 }, 'en'), '1,234.5')
  assert.equal(formatResult({ value: true }, 'en'), 'TRUE')
})

test('lowercase references and parentheses follow spreadsheet row numbering', () => {
  const rows = [
    ['a', 'b', 'c', 'd'],
    ['1', '- [x] tarefa', '', ''],
    ['2', '2', '3', '=(b3+c3)'],
  ]
  assert.equal(shown(rows)[2][3], '5')
  assert.equal(one('=(b2+c2)', rows), '#VALOR!')
})
