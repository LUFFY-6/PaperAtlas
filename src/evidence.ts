import type { Paper } from './papers.ts'
import { readerSections } from './sections.ts'

export type Located = { blockId: string; page: number | null; text: string; sectionIndex: number; pageOffset?: number }
const normalized = (value: string) => value.replace(/\s/gu, '')

function sourceSlice(text: string, offset: number, length: number) {
  let normalizedIndex = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (/\s/u.test(text[i])) continue
    if (normalizedIndex === offset) start = i
    if (normalizedIndex === offset + length - 1) return text.slice(start, i + 1)
    normalizedIndex++
  }
  return text.slice(start)
}

export function locateQuote(paper: Paper, quote: string, currentSection?: number, preferredId?: string): Located | undefined {
  const needle = normalized(quote)
  if (!needle) return
  const blocks = readerSections(paper.blocks).flatMap((section, sectionIndex) =>
    section.blocks.map((block) => ({ block, sectionIndex, text: normalized(block.text) })))
  const matches = blocks.flatMap((entry, index) => {
    const directOffset = entry.text.indexOf(needle)
    const direct = directOffset >= 0
    const offset = direct ? directOffset : (entry.text + blocks.slice(index + 1, index + 3).map(({ text }) => text).join('')).indexOf(needle)
    if (!direct && (offset < 0 || offset >= entry.text.length)) return []
    return [{ ...entry, direct, offset, index }]
  })
  const match = matches.find(({ block }) => block.id === preferredId)
    ?? matches.find((item) => item.sectionIndex === currentSection && item.direct)
    ?? matches.find((item) => item.direct)
    ?? matches.find((item) => item.sectionIndex === currentSection)
    ?? matches[0]
  if (!match) return
  const page = Number(match.block.title.match(/^PDF 第 (\d+) 页$/)?.[1]) || null
  let pageOffset: number | undefined
  if (page) {
    const pageText = normalized(paper.blocks.find(({ title }) => title === match.block.title)?.text ?? '')
    let next = 0
    for (let i = 0; i <= match.index; i++) {
      const entry = blocks[i]
      if (entry.block.title !== match.block.title) continue
      const start = pageText.indexOf(entry.text, next)
      if (start < 0) break
      next = start + entry.text.length
      if (i === match.index) pageOffset = start + match.offset
    }
  }
  return { blockId: match.block.id, sectionIndex: match.sectionIndex,
    page, pageOffset,
    text: sourceSlice(match.block.text, match.offset, Math.min(needle.length, match.text.length - match.offset)) }
}
