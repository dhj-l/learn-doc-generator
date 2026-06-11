# 第5章：高级特性 — Prompt Caching、Extended Thinking 与 Batch API

> 预计学习时间：90-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 Prompt Caching 降低成本** — 缓存重复的 System Prompt 和上下文
- **使用 Extended Thinking 进行深度推理** — 让模型展示深度思考过程
- **使用 Batch API 批量处理** — 大规模异步任务的成本优化方案
- **管理速率限制和重试策略** — 生产环境中的健壮性保障

## 📋 前置知识

> 建议先完成：[第1章：API 基础](./01-api-fundamentals.md) 和 [第2章：多轮对话](./02-multi-turn-conversations.md)

---

## 💡 核心概念

### 概念一：Prompt Caching — 大幅降低成本

**生活类比：** 想象你每天上班都要查路线。第一天你查了地图，之后你记住了路线——这就是缓存。Prompt Caching 也是同样的原理：把不变的内容缓存起来，下次直接复用，不用重新处理。

#### 为什么 Prompt Caching 重要？

```
场景：你的 AI 客服机器人有一个很长的 System Prompt（3000 Token）

无缓存：每次用户提问都要重新处理 3000 Token 的 System Prompt
  → 每次成本 = 3000 × $0.003/1K = $0.009

有缓存：第一次处理后缓存，后续直接读取
  → 首次成本 = 3000 × $0.003/1K = $0.009（缓存写入）
  → 后续成本 = 3000 × $0.0003/1K = $0.0009（缓存读取，便宜 90%！）

如果有 1000 次对话：
  无缓存：$9.00
  有缓存：$0.009 + $0.0009 × 999 ≈ $0.91（节省 90%）
```

#### 实现 Prompt Caching

```typescript
// src/01-prompt-caching.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// 缓存的 System Prompt（通常是一段很长的角色设定和规则）
const CACHED_SYSTEM_PROMPT = `
# 身份
你是一个企业级技术文档助手，精通以下技术栈：
- TypeScript / JavaScript
- React / Vue / Angular
- Node.js / Deno / Bun
- PostgreSQL / MongoDB / Redis
- Docker / Kubernetes / AWS / GCP

# 行为规范
（...这里可能有几千字的详细规则...）

# 输出格式
（...详细的格式要求...）
`;

// 使用 Prompt Caching 的 API 调用
async function chatWithCache(userMessage: string, conversationHistory: Anthropic.MessageParam[] = []) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: CACHED_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },  // ← 关键：启用缓存
      },
    ],
    messages: [
      ...conversationHistory,
      { role: 'user', content: userMessage },
    ],
  });

  // 查看缓存命中情况
  const usage = response.usage;
  console.log('Token 使用情况:', {
    输入: usage.input_tokens,
    缓存创建: usage.cache_creation_input_tokens,  // 首次缓存写入
    缓存读取: usage.cache_read_input_tokens,        // 后续缓存命中
    输出: usage.output_tokens,
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// 演示：多次调用观察缓存效果
async function main() {
  console.log('=== 第 1 次调用（缓存写入）===');
  await chatWithCache('什么是 React？');

  console.log('\n=== 第 2 次调用（缓存命中）===');
  await chatWithCache('什么是 Vue？');

  console.log('\n=== 第 3 次调用（缓存命中）===');
  await chatWithCache('React 和 Vue 的区别？');
}

main();
```

```
预期输出：
=== 第 1 次调用（缓存写入）===
Token 使用情况: { 输入: 50, 缓存创建: 3000, 缓存读取: 0, 输出: 150 }

=== 第 2 次调用（缓存命中）===
Token 使用情况: { 输入: 50, 缓存创建: 0, 缓存读取: 3000, 输出: 120 }

=== 第 3 次调用（缓存命中）===
Token 使用情况: { 输入: 50, 缓存创建: 0, 缓存读取: 3000, 输出: 200 }
```

