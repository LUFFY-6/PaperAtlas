import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, BookOpen } from 'lucide-react'
import { catalog, studyFields, type StudyField, type StudyPaper } from './catalog'
import { disciplineOptions, fields, type Paper } from './papers'

export function StudyLibrary({ openPaper, saved }: { openPaper: (paper: Paper) => void; saved: Paper[] }) {
  const [field, setField] = useState<StudyField>('engineering')
  const [discipline, setDiscipline] = useState(() => disciplineOptions('engineering')[0][0])
  const [availability, setAvailability] = useState<Record<string, 'ready' | 'partial' | 'pending'>>({})
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
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
    <nav aria-label="学习领域">{studyFields.map((id) =>
      <button key={id} aria-pressed={field === id} onClick={() => { setField(id); setDiscipline(disciplineOptions(id)[0][0]); setError('') }}>{fields[id]}</button>)}</nav>
    <nav className="study-disciplines" aria-label="学习方向">{disciplineOptions(field).map(([id, label]) =>
      <button key={id} aria-pressed={discipline === id} onClick={() => { setDiscipline(id); setError('') }}>{label}</button>)}</nav>
    {pending && <p role="status">正在打开论文原版…</p>}
    {error && <p className="warning" role="alert">{error}</p>}
    <ul>{catalog.filter((item) => item.discipline === discipline).map((item) => <li key={item.id}>
      <BookOpen size={18} /><button disabled={!!pending} onClick={() => void open(item)}>{item.title}</button><small className={availability[item.id] === 'ready' ? 'guide-ready' : undefined}>
        {availability[item.id] === 'ready' ? '精读已就绪' : availability[item.id] === 'partial' ? '部分讲解就绪'
          : availability[item.id] === 'pending' ? '原版可读' : item.venue}
      </small>
      <a href={item.alternatePdf ?? item.url} aria-label={'原版来源 · ' + item.title} target="_blank" rel="noreferrer"><ArrowUpRight size={16} /></a>
    </li>)}</ul>
  </main>
}
