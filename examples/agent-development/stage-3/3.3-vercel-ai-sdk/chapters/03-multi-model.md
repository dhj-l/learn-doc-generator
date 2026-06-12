# 第3章：多模型支持 — 一套代码，切换所有模型

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **配置多个模型提供商** — Anthropic、OpenAI、Google、Mistral 等
- **实现运行时模型切换** — 用户在 UI 中选择不同模型
- **构建模型降级策略** — 主模型失败自动切换备用模型
- **对比模型性能** — 延迟、成本、质量的横向对比

## 📋 前置知识

> 建议先完成：[第1章：AI SDK Core](./01-ai-sdk-core.md)

---

## 💡 核心概念

### 概念一：Provider 统一接口

**生活类比：** 你不需要为每家餐厅学一套点餐系统。AI SDK 的 Provider 就像外卖平台——不管是麦当劳还是海底捞，都在同一个界面操作。

```typescript
// 所有 Provider 使用完全相同的调用方式
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

// 这三个模型的调用方式完全一样！
const claude = anthropic('claude-sonnet-4-5-20241022');
const gpt4o = openai('gpt-4o');
const gemini = google('gemini-2.0-flash');

// 同一个函数，传入不同模型
await generateText({ model: claude, prompt: '...' });
await generateText({ model: gpt4o, prompt: '...' });
await generateText({ model: gemini, prompt: '...' });
```

### 概念二：安装和配置 Provider

```bash
# 按需安装 Provider
npm install @ai-sdk/anthropic    # Claude 系列
npm install @ai-sdk/openai       # GPT 系列 + OpenAI 兼容 API
npm install @ai-sdk/google       # Gemini 系列
npm install @ai-sdk/mistral      # Mistral 系列
npm install @ai-sdk/amazon-bedrock  # AWS Bedrock（可访问 Claude/GPT 等）
```

```typescript
// src/providers.ts — 集中管理 Provider 配置
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

export const providers = {
  // Anthropic Claude 系列
  'claude-sonnet': anthropic('claude-sonnet-4-5-20241022'),
  'claude-haiku': anthropic('claude-haiku-4-5-20251001'),

  // OpenAI GPT 系列
  'gpt-4o': openai('gpt-4o'),
  'gpt-4o-mini': openai('gpt-4o-mini'),

  // Google Gemini 系列
  'gemini-flash': google('gemini-2.0-flash'),
  'gemini-pro': google('gemini-2.5-pro-preview-05-06'),

  // 使用 OpenAI 兼容 API 的第三方模型
  'deepseek': openai('deepseek-chat', {
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY,
  }),
} as const;

export type ModelKey = keyof typeof providers;

// 模型元信息
export const modelInfo: Record<ModelKey, {
  name: string;
  provider: string;
  costPerMillion: { input: number; output: number };
  maxTokens: number;
  strengths: string[];
}> = {
  'claude-sonnet': {
    name: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    costPerMillion: { input: 3, output: 15 },
    maxTokens: 8192,
    strengths: ['代码生成', '复杂推理', '长文本'],
  },
  'claude-haiku': {
    name: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    costPerMillion: { input: 0.8, output: 4 },
    maxTokens: 8192,
    strengths: ['快速响应', '简单任务', '低成本'],
  },
  'gpt-4o': {
    name: 'GPT-4o',
    provider: 'OpenAI',
    costPerMillion: { input: 2.5, output: 10 },
    maxTokens: 16384,
    strengths: ['多模态', '通用能力', '函数调用'],
  },
  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    costPerMillion: { input: 0.15, output: 0.6 },
    maxTokens: 16384,
    strengths: ['极低成本', '快速', '简单任务'],
  },
  'gemini-flash': {
    name: 'Gemini 2.0 Flash',
    provider: 'Google',
    costPerMillion: { input: 0.1, output: 0.4 },
    maxTokens: 8192,
    strengths: ['极快', '大上下文窗口', '低成本'],
  },
  'gemini-pro': {
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    costPerMillion: { input: 1.25, output: 10 },
    maxTokens: 65536,
    strengths: ['推理能力', '代码', '大输出'],
  },
  'deepseek': {
    name: 'DeepSeek Chat',
    provider: 'DeepSeek',
    costPerMillion: { input: 0.14, output: 0.28 },
    maxTokens: 8192,
    strengths: ['极低成本', '中文优秀', '代码'],
  },
};
```

### 概念三：运行时模型切换

在前端让用户选择模型，后端动态切换：

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { providers, type ModelKey } from '@/lib/providers';

export async function POST(req: Request) {
  const { messages, model = 'claude-sonnet' } = await req.json();

  const selectedModel = providers[model as ModelKey];
  if (!selectedModel) {
    return new Response('Invalid model', { status: 400 });
  }

  const result = streamText({
    model: selectedModel,
    system: '你是一个编程助手。',
    messages,
  });

  return result.toDataStreamResponse();
}
```

```tsx
// app/page.tsx — 前端模型选择器
'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

