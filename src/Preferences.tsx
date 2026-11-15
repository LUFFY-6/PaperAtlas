import { useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'
import { disciplineOptions, readingStyles, type Field, type ReadingStyle } from './papers'
import { api, type User } from './Workspace'
import type { Theme } from './theme'

export function DisciplineSelect({ field, value, onChange, disabled, className }: {
  field: Field; value: string; onChange: (value: string) => void; disabled?: boolean; className?: string
}) {
  return <label className={className}>具体方向{field === 'custom'
    ? <input aria-label="自定义学科" maxLength={60} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    : <select aria-label="具体方向" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">未指定</option>{disciplineOptions(field).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select>}</label>
}

export type SettingsTab = 'model' | 'profile'

export function Preferences({ dialog, user, onUser, style, onStyle, openAccount, theme, onTheme, tab, onTab, modelPanel }: {
  dialog: RefObject<HTMLDialogElement | null>; user: User | null; onUser: (user: User) => void;
  style: ReadingStyle; onStyle: (style: ReadingStyle) => void; openAccount: () => void
  theme: Theme; onTheme: (theme: Theme) => void
  tab: SettingsTab; onTab: (tab: SettingsTab) => void; modelPanel: ReactNode
}) {
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWorking(true)
    setStatus('')
    setError('')
    try {
      const { user } = await api<{ user: User }>('/api/profile', Object.fromEntries(new FormData(event.currentTarget)))
      onUser(user)
      setStatus('个人资料已保存')
    } catch (reason) { setError((reason as Error).message) }
    finally { setWorking(false) }
  }
  return <dialog ref={dialog} className="preferences-dialog" aria-labelledby="preferences-title"
    onClose={() => { setStatus(''); setError('') }}>
    <header><h2 id="preferences-title">设置</h2><button className="icon-button" aria-label="关闭设置" onClick={() => dialog.current?.close()}><X size={18} /></button></header>
    <nav className="tabs" aria-label="设置类别">
      <button type="button" aria-pressed={tab === 'model'} onClick={() => onTab('model')}>模型</button>
      <button type="button" aria-pressed={tab === 'profile'} onClick={() => onTab('profile')}>偏好与资料</button>
    </nav>
    {tab === 'model' ? modelPanel : <>
    <fieldset><legend>主题</legend><div className="style-options">
      {(['light', 'dark', 'system'] as const).map((id, i) => <label key={id}><input type="radio" name="theme" checked={theme === id} onChange={() => onTheme(id)} />{['浅色', '深色', '跟随系统'][i]}</label>)}
    </div></fieldset>
    <fieldset><legend>讲解偏好</legend><div className="style-options">
      {Object.entries(readingStyles).map(([id, name]) => <label key={id}><input type="radio" name="reading-style" checked={style === id}
        onChange={() => onStyle(id as ReadingStyle)} />{name}</label>)}
    </div><p className="subtle">应用于新生成的讲解、追问和聊天。</p></fieldset>
    {user ? <form onSubmit={save}>
      <h3>个人资料</h3><label>昵称<input name="displayName" defaultValue={user.displayName || user.name} maxLength={40} required /></label>
      <label>研究简介<textarea name="bio" defaultValue={user.bio || ''} maxLength={240} rows={3} /></label>
      <button className="primary" disabled={working}>保存资料</button>
    </form> : <button className="secondary" onClick={() => { dialog.current?.close(); openAccount() }}>登录后编辑个人资料</button>}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert" className="warning">{error}</p>}
    </>}
  </dialog>
}
