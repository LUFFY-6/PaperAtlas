import type { Block } from './papers.ts'

export const paperChatLimit = 240_000
const excerptLimit = 24_000
export type PaperChatMode = 'full' | 'excerpts'

const sectionTerms = [
  [/摘要|标题|题名/u, 'abstract title'],
  [/方法|算法|模型/u, 'method algorithm model'],
  [/实验|对照|基线/u, 'experiment evaluation baseline'],
  [/结果|结论|表现/u, 'results conclusion performance'],
  [/局限|不足|限制/u, 'limitations discussion'],
] as const

export function paperChatText(blocks: Block[], question: string, partial = false, mode: PaperChatMode = 'full') {
  const source = blocks.filter(({ text }) => text.trim())
  const fullText = source.map(({ title, text }) => `[${title}]\n${text}`).join('\n\n')
  if (mode === 'full' && fullText.length > paperChatLimit) {
    throw new Error('论文超过单次全文发送上限，请切换到「相关段落」后重试。')
  }
  if (mode === 'full' || fullText.length <= excerptLimit) {
    return { text: fullText, coverage: partial ? 'partial' as const : 'full' as const }
  }

  const terms = new Set(question.toLowerCase().match(/[a-z\d][a-z\d-]{2,}/g) ?? [])
  for (const match of question.matchAll(/(?=(\p{Script=Han}{2}))/gu)) terms.add(match[1])
  for (const [pattern, keywords] of sectionTerms) {
    if (pattern.test(question)) for (const word of keywords.split(' ')) terms.add(word)
  }

  const passages = source.flatMap(({ title, text }) => {
    const parts: string[] = []
    for (let start = 0; start < text.length;) {
      const limit = Math.min(start + 1800, text.length)
      const line = text.lastIndexOf('\n', limit - 1)
      const space = text.lastIndexOf(' ', limit - 1)
      const end = limit === text.length ? limit : line > start + 1000 ? line + 1 : space > start + 1000 ? space + 1 : limit
      const passage = text.slice(start, end).trim()
      if (passage) parts.push(`[${title}]\n${passage}`)
      start = end
    }
    return parts
  })
  const keywords = [...terms]
  const frequency = new Map<string, number>()
  const matches = passages.map((text) => {
    const lower = text.toLowerCase()
    const found = keywords.filter((term) => lower.includes(term))
    for (const term of found) frequency.set(term, (frequency.get(term) ?? 0) + 1)
    return found
  })
  const ranked = matches.map((found, index) => ({
    index, score: found.reduce((sum, term) => sum + Math.log(passages.length / frequency.get(term)!), 0),
  })).sort((a, b) => b.score - a.score)

  const chosen = new Set<number>()
  let remaining = excerptLimit
  function include(index: number) {
    const cost = passages[index].length + (chosen.size ? 2 : 0)
    if (!chosen.has(index) && cost <= remaining) {
      chosen.add(index)
      remaining -= cost
    }
  }

  include(0)
  for (const { index, score } of ranked) {
    if (!score || remaining < 6000) break
    include(index)
  }
  // Spread the remaining context across the paper, even when the question has few matching terms.
  for (let count = 1; count < passages.length; count *= 2) {
    for (let step = 1; step <= count; step += 2) include(Math.round(step * (passages.length - 1) / count))
  }
  for (const { index } of ranked) include(index)

  return { text: [...chosen].sort((a, b) => a - b).map((index) => passages[index]).join('\n\n'), coverage: 'partial' as const }
}
