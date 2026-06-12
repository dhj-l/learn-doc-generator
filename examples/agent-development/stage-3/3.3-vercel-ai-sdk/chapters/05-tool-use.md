# 第5章：工具调用集成 — 让 AI 动手做事

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 `tool()` 定义工具** — 参数 Schema、执行函数、描述
- **实现多步工具调用** — maxSteps 让模型连续调用多个工具
- **在前端展示工具调用过程** — 实时显示「正在查询天气...」
- **构建一个完整的 Agent 聊天应用**

## 📋 前置知识

> 建议先完成：
> - [第1章：AI SDK Core](./01-ai-sdk-core.md)
> - [2.2 Function Calling 与 Tool Use](../../stage-2/2.2-function-calling-and-tool-use/README.md)

---

## 💡 核心概念

### 概念一：AI SDK 的工具定义

**生活类比：** 你给 AI 一个「工具箱」，每个工具有说明书（description）和使用方法（execute）。AI 看到用户的问题后，自己决定用哪个工具、传什么参数。

```typescript
// src/tools/weather.ts
import { tool } from 'ai';
import { z } from 'zod';

export const weatherTool = tool({
  // 工具名和描述——AI 根据描述决定何时使用
  description: '获取指定城市的当前天气信息',

  // 参数 Schema——Zod 定义输入格式
  parameters: z.object({
    city: z.string().describe('城市名称，如"北京"、"上海"'),
  }),

  // 执行函数——实际的业务逻辑
  execute: async ({ city }) => {
    // 实际项目中调用天气 API
    const mockWeather: Record<string, { temp: number; desc: string }> = {
      '北京': { temp: 25, desc: '晴' },
      '上海': { temp: 28, desc: '多云' },
      '深圳': { temp: 30, desc: '雷阵雨' },
    };

    const weather = mockWeather[city] || { temp: 20, desc: '未知' };
    return {
      city,
      temperature: weather.temp,
      description: weather.desc,
      unit: '°C',
    };
  },
});
```

### 概念二：在 generateText 中使用工具

```typescript
// src/agent-basic.ts
import { generateText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const result = await generateText({
  model: anthropic('claude-sonnet-4-5-20241022'),
  prompt: '北京和上海今天天气怎么样？哪个更适合出门？',
  tools: {
    getWeather: weatherTool,
  },
  maxSteps: 5,  // 允许多步工具调用
});

console.log('回答:', result.text);
console.log('工具调用记录:');
result.toolCalls?.forEach((call, i) => {
  console.log(`  ${i + 1}. ${call.toolName}(${JSON.stringify(call.args)})`);
});
console.log('工具结果:');
result.toolResults?.forEach((res, i) => {
  console.log(`  ${i + 1}. ${JSON.stringify(res.result)}`);
});
```

```
预期输出：
回答: 北京今天 25°C 晴天，上海 28°C 多云。两个城市天气都不错，
但北京更凉爽一些，适合户外活动。如果是怕热的人，建议选北京。

工具调用记录:
  1. getWeather({"city":"北京"})
  2. getWeather({"city":"上海"})

工具结果:
  1. {"city":"北京","temperature":25,"description":"晴","unit":"°C"}
  2. {"city":"上海","temperature":28,"description":"多云","unit":"°C"}
```

### 概念三：maxSteps 多步工具调用

`maxSteps` 控制模型在一个 generateText 调用中可以执行的最大轮数。

```
maxSteps: 1（默认）→ 模型调用一次工具就结束
maxSteps: 5        → 模型最多可以：调用工具 → 观察结果 → 再调用 → ... → 最终回答

执行流程：
  用户问题 → LLM 思考 → 调用工具 A → 观察结果
                         → 调用工具 B → 观察结果
                         → 整合结果 → 生成最终回答
```

```typescript
// maxSteps 的实际效果
const result = await generateText({
  model: anthropic('claude-sonnet-4-5-20241022'),
  prompt: '查询北京天气，然后把温度转换为华氏度',
  tools: {
    getWeather: weatherTool,
    convertToFahrenheit: tool({
      description: '将摄氏度转为华氏度',
      parameters: z.object({ celsius: z.number() }),
      execute: async ({ celsius }) => ({
        fahrenheit: celsius * 9 / 5 + 32,
      }),
    }),
  },
  maxSteps: 5,
  // 模型会：getWeather("北京") → 得到 25°C → convertToFahrenheit(25) → 得到 77°F → 回答
});
```

