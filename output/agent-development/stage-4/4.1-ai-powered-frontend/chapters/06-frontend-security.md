# 第6章：AI 前端安全 — 保护 API Key、防止注入、数据隐私

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **保护 AI API Key** — 不将密钥暴露给前端浏览器
- **防止 AI Prompt Injection** — 在前端和后端双层防御注入攻击
- **保护用户数据隐私** — 确保 AI 不会泄露用户敏感信息
- **实现安全的 AI 请求代理** — 后端转发模式 vs 直接调用模式

## 📋 前置知识

> 建议先完成：
> - [第1章：AI-Native UI 模式](./01-ai-native-ui.md)

---

## 💡 核心概念

### API Key 保护：永不暴露在前端

**生活类比：** API Key 就像你的信用卡。前端代码是「放在店门口的菜单」——所有人都能看到。你会把信用卡贴在菜单上吗？当然不会。同样，API Key 也不能放在前端代码中。

```typescript
// ❌ 致命的错误做法：API Key 在前端明文暴露
const apiKey = 'sk-ant-xxxxxxxxxxxxxxxx'  // 任何人都能在浏览器 DevTools 中找到！
const response = await fetch('https://api.anthropic.com/v1/messages', {
  headers: { 'x-api-key': apiKey },  // ❌
})

// ✅ 正确做法：使用后端代理
// 前端 → 后端 API → AI 服务
// 浏览器看不到 API Key
const response = await fetch('/api/chat', {  // 请求自己的后端
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages }),
})
```

### 后端代理模式

```typescript
// server/routes/ai-proxy.ts — 后端 AI 代理
import { Hono } from 'hono'
import Anthropic from '@anthropic-ai/sdk'

const app = new Hono()

// 后端持有 API Key（安全！）
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // 服务器环境变量
})

app.post('/api/chat', async (c) => {
  const { messages, maxTokens } = await c.req.json()

  // 1. 安全检查：限制消息长度
  const sanitizedMessages = messages.map((msg: any) => ({
    role: msg.role,
    content: typeof msg.content === 'string'
      ? msg.content.slice(0, 10000)  // 截断超长消息
      : msg.content,
  }))

  // 2. 服务端速率限制（按 IP）
  const ip = c.req.header('x-forwarded-for') || 'unknown'
  if (!rateLimiter.check(ip)) {
    return c.json({ error: '请求过于频繁，请稍后再试' }, 429)
  }

  // 3. 调用 AI API（在服务端，API Key 安全）
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens || 1024,
    messages: sanitizedMessages,
  })

  return c.json(response)
})

// 速率限制器
class RateLimiter {
  private requests = new Map<string, number[]>()
  private limit = 20    // 每分钟最多 20 次
  private window = 60000 // 1 分钟

  check(key: string): boolean {
    const now = Date.now()
    const timestamps = this.requests.get(key) || []
    const recent = timestamps.filter(t => now - t < this.window)

    if (recent.length >= this.limit) return false

    recent.push(now)
    this.requests.set(key, recent)
    return true
  }
}

const rateLimiter = new RateLimiter()
```

**💡 为什么不能在前端直接调用 AI API？** 除了 API Key 泄露的风险外，还有三个原因：1) 你无法控制前端的调用量（用户可以直接在浏览器控制台中无限调用你的 API Key）；2) 你无法对前端请求做安全过滤（恶意 Prompt 直接发给 AI）；3) 你无法审计调用记录（不知道谁在调）。

### 防止 Prompt Injection

```typescript
// 前端输入安全过滤
function sanitizeInput(userInput: string): string {
  return userInput
    // 1. 移除可能的注入指令
    .replace(/请忽略.*?指令/gi, '')
    .replace(/ignore.*?instructions/gi, '')
    .replace(/system\s*prompt/gi, '[已过滤]')
    // 2. 限制长度
    .slice(0, 10000)
    // 3. 移除不可见控制字符
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

// 后端双重过滤
function serverSanitize(userInput: string): string {
  // 后端可以从更多维度检测
  const suspiciousPatterns = [
    /base64\s*-\s*d/i,           // base64 解码绕过
    /powershell/i,                // 系统命令
    /eval\s*\(/i,                 // 代码执行
    /process\.env/i,              // 环境变量读取
  ]

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(userInput)) {
      throw new Error('输入包含不安全的指令')
    }
  }

  return userInput
}
```

---

## 🔨 实战演练

### 练习：构建安全的 AI 请求代理层

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// server/ai-gateway.ts — AI 安全网关
import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

// CORS 配置：只允许你的前端域名
app.use('/api/*', cors({
  origin: ['https://your-app.com', 'http://localhost:5173'],
  maxAge: 600,
}))

interface AiRequest {
  messages: Array<{ role: string; content: string }>
  maxTokens?: number
  model?: string
}

// 安全过滤中间件
async function securityFilter(c: any, next: any) {
  const body = await c.req.json() as AiRequest

  // 1. 请求验证
  if (!body.messages || !Array.isArray(body.messages)) {
    return c.json({ error: '请求格式错误：messages 必须是一个数组' }, 400)
  }

  // 2. 角色验证：只允许 user 和 assistant
  for (const msg of body.messages) {
    if (!['user', 'assistant'].includes(msg.role)) {
      return c.json({ error: `不允许的角色: ${msg.role}` }, 400)
    }
  }

  // 3. 内容安全检查
  for (const msg of body.messages) {
    if (typeof msg.content === 'string') {
      msg.content = msg.content.slice(0, 10000) // 截断
      msg.content = msg.content.replace(/[\x00-\x1F]/g, '') // 移除控制字符
    }
  }

  // 4. 速率限制
  const clientIp = c.req.header('x-forwarded-for') || 'unknown'
  const limitResult = await checkRateLimit(clientIp)
  if (!limitResult.allowed) {
    return c.json({ error: '速率限制', retryAfter: limitResult.retryAfter }, 429)
  }

  c.set('sanitizedBody', body)
  await next()
}

