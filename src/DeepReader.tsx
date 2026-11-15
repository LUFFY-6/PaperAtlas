import { useEffect, useRef, useState } from 'react'
import { modelFetch } from './modelStatus'
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, Circle, List, Sparkles } from 'lucide-react'
import type { Connection } from './ModelSettings'
import { disciplineLabel, readingStyles, type Paper, type ReadingStyle } from './papers'
import { readingBatches, readingSections } from './sections'
import { PdfOriginal, TextOriginal, WordOriginal } from './Original'
import { loadReading, saveReading } from './storage'
import { api } from './Workspace'
import { reviewBlocks, type Explanation, type Lesson, type PreparedReading } from './lessons'

export function DeepReader({ paper, model, connection, openSettings, owner, style }: {
  paper: Paper; owner: string; model: string; connection: Connection | null; openSettings: () => void; style: ReadingStyle
}) {
  const [sections] = useState(() => readingSections(paper.blocks).map((section) => ({
    ...section, batches: readingBatches(section.blocks),
  })))
  const [index, setIndex] = useState(0)
  const [lessons, setLessons] = useState<Record<string, Lesson>>({})
  const [prepared, setPrepared] = useState<PreparedReading>()
  const [review, setReview] = useState<Explanation>()
  const [reviewing, setReviewing] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [working, setWorking] = useState('')
  const [evidence, setEvidence] = useState<Lesson['evidence'][number]>()
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const [textView, setTextView] = useState(false)
  const [selection, setSelection] = useState('')
  const [followups, setFollowups] = useState<{ quote: string; reply: string; section: string }[]>([])
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
  const pages = [...new Set(section.blocks.flatMap(({ title }) => {
    const page = title.match(/^PDF 第 (\d+) 页$/)
    return page ? [Number(page[1])] : []
  }))]
  const page = pdfPage ?? pages[0] ?? 1
  const originalFormat = !!paper.original && ['PDF', 'DOCX', 'MD', 'TXT'].includes(paper.format ?? '')
  const sectionAnchor = section.blocks[0]?.text.slice(0, 60)
  const isComplete = (item: typeof section) => item.batches.every(([first]) => currentLessons[first.id])
  const completed = sections.filter(isComplete).length
  const hasLessons = Object.keys(currentLessons).length > 0
  const sectionError = section.batches.map(([first]) => errors[first.id]).find(Boolean)

  useEffect(() => () => { job.current?.abort(); followup.current?.abort() }, [connection, model, style])
  useEffect(() => { if (evidence) quote.current?.focus() }, [evidence])
  useEffect(() => {
    let alive = true
    void loadReading<{ index: number; lessons: Record<string, Lesson>; review?: Explanation }>(paper.id, owner).then((saved) => {
      if (alive && saved) {
        setIndex(Math.min(Math.max(saved.index, 0), sections.length))
        setLessons(saved.lessons)
        setReview(saved.review)
      }
    }).catch(() => { if (alive) setStorageError(true) }).finally(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [paper.id, sections.length, owner])
  useEffect(() => {
    if (ready) void saveReading(paper.id, { index, lessons, review }, owner).catch(() => setStorageError(true))
  }, [ready, paper.id, index, lessons, review, owner])
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
    setIndex(next)
    setEvidence(undefined)
    setPdfPage(undefined)
    setSelection('')
    setQuestionError('')
  }

  function captureSelection() {
    const selected = window.getSelection()
    if (!selected?.anchorNode || !selected.focusNode || !originalPanel.current?.contains(selected.anchorNode)
      || !originalPanel.current.contains(selected.focusNode)) return
    setSelection(selected.toString().trim().slice(0, 2200))
  }

  async function askSelection() {
    if (!selection || asking) return
    if (!model) { openSettings(); return }
    const controller = new AbortController()
    followup.current = controller
    setAsking(true)
    setQuestionError('')
    try {
      const { reply } = await api<{ reply: string }>('/api/chat', {
        field: paper.field, discipline: disciplineLabel(paper.field, paper.discipline), style, connection,
        turns: [{ role: 'user', content: '请详细讲解划选内容，说明它的含义、作者为何采用这个做法及其作用。有帮助时举一个具体的例子。论文资料：' +
          JSON.stringify({ title: paper.title, section: section.title, selection, context: section.blocks.find((block) => block.text.includes(selection))?.text.slice(0, 1600) }) }],
      }, controller.signal)
      setFollowups((items) => [...items, { quote: selection, reply, section: section.id }])
      setSelection('')
    } catch (reason) { if (!controller.signal.aborted) setQuestionError((reason as Error).message) }
    finally { setAsking(false) }
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

  async function generate(queue: typeof sections, includeReview = false, regenerate = false) {
    if (job.current || !model || !ready) return
    const controller = new AbortController()
    job.current = controller
    try {
      const notes = { ...currentLessons }
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
          const response = await modelFetch('/api/explain', {
            method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
            body: JSON.stringify({
              deep: true, title: paper.title, field: paper.field, style, discipline: disciplineLabel(paper.field, paper.discipline), question: '', section: item.title.slice(0, 160),
              outline: sections.slice(Math.max(0, position - 2), position + 3).map(({ title }) => title.slice(0, 160)),
              blocks, connection,
            }),
          })
          const output = await response.json()
          if (!response.ok) throw new Error(output.error || '这节讲解失败。')
          if (!controller.signal.aborted) {
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
      <div><strong>精读进度</strong><span>{completed} / {sections.length} 节</span>
        <progress aria-label="精读进度" value={completed} max={sections.length} /></div>
      <div className="reading-actions">
        {working || reviewing ? <button className="secondary" onClick={() => job.current?.abort()}>取消生成</button>
          : completed === sections.length && currentReview ? <button className="secondary" disabled={showingReview} onClick={() => select(sections.length)}>
            <Sparkles size={16} /> 查看全文回顾
          </button>
          : model ? <button className="primary" disabled={!ready} onClick={() => void generate(sections, true)}>
            <Sparkles size={16} />{completed === sections.length ? '生成全文回顾' : hasLessons ? '继续精读' : '生成全文讲解'}
          </button> : completed < sections.length && <button className="primary" onClick={openSettings}>连接模型</button>}
      </div>
    </div>
    {storageError && <p className="warning" role="status">阅读进度可能未保存，请检查浏览器存储。</p>}
    <div className="reading-status" aria-live="polite">
      {reviewing ? '正在整理全文回顾…' : working ? <><span className="reading-spinner" aria-hidden="true" /> 正在讲解 {sections.find((item) => item.id === working)?.title}</>
        : completed === sections.length ? '全部可提取章节已完成。' : prepared ? '已有的学习库讲解可直接阅读。'
          : model ? `开始生成后，${model} 将逐节收到论文文字。` : '连接后即可生成精读讲解。'}
    </div>
    <div className="reading-grid">
      <nav className="reading-outline" aria-label="章节目录">
        <h2><List size={16} /> 章节目录</h2>
        {sections.map((item, i) => <button key={item.id} aria-current={index === i ? 'step' : undefined} onClick={() => select(i)}>
          {isComplete(item) ? <Check size={14} aria-label="已完成" /> : <Circle size={11} aria-hidden="true" />}
          <span>{item.title}</span>
        </button>)}
        <button aria-current={showingReview ? 'step' : undefined} onClick={() => select(sections.length)}><Sparkles size={14} /> 全文回顾</button>
      </nav>
      {showingReview ? <section className="reading-chapter whole-review"><h2>全文回顾</h2>
        {currentReview && <div className="chat-bubble assistant lesson-bubble"><dl>
          {([['全文主线', currentReview.explanation], ['局限与研究痛点', currentReview.limits], ['研究想法与验证', currentReview.example]] as const)
            .map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text}</dd></div>)}
          </dl><div className="quote-links" aria-label="回顾引文">{currentReview.evidence.map((ref, i) => <button key={i} onClick={() => {
            const target = sections.findIndex((item) => item.blocks.some(({ id }) => id === ref.id))
            if (target < 0) return
            select(target)
            const block = sections[target].blocks.find(({ id }) => id === ref.id)
            setPdfPage(Number(block?.title.match(/^PDF 第 (\d+) 页$/)?.[1]) || undefined)
            setTextView(false); setEvidence(ref)
          }}>定位引文 {i + 1}</button>)}</div></div>}
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
          <article className="reading-original" ref={originalPanel} onMouseUp={captureSelection} onKeyUp={captureSelection}>
            <h3><BookOpen size={16} /> 原文</h3>
            {originalFormat && <div className="original-tools">
              <button className="secondary" aria-pressed={!textView} onClick={() => { setTextView(false); setEvidence(undefined) }}>原版</button>
              <button className="secondary" aria-pressed={textView} onClick={() => setTextView(true)}>引用文本</button>
              {paper.pdfUrl && <a href={paper.pdfUrl + (paper.format === 'PDF' ? `#page=${page}` : '')} target="_blank" rel="noreferrer" download={paper.format !== 'PDF' ? paper.title + '.' + paper.format?.toLowerCase() : undefined}>{paper.format === 'PDF' ? '打开原件' : '下载原件'} <ArrowUpRight size={12} /></a>}
            </div>}
            {selection && <button className="secondary selection-action" disabled={asking} onMouseDown={(event) => event.preventDefault()} onClick={() => void askSelection()}>{asking ? '正在讲解…' : '详细讲解选中文字'}</button>}
            {!textView && paper.original && paper.format === 'PDF' && <>
              <div className="original-tools"><label>PDF 页码 <select value={page} onChange={(event) => setPdfPage(Number(event.target.value))}>{pages.map((n) => <option key={n}>{n}</option>)}</select></label></div>
              <PdfOriginal original={paper.original} page={page} quote={evidence?.quote} />
            </>}
            {!textView && paper.original && paper.format === 'DOCX' && <WordOriginal original={paper.original} quote={evidence?.quote} anchor={sectionAnchor} onSelection={setSelection} />}
            {!textView && paper.original && ['MD', 'TXT'].includes(paper.format ?? '') && <TextOriginal original={paper.original} quote={evidence?.quote} anchor={sectionAnchor} />}
            {(textView || !originalFormat) && section.blocks.map((block) => {
              const match = evidence?.id === block.id ? block.text.indexOf(evidence.quote) : -1
              return <div className="reading-passage" key={block.id}><div className="passage-label">
                {paper.pdfUrl && paper.format === 'PDF' ? <a href={`${paper.pdfUrl}#page=${block.title.match(/\d+/)?.[0] ?? '1'}`} target="_blank" rel="noreferrer">{block.title} <ArrowUpRight size={12} /></a> : block.title}
              </div><p>{match >= 0 && evidence ? <>{block.text.slice(0, match)}<mark tabIndex={-1} ref={quote}>{evidence.quote}</mark>{block.text.slice(match + evidence.quote.length)}</> : block.text}</p></div>
            })}
          </article>
          <article className="reading-lesson">
            <h3><Sparkles size={16} /> 对照讲解</h3>
            {sectionError && <p role="alert" className="warning">{sectionError}</p>}
            {section.batches.map(([first], batchIndex) => {
              const lesson = currentLessons[first.id]
              if (!lesson) return null
              return <div className="chat-bubble assistant lesson-bubble" key={first.id}>
              {section.batches.length > 1 && <h4>本节第 {batchIndex + 1} 部分</h4>}
              <p className="lesson-model">{lesson.model} · 引文已核对</p>
              <dl>{([
                ['为什么这么做', lesson.why], ['作者是怎么做的', lesson.explanation], ['本节结果与作用', lesson.result],
                ['举例或推演', lesson.example], ['证据边界', lesson.limits],
              ] as const).map(([title, text]) => <div key={title}><dt>{title}</dt><dd>{text}</dd></div>)}</dl>
              <div className="quote-links" aria-label="原文引文">{lesson.evidence.map((ref, i) => <button key={i} onClick={() => {
                const cited = section.blocks.find((block) => block.id === ref.id)
                setPdfPage(Number(cited?.title.match(/^PDF 第 (\d+) 页$/)?.[1]) || undefined)
                setTextView(false)
                setEvidence({ ...ref })
              }}>定位引文 {i + 1}</button>)}</div>
              </div>
            })}
            {followups.filter((item) => item.section === section.id).map((item, i) => <div className="selection-thread" key={i}>
              <div className="chat-bubble user"><small>你划选了</small><p>{item.quote}</p></div>
              <div className="chat-bubble assistant"><small>Paper Atlas</small><p>{item.reply}</p></div>
            </div>)}
            {questionError && <p role="alert" className="warning">{questionError}</p>}
            {isComplete(section) && model && <button className="secondary" disabled={!!working || reviewing} onClick={() => void generate([section], false, true)}>按{readingStyles[style]}风格重新讲解</button>}
            {!isComplete(section) && <div className="lesson-empty">
              <p>{working === section.id ? '正在阅读本节并核对引文。' : '生成后会在原文旁显示本节的动机、做法和结果。'}</p>
              {model && <button className="secondary" disabled={!ready || !!working || reviewing} onClick={() => void generate([section])}>
                {sectionError ? '重试本节' : section.batches.some(([first]) => lessons[first.id]) ? '继续本节' : '讲解本节'}
              </button>}
            </div>}
          </article>
        </div>
        <div className="chapter-nav"><button className="secondary" disabled={index === 0} onClick={() => select(index - 1)}><ArrowLeft size={15} /> 上一节</button>
          <button className="secondary" onClick={() => select(index + 1)}>{index === sections.length - 1 ? '全文回顾' : '下一节'} <ArrowRight size={15} /></button></div>
      </div>}
    </div>
  </section>
}
