import { transaction } from './storage'
import { api } from './Workspace'

export type Conversation = {
  id: string; owner: string; projectId?: string; title: string
  turns: { role: 'user' | 'assistant'; content: string; model?: string }[]
  model?: string; effort?: 'fast' | 'normal' | 'deep'
  paperId?: string
  createdAt: number; updatedAt: number
}

export function createConversation(owner: string, projectId?: string): Conversation {
  const now = Date.now()
  return { id: crypto.randomUUID(), owner, projectId, title: '新对话', turns: [], createdAt: now, updatedAt: now }
}

export async function listConversations(owner: string, projectId?: string) {
  if (owner) {
    const migrationKey = 'paper-atlas-conversations-synced-' + owner
    if (!localStorage.getItem(migrationKey)) {
      const local = await transaction<Conversation[]>(owner, 'conversations', 'readonly', (store) => store.getAll())
      for (const conversation of local) {
        if (conversation.owner === owner && conversation.turns.length) {
          await api('/api/conversations', { owner, id: conversation.id, action: 'import', conversation })
        }
      }
      localStorage.setItem(migrationKey, '1')
    }
    const result = await api<{ owner: string; conversations: Conversation[] }>('/api/conversations')
    if (result.owner !== owner) return []
    return result.conversations.filter((entry) => !projectId || entry.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt)
  }
  const entries = await transaction<Conversation[]>(owner, 'conversations', 'readonly', (store) => store.getAll())
  return entries.filter((entry) => entry.owner === owner && (!projectId || entry.projectId === projectId)).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getConversation(id: string, owner: string) {
  return transaction<Conversation | undefined>(owner, 'conversations', 'readonly', (store) => store.get(id))
}

export async function saveConversation(conversation: Conversation, owner: string) {
  if (owner) {
    const result = await api<{ conversation: Conversation }>('/api/conversations', { owner, id: conversation.id, action: 'save', conversation })
    return result.conversation
  }
  await transaction(owner, 'conversations', 'readwrite', (store) => store.put({ ...conversation, owner }))
  return conversation
}

export async function renameConversation(id: string, title: string, owner: string) {
  if (owner) {
    const result = await api<{ conversation: Conversation }>('/api/conversations', { owner, id, action: 'rename', title })
    return result.conversation
  }
  const current = await getConversation(id, owner)
  if (current) return saveConversation({ ...current, title, updatedAt: Date.now() }, owner)
}

export async function removeConversation(id: string, owner: string) {
  if (owner) return api('/api/conversations', { owner, id, action: 'delete' })
  return transaction(owner, 'conversations', 'readwrite', (store) => store.delete(id))
}
