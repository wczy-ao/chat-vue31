import { getConfig, authHeaders } from './config.js'

export async function request(path, { method = 'GET', params = {}, data, signal } = {}) {
  const config = getConfig()
  const url = new URL(`${config.baseUrl}${path}`, location.origin)
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') url.searchParams.set(key, value) })
  const response = await fetch(url, { method, signal: signal || AbortSignal.timeout(30000), credentials: 'same-origin', headers: { ...authHeaders(config), ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined })
  if (!response.ok) throw new Error(`请求失败（${response.status}）`)
  const body = await response.json()
  if (body.code !== undefined && ![0, 200, '0', '200'].includes(body.code)) throw new Error(body.msg || body.message || '请求失败')
  return body.data ?? body
}

export const rows = value => Array.isArray(value) ? value : value?.records || []
export const sessionsPath = '/api/knowledge/sessions'
export const saveTurn = (sessionId, turn) => request(`${sessionsPath}/messages/external`, { method: 'POST', params: { sessionId }, data: turn })
