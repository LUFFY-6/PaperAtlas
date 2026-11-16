import assert from 'node:assert/strict'
import test from 'node:test'
import { hasSectionEvidence, normalizeDoi, validPaperContext, verifiedExplanation } from './reader.ts'
import { customModel, negotiatedCompletion } from './model.ts'
import { buildPersona, normalizeProfile } from '../src/persona.ts'
import { paragraphEvidence, reviewBlocks } from '../src/lessons.ts'
import { paperChatLimit, paperChatText } from '../src/paperChat.ts'
import { readerSections, readingBatches, readingSections } from '../src/sections.ts'
import { locateQuote } from '../src/evidence.ts'
import { fileDrop } from '../src/drop.ts'
import { discover } from './discovery.ts'
import type { DragEvent } from 'react'

test('keeps references readable across pages without creating lesson or review material', () => {
  const sections = readerSections([
    { id: '1', title: 'PDF 第 1 页', text: 'Conclusion\nThe proposed approach addresses the research question.\n8. References\n[1] First cited work.' },
    { id: '2', title: 'PDF 第 2 页', text: '[2] Second cited work.\nAppendix A\nAdditional analysis.' },
  ])
  const references = sections.find(({ kind }) => kind === 'references')
  assert.ok(references)
  assert.deepEqual(references.batches, [])
  assert.equal(references.blocks.length, 2)
  assert.ok(sections.some(({ title }) => title === 'Appendix A'))
  assert.ok(reviewBlocks(sections).every(({ text }) => !text.includes('cited work')))
})

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

test('bounds paper chat context and permits a question with no highlighted text', () => {
  const context = { title: '题名', section: '方法', text: '原文'.repeat(2000) }
  assert.equal(validPaperContext('section', context), true)
  assert.equal(validPaperContext('paper', { ...context, text: context.text + '。' }), false)
  assert.equal(validPaperContext('custom', context), false)
  assert.equal(validPaperContext('section', { ...context, quote: false }), false)
})

test('sends short papers intact and retrieves a relevant passage late in long papers', () => {
  const blocks = Array.from({ length: 40 }, (_, index) => ({
    id: String(index), title: `PDF 第 ${index + 1} 页`,
    text: 'Some background text about the research. '.repeat(45) + (index === 37 ? 'The ZetaBenchmark result was 91.' : 'End of page.'),
  }))
  const short = paperChatText(blocks.slice(-6), 'What was the result?')
  assert.equal(short.coverage, 'full')
  for (const block of blocks.slice(-6)) assert.ok(short.text.includes(block.text))
  assert.equal(paperChatText(blocks.slice(-6), '', true).coverage, 'partial')

  const full = paperChatText(blocks, 'ZetaBenchmark 的结果是多少？')
  assert.equal(full.coverage, 'full')
  assert.ok(full.text.length > 24_000)
  for (const block of blocks) assert.ok(full.text.includes(`[${block.title}]\n${block.text}`))
  assert.equal(validPaperContext('paper', { title: '题名', section: '论文原文', ...full }), true)
  assert.throws(() => paperChatText([{ id: '1', title: '正文', text: 'a'.repeat(paperChatLimit) }], ''), /单次全文发送上限/)

  const long = paperChatText(blocks, 'ZetaBenchmark 的结果是多少？', false, 'excerpts')
  assert.equal(long.coverage, 'partial')
  assert.match(long.text, /The ZetaBenchmark result was 91/)
  assert.match(long.text, /PDF 第 40 页/)
  assert.ok(long.text.length <= 24_000)
  assert.equal(validPaperContext('paper', { title: '题名', section: '论文原文', ...long }), true)
})

test('requires distinct, short quotes and splits fallback input without inventing source text', () => {
  const one = { id: '1', quote: 'This is an exact quote.' }
  assert.equal(hasSectionEvidence([one, one]), false)
  assert.equal(hasSectionEvidence([one], 1), true)
  assert.equal(hasSectionEvidence([], 1), false)
  assert.equal(hasSectionEvidence([one, { id: '2', quote: 'a'.repeat(161) }]), false)
  assert.equal(hasSectionEvidence([one, { ...one, id: '2' }]), true)
  const text = 'The first paragraph has length.\nThe second paragraph is also usable.'
  const parts = paragraphEvidence([{ id: 'x', text, title: '方法' }])
  assert.equal(parts.length, 2)
  assert.equal(new Set(parts.map(({ id }) => id)).size, 2)
  assert.ok(parts.every((block) => text.includes(block.text)))
})

test('profile goals are bounded and empty profile fields are omitted from the persona', () => {
  assert.equal(normalizeProfile({ goal: '其他', major: '研'.repeat(41) }).major.length, 40)
  assert.equal(normalizeProfile({ goal: '其他' }).goal, '')
  assert.equal(buildPersona({ major: '计算机', goal: '写综述' }).label, 'Paper Atlas · 计算机科研搭档')
  assert.doesNotMatch(buildPersona().system, /研究方向|目的：/)
})

