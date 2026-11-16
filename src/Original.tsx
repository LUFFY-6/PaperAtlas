import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { PDFDocumentProxy, TextLayer } from 'pdfjs-dist'
import { openPdf } from './pdf'

function matchQuote(container: HTMLElement, quote: string, offset?: number, unique = false) {
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
  const firstMatch = text.indexOf(search)
  const start = offset !== undefined && text.startsWith(search, offset) ? offset
    : unique && firstMatch >= 0 && text.indexOf(search, firstMatch + 1) >= 0 ? -1 : firstMatch
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

export function PdfOriginal({ original, page, quote, quoteOffset, sectionText, locationRequest }: {
  original: Blob; page: number; quote?: string; quoteOffset?: number; sectionText?: string; locationRequest?: number
}) {
  const wrapper = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy>()
  const [width, setWidth] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [tint, setTint] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [render, setRender] = useState<{ page: number; ok: boolean; scale: number; unit: number; width: number }>()
  const [marks, setMarks] = useState<CSSProperties[]>([])
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
      const scale = width * zoom / 100 / current.getViewport({ scale: 1 }).width
      const viewport = current.getViewport({ scale })
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(12_000_000 / (viewport.width * viewport.height)))
      const surface = canvas.current
      surface.width = Math.ceil(viewport.width * pixelRatio)
      surface.height = Math.ceil(viewport.height * pixelRatio)
      surface.style.height = viewport.height + 'px'
      layer.current.replaceChildren()
      text = new TextLayer({ textContentSource: current.streamTextContent(), container: layer.current, viewport })
      task = current.render({ canvas: surface, viewport, transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] })
      await Promise.all([task.promise, text.render()])
      if (!disposed) setRender({ page, ok: true, scale, unit: current.userUnit, width: viewport.width })
    }).catch(() => { if (!disposed) setRender({ page, ok: false, scale: 1, unit: 1, width }) })
    return () => { disposed = true; text?.cancel(); task?.cancel() }
  }, [pdf, page, width, zoom])
  useEffect(() => {
    const element = layer.current
    const target = sectionText || quote
    const range = target && element && render?.ok && render.page === page
      ? matchQuote(element, target, sectionText ? undefined : quoteOffset, true) : undefined
    if (!range || !element) {
      setMarks([])
      return
    }
    const box = element.getBoundingClientRect()
    const groups: DOMRect[][] = []
    for (const rect of range.getClientRects()) {
      if (!rect.width || !rect.height) continue
      const last = groups.at(-1)?.at(-1)
      if (!last || rect.top < last.top - last.height || !sectionText && (rect.top > last.bottom + last.height
        || rect.left > last.right + last.height * 3 || rect.right < last.left - last.height * 3)) groups.push([])
      groups.at(-1)?.push(rect)
    }
    const padding = sectionText ? 9 : 2
    const frames = groups.map((rects) => ({
      left: Math.max(0, Math.min(...rects.map((rect) => rect.left)) - box.left - padding),
      top: Math.max(0, Math.min(...rects.map((rect) => rect.top)) - box.top - padding),
      right: Math.min(box.width, Math.max(...rects.map((rect) => rect.right)) - box.left + padding),
      bottom: Math.min(box.height, Math.max(...rects.map((rect) => rect.bottom)) - box.top + padding),
    }))
    setMarks(frames.map(({ left, top, right, bottom }) => ({ left, top, width: right - left, height: bottom - top })))
    const first = frames[0]
    const pane = element.closest<HTMLElement>('.reading-original')
    if (first && pane) {
      pane.scrollTop += box.top + first.top - pane.getBoundingClientRect().top - Math.min(70, pane.clientHeight / 5)
      const viewport = element.closest<HTMLElement>('.pdf-viewport')
      if (viewport) {
        const visible = viewport.getBoundingClientRect()
        if (box.left + first.left < visible.left || box.left + first.right > visible.right) {
          viewport.scrollLeft += box.left + first.left - visible.left - 12
        }
      }
    }
  }, [page, quote, quoteOffset, sectionText, render, locationRequest])
  const error = loadError || render?.page === page && !render.ok
  return <div className="pdf-original" ref={wrapper} data-tint={tint}>
    <div className="original-tools" role="group" aria-label="PDF 显示">
      <button className="secondary" aria-pressed={!tint} onClick={() => setTint(false)}>原色</button>
      <button className="secondary" aria-pressed={tint} onClick={() => setTint(true)}>护眼</button>
      <div className="pdf-zoom" role="group" aria-label="PDF 缩放">
        <button className="secondary" aria-label="缩小 PDF" disabled={zoom <= 50 || error} onClick={() => setZoom((value) => Math.max(50, value - 25))}>−</button>
        <button className="secondary" aria-label={`${zoom}%，恢复适宽`} title="恢复适宽" onClick={() => setZoom(100)}>{zoom}%</button>
        <button className="secondary" aria-label="放大 PDF" disabled={zoom >= 250 || error} onClick={() => setZoom((value) => Math.min(250, value + 25))}>+</button>
      </div>
    </div>
    {(sectionText || quote) && render?.ok && render.page === page && !marks.length && <p className="warning" role="status">第 {page} 页暂时无法准确框出{sectionText ? '本节原文' : '这段引文'}，可切换到「引用文本」核对。</p>}
    {error ? <p role="alert">原版暂时无法渲染，可打开原文件。</p> : render?.page !== page && <p role="status">正在渲染 PDF 第 {page} 页…</p>}
    <div className="pdf-viewport"><div className="pdf-surface" hidden={error || render?.page !== page} style={{
      width: render?.width,
      '--scale-factor': render?.scale ?? 1, '--user-unit': render?.unit ?? 1,
      '--total-scale-factor': (render?.scale ?? 1) * (render?.unit ?? 1), '--scale-round-x': '1px', '--scale-round-y': '1px',
    } as CSSProperties}>
      <canvas ref={canvas} aria-label={`PDF 第 ${page} 页原版`} />
      <div className="textLayer" ref={layer} />
      {marks.map((style, index) => <mark className={sectionText ? 'pdf-citation pdf-section-frame' : 'pdf-citation'} style={style} key={index} aria-hidden="true" />)}
    </div></div>
  </div>
}

