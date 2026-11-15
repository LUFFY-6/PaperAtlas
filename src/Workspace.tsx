import { useState, type FormEvent } from 'react'
import { ArrowUp, BookOpen, Columns3, FileText, FolderPlus, Network, Paperclip, Plus } from 'lucide-react'
import { disciplineLabel, disciplineOptions, fields, type Field, type Project, type ReadingStyle } from './papers'
import type { Connection } from './ModelSettings'
import { fileDrop } from './drop'
import { modelFetch } from './modelStatus'

export type User = { id: string; name: string; displayName?: string; bio?: string }
type Turn = { role: 'user' | 'assistant'; content: string }

export async function api<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await modelFetch(url, body === undefined ? { signal } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '请求失败，请重试。')
  return data
}

export function ChatHome({ field, discipline, style, connection, model, openSettings, openImport, openLibrary, upload, importBusy, project, openRecent }: {
  field: Field; discipline?: string; style: ReadingStyle; connection: Connection | null; model: string; openSettings: () => void;
  openImport: () => void; openLibrary: () => void; upload: (file: File) => void; importBusy: boolean; project?: Project;
  openRecent: (tab: 'read' | 'compare' | 'graph') => void
}) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function send(event: FormEvent) {
    event.preventDefault()
    if (busy || !draft.trim()) return
    if (!model) { openSettings(); return }
    const next: Turn[] = [...turns, { role: 'user', content: draft.trim() }]
    setError('')
    setDraft('')
    setTurns(next)
    setBusy(true)
    try {
      const { reply } = await api<{ reply: string }>('/api/chat', {
        field, discipline: disciplineLabel(field, discipline), style, connection,
        turns: next.slice(-13).map((turn) => ({ ...turn, content: turn.content.slice(0, 1800) })),
      })
      setTurns([...next, { role: 'assistant', content: reply }])
    } catch (reason) {
      setError((reason as Error).message)
      setDraft(next.at(-1)?.content ?? '')
      setTurns(turns)
    } finally { setBusy(false) }
  }
  return <main className="chat-home" {...fileDrop(upload)}>
    <div className="chat-inner">
      {turns.length ? <div className="chat-transcript" aria-live="polite">{turns.map((turn, i) =>
        <div className={'chat-bubble ' + turn.role} key={i}><small>{turn.role === 'user' ? '你' : 'Paper Atlas'}</small><p>{turn.content}</p></div>)}
        {busy && <p role="status">正在回复…</p>}
      </div> : <header className="chat-intro"><h1>{project?.title || '今天想读懂什么？'}</h1></header>}
      <form className="chat-composer" onSubmit={send}>
        <textarea aria-label="科研问题" placeholder="问一个科研问题" maxLength={1800}
          value={draft} onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() }
          }} />
        <div className="composer-actions">
          <button className="chat-attach" type="button" disabled={importBusy} aria-label="添加论文" title="拖入或点击添加论文" onClick={openImport}><Paperclip size={16} /></button>
          <button type="button" className="chat-model" onClick={openSettings}>{model || '连接模型'}</button>
          <button className="chat-send" aria-label="发送消息" disabled={busy || !draft.trim()}><ArrowUp size={19} /></button>
        </div>
      </form>
      {error && <p className="warning" role="alert">{error}</p>}
      <div className="chat-shortcuts">
        <button onClick={() => openRecent('read')}><FileText size={16} />原文精读</button>
        <button onClick={() => openRecent('compare')}><Columns3 size={16} />方法对比</button>
        <button onClick={() => openRecent('graph')}><Network size={16} />论文关系</button>
        <button onClick={openLibrary}><BookOpen size={16} />学习库</button>
      </div>
    </div>
  </main>
}

export function WorkspaceDialogs({ user, onUser, onProject, account, project }: {
  user: User | null; onUser: (user: User | null) => void; onProject: (project: Project) => void;
  account: React.RefObject<HTMLDialogElement | null>; project: React.RefObject<HTMLDialogElement | null>;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [field, setField] = useState<Field | ''>('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>, action: 'project' | 'account') {
    event.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form))
    try {
      if (action === 'project') {
        const result = await api<{ project: Project }>('/api/projects', { ...data, field })
        project.current?.close()
        form.reset()
        setField('')
        onProject(result.project)
      } else {
        const result = await api<{ user: User | null }>(user ? '/api/logout' : '/api/' + mode, data)
        account.current?.close()
        onUser(result.user)
      }
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  return <>
    <dialog ref={account} onClose={() => setError('')}>
      <form onSubmit={(event) => void submit(event, 'account')}>
        <header><h2>{user?.name || (mode === 'login' ? '登录' : '注册')}</h2><button type="button" onClick={() => account.current?.close()}>关闭</button></header>
        {!user && <>
          <label>账号<input name="name" autoComplete="username" required minLength={3} maxLength={80} /></label>
          <label>密码<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} maxLength={128} /></label>
          <button type="button" onClick={() => { setError(''); setMode(mode === 'login' ? 'register' : 'login') }}>{mode === 'login' ? '注册账号' : '已有账号，去登录'}</button>
        </>}
        {error && <p className="warning" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{user ? '退出登录' : mode === 'login' ? '登录' : '创建账号'}</button>
      </form>
    </dialog>
    <dialog ref={project} onClose={() => { setField(''); setError('') }}>
      <form onSubmit={(event) => void submit(event, 'project')}>
        <header><h2><FolderPlus size={17} /> 新建项目</h2><button type="button" onClick={() => project.current?.close()}>关闭</button></header>
        <label>先选择研究领域<select required value={field} onChange={(event) => setField(event.target.value as Field | '')}>
          <option value="">请选择</option>{Object.entries(fields).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        {field === 'custom' && <label>自定义学科<input name="discipline" required maxLength={60} /></label>}
        {field && field !== 'custom' && <label>具体方向<select key={field} name="discipline">
          <option value="">未指定</option>{disciplineOptions(field).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>}
        {field && <label>项目名称<input name="title" required maxLength={80} /></label>}
        {error && <p className="warning" role="alert">{error}</p>}
        <button className="primary" disabled={!field || busy}><Plus size={16} /> 创建项目</button>
      </form>
    </dialog>
  </>
}
