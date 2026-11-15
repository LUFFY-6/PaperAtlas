import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeDoi, verifiedExplanation } from './reader.ts'
import { readerSections, readingBatches, readingSections } from '../src/sections.ts'
import { locateQuote } from '../src/evidence.ts'
import { fileDrop } from '../src/drop.ts'
import { discover } from './discovery.ts'
import type { DragEvent } from 'react'

test('accepts a literal passage quote and rejects invented or misattributed evidence', () => {
  const blocks = [{ id: '1', title: '第 1 页', text: 'The model uses scaled dot-product attention.' }]
  const result = { explanation: '注意力', example: '示例', limits: '仅基于该句', evidence: [{ id: '1', quote: 'scaled dot-product' }] }
  assert.deepEqual(verifiedExplanation(result, blocks), result)
  assert.throws(() => verifiedExplanation({ ...result, evidence: [{ id: '2', quote: 'scaled dot-product' }] }, blocks), /无法核对/)
  assert.throws(() => verifiedExplanation({ ...result, evidence: [{ id: '1', quote: 'additive attention' }] }, blocks), /无法核对/)
})

test('normalizes DOI resolver links and DOI prefixes', () => {
  assert.equal(normalizeDoi(' https://doi.org/10.5555/123 '), '10.5555/123')
  assert.equal(normalizeDoi('doi: 10.5555/123'), '10.5555/123')
})

test('a file drop hands the original file to the workspace importer and prevents browser navigation', () => {
  const file = new File(['# 研究问题'], 'study.md')
  const calls: unknown[] = []
  const handlers = fileDrop((picked) => calls.push(picked))
  const dataTransfer = { files: [file], types: ['Files'], dropEffect: 'none' }
  const event = {
    dataTransfer, preventDefault: () => calls.push('prevent'), stopPropagation: () => calls.push('stop'),
  } as unknown as DragEvent
  handlers.onDragOver(event)
  assert.equal(dataTransfer.dropEffect, 'copy')
  handlers.onDrop(event)
  assert.deepEqual(calls, ['prevent', 'prevent', 'stop', file])
  handlers.onDrop({ ...event, dataTransfer: { files: [] } } as unknown as DragEvent)
  assert.equal(calls.length, 4)
})

test('keeps the full source in order across section and page boundaries', () => {
  const blocks = [
    { id: '1', title: 'PDF 第 1 页', text: 'Abstract\nAn overview.\n1 Introduction\nThe research question.' },
    { id: '2', title: 'PDF 第 2 页', text: 'Continuation of the introduction.\n2 Methods\nThe study design.\n3 Results\n' + 'x'.repeat(8700) },
    { id: '3', title: 'PDF 第 3 页', text: '4 Conclusion\nThe main finding.' },
  ]
  const sections = readingSections(blocks)
  assert.deepEqual(sections.map(({ title }) => title), ['Abstract', '1 Introduction', '2 Methods', '3 Results', '4 Conclusion'])
  assert.equal(sections[1].blocks[1].title, 'PDF 第 2 页')
  const resultBatches = readingBatches(sections[3].blocks)
  assert.ok(resultBatches.length > 1)
  assert.deepEqual(resultBatches.flat(), sections[3].blocks)
  assert.ok(resultBatches.every((batch) => batch.length <= 5 && batch.reduce((size, block) => size + block.text.length, 0) <= 4600))
  assert.equal(sections.flatMap(({ blocks }) => blocks).map(({ text }) => text.replace(/\s/g, '')).join(''),
    blocks.map(({ text }) => text.replace(/\s/g, '')).join(''))
})

test('keeps numbered pseudocode inside its subsection across PDF pages', () => {
  const sections = readingSections([
    { id: '1', title: 'PDF 第 1 页', text: '论文标题\n1. 引言\n正文\n2. 系统与故障模型\n2.1. 恢复动作的歧义\n1 C ← ∅\n2 对每个' },
    { id: '2', title: 'PDF 第 2 页', text: '3 τ ← ∅\n4 对每个\n5 w ← 在 KE(o) 上归一化的先验\n2.2. 工作流与观测模型\n正文' },
  ])
  assert.deepEqual(sections.map(({ title }) => title), ['篇首', '1. 引言', '2. 系统与故障模型', '2.1. 恢复动作的歧义', '2.2. 工作流与观测模型'])
  assert.match(sections[3].blocks[1].text, /5 w ←/)
})

