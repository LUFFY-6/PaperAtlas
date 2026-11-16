import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { promisify } from 'node:util'
import { fields, validDiscipline, type Field } from '../src/papers.ts'
import { normalizeProfile, profileFields, profileGoals } from '../src/persona.ts'

const derive = promisify(scrypt)
const week = 7 * 24 * 60 * 60
const digest = (token: string) => createHash('sha256').update(token).digest('hex')
let db: DatabaseSync | undefined

function database() {
  if (db) return db
  mkdirSync('.data', { recursive: true })
  const store = new DatabaseSync('.data/workspace.sqlite')
  store.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS profiles (owner TEXT PRIMARY KEY REFERENCES users(id), displayName TEXT NOT NULL, bio TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, field TEXT NOT NULL, discipline TEXT, created INTEGER NOT NULL);
  `)
  const columns = new Set(store.prepare('PRAGMA table_info(profiles)').all().map((item) => item.name))
  for (const column of profileFields) if (!columns.has(column)) store.exec(`ALTER TABLE profiles ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`)
  return db = store
}

export function accountUser(req: IncomingMessage) {
  const token = /(?:^|;\s*)atlas_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1]
  if (!token) return
  return database().prepare(`SELECT users.id, users.name, profiles.displayName, profiles.bio,
    profiles.education, profiles.major, profiles.researchArea, profiles.goal FROM users
    JOIN sessions ON users.id = sessions.owner LEFT JOIN profiles ON users.id = profiles.owner
    WHERE token = ? AND expires > ?`).get(digest(token), Date.now())
}

const attempts = new Map<string, { count: number; expires: number }>()
export async function accountRoute(path: string, req: IncomingMessage, res: ServerResponse, json: (status: number, data: unknown) => void) {
  if (!['/api/session', '/api/register', '/api/login', '/api/logout', '/api/projects', '/api/profile'].includes(path)) return false
  const reads = req.method === 'GET' && (path === '/api/session' || path === '/api/projects')
  if (!reads && (req.method !== 'POST' || path === '/api/session')) {
    json(405, { error: '请求方式不正确。' })
    return true
  }
  const secure = req.headers['x-forwarded-proto'] === 'https' || 'encrypted' in req.socket
  if (!reads && req.headers.origin && req.headers.origin !== (secure ? 'https://' : 'http://') + req.headers.host) {
    json(403, { error: '请从当前工作台发送请求。' })
    return true
  }
  const store = database()
  const token = /(?:^|;\s*)atlas_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1]
  const user = token ? store.prepare('SELECT id, name FROM users JOIN sessions ON users.id = sessions.owner WHERE token = ? AND expires > ?')
    .get(digest(token), Date.now()) as { id: string; name: string } | undefined : undefined
  function profile(account: { id: string; name: string }) {
    const details = store.prepare('SELECT displayName, bio, education, major, researchArea, goal FROM profiles WHERE owner = ?').get(account.id)
    return { ...account, ...details }
  }
  const cookie = (value: string, age: number) =>
    res.setHeader('Set-Cookie', `atlas_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`)
  if (path === '/api/session') { json(200, { user: user ? profile(user) : null }); return true }
  if (path === '/api/logout') {
    if (token) store.prepare('DELETE FROM sessions WHERE token = ?').run(digest(token))
    cookie('', 0)
    json(200, { user: null })
    return true
  }
  if (['/api/projects', '/api/profile'].includes(path) && !user) { json(401, { error: '请先登录。' }); return true }
  if (path === '/api/projects' && reads && user) {
    json(200, { projects: store.prepare('SELECT id, title, field, discipline FROM projects WHERE owner = ? ORDER BY created DESC').all(user.id) })
    return true
  }
  let body: Record<string, unknown>
  try {
    if (!req.headers['content-type']?.startsWith('application/json')) throw Error()
    const chunks: Buffer[] = []
    let length = 0
    for await (const chunk of req) {
      length += chunk.length
      if (length > 4096) throw Error()
      chunks.push(chunk)
    }
    body = JSON.parse(Buffer.concat(chunks).toString()) ?? {}
  } catch { json(400, { error: '请求内容无效。' }); return true }
  if (path === '/api/profile' && user) {
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
    const bio = typeof body.bio === 'string' ? body.bio.trim() : ''
    if (!displayName || displayName.length > 40 || bio.length > 240) {
      json(400, { error: '昵称需为 1–40 个字符，简介最多 240 个字符。' })
      return true
    }
    if (profileFields.some((key) => body[key] !== undefined && (typeof body[key] !== 'string' || body[key].trim().length > 40))
      || typeof body.goal === 'string' && body.goal.trim() && !profileGoals.some((goal) => goal === body.goal)) {
      json(400, { error: '画像字段最多 40 字，请选择有效的阅读目的。' })
      return true
    }
    const extra = normalizeProfile({ ...profile(user), ...body })
    store.prepare(`INSERT INTO profiles (owner, displayName, bio, education, major, researchArea, goal) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner) DO UPDATE SET displayName=excluded.displayName, bio=excluded.bio, education=excluded.education,
      major=excluded.major, researchArea=excluded.researchArea, goal=excluded.goal`)
      .run(user.id, displayName, bio, extra.education, extra.major, extra.researchArea, extra.goal)
    json(200, { user: profile(user) })
    return true
  }
  if (path === '/api/projects' && user) {
    const field = body.field
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const discipline = typeof body.discipline === 'string' ? body.discipline.trim() : ''
    if (typeof field !== 'string' || !Object.hasOwn(fields, field) || !title || title.length > 80
      || !validDiscipline(field as Field, discipline)) {
      json(400, { error: '请填写项目名和学科。' })
      return true
    }
    const id = randomBytes(16).toString('hex')
    store.prepare('INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?)').run(id, user.id, title, field, discipline, Date.now())
    json(201, { project: { id, title, field, discipline } })
    return true
  }
  const name = typeof body.name === 'string' ? body.name.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!/^[\p{L}\p{N}_@.-]{3,80}$/u.test(name) || password.length < 8 || password.length > 128) {
    json(400, { error: '账号至少 3 个字符，密码使用 8–128 个字符。' })
    return true
  }
  const now = Date.now()
  for (const [ip, attempt] of attempts) if (attempt.expires <= now) attempts.delete(ip)
  const ip = req.socket.remoteAddress ?? ''
  const attempt = attempts.get(ip) ?? { count: 0, expires: now + 60_000 }
  if (attempt.count >= 12) { json(429, { error: '尝试次数过多，请稍后重试。' }); return true }
  attempt.count++
  attempts.set(ip, attempt)
  const existing = store.prepare('SELECT * FROM users WHERE name = ?').get(name) as { id: string; salt: string; password: string } | undefined
  const salt = existing?.salt ?? randomBytes(16).toString('hex')
  const hash = await derive(password, salt, 64) as Buffer
  let id: string
  if (path === '/api/register') {
    id = randomBytes(16).toString('hex')
    const inserted = store.prepare('INSERT OR IGNORE INTO users VALUES (?, ?, ?, ?)').run(id, name, salt, hash.toString('hex'))
    if (!inserted.changes) { json(409, { error: '这个账号已注册。' }); return true }
  } else {
    if (!existing || !timingSafeEqual(hash, Buffer.from(existing.password, 'hex'))) {
      json(401, { error: '账号或密码错误。' })
      return true
    }
    id = existing.id
  }
  store.prepare('DELETE FROM sessions WHERE expires <= ? OR token = ?').run(now, token ? digest(token) : '')
  const session = randomBytes(32).toString('hex')
  store.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(session), id, now + week * 1000)
  cookie(session, week)
  json(200, { user: profile({ id, name }) })
  return true
}
