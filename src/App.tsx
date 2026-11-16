import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUpRight, BookOpen, CloudUpload, ChevronRight, Columns3, Ellipsis, FileText, Folder, Layers3, Moon, Network, Plus, Search, Settings, Sun, X } from 'lucide-react'
import { DeepReader } from './DeepReader'
import { ModelSettings, type Connection } from './ModelSettings'
import { customFieldPrefix, disciplineLabel, fieldIcon, fields, normalizeField, validDiscipline, type Field, type Paper, type Related, type Project } from './papers'
import { history, recallApis, recallConnection, recallStyle, rememberApis, rememberConnection, rememberPaper, rememberStyle, removeHistory, renameHistory, sameApi } from './storage'
import { LiteratureMap, MethodTable } from './Literature'
import { PdfOriginal, TextOriginal, WordOriginal } from './Original'
import { api, ChatHome, WorkspaceDialogs, type User } from './Workspace'
import { fileDrop } from './drop'
import { loadStudyPaper, StudyLibrary } from './StudyLibrary'
import { catalog } from './catalog'
import { Preferences, type SettingsTab } from './Preferences'
import { DisciplineSelect } from './DisciplineSelect'
import { readerSections, readingSections } from './sections'
import { applyTheme, readTheme, type Theme } from './theme'
import { modelFetch, modelStatus } from './modelStatus'
import { createConversation, listConversations, removeConversation, renameConversation, saveConversation, type Conversation } from './conversations'
import { normalizeEffort, readEffort, type Effort } from './effort'
import { References } from './References'
import { Intro, shouldPlayIntro } from './Intro'

const tabs = [['read', '全文精读', BookOpen], ['compare', '方法对比', Columns3], ['graph', '论文关系', Network], ['source', '文段', FileText]] as const
const presetProject: Project = { id: 'preset-library', title: '预设库', field: 'custom' }
const presetPaperIds = new Set(catalog.map(({ id }) => id))

function assignPresetProject(paper: Paper): Paper {
  return presetPaperIds.has(paper.id) && paper.projectId !== presetProject.id
    ? { ...paper, projectId: presetProject.id }
    : paper
}

const pdfTextMessages = {
  'no-text': '没有提取到可用正文，可以翻页查看原件。需要精读或问答时，请导入经过 OCR 的版本。',
  password: '文件有密码保护。可以打开原件输入密码，或导入解锁后的版本进行精读。',
  unreadable: '无法解析这份 PDF。可以下载已保存的文件，或重新导入完整的原版。',
  large: '文件超过 24 MB，已保留原件。可打开原件阅读，或导入压缩版进行精读。',
} as const
type Tab = typeof tabs[number][0]
type Explanation = { explanation: string; example: string; limits: string; evidence: { id: string; quote: string }[]; model: string }

async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await modelFetch(url, options)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || '请求失败，请重试。')
  return body as T
}

