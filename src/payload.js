const DEFAULT_MODEL_CODE = 'qwen-72b-speed'

export function resolveModelCode(config = {}) {
  const configured = String(config.modelCode || '').trim()
  if (configured) return configured
  const option = Array.isArray(config.gptOption) && config.gptOption.find(item => item?.code)
  return option?.code || DEFAULT_MODEL_CODE
}

export function buildStartPayload({ requestId, projectId = '', app = {}, settings = {}, sessionId = '', responseMessageId, question, skill = '', customData = {}, config = {} }) {
  const runtimeAgentName = settings.runtimeAgentName || ''
  const context = {
    agentId: app.id || '',
    agentCode: app.appCode || app.id || '',
    agentName: runtimeAgentName || app.appName || '',
    runtimeAgentName,
    turnId: responseMessageId,
    skill,
    agentParams: { skill }
  }
  const userId = String(config.userId || '').trim()
  const userName = String(config.userName || '').trim()
  if (userId) context.userId = userId
  if (userName) context.userName = userName
  const variables = { ...customData }
  if (Object.keys(variables).length) context.variables = { customData: variables }
  return {
    type: 'start',
    requestId,
    projectId,
    appId: app.id || '',
    sessionId,
    responseMessageId,
    messages: [{ role: 'user', content: question }],
    context,
    options: {
      detail: false,
      model: resolveModelCode(config),
      agent: runtimeAgentName,
      answerType: settings.answerType || config.answerType || 'deep'
    }
  }
}
