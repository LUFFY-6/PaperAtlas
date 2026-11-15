import type { Block } from './papers.ts'

export type ReadingSection = { id: string; title: string; blocks: Block[] }

const standardHeading = /^(?:abstract|摘要|introduction|引言|background|背景|related work|相关工作|materials and methods|methods?|方法|methodology|研究方法|(?:experimental )?results?|实验结果|结果|experiments?|实验|evaluation|评估|discussion|讨论|conclusions?|结论|limitations|局限性?|references|参考文献|appendix(?:\s+[a-z])?|附录)[：:．.]?$/iu
const numberedHeading = /^(?:\d+(?:[.．]\d+)+(?:[.．、]\s*|\s+)|\d+[.．]\s*)(\p{L}[^.!?。！？←→=]{1,90})$/u

function sectionTitle(line: string, markdown: boolean) {
  const text = line.trim()
  if (markdown && /^#{1,6}\s+\p{L}/u.test(text)) return text.replace(/^#{1,6}\s+/, '')
  if (standardHeading.test(text) || standardHeading.test(text.replace(/^\d+\s+/, ''))) return text
  const title = numberedHeading.exec(text)?.[1]
  // Bare line numbers are common in pseudocode; dotted headings still need a title.
  if (title && !/^(?:对每个|对于每个|若|否则|返回|令|for\b|if\b|else\b|return\b|while\b)/iu.test(title)) return text
}

export function readingSections(blocks: Block[]): ReadingSection[] {
  const sections: ReadingSection[] = []
  let section: ReadingSection | undefined
  for (const block of blocks) {
    let paragraph: string[] = []
    function append() {
      const text = paragraph.join('\n').trim()
      paragraph = []
      for (const piece of text.match(/[\s\S]{1,3800}/gu) ?? []) {
        if (!section) {
          section = { id: String(sections.length + 1), title: '篇首', blocks: [] }
          sections.push(section)
        }
        section.blocks.push({ id: `${section.id}-${section.blocks.length + 1}`, title: block.title, text: piece })
      }
    }
    for (const line of block.text.split('\n')) {
      const title = sectionTitle(line, !/^PDF 第 \d+ 页$/.test(block.title))
      if (title) {
        append()
        section = { id: String(sections.length + 1), title, blocks: [] }
        sections.push(section)
      }
      paragraph.push(line)
    }
    append()
  }
  if (sections.length === 1 && sections[0].title === '篇首') sections[0].title = '全文'
  return sections
}

export function readingBatches(blocks: Block[]): Block[][] {
  const batches: Block[][] = []
  let size = 0
  for (const block of blocks) {
    let batch = batches.at(-1)
    if (!batch || batch.length >= 5 || size + block.text.length > 4600) {
      batch = []
      batches.push(batch)
      size = 0
    }
    batch.push(block)
    size += block.text.length
  }
  return batches.filter((batch) => batch.some(({ text }) => text.trim().length >= 8))
}
