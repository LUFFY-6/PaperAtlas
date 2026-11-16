import { EnvHttpProxyAgent } from 'undici'

const proxy = new EnvHttpProxyAgent()

export function literatureFetch(url: string, options: RequestInit) {
  const requestOptions = { ...options, dispatcher: proxy }
  return fetch(url, requestOptions)
}
