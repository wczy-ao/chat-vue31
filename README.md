# chat-vue3

独立的 Vue 3 AI 助手，使用 Vite 构建。不依赖原项目的 Vue 2、Vuex、路由、Element UI、登录模块或业务页面。

## 启动

```sh
npm install
npm run dev
```

点击右下角「AI 助手」打开悬浮框。右上角依次是新建对话、历史对话、全屏/还原、关闭。关闭保留当前对话和正在进行的回答；销毁组件会断开连接。支持 Markdown、思考过程、执行状态、工具确认、停止生成和复制回答。

```sh
npm run build       # 独立网页 → dist/
npm run build:lib   # 可嵌入组件（自带 Vue 3）→ dist-lib/
npm test           # 配置和 WebSocket 生命周期测试
npm run test:e2e   # 浏览器模拟接口集成测试（首次需 npx playwright install chromium）
```

## 运行时配置

独立网页修改 `public/config.js`；部署后修改 `dist/config.js`，不必重新构建。嵌入时在挂载前设置 `window.__gconf`，或者传入 `mount` 第二个参数。

```js
window.__gconf = {
  gptUrl: 'https://your-gateway.example.com/admin',
  gptToken: '你的 GPT token',
  gatewayAgentWsUrl: 'wss://your-gateway.example.com/admin/gateway/ws/agent-chat',
  gatewayAgentProjectId: '实际项目 ID',
  gatewayAgentAppId: '可选：默认应用 ID',
  chatFloat: { title: 'AI 助手' },
  // gptOption: [{ label: '泰豪大模型', code: 'qwen-72b-speed' }],
  // RequestTokenKey: 'Authorization',
  // TokenPrefix: 'Bearer ',
  // userId: '仅需要上报身份的应用填写',
  // userName: '仅需要上报身份的应用填写',
  // modelCode: '可选模型编码，默认 qwen-72b-speed'
}
```

URL 兼容 `gptUrl`、`gptApiBaseUrl`、`AppServerAddress`、`gatewayAgentBaseUrl`。未以 `/admin` 结尾会补齐；WebSocket 地址留空时从 HTTP 地址推导。token 从 `gptToken` 读取，HTTP 默认 `Authorization: Bearer <token>`，WebSocket 使用 `access_token` 查询参数，兼容已带 Bearer 的 token。不会读取宿主的登录缓存。配置在每次 HTTP 请求和新建 WebSocket 时读取，token 更新后下一次请求生效。

默认 `/admin` 使用同源网关；独立开发时请配置真实网关地址并允许开发站点的 CORS / WebSocket Origin，或在部署层配置同源代理。本项目不内置生产地址和 token。

## 嵌入任意宿主（包括 Vue 2）

将 `dist-lib` 的资源部署到宿主静态目录。

```html
<link rel="stylesheet" href="/chat/chat-assistant.css">
<div id="chat-assistant"></div>
<script src="/chat/chat-assistant.umd.js"></script>
<script>
  const assistant = ChatAssistant.mount('#chat-assistant', {
    gptUrl: 'https://your-gateway.example.com/admin',
    gptToken: '实际 token',
    gatewayAgentProjectId: '实际项目 ID'
  })
  // assistant.open()
  // assistant.close()
  // 宿主销毁时：assistant.unmount()

  window.addEventListener('chatFloat:message:end', event => {
    console.log(event.detail.question, event.detail.answer)
  })

  // 先注册回调，再发送。返回 Promise 表示已发起请求，并不表示回答完成。
  // assistant.send({ message: '请分析当前页面', appId: '可选应用 ID', customData: {} })
  //   .catch(error => console.error(error.message))
</script>
```

Vue 3 源码集成可以导入 `src/index.js` 的 `ChatAssistant` 组件或 `mount`。样式全部限制在 `.ca-root`，不修改宿主 body 或全局样式；打包时包含 Vue 3，不要求 Vue 2 宿主调整版本。

## 复用的现有接口

所有路径相对于配置的 `/admin` 基址：

| 用途 | 方法 / 路径 |
| --- | --- |
| 项目 / 启用应用 | GET `/gateway/agent/projects`、`/gateway/agent/apps?projectId=...` |
| 新建 / 历史列表 | POST / GET `/api/knowledge/sessions` |
| 会话详情 / 消息 | GET `/api/knowledge/sessions/detail`、`/api/knowledge/sessions/messages` |
| 问题预保存 | POST `/api/knowledge/sessions/messages/question?sessionId=...` |
| 回答和终态保存 | POST `/api/knowledge/sessions/messages/external?sessionId=...` |
| 流式问答 | WS `/gateway/ws/agent-chat?access_token=...` |

每轮采用新连接 + `type:start`，沿用原项目的 `projectId/appId/sessionId/responseMessageId/messages/context/options` 结构。`requestId` 为 `req-<毫秒时间戳>`；`options.model` 依次取 `modelCode`、`gptOption[0].code`、`qwen-72b-speed`。`userId/userName` 仅在配置后发送，`customData` 仅在非空时放到 `context.variables.customData`，是否消费取决于后端应用。支持 `started/delta/step/confirm/clarify/done/error/canceled` 和安全预检拦截事件。回答完成通过原生 `chatFloat:message:end` 事件回传。

输入区沿用原 UMD 的单个应用下拉框，展示当前项目的启用应用；项目通过 `gatewayAgentProjectId` 配置，未配置时取首个项目，不额外显示项目下拉框。切换应用会新建对话并清空技能选择。

输入 `@` 请求 GET `/gateway/agent/apps/{appId}/skills`，可按技能名称筛选，用鼠标或方向键 + Enter 选择。界面插入 `@displayName`，发送时将真实 `skillName`（多个以逗号分隔）放入 `context.skill` 和 `context.agentParams.skill`，与原 UMD 协议一致。删除提及文字会移除相应技能；发送后清空选择。空列表和接口失败均有提示，失败可重试。

历史列表展示当前用户最近 100 条会话，可按标题筛选；恢复历史时读取会话的项目与应用。应用停用时提示不可继续，避免把历史误发给其他应用。历史使用后端保存，不依赖 localStorage。

本次抽取范围是文字 AI 助手；不包含原系统的拓扑图、业务远程组件、知识库管理、语音、文件上传等模块。旧 `window.ChatFloat.chatEventBus` 不在新项目中复制，宿主改用上述 `mount/send` API。
