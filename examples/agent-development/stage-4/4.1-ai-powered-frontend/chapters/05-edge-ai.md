# 第5章：边缘 AI — 在边缘运行时部署 AI 推理

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解边缘 AI 的概念和优势** — 为什么要在边缘运行 AI 推理
- **在 Vercel Edge Functions / Cloudflare Workers 上部署 AI 推理**
- **实现 AI 推理的边缘缓存策略** — 减少回源请求，降低延迟
- **选择合适的边缘 AI 部署方案** — 按场景选择 Cloudflare Workers、Vercel Edge、Deno Deploy 等

## 📋 前置知识

> 建议先完成：
> - [第4章：AI 状态管理](./04-state-management.md) — 了解 AI 状态管理

---

## 💡 核心概念

### 什么是边缘 AI？

**生活类比：** 你在商场里想找一家餐厅。方案 A：打电话给总部（中心服务器），总部查完再告诉你（传统云端）。方案 B：看商场里的楼层导航屏（边缘节点），屏上已经存储了所有餐厅信息，不需要打电话。

边缘 AI 就是把 AI 推理能力部署在「靠近用户」的边缘节点上——而不是集中在某个数据中心。

```
传统架构（中心化）：
  用户 → 🔄 跨海网络 → 🌆 中心服务器 → AI 推理
  延迟：200-500ms（跨区域）

边缘架构（分布式）：
  用户 → 🏪 边缘节点（东京、法兰克福、圣保罗） → AI 推理
  延迟：20-50ms（就近）
```

### Vercel Edge Functions + AI

```typescript
// api/ai/classify.ts — Vercel Edge Function
import { Hono } from 'hono'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const app = new Hono()

app.post('/api/classify', async (c) => {
  const { text } = await c.req.json()

  // 在 Edge Runtime 中调用 AI
  const result = streamText({
    model: createOpenAI('gpt-4o-mini'), // 使用轻量模型
    system: '将以下文本分类为：技术、产品、设计、运营，只返回分类名称。',
    prompt: text,
  })

  // 流式返回分类结果
  return result.toTextStreamResponse()
})

export default app

// vercel.json 配置
// {
//   "functions": {
//     "api/ai/**": {
//       "runtime": "edge"
//     }
//   }
// }
```

**💡 为什么边缘 AI 要用轻量模型？** 边缘节点的资源有限（CPU 通常比 GPU 弱，内存通常 <128MB）。轻量模型（如 GPT-4o-mini、Claude Haiku）的推理速度在边缘节点上可接受（<500ms），而重模型（如 GPT-4）可能导致超时。

### Cloudflare Workers + AI

Cloudflare Workers 的优势是内置 Workers AI——它直接在 Cloudflare 的全球网络上运行推理，支持多种开源模型：

```typescript
// worker/src/index.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const { text } = await request.json() as { text: string }

    // Workers AI 内置推理
    const answer = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
      prompt: `分析以下文本的情感（正面/负面/中性）：\n\n${text}`,
      max_tokens: 10,
    })

    return Response.json({ result: answer })
  },
}

// wrangler.toml 配置
// [ai]
// binding = "AI"
```

### 边缘缓存策略

```typescript
// 边缘 AI 的分级缓存
const cache = {
  // 第一级：内存缓存（Worker 本地，毫秒级）
  localCache: new Map<string, { result: any; expiresAt: number }>(),

  // 第二级：KV 存储（持久化，毫秒级）
  // Cloudflare KV / Vercel KV

  // 第三级：AI 推理（冷启动，秒级）
  async aiFallback(prompt: string): Promise<any> {
    return await runAiInference(prompt)
  },
}

// 缓存感知的 AI 调用
async function aiWithCache(prompt: string): Promise<any> {
  const cacheKey = `ai:${hash(prompt)}`

  // 1. 查本地缓存
  const cached = cache.localCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result
  }

  // 2. 查持久化缓存（KV）
  const kvCached = await KV_NAMESPACE.get(cacheKey, 'json')
  if (kvCached) {
    cache.localCache.set(cacheKey, { result: kvCached, expiresAt: Date.now() + 60000 })
    return kvCached
  }

  // 3. 调用 AI 推理
  const result = await cache.aiFallback(prompt)

  // 4. 写入缓存
  await KV_NAMESPACE.put(cacheKey, JSON.stringify(result), { expirationTtl: 3600 })
  cache.localCache.set(cacheKey, { result, expiresAt: Date.now() + 60000 })

  return result
}
```

---

## 🔨 实战演练

### 练习：构建边缘 AI 翻译 API

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

**Vercel Edge Function 版本：**
```typescript
// api/translate.ts
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

export const runtime = 'edge'
export const preferredRegion = 'iad1' // 部署在美东边缘节点

export async function POST(request: Request) {
  const { text, targetLang = 'Chinese' } = await request.json()

  // 流式翻译
  const result = streamText({
    model: createOpenAI('gpt-4o-mini'),
    system: `你是一个专业翻译。将以下文本翻译成${targetLang}。只返回翻译结果，不要加解释。`,
    prompt: text,
    // 限制 Token 用量
    maxTokens: 512,
    temperature: 0.1, // 低温度使翻译更一致
  })

  return result.toTextStreamResponse({
    headers: {
      'Cache-Control': 'public, s-maxage=3600', // CDN 缓存 1 小时
    },
  })
}
```