const MODEL_OPTIONS = [
  { value: 'claude-sonnet', label: 'Claude Sonnet 4.5', icon: '🟣' },
  { value: 'gpt-4o', label: 'GPT-4o', icon: '🟢' },
  { value: 'gemini-flash', label: 'Gemini Flash', icon: '🔵' },
  { value: 'deepseek', label: 'DeepSeek', icon: '🟡' },
];

export default function ChatPage() {
  const [selectedModel, setSelectedModel] = useState('claude-sonnet');

  const { messages, sendMessage, status } = useChat({
    // 通过 body 传递模型选择
    // 注意：这里使用受控模式来传递额外参数
  });

  // 自定义发送
  async function handleSend(text: string) {
    sendMessage({ text }, { body: { model: selectedModel } });
  }

  return (
    <div>
      {/* 模型选择器 */}
      <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
        {MODEL_OPTIONS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.icon} {m.label}
          </option>
        ))}
      </select>

      {/* 聊天界面... */}
    </div>
  );
}
```

### 概念四：模型降级策略

```typescript
// src/resilient.ts — 带降级的模型调用
import { generateText } from 'ai';
import { providers, type ModelKey } from './providers';

const FALLBACK_CHAIN: ModelKey[] = [
  'claude-sonnet',   // 首选：高质量
  'gpt-4o',          // 备选 1
  'gemini-flash',    // 备选 2：便宜快速
  'gpt-4o-mini',     // 兜底：最便宜
];

export async function resilientGenerate(prompt: string) {
  for (const modelKey of FALLBACK_CHAIN) {
    try {
      const result = await generateText({
        model: providers[modelKey],
        prompt,
        maxTokens: 1000,
      });

      console.log(`✅ 使用 ${modelKey} 成功`);
      return { ...result, model: modelKey };
    } catch (error) {
      console.warn(`⚠️ ${modelKey} 失败: ${error.message}，尝试下一个模型...`);
    }
  }

  throw new Error('所有模型都失败了');
}
```

### 概念五：任务路由 — 不同任务用不同模型

```typescript
// src/task-router.ts — 根据任务类型选择最佳模型
import { generateText, streamText } from 'ai';
import { providers } from './providers';

type TaskType = 'simple' | 'complex' | 'code' | 'creative';

const TASK_MODEL_MAP: Record<TaskType, keyof typeof providers> = {
  simple: 'gpt-4o-mini',      // 简单问题 → 便宜模型
  complex: 'claude-sonnet',    // 复杂推理 → 高质量模型
  code: 'claude-sonnet',       // 代码生成 → Claude 代码能力强
  creative: 'gpt-4o',          // 创意写作 → GPT-4o 创意好
};

// 用小模型先判断任务类型
async function classifyTask(input: string): Promise<TaskType> {
  const { text } = await generateText({
    model: providers['gpt-4o-mini'],  // 用便宜模型分类
    prompt: `将以下任务分类为：simple（简单查询）、complex（复杂分析）、code（代码相关）、creative（创意写作）。
只回复类别名称。

任务：${input}`,
  });

  const category = text.trim().toLowerCase() as TaskType;
  return ['simple', 'complex', 'code', 'creative'].includes(category) ? category : 'simple';
}

export async function smartChat(userInput: string) {
  const taskType = await classifyTask(userInput);
  const modelKey = TASK_MODEL_MAP[taskType];

  console.log(`📋 任务类型: ${taskType} → 模型: ${modelKey}`);

  return streamText({
    model: providers[modelKey],
    prompt: userInput,
  });
}
```

---

## 🔨 实战演练

### 练习：构建一个模型对比面板

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/model-compare.ts
import { generateText } from 'ai';
import { providers, modelInfo, type ModelKey } from './providers';

interface CompareResult {
  model: ModelKey;
  name: string;
  answer: string;
  latency: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export async function compareModels(prompt: string, models: ModelKey[]): Promise<CompareResult[]> {
  const results = await Promise.allSettled(
    models.map(async (modelKey): Promise<CompareResult> => {
      const start = Date.now();
      const { text, usage } = await generateText({
        model: providers[modelKey],
        prompt,
        maxTokens: 500,
      });
      const latency = Date.now() - start;
      const info = modelInfo[modelKey];
      const cost = (usage.promptTokens * info.costPerMillion.input
        + usage.completionTokens * info.costPerMillion.output) / 1_000_000;

      return {
        model: modelKey,
        name: info.name,
        answer: text,
        latency,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        cost,
      };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<CompareResult> => r.status === 'fulfilled')
    .map(r => r.value)
    .sort((a, b) => a.cost - b.cost);
}

// 使用
const results = await compareModels(
  '用 3 句话解释微服务架构',
  ['claude-sonnet', 'gpt-4o', 'gemini-flash', 'deepseek']
);

console.log('\n| 模型 | 延迟 | Token | 成本 |');
console.log('|------|------|-------|------|');
for (const r of results) {
  console.log(`| ${r.name.padEnd(18)} | ${r.latency}ms | ${r.outputTokens} | $${r.cost.toFixed(5)} |`);
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：构建智能模型路由器

当你的应用需要同时服务多种场景时，**模型路由器**模式可以根据请求特征自动选择最优模型：

```typescript
// src/smart-router.ts
import { generateText } from 'ai';
import { providers, type ModelKey } from './providers';

