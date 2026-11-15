import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { PDFDocumentProxy, TextLayer } from 'pdfjs-dist'
import { openPdf } from './pdf'

function matchQuote(container: HTMLElement, quote: string) {
  const nodes: { node: Text; start: number; length: number }[] = []
  let text = ''
  const doc = container.ownerDocument
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  for (let next = walker.nextNode(); next; next = walker.nextNode()) {
    const node = next as Text
    const value = node.data.replace(/\s/gu, '')
    if (!value) continue
    nodes.push({ node, start: text.length, length: value.length })
    text += value
  }
  const search = quote.replace(/\s/gu, '')
  const start = text.indexOf(search)
  if (!search || start < 0) return
  function locate(index: number) {
    const { node, start: offset } = nodes.find(({ start, length }) => index < start + length)!
    let remaining = index - offset
    let cursor = 0
    while (cursor < node.length && (/\s/u.test(node.data[cursor]) || remaining-- > 0)) cursor++
    return { node, cursor }
  }
  const first = locate(start)
  const last = locate(start + search.length - 1)
  const range = doc.createRange()
  range.setStart(first.node, first.cursor)
  range.setEnd(last.node, last.cursor + 1)
  return range
}

export function PdfOriginal({ original, page: requestedPage, quote }: { original: Blob; page: number; quote?: string }) {
  const wrapper = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy>()
  const [width, setWidth] = useState(0)
  const [tint, setTint] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [render, setRender] = useState<{ page: number; ok: boolean; scale: number; unit: number }>()
  const [marks, setMarks] = useState<CSSProperties[]>([])
  const [near, setNear] = useState<{ source: number; quote: string; page?: number; dismissed?: boolean }>()
  const search = near?.source === requestedPage && near.quote === quote ? near : undefined
  const page = search?.page ?? requestedPage
  useEffect(() => {
    const element = wrapper.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let disposed = false
    let loading: Awaited<ReturnType<typeof openPdf>> | undefined
    void openPdf(original).then(async (task) => {
      if (disposed) { await task.destroy(); return }
      loading = task
      const document = await loading.promise
      if (!disposed) setPdf(document)
    }).catch(() => { if (!disposed) setLoadError(true) })
    return () => { disposed = true; void loading?.destroy().catch(() => {}) }
  }, [original])
  useEffect(() => {
    if (!pdf || !width) return
    let disposed = false
    let text: TextLayer | undefined
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined
    void Promise.all([pdf.getPage(page), import('pdfjs-dist')]).then(async ([current, { TextLayer }]) => {
      if (disposed || !canvas.current || !layer.current) return
      const scale = width / current.getViewport({ scale: 1 }).width
      const viewport = current.getViewport({ scale })
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1)
      const surface = canvas.current
      surface.width = Math.ceil(viewport.width * pixelRatio)
      surface.height = Math.ceil(viewport.height * pixelRatio)
      surface.style.height = viewport.height + 'px'
      layer.current.replaceChildren()
      text = new TextLayer({ textContentSource: current.streamTextContent(), container: layer.current, viewport })
      task = current.render({ canvas: surface, viewport, transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] })
      await Promise.all([task.promise, text.render()])
      if (!disposed) setRender({ page, ok: true, scale, unit: current.userUnit })
    }).catch(() => { if (!disposed) setRender({ page, ok: false, scale: 1, unit: 1 }) })
    return () => { disposed = true; text?.cancel(); task?.cancel() }
  }, [pdf, page, width])
  useEffect(() => {
    const element = layer.current
    const range = quote && element && render?.ok && render.page === page ? matchQuote(element, quote) : undefined
    if (!range || !element) {
      setMarks([])
      if (!render?.ok || render.page !== page || !quote || !pdf || search) return
      let active = true
      const wanted = quote.replace(/\s/gu, '')
      void (async () => {
        for (const adjacent of [requestedPage - 1, requestedPage + 1, requestedPage - 2, requestedPage + 2]) {
          if (adjacent < 1 || adjacent > pdf.numPages) continue
          const candidate = await (await pdf.getPage(adjacent)).getTextContent()
          const text = candidate.items.map((item) => 'str' in item ? item.str : '').join('').replace(/\s/gu, '')
          if (text.includes(wanted)) {
            if (active) setNear({ source: requestedPage, quote, page: adjacent })
            return
          }
        }
        if (active) setNear({ source: requestedPage, quote })
      })().catch(() => { if (active) setNear({ source: requestedPage, quote }) })
      return () => { active = false }
    }
    const box = element.getBoundingClientRect()
    const next = Array.from(range.getClientRects()).filter((rect) => rect.width && rect.height).map((rect) => ({
      left: rect.left - box.left, top: rect.top - box.top, width: rect.width, height: rect.height,
    }))
    setMarks(next)
    if (next.length) range.startContainer.parentElement?.scrollIntoView({ block: 'nearest' })
  }, [page, quote, render, pdf, requestedPage, search])
  const error = loadError || render?.page === page && !render.ok
  return <div className="pdf-original" ref={wrapper} data-tint={tint}>
    <div className="original-tools" aria-label="纸张显示">
      <button className="secondary" aria-pressed={!tint} onClick={() => setTint(false)}>原色</button>
      <button className="secondary" aria-pressed={tint} onClick={() => setTint(true)}>护眼</button>
    </div>
    {search && !search.dismissed && render?.page === page && !marks.length && <p className="warning" role="status">未能在此页高亮，引文来自第 {requestedPage} 页 <button onClick={() => setNear({ ...search, dismissed: true })}>关闭</button></p>}
    {error ? <p role="alert">原版暂时无法渲染，可打开原文件。</p> : render?.page !== page && <p role="status">正在渲染 PDF 第 {page} 页…</p>}
    <div className="pdf-surface" hidden={error || render?.page !== page} style={{
      '--scale-factor': render?.scale ?? 1, '--user-unit': render?.unit ?? 1,
      '--total-scale-factor': (render?.scale ?? 1) * (render?.unit ?? 1), '--scale-round-x': '1px', '--scale-round-y': '1px',
    } as CSSProperties}>
      <canvas ref={canvas} aria-label={`PDF 第 ${page} 页原版`} />
      <div className="textLayer" ref={layer} />
      {marks.map((style, index) => <mark className="pdf-citation" style={style} key={index} aria-hidden="true" />)}
    </div>
  </div>
}

