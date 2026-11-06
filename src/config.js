export function getConfig() {
  const c = globalThis.window?.__gconf || {}
  const base = String(c.gptUrl || c.gptApiBaseUrl || c.AppServerAddress || c.gatewayAgentBaseUrl || '/admin').replace(/\/+$/, '')
  const baseUrl = /\/admin$/i.test(base) ? base : `${base}/admin`
  const absolute = new URL(baseUrl, globalThis.location?.origin || 'http://localhost')
  absolute.protocol = absolute.protocol === 'https:' ? 'wss:' : 'ws:'
  absolute.pathname += '/gateway/ws/agent-chat'
  return { ...c, baseUrl, wsUrl: c.gatewayAgentWsUrl || absolute.href, token: String(c.gptToken || '').trim(), title: c.chatFloat?.title || 'AI 助手' }
}

export function authHeaders(config = getConfig()) {
  if (!config.token) return {}
  const prefix = config.TokenPrefix ?? 'Bearer '
  return { [config.RequestTokenKey || 'Authorization']: /^Bearer\s/i.test(config.token) || config.token.startsWith(prefix) ? config.token : `${prefix}${config.token}` }
}

export function websocketUrl(config = getConfig()) {
  const url = new URL(config.wsUrl, globalThis.location?.href || 'http://localhost')
  if (config.token) url.searchParams.set('access_token', config.token.replace(/^Bearer\s*/i, ''))
  return url.href
}
