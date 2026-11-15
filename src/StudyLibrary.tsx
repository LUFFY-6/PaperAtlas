import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, BookOpen, Trash2 } from 'lucide-react'
import { catalog, studyFields, type StudyField, type StudyPaper } from './catalog'
import { disciplineOptions, fieldIcon, fields, type Paper } from './papers'
import { loadReading } from './storage'
import { readingBatches, readingSections } from './sections'

type LibraryTab = 'mine' | 'preset'

export function StudyLibrary({ openPaper, saved, owner, tab, onTab, onUpload, onRemove }: {
  openPaper: (paper: Paper) => void; saved: Paper[]; owner: string
  tab: LibraryTab; onTab: (tab: LibraryTab) => void; onUpload: () => void; onRemove: (paper: Paper) => void
}) {
  const [field, setField] = useState<StudyField>('engineering')
  const [discipline, setDiscipline] = useState(() => disciplineOptions('engineering')[0][0])
  const [availability, setAvailability] = useState<Record<string, 'ready' | 'partial' | 'pending'>>({})
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [progress, setProgress] = useState<Record<string, string>>({})
  const request = useRef<AbortController | null>(null)
  const mine = saved.filter((item) => !catalog.some(({ id }) => id === item.id))
  useEffect(() => {
    if (tab !== 'mine') return
    let active = true
    void Promise.all(saved.filter((item) => !catalog.some(({ id }) => id === item.id)).map(async (item) => {
      const sections = readingSections(item.blocks)
      const state = await loadReading<{ lessons?: Record<string, unknown> }>(item.id, owner).catch(() => undefined)
      const done = sections.filter(({ blocks }) => readingBatches(blocks).every(([block]) => Boolean(state?.lessons?.[block.id]))).length
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
    const existing = saved.find(({ id }) => id === item.id)
    if (existing) { openPaper({ ...existing, discipline: item.discipline, field: item.field }); return }
    setError('')
    setPending(item.id)
    const controller = new AbortController()
    request.current = controller
    try {
      const response = await fetch('/api/library/' + item.id, { signal: controller.signal })
      if (!response.ok) throw new Error('暂时无法获取原版，可用右侧链接查看来源。')
      const { importPaper } = await import('./import')
      const paper = await importPaper(new File([await response.blob()], item.title + '.pdf', { type: 'application/pdf' }), item.field)
      if (!controller.signal.aborted) openPaper({ ...paper, id: item.id, title: item.title, short: item.title, venue: item.venue, url: item.url, discipline: item.discipline })
    } catch (reason) { if (!controller.signal.aborted) setError((reason as Error).message) }
    finally { setPending('') }
  }
  return <main className="study-library">
    <h1>学习库</h1>
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
    {tab === 'mine' ? <>
      <label className="question">搜索论文标题<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {!mine.length ? <div className="empty">还没有导入论文。 <button className="secondary" onClick={onUpload}>上传论文</button></div> : <ul>
        {mine.filter((item) => `${item.title} ${item.historyTitle ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())).map((item) => {
          const Icon = fieldIcon[item.field]
          return <li key={item.id}>
            <Icon size={18} role="img" aria-label={fields[item.field] + '论文'} />
            <button onClick={() => openPaper(item)}>{item.historyTitle || item.title}</button>
            <small>{progress[item.id]}{item.lastOpened && <> · {new Date(item.lastOpened).toLocaleString('zh-CN')}</>}</small>
            <button className="icon-button" aria-label={'删除 ' + (item.historyTitle || item.title)} onClick={() => onRemove(item)}><Trash2 size={16} /></button>
          </li>
        })}
      </ul>}
    </> : <>
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
  </main>
}