export function App() {
  const [user, setUser] = useState<User | null>(null)
  const [showIntro, setShowIntro] = useState(shouldPlayIntro)
  const finishIntro = useCallback(() => setShowIntro(false), [])
  useEffect(() => {
    void api<{ user: User | null }>('/api/session').then(({ user }) => setUser(user)).catch(() => {})
  }, [])
  if (showIntro) return <Intro onFinish={finishIntro} />
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
  const customFieldsKey = 'paper-atlas-fields-' + owner
  const [customFields, setCustomFields] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(customFieldsKey) ?? '[]')
      return Array.isArray(saved) ? saved.filter((name): name is string => typeof name === 'string') : []
    } catch { return [] }
  })
  const libraryFields = [
    ...Object.entries(fields),
    ...customFields.map((name) => [customFieldPrefix + name, name]),
  ]
  function addLibraryField(rawName: string) {
    const name = rawName.trim()
    if (!name || name.length > 60) throw new Error('请输入 1 到 60 个字符的领域名称。')
    if (libraryFields.some(([, label]) => label.toLowerCase() === name.toLowerCase())) throw new Error('这个领域名称已存在。')
    const next = [...customFields, name]
    try { localStorage.setItem(customFieldsKey, JSON.stringify(next)) }
    catch { throw new Error('浏览器未能保存新领域，请检查本地存储后重试。') }
    setCustomFields(next)
  }
  const [conversation, setConversation] = useState(() => createConversation(owner))
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [showChat, setShowChat] = useState(true)
  const conversationDialog = useRef<HTMLDialogElement>(null)
  const [conversationAction, setConversationAction] = useState<{ item: Conversation; action: 'rename' | 'delete' }>()
  const [view, setView] = useState<'workspace' | 'library'>('workspace')
  const [libraryTab, setLibraryTab] = useState<'mine' | 'preset'>('preset')
  const [projects, setProjects] = useState<Project[]>([presetProject])
  const [project, setProject] = useState<Project>()
  const importProject = view === 'library' ? undefined : project
  const account = useRef<HTMLDialogElement>(null)
  const preferences = useRef<HTMLDialogElement>(null)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('profile')
  const [settingsVersion, setSettingsVersion] = useState(0)
  function openSettings(tab: SettingsTab = 'model') {
    setSettingsTab(tab)
    setSettingsVersion((version) => version + 1)
    preferences.current?.showModal()
  }
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
  const recent = project ? library.find((item) => item.projectId === project.id) : library[0]
  const [paper, setPaper] = useState<Paper>()
  const [exampleSection, setExampleSection] = useState<string>()
  const [tab, setTab] = useState<Tab>('read')
  const [source, setSource] = useState('')
  const [fallback, setFallback] = useState('')
  const [connection, setConnection] = useState<Connection | null>(() => recallConnection(owner))
  const [savedApis, setSavedApis] = useState(() => recallApis(owner))
  const [defaultEffort, setDefaultEffort] = useState(readEffort)
  const [remembered, setRemembered] = useState(() => !!connection)
  const [storageMessage, setStorageMessage] = useState('')
  const [historyReady, setHistoryReady] = useState(false)
  const activeModel = connection?.model || fallback
  const [, refreshStatus] = useState(0)
  useEffect(() => {
    const refresh = () => refreshStatus((value) => value + 1)
    window.addEventListener('paper-atlas-model-status', refresh)
    return () => window.removeEventListener('paper-atlas-model-status', refresh)
  }, [])
  const status = modelStatus(connection)
  const modelIssue = !connection && status.lastError ? '默认模型不可用，请在设置中切换。' : ''
  const [comparison, setComparison] = useState<Explanation | null>(null)
  const [comparisonId, setComparisonId] = useState('')
  const [comparisonPaper, setComparisonPaper] = useState<Paper>()
  const [comparisonSection, setComparisonSection] = useState('')
  const [currentSection, setCurrentSection] = useState('')
  const [comparisonBusy, setComparisonBusy] = useState(false)
  const [comparisonError, setComparisonError] = useState('')
  const [comparisonText, setComparisonText] = useState('')
  const [saveComparison, setSaveComparison] = useState(false)
  const comparisonInput = useRef<HTMLInputElement>(null)
  const comparisonVersion = useRef(0)
  const [discovery, setDiscovery] = useState<{ query: string; position: string; works: Related[]; year?: string; source: 'crossref' | 'library' | 'mixed' }>()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const modal = useRef<HTMLDialogElement>(null)
  const dropInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File>()
  const [importName, setImportName] = useState('')
  const [importText, setImportText] = useState('')
  const [importFieldChoice, setImportFieldChoice] = useState('')
  const importCustomField = importFieldChoice.startsWith(customFieldPrefix) ? importFieldChoice.slice(customFieldPrefix.length) : undefined
  const importField = importCustomField ? 'custom' : importFieldChoice as Field | ''
  const [importDiscipline, setImportDiscipline] = useState('')
  const validImportDiscipline = !!importField && !!importDiscipline.trim() && validDiscipline(importField, importDiscipline)
  const [existingPaperId, setExistingPaperId] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState('')
  const request = useRef<AbortController | null>(null)
  useEffect(() => {
    let active = true
    void listConversations(owner).then((items) => {
      if (active) setConversations((current) => [...current, ...items.filter((item) => !current.some(({ id }) => id === item.id))])
    }).catch(() => { if (active) setStorageMessage('暂时无法读取已保存的对话。') })
    return () => { active = false }
  }, [owner])

  useEffect(() => { json<{ live: boolean; model: string }>('/api/config').then((info) => setFallback(info.live ? info.model : '')).catch(() => {}) }, [])
  useEffect(() => {
    void history(owner).then((saved) => setLibrary((current) => [
      ...current,
      ...saved.filter(({ id }) => !current.some((item) => item.id === id))
        .map((item) => assignPresetProject({ ...item, field: normalizeField(item.field) })),
    ]))
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
    setRemembered(!!next && remember)
    try {
      const apis = next && remember ? [next, ...savedApis.filter((item) => !sameApi(item, next))] : savedApis
      if (apis.length) rememberApis(owner, apis)
      rememberConnection(remember ? next : null, owner)
      setSavedApis(apis)
    } catch { setStorageMessage('模型设置已应用，但浏览器未能记住连接。') }
  }

  function removeApi(api: Connection) {
    const apis = savedApis.filter((item) => !sameApi(item, api))
    if (sameApi(connection, api)) {
      rememberConnection(null, owner)
      setRemembered(false)
    }
    rememberApis(owner, apis)
    setSavedApis(apis)
  }

  function renameApi(api: Connection, name: string) {
    const apis = savedApis.map((item) => sameApi(item, api) ? { ...item, name } : item)
    rememberApis(owner, apis)
    setSavedApis(apis)
    if (connection && sameApi(connection, api)) {
      const renamed = { ...connection, name }
      setConnection(renamed)
      if (remembered) rememberConnection(renamed, owner)
    }
  }

  function changeEffort(next: Effort) {
    if (connection) { changeModel({ ...connection, effort: next }, remembered); return }
    setDefaultEffort(next)
    try { localStorage.setItem('paper-atlas-default-effort', next) } catch {}
  }

  function choose(selected: Paper, alreadySaved = false, initialSection?: string) {
    const next = assignPresetProject(selected)
    setExampleSection(initialSection)
    setView('workspace')
    setShowChat(false)
    setProject((current) => current?.id === next.projectId ? current : projects.find((item) => item.id === next.projectId))
    if (conversation.projectId !== next.projectId) setConversation(createConversation(owner, next.projectId))
    if (paper?.id === next.id && paper.discipline === next.discipline && paper.field === next.field && paper.projectId === next.projectId) {
      if (initialSection) setTab('read')
      return
    }
    request.current?.abort()
    setPaper(next.original ? { ...next, pdfUrl: URL.createObjectURL(next.original) } : next)
    setLibrary((current) => [{ ...next, lastOpened: Date.now() }, ...current.filter(({ id }) => id !== next.id)])
    if (!alreadySaved) void rememberPaper(next, owner).catch(() => setStorageMessage('浏览器未能保存这篇论文，当前仍可阅读。'))
    setSource(next.blocks[0]?.id ?? '1')
    setTab('read')
    setDiscovery(undefined)
    setComparison(null)
    setComparisonId('')
    setComparisonPaper(undefined)
    setComparisonSection('')
    setComparisonError('')
    setComparisonText('')
    setSaveComparison(false)
    setComparisonBusy(false)
    comparisonVersion.current++
    setBusy('')
    setError('')
  }

  function resetPaper() {
    request.current?.abort()
    setPaper(undefined)
    setShowChat(true)
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
    request.current?.abort()
    setShowChat(true)
    setProject(next)
    setConversation(createConversation(owner, next?.id))
    setView('workspace')
  }

  function openConversation(item: Conversation) {
    request.current?.abort()
    setProject(projects.find(({ id }) => id === item.projectId))
    setConversation(item)
    setShowChat(true)
    setView('workspace')
  }

  function newConversation() {
    openConversation(createConversation(owner, project?.id))
  }

  async function updateConversation(next: Conversation) {
    if (!next.turns.length) return
    await saveConversation(next, owner)
    setConversation((current) => current.id === next.id ? next : current)
    setConversations((items) => [next, ...items.filter(({ id }) => id !== next.id)])
  }

  async function editConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!conversationAction || historyBusy) return
    const { item, action } = conversationAction
    const title = String(new FormData(event.currentTarget).get('title') || '').trim()
    if (action === 'rename' && !title) return
    setHistoryBusy(true)
    try {
      if (action === 'rename') {
        await renameConversation(item.id, title, owner)
        setConversations((items) => items.map((entry) => entry.id === item.id ? { ...entry, title } : entry))
        setConversation((current) => current.id === item.id ? { ...current, title } : current)
      } else {
        await removeConversation(item.id, owner)
        setConversations((items) => items.filter(({ id }) => id !== item.id))
        if (conversation.id === item.id) newConversation()
      }
      conversationDialog.current?.close()
    } catch { setStorageMessage('未能更新对话，请重试。') }
    finally { setHistoryBusy(false) }
  }

  function openImport(selected?: File) {
    if (importBusy) return
    setImportError('')
    setImportName('')
    setImportText('')
    setExistingPaperId('')
    setImportFieldChoice(importProject?.field ?? '')
    setImportDiscipline(importProject?.discipline ?? '')
    setFile(undefined)
    modal.current?.querySelector('form')?.reset()
    if (selected) void selectImportFile(selected)
    else modal.current?.showModal()
  }

  async function selectImportFile(selected: File) {
    if (importBusy) return
    setImportBusy(true)
    setImportError('')
    try {
      const { findOriginal } = await import('./import')
      const saved = historyReady ? library : await history(owner).catch(() => library)
      const sameScope = importProject ? saved.filter((item) => item.projectId === importProject.id) : saved
      const existing = await findOriginal(selected, sameScope)
      if (existing) {
        modal.current?.close()
        choose(existing)
        return
      }
    } catch { /* Continue to import if the browser could not compare the files. */ }
    finally { setImportBusy(false) }
    setFile(selected)
    if (!modal.current?.open) modal.current?.showModal()
  }

  async function addPaper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (importBusy) return
    setImportError('')
    setImportBusy(true)
    try {
      if (existingPaperId && importProject) {
        const existing = library.find((item) => item.id === existingPaperId && (!item.projectId || item.projectId === importProject.id))
        if (!existing) throw new Error('这篇论文已不在可添加列表中。')
        choose({ ...existing, projectId: importProject.id })
      } else {
        if (!importField || !validImportDiscipline || (!file && !importText.trim())) throw new Error('请选择文件或粘贴正文，并填写学科领域和具体专业。')
        const { importPaper, makePaper, textBlocks } = await import('./import')
        const next = file ? await importPaper(file, importField) : makePaper(importName, textBlocks(importText), importField, '粘贴文本')
        const imported = { ...next, projectId: importProject?.id, discipline: importDiscipline.trim(), customField: importCustomField }
        await rememberPaper(imported, owner).catch(() => { throw new Error('浏览器未能保存原件，请检查本地存储空间后重试。') })
        if (view === 'library') setLibraryTab('mine')
        choose(imported, true)
      }
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

  function selectComparison(draft?: Paper, id = '') {
    setComparisonPaper(draft)
    setComparisonId(id)
    setComparisonSection('')
    setComparison(null)
    setComparisonError('')
    setSaveComparison(false)
  }

  async function importComparison(file?: File) {
    if (!paper || comparisonBusy || (!file && !comparisonText.trim())) return
    const version = ++comparisonVersion.current
    setComparisonBusy(true)
    setComparisonError('')
    try {
      const { importPaper, makePaper, textBlocks } = await import('./import')
      const result = file ? await importPaper(file, paper.field) : makePaper('粘贴的对照论文', textBlocks(comparisonText), paper.field, '粘贴文本')
      if (!result.blocks.length) throw new Error('这份 PDF 没有可用于对比的正文。请粘贴正文或选择有文字层的 PDF。')
      if (version === comparisonVersion.current) {
        selectComparison(result)
        setComparisonText('')
      }
    } catch (reason) {
      if (version === comparisonVersion.current) setComparisonError((reason as Error).message)
    } finally { if (version === comparisonVersion.current) setComparisonBusy(false) }
  }

  async function comparePapers(event: FormEvent) {
    event.preventDefault()
    if (!paper || !current) return
    const target = comparisonPaper ?? library.find((item) => item.id === comparisonId && item.id !== paper.id)
    if (!target) return
    const sourceSections = readerSections(paper.blocks).filter(({ kind }) => !kind)
    const a = sourceSections.find(({ id }) => id === currentSection)
      ?? sourceSections.find(({ title }) => /^(abstract|摘要)/i.test(title)) ?? sourceSections[0]
    const targetSections = readerSections(target.blocks).filter(({ kind }) => !kind)
    const b = targetSections.find(({ id }) => id === comparisonSection)
      ?? targetSections.find(({ title }) => /^(abstract|摘要)/i.test(title))
    setComparison(null)
    setComparisonError('')
    if (comparisonPaper && saveComparison && !library.some(({ id }) => id === target.id)) {
      try {
        await rememberPaper(target, owner)
        setLibrary((items) => [target, ...items.filter(({ id }) => id !== target.id)])
      } catch { setComparisonError('对照论文未能保存，请检查浏览器存储。'); return }
    }
    const blocks = [
      { id: 'a', title: `论文 A · ${a?.title || current.title}`.slice(0, 100), text: (a?.blocks.map(({ text }) => text).join('\n') || current.text).slice(0, 5000) },
      ...(b?.blocks ?? targetSections.flatMap(({ blocks }) => blocks)).slice(0, b ? 5 : 3).map((block, i) => ({
        ...block, id: `b${i}`, title: `论文 B · ${block.title}`.slice(0, 100), text: block.text.slice(0, 5000),
      })),
    ]
    void run('正在对照两篇论文的所选文段…', (signal) => json<Explanation>('/api/explain', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ title: '两篇论文的文段对比', field: paper.field, style, blocks, compare: true, connection,
        question: `A：《${paper.title.slice(0, 230)}》；B：《${target.title.slice(0, 230)}》。` }),
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
  const selectablePapers = importProject ? library.filter((item) => !item.projectId || item.projectId === importProject.id) : []
  const opensExistingPaper = selectablePapers.some((item) => item.id === existingPaperId && item.projectId === importProject?.id)
  const visibleConversations = project ? conversations.filter((item) => item.projectId === project.id) : conversations
  const sameField = library.filter((item) => item.field === paper?.field && item.id !== paper?.id && item.blocks.length)
  const comparisonTarget = comparisonPaper ?? sameField.find((item) => item.id === comparisonId)

  return <>
    <header className="workspace-top">
      <button className="workspace-brand" onClick={() => { resetPaper(); selectProject(undefined) }}><Layers3 size={20} /> Paper Atlas</button>
      <nav aria-label="工作区">
        <button aria-current={view === 'workspace' ? 'page' : undefined} onClick={() => setView('workspace')}>科研工作台</button>
        <button aria-current={view === 'library' ? 'page' : undefined} onClick={() => setView('library')}>学习库</button>
      </nav>
      <button className="theme-toggle" aria-label={dark ? '切换浅色主题' : '切换深色主题'} onClick={() => changeTheme(dark ? 'light' : 'dark')}>{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
      <button className="account-trigger" onClick={() => account.current?.showModal()}>{user?.displayName || user?.name || '登录 / 注册'}</button>
    </header>
    <input type="file" hidden ref={dropInput} accept=".pdf,.docx,.md,.txt" onChange={(event) => {
      const selected = event.target.files?.[0]
      event.target.value = ''
      if (selected) openImport(selected)
    }} />
    <div className="desktop-workspace">
      <aside className="workspace-sidebar" aria-label="论文库和项目" {...fileDrop(openImport)}>
        <button className="sidebar-new" onClick={newConversation}><Plus size={17} /> 新对话</button>
        <div className="sidebar-heading"><span>项目</span><button aria-label="新建项目" onClick={() => (user ? projectDialog : account).current?.showModal()}><Plus size={15} /></button></div>
        {project && <button className="sidebar-row" onClick={() => selectProject(undefined)}><Folder size={15} /> 全部论文</button>}
        {projects.map((item) => {
          const preset = item.id === presetProject.id
          const Icon = preset ? BookOpen : fieldIcon[item.field]
          return <button className="sidebar-row" aria-current={item.id === project?.id ? 'true' : undefined} onClick={() => selectProject(item)} key={item.id}>
            <Icon size={15} aria-hidden="true" /><span>{item.title}</span>
            {!preset && <small>{disciplineLabel(item.field, item.discipline)}</small>}
          </button>
        })}
        <div className="sidebar-heading"><span>{project ? '项目对话' : '对话'}</span></div>
        {visibleConversations.length ? <div className="sidebar-list conversation-list">{visibleConversations.map((item) => <div className="history-row" key={item.id}>
          <button className="sidebar-row" title={item.title} aria-current={showChat && view === 'workspace' && conversation.id === item.id ? 'true' : undefined} onClick={() => openConversation(item)}><span>{item.title}</span></button>
          <details className="history-menu"><summary aria-label={'管理对话 ' + item.title}><Ellipsis size={16} /></summary><div>
            {(['rename', 'delete'] as const).map((action) => <button key={action} onClick={(event) => {
              event.currentTarget.closest('details')?.removeAttribute('open')
              setConversationAction({ item, action }); conversationDialog.current?.showModal()
            }}>{action === 'rename' ? '重命名' : '删除'}</button>)}
          </div></details>
        </div>)}</div> : <p className="sidebar-empty">暂无对话</p>}
        <div className="sidebar-heading"><span>{project ? '项目论文' : '论文库'}</span><button aria-label={project ? '添加项目论文' : '粘贴或导入论文'} onClick={() => openImport()}><Plus size={15} /></button></div>
        <button className="sidebar-drop" disabled={importBusy} onClick={() => project ? openImport() : dropInput.current?.click()}><CloudUpload size={19} /> {importBusy ? '正在读取论文…' : project ? '添加或拖入项目论文' : '拖入或点击上传'}</button>
        {!project && <div className="sidebar-heading"><span>阅读历史</span></div>}
        {list.length ? <div className="sidebar-list">{list.map((item) => { const Icon = fieldIcon[item.field]; return <div className="history-row" key={item.id}>
          <button className="sidebar-row" aria-label={item.historyTitle || item.title} title={item.historyTitle || item.title} aria-current={paper?.id === item.id && view === 'workspace' ? 'true' : undefined} onClick={() => choose(item)}><Icon size={15} role="img" aria-label={fields[item.field] + '论文'} /><span>{item.historyTitle || item.short}</span></button>
          <details className="history-menu"><summary aria-label={`管理 ${item.historyTitle || item.short}`}><Ellipsis size={16} /></summary><div>
            {(['rename', 'delete'] as const).map((action) => <button key={action} onClick={(event) => {
              event.currentTarget.closest('details')?.removeAttribute('open')
              setHistoryAction({ item, action }); historyDialog.current?.showModal()
            }}>{action === 'rename' ? '重命名' : '删除'}</button>)}
          </div></details>
        </div> })}</div>
          : <p className="sidebar-empty">{historyReady ? project ? '暂无项目论文' : '暂无阅读记录' : '正在读取历史…'}</p>}
        <footer className="sidebar-settings"><button onClick={() => openSettings()}><Settings size={16} /> 设置</button></footer>
      </aside>
      <div className="workspace-content">
      {storageMessage && <p className="storage-message warning" role="status">{storageMessage}</p>}
      {modelIssue && view === 'workspace' && <p className="storage-message warning" role="status">{modelIssue}</p>}
      {view === 'library' ? <StudyLibrary openPaper={choose} saved={library} owner={owner} tab={libraryTab} onTab={setLibraryTab} onUpload={() => openImport()}
          libraryFields={libraryFields} onAddField={addLibraryField}
          onRemove={(item) => { setHistoryAction({ item, action: 'delete' }); historyDialog.current?.showModal() }} /> :
      !showChat && paper?.pdfTextStatus && paper.original ? <div className="shell reader-shell reader-deep"><main>
        <div className="paper-header">
          <div className="paper-meta"><span className="field-tag">{disciplineLabel(paper.field, paper.discipline)}</span><span>PDF · 原件已保存</span></div>
          <h1>{paper.title}</h1>
          <p className="warning" role="status">{pdfTextMessages[paper.pdfTextStatus]}</p>
          <div className="original-tools">
            {paper.pdfTextStatus !== 'unreadable' && <a className="secondary" href={paper.pdfUrl} target="_blank" rel="noreferrer">打开原件</a>}
            <a className="secondary" href={paper.pdfUrl} download={paper.original instanceof File ? paper.original.name : `${paper.title}.pdf`}>下载原件</a>
          </div>
        </div>
        {paper.pdfTextStatus === 'no-text' && <>
          {Boolean(paper.pdfPages && paper.pdfPages > 1) && <label className="original-tools">PDF 页码 <select value={source} onChange={(event) => setSource(event.target.value)}>
            {Array.from({ length: paper.pdfPages ?? 1 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
          </select></label>}
          <PdfOriginal key={paper.id} original={paper.original} page={Number(source) || 1} />
        </>}
      </main></div> : showChat || !paper || !current ?
        <ChatHome key={conversation.id} conversation={conversation} onChange={updateConversation} user={user} field={project?.field || 'custom'} discipline={project?.discipline} project={project} style={style}
          effort={connection ? normalizeEffort(connection.effort) : defaultEffort} onEffort={changeEffort} onModel={(model) => { if (connection) changeModel({ ...connection, model }, remembered) }}
          connection={connection} model={activeModel} status={status} openSettings={openSettings}
          projectPapers={list} openPaper={choose}
          openImport={() => project ? openImport() : dropInput.current?.click()} openLibrary={() => { setLibraryTab('mine'); setView('library') }}
          onExample={async (signal) => {
            const item = catalog.find(({ id }) => id === 'arxiv-1706.03762')
            if (!item) throw new Error('试读示例暂不可用。')
            const sample = await loadStudyPaper(item, library, signal)
            if (!signal.aborted) choose(sample, false, 'Scaled Dot-Product Attention')
          }} upload={openImport} importBusy={importBusy}
          recent={recent} openRecent={() => { if (recent) { choose(recent); setTab('read') } }} newConversation={newConversation} /> : <div className={`shell reader-shell ${tab === 'read' ? 'reader-deep' : ''}`}>
      <main>
        <div className="paper-header"><div className="paper-meta"><span className={`field-tag ${paper.field}`}>{disciplineLabel(paper.field, paper.discipline)}</span><span>{paper.format || `${paper.venue} · ${paper.year}`}</span></div>
          <h1>{paper.title}</h1>
          {(paper.author || paper.url) && <div className="byline">{paper.author && <span>{paper.author}</span>}{paper.url && <a href={paper.url} target="_blank" rel="noreferrer">论文来源 <ArrowUpRight size={14} /></a>}</div>}
          {paper.partial && <p className="warning" role="status">部分页面没有提取到文字，可打开 PDF 原版，核对缺少的页面。</p>}
        </div>
        <nav className="tabs" aria-label="论文阅读视图">{tabs.map(([id, label, Icon]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setError('') }}><Icon size={16} />{label}</button>)}</nav>
        <div className="feedback" aria-live="polite">{busy && <div className="notice" role="status">{busy}<button onClick={() => { request.current?.abort(); setBusy('') }}>取消</button></div>}{error && <div className="warning" role="alert">{error}</div>}</div>
        <div hidden={tab !== 'read'}><DeepReader key={paper.id + (exampleSection ?? '')} paper={paper} owner={owner} style={style} model={activeModel} connection={connection} initialSection={exampleSection}
          openSettings={openSettings} onSection={setCurrentSection} visible={tab === 'read'} profile={user ?? undefined} /></div>
        {(tab === 'compare' || tab === 'graph') && <section className="tab-content discovery">
          <div className="source-heading"><h2>{tab === 'compare' ? '查找同类研究' : '论文在领域中的位置'}</h2>
            {activeModel ? <button className="primary" disabled={!!busy} onClick={findRelated}><Search size={15} />{discovery ? '重新检索' : '检索并分析'}</button>
              : <button className="primary" onClick={() => openSettings()}>连接模型</button>}
          </div>
          <p className="subtle">根据题名和部分原文生成检索词，优先检索 Crossref，必要时查找学习库。</p>
          {discovery && <p className="subtle" role="status">{discovery.works.length} 篇 · 来源 · {discovery.source === 'mixed' ? 'Crossref 与本地收录资料' : discovery.source === 'library' ? '本地收录资料' : 'Crossref'} · 检索词 · {discovery.query}</p>}
          {discovery && !discovery.works.length && <div className="empty">这次没有找到可确认的相近工作，可重新检索或导入对照论文。</div>}
          {tab === 'compare' && !!discovery?.works.length && <MethodTable works={discovery.works} />}
          {tab === 'graph' && !!discovery?.works.length && <>
            <p className="field-position">{discovery.position}</p>
            <LiteratureMap key={discovery.query} title={paper.title} year={paper.year || discovery.year || ''} works={discovery.works} />
          </>}
        </section>}
        {tab === 'compare' && <>
          <section className="tab-content" {...fileDrop((file) => void importComparison(file))}><h2>对比我的论文</h2>
            <form onSubmit={(event) => void comparePapers(event)}>
              <input hidden type="file" accept=".pdf,.docx,.md,.txt" ref={comparisonInput} onChange={(event) => {
                const file = event.target.files?.[0]; event.target.value = ''; if (file) void importComparison(file)
              }} />
              <button type="button" className="secondary" disabled={comparisonBusy || !!busy} onClick={() => comparisonInput.current?.click()}><CloudUpload size={16} />{comparisonBusy ? '正在读取对照论文…' : '拖入或上传对照论文'}</button>
              <label className="question">从论文库选择<select value={comparisonId} disabled={comparisonBusy || !!busy} onChange={(event) => selectComparison(undefined, event.target.value)}><option value="">选择一篇论文</option>
                {sameField.map((item) => <option key={item.id} value={item.id}>{item.short}</option>)}</select></label>
              <details><summary>粘贴对照论文正文</summary><textarea aria-label="对照论文正文" rows={3} maxLength={100000} value={comparisonText} onChange={(event) => setComparisonText(event.target.value)} />
                <button type="button" className="secondary" disabled={comparisonBusy || !comparisonText.trim()} onClick={() => void importComparison()}>使用正文</button></details>
              {comparisonError && <p className="warning" role="alert">{comparisonError}</p>}
              {comparisonTarget && <div className="relation-detail">
                <div className="source-heading"><h3>{comparisonTarget.title}</h3><button type="button" className="text-button" disabled={!!busy} onClick={() => selectComparison()}>移除</button></div>
                <p>{comparisonTarget.format} · {comparisonTarget.blocks.length} {comparisonTarget.format === 'PDF' ? '页' : '段'} · {disciplineLabel(comparisonTarget.field, comparisonTarget.discipline)}</p>
                {comparisonPaper && <label><input type="checkbox" checked={saveComparison} onChange={(event) => setSaveComparison(event.target.checked)} /> 同时保存到论文库</label>}
                <label className="question">对照章节<select value={comparisonSection} onChange={(event) => setComparisonSection(event.target.value)}><option value="">摘要 / 前 3 段</option>
                  {readerSections(comparisonTarget.blocks).filter(({ kind }) => !kind).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
              </div>}
              <div className="form-actions"><span>对照当前精读章节与所选材料。</span><button className="primary" disabled={!comparisonTarget || !activeModel || !!busy || comparisonBusy}><Columns3 size={15} /> 对照讲解</button></div>
            </form>
            {comparison && <div className="ai-result"><div className="kicker">{comparison.model} · 引文已核对</div><h3>方法与证据</h3><p>{comparison.explanation}</p><h3>具体差异</h3><p>{comparison.example}</p><h3>证据范围</h3><p>{comparison.limits}</p>
              <ul>{comparison.evidence.map((ref, i) => <li key={i}>{ref.id === 'a' ? '论文 A' : '论文 B'} · {ref.quote}</li>)}</ul></div>}
          </section>
        </>}
        {tab === 'source' && <div className="tab-content"><div className="source-heading"><h2>{current.title}</h2>{paper.url && <a href={paper.url} target="_blank" rel="noreferrer">查看论文 <ArrowUpRight size={15} /></a>}</div>
          {paper.original && paper.format === 'PDF' ? <PdfOriginal key={paper.id} original={paper.original} page={Number(current.title.match(/\d+/)?.[0]) || 1} />
            : paper.original && paper.format === 'DOCX' ? <WordOriginal key={paper.id} original={paper.original} anchor={current.text.slice(0, 60)} />
              : paper.original && ['MD', 'TXT'].includes(paper.format ?? '') ? <TextOriginal key={paper.id} original={paper.original} anchor={current.text.slice(0, 60)} />
                : <blockquote>{current.text}</blockquote>}
          <References key={paper.id} />
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
    <Preferences dialog={preferences} user={user} onUser={onUser} theme={theme} onTheme={changeTheme} tab={settingsTab} onTab={setSettingsTab}
      modelPanel={<ModelSettings key={settingsVersion + ':' + (connection?.model || 'default')}
        current={connection} fallback={fallback} remembered={remembered} savedApis={savedApis} onRemoveApi={removeApi} onRenameApi={renameApi} onChange={changeModel} onClose={() => preferences.current?.close()} />}
      style={style} onStyle={(next) => {
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
    <dialog ref={conversationDialog} onClose={() => setConversationAction(undefined)}>
      {conversationAction && <form onSubmit={(event) => void editConversation(event)}>
        <h2>{conversationAction.action === 'rename' ? '重命名对话' : '删除对话'}</h2>
        {conversationAction.action === 'rename' ? <label>对话名称<input required name="title" maxLength={100} defaultValue={conversationAction.item.title} /></label> : <p>删除「{conversationAction.item.title}」这条对话？</p>}
        <div className="form-actions"><button type="button" disabled={historyBusy} onClick={() => conversationDialog.current?.close()}>取消</button>
          <button className="primary" disabled={historyBusy}>{conversationAction.action === 'rename' ? '保存名称' : '确认删除'}</button></div>
      </form>}
    </dialog>
    <WorkspaceDialogs user={user} onUser={onUser} account={account} project={projectDialog} onProject={(next) => {
      setProjects((current) => [next, ...current])
      selectProject(next)
    }} />
    <dialog ref={modal} onCancel={(event) => { if (importBusy) event.preventDefault() }}>
      <form onSubmit={addPaper}>
        <header><h2>{importProject ? '添加项目论文' : '导入论文'}</h2><button type="button" className="icon-button" aria-label="关闭" disabled={importBusy} onClick={() => modal.current?.close()}><X size={19} /></button></header>
        <p className="subtle">{importProject ? '添加到「' + importProject.title + '」' : '导入到「我的论文」，按所选领域归类。'}</p>
        {selectablePapers.length > 0 && !file && <label>从已有论文选择<select value={existingPaperId} disabled={importBusy} onChange={(event) => setExistingPaperId(event.target.value)}>
          <option value="">上传文件或粘贴正文</option>
          {selectablePapers.map((item) => <option key={item.id} value={item.id}>{item.historyTitle || item.title}</option>)}
        </select></label>}
        {!existingPaperId && <>
        {file ? <div className="form-actions"><span>已选择 {file.name}</span><button type="button" disabled={importBusy} onClick={() => { setFile(undefined); setImportError('') }}>更换文件</button></div> :
          <label>选择文件（PDF、DOCX、Markdown、TXT）<input type="file" accept=".pdf,.docx,.md,.txt" onChange={(event) => {
            const selected = event.target.files?.[0]; if (selected) void selectImportFile(selected)
          }} disabled={importBusy} /></label>}
        <label>学科领域<select required value={importFieldChoice} disabled={!!importProject || importBusy} onChange={(event) => { setImportFieldChoice(event.target.value); setImportDiscipline('') }}><option value="">请选择领域</option>{libraryFields.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        {importField && <DisciplineSelect field={importField} value={importDiscipline} onChange={setImportDiscipline} disabled={!!importProject?.discipline || importBusy} required />}
        <label>或粘贴论文标题<input value={importName} maxLength={180} onChange={(event) => setImportName(event.target.value)} disabled={!!file || importBusy} /></label>
        <label>论文正文<textarea value={importText} rows={4} maxLength={100000} onChange={(event) => setImportText(event.target.value)} disabled={!!file || importBusy} /></label>
        </>}
        {importError && <p className="warning" role="alert">{importError}</p>}
        <button className="primary" disabled={importBusy || (!existingPaperId && (!validImportDiscipline || (!file && !importText.trim())))}>{importBusy ? '正在处理…' : opensExistingPaper ? '打开论文' : importProject ? '添加到项目' : '导入到我的论文'}</button>
      </form>
    </dialog>
  </>
}
