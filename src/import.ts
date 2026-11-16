import type { Block, Field, Paper } from './papers'
import { openPdf } from './pdf'

function paperRecord(name: string, blocks: Block[], field: Field, format: string): Paper {
  const title = name.replace(/\.(pdf|docx|md|txt)$/i, '').trim().slice(0, 180) || '未命名论文'
  return { id: crypto.randomUUID(), short: title, title, author: '', year: '', venue: '', field, blocks, format }
}

export function makePaper(name: string, blocks: Block[], field: Field, format: string): Paper {
  const usable = blocks.filter((block) => block.text.trim())
  if (!usable.length) throw new Error('没有提取到文字。扫描版 PDF 可先转成带文字层的 PDF，或粘贴正文。')
  return paperRecord(name, usable, field, format)
}

export function textBlocks(text: string): Block[] {
  return text.trim().split(/\r?\n\s*\r?\n/).flatMap((part) => part.match(/[\s\S]{1,2400}/g) ?? [])
    .map((text, index) => ({ id: String(index + 1), title: `文段 ${index + 1}`, text: text.trim() }))
}

export async function findOriginal(file: File, papers: Paper[]) {
  const candidates = papers.filter((paper) => paper.original?.size === file.size)
  if (!candidates.length) return undefined
  const bytes = new Uint8Array(await file.arrayBuffer())
  for (const paper of candidates) {
    const original = new Uint8Array(await paper.original!.arrayBuffer())
    if (bytes.every((byte, i) => byte === original[i])) return paper
  }
}

export async function importPaper(file: File, field: Field): Promise<Paper> {
  const large = file.size > 24 * 1024 * 1024
  const format = file.name.split('.').pop()?.toLowerCase()
  if (format === 'pdf') {
    const original = { ...paperRecord(file.name, [], field, 'PDF'), original: file }
    if (large) return { ...original, pdfTextStatus: 'large' }
    let loading: Awaited<ReturnType<typeof openPdf>> | undefined
    try {
      loading = await openPdf(file)
      const pdf = await loading.promise
      const blocks: Block[] = []
      for (let n = 1; n <= pdf.numPages; n++) {
        const content = await pdf.getPage(n).then((page) => page.getTextContent()).catch(() => undefined)
        const text = content?.items.flatMap((item) => 'str' in item ? [item.str + (item.hasEOL ? '\n' : ' ')] : []).join('').trim() ?? ''
        blocks.push({ id: String(n), title: `PDF 第 ${n} 页`, text })
      }
      if (!blocks.some(({ text }) => text)) return { ...original, pdfTextStatus: 'no-text', pdfPages: pdf.numPages }
      const metadata = await pdf.getMetadata().catch(() => null)
      const title = (metadata?.info as { Title?: string } | undefined)?.Title
      const paper = makePaper(title || file.name, blocks, field, 'PDF')
      return { ...paper, partial: blocks.some((block) => !block.text), original: file }
    } catch (error) {
      return { ...original, pdfTextStatus: error instanceof Error && error.name === 'PasswordException' ? 'password' : 'unreadable' }
    } finally {
      await loading?.destroy().catch(() => {})
    }
  }
  if (large) throw new Error('文件超过 24 MB，请先缩小文件。')
  if (format === 'docx') {
    const mammoth = await import('mammoth')
    const output = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return { ...makePaper(file.name, textBlocks(output.value), field, 'DOCX'), original: file }
  }
  if (format === 'md' || format === 'txt') return { ...makePaper(file.name, textBlocks(await file.text()), field, format.toUpperCase()), original: file }
  throw new Error('请选择 PDF、DOCX、Markdown 或 TXT。')
}
