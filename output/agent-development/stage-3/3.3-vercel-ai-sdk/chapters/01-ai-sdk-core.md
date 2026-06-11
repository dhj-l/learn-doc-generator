# 第1章：AI SDK Core — 统一的 LLM 调用接口

> 预计学习时间：80-100 分钟

## 💡 核心概念

### Vercel AI SDK 是什么？

**生活类比：** 如果你需要在前端应用中集成 AI 功能，Vercel AI SDK 就是你的「万能充电器」——不管是什么品牌的手机（模型），一个充电器（SDK）就够了。

### 安装

```bash
npm install ai @ai-sdk/anthropic @ai-sdk/openai
```

### 核心函数

```typescript
// src/01-core.ts
import { generateText, streamText, generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// 1. generateText — 一次性生成
const { text, usage } = await generateText({
  model: anthropic('claude-sonnet-4-5-20241022'),
  prompt: '用一句话解释 TypeScript',
});
console.log(text);

// 2. streamText — 流式生成
const { textStream } = await streamText({
  model: openai('gpt-4o'),
  messages: [
    { role: 'system', content: '你是一个编程助手' },
    { role: 'user', content: '解释闭包' },
  ],
});

for await (const chunk of textStream) {
  process.stdout.write(chunk);
}

// 3. generateObject — 结构化输出
const { object } = await generateObject({
  model: anthropic('claude-sonnet-4-5-20241022'),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    tags: z.array(z.string()),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  }),
  prompt: '分析以下技术主题并输出结构化信息：React Server Components',
});
console.log(object);
// { title: "React Server Components", summary: "...", tags: [...], difficulty: "intermediate" }
```

### 多模型切换

```typescript
// 同一套 API，切换不同模型
const models = {
  claude: anthropic('claude-sonnet-4-5-20241022'),
  gpt4: openai('gpt-4o'),
  gemini: google('gemini-2.0-flash'),
};

// 动态选择模型
async function chat(modelName: keyof typeof models, prompt: string) {
  return generateText({ model: models[modelName], prompt });
}
```

---

## 📝 本章小结

- ✅ **generateText** — 一次性生成
- ✅ **streamText** — 流式生成
- ✅ **generateObject** — 结构化输出（Zod Schema）
- ✅ **多模型** — 同一接口切换 Anthropic/OpenAI/Google

## ➡️ 下一章预告

> [第2章：AI SDK UI](./02-ai-sdk-ui.md) — 前端 Hooks 集成。
