import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeDoi, verifiedExplanation } from './reader.ts'

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
