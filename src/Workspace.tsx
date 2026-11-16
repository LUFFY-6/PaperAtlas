import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUp, BookOpen, FileText, FolderPlus, Paperclip, Plus } from 'lucide-react'
import { disciplineLabel, fields, validDiscipline, type Field, type Paper, type Project, type ReadingStyle } from './papers'
import { DisciplineSelect } from './DisciplineSelect'
import { cachedModels, type Connection } from './ModelSettings'
import { fileDrop } from './drop'
import { modelFetch, type Status } from './modelStatus'
import type { Conversation } from './conversations'
import { buildPersona, guestProfile, type Profile } from './persona'
import { effortLabels, type Effort } from './effort'
import { paperChatText, type PaperChatMode } from './paperChat'

export type User = { id: string; name: string; displayName?: string; bio?: string } & Profile
type Turn = Conversation['turns'][number]
const effortSteps = ['fast', 'normal', 'deep'] as const

export async function api<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await modelFetch(url, body === undefined ? { signal } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '请求失败，请重试。')
  return data
}

export function ChatHome({ field, discipline, style, connection, model, status, openSettings, openImport, openLibrary, onExample, upload, importBusy, project, projectPapers, openPaper, openRecent, recent, newConversation, conversation, onChange, user, effort, onEffort, onModel }: {
  field: Field; discipline?: string; style: ReadingStyle; connection: Connection | null; model: string; status: Status; openSettings: () => void;
  openImport: () => void; openLibrary: () => void; onExample: (signal: AbortSignal) => Promise<void>; upload: (file: File) => void; importBusy: boolean; project?: Project;
  projectPapers: Paper[]; openPaper: (paper: Paper) => void;
  openRecent: () => void; newConversation: () => void; recent?: Paper
  conversation: Conversation; onChange: (conversation: Conversation) => Promise<void>
  user: User | null
  effort: Effort; onEffort: (effort: Effort) => void; onModel: (model: string) => void
}) {
  const [pending, setPending] = useState('')
  const transcript = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true)
  const request = useRef<AbortController | null>(null)
  const exampleRequest = useRef<AbortController | null>(null)
  const [openingExample, setOpeningExample] = useState(false)
  useEffect(() => () => { request.current?.abort(); exampleRequest.current?.abort() }, [])
  useLayoutEffect(() => {
    const history = transcript.current
    if (history && followLatest.current) history.scrollTop = history.scrollHeight
  }, [conversation.turns, pending])
  const turns: Turn[] = pending ? [...conversation.turns, { role: 'user', content: pending }] : conversation.turns
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [paperId, setPaperId] = useState(conversation.paperId)
  const [paperMode, setPaperMode] = useState<PaperChatMode>('full')
  const citablePapers = projectPapers.filter((paper) => paper.blocks.length > 0)
  const selectedPaper = project && (paperId === undefined && citablePapers.length === 1
    ? citablePapers[0] : citablePapers.find((paper) => paper.id === paperId))
  const persona = buildPersona(user ?? guestProfile())
  const available = connection ? [...new Set([connection.model, ...(connection.models ?? cachedModels(connection.base))])] : model ? [model] : []
  const modelState = status.lastError ? 'error' : status.lastOkAt && model ? 'ok' : 'idle'
  const modelStateLabel = status.lastError || (modelState === 'ok' ? '最近一次请求成功' : model ? '尚未验证连接' : '未配置模型')
  async function send(event: FormEvent) {
    event.preventDefault()
    if (request.current || !draft.trim()) return
    if (!model) { openSettings(); return }
    const question = draft.trim()
    const next: Turn[] = [...conversation.turns, { role: 'user', content: question }]
    const controller = new AbortController()
    request.current = controller
    followLatest.current = true
    setError('')
    setDraft('')
    setPending(question)
    setBusy(true)
    try {
      const { reply, model: used } = await api<{ reply: string; model: string }>('/api/chat', {
        field: selectedPaper ? selectedPaper.field : field,
        discipline: selectedPaper ? disciplineLabel(selectedPaper.field, selectedPaper.discipline) : disciplineLabel(field, discipline), style, connection,
        ...(selectedPaper && { scope: 'paper', paperContext: { title: selectedPaper.title.slice(0, 250), section: '论文原文',
          ...paperChatText(selectedPaper.blocks, question, selectedPaper.partial, paperMode) } }),
        turns: next.slice(-13).map((turn) => ({ ...turn, content: turn.content.slice(0, 1800) })),
      }, controller.signal)
      if (!controller.signal.aborted) await onChange({ ...conversation, turns: [...next, { role: 'assistant', content: reply, model: used }],
        title: conversation.turns.length ? conversation.title : Array.from(question).slice(0, 30).join(''),
        model: used, effort, paperId: selectedPaper ? selectedPaper.id : paperId, updatedAt: Date.now() })
    } catch (reason) {
      if (!controller.signal.aborted) { setError((reason as Error).message); setDraft(question) }
    } finally { request.current = null; setBusy(false); setPending('') }
  }
  const activeChat = turns.length > 0
  async function openExample() {
    if (exampleRequest.current) return
    const controller = new AbortController()
    exampleRequest.current = controller
    setOpeningExample(true)
    setError('')
    try { await onExample(controller.signal) }
    catch (error) { if (!controller.signal.aborted) setError((error as Error).message) }
    finally {
      exampleRequest.current = null
      if (!controller.signal.aborted) setOpeningExample(false)
    }
  }
  const shortcuts = (
    <div className="chat-shortcuts">
      <button disabled={!recent} onClick={openRecent}><FileText size={16} />继续阅读</button>
      {project ? <button disabled={importBusy} onClick={openImport}><Paperclip size={16} />添加论文到项目</button> : <>
        <button aria-label="我的论文" onClick={openLibrary}><BookOpen size={16} />我的论文</button>
        <button disabled={openingExample || busy} onClick={() => void openExample()}><BookOpen size={16} />{openingExample ? '打开示例中…' : '示例'}</button>
      </>}
      <button aria-label="新建对话" onClick={newConversation}><Plus size={16} />新建对话</button>
    </div>
  )
  return <main className={activeChat ? 'chat-home chat-home--active' : 'chat-home'} {...fileDrop(upload)}>
    <div className="chat-inner">
      {turns.length ? <div ref={transcript} className="chat-transcript" tabIndex={0} role="region" aria-label="聊天记录" aria-live="polite"
        onScroll={(event) => {
          const { scrollHeight, clientHeight, scrollTop } = event.currentTarget
          followLatest.current = scrollHeight - clientHeight - scrollTop <= 24
        }}>{turns.map((turn, i) =>
        <div className={'chat-bubble ' + turn.role} key={i} title={turn.role === 'assistant' ? persona.label : undefined}><small>{turn.role === 'user' ? '你' : 'Paper Atlas'}</small>
          {turn.role === 'assistant' && (turn.model || conversation.model) && <small>{turn.model || conversation.model}</small>}<p>{turn.content}</p></div>)}
        {busy && <p role="status">正在回复…</p>}
      </div> : <header className="chat-intro"><h1>{project?.title || '今天想读懂什么？'}</h1></header>}
      {activeChat && error && <p className="warning" role="alert">{error}</p>}
      <form className="chat-composer" onSubmit={send}>
        {project && citablePapers.length > 0 && <label className="chat-paper-context">引用论文<select
          value={selectedPaper ? selectedPaper.id : ''} disabled={busy}
          onChange={(event) => setPaperId(event.target.value)}>
          <option value="">不引用论文</option>
          {citablePapers.map((paper) => <option key={paper.id} value={paper.id}>{paper.historyTitle || paper.title}</option>)}
        </select></label>}
        {selectedPaper && <label className="chat-paper-context">发送范围<select value={paperMode} disabled={busy}
          onChange={(event) => setPaperMode(event.target.value as PaperChatMode)}>
          <option value="full">全文文字</option>
          <option value="excerpts">相关段落</option>
        </select></label>}
        <textarea aria-label="科研问题" placeholder="问一个科研问题" maxLength={1800}
          value={draft} onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() }
          }} />
        <div className="composer-actions">
          <button className="chat-attach" type="button" disabled={importBusy} aria-label="添加论文" title="拖入或点击添加论文" onClick={openImport}><Paperclip size={16} /></button>
          <details className="chat-model" onKeyDown={(event) => { if (event.key === 'Escape') event.currentTarget.open = false }}>
            <summary title={modelStateLabel}><i className="status-dot" data-state={modelState} role="img" aria-label={modelStateLabel} /><span>{model || '未配置模型'} · {effortLabels[effort]}</span></summary>
            <div className="model-popover">
              {available.map((id) => <button key={id} type="button" aria-pressed={model === id} onClick={(event) => {
                onModel(id); event.currentTarget.closest('details')?.removeAttribute('open')
              }}>{id}</button>)}
              {!available.length && <p className="subtle">在设置中添加模型</p>}
              <div className="effort-slider" data-effort={effort}>
                <input type="range" min={0} max={2} step={1} value={effortSteps.indexOf(effort)}
                  aria-label="思考强度" aria-valuetext={effortLabels[effort]}
                  onChange={(event) => onEffort(effortSteps[event.currentTarget.valueAsNumber])} />
                <div className="effort-labels" aria-hidden="true">{effortSteps.map((id) =>
                  <span key={id} data-active={id === effort}>{effortLabels[id]}</span>)}</div>
              </div>
            </div>
          </details>
          <button className="chat-send" aria-label="发送消息" disabled={busy || !draft.trim()}><ArrowUp size={19} /></button>
        </div>
      </form>
      {!activeChat && error && <p className="warning" role="alert">{error}</p>}
      {shortcuts}
      {project && !turns.length && projectPapers.length > 0 && <section className="project-papers" aria-label="项目论文">
        <h2>项目论文</h2>
        <ul>{projectPapers.map((paper) => <li key={paper.id}><button onClick={() => openPaper(paper)}>
          <FileText size={16} aria-hidden="true" /><span>{paper.historyTitle || paper.title}</span><small>{paper.format}</small>
        </button></li>)}</ul>
      </section>}
    </div>
  </main>
}

