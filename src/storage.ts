import { normalizeStyle, type Paper, type ReadingStyle } from './papers'
import type { Connection } from './ModelSettings'

type StoredPaper = { paper: Paper; opened: number }
const key = (owner: string) => owner ? 'paper-atlas-model-' + owner : 'paper-atlas-model'
const databases = new Map<string, Promise<IDBDatabase>>()

function db(owner: string) {
  const existing = databases.get(owner)
  if (existing) return existing
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(owner ? 'paper-atlas-' + owner : 'paper-atlas', 2)
    request.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) {
        request.result.createObjectStore('papers', { keyPath: 'paper.id' })
        request.result.createObjectStore('reading')
      }
      request.result.createObjectStore('conversations', { keyPath: 'id' })
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); databases.delete(owner) }
      resolve(request.result)
    }
    request.onerror = () => { databases.delete(owner); reject(request.error) }
  })
  databases.set(owner, pending)
  return pending
}

export async function transaction<T>(owner: string, store: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await db(owner)
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(store, mode)
    const request = action(tx.objectStore(store))
    tx.oncomplete = () => resolve(request.result)
    tx.onabort = () => reject(tx.error)
  })
}

export async function history(owner = '') {
  const entries = await transaction<StoredPaper[]>(owner, 'papers', 'readonly', (store) => store.getAll())
  return entries.sort((a, b) => b.opened - a.opened).map(({ paper, opened }) => ({ ...paper, lastOpened: opened }))
}
export function rememberPaper(paper: Paper, owner = '') {
  return transaction(owner, 'papers', 'readwrite', (store) => store.put({ paper, opened: Date.now() }))
}
export async function renameHistory(id: string, title: string, owner = '') {
  const database = await db(owner)
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('papers', 'readwrite')
    const store = tx.objectStore('papers')
    const request = store.get(id)
    request.onsuccess = () => {
      const entry = request.result as StoredPaper | undefined
      if (!entry) { tx.abort(); return }
      store.put({ ...entry, paper: { ...entry.paper, historyTitle: title } })
    }
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('这条历史记录已不存在。'))
  })
}
export async function removeHistory(id: string, owner = '') {
  const database = await db(owner)
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(['papers', 'reading'], 'readwrite')
    tx.objectStore('papers').delete(id)
    tx.objectStore('reading').delete(id)
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error)
  })
}
export function recallStyle(owner: string) {
  try { return normalizeStyle(localStorage.getItem('paper-atlas-style-' + owner)) }
  catch { return 'practical' }
}
export function rememberStyle(owner: string, style: ReadingStyle) {
  localStorage.setItem('paper-atlas-style-' + owner, style)
}
export function loadReading<T>(id: string, owner = '') {
  return transaction<T | undefined>(owner, 'reading', 'readonly', (store) => store.get(id))
}
export async function saveReading(id: string, state: unknown, owner = '') {
  const database = await db(owner)
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(['papers', 'reading'], 'readwrite')
    const request = tx.objectStore('papers').getKey(id)
    request.onsuccess = () => {
      if (request.result !== undefined) tx.objectStore('reading').put(state, id)
    }
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error)
  })
}
export function recallConnection(owner = ''): Connection | null {
  try {
    const saved = JSON.parse(localStorage.getItem(key(owner)) ?? 'null')
    return typeof saved?.base === 'string' && typeof saved.model === 'string' && typeof saved.key === 'string' ? saved : null
  } catch { return null }
}
export function rememberConnection(connection: Connection | null, owner = '') {
  if (connection) localStorage.setItem(key(owner), JSON.stringify(connection))
  else localStorage.removeItem(key(owner))
}
