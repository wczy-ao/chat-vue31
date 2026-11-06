<script setup>
import { ref, shallowRef, computed, nextTick, watch, onBeforeUnmount } from 'vue'
import { Bot, X, Maximize2, Minimize2, History, Plus, ArrowUp, Square, ChevronLeft, RotateCw, Check, Copy } from 'lucide-vue-next'
import MarkdownIt from 'markdown-it'
import { getConfig } from './config.js'
import { request, rows, sessionsPath, saveTurn } from './api.js'
import { buildStartPayload } from './payload.js'
import { startChat } from './transport.js'

const visible = ref(false), fullscreen = ref(false), historyOpen = ref(false)
const loading = ref(false), busy = ref(false), historyLoading = ref(false), restoring = ref(false)
const error = ref(''), historyError = ref(''), input = ref(''), projects = ref([]), apps = ref([])
const projectId = ref(''), appId = ref(''), sessionId = ref(''), messages = ref([]), histories = ref([]), keyword = ref('')
const scrollEl = ref(), inputEl = ref(), copied = ref('')
const skills = ref([]), selectedSkills = ref([]), skillsOpen = ref(false), skillsLoading = ref(false), skillsError = ref(''), skillQuery = ref(''), skillIndex = ref(0)
const filteredSkills = computed(() => skills.value.filter(skill => `${skill.displayName || ''} ${skill.skillName}`.toLowerCase().includes(skillQuery.value.toLowerCase())))
let skillVersion = 0, mentionStart = -1, mentionEnd = -1
const config = getConfig(), md = new MarkdownIt({ html: false, linkify: true, breaks: true })
const selectedApp = computed(() => apps.value.find(app => app.id === appId.value))
const filteredHistory = computed(() => histories.value.filter(item => (item.title || '').includes(keyword.value)))
const transport = shallowRef()
let initPromise, initialized = false, disposed = false, loadVersion = 0
const id = () => globalThis.crypto?.randomUUID?.() || `ca-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
function parse(value) { try { return typeof value === 'string' ? JSON.parse(value) : value || {} } catch { return {} } }
async function scroll() { await nextTick(); if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight }
function resetSkills() { skillsOpen.value = false; selectedSkills.value = []; mentionStart = -1; mentionEnd = -1 }
function reset() { if (busy.value || restoring.value) return; sessionId.value = ''; messages.value = []; input.value = ''; resetSkills(); error.value = ''; historyOpen.value = false; inputEl.value?.focus() }
watch(appId, () => { resetSkills(); skills.value = []; skillsError.value = ''; skillVersion++ })
async function fetchSkills() {
  const version = ++skillVersion, currentApp = appId.value
  skillsLoading.value = true; skillsError.value = ''; skills.value = []
  if (!currentApp) { skillsError.value = '请先选择应用'; skillsLoading.value = false; return }
  try {
    const list = rows(await request(`/gateway/agent/apps/${encodeURIComponent(currentApp)}/skills`))
    if (!disposed && version === skillVersion && currentApp === appId.value) skills.value = list.filter(skill => skill?.skillName)
  } catch (e) { if (version === skillVersion) skillsError.value = `技能加载失败：${e.message}` }
  finally { if (version === skillVersion) skillsLoading.value = false }
}
function syncSkills() {
  selectedSkills.value = selectedSkills.value.filter(skill => {
    const mention = `@${skill.displayName || skill.skillName}`
    let position = input.value.indexOf(mention)
    while (position >= 0) {
      const next = input.value[position + mention.length]
      if (!next || /\s/.test(next)) return true
      position = input.value.indexOf(mention, position + mention.length)
    }
    return false
  })
}
function handleInput(event) {
  syncSkills()
  if (event?.isComposing) return
  const cursor = inputEl.value?.selectionStart ?? input.value.length
  const prefix = input.value.slice(0, cursor), start = prefix.lastIndexOf('@')
  const query = prefix.slice(start + 1)
  if (start < 0 || /\s/.test(query) || selectedSkills.value.some(skill => `@${skill.displayName || skill.skillName}` === prefix.slice(start))) { skillsOpen.value = false; return }
  const newMention = !skillsOpen.value || start !== mentionStart
  mentionStart = start; mentionEnd = cursor; skillQuery.value = query; skillIndex.value = 0; skillsOpen.value = true
  if (newMention) fetchSkills()
}
async function chooseSkill(skill) {
  if (!skill || mentionStart < 0) return
  syncSkills()
  const duplicate = selectedSkills.value.some(item => item.skillName === skill.skillName)
  const mention = duplicate ? '' : `@${skill.displayName || skill.skillName} `
  const cursor = mentionStart + mention.length
  input.value = input.value.slice(0, mentionStart) + mention + input.value.slice(mentionEnd)
  if (!duplicate) selectedSkills.value.push(skill)
  skillsOpen.value = false
  await nextTick(); inputEl.value?.focus(); inputEl.value?.setSelectionRange(cursor, cursor)
}
async function loadApps() {
  const version = ++loadVersion
  loading.value = true; error.value = ''
  try {
    const result = rows(await request('/gateway/agent/apps', { params: { projectId: projectId.value } }))
    if (version !== loadVersion || disposed) return
    apps.value = result.filter(item => Number(item.enabled) === 1)
    appId.value = apps.value.find(item => item.id === getConfig().gatewayAgentAppId)?.id || apps.value[0]?.id || ''
    if (!apps.value.length) error.value = '当前项目暂无启用应用，请联系管理员配置。'
  } catch (e) { if (version === loadVersion) { error.value = e.message; apps.value = []; appId.value = '' } }
  finally { if (version === loadVersion) loading.value = false }
}
async function initialize() {
  if (initialized) return
  if (initPromise) return initPromise
  initPromise = (async () => {
    loading.value = true
    try { projects.value = rows(await request('/gateway/agent/projects')) } catch { projects.value = [] }
    projectId.value = getConfig().gatewayAgentProjectId || projects.value[0]?.id || ''
    await loadApps()
    initialized = !!apps.value.length
  })().finally(() => { initPromise = null })
  return initPromise
}
function open() { visible.value = true; initialize(); nextTick(() => inputEl.value?.focus()) }
function close() { visible.value = false }
async function loadHistory() {
  historyOpen.value = true; historyLoading.value = true; historyError.value = ''
  try { histories.value = rows(await request(sessionsPath, { params: { current: 1, size: 100 } })) }
  catch (e) { historyError.value = e.message }
  finally { historyLoading.value = false }
}
async function restore(item) {
  if (busy.value || restoring.value) return
  const previous = { projectId: projectId.value, appId: appId.value, apps: apps.value }
  restoring.value = true; historyError.value = ''
  try {
    const detail = await request(`${sessionsPath}/detail`, { params: { sessionId: item.id } })
    const result = rows(await request(`${sessionsPath}/messages`, { params: { sessionId: item.id, current: 1, size: 10000 } }))
    if (detail.projectId && detail.projectId !== projectId.value) { projectId.value = detail.projectId; await loadApps() }
    if (!apps.value.some(app => app.id === detail.appId)) throw new Error('此对话的应用已停用或不可用，无法继续对话。')
    appId.value = detail.appId; sessionId.value = item.id
    messages.value = result.slice().sort((a, b) => Number(a.seqNo || 0) - Number(b.seqNo || 0)).filter(m => ['user', 'assistant'].includes(m.role)).map(m => {
      const ext = parse(m.extInfo || m.EXT_INFO)
      return { id: m.id || id(), role: m.role, content: m.content || m.CONTENT || '', thinking: ext.thinking || '', status: ext.terminalStatus || 'done', note: ext.terminalMessage || '' }
    })
    historyOpen.value = false; error.value = ''; scroll()
  } catch (e) { projectId.value = previous.projectId; appId.value = previous.appId; apps.value = previous.apps; historyError.value = e.message }
  finally { restoring.value = false }
}
async function copy(message) { try { await navigator.clipboard.writeText(message.content); copied.value = message.id } catch { error.value = '复制失败，请手动选择内容复制。' } }

async function send(text = input.value, customData = {}) {
  if (busy.value || restoring.value || loading.value) throw new Error('请等待当前操作完成')
  const question = String(text).trim()
  if (!question) return
  if (!selectedApp.value) throw new Error('请先选择可用应用')
  busy.value = true; error.value = ''; historyOpen.value = false
  const app = { ...selectedApp.value }, settings = parse(app.appConfig).settings || {}
  const suppliedData = typeof getConfig().customDataProvider === 'function' ? getConfig().customDataProvider() : {}
  customData = { ...suppliedData, ...customData }
  syncSkills()
  const skill = text === input.value ? selectedSkills.value.map(item => item.skillName).join(',') : String(customData.__skillName || '')
  delete customData.__skillName
  skillsOpen.value = false
  const clientId = String(Date.now()), responseId = id(), requestId = `req-${clientId}`
  let answer, finished = false, currentSession
  async function finish(status, note = '') {
    if (finished) return
    finished = true
    if (answer) {
      answer.status = status; answer.note = note
      try {
        await saveTurn(currentSession, { question, answer: answer.content, clientId, refInfo: '', extInfo: JSON.stringify({ thinking: answer.thinking, clientId, appId: app.id, sourceType: 'chatFloat', terminalStatus: status === 'done' ? '' : status, terminalMessage: note }) })
      } catch (e) { if (!disposed) error.value = `回答已保留在当前窗口，但历史保存失败：${e.message}` }
      if (status === 'done' && !disposed) window.dispatchEvent(new CustomEvent('chatFloat:message:end', { detail: { question, answer: answer.content, content: answer.content, chatId: currentSession, clientId, agentCode: app.id, status: 'completed' } }))
    }
    busy.value = false; transport.value = null; scroll()
  }
  try {
    if (!sessionId.value) {
      const session = await request(sessionsPath, { method: 'POST', data: { title: question.slice(0, 255), sourceType: 'chatFloat', projectId: projectId.value, appId: app.id, appCode: app.appCode, appName: app.appName } })
      if (!session?.id) throw new Error('创建会话失败：未返回会话 ID')
      sessionId.value = session.id
    }
    currentSession = sessionId.value
    await request(`${sessionsPath}/messages/question`, { method: 'POST', params: { sessionId: currentSession }, data: { question, clientId, extInfo: JSON.stringify({ sourceType: 'chatFloat', appId: app.id, clientId }) } })
    if (disposed) { busy.value = false; return }
    messages.value.push({ id: clientId, role: 'user', content: question })
    messages.value.push({ id: responseId, role: 'assistant', content: '', thinking: '', status: 'running', steps: [], confirms: [] })
    answer = messages.value[messages.value.length - 1]
    input.value = ''; resetSkills(); scroll()
    transport.value = startChat(buildStartPayload({ requestId, projectId: projectId.value, app, settings, sessionId: currentSession, responseMessageId: responseId, question, skill, customData, config: getConfig() }), frame => {
      if (finished) return
      const data = frame.data || {}
      if (frame.type === 'delta') {
        const key = data.kind === 'thinking' ? 'thinking' : 'content'
        if (!data.kind || ['answer', 'thinking'].includes(data.kind)) answer[key] = typeof data.full === 'string' && data.full ? data.full : answer[key] + (data.contentDelta || '')
        if (data.complete === true) finish('done')
      } else if (frame.type === 'done') {
        if (data.answer || data.full) answer.content = data.answer || data.full
        finish('done')
      } else if (frame.type === 'error') finish('error', frame.error?.message || data.message || '服务处理失败，请重试')
      else if (frame.type === 'canceled') finish('cancel', '已停止生成')
      else if (frame.type === 'clarify') { answer.content += data.text || data.question || '请补充信息'; finish('clarify') }
      else if (frame.type === 'step') answer.steps = [...answer.steps.slice(-4), data.summary || data.messageText || '正在处理']
      else if (frame.type === 'confirm') {
        const index = answer.confirms.findIndex(c => c.id === data.id)
        if (index >= 0) answer.confirms.splice(index, 1)
        if (data.status === 'pending') answer.confirms.push(data)
      } else if (frame.type === 'message' && data.event === 'security_preflight' && ['block', 'error'].includes(data.data?.decision)) finish('error', data.data.refusal || data.data.reason || '请求未通过安全预检')
      scroll()
    }, e => finish('error', e.message))
    // 停止操作使用同一轮终态保存逻辑。
    transport.value.finishCanceled = () => finish('cancel', '已停止生成')
  } catch (e) { if (answer) await finish('error', e.message); else { busy.value = false; error.value = e.message }; throw e }
}
function stop() { if (!transport.value) return; const active = transport.value; active.cancel(); active.finishCanceled() }
function confirm(message, item, ok) { try { transport.value.confirm(item.id, ok); message.confirms = message.confirms.filter(c => c.id !== item.id) } catch (e) { error.value = e.message } }
async function submit() { try { await send() } catch (e) { error.value = e.message } }
function keydown(event) {
  if (event.isComposing) return
  if (skillsOpen.value) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); skillsOpen.value = false; return }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); const count = filteredSkills.value.length; if (count) skillIndex.value = (skillIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count; return }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!skillsLoading.value) chooseSkill(filteredSkills.value[skillIndex.value]); return }
  }
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() }
}
async function sendFromHost(options) {
  open(); await initialize()
  const data = typeof options === 'string' ? { message: options } : options || {}
  if (busy.value || restoring.value) throw new Error('AI 助手正在处理，请稍后发送')
  if (data.appId && data.appId !== appId.value) {
    if (!apps.value.some(app => app.id === data.appId)) throw new Error('所选应用不可用')
    reset(); appId.value = data.appId
  }
  const customData = { ...(data.customData || {}) }
  if (data.skillName) customData.__skillName = data.skillName
  return send(data.message, customData)
}
defineExpose({ open, close, sendFromHost })
onBeforeUnmount(() => { disposed = true; loadVersion++; skillVersion++; transport.value?.cancel() })
</script>

<template>
  <div class="ca-root">
    <button v-if="!visible" class="ca-launcher" aria-label="打开 AI 助手" @click="open"><Bot :size="23" /><span>AI 助手</span></button>
    <section v-show="visible" class="ca-panel" :class="{ 'ca-fullscreen': fullscreen }" role="dialog" :aria-label="config.title" @keydown.esc="historyOpen ? historyOpen = false : close()">
      <header class="ca-header">
        <div class="ca-brand"><span class="ca-mark"><Bot :size="21" /></span><div><strong>{{ config.title }}</strong><small>{{ busy ? '正在为你处理' : '随时为你提供帮助' }}</small></div></div>
        <nav class="ca-tools" aria-label="助手工具栏">
          <button title="新建对话" aria-label="新建对话" :disabled="busy || restoring" @click="reset"><Plus :size="18" /></button>
          <button title="历史对话" aria-label="历史对话" :aria-pressed="historyOpen" :disabled="busy || restoring" @click="historyOpen ? historyOpen = false : loadHistory()"><History :size="18" /></button>
          <button :title="fullscreen ? '还原' : '全屏'" :aria-label="fullscreen ? '还原' : '全屏'" @click="fullscreen = !fullscreen"><Minimize2 v-if="fullscreen" :size="18" /><Maximize2 v-else :size="18" /></button>
          <button title="关闭" aria-label="关闭 AI 助手" @click="close"><X :size="19" /></button>
        </nav>
      </header>

      <div v-if="historyOpen" class="ca-history">
        <div class="ca-history-title"><button aria-label="返回对话" title="返回对话" @click="historyOpen = false"><ChevronLeft :size="19" /></button><h2>历史对话</h2><button title="刷新" aria-label="刷新历史对话" :disabled="historyLoading || restoring" @click="loadHistory"><RotateCw :size="17" /></button></div>
        <input v-model="keyword" class="ca-search" aria-label="筛选最近 100 条对话" placeholder="搜索最近对话…">
        <p v-if="historyLoading || restoring" class="ca-muted">{{ restoring ? '正在恢复对话…' : '正在加载…' }}</p>
        <p v-if="historyError" class="ca-error" role="alert">{{ historyError }}</p>
        <div class="ca-history-list"><button v-for="item in filteredHistory" :key="item.id" :disabled="restoring" @click="restore(item)"><History :size="16" /><span>{{ item.title || '未命名对话' }}<small>{{ item.createTime || '' }}</small></span><ChevronLeft class="ca-chevron" :size="16" /></button></div>
        <p v-if="!historyLoading && !filteredHistory.length" class="ca-muted">暂无匹配的对话</p>
      </div>

      <template v-else>
        <div ref="scrollEl" class="ca-messages" role="log" aria-label="对话消息" :aria-busy="busy">
          <div v-if="!messages.length" class="ca-welcome"><span class="ca-welcome-mark"><Bot :size="34" stroke-width="1.5" /></span><p class="ca-eyebrow">你的工作伙伴</p><h1>有什么可以帮你？</h1><p>说出你的问题，让思路更进一步。</p><div class="ca-suggestions"><button @click="input = '请帮我梳理这个问题的处理思路'; inputEl?.focus()">梳理处理思路 <ArrowUp :size="15" /></button><button @click="input = '请帮我总结以下内容的重点：'; inputEl?.focus()">总结内容重点 <ArrowUp :size="15" /></button></div></div>
          <article v-for="message in messages" :key="message.id" class="ca-message" :class="`ca-${message.role}`">
            <div v-if="message.role === 'assistant'" class="ca-message-label"><Bot :size="16" /> {{ config.title }}</div>
            <details v-if="message.thinking" class="ca-thinking"><summary>思考过程</summary><div>{{ message.thinking }}</div></details>
            <div v-if="message.role === 'user'" class="ca-bubble">{{ message.content }}</div>
            <div v-else class="ca-markdown" v-html="md.render(message.content)" />
            <p v-if="message.status === 'running'" class="ca-progress"><span />{{ message.steps?.at(-1) || '正在思考…' }}</p>
            <p v-if="message.note" class="ca-note" :class="{ 'ca-error': message.status === 'error' }">{{ message.note }}</p>
            <div v-for="item in message.status === 'running' ? message.confirms : []" :key="item.id" class="ca-confirm"><p>{{ item.summary || item.reason || '是否继续执行？' }}</p><button @click="confirm(message, item, true)">确认</button><button @click="confirm(message, item, false)">拒绝</button></div>
            <button v-if="message.role === 'assistant' && message.content && message.status !== 'running'" class="ca-copy" title="复制回答" aria-label="复制回答" @click="copy(message)"><Check v-if="copied === message.id" :size="14" /><Copy v-else :size="14" /></button>
          </article>
        </div>

        <footer class="ca-footer">
          <p v-if="error" class="ca-error ca-error-banner" role="alert">{{ error }}<button v-if="!apps.length" :disabled="loading" @click="initialize">重试</button></p>
          <div class="ca-composer">
            <div v-if="skillsOpen" class="ca-skills-panel" aria-label="技能选择" @mousedown.prevent>
              <div class="ca-skills-heading"><span>选择技能</span><button aria-label="关闭技能列表" @click="skillsOpen = false"><X :size="15" /></button></div>
              <p v-if="skillsLoading" class="ca-muted">正在加载技能…</p>
              <p v-else-if="skillsError" class="ca-error" role="alert">{{ skillsError }} <button @click="fetchSkills">重试</button></p>
              <template v-else><div role="listbox" aria-label="可用技能"><button v-for="(item, index) in filteredSkills" :id="`ca-skill-${index}`" :key="item.id || item.skillName" type="button" role="option" :aria-selected="skillIndex === index" :class="{ 'ca-skill-active': skillIndex === index }" @mousedown.prevent @click="chooseSkill(item)">{{ item.displayName || item.skillName }}</button></div><p v-if="!filteredSkills.length" class="ca-muted">{{ skills.length ? '没有匹配的技能' : '暂无可用技能' }}</p></template>
            </div>
            <textarea ref="inputEl" v-model="input" rows="3" :disabled="loading || restoring" aria-label="输入问题" placeholder="输入你的问题，@ 选择技能…" :aria-expanded="skillsOpen" aria-autocomplete="list" :aria-activedescendant="skillsOpen && filteredSkills.length ? `ca-skill-${skillIndex}` : undefined" @input="handleInput" @compositionend="handleInput" @keydown="keydown" @blur="skillsOpen = false" />
            <div class="ca-composer-bottom"><div class="ca-selects"><select v-model="appId" aria-label="选择应用" :disabled="busy || loading || restoring" @change="reset"><option v-if="!apps.length" value="">{{ loading ? '加载应用中…' : '暂无可用应用' }}</option><option v-for="app in apps" :key="app.id" :value="app.id">{{ app.appName }}</option></select></div><button v-if="busy" class="ca-send" :disabled="!transport" title="停止生成" aria-label="停止生成" @click="stop"><Square :size="15" fill="currentColor" /></button><button v-else class="ca-send" :disabled="!input.trim() || !appId || loading || restoring" title="发送" aria-label="发送" @click="submit"><ArrowUp :size="20" /></button></div>
          </div>
          <p class="ca-footnote">内容由 AI 生成，请核实重要信息 <span>Enter 发送 · Shift + Enter 换行</span></p>
        </footer>
      </template>
    </section>
  </div>
</template>
