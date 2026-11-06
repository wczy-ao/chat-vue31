// 运行时配置：部署后直接修改，无需重新打包。宿主已设置的值优先。
window.__gconf = Object.assign({
  gptUrl: 'http://192.168.62.58:9221',
  gptToken: '3aa0c042-4b6a-404a-b014-d86480f6948f',
  gatewayAgentProjectId: 'cmtawtv5e0008qu01rr5r0ozb',
  gatewayAgentWsUrl: 'ws://192.168.62.58:9221/admin/gateway/ws/agent-chat', // 空值时从 gptUrl 推导 /gateway/ws/agent-chat
  chatFloat: { title: 'AI 助手' }
}, window.__gconf || {});
