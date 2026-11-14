import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUpRight, BookOpen, Braces, ChevronRight, Columns3, FileText, FlaskConical, Layers3, Network, Plus, Search, Sparkles, X } from 'lucide-react'
import { AttentionLab, Comparisons, DashLab, Graph, WageLab } from './Labs'
import { fields, fieldPrompts, papers, type Field, type Paper, type Related } from './papers'

const tabs = [['read', '阅读与实验', BookOpen], ['compare', '方法对比', Columns3], ['graph', '论文关系', Network], ['source', '文段', FileText]] as const
type Tab = typeof tabs[number][0]
type Explanation = { explanation: string; example: string; limits: string; evidence: { id: string; quote: string }[]; model: string }

async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || '请求失败，请重试。')
  return body as T
}

export function App() {
  const [library, setLibrary] = useState(papers)
  const [paper, setPaper] = useState(papers[0])
  const [tab, setTab] = useState<Tab>('read')
  const [source, setSource] = useState(papers[0].blocks[1].id)
  const [quote, setQuote] = useState('')
  const [selected, setSelected] = useState('')
  const [filter, setFilter] = useState<Field | 'all'>('all')
  const [live, setLive] = useState(false)
  const [question, setQuestion] = useState('')
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [comparison, setComparison] = useState<Explanation | null>(null)
  const [comparisonId, setComparisonId] = useState('')
  const [doi, setDoi] = useState('')
  const [neighbors, setNeighbors] = useState<Related[]>([])
  const [referenceTitle, setReferenceTitle] = useState('')
  const [referenceStatus, setReferenceStatus] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const modal = useRef<HTMLDialogElement>(null)
  const [file, setFile] = useState<File>()
  const [importName, setImportName] = useState('')
  const [importText, setImportText] = useState('')
  const [importField, setImportField] = useState<Field>('other')
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState('')
  const request = useRef<AbortController | null>(null)
  const [scope, setScope] = useState<'single' | 'nearby'>('single')

  useEffect(() => { json<{ live: boolean }>('/api/config').then((info) => setLive(info.live)).catch(() => {}) }, [])

  function choose(next: Paper) {
    request.current?.abort()
    setPaper(next)
    setSource(next.blocks[next.id === 'transformer' ? 1 : 0].id)
    setQuote('')
    setTab('read')
    setSelected('')
    setNeighbors([])
    setReferenceTitle('')
    setDoi('')
    setReferenceStatus('')
    setQuestion('')
    setExplanation(null)
    setComparison(null)
    setComparisonId('')
    setBusy('')
    setError('')
  }

  function openImport() {
    setImportError('')
    setImportName('')
    setImportText('')
    setImportField('other')
    setFile(undefined)
    modal.current?.querySelector('form')?.reset()
    modal.current?.showModal()
  }

  async function addPaper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (importBusy) return
    setImportError('')
    setImportBusy(true)
    try {
      const { importPaper, makePaper, textBlocks } = await import('./import')
      if (!file && !importText.trim()) throw new Error('请选择文件或粘贴一段正文。')
      const next = file ? await importPaper(file, importField) : makePaper(importName, textBlocks(importText), importField, '粘贴文本')
      setLibrary((current) => [...current, next])
      setFilter('all')
      choose(next)
      modal.current?.close()
    } catch (reason) {
      setImportError(reason instanceof Error ? reason.message : '导入失败，请换一种格式。')
    } finally {
      setImportBusy(false)
    }
  }

  async function run<T>(label: string, operation: (signal: AbortSignal) => Promise<T>, onSuccess: (data: T) => void) {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(label)
    setError('')
    try {
      const data = await operation(controller.signal)
      if (!controller.signal.aborted) onSuccess(data)
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '请求失败，请重试。')
    } finally {
      if (request.current === controller) setBusy('')
    }
  }

  function explain(event: FormEvent) {
    event.preventDefault()
    const index = paper.blocks.findIndex((block) => block.id === source)
    const blocks = (scope === 'single' ? [paper.blocks[index]] : paper.blocks.slice(Math.max(0, index - 1), index + 2))
      .map((block) => ({ ...block, text: block.text.slice(0, 5000) }))
    void run('正在生成讲解并核对引文…', (signal) => json<Explanation>('/api/explain', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ title: paper.title, field: paper.field, question: question.trim(), blocks }),
    }), setExplanation)
  }

  function comparePapers(event: FormEvent) {
    event.preventDefault()
    const target = library.find((item) => item.id === comparisonId && item.id !== paper.id)
    if (!target) return
    const blocks = [
      { ...current, id: 'a', title: `论文 A · ${current.title}`, text: current.text.slice(0, 5000) },
      ...target.blocks.slice(0, 3).map((block, i) => ({
        ...block, id: `b${i}`, title: `论文 B · ${block.title}`, text: block.text.slice(0, 5000),
      })),
    ]
    void run('正在对照两篇论文的所选文段…', (signal) => json<Explanation>('/api/explain', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ title: '两篇论文的文段对比', field: paper.field, blocks, compare: true,
        question: `A：《${paper.title}》；B：《${target.title}》。用「讲解」对照研究问题、方法与证据，用「例子」说明一个具体差异。每篇至少引用一处支持对比的原文，缺少信息就在证据范围说明。`.slice(0, 500) }),
    }), setComparison)
  }

  function findReferences(event: FormEvent) {
    event.preventDefault()
    void run('正在读取 Crossref 的参考文献…', (signal) => json<{ title: string; count: number; works: { id: string; title: string; year: string }[] }>(
      '/api/references?' + new URLSearchParams({ doi }), { signal },
    ), (data) => {
      const works = data.works.map((work) => ({
        ...work, short: work.title, relation: '引用 · Crossref', url: `https://doi.org/${encodeURI(work.id)}`,
        problem: '', method: '', difference: `Crossref 将该文献列为《${data.title}》的参考文献。`,
      }))
      setNeighbors(works)
      setReferenceTitle(data.title)
      setSelected(works[0]?.id ?? '')
      setReferenceStatus(works.length ? `查询论文：${data.title} · 展示 ${works.length} 条参考文献 · 共 ${data.count} 条带 DOI 的参考文献`
        : `查询论文：${data.title} · 暂无可展示的参考文献，可尝试另一个 DOI。`)
    })
  }

  function openSource(id: string, text = '') {
    setSource(id)
    setQuote(text)
    setTab('source')
  }

  const current = paper.blocks.find((block) => block.id === source) ?? paper.blocks[0]
  const highlight = quote ? current.text.indexOf(quote) : -1
  const related = paper.related ?? []
  const list = filter === 'all' ? library : library.filter((item) => item.field === filter)
  const sameField = library.filter((item) => item.field === paper.field && item.id !== paper.id)

  return <>
    <header className="top"><a href="#" className="brand"><span><Layers3 size={19} /></span>Paper Atlas<small>论文图谱</small></a>
      <div className="top-actions"><span className="desktop-status"><span className="status-dot" /> 阅读工作台</span><button className="primary" onClick={openImport}><Plus size={17} /> 导入论文</button></div></header>
    <div className="shell">
      <aside className="library" aria-label="论文库">
        <div className="rail-heading"><BookOpen size={16} /><h2>论文库</h2><button className="icon-button push" aria-label="导入论文" onClick={openImport}><Plus size={16} /></button></div>
        <label className="field-filter">按照领域浏览<select value={filter} onChange={(event) => setFilter(event.target.value as Field | 'all')}>
          <option value="all">全部领域</option>{Object.entries(fields).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <div className="library-list">{list.map((item) => <button key={item.id} className={item.id === paper.id ? 'library-active' : ''} aria-current={item.id === paper.id ? 'true' : undefined} onClick={() => choose(item)}>
          <span className={`paper-icon ${item.field}`}>{item.field === 'cs' ? <Braces size={15} /> : item.field === 'medicine' ? <FlaskConical size={15} /> : <FileText size={15} />}</span>
          <span><strong>{item.short}</strong><small>{fields[item.field]}{item.year ? ` · ${item.year}` : ''}</small></span>
        </button>)}{!list.length && <p className="subtle">该领域还没有论文。</p>}</div>
        <div className="library-foot"><button onClick={openImport}><Plus size={15} /> 添加本地文献</button><small>PDF、DOCX、Markdown、TXT</small></div>
      </aside>
      <main>
        <div className="paper-header"><div className="paper-meta"><span className={`field-tag ${paper.field}`}>{fields[paper.field]}</span><span>{paper.format || `${paper.venue} · ${paper.year}`}</span></div>
          <h1>{paper.title}</h1>
          {paper.author && <div className="byline"><span>{paper.author}</span><a href={paper.url} target="_blank" rel="noreferrer">论文来源 <ArrowUpRight size={14} /></a></div>}
          {paper.partial && <p className="warning" role="status">已导入可提取文字的前 40 页。部分页面可能没有文字层。</p>}
        </div>
        <nav className="tabs" aria-label="论文阅读视图">{tabs.map(([id, label, Icon]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setError('') }}><Icon size={16} />{label}</button>)}</nav>
        <div className="feedback" aria-live="polite">{busy && <div className="notice" role="status">{busy}<button onClick={() => { request.current?.abort(); setBusy('') }}>取消</button></div>}{error && <div className="warning" role="alert">{error}</div>}</div>
        {tab === 'read' && <div className="tab-content">
          {paper.question ? <><h2>论文想解决什么？</h2><p className="lead">{paper.question}</p><p className="subtle method">{paper.method}</p>
            {paper.id === 'transformer' ? <AttentionLab /> : paper.id === 'dash' ? <DashLab /> : <WageLab />}</>
            : <><h2>按领域读这篇论文</h2><p className="lead">{fieldPrompts[paper.field]}</p><p className="subtle">从右侧选一页或一段，再生成讲解。</p></>}
          <section className="explain" aria-labelledby="ai-title"><h2 id="ai-title"><Sparkles size={18} /> AI 讲解</h2>
            <form onSubmit={explain}>
              <div className="explain-scope"><label>讲解范围 <select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="single">{current.title}</option><option value="nearby">当前文段及相邻文段</option></select></label></div>
              <label className="question">我的问题<input value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：这个方法为什么要这样设计？" /></label>
              <div className="form-actions"><span>{live ? '提交后发送所选文段给模型。' : '配置服务端模型密钥后可用。'}</span><button type="submit" className="primary" disabled={!live || !!busy}><Sparkles size={15} /> 生成讲解</button></div>
            </form>
            {explanation && <div className="ai-result"><div className="kicker">{explanation.model} · 引文已核对</div><h3>讲解</h3><p>{explanation.explanation}</p><h3>例子</h3><p>{explanation.example}</p><h3>证据范围</h3><p>{explanation.limits}</p>
              <div className="quote-links">{explanation.evidence.map((ref, i) => <button key={i} onClick={() => openSource(ref.id, ref.quote)}><FileText size={14} />{paper.blocks.find((block) => block.id === ref.id)?.title}</button>)}</div></div>}
          </section>
        </div>}
        {tab === 'compare' && <>
          {paper.related && <Comparisons paper={paper} onRelation={(id) => { setSelected(id); setTab('graph') }} />}
          <section className="tab-content"><h2>对比我的论文</h2>
            {sameField.length ? <form onSubmit={comparePapers}>
              <label className="question">同领域论文<select value={comparisonId} required onChange={(event) => { setComparisonId(event.target.value); setComparison(null) }}><option value="">选择一篇论文</option>
                {sameField.map((item) => <option key={item.id} value={item.id}>{item.short}</option>)}</select></label>
              <div className="form-actions"><span>将当前文段与所选论文的前 3 段发送给模型。</span><button className="primary" disabled={!live || !!busy}><Columns3 size={15} /> 对照讲解</button></div>
            </form> : <div className="empty">论文库中暂无同领域的另一篇论文。<button className="text-button" onClick={openImport}> 导入论文</button></div>}
            {comparison && <div className="ai-result"><h3>方法与证据</h3><p>{comparison.explanation}</p><h3>具体差异</h3><p>{comparison.example}</p><h3>证据范围</h3><p>{comparison.limits}</p>
              <ul>{comparison.evidence.map((ref, i) => <li key={i}>{ref.id === 'a' ? '论文 A' : '论文 B'} · {ref.quote}</li>)}</ul></div>}
          </section>
        </>}
        {tab === 'graph' && <div className="tab-content"><h2>论文关系网</h2><p className="subtle">{paper.related ? '预设关系已按参考文献或研究主题标注。' : '输入这篇论文的 DOI，以 Crossref 收录的参考文献建立关系。'}</p>
          {related.length > 0 && <Graph paper={paper} neighbors={related} selected={selected} setSelected={setSelected} />}
          <form className="lookup" onSubmit={findReferences}><label><span>查询论文 DOI</span><input value={doi} onChange={(event) => setDoi(event.target.value)} placeholder="10.xxxx/…" required maxLength={250} /></label><button className="secondary" disabled={!!busy}><Search size={15} /> 查询</button></form>
          {referenceStatus && <p className="subtle" role="status">{referenceStatus}</p>}
          {neighbors.length > 0 && <Graph paper={{ short: referenceTitle }} neighbors={neighbors} selected={selected} setSelected={setSelected} />}
          {!related.length && !referenceStatus && <div className="empty">查到参考文献后，点击节点可查看关系来源。</div>}
        </div>}
        {tab === 'source' && <div className="tab-content"><div className="source-heading"><h2>{current.title}</h2>{paper.url && <a href={paper.url} target="_blank" rel="noreferrer">查看论文 <ArrowUpRight size={15} /></a>}</div>
          {paper.url && <p className="subtle">预设阅读笔记 · 根据原文整理</p>}
          <blockquote>{highlight >= 0 ? <>{current.text.slice(0, highlight)}<mark>{quote}</mark>{current.text.slice(highlight + quote.length)}</> : current.text}</blockquote>
          <button className="secondary" onClick={() => setTab('read')}><Sparkles size={15} /> 讲解这个文段</button>
        </div>}
      </main>
      <aside className="evidence" aria-label="论文证据">
        <div className="rail-heading"><FileText size={16} /><h2>{paper.url ? '阅读笔记' : '原文位置'}</h2></div>
        <p className="subtle">{paper.url ? '按原文位置整理的预设笔记。' : '按文件提取的文字片段。'}</p>
        <div className="evidence-list">{paper.blocks.map((block) => <button key={block.id} className={source === block.id ? 'source-active' : ''} aria-current={source === block.id ? 'true' : undefined} onClick={() => openSource(block.id)}>
          <span>{block.title}</span><ChevronRight size={15} />
        </button>)}</div>
        {paper.related && <div className="rail-related"><div className="rail-heading"><Network size={16} /><h2>相关论文</h2></div>
          {paper.related.map((work) => <button key={work.id} onClick={() => { setSelected(work.id); setTab('graph') }}><strong>{work.short}</strong><small>{work.relation}</small></button>)}</div>}
      </aside>
    </div>
    <dialog ref={modal} onCancel={(event) => { if (importBusy) event.preventDefault() }}>
      <form onSubmit={addPaper}>
        <header><h2>导入论文</h2><button type="button" className="icon-button" aria-label="关闭" disabled={importBusy} onClick={() => modal.current?.close()}><X size={19} /></button></header>
        <label>学科领域<select value={importField} onChange={(event) => setImportField(event.target.value as Field)}>{Object.entries(fields).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>选择文件（PDF、DOCX、Markdown、TXT）<input type="file" accept=".pdf,.docx,.md,.txt" onChange={(event) => setFile(event.target.files?.[0])} disabled={importBusy} /></label>
        <label>或粘贴论文标题<input value={importName} maxLength={180} onChange={(event) => setImportName(event.target.value)} disabled={!!file || importBusy} /></label>
        <label>论文正文<textarea value={importText} rows={4} maxLength={100000} onChange={(event) => setImportText(event.target.value)} disabled={!!file || importBusy} /></label>
        {importError && <p className="warning" role="alert">{importError}</p>}
        <button className="primary" disabled={importBusy}>{importBusy ? '正在提取文段…' : '导入到论文库'}</button>
      </form>
    </dialog>
  </>
}
