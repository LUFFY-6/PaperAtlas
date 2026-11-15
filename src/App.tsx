import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUpRight, BookOpen, CloudUpload, ChevronRight, Columns3, Ellipsis, FileText, Folder, Layers3, Moon, Network, Plug, Plus, Search, Settings, Sun, X } from 'lucide-react'
import { DeepReader } from './DeepReader'
import { ModelSettings, type Connection } from './ModelSettings'
import { disciplineLabel, fields, normalizeField, type Field, type Paper, type Related, type Project } from './papers'
import { history, recallConnection, recallStyle, rememberConnection, rememberPaper, rememberStyle, removeHistory, renameHistory } from './storage'
import { LiteratureMap, MethodTable } from './Literature'
import { PdfOriginal, TextOriginal, WordOriginal } from './Original'
import { api, ChatHome, WorkspaceDialogs, type User } from './Workspace'
import { fileDrop } from './drop'
import { StudyLibrary } from './StudyLibrary'
import { DisciplineSelect, Preferences } from './Preferences'
import { readingSections } from './sections'
import { applyTheme, readTheme, type Theme } from './theme'

const tabs = [['read', '全文精读', BookOpen], ['compare', '方法对比', Columns3], ['graph', '论文关系', Network], ['source', '文段', FileText]] as const
type Tab = typeof tabs[number][0]
type Explanation = { explanation: string; example: string; limits: string; evidence: { id: string; quote: string }[]; model: string }

async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || '请求失败，请重试。')
  return body as T
}

export function App() {
  const [user, setUser] = useState<User | null>(null)
  useEffect(() => { void api<{ user: User | null }>('/api/session').then(({ user }) => setUser(user)).catch(() => {}) }, [])
  return <WorkspaceApp key={user?.id || 'guest'} user={user} onUser={setUser} />
}

