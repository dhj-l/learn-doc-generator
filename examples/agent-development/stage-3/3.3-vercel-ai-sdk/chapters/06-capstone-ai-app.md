# 第6章：综合实战 — Next.js + AI SDK 全栈应用

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **综合运用 AI SDK 全部核心能力** — streamText、useChat、工具调用、多模型
- **构建生产级的全栈 AI 应用** — 前后端分离、错误处理、性能优化
- **实现完整的聊天应用功能** — 对话、工具、模型切换、历史管理

## 📋 前置知识

> 建议完成：[第1-5章](./01-ai-sdk-core.md) 的所有内容

---

## 💡 项目概述

构建一个**智能编程助手**，功能包括：

```
┌──────────────────────────────────────────────────────┐
│              智能编程助手 — 功能架构                    │
├──────────────────────────────────────────────────────┤
│                                                       │
│  🖥️ 前端（Next.js + React）                            │
│  ├── 聊天界面 — useChat + Markdown 渲染                │
│  ├── 模型选择器 — 运行时切换 Claude/GPT/Gemini          │
│  ├── 工具调用展示 — 实时显示工具执行状态                  │
│  └── 对话历史 — localStorage 持久化                    │
│                                                       │
│  ⚙️ 后端（Next.js API Route）                          │
│  ├── /api/chat — 流式对话 + 工具调用                   │
│  ├── 模型降级 — 主模型失败自动切换                      │
│  ├── 工具集 — 代码搜索、代码执行、文档查询              │
│  └── 速率限制 — 防止滥用                              │
│                                                       │
└──────────────────────────────────────────────────────┘
```

---

## 🔨 实战演练

### 第一步：项目初始化

```bash
npx create-next-app@latest ai-code-assistant --typescript --tailwind --app
cd ai-code-assistant
npm install ai @ai-sdk/anthropic @ai-sdk/openai zod
npm install react-markdown react-syntax-highlighter
npm install -D @types/react-syntax-highlighter
```

### 第二步：Provider 配置

```typescript
// lib/providers.ts
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

export const models = {
  'claude-sonnet': anthropic('claude-sonnet-4-5-20241022'),
  'claude-haiku': anthropic('claude-haiku-4-5-20251001'),
  'gpt-4o': openai('gpt-4o'),
  'gpt-4o-mini': openai('gpt-4o-mini'),
} as const;

export type ModelKey = keyof typeof models;
```

### 第三步：工具定义

```typescript
// lib/tools.ts
import { tool } from 'ai';
import { z } from 'zod';

// 代码搜索工具
export const codeSearch = tool({
  description: '在代码库中搜索代码片段。当用户询问代码相关问题时使用。',
  parameters: z.object({
    query: z.string().describe('搜索关键词'),
    language: z.string().optional().describe('编程语言过滤，如 typescript、python'),
  }),
  execute: async ({ query, language }) => {
    // 模拟代码搜索
    const results = [
      { file: 'src/utils/helper.ts', line: 15, code: `export function debounce(fn, ms) { ... }` },
      { file: 'src/hooks/useApi.ts', line: 8, code: `export function useApi<T>(url: string) { ... }` },
    ];
    return { results, total: results.length };
  },
});

// 文档查询工具
export const docLookup = tool({
  description: '查询技术文档。当用户询问框架、库、API 的用法时使用。',
  parameters: z.object({
    topic: z.string().describe('查询主题'),
    framework: z.string().optional().describe('框架名称，如 vue、react、nextjs'),
  }),
  execute: async ({ topic, framework }) => {
    return {
      topic,
      framework,
      content: `关于 "${topic}" 的文档摘要：...`,
      source: `https://docs.${framework || 'example'}.com/${topic}`,
    };
  },
});

