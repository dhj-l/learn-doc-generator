# 第1章：AI SDK Core — 统一的 LLM 调用接口

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 Vercel AI SDK 的三大核心函数** — generateText、streamText、generateObject
- **理解 AI SDK 的统一模型接口** — 一套代码切换 Anthropic/OpenAI/Google
- **实现流式输出和结构化输出** — 实时生成和 JSON 验证

## 📋 前置知识

> 建议先完成：[1.2 Claude API](../../stage-1/1.2-claude-api/README.md) 和 [1.3 OpenAI API](../../stage-1/1.3-openai-api/README.md)

---

## 💡 核心概念

### 概念一：Vercel AI SDK 解决什么问题？

**生活类比：** 你去不同的咖啡店（Claude、GPT、Gemini），每家的点单方式都不同。Vercel AI SDK 就是一个「统一的点单 App」——不管去哪家店，都是同一个界面、同一种操作方式。

```
没有 AI SDK：
  Claude  → @anthropic-ai/sdk → client.messages.create({ model, max_tokens, messages })
  GPT     → openai            → client.chat.completions.create({ model, max_tokens, messages })
  Gemini  → @google/genai     → model.generateContent({ contents })
  每个 SDK 的 API 签名和响应格式都不同

有了 AI SDK：
  所有模型 → generateText({ model, prompt })  ← 同一个函数
  所有模型 → streamText({ model, messages })   ← 同一个函数
  所有模型 → generateObject({ model, schema }) ← 同一个函数
```

### 概念二：安装和配置

```bash
# 核心 SDK
npm install ai

# 模型提供者（按需安装）
npm install @ai-sdk/anthropic   # Claude
npm install @ai-sdk/openai      # GPT
npm install @ai-sdk/google      # Gemini

# 可选：Zod 用于结构化输出
npm install zod
```

```typescript
// 环境变量
// ANTHROPIC_API_KEY=sk-ant-...
// OPENAI_API_KEY=sk-...
// GOOGLE_API_KEY=...
```

### 概念三：generateText — 一次性生成

最基础的调用方式，等待模型生成完整回答后返回。

```typescript
// src/01-generate-text.ts
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const { text, usage, finishReason } = await generateText({
  model: anthropic('claude-sonnet-4-5-20241022'),
  system: '你是一个编程助手，回答简洁明了。',
  prompt: '用一句话解释什么是 TypeScript',
});

console.log('回答:', text);
console.log('Token 使用:', usage);
console.log('完成原因:', finishReason);
// finishReason: 'stop'（正常结束）| 'length'（达到 maxTokens）| 'tool-calls'（工具调用）
```

#### 多轮对话

```typescript
// src/02-conversation.ts
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const model = anthropic('claude-sonnet-4-5-20241022');

// 第一轮
const { text: reply1 } = await generateText({
  model,
  system: '你是一个编程导师。',
  messages: [{ role: 'user', content: '什么是闭包？' }],
});

// 第二轮（包含历史）
const { text: reply2 } = await generateText({
  model,
  system: '你是一个编程导师。',
  messages: [
    { role: 'user', content: '什么是闭包？' },
    { role: 'assistant', content: reply1 },
    { role: 'user', content: '给我一个实际例子' },
  ],
});

console.log('第一轮:', reply1);
console.log('第二轮:', reply2);
```

### 概念四：streamText — 流式生成

逐 Token 返回结果，适合实时交互场景。

```typescript
// src/03-stream-text.ts
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

// 方式 1：完整流式调用
const result = streamText({
  model: anthropic('claude-sonnet-4-5-20241022'),
  prompt: '写一首关于编程的诗',
});

// 方式 A：使用 textStream（推荐）
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

// 方式 B：使用 fullStream（包含元数据）
for await (const event of result.fullStream) {
  switch (event.type) {
    case 'text-delta':
      process.stdout.write(event.textDelta);
      break;
    case 'tool-call':
      console.log(`\n🔧 工具调用: ${event.toolName}(${JSON.stringify(event.args)})`);
      break;
    case 'tool-result':
      console.log(`📋 工具结果: ${event.result}`);
      break;
    case 'finish':
      console.log(`\n✅ 完成: ${event.finishReason}`);
      break;
  }
}

// 等待完成并获取最终数据
const finalText = await result.text;
const usage = await result.usage;
console.log('\n\n最终文本:', finalText);
console.log('Token:', usage);
```

