# 第4章：Streaming 实现 — 流式输出的高级用法

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **深入理解 AI SDK 的流式协议** — Data Stream 协议的工作原理
- **实现流式结构化对象** — `streamObject` 逐步输出 JSON
- **自定义流式处理** — 中间件、变换、过滤
- **处理流式错误和中断** — AbortController、错误恢复

## 📋 前置知识

> 建议先完成：[第1章：AI SDK Core](./01-ai-sdk-core.md)

---

## 💡 核心概念

### 概念一：流式 vs 非流式的用户体验

**生活类比：** 非流式像等快递——下单后干等，快递到了才发现东西不对。流式像看厨师做菜——一边做一边上，不满意随时说「够了」。

```
非流式（generateText）：
  用户点击发送 → [等待 3-5 秒] → 看到完整回答
  
  感知：「怎么这么慢？是不是出错了？」

流式（streamText）：
  用户点击发送 → [0.2 秒] → 看到第一个字 → 逐字显示
  
  感知：「在写了在写了，速度还行！」

同样的生成时间，流式的用户体验好 10 倍。
```

### 概念二：streamText 的三种消费方式

```typescript
// src/streaming-patterns.ts
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const result = streamText({
  model: anthropic('claude-sonnet-4-5-20241022'),
  prompt: '写一篇 500 字的技术博客',
});

// 方式 1：textStream — 只要文本（最常用）
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);  // 逐字输出
}

// 方式 2：fullStream — 包含所有事件类型
for await (const event of result.fullStream) {
  switch (event.type) {
    case 'text-delta':
      process.stdout.write(event.textDelta);
      break;
    case 'tool-call':
      console.log(`\n🔧 调用工具: ${event.toolName}(${JSON.stringify(event.args)})`);
      break;
    case 'tool-result':
      console.log(`📋 工具结果: ${JSON.stringify(event.result)}`);
      break;
    case 'step-finish':
      console.log(`\n📌 步骤 ${event.stepNumber} 完成`);
      break;
    case 'finish':
      console.log(`\n✅ 全部完成: ${event.finishReason}`);
      break;
    case 'error':
      console.error(`❌ 错误: ${event.error}`);
      break;
  }
}

// 方式 3：await 等待完整结果
const finalText = await result.text;        // 等待流结束，获取完整文本
const usage = await result.usage;           // Token 使用量
const finishReason = await result.finishReason;  // 完成原因
const steps = await result.steps;           // 所有步骤信息
```

### 概念三：streamObject — 流式结构化输出

在生成结构化数据时，字段会逐步填充，UI 可以实时展示「正在填充」的效果。

```typescript
// src/stream-object.ts
import { streamObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const resumeSchema = z.object({
  name: z.string(),
  skills: z.array(z.string()),
  experience: z.array(z.object({
    company: z.string(),
    role: z.string(),
    highlights: z.array(z.string()),
  })),
});

const { partialObjectStream, object } = streamObject({
  model: anthropic('claude-sonnet-4-5-20241022'),
  schema: resumeSchema,
  prompt: '张三，3年 Vue 开发经验，目前在 ABC 科技做高级前端...',
});

// 逐步接收结构化数据
for await (const partial of partialObjectStream) {
  // partial 是逐步填充的对象
  // 第 1 次: { name: "张三" }
  // 第 2 次: { name: "张三", skills: ["Vue"] }
  // 第 3 次: { name: "张三", skills: ["Vue", "TypeScript"] }
  // ...
  console.clear();
  console.log(JSON.stringify(partial, null, 2));
}

// 等待完整结果
const final = await object;  // 完整的、经过 Zod 验证的对象
console.log('✅ 最终结果:', final);
```

> **💡 streamObject 的前端应用场景**
>
> 1. **表单自动填充** — 用户描述需求，AI 逐步填充表单字段
> 2. **代码生成** — 逐步显示文件结构和代码
> 3. **数据提取** — 从非结构化文本中逐步提取字段
> 4. **实时预览** — 用户看到 AI 正在「填表」的过程

### 概念四：流式中间件 — 拦截和转换