#### 缓存的最佳实践

```typescript
// 缓存策略：将不变的内容标记为缓存，可变内容不标记

const system = [
  // 缓存部分：角色定义和规则（不变）
  {
    type: 'text' as const,
    text: `你是一个技术文档助手...（很长的角色设定）`,
    cache_control: { type: 'ephemeral' as const },
  },
  // 不缓存部分：动态注入的上下文（每次不同）
  {
    type: 'text' as const,
    text: `当前用户：${userName}\n当前文档：${docTitle}`,
    // 没有 cache_control，不缓存
  },
];
```

### 概念二：Extended Thinking — 深度推理模式

Extended Thinking 让 Claude 在回答之前进行更深入的内部推理。适合复杂推理、数学、编程等需要深度思考的任务。

```typescript
// src/02-extended-thinking.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function deepThinking(problem: string) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 16000,
    thinking: {
      type: 'enabled',
      budget_tokens: 10000,  // 分配给思考的 Token 预算
    },
    messages: [
      { role: 'user', content: problem },
    ],
  });

  // 响应中包含 thinking 和 text 两种内容块
  for (const block of response.content) {
    if (block.type === 'thinking') {
      console.log('🧠 思考过程:');
      console.log(block.thinking);
      console.log('\n' + '─'.repeat(50) + '\n');
    } else if (block.type === 'text') {
      console.log('💬 最终回答:');
      console.log(block.text);
    }
  }

  return response;
}

// 使用示例：复杂推理问题
await deepThinking(`
证明：对于任意正整数 n，n³ - n 能被 6 整除。
`);
```

```
预期输出：
🧠 思考过程:
让我逐步证明 n³ - n 能被 6 整除。

首先，因式分解：n³ - n = n(n² - 1) = n(n-1)(n+1)

这是三个连续整数的乘积。

在任意三个连续整数中：
1. 必有一个能被 2 整除（偶数）
2. 必有一个能被 3 整除

因此，n(n-1)(n+1) 必能被 2 × 3 = 6 整除。
证毕。

──────────────────────────────────────

💬 最终回答:
证明如下：
n³ - n = n(n-1)(n+1) 是三个连续整数的乘积。
连续三个整数中必有一个偶数（被 2 整除）和一个 3 的倍数。
因此 n³ - n 能被 6 整除。
```

#### Thinking 的流式处理

```typescript
// 流式 Thinking
async function streamThinking(problem: string) {
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 16000,
    thinking: { type: 'enabled', budget_tokens: 10000 },
    messages: [{ role: 'user', content: problem }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_start') {
      if (event.content_block.type === 'thinking') {
        console.log('\n🧠 [开始思考]');
      } else if (event.content_block.type === 'text') {
        console.log('\n💬 [开始回答]');
      }
    } else if (event.type === 'content_block_delta') {
      if (event.delta.type === 'thinking_delta') {
        process.stdout.write(event.delta.thinking);
      } else if (event.delta.type === 'text_delta') {
        process.stdout.write(event.delta.text);
      }
    }
  }
}
```

### 概念三：Batch API — 大规模批处理

当你有大量独立的请求需要处理时，Batch API 比逐个调用便宜 50%。