function WorkspaceApp({ user, onUser }: { user: User | null; onUser: (user: User | null) => void }) {
  const [theme, setTheme] = useState(readTheme)
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const change = () => setSystemDark(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  function changeTheme(next: Theme) {
    applyTheme(next)
    setTheme(next)
  }
  const dark = theme === 'dark' || theme === 'system' && systemDark
  const owner = user?.id ?? ''
  const [conversation, setConversation] = useState(0)
  const [view, setView] = useState<'workspace' | 'library'>('workspace')
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project>()
  const account = useRef<HTMLDialogElement>(null)
  const preferences = useRef<HTMLDialogElement>(null)
  const historyDialog = useRef<HTMLDialogElement>(null)
  const [style, setStyle] = useState(() => recallStyle(owner))
  const [historyAction, setHistoryAction] = useState<{ item: Paper; action: 'rename' | 'delete' }>()
  const [historyBusy, setHistoryBusy] = useState(false)
  const projectDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!owner) return
    const controller = new AbortController()
    void api<{ projects: Project[] }>('/api/projects', undefined, controller.signal).then(({ projects }) => {
      setProjects((current) => [...current, ...projects.filter((item) => !current.some(({ id }) => item.id === id))])
    }).catch(() => { if (!controller.signal.aborted) setStorageMessage('暂时无法读取项目。') })
    return () => controller.abort()
  }, [owner])

  const [library, setLibrary] = useState<Paper[]>([])
  const [paper, setPaper] = useState<Paper>()
  const [tab, setTab] = useState<Tab>('read')
  const [source, setSource] = useState('')
  const [fallback, setFallback] = useState('')
  const [connection, setConnection] = useState<Connection | null>(() => recallConnection(owner))
  const [remembered, setRemembered] = useState(() => !!connection)
  const [storageMessage, setStorageMessage] = useState('')
  const [historyReady, setHistoryReady] = useState(false)
  const activeModel = connection?.model || fallback
  const modelDialog = useRef<HTMLDialogElement>(null)
  const [comparison, setComparison] = useState<Explanation | null>(null)
  const [comparisonId, setComparisonId] = useState('')
  const [discovery, setDiscovery] = useState<{ query: string; position: string; works: Related[]; year?: string }>()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const modal = useRef<HTMLDialogElement>(null)
  const dropInput = useRef<HTMLInputElement>(null)
  const [homeField, setHomeField] = useState<Field>('engineering')
  const [homeDiscipline, setHomeDiscipline] = useState('')
  const [file, setFile] = useState<File>()
  const [importName, setImportName] = useState('')
  const [importText, setImportText] = useState('')
  const [importField, setImportField] = useState<Field>('engineering')
  const [importDiscipline, setImportDiscipline] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState('')
  const request = useRef<AbortController | null>(null)

  useEffect(() => { json<{ live: boolean; model: string }>('/api/config').then((info) => setFallback(info.live ? info.model : '')).catch(() => {}) }, [])
  useEffect(() => {
    void history(owner).then((saved) => setLibrary((current) => [...current, ...saved.filter(({ id }) => !current.some((item) => item.id === id)).map((item) => ({ ...item, field: normalizeField(item.field) }))]))
      .catch(() => setStorageMessage('暂时无法读取浏览器中的阅读历史。'))
      .finally(() => setHistoryReady(true))
  }, [owner])
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (!paper?.pdfUrl) return
    const url = paper.pdfUrl
    return () => URL.revokeObjectURL(url)
  }, [paper?.pdfUrl])

  function changeModel(next: Connection | null, remember = false) {
    request.current?.abort()
    setBusy('')
    setError('')
    setConnection(next)
    try {
      rememberConnection(remember ? next : null, owner)
      setRemembered(!!next && remember)
    } catch { setStorageMessage('模型设置已应用，但浏览器未能记住连接。') }
  }

  function choose(next: Paper) {
    setView('workspace')
    if (paper?.id === next.id && paper.discipline === next.discipline && paper.field === next.field) return
    setProject((current) => current?.id === next.projectId ? current : projects.find((item) => item.id === next.projectId))
    request.current?.abort()
    setPaper(next.original ? { ...next, pdfUrl: URL.createObjectURL(next.original) } : next)
    setLibrary((current) => [next, ...current.filter(({ id }) => id !== next.id)])
    void rememberPaper(next, owner).catch(() => setStorageMessage('浏览器未能保存这篇论文，当前仍可阅读。'))
    setSource(next.blocks[0].id)
    setTab('read')
    setDiscovery(undefined)
    setComparison(null)
    setComparisonId('')
    setBusy('')
    setError('')
  }

  function resetPaper() {
    request.current?.abort()
    setPaper(undefined)
    setImportError('')
  }

  async function editHistory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!historyAction || historyBusy) return
    const { item, action } = historyAction
    const title = String(new FormData(event.currentTarget).get('title') || '').trim()
    if (action === 'rename' && !title) return
    setHistoryBusy(true)
    setStorageMessage('')
    try {
      if (action === 'rename') {
        await renameHistory(item.id, title, owner)
        setLibrary((items) => items.map((entry) => entry.id === item.id ? { ...entry, historyTitle: title } : entry))
      } else {
        if (paper?.id === item.id) resetPaper()
        await removeHistory(item.id, owner)
        setLibrary((items) => items.filter(({ id }) => id !== item.id))
        if (comparisonId === item.id) { setComparisonId(''); setComparison(null) }
      }
      historyDialog.current?.close()
    } catch { setStorageMessage('未能更新阅读历史，请重试。'); historyDialog.current?.close() }
    finally { setHistoryBusy(false) }
  }

  function selectProject(next: Project | undefined) {
    resetPaper()
    setProject(next)
    setView('workspace')
  }

  function openImport() {
    setImportError('')
    setImportName('')
    setImportText('')
    setImportField(project?.field ?? homeField)
    setImportDiscipline(project?.discipline ?? homeDiscipline)
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
      choose({ ...next, projectId: project?.id, discipline: importDiscipline.trim() })
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

  async function upload(file: File) {
    if (importBusy) return
    setImportError('')
    setImportBusy(true)
    try {
      const { importPaper } = await import('./import')
      const next = await importPaper(file, project?.field ?? homeField)
      choose({ ...next, projectId: project?.id, discipline: (project?.discipline ?? homeDiscipline).trim() })
    } catch (reason) {
      setImportError(reason instanceof Error ? reason.message : '导入失败，请换一种格式。')
    } finally {
      setImportBusy(false)
    }
  }

  function comparePapers(event: FormEvent) {
    event.preventDefault()
    if (!paper || !current) return
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
      body: JSON.stringify({ title: '两篇论文的文段对比', field: paper.field, style, blocks, compare: true, connection,
        question: `A：《${paper.title}》；B：《${target.title}》。用「讲解」对照研究问题、方法与证据，用「例子」说明一个具体差异。每篇至少引用一处支持对比的原文，缺少信息就在证据范围说明。`.slice(0, 500) }),
    }), setComparison)
  }

  function findRelated() {
    if (!paper || !activeModel || busy) return
    const sections = readingSections(paper.blocks)
    const relevant = sections.filter(({ title }) =>
      /\b(?:methods?|methodology|approach|design|implementation|experiment|evaluation|results?)\b|方法|方案|设计|实现|实验|评估|结果/i.test(title))
    const excerpt = [
      ...paper.blocks.slice(0, 2).map(({ text }) => text.slice(0, 1550)),
      ...relevant.slice(0, 3).map(({ title, blocks }) => title + '\n' + blocks.map(({ text }) => text).join('\n').slice(0, 1000)),
      ...(!relevant.length ? paper.blocks.slice(2, 4).map(({ text }) => text.slice(0, 1550)) : []),
    ].join('\n\n').slice(0, 7000)
    void run('正在提炼研究问题、检索文献并比较方法…', (signal) => json<NonNullable<typeof discovery>>('/api/discover', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ title: paper.title, excerpt, connection }),
    }), setDiscovery)
  }

  function openSource(id: string) {
    setSource(id)
    setTab('source')
  }

  const current = paper?.blocks.find((block) => block.id === source) ?? paper?.blocks[0]
  const list = project ? library.filter((item) => item.projectId === project.id) : library
  const sameField = library.filter((item) => item.field === paper?.field && item.id !== paper?.id)

  return <>
    <header className="workspace-top">
      <button className="workspace-brand" onClick={() => { resetPaper(); setView('workspace'); setProject(undefined) }}><Layers3 size={20} /> Paper Atlas</button>
      <nav aria-label="工作区">
        <button aria-current={view === 'workspace' ? 'page' : undefined} onClick={() => setView('workspace')}>科研工作台</button>
        <button aria-current={view === 'library' ? 'page' : undefined} onClick={() => setView('library')}>学习库</button>
      </nav>
      <button className="model-trigger" onClick={() => modelDialog.current?.showModal()}><Plug size={16} /><span>模型设置</span></button>
      <button className="theme-toggle" aria-label={dark ? '切换浅色主题' : '切换深色主题'} onClick={() => changeTheme(dark ? 'light' : 'dark')}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
      <button className="account-trigger" onClick={() => account.current?.showModal()}>{user?.displayName || user?.name || '登录 / 注册'}</button>
    </header>
    <input type="file" hidden ref={dropInput} accept=".pdf,.docx,.md,.txt" onChange={(event) => {
      const selected = event.target.files?.[0]
      event.target.value = ''
      if (selected) void upload(selected)
    }} />
    <div className="desktop-workspace">
      <aside className="workspace-sidebar" aria-label="论文库和项目" {...fileDrop((file) => void upload(file))}>
        <button className="sidebar-new" onClick={() => { resetPaper(); setConversation((id) => id + 1); setView('workspace') }}><Plus size={17} /> 新对话</button>
        <div className="sidebar-heading"><span>项目</span><button aria-label="新建项目" onClick={() => (user ? projectDialog : account).current?.showModal()}><Plus size={15} /></button></div>
        {project && <button className="sidebar-row" onClick={() => selectProject(undefined)}><Folder size={15} /> 全部论文</button>}
        {projects.map((item) => <button className="sidebar-row" aria-current={item.id === project?.id ? 'true' : undefined} onClick={() => selectProject(item)} key={item.id}><Folder size={15} /><span>{item.title}</span><small>{disciplineLabel(item.field, item.discipline)}</small></button>)}
        <div className="sidebar-heading"><span>论文库</span><button aria-label="粘贴或导入论文" onClick={openImport}><Plus size={15} /></button></div>
        <button className="sidebar-drop" disabled={importBusy} onClick={() => dropInput.current?.click()}><CloudUpload size={19} /> {importBusy ? '正在读取论文…' : '拖入或点击上传'}</button>
        {!project && <><label className="sidebar-field">导入领域<select value={homeField} onChange={(event) => { setHomeField(event.target.value as Field); setHomeDiscipline('') }}>{Object.entries(fields).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <DisciplineSelect className="sidebar-field" field={homeField} value={homeDiscipline} onChange={setHomeDiscipline} /></>}
        <div className="sidebar-heading"><span>阅读历史</span></div>
        {list.length ? <div className="sidebar-list">{list.map((item) => <div className="history-row" key={item.id}>
          <button className="sidebar-row" title={item.historyTitle || item.title} aria-current={paper?.id === item.id && view === 'workspace' ? 'true' : undefined} onClick={() => choose(item)}><FileText size={15} /><span>{item.historyTitle || item.short}</span></button>
          <details className="history-menu"><summary aria-label={`管理 ${item.historyTitle || item.short}`}><Ellipsis size={16} /></summary><div>
            {(['rename', 'delete'] as const).map((action) => <button key={action} onClick={(event) => {
              event.currentTarget.closest('details')?.removeAttribute('open')
              setHistoryAction({ item, action }); historyDialog.current?.showModal()
            }}>{action === 'rename' ? '重命名' : '删除'}</button>)}
          </div></details>
        </div>)}</div>
          : <p className="sidebar-empty">{historyReady ? '暂无阅读记录' : '正在读取历史…'}</p>}
        <footer className="sidebar-settings"><button onClick={() => preferences.current?.showModal()}><Settings size={16} /> 设置</button></footer>
      </aside>
      <div className="workspace-content">
      {storageMessage && <p className="storage-message warning" role="status">{storageMessage}</p>}
      {importError && <p className="storage-message warning" role="alert">{importError}</p>}
      {view === 'library' ? <StudyLibrary openPaper={choose} saved={library} /> : !paper || !current ?
        <ChatHome key={project?.id + ':' + conversation} field={project?.field || homeField} discipline={project?.discipline ?? homeDiscipline} project={project} style={style}
          connection={connection} model={activeModel} openSettings={() => modelDialog.current?.showModal()}
          openImport={openImport} openLibrary={() => setView('library')} upload={(file) => void upload(file)} importBusy={importBusy} openRecent={(next) => {
            if (list[0]) { choose(list[0]); setTab(next) } else setView('library')
          }} /> : <div className={`shell reader-shell ${tab === 'read' ? 'reader-deep' : ''}`}>
      <main>
        <div className="paper-header"><div className="paper-meta"><span className={`field-tag ${paper.field}`}>{disciplineLabel(paper.field, paper.discipline)}</span><span>{paper.format || `${paper.venue} · ${paper.year}`}</span></div>
          <h1>{paper.title}</h1>
          {(paper.author || paper.url) && <div className="byline">{paper.author && <span>{paper.author}</span>}{paper.url && <a href={paper.url} target="_blank" rel="noreferrer">论文来源 <ArrowUpRight size={14} /></a>}</div>}
          {paper.partial && <p className="warning" role="status">部分页面没有提取到文字，可打开 PDF 原版，核对缺少的页面。</p>}
        </div>
        <nav className="tabs" aria-label="论文阅读视图">{tabs.map(([id, label, Icon]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setError('') }}><Icon size={16} />{label}</button>)}</nav>
        <div className="feedback" aria-live="polite">{busy && <div className="notice" role="status">{busy}<button onClick={() => { request.current?.abort(); setBusy('') }}>取消</button></div>}{error && <div className="warning" role="alert">{error}</div>}</div>
        <div hidden={tab !== 'read'}><DeepReader key={paper.id} paper={paper} owner={owner} style={style} model={activeModel} connection={connection}
          openSettings={() => modelDialog.current?.showModal()} /></div>
        {(tab === 'compare' || tab === 'graph') && <section className="tab-content discovery">
          <div className="source-heading"><h2>{tab === 'compare' ? '查找同类研究' : '论文在领域中的位置'}</h2>
            {activeModel ? <button className="primary" disabled={!!busy} onClick={findRelated}><Search size={15} />{discovery ? '重新检索' : '检索并分析'}</button>
              : <button className="primary" onClick={() => modelDialog.current?.showModal()}>连接模型</button>}
          </div>
          <p className="subtle">将题名和部分原文发送给当前模型，生成检索词后在 Crossref 查找论文。</p>
          {discovery && <p className="subtle" role="status">检索词 · {discovery.query}</p>}
          {discovery && !discovery.works.length && <div className="empty">这次没有找到可确认的相近工作，可重新检索或导入对照论文。</div>}
          {tab === 'compare' && !!discovery?.works.length && <MethodTable works={discovery.works} />}
          {tab === 'graph' && !!discovery?.works.length && <>
            <p className="field-position">{discovery.position}</p>
            <LiteratureMap key={discovery.query} title={paper.title} year={paper.year || discovery.year || ''} works={discovery.works} />
          </>}
        </section>}
        {tab === 'compare' && <>
          <section className="tab-content"><h2>对比我的论文</h2>
            {sameField.length ? <form onSubmit={comparePapers}>
              <label className="question">同领域论文<select value={comparisonId} required onChange={(event) => { setComparisonId(event.target.value); setComparison(null) }}><option value="">选择一篇论文</option>
                {sameField.map((item) => <option key={item.id} value={item.id}>{item.short}</option>)}</select></label>
              <div className="form-actions"><span>将当前文段与所选论文的前 3 段发送给当前模型。</span><button className="primary" disabled={!activeModel || !!busy}><Columns3 size={15} /> 对照讲解</button></div>
            </form> : <div className="empty">论文库中暂无同领域的另一篇论文。<button className="text-button" onClick={openImport}> 导入论文</button></div>}
            {comparison && <div className="ai-result"><div className="kicker">{comparison.model} · 引文已核对</div><h3>方法与证据</h3><p>{comparison.explanation}</p><h3>具体差异</h3><p>{comparison.example}</p><h3>证据范围</h3><p>{comparison.limits}</p>
              <ul>{comparison.evidence.map((ref, i) => <li key={i}>{ref.id === 'a' ? '论文 A' : '论文 B'} · {ref.quote}</li>)}</ul></div>}
          </section>
        </>}
        {tab === 'source' && <div className="tab-content"><div className="source-heading"><h2>{current.title}</h2>{paper.url && <a href={paper.url} target="_blank" rel="noreferrer">查看论文 <ArrowUpRight size={15} /></a>}</div>
          {paper.original && paper.format === 'PDF' ? <PdfOriginal key={paper.id} original={paper.original} page={Number(current.title.match(/\d+/)?.[0]) || 1} />
            : paper.original && paper.format === 'DOCX' ? <WordOriginal key={paper.id} original={paper.original} anchor={current.text.slice(0, 60)} />
              : paper.original && ['MD', 'TXT'].includes(paper.format ?? '') ? <TextOriginal key={paper.id} original={paper.original} anchor={current.text.slice(0, 60)} />
                : <blockquote>{current.text}</blockquote>}
        </div>}
      </main>
      {tab !== 'read' && <aside className="evidence" aria-label="论文证据">
        <div className="rail-heading"><FileText size={16} /><h2>阅读原文</h2></div>
        <p className="subtle">{paper.format === 'PDF' ? '按页查看原文，点击页码跳转。' : '按提取段落定位。'}</p>
        <div className="evidence-list">{paper.blocks.map((block, index) => <button key={block.id} className={source === block.id ? 'source-active' : ''} aria-current={source === block.id ? 'true' : undefined} onClick={() => openSource(block.id)}>
          <span>{paper.format === 'PDF' ? block.title : `文段 ${index + 1}`}</span><ChevronRight size={15} />
        </button>)}</div>
      </aside>}
    </div>}
    </div></div>
    <Preferences dialog={preferences} user={user} onUser={onUser} theme={theme} onTheme={changeTheme} style={style} onStyle={(next) => {
      setStyle(next)
      try { rememberStyle(owner, next) } catch { setStorageMessage('浏览器未能保存讲解偏好。') }
    }} openAccount={() => account.current?.showModal()} />
    <dialog ref={historyDialog} onClose={() => setHistoryAction(undefined)}>
      {historyAction && <form key={historyAction.item.id + historyAction.action} onSubmit={(event) => void editHistory(event)}>
        <h2>{historyAction.action === 'rename' ? '重命名历史记录' : '删除历史记录'}</h2>
        {historyAction.action === 'rename' ? <label>显示名称<input name="title" maxLength={180} required defaultValue={historyAction.item.historyTitle || historyAction.item.short} autoFocus /></label>
          : <p>删除「{historyAction.item.historyTitle || historyAction.item.short}」及其本地阅读进度？</p>}
        <div className="form-actions"><button type="button" disabled={historyBusy} onClick={() => historyDialog.current?.close()}>取消</button>
          <button className="primary" disabled={historyBusy}>{historyAction.action === 'rename' ? '保存名称' : '确认删除'}</button></div>
      </form>}
    </dialog>
    <WorkspaceDialogs user={user} onUser={onUser} account={account} project={projectDialog} onProject={(next) => {
      setProjects((current) => [next, ...current])
      selectProject(next)
    }} />
    <dialog ref={modal} onCancel={(event) => { if (importBusy) event.preventDefault() }}>
      <form onSubmit={addPaper}>
        <header><h2>导入论文</h2><button type="button" className="icon-button" aria-label="关闭" disabled={importBusy} onClick={() => modal.current?.close()}><X size={19} /></button></header>
        <label>学科领域<select value={importField} disabled={!!project} onChange={(event) => { setImportField(event.target.value as Field); setImportDiscipline('') }}>{Object.entries(fields).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <DisciplineSelect field={importField} value={importDiscipline} onChange={setImportDiscipline} disabled={!!project} />
        <label>选择文件（PDF、DOCX、Markdown、TXT）<input type="file" accept=".pdf,.docx,.md,.txt" onChange={(event) => setFile(event.target.files?.[0])} disabled={importBusy} /></label>
        <label>或粘贴论文标题<input value={importName} maxLength={180} onChange={(event) => setImportName(event.target.value)} disabled={!!file || importBusy} /></label>
        <label>论文正文<textarea value={importText} rows={4} maxLength={100000} onChange={(event) => setImportText(event.target.value)} disabled={!!file || importBusy} /></label>
        {importError && <p className="warning" role="alert">{importError}</p>}
        <button className="primary" disabled={importBusy}>{importBusy ? '正在提取文段…' : '导入到论文库'}</button>
      </form>
    </dialog>
    <ModelSettings key={connection ? 'custom-' + connection.base + connection.model : 'default'} dialog={modelDialog}
      current={connection} fallback={fallback} remembered={remembered} onChange={changeModel} />
  </>
}
