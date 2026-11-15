import { resolve4, resolve6 } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'

export type ModelConfig = { base: string; model: string; key: string }
export type Message = { role: 'system' | 'user' | 'assistant'; content: string }

const reserved = new BlockList()
for (const [ip, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) reserved.addSubnet(ip, prefix, 'ipv4')
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')
for (const [ip, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) {
  reserved.addSubnet(ip, prefix, 'ipv6')
}

export function customModel(value: unknown, allowLocal: boolean) {
  const input = value as ModelConfig | null
  if (!input || typeof input.base !== 'string' || input.base.length > 600
    || typeof input.model !== 'string' || !input.model.trim() || input.model.trim().length > 160
    || typeof input.key !== 'string' || input.key.length > 2048 || /[^\x21-\x7e]/.test(input.key.trim())) {
    throw new Error('请检查接口地址、模型名和 API Key。')
  }
  let url: URL
  try { url = new URL(input.base.trim()) } catch { throw new Error('请输入完整的接口地址。') }
  const local = allowLocal && ['localhost', '127.0.0.1'].includes(url.hostname)
    && url.protocol === 'http:' && url.port === '11434' && /^\/v1(?:\/chat\/completions)?\/?$/.test(url.pathname)
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) {
    throw new Error('云端接口请使用 HTTPS。本机 Ollama 可使用 http://127.0.0.1:11434/v1。')
  }
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '') + '/chat/completions'
  if (local) url.hostname = '127.0.0.1'
  return { url, local, model: input.model.trim(), key: input.key.trim() }
}

export function modelJson(content: unknown): unknown {
  if (typeof content !== 'string' || !content.trim()) throw new Error('模型未返回文本，请检查模型名称或换一个对话模型。')
  try {
    return JSON.parse(content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1'))
  } catch {
    throw new Error('模型未返回可读取的 JSON，请重试或换一个模型。')
  }
}

function statusError(status: number) {
  if (status === 401 || status === 403) return new Error('模型服务拒绝了请求，请确认 API Key 和模型权限。')
  if (status === 404) return new Error('模型或接口不存在，请检查模型名和接口地址。')
  if (status === 429) return new Error('达到服务用量限制，请检查额度或稍后重试。')
  return new Error(`模型服务返回 HTTP ${status}，请检查设置后重试。`)
}

function messageText(body: unknown): unknown {
  return (body as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content
}

export async function defaultChat(config: ModelConfig, messages: Message[], signal: AbortSignal, structured = true, maxTokens = 2000) {
  const response = await fetch(`${config.base.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${config.key}`, 'content-type': 'application/json' },
    signal, redirect: 'error',
    body: JSON.stringify({ model: config.model, temperature: 0.2, max_tokens: maxTokens, ...(structured ? { response_format: { type: 'json_object' } } : {}), messages }),
  })
  if (!response.ok) {
    if (response.status === 400) {
      const body = await response.json().catch(() => null)
      if (body?.error?.code === 'Arrearage' || body?.code === 'Arrearage') {
        throw new Error('默认模型服务账户余额不足，请在模型设置中切换可用接口。')
      }
    }
    throw statusError(response.status)
  }
  return messageText(await response.json())
}

export async function customChat(connection: ReturnType<typeof customModel>, messages: Message[], signal: AbortSignal) {
  const { url, local, model, key } = connection
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const family = isIP(hostname)
  const addresses = family ? [{ address: hostname, family }]
    : (await Promise.allSettled([resolve4(hostname), resolve6(hostname)]))
      .flatMap((result, index) => result.status === 'fulfilled'
        ? result.value.map((address) => ({ address, family: index === 0 ? 4 : 6 })) : [])
  const address = addresses[0]
  if (!address) throw new Error('无法解析接口地址，请检查拼写和网络。')
  if (!local && addresses.some(({ address: ip, family }) => family === 4
    ? reserved.check(ip, 'ipv4')
    : !globalV6.check(ip, 'ipv6') || reserved.check(ip, 'ipv6'))) {
    throw new Error('请选择公网 HTTPS 模型接口或本机 Ollama。')
  }
  const payload = JSON.stringify({ model, messages, stream: false })
  const result = await new Promise<unknown>((resolve, reject) => {
    const request = (local ? httpRequest : httpsRequest)(url, {
      method: 'POST', signal, agent: false, family: address.family,
      // 使用已校验的地址建立连接，同时保留原始主机名用于 TLS。
      lookup: (_host, _options, done) => done(null, address.address, address.family),
      headers: {
        'content-type': 'application/json', 'content-length': Buffer.byteLength(payload),
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
    }, (response) => {
      response.on('error', reject)
      const status = response.statusCode ?? 502
      if (status < 200 || status >= 300) {
        response.destroy()
        reject(statusError(status))
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 512_000) request.destroy(new Error('模型返回内容过长。'))
        else chunks.push(chunk)
      })
      response.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
        catch { reject(new Error('接口未返回兼容的响应，请确认支持 Chat Completions。')) }
      })
    })
    request.on('error', reject)
    request.end(payload)
  })
  return messageText(result)
}