### 概念四：在流式输出中展示工具调用

```typescript
// app/api/chat/route.ts
import { streamText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: '你是一个智能助手，可以查询天气和做计算。',
    messages,
    tools: {
      getWeather: weatherTool,
      calculator: calculatorTool,
    },
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
```

```tsx
// app/page.tsx — 前端展示工具调用
'use client';
import { useChat } from '@ai-sdk/react';

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat();

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part, i) => {
            switch (part.type) {
              case 'text':
                return <p key={i}>{part.text}</p>;

              case 'tool-invocation': {
                // 工具调用 UI
                const { toolName, state, args } = part.toolInvocation;
                if (state === 'call') {
                  return (
                    <div key={i} className="bg-yellow-50 p-2 rounded my-1">
                      🔧 正在调用: <strong>{toolName}</strong>
                      <code className="text-sm ml-2">{JSON.stringify(args)}</code>
                      <span className="animate-pulse ml-2">⏳</span>
                    </div>
                  );
                }
                if (state === 'result') {
                  return (
                    <div key={i} className="bg-green-50 p-2 rounded my-1">
                      ✅ <strong>{toolName}</strong> 结果:
                      <code className="text-sm ml-2">
                        {JSON.stringify(part.toolInvocation.result).slice(0, 200)}
                      </code>
                    </div>
                  );
                }
                return null;
              }

              default:
                return null;
            }
          })}
        </div>
      ))}
    </div>
  );
}
```

### 概念五：常用工具模式

```typescript
// 模式 1：API 调用工具
const searchTool = tool({
  description: '搜索互联网获取信息',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => {
    const res = await fetch(`https://api.search.com/?q=${encodeURIComponent(query)}`);
    return res.json();
  },
});

// 模式 2：数据库查询工具
const dbQueryTool = tool({
  description: '查询用户数据库',
  parameters: z.object({
    table: z.enum(['users', 'orders', 'products']),
    condition: z.string().describe('SQL WHERE 条件'),
  }),
  execute: async ({ table, condition }) => {
    // 注意：生产环境一定要做参数校验和 SQL 注入防护！
    const safeCondition = sanitizeSQL(condition);
    return db.query(`SELECT * FROM ${table} WHERE ${safeCondition} LIMIT 10`);
  },
});

// 模式 3：文件操作工具
const readFileTool = tool({
  description: '读取本地文件内容',
  parameters: z.object({ path: z.string() }),
  execute: async ({ path }) => {
    const fs = await import('fs/promises');
    return fs.readFile(path, 'utf-8');
  },
});
```

---

## 🔨 实战演练

### 练习：构建一个带工具的 AI 助手后端

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// app/api/chat/route.ts
import { streamText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// 天气工具
const getWeather = tool({
  description: '获取城市天气',
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    // 模拟 API 调用
    return { city, temp: Math.floor(Math.random() * 15) + 15, condition: '晴' };
  },
});

// 计算工具
const calculator = tool({
  description: '数学计算器',
  parameters: z.object({ expression: z.string() }),
  execute: async ({ expression }) => {
    try { return { result: Function(`"use strict";return(${expression})`)() }; }
    catch { return { error: '无效表达式' }; }
  },
});

// 搜索工具
const search = tool({
  description: '搜索技术文档',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => `搜索"${query}"的结果：相关技术文档...`,
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: `你是一个全能助手。使用工具来帮助用户。
- 查询天气用 getWeather
- 计算用 calculator
- 搜索用 search`,
    messages,
    tools: { getWeather, calculator, search },
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：工具调用链与条件逻辑

利用 `maxSteps` 让模型自主决定工具调用的顺序和条件：

```typescript
// 模型可以自主决策：搜索 → 分析结果 → 决定是否再搜索 → 最终回答
const result = await generateText({
  model: anthropic('claude-sonnet-4-5-20241022'),
  prompt: '对比 React 和 Vue 的最新版本特性，并给出选型建议',
  tools: { webSearch, docLookup, codeSearch },
  maxSteps: 10, // 允许多步推理 + 多工具调用
  onStepFinish: ({ stepNumber, text, toolCalls }) => {
    console.log(`📌 步骤 ${stepNumber} 完成`);
    console.log(`  模型回复: ${text?.slice(0, 80)}`);
    toolCalls?.forEach(tc => console.log(`  调用工具: ${tc.toolName}`));
  },
});
```

### 技巧二：工具执行超时控制

长时间执行的工具会影响整体响应速度，添加超时保护：

```typescript
import { tool } from 'ai';
import { z } from 'zod';

