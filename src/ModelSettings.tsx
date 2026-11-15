import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Check, Eye, EyeOff, Plug } from 'lucide-react'
import { modelFetch } from './modelStatus'

export type Connection = { base: string; model: string; key: string }

const presets = {
  custom: { label: '自定义', base: '', model: '' },
  qwen: { label: '通义千问', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  deepseek: { label: 'DeepSeek', base: 'https://api.deepseek.com', model: 'deepseek-flash' },
  openai: { label: 'OpenAI', base: 'https://api.openai.com/v1', model: '' },
  ollama: { label: 'Ollama · 本机', base: 'http://127.0.0.1:11434/v1', model: '' },
} as const

export function ModelSettings({ current, fallback, remembered, onChange, onClose }: {
  current: Connection | null; onClose: () => void
  fallback: string; remembered: boolean; onChange: (connection: Connection | null, remember?: boolean) => void
}) {
  const [preset, setPreset] = useState<keyof typeof presets>('custom')
  const [draft, setDraft] = useState<Connection>(current ?? { base: '', model: '', key: '' })
  const [showKey, setShowKey] = useState(false)
  const [tested, setTested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [remember, setRemember] = useState(remembered)
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => pending.current?.abort(), [])

  function update(next: Connection) {
    setDraft(next)
    setTested(false)
    setError('')
  }

  async function test(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const connection = { base: draft.base.trim(), model: draft.model.trim(), key: draft.key.trim() }
    if (!connection.base || !connection.model) {
      setError('请填写接口地址和模型名称。')
      return
    }
    const controller = new AbortController()
    pending.current = controller
    setTested(false)
    setBusy(true)
    setError('')
    try {
      const result = await modelFetch('/api/model/test', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connection }), signal: controller.signal,
      })
      const data = await result.json()
      if (!result.ok) throw new Error(data.error || '连接测试失败。')
      if (!controller.signal.aborted) setTested(true)
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '连接测试失败。')
    } finally {
      setBusy(false)
    }
  }

  return <div className="model-panel">
    <header className="settings-header">
      <span className="settings-icon"><Plug size={20} /></span>
      <div><h2 id="model-settings-title">模型设置</h2><p>{current ? `正在使用 ${current.model}` : fallback ? `默认模型 · ${fallback}` : '选择一个模型以启用 AI 讲解'}</p></div>
    </header>
    <form onSubmit={test}>
      <fieldset disabled={busy}>
        <label>服务商<select value={preset} onChange={(event) => {
          const choice = event.target.value as keyof typeof presets
          setPreset(choice)
          setShowKey(false)
          update({ base: presets[choice].base, model: presets[choice].model, key: '' })
        }}>{Object.entries(presets).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label>
        <label>API Base URL<input type="url" autoComplete="off" spellCheck={false} maxLength={600} required value={draft.base}
          placeholder="https://provider.example/v1" onChange={(event) => update({ ...draft, base: event.target.value })} /></label>
        <label>模型名称<input autoComplete="off" spellCheck={false} maxLength={160} required value={draft.model}
          placeholder="填写服务商提供的 Model ID" onChange={(event) => update({ ...draft, model: event.target.value })} /></label>
        <label>API Key
          <span className="key-field"><input type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false}
            maxLength={2048} value={draft.key} placeholder="无需认证的接口可留空"
            onChange={(event) => update({ ...draft, key: event.target.value })} />
          <button type="button" className="icon-button" aria-label={showKey ? '隐藏密钥' : '显示密钥'} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
        </label>
      </fieldset>
      <label className="remember-model"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> 在此浏览器记住接口、模型与 API Key</label>
      <p className="subtle">勾选后，密钥会保存在此浏览器。共享设备建议保留为本次会话。</p>
      {error && <p className="warning" role="alert">{error}</p>}
      {tested && <p className="model-success" role="status"><Check size={16} /> 连接和 JSON 响应通过，可以启用。</p>}
      {busy && <p className="subtle" role="status">正在测试模型连接…</p>}
      <footer className="settings-actions">
        {current && <button className="text-button" type="button" disabled={busy} onClick={() => { onChange(null); onClose() }}>{fallback ? '恢复默认模型' : '断开模型'}</button>}
        <button type="submit" className="secondary push" disabled={busy}>{busy ? '测试中…' : '测试连接'}</button>
        <button type="button" className="primary" disabled={!tested || busy} onClick={() => {
          onChange({ base: draft.base.trim(), model: draft.model.trim(), key: draft.key.trim() }, remember)
          onClose()
        }}>启用模型 <ArrowRight size={15} /></button>
      </footer>
    </form>
  </div>
}
