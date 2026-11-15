import { transaction } from './storage'

export type Conversation = {
  id: string; owner: string; projectId?: string; title: string
  turns: { role: 'user' | 'assistant'; content: string; model?: string }[]
  model?: string; effort?: 'fast' | 'normal' | 'deep'
  createdAt: number; updatedAt: number
}

export function createConversation(owner: string, projectId?: string): Conversation {
  const now = Date.now()
  return { id: crypto.randomUUID(), owner, projectId, title: '新对话', turns: [], createdAt: now, updatedAt: now }
}

export async function listConversations(owner: string, projectId?: string) {
  const entries = await transaction<Conversation[]>(owner, 'conversations', 'readonly', (store) => store.getAll())
  return entries.filter((entry) => entry.owner === owner && (!projectId || entry.projectId === projectId)).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getConversation(id: string, owner: string) {
  return transaction<Conversation | undefined>(owner, 'conversations', 'readonly', (store) => store.get(id))
}

export function saveConversation(conversation: Conversation, owner: string) {
  return transaction(owner, 'conversations', 'readwrite', (store) => store.put({ ...conversation, owner }))
}

export async function renameConversation(id: string, title: string, owner: string) {
  const current = await getConversation(id, owner)
  if (current) await saveConversation({ ...current, title, updatedAt: Date.now() }, owner)
}

export function removeConversation(id: string, owner: string) {
  return transaction(owner, 'conversations', 'readwrite', (store) => store.delete(id))
}