// AI 调用路由
app.post('/api/chat', securityFilter, async (c) => {
  const body = c.get('sanitizedBody') as AiRequest

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: body.model || 'claude-sonnet-4-20250514',
        max_tokens: body.maxTokens || 1024,
        messages: body.messages,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('AI API 错误:', error)
      return c.json({ error: 'AI 服务暂时不可用' }, 502)
    }

    const data = await response.json()
    return c.json(data)

  } catch (error) {
    console.error('AI 网关错误:', error)
    return c.json({ error: '内部服务错误' }, 500)
  }
})

export default app
```

**安全架构总结：**
```
用户浏览器         你的后端           AI 服务
    │                │                  │
    │  请求(明文)     │                  │
    │───────────────►│                  │
    │                │  安全过滤         │
    │                │  ├ 验证格式       │
    │                │  ├ 检查注入       │
    │                │  ├ 截断长度       │
    │                │  └ 限流检查       │
    │                │                  │
    │                │  请求(带 API Key) │
    │                │─────────────────►│
    │                │                  │
    │                │  响应             │
    │                │◄─────────────────│
    │  响应          │                  │
    │◄───────────────│                  │
    │                │                  │
```

</details>

---

## ⚡ 进阶技巧

### 输出安全：防止 AI 泄露敏感信息

```typescript
// AI 输出后处理过滤器
function filterAiResponse(response: string): string {
  // 1. 替换可能的敏感信息
  const patterns = [
    { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[邮箱已过滤]' },
    { regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN 已过滤]' },
    { regex: /\b(?:sk-|pk-)[A-Za-z0-9-_]+\b/g, replacement: '[API Key 已过滤]' },
  ]

  let filtered = response
  for (const { regex, replacement } of patterns) {
    filtered = filtered.replace(regex, replacement)
  }

  return filtered
}
```

### 用户数据最小化原则

```typescript
// 只发送 AI 需要的、最少的数据
function prepareMessagesForAI(userInput: string, context?: any) {
  const messages = [{ role: 'user', content: userInput }]

  // 只添加必要的上下文
  if (context?.pageTitle) {
    messages[0].content = `[当前页面: ${context.pageTitle}]\n${userInput}`
  }
  // ❌ 不要发送用户邮箱、IP、浏览记录等

  return messages
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么 CORS 配置也是安全的一部分？**

> A：CORS（跨域资源共享）告诉浏览器「允许哪些域名的网页调用我们的 API」。如果不配 CORS，任何网站都可以在用户访问时偷偷用你的 API Key 调用 AI。正确配置后，只有你的前端应用可以调用，攻击者无法在恶意网站中嵌入对你的 API 的调用。

**Q2：为什么需要对 AI 的输出做安全过滤？**

> A：AI 模型可能在训练数据中见过一些敏感信息（真实的电话号码、邮件地址），虽然概率很低但不是零。输出过滤作为最后一道防线，确保即使 AI 输出了这些信息，也不会传到用户面前。

**Q3：前端的输入过滤和后端的输入过滤，哪个更重要？**

> A：后端过滤更重要。前端的过滤可以被绕过（用户直接在浏览器控制台发请求）。后端的过滤是真正的防线。前端过滤的目的是提升用户体验（即时反馈「不能输入这个」），后端过滤是安全底线。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| API Key 硬编码在 .env 文件中并提交到 Git | .env 文件被提交到仓库 | 添加 .env 到 .gitignore，使用 CI/CD 的环境变量 |
| 使用前端 SDK 直接调用 AI API | 方便省事，但完全暴露 API Key | 所有 AI 调用必须通过后端代理 |
| CORS 策略设置过于宽松（`*`） | 开发方便，忘了收紧 | 生产环境只允许具体的前端域名 |
| 用户上传的文件中嵌入了恶意内容 | 文件也是输入，安全过滤不能跳过 | 对所有输入（包括文件内容）做安全处理 |

---

## 📝 本章小结

- ✅ **API Key 保护** — 通过后端代理模式，Key 永不进入浏览器
- ✅ **后端代理** — 安全过滤 + 速率限制 + 审计日志
- ✅ **Prompt Injection 防御** — 前后端双层过滤 + 内容截断
- ✅ **输出安全** — 过滤 AI 输出的敏感信息
- ✅ **CORS 策略** — 限制允许调用的前端域名
- ✅ **数据最小化** — 只向 AI 发送必要信息，不泄露用户隐私

## ➡️ 下一步

> 恭喜你完成了 AI 驱动前端全部 6 章的学习！你现在已经掌握了从 AI-Native UI 模式、浏览器端推理、AI 组件设计、状态管理、边缘部署到安全防护的完整知识体系。
>
> 接下来，进入 [4.2 Agent UI Design](../4.2-agent-ui-design/README.md) 学习如何设计专为 Agent 交互优化的用户界面。