// 代码执行工具
export const codeExecutor = tool({
  description: '执行 JavaScript/TypeScript 代码片段并返回结果。',
  parameters: z.object({
    code: z.string().describe('要执行的代码'),
  }),
  execute: async ({ code }) => {
    try {
      // 注意：生产环境需要沙箱执行！
      const result = Function(`"use strict";\n${code}`)();
      return { success: true, output: String(result) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
});
```

### 第四步：Chat API Route

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { models, type ModelKey } from '@/lib/providers';
import { codeSearch, docLookup, codeExecutor } from '@/lib/tools';

// 简单的速率限制
const rateLimit = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimit.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimit.set(userId, { count: 1, resetTime: now + 60000 }); // 1 分钟窗口
    return true;
  }

  if (userLimit.count >= 20) return false; // 每分钟 20 次
  userLimit.count++;
  return true;
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(ip)) {
    return new Response('请求太频繁，请稍后再试', { status: 429 });
  }

  const { messages, model: modelKey = 'claude-sonnet' } = await req.json();

  const selectedModel = models[modelKey as ModelKey];
  if (!selectedModel) {
    return new Response('无效的模型', { status: 400 });
  }

  const result = streamText({
    model: selectedModel,
    system: `你是一个高级编程助手。你的能力包括：
1. 解答编程问题
2. 搜索代码库中的代码
3. 查询技术文档
4. 执行代码片段

使用中文回答。回答要简洁准确。
当用户问到代码问题时，优先使用 codeSearch 工具。
当需要执行代码验证时，使用 codeExecutor 工具。`,
    messages,
    tools: { codeSearch, docLookup, codeExecutor },
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
```

### 第五步：前端聊天界面

```tsx
// app/page.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const MODEL_OPTIONS = [
  { value: 'claude-sonnet', label: 'Claude Sonnet 4.5', color: 'bg-purple-100' },
  { value: 'gpt-4o', label: 'GPT-4o', color: 'bg-green-100' },
  { value: 'claude-haiku', label: 'Claude Haiku (快速)', color: 'bg-blue-100' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (经济)', color: 'bg-yellow-100' },
];

export default function ChatPage() {
  const [model, setModel] = useState('claude-sonnet');

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: () => ({ model }),  // 动态传递模型选择
    }),
  });

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-xl font-bold">🤖 AI 编程助手</h1>
        <div className="flex items-center gap-2">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="px-3 py-1 border rounded"
          >
            {MODEL_OPTIONS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <button
            onClick={() => setMessages([])}
            className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
          >
            🗑️ 清空
          </button>
        </div>
      </div>

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-20">
            <p className="text-4xl mb-4">🤖</p>
            <p>你好！我是 AI 编程助手。</p>
            <p className="text-sm mt-2">我可以搜索代码、查询文档、执行代码片段。</p>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-50'} p-4 rounded-lg`}>
              {message.parts.map((part, i) => {
                // 文本部分
                if (part.type === 'text') {
                  return message.role === 'user' ? (
                    <p key={i}>{part.text}</p>
                  ) : (
                    <ReactMarkdown key={i} className="prose prose-sm max-w-none"
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '');
                          return match ? (
                            <SyntaxHighlighter style={oneDark} language={match[1]}>
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          ) : (
                            <code className="bg-gray-200 px-1 rounded" {...props}>{children}</code>
                          );
                        },
                      }}
                    >
                      {part.text}
                    </ReactMarkdown>
                  );
                }

                // 工具调用部分
                if (part.type === 'tool-invocation') {
                  const { toolName, state, args } = part.toolInvocation;
                  if (state === 'call') {
                    return (
                      <div key={i} className="bg-yellow-50 border-l-4 border-yellow-400 p-2 my-2 text-sm text-gray-700">
                        <span className="animate-pulse">⏳</span> 正在使用 <strong>{toolName}</strong>...
                        <code className="ml-1 text-xs">{JSON.stringify(args)}</code>
                      </div>
                    );
                  }
                  if (state === 'result') {
                    return (
                      <div key={i} className="bg-green-50 border-l-4 border-green-400 p-2 my-2 text-sm text-gray-700">
                        ✅ <strong>{toolName}</strong> 完成
                      </div>
                    );
                  }
                }

                return null;
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 输入区域 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem('msg') as HTMLInputElement;
          if (input.value.trim() && status === 'ready') {
            sendMessage({ text: input.value });
            input.value = '';
          }
        }}
        className="p-4 border-t flex gap-2"
      >
        <input
          name="msg"
          placeholder="输入你的问题..."
          className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={status !== 'ready'}
        />
        {status === 'streaming' ? (
          <button type="button" onClick={stop}
            className="px-4 py-3 bg-red-500 text-white rounded-lg">⏹ 停止</button>
        ) : (
          <button type="submit" disabled={status !== 'ready'}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg disabled:opacity-50">发送</button>
        )}
      </form>
    </div>
  );
}
```

### 第六步：运行和测试

```bash
# 启动开发服务器
npm run dev