```
预期输出（逐字出现）：
在代码的世界里
有一只程序员的猫
它用键盘当枕头
用 Bug 做噩梦的佐料

✅ 完成: stop

最终文本: 在代码的世界里...
Token: { promptTokens: 15, completionTokens: 85 }
```

#### 流式输出的性能优势

```
非流式：用户等待 5 秒 → 突然看到全部文字
流式：  用户等待 0.3 秒 → 开始逐字看到文字 → 边看边读

感知等待时间从 5 秒降到 0.3 秒，即使实际生成时间相同！
```

### 概念五：generateObject — 结构化输出

让模型输出符合 Schema 的 JSON 数据，带自动验证。

```typescript
// src/04-generate-object.ts
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// 定义输出 Schema
const codeReviewSchema = z.object({
  summary: z.string().describe('一句话总结代码质量'),
  score: z.number().min(1).max(10).describe('代码质量评分'),
  issues: z.array(z.object({
    severity: z.enum(['high', 'medium', 'low']),
    title: z.string(),
    description: z.string(),
    fix: z.string().describe('修复建议'),
  })).describe('发现的问题列表'),
  highlights: z.array(z.string()).describe('代码亮点'),
});

// 调用
const { object } = await generateObject({
  model: anthropic('claude-sonnet-4-5-20241022'),
  schema: codeReviewSchema,
  prompt: `审查以下代码：
\`\`\`typescript
function fetchUser(id) {
  const res = fetch('/api/users/' + id);
  return res.json();
}
\`\`\``,
});

