# 第3-6章概要

## 第3章：多模型支持

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

// 统一接口，切换模型只需改 provider
const model = anthropic('claude-sonnet-4-5-20241022');
// 或 openai('gpt-4o')
// 或 google('gemini-2.0-flash')
```

## 第4章：Streaming 实现

```typescript
const { textStream } = await streamText({ model, messages });
for await (const chunk of textStream) { ... }

// 流式对象
const { partialObjectStream } = await streamObject({ model, schema, prompt });
for await (const partial of partialObjectStream) { ... }
```

## 第5章：工具调用集成

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const result = await generateText({
  model,
  tools: {
    weather: tool({
      description: '获取天气',
      parameters: z.object({ city: z.string() }),
      execute: async ({ city }) => `${city}: 25°C`,
    }),
  },
  maxSteps: 5, // 允许多步工具调用
});
```

## 第6章：综合实战

构建一个 Next.js + Vercel AI SDK 的全栈聊天应用，包含：
- 前端 useChat Hook
- 后端 streamText API Route
- 多模型切换
- 工具调用
