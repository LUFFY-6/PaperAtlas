import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Plus, Trash2, X } from 'lucide-react'
import { catalog, studyFields, type StudyField, type StudyPaper } from './catalog'
import { customFieldPrefix, disciplineLabel, disciplineOptions, fieldIcon, fields, normalizeField, type Paper } from './papers'
import { loadReading } from './storage'
import { readerSections } from './sections'

type LibraryTab = 'mine' | 'preset'

export async function loadStudyPaper(item: StudyPaper, saved: Paper[], signal?: AbortSignal): Promise<Paper> {
  const existing = saved.find(({ id }) => id === item.id)
  if (existing?.original && existing.blocks.length) return { ...existing, discipline: item.discipline, field: item.field }
  const response = await fetch('/api/library/' + item.id, { signal })
  if (!response.ok) throw new Error('暂时无法获取论文原版，请稍后重试。')
  const { importPaper } = await import('./import')
  const paper = await importPaper(new File([await response.blob()], item.title + '.pdf', { type: 'application/pdf' }), item.field)
  return { ...paper, id: item.id, title: item.title, short: item.title, venue: item.venue, url: item.url, discipline: item.discipline }
}

export function StudyLibrary({ openPaper, saved, owner, tab, onTab, onUpload, onRemove, libraryFields, onAddField }: {
  openPaper: (paper: Paper) => void; saved: Paper[]; owner: string
  tab: LibraryTab; onTab: (tab: LibraryTab) => void; onUpload: () => void; onRemove: (paper: Paper) => void
  libraryFields: string[][]; onAddField: (name: string) => void
}) {
  const [field, setField] = useState<StudyField>('engineering')
  const [discipline, setDiscipline] = useState(() => disciplineOptions('engineering')[0][0])
  const [availability, setAvailability] = useState<Record<string, 'ready' | 'partial' | 'pending'>>({})
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [mineField, setMineField] = useState<string>()
  const fieldDialog = useRef<HTMLDialogElement>(null)
  const [fieldError, setFieldError] = useState('')
  const [progress, setProgress] = useState<Record<string, string>>({})
  const request = useRef<AbortController | null>(null)
  const mine = saved.filter((item) => !catalog.some(({ id }) => id === item.id))
  const fieldKey = (item: Paper) => item.customField ? customFieldPrefix + item.customField : item.field
  const fieldPapers = mine.filter((item) => fieldKey(item) === mineField)
  const results = fieldPapers.filter((item) => `${item.title} ${item.historyTitle ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  useEffect(() => {
    if (tab !== 'mine') return
    let active = true
    void Promise.all(saved.filter((item) => !catalog.some(({ id }) => id === item.id)).map(async (item) => {
      const sections = readerSections(item.blocks).filter((section) => !section.kind)
      const state = await loadReading<{ lessons?: Record<string, unknown> }>(item.id, owner).catch(() => undefined)
      const done = sections.filter(({ batches }) => batches.length && batches.every(([block]) => Boolean(state?.lessons?.[block.id]))).length
      return [item.id, `已精读 ${done}/${sections.length} 节`]
    })).then((entries) => { if (active) setProgress(Object.fromEntries(entries)) })
    return () => { active = false }
  }, [owner, saved, tab])
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/library', { signal: controller.signal }).then((response) => {
      if (response.ok) return response.json()
    }).then((status) => { if (status && !controller.signal.aborted) setAvailability(status) }).catch(() => {})
    return () => controller.abort()
  }, [discipline])
  async function open(item: StudyPaper) {
    setError('')
    setPending(item.id)
    const controller = new AbortController()
    request.current = controller
    try {
      const paper = await loadStudyPaper(item, saved, controller.signal)
      if (!controller.signal.aborted) openPaper(paper)
    } catch (reason) { if (!controller.signal.aborted) setError((reason as Error).message) }
    finally { setPending('') }
  }
  function createField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    try {
      onAddField(String(new FormData(form).get('name') ?? ''))
      form.reset()
      fieldDialog.current?.close()
    } catch (reason) {
      setFieldError((reason as Error).message)
    }
  }
  return <main className="study-library">
    <div className="study-heading">
      <h1>学习库</h1>
      <button className="primary" onClick={onUpload}><Plus size={16} /> 导入论文</button>
    </div>
    <nav role="tablist" aria-label="论文来源" onKeyDown={(event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const next = tab === 'mine' ? 'preset' : 'mine'
      onTab(next)
      event.currentTarget.querySelector<HTMLElement>('#library-' + next)?.focus()
    }}>
      {(['mine', 'preset'] as const).map((id) => <button key={id} id={'library-' + id} role="tab" aria-selected={tab === id} aria-controls="library-panel" tabIndex={tab === id ? 0 : -1} onClick={() => onTab(id)}>{id === 'mine' ? '我的论文' : '预设库'}（{id === 'mine' ? mine.length : catalog.length}）</button>)}
    </nav>
    <div id="library-panel" role="tabpanel" aria-labelledby={'library-' + tab}>
    {tab === 'mine' ? !mineField ? <div className="study-field-grid" aria-label="我的论文领域">
      {libraryFields.map(([id, label]) => {
        const Icon = fieldIcon[id.startsWith(customFieldPrefix) ? 'custom' : normalizeField(id)]
        return <button className="study-field-card" key={id} onClick={() => { setMineField(id); setQuery('') }}>
          <span className="study-field-symbol"><Icon size={33} strokeWidth={1.5} aria-hidden="true" /></span>
          <strong>{label}</strong>
          <small>{mine.filter((item) => fieldKey(item) === id).length} 篇论文</small>
          <ArrowRight className="study-field-arrow" size={17} aria-hidden="true" />
        </button>
      })}
      <button className="study-field-card" onClick={() => { setFieldError(''); fieldDialog.current?.showModal() }}>
        <span className="study-field-symbol"><Plus size={33} strokeWidth={1.5} aria-hidden="true" /></span>
        <strong>新建领域</strong>
      </button>
    </div> : <>
      <button className="secondary" onClick={() => setMineField(undefined)}><ArrowLeft size={15} /> 全部领域</button>
      <h2>{libraryFields.find(([id]) => id === mineField)?.[1]} <small className="library-venue">{fieldPapers.length} 篇论文</small></h2>
      <label className="question">搜索论文标题<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {!results.length ? <div className="empty">{fieldPapers.length ? '没有匹配的论文。' : '这个领域还没有导入论文。'}</div> : <ul>
        {results.map((item) => {
          const Icon = fieldIcon[item.field]
          return <li key={item.id}>
            <Icon size={18} role="img" aria-label={fields[item.field] + '论文'} />
            <button onClick={() => openPaper(item)}>{item.historyTitle || item.title}<span className="library-venue">{disciplineLabel(item.field, item.discipline)}</span></button>
            <small>{progress[item.id]}{item.lastOpened && <> · {new Date(item.lastOpened).toLocaleString('zh-CN')}</>}</small>
            <button className="icon-button" aria-label={'删除 ' + (item.historyTitle || item.title)} onClick={() => onRemove(item)}><Trash2 size={16} /></button>
          </li>
        })}
      </ul>}
    </> : <>
    <p className="subtle">预设论文可直接阅读，也可以导入自己的论文，按领域保存到「我的论文」。</p>
    <nav aria-label="学习领域">{studyFields.map((id) =>
      <button key={id} aria-pressed={field === id} onClick={() => { setField(id); setDiscipline(disciplineOptions(id)[0][0]); setError('') }}>{fields[id]}</button>)}</nav>
    <nav className="study-disciplines" aria-label="学习方向">{disciplineOptions(field).map(([id, label]) =>
      <button key={id} aria-pressed={discipline === id} onClick={() => { setDiscipline(id); setError('') }}>{label}</button>)}</nav>
    {pending && <p role="status">正在打开论文原版…</p>}
    {error && <p className="warning" role="alert">{error}</p>}
    <ul>{catalog.filter((item) => item.discipline === discipline).map((item) => <li key={item.id}>
      <BookOpen size={18} /><button disabled={!!pending} onClick={() => void open(item)}>{item.title}<span className="library-venue">{item.venue}</span></button><small className={availability[item.id] === 'ready' ? 'guide-ready' : undefined}>
        {availability[item.id] === 'ready' ? '精读已就绪' : availability[item.id] === 'partial' ? '部分讲解就绪'
          : availability[item.id] === 'pending' ? '原版可读' : item.venue}
      </small>
      <a href={item.alternatePdf ?? item.url} aria-label={'原版来源 · ' + item.title} target="_blank" rel="noreferrer"><ArrowUpRight size={16} /></a>
    </li>)}</ul>
    </>}
    </div>
    <dialog ref={fieldDialog} aria-labelledby="new-field-title">
      <form onSubmit={createField}>
        <header><h2 id="new-field-title">新建领域</h2><button type="button" className="icon-button" aria-label="关闭" onClick={() => fieldDialog.current?.close()}><X size={19} /></button></header>
        <label>领域名称<input name="name" required maxLength={60} autoFocus onChange={() => setFieldError('')} /></label>
        {fieldError && <p className="warning" role="alert">{fieldError}</p>}
        <button className="primary">创建</button>
      </form>
    </dialog>
  </main>
}