test('normalizes the provider list route and falls back for rejected reasoning and token fields', async () => {
  const route = customModel({ base: 'https://example.com/v1/chat/completions', key: 'fixture' }, false, true)
  assert.equal(route.url.pathname, '/v1/models')
  const payloads: Record<string, unknown>[] = []
  const config = { base: 'https://example.test/v1', model: 'gpt-5-fixture', effort: 'deep' as const }
  const send = async (payload: Record<string, unknown>) => {
    payloads.push(payload)
    if (payload.reasoning_effort) return { status: 400, body: { error: 'unsupported reasoning_effort' } }
    if (payload.max_tokens) return { status: 400, body: { error: 'use max_completion_tokens instead' } }
    return { status: 200, body: { choices: [{ message: { content: 'ok' } }] } }
  }
  assert.equal(await negotiatedCompletion(config, [], send, false), 'ok')
  assert.equal(payloads[0].reasoning_effort, 'high')
  assert.equal(payloads[2].max_completion_tokens, 4000)
  assert.equal(await negotiatedCompletion({ ...config, effort: 'fast' }, [], send, false), 'ok')
  assert.equal(payloads[3].max_completion_tokens, 1200)
  assert.equal(payloads.length, 4)
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

test('keeps unnumbered PDF body before the first recognized heading available for reading', () => {
  const blocks = [
    { id: '1', title: 'PDF 第 1 页', text: 'arXiv:1234\n' + 'The abstract describes the contribution. '.repeat(10) },
    { id: '2', title: 'PDF 第 2 页', text: 'Motivation and contributions\n' + 'Prior work motivates the research. '.repeat(20) },
    { id: '3', title: 'PDF 第 3 页', text: 'Experiments with the new framework\n' + 'The comparison shows the baseline result. '.repeat(20) },
    { id: '4', title: 'PDF 第 4 页', text: 'METHODS\n' + 'The paper describes the experimental procedure. '.repeat(20) },
  ]
  const [body, methods] = readerSections(blocks)
  assert.equal(body.kind, undefined)
  assert.equal(body.title, '篇首正文')
  assert.deepEqual(body.batches.map(([block]) => block.id), readingBatches(readingSections(blocks)[0].blocks).map(([block]) => block.id))
  assert.equal(methods.title, 'METHODS')
})

test('locates cross-page quotes and respects a verified source ID when a quote repeats', () => {
  const paper = { id: 'p', title: 'Sample', short: 'Sample', field: 'science' as const, author: '', year: '', venue: '', blocks: [
    { id: '1', title: 'PDF 第 1 页', text: 'Common phrase, followed by the first half.' },
    { id: '2', title: 'PDF 第 2 页', text: 'The conclusion comes here, then Common phrase.' },
  ] }
  assert.equal(locateQuote(paper, 'Common phrase', 0, '1-2')?.page, 2)
  const match = locateQuote(paper, 'first half.\nThe conclusion')
  assert.equal(match?.page, 1)
  assert.equal(match?.text, 'first half.')
})

test('uses the cited block to find the right occurrence on the same PDF page', () => {
  const body = '1. Introduction\nA repeated phrase. ' + 'First section details. '.repeat(12)
    + '\n2. Methods\nA repeated phrase. ' + 'Second section details. '.repeat(12)
  const paper = { id: 'p', title: 'Sample', short: 'Sample', field: 'science' as const, author: '', year: '', venue: '',
    blocks: [{ id: '1', title: 'PDF 第 1 页', text: body }] }
  const match = locateQuote(paper, 'A repeated phrase.', 0, '2-1')
  assert.equal(match?.page, 1)
  assert.equal(match?.blockId, '2-1')
  assert.equal(match?.pageOffset, body.replace(/\s/gu, '').lastIndexOf('Arepeatedphrase.'))
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
  assert.deepEqual(result.works.slice(0, 3).map(({ relation }) => relation), ['参考文献', '引用本文', '同问题'])
  assert.ok(result.works.slice(3).every(({ relation }) => relation === '待核对'))
  assert.deepEqual(result.works[1].cites, ['10.5555/earlier'])
  assert.equal(result.works[2].evidenceSource, 'Crossref 题名')
  assert.match(result.works[2].difference, /待核对/)
})

test('falls back to real library entries when Crossref is unreachable', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('fetch failed') })
  const result = await discover('Attention Is All You Need', 'Transformer attention for translation', async ([system, input]) => {
    if (system.content.startsWith('为')) return '{"query":"attention transformer sequence machine translation"}'
    const { candidates } = JSON.parse(input.content)
    assert.ok(candidates.every(({ id }: { id: string }) => id !== 'arxiv-1706.03762'))
    assert.ok(candidates.some(({ id }: { id: string }) => id === 'arxiv-1810.04805'))
    return JSON.stringify({ position: '基于学习库', works: [{
      id: 'arxiv-1810.04805', problem: '语言表征', method: '双向 Transformer', difference: '采用预训练', relation: '方法相关',
    }] })
  }, new AbortController().signal)
  assert.equal(result.source, 'library')
  assert.equal(result.works.length, 5)
  assert.equal(new Set(result.works.map(({ id }) => id)).size, 5)
  assert.equal(result.works[0].url, 'https://arxiv.org/pdf/1810.04805')
  assert.match(result.works[0].evidenceSource ?? '', /^学习库/)
  assert.deepEqual(result.works[0].cites, [])
  assert.ok(result.works.slice(1).every(({ evidenceSource }) => evidenceSource === 'arXiv 摘要要点'))
})
