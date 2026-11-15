import type { Block } from './papers.ts'
import type { ReadingSection } from './sections.ts'

export type Explanation = {
  explanation: string; example: string; limits: string; model: string
  evidence: { id: string; quote: string }[]
}
export type Lesson = Explanation & { why: string; result: string }
export type PreparedReading = { lessons: Record<string, Lesson>; review?: Explanation }

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
