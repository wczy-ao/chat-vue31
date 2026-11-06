import test from 'node:test'
import assert from 'node:assert/strict'
import { startChat } from '../src/transport.js'
import { getConfig, authHeaders, websocketUrl } from '../src/config.js'

class Socket {
  static last
  readyState = 0
  sent = []
  constructor(url) { this.url = url; Socket.last = this }
  send(value) { this.sent.push(JSON.parse(value)) }
  close() { this.readyState = 3; this.onclose?.() }
  open() { this.readyState = 1; this.onopen() }
  frame(value) { this.onmessage({ data: JSON.stringify(value) }) }
}
function setup(onFrame = () => {}, onError = () => {}) {
  const control = startChat({ type: 'start', requestId: 'r1' }, onFrame, onError, { WebSocketImpl: Socket, url: 'ws://localhost/chat' })
  return { control, socket: Socket.last }
}
test('runtime configuration supports URL aliases, bearer HTTP auth and encoded WS token', () => {
  globalThis.window = { __gconf: { AppServerAddress: 'https://example.com', gptToken: 'Bearer a+b/=' } }
  const config = getConfig()
  assert.equal(config.baseUrl, 'https://example.com/admin')
  assert.equal(authHeaders(config).Authorization, 'Bearer a+b/=')
  const url = new URL(websocketUrl(config))
  assert.equal(url.protocol, 'wss:')
  assert.equal(url.pathname, '/admin/gateway/ws/agent-chat')
  assert.equal(url.searchParams.get('access_token'), 'a+b/=')
  delete globalThis.window
})
test('gatewayAgentBaseUrl ending in /admin is not duplicated', () => {
  globalThis.window = { __gconf: { gatewayAgentBaseUrl: 'https://example.com/admin/' } }
  assert.equal(getConfig().baseUrl, 'https://example.com/admin')
  globalThis.window = { __gconf: { gatewayAgentBaseUrl: 'https://example.com' } }
  assert.equal(getConfig().baseUrl, 'https://example.com/admin')
  delete globalThis.window
})
test('complete delta settles once and normal close does not report interruption', () => {
  const frames = [], errors = []
  const { socket } = setup(f => frames.push(f), e => errors.push(e))
  socket.open()
  assert.equal(socket.sent[0].type, 'start')
  socket.frame({ type: 'delta', requestId: 'different', data: { contentDelta: 'ignored' } })
  socket.frame({ type: 'delta', requestId: 'r1', data: { contentDelta: 'answer', complete: true } })
  socket.frame({ type: 'done', requestId: 'r1' })
  assert.equal(frames.length, 1)
  assert.equal(errors.length, 0)
  assert.equal(socket.readyState, 3)
})
test('cancel while connecting closes without sending or reporting a false failure', () => {
  const errors = []
  const { control, socket } = setup(() => {}, e => errors.push(e))
  control.cancel()
  assert.equal(socket.readyState, 3)
  assert.equal(socket.sent.length, 0)
  assert.equal(errors.length, 0)
})
test('confirm and cancellation use original request ID', () => {
  const { control, socket } = setup()
  socket.open(); control.confirm('c1', false); control.cancel()
  assert.deepEqual(socket.sent[1], { type: 'confirm', requestId: 'r1', confirmId: 'c1', ok: false })
  assert.deepEqual(socket.sent[2], { type: 'cancel', requestId: 'r1' })
})
test('unexpected close reports exactly one interruption', () => {
  const errors = []
  const { socket } = setup(() => {}, e => errors.push(e))
  socket.open(); socket.close(); socket.onerror()
  assert.equal(errors.length, 1)
})
test('timeout closes connection and frees active request', async () => {
  await new Promise(resolve => {
    startChat({ requestId: 'r1' }, () => {}, error => { assert.match(error.message, /超时/); assert.equal(Socket.last.readyState, 3); resolve() }, { WebSocketImpl: Socket, url: 'ws://localhost', timeout: 5 })
  })
})
