import type { Paper } from './papers.ts'
import { readerSections } from './sections.ts'

export type Located = { blockId: string; page: number | null; text: string; sectionIndex: number }
const normalized = (value: string) => value.replace(/\s/gu, '')

export function locateQuote(paper: Paper, quote: string, currentSection?: number, preferredId?: string): Located | undefined {
  const needle = normalized(quote)
  if (!needle) return
  const blocks = readerSections(paper.blocks).flatMap((section, sectionIndex) =>
    section.blocks.map((block) => ({ block, sectionIndex, text: normalized(block.text) })))
  const matches = blocks.flatMap((entry, index) => {
    const direct = entry.text.includes(needle)
    const offset = direct ? -1 : (entry.text + blocks.slice(index + 1, index + 3).map(({ text }) => text).join('')).indexOf(needle)
    if (!direct && (offset < 0 || offset >= entry.text.length)) return []
    return [{ ...entry, direct, offset }]
  })
  const match = matches.find(({ block }) => block.id === preferredId)
    ?? matches.find((item) => item.sectionIndex === currentSection && item.direct)
    ?? matches.find((item) => item.direct)
    ?? matches.find((item) => item.sectionIndex === currentSection)
    ?? matches[0]
  if (!match) return
  return { blockId: match.block.id, sectionIndex: match.sectionIndex,
    page: Number(match.block.title.match(/^PDF 第 (\d+) 页$/)?.[1]) || null,
    text: match.direct ? quote : needle.slice(0, match.text.length - match.offset) }
}
