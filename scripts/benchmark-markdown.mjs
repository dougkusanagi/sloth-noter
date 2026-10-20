// Run with: node --expose-gc scripts/benchmark-markdown.mjs
import { performance } from 'node:perf_hooks'
import { markdownTree } from '../src/markdown-model.js'

if (!global.gc) throw new Error('Run Node with --expose-gc')
const base =
  '# Benchmark\n\n' +
  Array.from(
    { length: 100 },
    (_, index) =>
      `## Seção ${index}\n\nTexto com **ênfase**, [link](https://example.com) e conteúdo ${index}.\n\n- [ ] tarefa ${index}\n- item\n\n`,
  ).join('')
markdownTree('# Warmup')
global.gc()
const before = process.memoryUsage().heapUsed
const start = performance.now()
for (let revision = 0; revision < 160; revision++) markdownTree(base + `\nRevisão ${revision}`)
global.gc()
console.log(
  JSON.stringify(
    {
      revisions: 160,
      charactersPerRevision: base.length,
      retainedHeapMiB: +((process.memoryUsage().heapUsed - before) / 1048576).toFixed(2),
      elapsedMs: +(performance.now() - start).toFixed(1),
    },
    null,
    2,
  ),
)