**Cloudflare Workers 版本：**
```typescript
// worker/translate.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { text, targetLang = 'Chinese' } = await request.json()
    const cacheKey = `translate:${hash(text)}:${targetLang}`

    // 检查缓存
    const cached = await env.TRANSLATE_CACHE.get(cacheKey)
    if (cached) {
      return new Response(cached, {
        headers: { 'X-Cache': 'HIT', 'Content-Type': 'text/plain' },
      })
    }

    // 调用 AI
    const result = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
      prompt: `Translate to ${targetLang}. Only return translation, no explanation:\n\n${text}`,
      max_tokens: 512,
    })

    // 写入缓存
    await env.TRANSLATE_CACHE.put(cacheKey, JSON.stringify(result), {
      expirationTtl: 86400, // 24 小时
    })

    return new Response(JSON.stringify(result), {
      headers: {
        'X-Cache': 'MISS',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  },
}
```

</details>

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：边缘 AI 和浏览器端 AI 有什么区别？**

> A：边缘 AI 运行在 CDN 边缘节点（服务器端），浏览器端 AI 运行在用户设备。边缘 AI 可以使用更大更强的模型（因为有服务器资源），但需要网络请求。浏览器端 AI 隐私性更好、离线可工作，但模型受限。最佳实践是：浏览器端做实时性要求高的轻量推理，边缘做需要更大模型的推理。

**Q2：为什么边缘 AI 特别适合翻译和分类这种任务？**

> A：翻译和分类是「有明确输入输出边界」的任务——输入一段文本，输出分类/翻译结果。它们不需要多轮对话、不需要长期上下文、模型相对小。这类任务在边缘节点上请求量巨大（每个用户都可能使用），用边缘缓存可以大幅减少回源调用，降低成本和延迟。

**Q3：Vercel Edge 和 Cloudflare Workers 的边缘 AI 方案各有什么优劣？**

> A：Vercel Edge 优势是「与 AI SDK 深度集成」，流式输出支持更好，适合 Next.js 应用。Cloudflare Workers 优势是「内置 Workers AI + 全球 KV 缓存 + 定价更低」，适合独立 API 服务。Vercel 对 Node.js 兼容性更好，Cloudflare 胜在性能和定价。

</details>

---

## ⚡ 进阶技巧

### 技巧一：多区域部署

```typescript
// 根据用户地理位置选择最近的边缘节点
const EDGE_REGIONS = {
  'na': 'us-east-1',       // 北美
  'eu': 'eu-west-1',       // 欧洲
  'as': 'ap-northeast-1',  // 亚太
  'sa': 'sa-east-1',       // 南美
}

function getNearestRegion(userIP: string): string {
  const region = geoLookup(userIP) // 用 geoip 库
  return EDGE_REGIONS[region] || 'us-east-1'
}
```

### 技巧二：混合边缘-云端策略

```typescript
// 简单任务用边缘，复杂任务回退到云端
async function hybridAI(prompt: string) {
  const complexity = estimateComplexity(prompt)
  if (complexity < 0.5) {
    return await edgeInference(prompt)   // 边缘：快速便宜
  } else {
    return await cloudInference(prompt)  // 云端：强大但慢
  }
}
```

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 边缘函数执行超时（>30秒） | 使用了大型模型或处理了过长文本 | 使用轻量模型、限制输入长度、拆分为多个小请求 |
| 冷启动延迟过高 | 边缘函数首次调用时加载运行时 | 使用 keep-alive、定期健康检查预热 |
| KV 缓存 miss 率过高 | 缓存时间太短或缓存键设计不合理 | 延长 TTL、使用语义哈希而非精确哈希作为缓存键 |
| 边缘节点不支持某些 Node.js API | Edge Runtime 的限制 | 使用 Hono/Itty Router 等轻量框架，避免依赖 fs/path 等模块 |

---

## 📝 本章小结

- ✅ **边缘 AI 概念** — 在 CDN 边缘节点部署 AI 推理，降低延迟
- ✅ **Vercel Edge Functions** — 使用 Edge Runtime + AI SDK 实现边缘推理
- ✅ **Cloudflare Workers AI** — 内置推理 API + KV 缓存，零配置冷启动
- ✅ **分级缓存策略** — 本地内存 → KV 存储 → AI 推理的三级缓存
- ✅ **适用场景** — 翻译、分类、简单对话，有明确输入输出的任务

## ➡️ 下一章预告

> 在下一章中，我们将探讨 AI 前端应用的安全问题——如何保护 API Key、防止 Prompt Injection、处理用户数据隐私。
> [第6章：前端安全](./06-frontend-security.md)
