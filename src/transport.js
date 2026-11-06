import { websocketUrl } from './config.js'

// 每轮新建连接、发送 start，与原助手 reconnectOnEverySend 行为一致。
export function startChat(payload, onFrame, onError, { WebSocketImpl = globalThis.WebSocket, url = websocketUrl(), timeout = 300000 } = {}) {
  const ws = new WebSocketImpl(url)
  let settled = false
  const timer = setTimeout(() => fail(new Error('回答超时，请重试')), timeout)
  function cleanup() { clearTimeout(timer); if (ws.readyState === 0 || ws.readyState === 1) ws.close() }
  function fail(error) { if (settled) return; settled = true; cleanup(); onError(error) }
  ws.onopen = () => { if (!settled) ws.send(JSON.stringify(payload)) }
  ws.onerror = () => fail(new Error('连接失败，请检查服务地址、网络和 token'))
  ws.onclose = () => { if (!settled) fail(new Error('连接已断开，回答未完成')) }
  ws.onmessage = event => {
    let frame
    try { frame = JSON.parse(event.data) } catch { fail(new Error('服务返回了无效消息')); return }
    if (settled || (frame.requestId && frame.requestId !== payload.requestId)) return
    const terminal = ['done', 'error', 'canceled', 'clarify'].includes(frame.type) || (frame.type === 'delta' && frame.data?.complete === true) || (frame.type === 'message' && frame.data?.event === 'security_preflight' && ['block', 'error'].includes(frame.data?.data?.decision))
    if (terminal) { settled = true; clearTimeout(timer) }
    onFrame(frame)
    if (terminal) cleanup()
  }
  return {
    cancel() { if (settled) return; settled = true; if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'cancel', requestId: payload.requestId })); cleanup() },
    confirm(confirmId, ok) { if (ws.readyState !== 1 || settled) throw new Error('连接已断开'); ws.send(JSON.stringify({ type: 'confirm', requestId: payload.requestId, confirmId, ok })) }
  }
}
