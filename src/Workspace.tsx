import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUp, BookOpen, FileText, FolderPlus, Paperclip, Plus } from 'lucide-react'
import { disciplineLabel, disciplineOptions, fields, type Field, type Paper, type Project, type ReadingStyle } from './papers'
import { cachedModels, type Connection } from './ModelSettings'
import { fileDrop } from './drop'
import { modelFetch } from './modelStatus'
import type { Conversation } from './conversations'
import { buildPersona, guestProfile, type Profile } from './persona'
import { effortLabels, type Effort } from './effort'

export type User = { id: string; name: string; displayName?: string; bio?: string } & Profile
type Turn = Conversation['turns'][number]

export async function api<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await modelFetch(url, body === undefined ? { signal } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '请求失败，请重试。')
  return data
}

export function ChatHome({ field, discipline, style, connection, model, openSettings, openImport, openLibrary, upload, importBusy, project, openRecent, recent, recentProgress, newConversation, conversation, onChange, user, effort, onEffort, onModel }: {
  field: Field; discipline?: string; style: ReadingStyle; connection: Connection | null; model: string; openSettings: () => void;
  openImport: () => void; openLibrary: (tab: 'mine' | 'preset') => void; upload: (file: File) => void; importBusy: boolean; project?: Project;
  openRecent: () => void; newConversation: () => void; recent?: Paper; recentProgress: string
  conversation: Conversation; onChange: (conversation: Conversation) => Promise<void>
  user: User | null
  effort: Effort; onEffort: (effort: Effort) => void; onModel: (model: string) => void
}) {
  const [pending, setPending] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const turns: Turn[] = pending ? [...conversation.turns, { role: 'user', content: pending }] : conversation.turns
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const persona = buildPersona(user ?? guestProfile())
  const available = connection ? [...new Set([connection.model, ...cachedModels(connection.base)])] : model ? [model] : []
  async function send(event: FormEvent) {
    event.preventDefault()
    if (request.current || !draft.trim()) return
    if (!model) { openSettings(); return }
    const question = draft.trim()
    const next: Turn[] = [...conversation.turns, { role: 'user', content: question }]
    const controller = new AbortController()
    request.current = controller
    setError('')
    setDraft('')
    setPending(question)
    setBusy(true)
    try {
      const { reply, model: used } = await api<{ reply: string; model: string }>('/api/chat', {
        field, discipline: disciplineLabel(field, discipline), style, connection,
        turns: next.slice(-13).map((turn) => ({ ...turn, content: turn.content.slice(0, 1800) })),
      }, controller.signal)
      if (!controller.signal.aborted) await onChange({ ...conversation, turns: [...next, { role: 'assistant', content: reply, model: used }],
        title: conversation.turns.length ? conversation.title : Array.from(question).slice(0, 30).join(''),
        model: used, effort, updatedAt: Date.now() })
    } catch (reason) {
      if (!controller.signal.aborted) { setError((reason as Error).message); setDraft(question) }
    } finally { request.current = null; setBusy(false); setPending('') }
  }
  return <main className="chat-home" {...fileDrop(upload)}>
    <div className="chat-inner">
      {turns.length ? <div className="chat-transcript" aria-live="polite">{turns.map((turn, i) =>
        <div className={'chat-bubble ' + turn.role} key={i} title={turn.role === 'assistant' ? persona.label : undefined}><small>{turn.role === 'user' ? '你' : 'Paper Atlas'}</small>
          {turn.role === 'assistant' && (turn.model || conversation.model) && <small>{turn.model || conversation.model}</small>}<p>{turn.content}</p></div>)}
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
          <details className="chat-model" onKeyDown={(event) => { if (event.key === 'Escape') event.currentTarget.open = false }}>
            <summary>{model || '连接模型'} · {effortLabels[effort]}</summary>
            <div className="model-popover">
              {available.map((id) => <button key={id} type="button" aria-pressed={model === id} onClick={(event) => {
                onModel(id); event.currentTarget.closest('details')?.removeAttribute('open')
              }}>{id}</button>)}
              <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); openSettings() }}>手动输入</button>
              <div className="effort-options" role="group" aria-label="思考强度">{Object.entries(effortLabels).map(([id, label]) =>
                <button key={id} type="button" aria-pressed={effort === id} onClick={() => onEffort(id as Effort)}>{label}</button>)}</div>
            </div>
          </details>
          <button className="chat-send" aria-label="发送消息" disabled={busy || !draft.trim()}><ArrowUp size={19} /></button>
        </div>
      </form>
      {error && <p className="warning" role="alert">{error}</p>}
      <div className="chat-shortcuts">
        <button disabled={!recent} aria-label="继续阅读" aria-describedby="recent-paper" onClick={openRecent}><FileText size={16} />继续阅读</button>
        <button aria-label="我的论文" onClick={() => openLibrary('mine')}><BookOpen size={16} />我的论文</button>
        <button aria-label="学习库" onClick={() => openLibrary('preset')}><BookOpen size={16} />学习库</button>
        <button aria-label="新建对话" onClick={newConversation}><Plus size={16} />新建对话</button>
      </div>
      <p className="subtle chat-recent" id="recent-paper">{recent ? `${recent.historyTitle || recent.title}${recentProgress ? ' · ' + recentProgress : ''}` : '先上传第一篇论文'}</p>
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