type OriginalTextProps = { original: Blob; quote?: string; anchor?: string }

export function WordOriginal({ original, quote, anchor, onSelection }: OriginalTextProps & { onSelection?: (text: string) => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [html, setHtml] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => {
    let disposed = false
    void import('docx-preview').then(async ({ renderAsync }) => {
      const preview = document.implementation.createHTMLDocument()
      await renderAsync(original, preview.body, preview.head, {
        useBase64URL: true, renderAltChunks: false, ignoreLastRenderedPageBreak: false,
      })
      for (const link of preview.body.querySelectorAll('a[href]')) {
        if (!link.getAttribute('href')?.startsWith('#')) link.removeAttribute('href')
      }
      if (!disposed) setHtml(`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'">${preview.head.innerHTML}<style>:root{--page:#f7f4e9;--evidence:#ffd98a}body{margin:0;background:var(--page);color:#1c1e1b}.docx-wrapper{align-items:flex-start;padding:8px;background:var(--page)}::highlight(word-evidence){background:var(--evidence)}</style></head><body>${preview.body.innerHTML}</body></html>`)
    }).catch(() => { if (!disposed) setError(true) })
    return () => { disposed = true }
  }, [original])
  useEffect(() => {
    const element = frame.current
    const doc = loaded && element?.contentDocument
    if (!element || !doc) return
    const width = Math.max(0, ...Array.from(doc.querySelectorAll<HTMLElement>('section.docx'), (page) => page.offsetWidth))
    if (!width) return
    const fit = () => {
      doc.body.style.zoom = String(Math.min(1, Math.max(1, element.clientWidth - 32) / width))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [loaded])
  useEffect(() => {
    const doc = loaded && frame.current?.contentDocument
    if (!doc || !onSelection) return
    const capture = () => onSelection(doc.getSelection()?.toString().trim().slice(0, 2200) ?? '')
    doc.addEventListener('mouseup', capture)
    doc.addEventListener('keyup', capture)
    return () => { doc.removeEventListener('mouseup', capture); doc.removeEventListener('keyup', capture) }
  }, [loaded, onSelection])
  useEffect(() => {
    const doc = loaded && frame.current?.contentDocument
    if (!doc) return
    const target = quote || anchor
    const range = target && matchQuote(doc.body, target)
    if (!range) return
    const registry = (doc.defaultView as (Window & typeof globalThis) | null)?.CSS?.highlights
    if (quote && registry) registry.set('word-evidence', new Highlight(range))
    range.startContainer.parentElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    return () => { registry?.delete('word-evidence') }
  }, [loaded, quote, anchor])
  return error ? <p role="alert">无法预览 Word 文档，可下载原件。</p>
    : html ? <iframe className="word-original" data-tint="true" title="Word 原文版式" ref={frame} sandbox="allow-same-origin" srcDoc={html} onLoad={() => setLoaded(true)} />
      : <p role="status">正在渲染 Word 文档…</p>
}

export function TextOriginal({ original, quote, anchor }: OriginalTextProps) {
  const body = useRef<HTMLPreElement>(null)
  const [text, setText] = useState<string>()
  const [error, setError] = useState(false)
  useEffect(() => {
    let disposed = false
    void original.text().then((value) => { if (!disposed) setText(value) })
      .catch(() => { if (!disposed) setError(true) })
    return () => { disposed = true }
  }, [original])
  useEffect(() => {
    const target = quote || anchor
    const range = target && body.current && matchQuote(body.current, target)
    if (!range || !body.current) return
    if (quote && CSS.highlights) CSS.highlights.set('word-evidence', new Highlight(range))
    const rect = range.getBoundingClientRect()
    body.current.scrollTop += rect.top - body.current.getBoundingClientRect().top - 24
    return () => { CSS.highlights?.delete('word-evidence') }
  }, [text, quote, anchor])
  return error ? <p role="alert">暂时无法预览原文，可下载原件。</p>
    : text === undefined ? <p role="status">正在载入原文…</p>
      : <pre className="text-original" aria-label="原始文本" tabIndex={0} ref={body}>{text}</pre>
}
