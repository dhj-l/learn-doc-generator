# Vercel AI SDK 速查表

## 🚀 安装

```bash
npm install ai                         # 核心 SDK
npm install @ai-sdk/anthropic          # Claude
npm install @ai-sdk/openai             # GPT
npm install @ai-sdk/google             # Gemini
npm install @ai-sdk/mistral            # Mistral
npm install zod                        # 结构化输出
```

## 📦 核心函数

| 函数 | 用途 | 返回值 |
|------|------|--------|
| `generateText()` | 一次性文本生成 | `{ text, usage, toolCalls }` |
| `streamText()` | 流式文本生成 | `{ textStream, fullStream, text }` |
| `generateObject()` | 结构化 JSON 生成 | `{ object }` |
| `streamObject()` | 流式结构化生成 | `{ partialObjectStream, object }` |

## 🔧 核心用法

```typescript
import { generateText, streamText, generateObject, streamObject, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// 一次性生成
const { text } = await generateText({
  model: anthropic('claude-sonnet-4-5-20241022'),
  system: '系统提示',
  prompt: '用户问题',
});

// 流式生成
const result = streamText({ model, messages });
for await (const chunk of result.textStream) { /* 逐字 */ }
// 或等待完整结果
const finalText = await result.text;

// 结构化输出
const { object } = await generateObject({
  model,
  schema: z.object({ name: z.string(), score: z.number() }),
  prompt: '...',
});
// object 自动有 TypeScript 类型

// 工具调用
const { text } = await generateText({
  model,
  prompt: '...',
  tools: {
    myTool: tool({
      description: '工具描述',
      parameters: z.object({ param: z.string() }),
      execute: async ({ param }) => ({ result: '...' }),
    }),
  },
  maxSteps: 5,  // 多步工具调用
});
```

## 🔌 前端 Hooks

| Hook | 包 | 用途 |
|------|-----|------|
| `useChat()` | `@ai-sdk/react` | 对话式交互 |
| `useCompletion()` | `@ai-sdk/react` | 文本补全 |

```tsx
import { useChat } from '@ai-sdk/react';

const { messages, sendMessage, status, stop } = useChat();

// 发送消息
sendMessage({ text: '用户输入' });

// 消息渲染
messages.map(m => m.parts.map((part, i) => {
  if (part.type === 'text') return <span>{part.text}</span>;
  if (part.type === 'tool-invocation') return <ToolCallUI tool={part.toolInvocation} />;
}));
```

## 🔌 Provider 切换

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

// 同一函数，不同模型
await generateText({ model: anthropic('claude-sonnet-4-5-20241022'), prompt });
await generateText({ model: openai('gpt-4o'), prompt });
await generateText({ model: google('gemini-2.0-flash'), prompt });

// 第三方 OpenAI 兼容 API
const deepseek = openai('deepseek-chat', {
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY,
});
```

## 🌐 后端 API Route（Next.js）

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({ model, messages });
  return result.toDataStreamResponse();  // ← useChat 专用
}
```

## 📐 关键配置

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `maxTokens` | 最大输出 Token 数 | 模型默认 |
| `temperature` | 输出随机性 (0-1) | 模型默认 |
| `maxSteps` | 工具调用最大轮数 | 1 |
| `abortSignal` | 取消信号 | 无 |
| `system` | 系统提示 | 无 |