```typescript
// src/stream-middleware.ts
import { streamText, wrapLanguageModel, type LanguageModel } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

// 中间件：在流式输出中添加日志和计时
const loggingMiddleware = wrapLanguageModel({
  model: anthropic('claude-sonnet-4-5-20241022'),
  middleware: {
    // 拦截 stream 调用
    stream: async ({ doStream, params }) => {
      const start = Date.now();
      console.log(`🚀 开始流式生成，参数:`, JSON.stringify(params).slice(0, 100));

      const { stream, ...rest } = await doStream();

      // 对流做变换
      const transformedStream = stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            // 可以在这里修改、过滤、记录 chunk
            controller.enqueue(chunk);
          },
          flush() {
            const elapsed = Date.now() - start;
            console.log(`\n✅ 流式生成完成，耗时 ${elapsed}ms`);
          },
        })
      );

      return { stream: transformedStream, ...rest };
    },
  },
});

// 使用中间件包装后的模型
const result = streamText({
  model: loggingMiddleware,
  prompt: '什么是微服务？',
});
```

### 概念五：取消流式 — AbortController

```typescript
// src/abort-stream.ts
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const abortController = new AbortController();

// 开始生成
const result = streamText({
  model: anthropic('claude-sonnet-4-5-20241022'),
  prompt: '写一篇很长的文章',
  abortSignal: abortController.signal,
});

// 超时自动取消
setTimeout(() => {
  console.log('⏰ 超时，取消生成');
  abortController.abort();
}, 10000);

// 消费流（会提前结束）
try {
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('\n生成已取消');
  }
}

// 已生成的部分文本
const partialText = await result.text;
console.log(`\n已生成 ${partialText.length} 个字符`);
```

```tsx
// 前端：停止按钮
'use client';
import { useChat } from '@ai-sdk/react';

export function ChatWithStop() {
  const { messages, sendMessage, stop, status } = useChat();

  return (
    <div>
      {status === 'streaming' && (
        <button onClick={stop} className="bg-red-500 text-white px-3 py-1 rounded">
          ⏹ 停止生成
        </button>
      )}
      {/* ... */}
    </div>
  );
}
```

### 概念六：Data Stream 协议

了解 `toDataStreamResponse()` 背后的协议，有助于调试和自定义：

```
Data Stream 协议格式（每行一个事件）：

0:"Hello"              ← 文本片段（type 0）
0:" world"             ← 文本片段
2:{"toolCallId":"1",...}  ← 工具调用（type 2）
3:{"toolCallId":"1",...}  ← 工具结果（type 3）
e:{"finishReason":"stop",...}  ← 完成事件（type e）
d:{"finishReason":"stop",...}  ← 完成元数据（type d）
```

---

## 🔨 实战演练