// object 自动被解析为 TypeScript 类型
console.log('评分:', object.score, '/10');
console.log('问题数:', object.issues.length);
object.issues.forEach(issue => {
  const icon = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
  console.log(`${icon} ${issue.title}: ${issue.description}`);
});
```

```
预期输出：
评分: 3 /10
问题数: 3
🔴 缺少 async/await: fetch 返回 Promise，需要 await
🔴 缺少错误处理: 网络请求可能失败，需要 try-catch
🟡 缺少类型注解: 参数和返回值没有 TypeScript 类型
```

### 概念六：streamObject — 流式结构化输出

在生成结构化数据时也能流式输出：

```typescript
// src/05-stream-object.ts
import { streamObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod');

const schema = z.object({
  recipe: z.object({
    name: z.string(),
    ingredients: z.array(z.object({
      name: z.string(),
      amount: z.string(),
    })),
    steps: z.array(z.string()),
  }),
});

const { partialObjectStream } = await streamObject({
  model: anthropic('claude-sonnet-4-5-20241022'),
  schema,
  prompt: '推荐一道简单的家常菜',
});

// 逐步接收结构化数据
for await (const partial of partialObjectStream) {
  console.clear();
  console.log(JSON.stringify(partial, null, 2));
  // 随着生成进度，对象会逐步填充字段
}
```

### 概念七：多模型切换

```typescript
// src/06-multi-model.ts
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

// 模型注册表
const models = {
  claude: anthropic('claude-sonnet-4-5-20241022'),
  gpt4o: openai('gpt-4o'),
  gemini: google('gemini-2.0-flash'),
  haiku: anthropic('claude-haiku-4-5-20251001'),
  gpt4mini: openai('gpt-4o-mini'),
};

type ModelKey = keyof typeof models;

// 统一的聊天函数
async function chat(modelKey: ModelKey, prompt: string) {
  const start = Date.now();
  const { text, usage } = await generateText({
    model: models[modelKey],
    prompt,
  });
  const elapsed = Date.now() - start;

  return {
    model: modelKey,
    text,
    tokens: usage.completionTokens,
    latency: elapsed,
  };
}

// 对比测试
async function compare(question: string) {
  const results = await Promise.all([
    chat('claude', question),
    chat('gpt4o', question),
    chat('gemini', question),
  ]);

  console.log(`❓ ${question}\n`);
  for (const r of results) {
    console.log(`🤖 ${r.model} (${r.latency}ms, ${r.tokens} tokens):`);
    console.log(`   ${r.text.slice(0, 100)}...\n`);
  }
}

await compare('什么是微服务架构？');
```

### 概念八：工具调用

```typescript
// src/07-tool-use.ts
import { generateText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const { text, toolCalls, toolResults } = await generateText({
  model: anthropic('claude-sonnet-4-5-20241022'),
  prompt: '北京今天多少度？',
  tools: {
    getWeather: tool({
      description: '获取指定城市的天气信息',
      parameters: z.object({
        city: z.string().describe('城市名称'),
      }),
      execute: async ({ city }) => {
        // 实际项目中调用天气 API
        return { city, temperature: 25, condition: '晴' };
      },
    }),
  },
  maxSteps: 5,  // 允许多步工具调用
});

console.log('回答:', text);
console.log('工具调用:', toolCalls);
console.log('工具结果:', toolResults);
```

---

## 🔨 实战演练

### 练习：构建一个多模型对比工具

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/model-benchmark.ts
import { generateText, streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

interface BenchmarkResult {
  model: string;
  answer: string;
  latency: number;
  inputTokens: number;
  outputTokens: number;
  cost: number; // 估算成本
}

const COST_PER_MILLION = {
  'claude-sonnet': { input: 3, output: 15 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'claude-haiku': { input: 0.25, output: 1.25 },
};

async function benchmark(prompt: string): Promise<BenchmarkResult[]> {
  const testCases = [
    { key: 'claude-sonnet', model: anthropic('claude-sonnet-4-5-20241022') },
    { key: 'gpt-4o', model: openai('gpt-4o') },
    { key: 'gpt-4o-mini', model: openai('gpt-4o-mini') },
    { key: 'claude-haiku', model: anthropic('claude-haiku-4-5-20251001') },
  ];

  const results = await Promise.all(
    testCases.map(async ({ key, model }) => {
      const start = Date.now();
      const { text, usage } = await generateText({
        model,
        prompt,
        maxTokens: 500,
      });
      const latency = Date.now() - start;

      const costs = COST_PER_MILLION[key as keyof typeof COST_PER_MILLION];
      const cost = (usage.promptTokens * costs.input + usage.completionTokens * costs.output) / 1_000_000;

      return {
        model: key,
        answer: text,
        latency,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        cost,
      };
    })
  );

  // 输出对比表
  console.log(`\n❓ 测试: "${prompt.slice(0, 50)}..."\n`);
  console.log('| 模型 | 延迟 | 输出Token | 成本 |');
  console.log('|------|------|-----------|------|');
  for (const r of results) {
    console.log(`| ${r.model.padEnd(16)} | ${r.latency}ms | ${r.outputTokens} | $${r.cost.toFixed(4)} |`);
  }

  return results;
}

// 使用
await benchmark('用一段话解释什么是 TypeScript 泛型');
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：maxSteps 多步工具调用

```typescript
// maxSteps 允许模型在一次调用中执行多轮工具交互
const { text } = await generateText({
  model: anthropic('claude-sonnet-4-5-20241022'),
  prompt: '查询北京天气并换算成华氏度',
  tools: {
    getWeather: weatherTool,
    convertTemperature: temperatureTool,
  },
  maxSteps: 5,  // 模型可以：查天气 → 换算温度 → 回答
});
```

### 技巧二：AbortController 取消流式

```typescript
const abortController = new AbortController();

// 5 秒后取消
setTimeout(() => abortController.abort(), 5000);

const result = streamText({
  model: anthropic('claude-sonnet-4-5-20241022'),
  prompt: '写一篇长文',
  abortSignal: abortController.signal,
});
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：generateText 和 streamText 什么时候用哪个？**

> A：`generateText` 适合后端批处理、不需要实时反馈的场景。`streamText` 适合对话界面、需要即时反馈的场景。对于用户体验来说，`streamText` 几乎总是更好的选择。

**Q2：generateObject 的 Schema 定义用什么？**

> A：使用 Zod Schema。Zod 是 TypeScript 的运行时验证库，可以同时提供类型推断和运行时验证。`generateObject` 会自动将 Zod Schema 转换为 JSON Schema 传给模型，然后验证返回的 JSON 是否符合 Schema。

**Q3：AI SDK 的 maxSteps 参数是什么？**

> A：`maxSteps` 控制工具调用的最大轮数。例如 `maxSteps: 5` 意味着模型最多可以执行 5 轮「推理→工具调用→观察」的循环。这对需要多步工具调用的任务非常有用。

</details>

---

## 📝 本章小结

- ✅ **generateText** — 一次性文本生成
- ✅ **streamText** — 流式文本生成，实时反馈
- ✅ **generateObject** — 结构化 JSON 输出，带 Zod 验证
- ✅ **streamObject** — 流式结构化输出
- ✅ **多模型** — 同一接口切换 Anthropic/OpenAI/Google
- ✅ **工具调用** — 用 `tool()` 定义工具，`maxSteps` 控制轮数

## ➡️ 下一章预告

> [第2章：AI SDK UI](./02-ai-sdk-ui.md) — 在 React/Vue 前端中使用 useChat 和 useCompletion。