export function WorkspaceDialogs({ user, onUser, onProject, account, project }: {
  user: User | null; onUser: (user: User | null) => void; onProject: (project: Project) => void;
  account: React.RefObject<HTMLDialogElement | null>; project: React.RefObject<HTMLDialogElement | null>;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [field, setField] = useState<Field | ''>('')
  const [discipline, setDiscipline] = useState('')
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
        const result = await api<{ project: Project }>('/api/projects', { ...data, field, discipline })
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
    <dialog ref={project} onClose={() => { setField(''); setDiscipline(''); setError('') }}>
      <form onSubmit={(event) => void submit(event, 'project')}>
        <header><h2><FolderPlus size={17} /> 新建项目</h2><button type="button" onClick={() => project.current?.close()}>关闭</button></header>
        <label>先选择研究领域<select required value={field} onChange={(event) => { setField(event.target.value as Field | ''); setDiscipline('') }}>
          <option value="">请选择</option>{Object.entries(fields).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        {field && <DisciplineSelect field={field} value={discipline} onChange={setDiscipline} disabled={busy} />}
        {field && <label>项目名称<input name="title" required maxLength={80} /></label>}
        {error && <p className="warning" role="alert">{error}</p>}
        <button className="primary" disabled={!field || !validDiscipline(field, discipline) || busy}><Plus size={16} /> 创建项目</button>
      </form>
    </dialog>
  </>
}
