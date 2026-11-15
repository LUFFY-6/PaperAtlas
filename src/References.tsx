import { useState } from 'react'

type ReferencesResult = { title: string; count: number; works: { id: string; title: string; year?: string }[] }

export function References() {
  const [result, setResult] = useState<ReferencesResult>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <details className="lookup">
    <summary>DOI 参考文献</summary>
    <form onSubmit={async (event) => {
      event.preventDefault()
      if (busy) return
      const doi = String(new FormData(event.currentTarget).get('doi') ?? '').trim()
      setBusy(true); setError(''); setResult(undefined)
      try {
        const response = await fetch('/api/references?' + new URLSearchParams({ doi }))
        const value = await response.json()
        if (!response.ok) throw new Error(value.error || '检索失败，请重试。')
        setResult(value)
      } catch (reason) { setError((reason as Error).message) }
      finally { setBusy(false) }
    }}>
      <label>论文 DOI <input name="doi" required maxLength={220} placeholder="10.1234/示例" /></label>
      <button className="secondary" disabled={busy}>{busy ? '正在检索…' : '查找参考文献'}</button>
    </form>
    {error && <p className="warning" role="alert">{error}</p>}
    {result && <><p className="subtle">{result.title} · 已显示 {result.works.length}/{result.count} 条 DOI 参考文献</p>
      {result.works.length > 0 && <ol>{result.works.map((item) => <li key={item.id}>
        <a href={'https://doi.org/' + encodeURIComponent(item.id)} target="_blank" rel="noreferrer">{item.title}{item.year && `（${item.year}）`}</a>
      </li>)}</ol>}</>}
  </details>
}
