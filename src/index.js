import { createApp } from 'vue'
import ChatAssistant from './ChatAssistant.vue'
import './style.css'

export { ChatAssistant }
export function mount(target, config = {}) {
  window.__gconf = { ...(window.__gconf || {}), ...config }
  const element = typeof target === 'string' ? document.querySelector(target) : target
  if (!element) throw new Error('AI 助手挂载容器不存在')
  const app = createApp(ChatAssistant)
  const instance = app.mount(element)
  return { open: () => instance.open(), close: () => instance.close(), send: options => instance.sendFromHost(options), unmount: () => app.unmount() }
}