test('retains PDF table markers in the source without making them headings or standalone lessons', () => {
  const sections = readingSections([
    { id: '1', title: 'PDF 第 1 页', text: 'Introduction\nA research question.\n# *\nThis table reports one observation.' },
    { id: '2', title: 'PDF 第 2 页', text: '# *' },
  ])
  assert.deepEqual(sections.map(({ title }) => title), ['Introduction'])
  assert.match(sections[0].blocks[0].text, /# \*\nThis table/)
  assert.equal(readingBatches([{ id: '2', title: 'PDF 第 2 页', text: '# *' }]).length, 0)
})

test('hides frontmatter from generation and merges short sections without changing source or lesson IDs', () => {
  const blocks = [{ id: '1', title: 'PDF 第 1 页', text: 'arXiv:1234\nCopyright text\n\n1. 引言\n' + '研究问题。'.repeat(60) + '\n2. 补充\n很短的一节。' }]
  const original = readingSections(blocks)
  const displayed = readerSections(blocks)
  assert.equal(displayed[0].kind, 'frontmatter')
  assert.deepEqual(displayed[0].batches, [])
  assert.deepEqual(displayed[1].blocks.map(({ id }) => id), original.slice(1).flatMap(({ blocks }) => blocks.map(({ id }) => id)))
  assert.deepEqual(displayed[1].batches.map(([block]) => block.id), original.slice(1).flatMap(({ blocks }) => readingBatches(blocks).map(([block]) => block.id)))
})

test('locates cross-page quotes and respects a verified source ID when a quote repeats', () => {
  const paper = { id: 'p', title: 'Sample', short: 'Sample', field: 'science' as const, author: '', year: '', venue: '', blocks: [
    { id: '1', title: 'PDF 第 1 页', text: 'Common phrase, followed by the first half.' },
    { id: '2', title: 'PDF 第 2 页', text: 'The conclusion comes here, then Common phrase.' },
  ] }
  assert.equal(locateQuote(paper, 'Common phrase', 0, '1-2')?.page, 2)
  const match = locateQuote(paper, 'first half.\nThe conclusion')
  assert.equal(match?.page, 1)
  assert.equal(match?.text, 'firsthalf.')
})

test('labels citation directions from metadata and limits comparisons backed by title alone', async (t) => {
  t.mock.method(globalThis, 'fetch', async (address: string) => {
    const url = new URL(address)
    if (url.hostname === 'api.semanticscholar.org') return Response.json([null])
    if (url.searchParams.has('query.title')) return Response.json({ message: { items: [{
      DOI: '10.5555/target', title: ['<i>Test paper</i>'], issued: { 'date-parts': [[2020]] }, reference: [{ DOI: '10.5555/earlier' }],
    }] } })
    return Response.json({ message: { items: [
      { DOI: '10.5555/earlier', title: ['Earlier paper'], abstract: '<p>Earlier evidence.</p>' },
      { DOI: '10.5555/later', title: ['Later paper'], abstract: '<p>Later evidence.</p>', reference: [{ DOI: '10.5555/target' }, { DOI: '10.5555/earlier' }] },
      { DOI: '10.5555/parallel', title: ['Parallel paper'] },
    ] } })
  })
  const choice = (id: string) => ({ id, problem: 'a', method: 'b', difference: 'c', relation: '同问题' })
  const result = await discover('Test paper', 'Test excerpt', async (messages) => messages[0].content.startsWith('为')
    ? JSON.stringify({ query: 'research problem alternative approaches' })
    : JSON.stringify({ position: '研究路线', works: ['earlier', 'later', 'parallel', 'invented'].map((id) => choice('10.5555/' + id)) }),
  new AbortController().signal)
  assert.equal(result.year, '2020')
  assert.deepEqual(result.works.map(({ relation }) => relation), ['参考文献', '引用本文', '同问题'])
  assert.deepEqual(result.works[1].cites, ['10.5555/earlier'])
  assert.equal(result.works[2].evidenceSource, 'Crossref 题名')
  assert.match(result.works[2].difference, /待核对/)
})
