import type { Block } from './papers.ts'
import type { ReadingSection } from './sections.ts'

export type Explanation = {
  explanation: string; example: string; limits: string; model: string
  evidence: { id: string; quote: string }[]
}
export type Lesson = Explanation & { why: string; result: string }
export type PreparedReading = { lessons: Record<string, Lesson>; review?: Explanation }

export function lessonTerms(notes: Record<string, Lesson>) {
  const terms = new Set<string>()
  for (const lesson of Object.values(notes)) {
    for (const match of lesson.explanation.matchAll(/[\p{Script=Han}]{2,12}[（(][A-Za-z][A-Za-z0-9 -]{1,25}[）)]|\b[A-Z][A-Z0-9]{1,8}\b/gu)) {
      terms.add(match[0])
      if (terms.size === 12) return [...terms]
    }
  }
  return [...terms]
}

export function paragraphEvidence(blocks: Block[]) {
  if (blocks.length !== 1) return blocks
  const [block] = blocks
  const middle = Math.floor(block.text.length / 2)
  const breaks = [...block.text.matchAll(/\n|[。！？.!?]\s/gu)].map((match) => match.index! + match[0].length)
    .filter((position) => position >= 8 && position <= block.text.length - 8)
  const cut = breaks.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0]
  if (!cut) return blocks
  return [block.text.slice(0, cut), block.text.slice(cut)].map((text, index) => ({ ...block, id: block.id + ':' + index, text: text.trim() }))
}

export function reviewBlocks(sections: ReadingSection[]): Block[] {
  const source = sections.flatMap(({ blocks }) => blocks).filter(({ text }) => text.trim())
  const count = Math.min(source.length, 18)
  return Array.from({ length: count }, (_, index) => {
    const block = source[Math.round(index * (source.length - 1) / Math.max(1, count - 1))]
    return { ...block, text: block.text.slice(0, 1600) }
  })
}

export function reviewEvidence(blocks: Block[]) {
  return blocks.flatMap((block) => {
    const lines = block.text.split('\n').map((line) => line.trim()).filter((line) => line.length >= 24)
    const candidates = lines.length ? [lines[0], lines[Math.floor(lines.length / 2)]] : [block.text.trim()]
    return [...new Set(candidates)].filter((quote) => quote.length >= 8)
      .map((quote) => ({ id: block.id, quote: quote.slice(0, 130) }))
  })
}
