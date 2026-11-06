import test from 'node:test'
import assert from 'node:assert/strict'
import { buildStartPayload, resolveModelCode } from '../src/payload.js'

const app = {
  id: '0354e10f-6157-4a3c-ae50-4d6f26b30bf3',
  appCode: 'FGPT_403460003',
  appName: '自动化检修工作智能审核',
  appConfig: JSON.stringify({ settings: { runtimeAgentName: '' } })
}

test('default start payload matches the source project agent-chat protocol', () => {
  const payload = buildStartPayload({
    requestId: 'req-1793949221941',
    projectId: 'cmtawtv5e0008qu01rr5r0ozb',
    app,
    settings: { runtimeAgentName: '' },
    sessionId: '853deeabc023aa488af4dd06fa5b63b2',
    responseMessageId: '5b9c4213-7d9d-4986-9f17-974db50511d1',
    question: '你好',
    skill: '',
    config: {}
  })

  assert.deepEqual(payload, {
    type: 'start',
    requestId: 'req-1793949221941',
    projectId: 'cmtawtv5e0008qu01rr5r0ozb',
    appId: '0354e10f-6157-4a3c-ae50-4d6f26b30bf3',
    sessionId: '853deeabc023aa488af4dd06fa5b63b2',
    responseMessageId: '5b9c4213-7d9d-4986-9f17-974db50511d1',
    messages: [{ role: 'user', content: '你好' }],
    context: {
      agentId: '0354e10f-6157-4a3c-ae50-4d6f26b30bf3',
      agentCode: 'FGPT_403460003',
      agentName: '自动化检修工作智能审核',
      runtimeAgentName: '',
      turnId: '5b9c4213-7d9d-4986-9f17-974db50511d1',
      skill: '',
      agentParams: { skill: '' }
    },
    options: { detail: false, model: 'qwen-72b-speed', agent: '', answerType: 'deep' }
  })
})

test('optional identity, customData and model configuration are only sent when configured', () => {
  const base = {
    requestId: 'req-1',
    projectId: 'p1',
    app,
    sessionId: 's1',
    responseMessageId: 'r1',
    question: '查询',
    skill: 'analysis',
    config: { userId: 'u1', userName: '张三', modelCode: 'deepseek-chat' }
  }
  const payload = buildStartPayload({ ...base, customData: { ticketId: 'T1' } })
  assert.equal(payload.context.userId, 'u1')
  assert.equal(payload.context.userName, '张三')
  assert.deepEqual(payload.context.variables, { customData: { ticketId: 'T1' } })
  assert.equal(payload.context.skill, 'analysis')
  assert.deepEqual(payload.context.agentParams, { skill: 'analysis' })
  assert.equal(payload.options.model, 'deepseek-chat')

  const empty = buildStartPayload({ ...base, config: {} })
  assert.equal('userId' in empty.context, false)
  assert.equal('userName' in empty.context, false)
  assert.equal('variables' in empty.context, false)
})

test('model resolution follows modelCode, gptOption and source default', () => {
  assert.equal(resolveModelCode({ modelCode: 'deepseek-chat' }), 'deepseek-chat')
  assert.equal(resolveModelCode({ gptOption: [{ label: '自定义', code: 'custom-model' }] }), 'custom-model')
  assert.equal(resolveModelCode({}), 'qwen-72b-speed')
})
