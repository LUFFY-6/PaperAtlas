import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { modelFetch } from './modelStatus'
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, Circle, List, Sparkles } from 'lucide-react'
import type { Connection } from './ModelSettings'
import { disciplineLabel, readingStyles, type Paper, type ReadingStyle } from './papers'
import { readerSections, readingSections } from './sections'
import { locateQuote } from './evidence'
import { PdfOriginal, TextOriginal, WordOriginal } from './Original'
import { loadReading, saveReading } from './storage'
import { api } from './Workspace'
import { lessonTerms, paragraphEvidence, reviewBlocks, type Explanation, type Lesson, type PreparedReading } from './lessons'
import { paperChatText, type PaperChatMode } from './paperChat'
import { LessonText } from './LessonText'
import { buildPersona, guestProfile, type Profile } from './persona'

type Thread = { id: string; sectionId: string; scope: 'section' | 'paper'; question: string; answer: string; quote?: string; at: number; model?: string }

export function DeepReader({ paper, model, connection, openSettings, owner, style, onSection, visible, profile, initialSection }: {
  paper: Paper; owner: string; model: string; connection: Connection | null; openSettings: () => void; style: ReadingStyle; onSection: (id: string) => void; visible: boolean
  profile?: Profile; initialSection?: string
}) {
  const [sections] = useState(() => readerSections(paper.blocks))
  const [index, setIndex] = useState(() => Math.max(0, sections.findIndex(({ title }) => initialSection && title.toLowerCase().includes(initialSection.toLowerCase()))))
  const [lessons, setLessons] = useState<Record<string, Lesson>>({})
  const [prepared, setPrepared] = useState<PreparedReading>()
  const [review, setReview] = useState<Explanation>()
  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [working, setWorking] = useState('')
  const [evidence, setEvidence] = useState<{ id: string; quote: string; pageOffset?: number; request: number }>()
  const [locateError, setLocateError] = useState('')
  const [sectionLocation, setSectionLocation] = useState(0)
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const [textView, setTextView] = useState(false)
  const [selection, setSelection] = useState('')
  const [selectionBox, setSelectionBox] = useState<DOMRect>()
  const [lookup, setLookup] = useState<{ loading?: boolean; reply?: string; error?: string }>({})
  const lookupRequest = useRef<AbortController | null>(null)
  const lookupPanel = useRef<HTMLDivElement>(null)
  const [threads, setThreads] = useState<Thread[]>([])
  const [question, setQuestion] = useState('')
  const [scope, setScope] = useState<'section' | 'paper'>('section')
  const [paperMode, setPaperMode] = useState<PaperChatMode>('full')
  const [retry, setRetry] = useState<{ question: string; quote?: string; scope: 'section' | 'paper' }>()
  const questionInput = useRef<HTMLTextAreaElement>(null)
  const [asking, setAsking] = useState(false)
  const [questionError, setQuestionError] = useState('')
  const followup = useRef<AbortController | null>(null)
  const originalPanel = useRef<HTMLElement>(null)
  const [pdfPage, setPdfPage] = useState<number>()
  const job = useRef<AbortController | null>(null)
  const quote = useRef<HTMLElement | null>(null)
  const showingReview = index === sections.length
  const section = sections[Math.min(index, sections.length - 1)]
  const currentLessons = { ...prepared?.lessons, ...lessons }
  const currentReview = review ?? prepared?.review
  const persona = buildPersona(profile ?? guestProfile())
  const pages = [...new Set(section.blocks.flatMap(({ title }) => {
    const page = title.match(/^PDF 第 (\d+) 页$/)
    return page ? [Number(page[1])] : []
  }))]
  const page = pdfPage ?? pages[0] ?? 1
  const sectionPageText = sectionLocation ? section.blocks.filter(({ title }) => title === `PDF 第 ${page} 页`).map(({ text }) => text).join('\n') : undefined
  const originalFormat = !!paper.original && ['PDF', 'DOCX', 'MD', 'TXT'].includes(paper.format ?? '')
  const sectionAnchor = section.blocks[0]?.text.slice(0, 60)
  const isComplete = (item: typeof section) => item.batches.every(([first]) => currentLessons[first.id])
  const countable = sections.filter((item) => !item.kind)
  const completed = countable.filter(isComplete).length
  const hasLessons = countable.some((item) => item.batches.some(([first]) => currentLessons[first.id]))
  const sectionError = section.batches.map(([first]) => errors[first.id]).find(Boolean)

  useEffect(() => () => { job.current?.abort(); followup.current?.abort() }, [connection, model, style])
  useEffect(() => { if (!visible) followup.current?.abort() }, [visible])
  const clearSelection = useCallback(() => {
    lookupRequest.current?.abort()
    lookupRequest.current = null
    setSelection('')
    setSelectionBox(undefined)
    setLookup({})
  }, [])
  useEffect(() => {
    clearSelection()
    return () => lookupRequest.current?.abort()
  }, [clearSelection, index, page, textView, sectionLocation, visible, model, connection])
  useEffect(() => {
    if (!selectionBox) return
    function dismiss(event: Event) {
      if (event.target instanceof Node && lookupPanel.current?.contains(event.target)) return
      if (event.type === 'pointerdown' && event.target instanceof Element && event.target.closest('.paper-questions')) return
      clearSelection()
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') clearSelection()
    }
    function trackSelection(event: Event) {
      if (event.target instanceof Node && lookupPanel.current?.contains(event.target)) return
      const selected = window.getSelection()
      if (!selected?.rangeCount || selected.isCollapsed || !originalPanel.current?.contains(selected.anchorNode)) {
        clearSelection()
        return
      }
      const rects = selected.getRangeAt(0).getClientRects()
      const box = rects[rects.length - 1]
      const pane = originalPanel.current.getBoundingClientRect()
      if (!box || box.bottom <= Math.max(0, pane.top) || box.top >= Math.min(window.innerHeight, pane.bottom)) clearSelection()
      else setSelectionBox(box)
    }
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('scroll', trackSelection, true)
    window.addEventListener('resize', dismiss)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('scroll', trackSelection, true)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('keydown', escape)
    }
  }, [selectionBox, clearSelection])
  useEffect(() => { onSection(section.id) }, [onSection, section.id])
  useEffect(() => {
    const target = quote.current
    const pane = originalPanel.current
    if (evidence && target && pane) {
      target.focus({ preventScroll: true })
      pane.scrollTop += target.getBoundingClientRect().top - pane.getBoundingClientRect().top - 24
    }
  }, [evidence, textView])
  useEffect(() => {
    let alive = true
    void loadReading<{ index: number; sectionId?: string; lessons: Record<string, Lesson>; review?: Explanation; threads?: Thread[] }>(paper.id, owner).then((saved) => {
      if (alive && saved) {
        const legacy = readingSections(paper.blocks)
        const id = saved.sectionId ?? (saved.index === legacy.length ? 'review' : legacy[saved.index]?.id)
        if (!initialSection) setIndex(id === 'review' ? sections.length : Math.max(0, sections.findIndex((item) => id && item.sourceIds.includes(id))))
        setLessons(saved.lessons)
        setReview(saved.review)
        setThreads(saved.threads?.slice(-50) ?? [])
      }
    }).catch(() => { if (alive) setStorageError(true) }).finally(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [paper.id, sections.length, owner, initialSection])
  useEffect(() => {
    if (ready) void saveReading(paper.id, { index, sectionId: showingReview ? 'review' : section.id, completed, total: countable.length, lessons, review, threads }, owner).catch(() => setStorageError(true))
  }, [ready, paper.id, index, lessons, review, owner, completed, countable.length, section.id, showingReview, threads])
  useEffect(() => {
    if (!paper.url) return
    const controller = new AbortController()
    setPrepared(undefined)
    void api<PreparedReading>('/api/library/' + paper.id + '/reading', undefined, controller.signal).then((data) => {
      if (!data.lessons || controller.signal.aborted) return
      const matchingLessons: Record<string, Lesson> = {}
      const validEvidence = (entry: Explanation, blocks: Paper['blocks']) =>
        entry.evidence.length > 0 && entry.evidence.every((ref) => blocks.some((block) => block.id === ref.id && block.text.includes(ref.quote)))
      for (const item of sections) {
        for (const batch of item.batches) {
          const key = batch[0].id
          if (data.lessons[key] && validEvidence(data.lessons[key], batch)) matchingLessons[key] = data.lessons[key]
        }
      }
      const matchingReview = data.review && validEvidence(data.review, sections.flatMap((item) => item.blocks)) ? data.review : undefined
      setPrepared({ lessons: matchingLessons, review: matchingReview })
    }).catch(() => {})
    return () => controller.abort()
  }, [paper.id, paper.url, sections])

  function select(next: number) {
    followup.current?.abort()
    followup.current = null
    setAsking(false)
    setQuestion('')
    setRetry(undefined)
    setIndex(next)
    setEvidence(undefined)
    setSectionLocation(0)
    setPdfPage(undefined)
    clearSelection()
    setQuestionError('')
    setLocateError('')
  }

  function jumpToQuote(text: string, preferredId?: string) {
    setSectionLocation(0)
    const located = locateQuote(paper, text, showingReview ? undefined : index, preferredId)
    if (!located || preferredId && located.blockId !== preferredId) {
      setEvidence(undefined)
      setLocateError('未能在原文中找到这条引文，请核对提取文本。')
      return
    }
    if (showingReview || index !== located.sectionIndex) select(located.sectionIndex)
    setLocateError('')
    setPdfPage(located.page ?? undefined)
    setTextView(false)
    setEvidence((previous) => ({ id: located.blockId, quote: located.text, pageOffset: located.pageOffset, request: (previous?.request ?? 0) + 1 }))
  }

  function frameSection() {
    setEvidence(undefined)
    setLocateError('')
    setSectionLocation((value) => value + 1)
    setPdfPage(pages[0])
    setTextView(paper.format !== 'PDF')
    if (originalPanel.current) originalPanel.current.scrollTop = 0
  }

  const selectText = useCallback((text: string, box?: DOMRect) => {
    clearSelection()
    setSelection(text.trim().slice(0, 1600))
    setSelectionBox(box)
  }, [clearSelection])

  function captureSelection(event: { target: EventTarget }) {
    if (!(event.target instanceof Node && originalPanel.current?.contains(event.target))) return
    const selected = window.getSelection()
    if (!selected?.anchorNode || !selected.focusNode || !originalPanel.current?.contains(selected.anchorNode)
      || !originalPanel.current.contains(selected.focusNode)) return
    if (!selected.isCollapsed && selected.rangeCount) {
      const rects = selected.getRangeAt(0).getClientRects()
      selectText(selected.toString(), rects[rects.length - 1])
    }
  }

  async function ask(value: string, selected?: string, targetScope = scope, isLookup = false) {
    const trimmed = value.trim()
    const request = isLookup ? lookupRequest : followup
    if (!trimmed || request.current || !ready) return
    if (!model) { openSettings(); return }
    const controller = new AbortController()
    request.current = controller
    if (isLookup) setLookup({ loading: true })
    else {
      setAsking(true)
      setQuestionError('')
      setRetry(undefined)
    }
    try {
      const previous = sections[index - 1]?.batches.map(([block]) => currentLessons[block.id]?.result ?? '').join('\n').slice(0, 500)
      const related = threads.filter((item) => item.sectionId === section.id && item.scope === targetScope)
      const { reply, model: used } = await api<{ reply: string; model: string }>('/api/chat', {
        field: paper.field, discipline: disciplineLabel(paper.field, paper.discipline), style, connection,
        scope: targetScope,
        paperContext: { title: paper.title.slice(0, 250), section: section.title.slice(0, 160),
          ...(targetScope === 'paper' ? paperChatText(paper.blocks, trimmed, paper.partial, paperMode)
            : { text: section.blocks.map(({ text }) => text).join('\n').slice(0, 4000) }),
          previous, quote: selected?.slice(0, 1600) },
        turns: [...(isLookup ? [] : related.slice(-4).flatMap((item) => [{ role: 'user', content: item.question }, { role: 'assistant', content: item.answer.slice(0, 3000) }])),
          { role: 'user', content: trimmed }],
      }, controller.signal)
      if (!controller.signal.aborted) {
        if (isLookup) setLookup({ reply })
        else {
          setThreads((items) => [...items, { id: crypto.randomUUID(), sectionId: section.id, scope: targetScope,
            question: trimmed, answer: reply, quote: selected, at: Date.now(), model: used }].slice(-50))
          clearSelection()
          setQuestion('')
        }
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        if (isLookup) setLookup({ error: (reason as Error).message })
        else { setQuestionError((reason as Error).message); setRetry({ question: trimmed, quote: selected, scope: targetScope }) }
      }
    } finally {
      if (request.current === controller) { request.current = null; if (!isLookup) setAsking(false) }
    }
  }

  async function generateReview(signal: AbortSignal, notes: Record<string, Lesson>) {
    setReviewError('')
    setReviewing(true)
    try {
      const noteLength = Math.min(430, Math.floor(10_000 / sections.length))
      const result = await api<Explanation>('/api/explain', {
        review: true, title: paper.title, field: paper.field, style, discipline: disciplineLabel(paper.field, paper.discipline),
        question: '', blocks: reviewBlocks(sections), connection,
        notes: sections.map((item) => ({
          section: item.title.slice(0, 120),
          findings: item.batches.flatMap(([first]) => notes[first.id] ? [notes[first.id].result + ' ' + notes[first.id].limits] : []).join(' ').slice(0, noteLength),
        })).filter(({ findings }) => findings).slice(0, 90),
      }, signal)
      if (!signal.aborted) setReview(result)
    } catch (reason) { if (!signal.aborted) setReviewError((reason as Error).message) }
    finally { setReviewing(false) }
  }

  async function generate(queue: typeof sections, includeReview = false, regenerate = false, paragraphs = false) {
    if (job.current || !model || !ready) return
    const controller = new AbortController()
    job.current = controller
    try {
      const notes = Object.fromEntries(countable.flatMap((item) => item.batches.flatMap(([first]) =>
        currentLessons[first.id] ? [[first.id, currentLessons[first.id]]] : [])))
      const pending = queue.flatMap((item) => item.batches
        .filter(([first]) => regenerate || !notes[first.id])
        .map((blocks) => ({ item, blocks })))
      for (const { item, blocks } of pending) {
        if (controller.signal.aborted) break
        const batchId = blocks[0].id
        setWorking(item.id)
        setErrors((previous) => ({ ...previous, [batchId]: '' }))
        const position = sections.indexOf(item)
        try {
          const previous = sections.slice(0, position).reverse().find((chapter) => !chapter.kind)?.batches
            .map(([block]) => notes[block.id]?.result ?? '').join('\n').slice(0, 300)
          const nextTitle = sections[position + 1]?.title.slice(0, 160)
          const evidenceBlocks = paragraphs ? paragraphEvidence(blocks) : blocks
          const response = await modelFetch('/api/explain', {
            method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
            body: JSON.stringify({
              deep: true, title: paper.title, field: paper.field, style, discipline: disciplineLabel(paper.field, paper.discipline), question: '', section: item.title.slice(0, 160),
              outline: sections.slice(Math.max(0, position - 2), position + 3).map(({ title }) => title.slice(0, 160)),
              blocks: evidenceBlocks, connection, previous, nextTitle, terms: lessonTerms(notes),
            }),
          })
          const output = await response.json()
          if (!response.ok) throw new Error(output.error || '这节讲解失败。')
          if (!controller.signal.aborted) {
            if (evidenceBlocks !== blocks) output.evidence = output.evidence.map((ref: Lesson['evidence'][number]) => ({ ...ref, id: blocks[0].id }))
            notes[batchId] = output
            setLessons((previous) => ({ ...previous, [batchId]: output }))
          }
        } catch (reason) {
          if (!controller.signal.aborted) setErrors((previous) => ({
            ...previous, [batchId]: reason instanceof Error ? reason.message : '这节讲解失败。',
          }))
          return
        }
      }
      if (includeReview && !controller.signal.aborted && !currentReview) {
        await generateReview(controller.signal, notes)
        if (!controller.signal.aborted) select(sections.length)
      }
    } finally {
      job.current = null
      setWorking('')
    }
  }

  return <section className="deep-reader" aria-label="原文对照精读">
    <div className="reading-controls">
        <div><strong>精读进度</strong><span>{completed} / {countable.length} 节</span>
        <progress aria-label="精读进度" value={completed} max={Math.max(1, countable.length)} /></div>
      <div className="reading-actions">
        {working || reviewing ? <button className="secondary" onClick={() => job.current?.abort()}>取消生成</button>
          : completed === countable.length && currentReview ? <button className="secondary" disabled={showingReview} onClick={() => select(sections.length)}>
            <Sparkles size={16} /> 查看全文回顾
          </button>
          : model ? <button className="primary" disabled={!ready} onClick={() => void generate(countable, true)}>
            <Sparkles size={16} />{completed === countable.length ? '生成全文回顾' : hasLessons ? '继续精读' : '生成全文讲解'}
          </button> : completed < countable.length && <button className="primary" onClick={openSettings}>连接模型</button>}
      </div>
    </div>
    {storageError && <p className="warning" role="status">阅读进度可能未保存，请检查浏览器存储。</p>}
    <div className="reading-status" aria-live="polite">
      {reviewing ? '正在整理全文回顾…' : working ? <><span className="reading-spinner" aria-hidden="true" /> 正在讲解 {sections.find((item) => item.id === working)?.title}</>
        : completed === countable.length ? '全部可提取章节已完成。' : prepared ? '已有的学习库讲解可直接阅读。'
          : model ? `开始生成后，${model} 将逐节收到论文文字。` : '连接后即可生成精读讲解。'}
    </div>
    <div className="reading-grid">
      <nav className="reading-outline" aria-label="章节目录">
        <h2><List size={16} /> 章节目录</h2>
        {sections.map((item, i) => <button key={item.id} aria-current={index === i ? 'step' : undefined} onClick={() => select(i)}>
          {item.kind ? <small className="subtle">{item.kind === 'references' ? '文献' : '题录'}</small> : isComplete(item) ? <Check size={14} aria-label="已完成" /> : <Circle size={11} aria-hidden="true" />}
          <span>{item.title}</span>
        </button>)}
        <button aria-current={showingReview ? 'step' : undefined} onClick={() => select(sections.length)}><Sparkles size={14} /> 全文回顾</button>
      </nav>
      {showingReview ? <section className="reading-chapter whole-review"><h2>全文回顾</h2>
        {locateError && <p className="warning" role="status">{locateError}</p>}
        {currentReview && <div className="chat-bubble assistant lesson-bubble"><dl>
          {([['全文主线', currentReview.explanation], ['局限与研究痛点', currentReview.limits], ['研究想法与验证', currentReview.example]] as const)
            .map(([label, text]) => <div key={label}><dt>{label}</dt><dd><LessonText text={text} /></dd></div>)}
          </dl></div>}
        {reviewError && <p className="warning" role="alert">{reviewError}</p>}
        {!currentReview && <p className="subtle">回顾会综合按章节取样的原文和已有讲解，区分论文结论与待验证的想法。</p>}
        {model ? <button className="secondary" disabled={!!working || reviewing || !ready} onClick={() => {
          if (job.current) return
          const controller = new AbortController()
          job.current = controller
          void generateReview(controller.signal, currentLessons).finally(() => { job.current = null })
        }}>{currentReview ? `按${readingStyles[style]}风格重新回顾` : '生成全文回顾'}</button>
          : !currentReview && <button className="secondary" onClick={openSettings}>连接模型</button>}
      </section> : <div className="reading-chapter">
        <header className="chapter-heading"><h2>{section.title}</h2><span>第 {index + 1} / {sections.length} 节</span></header>
        <div className="reading-pair">
          <article className="reading-original" aria-label="原文滚动区" tabIndex={0} ref={originalPanel}
            onPointerUp={captureSelection} onKeyUp={(event) => { if (event.shiftKey) captureSelection(event) }}
            onKeyDown={(event) => {
              if (event.key !== 'Tab' || event.shiftKey || !event.currentTarget.contains(event.target as Node)) return
              const action = lookupPanel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
              if (action) { event.preventDefault(); action.focus() }
            }}>
            <h3><BookOpen size={16} /> 原文</h3>
            {evidence && <p className="subtle active-citation">{paper.format === 'PDF' ? `第 ${page} 页 · ` : ''}<q>{evidence.quote}</q></p>}
            {locateError && <p className="warning" role="status">{locateError} <button onClick={() => setLocateError('')}>关闭</button></p>}
            {originalFormat && <div className="original-tools">
              <button className="secondary" aria-pressed={!textView} onClick={() => setTextView(false)}>原版</button>
              <button className="secondary" aria-pressed={textView} onClick={() => setTextView(true)}>引用文本</button>
              {paper.pdfUrl && <a href={paper.pdfUrl + (paper.format === 'PDF' ? `#page=${page}` : '')} target="_blank" rel="noreferrer" download={paper.format !== 'PDF' ? paper.title + '.' + paper.format?.toLowerCase() : undefined}>{paper.format === 'PDF' ? '打开原件' : '下载原件'} <ArrowUpRight size={12} /></a>}
            </div>}
            {visible && selection && selectionBox && createPortal(
              <div className="selection-lookup" ref={lookupPanel} role="region" aria-label="划词查询"
                data-above={selectionBox.bottom > window.innerHeight / 2}
                style={{
                  left: Math.max(8, Math.min(selectionBox.left, window.innerWidth - Math.min(window.innerWidth - 16, 320) - 8)),
                  top: selectionBox.bottom > window.innerHeight / 2 ? selectionBox.top - 8 : selectionBox.bottom + 8,
                }}>
                <div className="selection-lookup-tools">
                  <button className="secondary" disabled={!ready || lookup.loading || !!lookup.reply}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void ask('用中文简短解释选中的词、短语或句子在这里的意思。外文给出贴合语境的译法，有必要时补充术语含义。', selection, 'section', true)}>
                    {lookup.loading ? '查询中…' : lookup.error ? '重试查询' : '划词查询'}
                  </button>
                  <button className="icon-button" aria-label="关闭划词查询" onClick={clearSelection}>×</button>
                </div>
                <div aria-live="polite">
                  {lookup.reply && <p><LessonText text={lookup.reply} /></p>}
                  {lookup.error && <p className="warning">{lookup.error}</p>}
                </div>
              </div>, document.body)}
            {!textView && paper.original && paper.format === 'PDF' && <>
              <div className="original-tools"><label>PDF 页码 <select value={page} onChange={(event) => { setPdfPage(Number(event.target.value)); setEvidence(undefined) }}>{pages.map((n) => <option key={n}>{n}</option>)}</select></label>
              </div>
              <PdfOriginal original={paper.original} page={page} quote={evidence?.quote} quoteOffset={evidence?.pageOffset}
                sectionText={sectionPageText} locationRequest={sectionLocation || evidence?.request} />
            </>}
            {!textView && paper.original && paper.format === 'DOCX' && <WordOriginal original={paper.original} quote={evidence?.quote} anchor={sectionAnchor} onSelection={selectText} />}
            {!textView && paper.original && ['MD', 'TXT'].includes(paper.format ?? '') && <TextOriginal original={paper.original} quote={evidence?.quote} anchor={sectionAnchor} />}
            {(textView || !originalFormat) && <div className={sectionLocation ? 'reading-section-frame' : undefined}>{section.blocks.map((block) => {
              const match = evidence?.id === block.id ? block.text.indexOf(evidence.quote) : -1
              return <div className="reading-passage" key={block.id}><div className="passage-label">
                {paper.pdfUrl && paper.format === 'PDF' ? <a href={`${paper.pdfUrl}#page=${block.title.match(/\d+/)?.[0] ?? '1'}`} target="_blank" rel="noreferrer">{block.title} <ArrowUpRight size={12} /></a> : block.title}
              </div><p>{match >= 0 && evidence ? <>{block.text.slice(0, match)}<mark tabIndex={-1} ref={quote}>{evidence.quote}</mark>{block.text.slice(match + evidence.quote.length)}</> : block.text}</p></div>
            })}</div>}
          </article>
          <article className="reading-lesson" aria-label="讲解滚动区" tabIndex={0}>
            <h3><Sparkles size={16} /> 对照讲解</h3>
            {section.kind !== 'frontmatter' && <div className="quote-links">
              <button type="button" aria-pressed={sectionLocation > 0} onClick={frameSection}>定位原文</button>
              {sectionLocation > 0 && !textView && paper.format === 'PDF' && pages.length > 1 && <>
                <button type="button" disabled={page === pages[0]} onClick={() => setPdfPage(pages[pages.indexOf(page) - 1])}>上一页</button>
                <span className="subtle">第 {page} 页</span>
                <button type="button" disabled={page === pages.at(-1)} onClick={() => setPdfPage(pages[pages.indexOf(page) + 1])}>下一页</button>
              </>}
            </div>}
            {sectionError && <p role="alert" className="warning">{sectionError}</p>}
            {sectionError?.includes('原文引用不足') && <button className="secondary" disabled={!!working || reviewing} onClick={() => void generate([section], false, true, true)}>按段落重新讲解</button>}
            {section.batches.map(([first], batchIndex) => {
              const lesson = currentLessons[first.id]
              if (!lesson) return null
              return <div className="chat-bubble assistant lesson-bubble" key={first.id} title={persona.label}>
              {section.batches.length > 1 && <h4>本节第 {batchIndex + 1} 部分</h4>}
              <p className="lesson-model">Paper Atlas · {lesson.model} · 引文已核对</p>
              <dl>{([
                ['为什么这么做', lesson.why], ['作者是怎么做的', lesson.explanation], ['本节结果与作用', lesson.result],
                ['举例或推演', lesson.example], ['证据边界', lesson.limits],
              ] as const).map(([title, text]) => <div key={title}><dt>{title}</dt><dd><LessonText text={text} /></dd></div>)}</dl>
              </div>
            })}
            {section.kind && <p className="subtle">{section.kind === 'references' ? '参考文献可在左侧原文查看。' : '本节为作者、题录或版权信息。'}</p>}
            {!section.kind && isComplete(section) && model && <button className="secondary" disabled={!!working || reviewing} onClick={() => void generate([section], false, true)}>按{readingStyles[style]}风格重新讲解</button>}
            {!isComplete(section) && <div className="lesson-empty">
              <p>{working === section.id ? '正在阅读本节并核对引文。' : '生成后会在原文旁显示本节的动机、做法和结果。'}</p>
              {model && <button className="secondary" disabled={!ready || !!working || reviewing} onClick={() => void generate([section])}>
                {sectionError ? '重试本节' : section.batches.some(([first]) => lessons[first.id]) ? '继续本节' : '讲解本节'}
              </button>}
            </div>}
            <section className="paper-questions" aria-label="向 AI 提问">
              <div className="source-heading"><h3>向 AI 提问</h3>
                {!!threads.length && <button className="text-button" onClick={() => {
                  if (window.confirm('清空这篇论文保存的所有提问？')) { followup.current?.abort(); setThreads([]) }
                }}>清空对话</button>}
              </div>
              {threads.filter((item) => item.sectionId === section.id).map((item) => <div className="selection-thread" key={item.id}>
                <div className="chat-bubble user"><small>你 · {item.scope === 'paper' ? '全文' : '本节'}</small><p>{item.question}</p>
                  {item.quote && <button className="text-button" onClick={() => jumpToQuote(item.quote!)}>定位原文</button>}</div>
                <div className="chat-bubble assistant" title={persona.label}><small>Paper Atlas{item.model && <> · {item.model}</>}</small><p>{item.answer}</p></div>
              </div>)}
              <form onSubmit={(event) => { event.preventDefault(); void ask(question, selection || undefined) }}>
                <label className="question">范围<select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="section">本节</option><option value="paper">全文</option></select></label>
                {scope === 'paper' && <label className="question">发送范围<select value={paperMode} disabled={asking}
                  onChange={(event) => setPaperMode(event.target.value as PaperChatMode)}>
                  <option value="full">全文文字</option>
                  <option value="excerpts">相关段落</option>
                </select></label>}
                <label className="question">问题<textarea aria-label="向 AI 提问" ref={questionInput} rows={2} value={question} maxLength={1500} onChange={(event) => setQuestion(event.target.value)} /></label>
                <div className="quote-links">{['这一节在全文论证里起什么作用', selection ? `这里的「${selection.slice(0, 30)}」是什么意思` : '这里的关键术语是什么意思', '和上一节的差别在哪', '这个结论的证据够吗'].map((item) =>
                  <button key={item} type="button" disabled={!ready || asking} onClick={() => void ask(item, selection || undefined)}>{item}</button>)}</div>
                <div className="form-actions"><button className="primary" disabled={!question.trim() || !ready || asking}>{asking ? '正在回答…' : '发送问题'}</button>
                  {asking && <button type="button" className="secondary" onClick={() => followup.current?.abort()}>取消提问</button>}</div>
              </form>
              {questionError && <p role="alert" className="warning">{questionError} {retry && <button onClick={() => void ask(retry.question, retry.quote, retry.scope)}>重试</button>}</p>}
            </section>
          </article>
        </div>
        <button className="secondary mobile-paper-question" onClick={() => questionInput.current?.focus()}>向 AI 提问</button>
        <div className="chapter-nav"><button className="secondary" disabled={index === 0} onClick={() => select(index - 1)}><ArrowLeft size={15} /> 上一节</button>
          <button className="secondary" onClick={() => select(index + 1)}>{index === sections.length - 1 ? '全文回顾' : '下一节'} <ArrowRight size={15} /></button></div>
      </div>}
    </div>
  </section>
}