function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('工具执行超时')), ms)
    ),
  ]);
}

export const safeApiTool = tool({
  description: '安全调用外部 API（带超时）',
  parameters: z.object({ endpoint: z.string() }),
  execute: async ({ endpoint }) => {
    return withTimeout(async () => {
      const res = await fetch(endpoint);
      return res.json();
    }, 5000); // 5 秒超时
  },
});
```

### 技巧三：工具结果缓存与去重

当多个工具调用请求相同数据时，避免重复请求：

```typescript
// src/tools-with-cache.ts
const toolCallCache = new Map<string, any>();

export function createCachedTool(toolDef: any) {
  return {
    ...toolDef,
    execute: async (args: any) => {
      const cacheKey = `${toolDef.name}:${JSON.stringify(args)}`;
      if (toolCallCache.has(cacheKey)) {
        console.log(`🎯 缓存命中: ${cacheKey}`);
        return toolCallCache.get(cacheKey);
      }
      const result = await toolDef.execute(args);
      toolCallCache.set(cacheKey, result);
      // 限制缓存大小
      if (toolCallCache.size > 100) {
        const firstKey = toolCallCache.keys().next().value;
        toolCallCache.delete(firstKey);
      }
      return result;
    },
  };
}
```

## 🧠 知识检查点

<details>
<summary>1️⃣ `tool()` 的三个核心参数是什么？各自的作用是什么？</summary>

> A: ① `description` — 描述工具的功能，帮助 AI 模型决定何时使用该工具；② `parameters` — 使用 Zod Schema 定义工具接受的参数格式，模型会根据 Schema 生成正确的参数；③ `execute` — 实际的工具执行函数，接收参数并返回结果。

</details>

<details>
<summary>2️⃣ `maxSteps` 参数的作用是什么？设置过大或过小会有什么影响？</summary>

> A: `maxSteps` 控制模型在一次 `generateText` 或 `streamText` 调用中可以进行的最多工具调用轮数。设置过小（如 1）会导致模型只能调用一次工具就结束，无法完成复杂任务；设置过大（如 50）可能导致无限循环或 Token 消耗激增。推荐值：简单工具链 3-5，复杂 Agent 任务 10-15。

</details>

<details>
<summary>3️⃣ 在前端如何实时展示工具调用的状态（调用中/已完成/失败）？</summary>

> A: 通过 `message.parts` 中 `type === 'tool-invocation'` 的部分获取工具调用信息。`part.toolInvocation.state` 有三种状态：`'call'`（正在调用）、`'result'`（已完成）、`'error'`（失败）。根据状态渲染不同的 UI：调用中显示加载动画，完成显示结果摘要，失败显示错误信息和重试按钮。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| ⚠️ 工具从未被模型调用 | `description` 描述不够清晰，模型不理解工具的用途 | 为 `description` 写具体、详细的说明，包含何时使用、示例查询和返回值说明 |
| ⚠️ 工具参数错误 | Zod Schema 定义不完整或类型不匹配 | 使用 `.describe()` 为每个参数添加说明，使用 `.optional()` 标记可选参数，通过 `z.enum()` 限制枚举值 |
| ⚠️ 多步工具调用死循环 | 模型反复调用工具而无法得出最终结论 | 设置合理的 `maxSteps` 上限，检查工具 `execute` 是否返回了模型能理解的明确结果，使用 `onStepFinish` 监控调用链 |
| ⚠️ 前端工具调用 UI 状态不同步 | 没有正确处理 `state === 'call'` 和 `state === 'result'` 的过渡 | 将 `part.toolInvocation.state` 作为 key 渲染不同组件，使用 `useChat` 的 `status` 判断整体状态（`streaming`/`submitted` 等） |

---

## 📝 本章小结

- ✅ **tool() 定义工具** — description + parameters + execute
- ✅ **maxSteps** — 控制多步工具调用的轮数
- ✅ **前端展示** — `part.type === 'tool-invocation'` 渲染工具调用过程
- ✅ **工具模式** — API 调用、数据库查询、文件操作等

## ➡️ 下一章预告

> [第6章：综合实战 — 全栈 AI 应用](./06-capstone-ai-app.md) — 构建一个完整的 Next.js + AI SDK 应用。
