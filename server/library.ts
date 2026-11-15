import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { catalog } from '../src/catalog.ts'
import type { PreparedReading } from '../src/lessons.ts'

const maxPdf = 24 * 1024 * 1024

export async function libraryAvailability() {
  const [complete, partial] = await Promise.all([
    readdir(new URL('../study-guides/', import.meta.url)).catch((): string[] => []),
    readdir('.data/guide-jobs').catch((): string[] => []),
  ])
  return Object.fromEntries(catalog.map(({ id }) => [id, complete.includes(id + '.json') ? 'ready'
    : partial.includes(id + '.json') ? 'partial' : 'pending']))
}

export async function libraryReading(id: string): Promise<PreparedReading | null> {
  if (!catalog.some((paper) => paper.id === id)) return null
  try {
    return JSON.parse(await readFile(new URL(`../study-guides/${id}.json`, import.meta.url), 'utf8'))
  } catch {
    try {
      const lessons = JSON.parse(await readFile(`.data/guide-jobs/${id}.json`, 'utf8'))
      return Object.keys(lessons).length ? { lessons } : null
    } catch { return null }
  }
}

function validPdf(data: Buffer) {
  return data.subarray(0, 5).toString() === '%PDF-' && data.subarray(-4096).includes('%%EOF')
}

async function download(url: string, signal: AbortSignal) {
  const response = await fetch(url, { redirect: 'error', signal })
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > maxPdf) {
    await response.body?.cancel()
    throw Error('全文暂时无法取得')
  }
  const stream = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await stream.read()
    if (done) break
    size += value.length
    if (size > maxPdf) { await stream.cancel(); throw Error('全文超过大小上限') }
    chunks.push(value)
  }
  const data = Buffer.concat(chunks)
  if (!validPdf(data)) throw Error('来源没有返回完整 PDF')
  return data
}

export async function libraryPdf(id: string, res: ServerResponse): Promise<boolean> {
  const paper = catalog.find((item) => item.id === id)
  if (!paper) return false
  const cached = '.data/library/' + paper.id + '.pdf'
  let data = await readFile(cached).catch(() => null)
  if (!data || !validPdf(data)) {
    const urls = [paper.url]
    if (paper.alternatePdf) urls.unshift(paper.alternatePdf)
    else if (paper.venue === 'arXiv') urls.push(paper.url.replace('arxiv.org', 'export.arxiv.org'))
    const controller = new AbortController()
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(35_000)])
      data = await Promise.any(urls.map((url) => download(url, signal)))
    } finally {
      controller.abort()
    }
    const temporary = cached + '.' + randomUUID()
    try {
      await mkdir('.data/library', { recursive: true })
      await writeFile(temporary, data)
      await rename(temporary, cached)
    } catch {
      await unlink(temporary).catch(() => {})
    }
  }
  if (!res.destroyed) {
    res.writeHead(200, { 'content-type': 'application/pdf', 'cache-control': 'public, max-age=86400' })
    res.end(data)
  }
  return true
}
