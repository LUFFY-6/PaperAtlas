import type { Connection } from './ModelSettings'
import { guestProfile } from './persona'
import { readEffort } from './effort'

type Status = { lastOkAt?: number; lastError?: string }
const routes = new Set(['/api/chat', '/api/explain', '/api/discover', '/api/model/test'])
const key = (connection?: Pick<Connection, 'base' | 'model'> | null) =>
  'paper-atlas-model-status-' + (connection ? connection.base.trim() + '#' + connection.model.trim() : 'default')
const statuses = new Map<string, Status>()

export function modelStatus(connection?: Connection | null): Status {
  const id = key(connection)
  try { return statuses.get(id) ?? JSON.parse(localStorage.getItem(id) ?? '{}') ?? {} }
  catch { return statuses.get(id) ?? {} }
}

export async function modelFetch(url: string, options?: RequestInit) {
  if (!routes.has(url)) return fetch(url, options)
  let connection: Connection | undefined
  try {
    const payload = JSON.parse(String(options?.body ?? '{}'))
    connection = payload.connection
    if (url !== '/api/model/test') options = { ...options, body: JSON.stringify({ ...payload, effort: readEffort(), profile: guestProfile() }) }
  } catch {}
  const id = key(connection)
  function report(value: Status) {
    statuses.set(id, value)
    try { localStorage.setItem(id, JSON.stringify(value)) } catch {}
    window.dispatchEvent(new Event('paper-atlas-model-status'))
  }
  let response: Response
  try { response = await fetch(url, options) }
  catch (error) {
    if (!options?.signal?.aborted) report({ lastError: '无法连接模型，请检查网络。' })
    throw error
  }
  if (!options?.signal?.aborted) {
    if (response.ok) report({ lastOkAt: Date.now() })
    else if (response.status >= 500 || url === '/api/model/test') {
      const { error } = await response.clone().json().catch(() => ({}))
      report({ lastError: typeof error === 'string' ? error.slice(0, 160) : '模型请求失败。' })
    }
  }
  return response
}