interface RouteRule {
  match: (input: string) => boolean;
  model: ModelKey;
  description: string;
}

const routes: RouteRule[] = [
  { match: (s) => s.length < 50, model: 'gpt-4o-mini', description: '短查询用最便宜的模型' },
  { match: (s) => /^[0-9+\-*/.()\s]+$/.test(s), model: 'gpt-4o-mini', description: '计算类用低成本模型' },
  { match: (s) => /代码|实现|bug|错误/i.test(s), model: 'claude-sonnet', description: '代码相关用 Claude' },
  { match: (s) => /创作|写|故事|文案/i.test(s), model: 'gpt-4o', description: '创意写作用 GPT-4o' },
];

export function routeToModel(input: string): ModelKey {
  for (const route of routes) {
    if (route.match(input)) {
      console.log(`📋 路由: "${input.slice(0, 30)}..." → ${route.model} (${route.description})`);
      return route.model;
    }
  }
  return 'claude-sonnet'; // 默认
}
```

### 技巧二：设置 Provider 自定义参数

不同 Provider 有自己特有的参数，通过 `providerOptions` 传递：

```typescript
const result = await generateText({
  model: providers['claude-sonnet'],
  prompt: '解释量子计算',
  providerOptions: {
    anthropic: {
      cacheControl: { type: 'ephemeral' },
      thinking: { type: 'enabled', budgetTokens: 8000 },
    },
  },
});
```

### 技巧三：Provider 降级熔断

使用**熔断器模式**防止持续调用失败的 Provider：

```typescript
// src/circuit-breaker.ts
import { providers, type ModelKey } from './providers';

class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private readonly threshold = 3;
  private readonly resetTimeout = 30000;

  isOpen(): boolean {
    if (this.failures >= this.threshold) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed > this.resetTimeout) {
        this.failures = 0;
        return false;
      }
      return true;
    }
    return false;
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
  }

  async call(modelKey: ModelKey, prompt: string) {
    if (this.isOpen()) {
      throw new Error(`🔒 ${modelKey} 已熔断，跳过`);
    }
    try {
      const { generateText } = await import('ai');
      const result = await generateText({ model: providers[modelKey], prompt });
      this.failures = 0;
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
}
```

## 🧠 知识检查点

<details>
<summary>1️⃣ 如何在代码中实现运行时模型切换？</summary>

> A: 前端通过 `useChat` 的 `body` 参数传递模型名称，后端从请求体中读取模型键，通过 Provider 对象（如 `providers[modelKey]`）动态选择对应的模型实例传入 `streamText` 或 `generateText`。

</details>

<details>
<summary>2️⃣ 什么是模型降级策略？为什么要使用它？</summary>

> A: 模型降级策略指的是当主模型调用失败时，自动切换到备用模型继续处理。核心原因包括：① 提高可用性 —— 单个模型故障不影响整体服务；② 控制成本 —— 主模型不可用时切换到更便宜的模型；③ 提升用户体验 —— 避免用户得到「服务不可用」的错误提示。

</details>

<details>
<summary>3️⃣ 如何接入不是官方支持的模型（如 DeepSeek、本地 LLM）？</summary>

> A: 使用 OpenAI 兼容 API 的方式接入。通过 `openai('model-name', { baseURL: 'https://...', apiKey: '...' })` 创建 Provider，只要目标模型提供了 OpenAI 兼容的 API 接口，就可以像调用 GPT 一样调用它们。对于不支持 OpenAI 兼容 API 的模型，可以自定义实现 `LanguageModel` 接口。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| ⚠️ Provider 未安装或导入错误 | 只安装了 `ai` 核心包，未安装对应的 Provider 包（如 `@ai-sdk/anthropic`） | 运行 `npm install @ai-sdk/anthropic` 并按需安装对应模型提供商包 |
| ⚠️ 模型 Key 未配置 | 环境变量中未设置 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY` | 在 `.env.local` 中配置正确的 API Key，并确保 `process.env` 能读取到 |
| ⚠️ 降级链死循环 | 降级逻辑中所有模型都使用同一 API Key，同时触发限流 | 降级到不同类型 Provider（如从 Anthropic 降级到 OpenAI），避免共用同一 API 配额 |
| ⚠️ 前端模型名和后端不匹配 | 前端传递的模型字符串（如 `"gpt4"`）在后端 Provider 映射中不存在 | 前后端使用同一类型定义（如 `type ModelKey`），前端选择器的 value 和后端 key 严格一致 |

---

## 📝 本章小结

- ✅ **Provider 统一接口** — 同一函数切换不同模型
- ✅ **运行时切换** — 用户在 UI 中选择模型
- ✅ **降级策略** — 主模型失败自动切换备用模型
- ✅ **任务路由** — 根据任务类型选择最佳性价比模型
- ✅ **第三方模型** — 通过 OpenAI 兼容 API 接入 DeepSeek 等

## ➡️ 下一章预告

> [第4章：Streaming 实现](./04-streaming.md) — 深入理解流式输出的工作原理和高级用法。