# 访问 http://localhost:3000
# 测试场景：
# 1. "帮我搜索 debounce 函数的实现"       → 触发 codeSearch 工具
# 2. "执行 1+2+3 的结果是多少"            → 触发 codeExecutor 工具
# 3. "Vue 3 的 Composition API 怎么用？" → 触发 docLookup 工具
# 4. 切换模型，观察不同模型的回答差异
```

---

## ⚡ 进阶技巧

### 技巧一：Prompt Caching

```typescript
// Anthropic 的 Prompt Caching 可以大幅降低成本
const result = streamText({
  model: anthropic('claude-sonnet-4-5-20241022'),
  system: [
    { type: 'text', text: LONG_SYSTEM_PROMPT, cacheControl: { type: 'ephemeral' } },
  ],
  messages,
});
// 系统提示会被缓存，后续请求只计算增量部分
```

### 技巧二：使用 providerOptions 传递 Provider 特有参数

```typescript
const result = streamText({
  model: anthropic('claude-sonnet-4-5-20241022'),
  messages,
  providerOptions: {
    anthropic: {
      cacheControl: true,
    },
  },
});
```

## 🧠 知识检查点

<details>
<summary>1️⃣ 在全栈 AI 应用中，前端和后端如何协作实现流式输出？</summary>

> A: 后端使用 `streamText` 创建流，通过 `result.toDataStreamResponse()` 返回符合 Data Stream 协议的标准 Response。前端使用 `useChat` hook 并指定 `api: '/api/chat'`，它会自动解析 Data Stream 协议，将流式文本和工具调用事件映射到 `messages` 数组中的 `parts` 字段，开发者只需渲染 `messages` 即可获得实时更新的聊天界面。

</details>

<details>
<summary>2️⃣ 如何在前端实现模型切换并且不影响当前对话上下文？</summary>

> A: 通过 `useChat` 的 `body` 参数动态传递模型名称（如 `body: () => ({ model })`），后端根据 `model` 字段选择对应的 Provider。模型切换只影响后续消息的生成，之前的消息保留在 `messages` 数组中，从而实现「切换模型但对话历史不丢失」的效果。注意需要将模型选择器的状态提升到组件顶层。

</details>

<details>
<summary>3️⃣ 生产级 AI 应用还需要考虑哪些非功能性需求？</summary>

> A: ① **速率限制** — 使用内存 Map 或 Redis 实现基于 IP 或用户 ID 的请求限流；② **错误处理** — 模型调用失败时的降级策略、友好的错误提示 UI；③ **成本控制** — 限制单次对话的最大 Token 数、设置 `maxSteps` 上限；④ **安全性** — 工具执行参数校验、避免 SQL 注入和代码注入、API Key 管理；⑤ **性能** — React 列表虚拟化、`React.memo` 优化渲染、长对话历史自动截断。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| ⚠️ useChat 流式更新不生效 | 后端返回的不是标准的 Data Stream Response，或 API endpoint 路径配置错误 | 确保后端使用 `result.toDataStreamResponse()` 返回，前端 `useChat` 的 `api` 参数正确指向 `/api/chat` |
| ⚠️ React Markdown 代码高亮不显示 | `react-syntax-highlighter` 的样式未正确导入或组件配置错误 | 确认安装 `react-syntax-highlighter` 和 `@types/react-syntax-highlighter`，导入 `Prism` 和对应主题样式 |
| ⚠️ 工具调用时 UI 无响应 | 前端没有检查 `message.parts` 中的 `tool-invocation` 类型，或 `state` 判断逻辑缺失 | 在渲染消息时遍历 `message.parts`，为 `part.type === 'tool-invocation'` 分别处理 `'call'`、`'result'`、`'error'` 状态 |
| ⚠️ 生产环境 AI API Key 泄露 | 前端代码中直接引用了 `process.env.ANTHROPIC_API_KEY`，或 API Key 被提交到 Git | 所有 API Key 仅在服务端使用（API Route 中），通过 `.env.local` 管理，添加 `.env.local` 到 `.gitignore`，前端只传递模型名称而非 Key |

---

## 📝 本章小结

- ✅ **完整全栈应用** — Next.js + AI SDK + Tailwind
- ✅ **多模型切换** — 运行时选择不同模型
- ✅ **工具集成** — 代码搜索、文档查询、代码执行
- ✅ **Markdown 渲染** — 代码高亮、格式化显示
- ✅ **速率限制** — 后端防护

## ➡️ 下一步

恭喜你完成了 Vercel AI SDK 的全部学习！接下来可以：
- 📘 [3.4 MCP 协议](../3.4-mcp-model-context-protocol/README.md) — 模型上下文协议
- 📗 [3.5 CrewAI 与多 Agent](../3.5-crewai-and-multi-agent/README.md) — 多 Agent 框架
- 📙 [4.1 AI 驱动的前端](../../stage-4/4.1-ai-powered-frontend/README.md) — 前端 AI 深度集成