type OriginalTextProps = { original: Blob; quote?: string; anchor?: string }

export function WordOriginal({ original, quote, anchor, onSelection }: OriginalTextProps & { onSelection?: (text: string, box?: DOMRect) => void }) {
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
    const element = frame.current
    const doc = loaded && element?.contentDocument
    if (!element || !doc || !onSelection) return
    const capture = () => {
      const selected = doc.getSelection()
      if (!selected || selected.isCollapsed || !selected.rangeCount) { onSelection(''); return }
      const rects = selected.getRangeAt(0).getClientRects()
      const rect = rects[rects.length - 1]
      const frameBox = element.getBoundingClientRect()
      if (rect) onSelection(selected.toString(), new DOMRect(
        frameBox.left + element.clientLeft + rect.left, frameBox.top + element.clientTop + rect.top, rect.width, rect.height))
    }
    const clear = () => onSelection('')
    doc.addEventListener('pointerup', capture)
    doc.addEventListener('keyup', capture)
    doc.addEventListener('scroll', clear, true)
    return () => { doc.removeEventListener('pointerup', capture); doc.removeEventListener('keyup', capture); doc.removeEventListener('scroll', clear, true) }
  }, [loaded, onSelection])
  useEffect(() => {
    const doc = loaded && frame.current?.contentDocument
    if (!doc) return
    const target = quote || anchor
    const range = target && matchQuote(doc.body, target)
    if (!range) return
    const registry = (doc.defaultView as (Window & typeof globalThis) | null)?.CSS?.highlights
    if (quote && registry) registry.set('word-evidence', new Highlight(range))
    const view = doc.defaultView
    if (view) view.scrollBy(0, range.getBoundingClientRect().top - 24)
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