### 练习：构建流式代码生成器

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// app/api/generate-code/route.ts
import { streamObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const codeSchema = z.object({
  filename: z.string(),
  language: z.string(),
  code: z.string(),
  explanation: z.string(),
  dependencies: z.array(z.string()),
});

export async function POST(req: Request) {
  const { requirement } = await req.json();

  const result = streamObject({
    model: anthropic('claude-sonnet-4-5-20241022'),
    schema: codeSchema,
    prompt: `根据以下需求生成代码：${requirement}`,
  });

  return result.toTextStreamResponse();
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：自定义流式中间件链

可以组合多个中间件，实现日志、缓存、过滤等横切关注点：

```typescript
// src/middleware-chain.ts
import { wrapLanguageModel, streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

// 缓存中间件
const cacheMiddleware = {
  stream: async ({ doStream, params }: any) => {
    const cacheKey = JSON.stringify(params);
    // 尝试从缓存获取
    const cached = await cache.get(cacheKey);
    if (cached) return { stream: createReadableStream(cached), ...rest };

    const { stream, ...rest } = await doStream();
    return { stream: stream.pipeThrough(cacheTransform(cacheKey)), ...rest };
  },
};

// 速率限制中间件
const rateLimitMiddleware = {
  stream: async ({ doStream, params }: any) => {
    const userId = params?.headers?.['x-user-id'];
    if (userId && !(await checkRate(userId))) {
      throw new Error('速率超限');
    }
    return doStream();
  },
};

const model = wrapLanguageModel({
  model: anthropic('claude-sonnet-4-5-20241022'),
  middleware: [rateLimitMiddleware, cacheMiddleware],
});
```

### 技巧二：使用 `fullStream` 实现流式 UI 仪表盘

```typescript
// 在前端实时展示生成状态
for await (const event of result.fullStream) {
  switch (event.type) {
    case 'text-delta':
      updateTextPreview(event.textDelta);      // 实时文本
      break;
    case 'tool-call':
      addToolCallLog(event.toolName, event.args); // 工具调用日志
      break;
    case 'step-finish':
      updateProgressBar(event.stepNumber);     // 进度条
      break;
    case 'finish':
      showCompletionStats(event.usage);        // 最终统计
      break;
  }
}
```

### 技巧三：流式中断恢复策略

对于长文本生成，记录已生成内容以防止全部重来：

```typescript
let generatedText = '';
const abortController = new AbortController();

try {
  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    prompt: '写一篇 5000 字的技术文章',
    abortSignal: abortController.signal,
    onChunk: ({ chunk }) => {
      if (chunk.type === 'text-delta') {
        generatedText += chunk.textDelta;
        // 每 1000 字符保存一次快照
        if (generatedText.length % 1000 < chunk.textDelta.length) {
          saveSnapshot(generatedText);
        }
      }
    },
  });
  // ... 消费流
} catch (error) {
  if (error.name === 'AbortError') {
    // 恢复：将已生成文本作为上下文继续生成
    const resumeResult = streamText({
      model: anthropic('claude-sonnet-4-5-20241022'),
      prompt: `继续生成以下文章（已生成了 ${generatedText.length} 字）：\n\n${generatedText.slice(-500)}\n\n请从这里继续：`,
    });
    // ...
  }
}
```

## 🧠 知识检查点

<details>
<summary>1️⃣ `textStream`、`fullStream` 和 `toDataStreamResponse()` 有什么区别？</summary>

> A: `textStream` 只输出纯文本片段，适用于只需要显示文本的场景；`fullStream` 包含所有事件类型（text-delta、tool-call、finish、error 等），适用于需要完整控制 UI 的场景；`toDataStreamResponse()` 将流转换为标准的 Data Stream 协议 HTTP 响应，适用于前后端分离的架构。

</details>

<details>
<summary>2️⃣ 什么是 `streamObject`？何时应该使用它？</summary>

> A: `streamObject` 是 AI SDK 提供的流式结构化输出工具，它逐步生成并返回符合 Zod Schema 的 JSON 对象。适用于表单自动填充、代码生成、数据提取等需要逐步展示结构化结果的场景。前端可以通过 `partialObjectStream` 实时获取部分填充的对象。

</details>

<details>
<summary>3️⃣ 如何使用 `AbortController` 取消流式生成？取消后还能获取已生成的内容吗？</summary>

> A: 将 `AbortController` 的 `signal` 传入 `streamText` 的 `abortSignal` 参数，调用 `abortController.abort()` 即可取消。取消后可以通过 `await result.text` 获取已生成的部分文本，但 `text` 属性会包含到取消那一刻为止的所有内容。前端 `useChat` 的 `stop()` 函数封装了此逻辑。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| ⚠️ streamObject 返回空对象 | Zod Schema 定义不正确或模型输出与 Schema 不匹配 | 检查 Zod Schema 是否严格匹配预期输出，使用 `.partial()` 允许部分字段先为空 |
| ⚠️ 流式 UI 卡顿或闪烁 | 前端每次收到 chunk 都触发全量重新渲染 | 使用 `useChat` hook 的 `message.parts` 增量更新，或使用 `React.memo` + 虚拟列表优化 |
| ⚠️ AbortController 未触发取消 | `abortSignal` 传入的位置错误或 controller 作用域不对 | 确保同一个 `AbortController` 实例的 `signal` 传入了 `streamText`，且在 Promise 链外调用 `abort()` |
| ⚠️ 中间件影响流完整性 | 中间件中 `TransformStream` 的 `controller.enqueue()` 未正确转发所有 chunk | 确保中间件的 `transform` 函数对每个 chunk 都调用了 `controller.enqueue(chunk)`，除非有意过滤 |

---

## 📝 本章小结

- ✅ **textStream / fullStream** — 两种流消费方式
- ✅ **streamObject** — 流式结构化输出，字段逐步填充
- ✅ **中间件** — wrapLanguageModel 拦截和转换流
- ✅ **AbortController** — 取消流式生成
- ✅ **Data Stream 协议** — AI SDK 的流式通信协议

## ➡️ 下一章预告

> [第5章：工具调用集成](./05-tool-use.md) — 在前端触发后端工具执行，构建 AI Agent。
