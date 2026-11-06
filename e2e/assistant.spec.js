import { test, expect } from '@playwright/test'

test('floating assistant supports streaming, restore, cancellation, history and mobile layout', async ({ page }) => {
  const errors = [], saves = [], starts = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/admin/**', async route => {
    const url = new URL(route.request().url())
    let data = []
    if (url.pathname.endsWith('/projects')) data = [{ id: 'p1', projectName: '测试项目' }, { id: 'p2', projectName: '另一项目' }]
    else if (url.pathname.endsWith('/apps')) data = [{ id: 'a1', appName: '工作助手', enabled: 1 }]
    else if (url.pathname.endsWith('/sessions')) data = route.request().method() === 'POST' ? { id: 's1' } : { records: [{ id: 's1', title: '历史对话测试' }] }
    else if (url.pathname.endsWith('/detail')) data = { id: 's1', appId: 'a1', projectId: 'p1' }
    else if (url.pathname.endsWith('/messages')) data = { records: [{ id: 'u1', role: 'user', content: '历史问题', seqNo: 1 }, { id: 'r1', role: 'assistant', content: '历史回答', seqNo: 2 }] }
    else if (url.pathname.endsWith('/external')) saves.push(route.request().postDataJSON())
    await route.fulfill({ json: { code: 0, data } })
  })
  await page.routeWebSocket('**/gateway/ws/agent-chat*', socket => {
    socket.onMessage(text => {
      const request = JSON.parse(text)
      if (request.type !== 'start') return
      starts.push(request)
      socket.send(JSON.stringify({ type: 'started', requestId: request.requestId }))
      socket.send(JSON.stringify({ type: 'delta', requestId: request.requestId, data: { kind: 'answer', contentDelta: '**已收到问题**' } }))
      if (!request.messages[0].content.includes('停止')) socket.send(JSON.stringify({ type: 'done', requestId: request.requestId, data: {} }))
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '选择应用' })).toHaveValue('a1')
  await expect(page.getByRole('combobox')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/assistant-desktop.png' })
  await page.getByRole('textbox', { name: '输入问题' }).fill('请分析当前问题')
  await page.getByRole('textbox', { name: '输入问题' }).press('Enter')
  await expect(page.locator('.ca-markdown strong')).toHaveText('已收到问题')
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0)
  await expect.poll(() => saves.length).toBe(1)
  expect(saves[0].answer).toBe('**已收到问题**')
  expect(starts[0].options.model).toBe('qwen-72b-speed')
  expect(starts[0].requestId).toMatch(/^req-\d+$/)
  expect(starts[0].context).not.toHaveProperty('userId')
  expect(starts[0].context).not.toHaveProperty('userName')
  expect(starts[0].context).not.toHaveProperty('variables')
  await page.getByRole('button', { name: '全屏', exact: true }).click()
  await expect(page.locator('.ca-panel')).toHaveClass(/ca-fullscreen/)
  await page.getByRole('button', { name: '还原', exact: true }).click()
  await page.getByRole('button', { name: '关闭 AI 助手', exact: true }).click()
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click()
  await expect(page.locator('.ca-markdown strong')).toHaveText('已收到问题')
  await page.getByRole('textbox', { name: '输入问题' }).fill('测试停止生成')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '停止生成', exact: true }).click()
  await expect(page.getByText('已停止生成', { exact: true })).toBeVisible()
  await expect.poll(() => saves.length).toBe(2)
  await page.getByRole('button', { name: '历史对话', exact: true }).click()
  await page.getByRole('button', { name: '历史对话测试' }).click()
  await expect(page.getByText('历史回答', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  const box = await page.locator('.ca-panel').boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/assistant-mobile.png' })
  await page.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(page.getByRole('heading', { name: '有什么可以帮你？' })).toBeVisible()
  expect(errors).toEqual([])
})

test('@ skills use current app, support filtering and transmit skill codes without leaking removed selections', async ({ page }) => {
  const sent = [], requestedApps = []
  await page.route('**/admin/**', async route => {
    const url = new URL(route.request().url())
    let data = {}
    if (url.pathname.endsWith('/projects')) data = [{ id: 'p1' }, { id: 'p2' }]
    else if (url.pathname.endsWith('/apps')) data = [{ id: 'a1', appName: '应用一', enabled: 1 }, { id: 'a2', appName: '应用二', enabled: 1 }]
    else if (url.pathname.endsWith('/skills')) {
      requestedApps.push(url.pathname)
      data = url.pathname.includes('/a1/') ? [{ skillName: 'analysis', displayName: '数据分析' }, { skillName: 'summary', displayName: '内容总结' }] : []
    } else if (url.pathname.endsWith('/sessions')) data = { id: 's1' }
    await route.fulfill({ json: { code: 0, data } })
  })
  await page.routeWebSocket('**/gateway/ws/agent-chat*', socket => socket.onMessage(text => {
    const frame = JSON.parse(text)
    if (frame.type === 'start') { sent.push(frame); socket.send(JSON.stringify({ type: 'done', requestId: frame.requestId, data: { answer: '完成' } })) }
  }))
  await page.goto('/')
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click()
  const input = page.getByRole('textbox', { name: '输入问题' })
  await expect(page.getByRole('combobox')).toHaveCount(1)
  await expect(page.getByRole('combobox')).toHaveValue('a1')
  await input.fill('@')
  await expect(page.getByRole('option', { name: '数据分析', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/assistant-skills.png' })
  await page.getByRole('option', { name: '数据分析', exact: true }).click()
  await expect(input).toHaveValue('@数据分析 ')
  await input.press('End'); await input.pressSequentially('@总结')
  await expect(page.getByRole('option', { name: '内容总结', exact: true })).toBeVisible()
  await input.press('Enter')
  await expect(input).toHaveValue('@数据分析 @内容总结 ')
  await input.pressSequentially('请处理')
  await input.press('Enter')
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0].context.skill).toBe('analysis,summary')
  expect(sent[0].context.agentParams.skill).toBe('analysis,summary')
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible()
  await input.fill('@')
  await page.getByRole('option', { name: '数据分析', exact: true }).click()
  await input.fill('删除技能后的普通问题')
  await input.press('Enter')
  await expect.poll(() => sent.length).toBe(2)
  expect(sent[1].context.skill).toBe('')
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible()
  await page.getByRole('combobox').selectOption('a2')
  await input.fill('@')
  await expect(page.getByText('暂无可用技能', { exact: true })).toBeVisible()
  expect(requestedApps.at(-1)).toContain('/a2/skills')
  await input.press('Escape')
  await expect(page.locator('.ca-skills-panel')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeVisible()
})