```typescript
// src/03-batch-api.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function batchProcess() {
  // 创建批处理请求
  const batch = await client.messages.batches.create({
    requests: [
      {
        custom_id: 'review-001',
        params: {
          model: 'claude-sonnet-4-5-20241022',
          max_tokens: 500,
          messages: [
            { role: 'user', content: '审查这段代码：function add(a,b){return a+b}' }
          ],
        },
      },
      {
        custom_id: 'review-002',
        params: {
          model: 'claude-sonnet-4-5-20241022',
          max_tokens: 500,
          messages: [
            { role: 'user', content: '审查这段代码：const x = null; console.log(x.length)' }
          ],
        },
      },
      // ... 最多 100,000 个请求
    ],
  });

  console.log('📦 批处理已创建:', batch.id);
  console.log('状态:', batch.processing_status);

  // 轮询等待完成
  let result = batch;
  while (result.processing_status === 'in_progress') {
    await new Promise(r => setTimeout(r, 5000)); // 等 5 秒
    result = await client.messages.batches.retrieve(batch.id);
    console.log(`⏳ 处理中... 已完成 ${result.request_counts?.succeeded || 0}/${result.request_counts?.processing || 0}`);
  }

  // 获取结果
  const results = await client.messages.batches.results(batch.id);
  for await (const result of results) {
    if (result.result.type === 'succeeded') {
      const text = result.result.message.content[0].type === 'text'
        ? result.result.message.content[0].text
        : '';
      console.log(`\n✅ ${result.custom_id}:`);
      console.log(text.substring(0, 200));
    } else {
      console.error(`❌ ${result.custom_id}:`, result.result.type);
    }
  }
}

batchProcess();
```

### 概念四：速率限制与重试策略

```typescript
// src/04-retry-strategy.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  maxRetries: 3, // SDK 内置自动重试（默认 2 次）
});

// 自定义重试策略
async function resilientApiCall(
  params: Anthropic.MessageCreateParams,
  maxRetries: number = 5
): Promise<Anthropic.Message> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (error: any) {
      lastError = error;

      if (error instanceof Anthropic.RateLimitError) {
        // 速率限制：指数退避
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        console.warn(`⚠️ 速率限制，${(delay / 1000).toFixed(1)}s 后重试 (${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      if (error instanceof Anthropic.APIError && error.status >= 500) {
        // 服务端错误：重试
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`⚠️ 服务端错误 ${error.status}，${(delay / 1000).toFixed(1)}s 后重试`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // 客户端错误（400、401 等）：不重试
      throw error;
    }
  }

  throw lastError || new Error('重试次数耗尽');
}
```

---

## 🔨 实战演练

### 练习：使用 Prompt Caching 优化客服系统成本

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// 知识库内容（很长，适合缓存）
const KNOWLEDGE_BASE = `
# 产品知识库

## 产品 A：智能手表 Pro
- 价格：¥1,999
- 功能：心率监测、GPS、NFC 支付、IP68 防水
- 保修：2 年
...（假设这里有几千字的产品信息）
`;

const SYSTEM_PROMPT = `
你是一个产品客服助手。

## 知识库
${KNOWLEDGE_BASE}

## 规则
- 基于知识库回答，不要编造
- 找不到答案时建议联系人工客服
- 回答简洁明了
`;

// 使用缓存优化
async function customerServiceChat(question: string) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 500,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: question }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const usage = response.usage;

  // 计算实际成本
  const inputCost = usage.input_tokens * 3 / 1000000;          // $3/M tokens
  const cacheReadCost = usage.cache_read_input_tokens * 0.3 / 1000000;  // $0.3/M tokens
  const cacheWriteCost = usage.cache_creation_input_tokens * 3.75 / 1000000;
  const outputCost = usage.output_tokens * 15 / 1000000;       // $15/M tokens
  const totalCost = inputCost + cacheReadCost + cacheWriteCost + outputCost;

  console.log(`💰 成本明细：$${totalCost.toFixed(6)}`);
  return text;
}
```

</details>

---

## 📝 本章小结

- ✅ **Prompt Caching** — 缓存不变的 System Prompt，节省 90% 成本
- ✅ **Extended Thinking** — 深度推理模式，适合复杂推理任务
- ✅ **Batch API** — 批量处理独立请求，价格降低 50%
- ✅ **重试策略** — 指数退避 + 区分错误类型

## ➡️ 下一章预告

> [第6章：综合实战 — 多模型聊天应用](./06-capstone-chat-app.md) — 将所有知识整合为一个完整的聊天应用。
