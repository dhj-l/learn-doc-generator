# 第3章：多模型支持 — 灵活切换与统一调用

> 预计学习时间：60–90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解多模型架构** — AI SDK 的统一 Provider 接口设计原理
- **在同一个应用中无缝切换 Claude/GPT/Gemini**
- **实现自定义 Provider 和模型回退（Fallback）逻辑**
- **构建模型对比基准工具** — 评估不同模型的延迟、成本和输出质量

---

## 💡 核心概念

### 概念一：为什么需要多模型支持？

**生活类比：** 你是一家餐厅的老板，需要同时对接美团、饿了么和百度外卖。每个平台的订单格式、API 密钥、配送规则都不同。如果你为每个平台写一套独立的代码，维护成本会爆炸。Vercel AI SDK 的 Provider 抽象就像一个**统一的订单管理后台**——不管哪个平台来的订单，都转化成同一种数据结构。

**技术角度：** 不同的 LLM Provider 有各自的 SDK、认证方式、模型名称和响应格式。AI SDK 通过 `LanguageModel` 接口将它们统一：

```
┌─────────────────────────────────────────┐
│          你的应用代码                     │
│    generateText({ model, prompt })       │
└──────────────┬──────────────────────────┘
               │
     ┌─────────▼─────────┐
     │   AI SDK Core      │  ← 统一接口层
     └─────┬───────┬─────┘
           │       │
     ┌─────▼─┐ ┌──▼────┐
     │anthropic│ │openai │  ← Provider 适配器
     └─────┬─┘ └──┬────┘
           │      │
     ┌─────▼──────▼────┐
     │  LLM API (云端)  │
     └────────────────┘
```

这种设计带来的核心好处：

1. **代码可移植性** — 更换模型只需改一行 `model:` 参数
2. **逻辑复用** — 提示词模板、工具定义、流式处理逻辑完全不变
3. **横向对比** — 同一套输入评测不同模型的输出差异
4. **生产容灾** — 当某个 Provider 宕机时自动切换到备选

### 概念二：Provider 架构详解

每个 Provider 的适配器包（如 `@ai-sdk/anthropic`）本质上是一个**工厂函数**，接收模型名称字符串，返回符合 `LanguageModel` 接口的对象：

```typescript
// Provider 的简化内部实现
import { type LanguageModel } from 'ai';

// 每个 Provider 做三件事：
// 1. 将统一参数转换为 Provider 原生格式
// 2. 调用原始 API
// 3. 将原生响应转换为统一格式

// 安装方式（按需加载，不增加无关依赖）
// npm install @ai-sdk/anthropic   → ~50KB
// npm install @ai-sdk/openai      → ~40KB
// npm install @ai-sdk/google      → ~60KB
// npm install @ai-sdk/mistral     → ~30KB
```

**模型命名规范：** 每个 Provider 使用自己的模型标识符，AI SDK 不做重命名：

| Provider | 包名 | 示例模型 | 环境变量 |
|----------|------|---------|---------|
| Anthropic | `@ai-sdk/anthropic` | `claude-sonnet-4-5-20241022` | `ANTHROPIC_API_KEY` |
| OpenAI | `@ai-sdk/openai` | `gpt-4o`, `gpt-4o-mini` | `OPENAI_API_KEY` |
| Google | `@ai-sdk/google` | `gemini-2.0-flash`, `gemini-2.0-pro` | `GOOGLE_API_KEY` |
| Mistral | `@ai-sdk/mistral` | `mistral-large-latest` | `MISTRAL_API_KEY` |

### 概念三：基础多模型切换

最简单的多模型使用方式——在代码中直接切换：

```typescript
// src/01-model-switching.ts
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

/**
 * 使用指定模型回答问题
 * 只需要修改 model 参数，其余代码完全不变
 */
async function askModel(
  provider: 'claude' | 'gpt' | 'gemini',
  prompt: string
) {
  // 模型选择器——这是唯一需要改的地方
  const modelMap = {
    claude: anthropic('claude-sonnet-4-5-20241022'),
    gpt: openai('gpt-4o'),
    gemini: google('gemini-2.0-flash'),
  };

  const model = modelMap[provider];

  const { text, usage, finishReason } = await generateText({
    model,
    system: '你是一个技术架构师，回答简明且深入。',
    prompt,
    maxTokens: 1000,
  });

  return {
    provider,
    answer: text,
    tokens: usage.totalTokens,
    finishReason,
  };
}

// 使用示例
async function main() {
  const question = '解释一下什么是 JWT Token，以及它的优缺点';

  // 串行调用不同模型
  for (const p of ['claude', 'gpt', 'gemini'] as const) {
    const result = await askModel(p, question);
    console.log(`\n🤖 ${result.provider.toUpperCase()}:`);
    console.log(`   ${result.answer.slice(0, 200)}...`);
    console.log(`   消耗 Token: ${result.tokens}`);
  }
}

main().catch(console.error);
```

### 概念四：动态模型选择（生产级模式）

在实际应用中，模型选择通常是动态的——用户通过 UI 下拉菜单选择，或者后端根据任务类型自动分配：

```typescript
// src/02-dynamic-model-selector.ts
import { generateText, type LanguageModel } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

// =====================================================
// 1. 定义模型注册表（中央配置）
// =====================================================
interface ModelConfig {
  id: string;
  label: string;       // UI 显示名称
  provider: LanguageModel;
  description: string; // 适用场景说明
  costPer1K: number;   // 每千 Token 成本（美元）
}

const MODEL_REGISTRY: Record<string, ModelConfig> = {
  // 🏆 旗舰模型（高质量、高成本）
  'claude-sonnet': {
    id: 'claude-sonnet',
    label: 'Claude Sonnet',
    provider: anthropic('claude-sonnet-4-5-20241022'),
    description: '适合复杂推理、代码生成',
    costPer1K: 0.003,
  },
  'gpt-4o': {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: openai('gpt-4o'),
    description: '适合通用对话、多模态',
    costPer1K: 0.0025,
  },
  'gemini-pro': {
    id: 'gemini-pro',
    label: 'Gemini Pro',
    provider: google('gemini-2.0-flash'),
    description: '适合长文本处理',
    costPer1K: 0.001,
  },

  // 💰 经济模型（低成本、快速）
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: openai('gpt-4o-mini'),
    description: '适合简单问答、分类',
    costPer1K: 0.00015,
  },
  'claude-haiku': {
    id: 'claude-haiku',
    label: 'Claude Haiku',
    provider: anthropic('claude-haiku-4-5-20251001'),
    description: '适合实时聊天、摘要',
    costPer1K: 0.00025,
  },
};

// =====================================================
// 2. 智能路由选择器
// =====================================================
type TaskType = 'coding' | 'chat' | 'analysis' | 'summary' | 'creative';

const TASK_MODEL_MAP: Record<TaskType, string[]> = {
  coding: ['claude-sonnet', 'gpt-4o'],     // 优先 Claude（代码能力强）
  chat: ['gpt-4o-mini', 'claude-haiku'],    // 优先快速模型
  analysis: ['gpt-4o', 'claude-sonnet'],    // 优先高精度
  summary: ['claude-haiku', 'gpt-4o-mini'], // 优先低成本
  creative: ['claude-sonnet', 'gemini-pro'], // 优先创造力
};

function selectModel(taskType: TaskType): ModelConfig {
  const preferredIds = TASK_MODEL_MAP[taskType];
  // 返回首选模型（实际生产环境会考虑可用性、负载等）
  return MODEL_REGISTRY[preferredIds[0]];
}

// =====================================================
// 3. 统一的对话函数
// =====================================================
interface ChatOptions {
  modelId?: string;      // 指定模型
  taskType?: TaskType;   // 或按任务类型自动选择
  system?: string;
  temperature?: number;
}

async function smartChat(
  prompt: string,
  options: ChatOptions = {}
) {
  const { modelId, taskType = 'chat', system, temperature = 0.7 } = options;

  // 确定使用的模型
  let config: ModelConfig;
  if (modelId && MODEL_REGISTRY[modelId]) {
    config = MODEL_REGISTRY[modelId];
  } else {
    config = selectModel(taskType);
  }

  console.log(`🔍 使用模型: ${config.label} (${config.description})`);

  const start = Date.now();
  const { text, usage, finishReason } = await generateText({
    model: config.provider,
    system,
    prompt,
    temperature,
  });
  const latency = Date.now() - start;

  return {
    model: config.label,
    answer: text,
    latency,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    estimatedCost: (usage.totalTokens / 1000) * config.costPer1K,
    finishReason,
  };
}

// =====================================================
// 4. 使用示例
// =====================================================
async function main() {
  // 方式一：按任务类型自动选择
  const codingResult = await smartChat(
    '用 TypeScript 实现一个防抖函数',
    { taskType: 'coding', system: '你是一个资深前端架构师' }
  );
  console.log(`⏱ 延迟: ${codingResult.latency}ms`);
  console.log(`💰 估算成本: $${codingResult.estimatedCost.toFixed(6)}`);

  // 方式二：强制指定模型
  const cheapResult = await smartChat(
    '今天天气怎么样？',
    { modelId: 'gpt-4o-mini', taskType: 'chat' }
  );
  console.log(`💬 回答: ${cheapResult.answer.slice(0, 100)}...`);

  // 方式三：对比多个模型
  console.log('\n=== 模型对比测试 ===');
  const question = '解释 HTTPS 的工作原理，200字以内';
  for (const id of ['claude-haiku', 'gpt-4o-mini', 'claude-sonnet'] as const) {
    const r = await smartChat(question, { modelId: id });
    console.log(`[${r.model}] ${r.latency}ms / $${r.estimatedCost.toFixed(6)}`);
    console.log(`  ${r.answer.slice(0, 120)}...\n`);
  }
}

main().catch(console.error);
```

### 概念五：模型回退（Fallback）策略

生产环境中，单一模型可能因为 API 限流、网络故障、服务宕机而失败。回退策略确保系统的高可用性：

```typescript
// src/03-model-fallback.ts
import { generateText, type LanguageModel } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

/**
 * 带重试和回退的调用函数
 *
 * 策略：
 * 1. 先调用首选模型
 * 2. 如果失败，等待 1 秒后重试（最多 2 次）
 * 3. 如果仍然失败，切换到备用模型
 * 4. 记录完整的错误链路
 */
interface FallbackConfig {
  primary: LanguageModel;
  fallbacks: LanguageModel[];
  maxRetries: number;
  retryDelayMs: number;
}

async function generateTextWithFallback(
  prompt: string,
  config: FallbackConfig,
  system?: string
) {
  const errors: Array<{ model: string; error: string }> = [];

  // 候选模型列表：主模型（可重试）+ 备用模型
  const modelCandidates: Array<{
    model: LanguageModel;
    label: string;
    canRetry: boolean;
  }> = [
    { model: config.primary, label: 'primary', canRetry: true },
    ...config.fallbacks.map((m, i) => ({
      model: m,
      label: `fallback-${i + 1}`,
      canRetry: false,
    })),
  ];

  for (const candidate of modelCandidates) {
    const maxAttempts = candidate.canRetry ? config.maxRetries + 1 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await generateText({
          model: candidate.model,
          system,
          prompt,
        });

        if (errors.length > 0) {
          console.warn(`⚠️ 模型回退发生: ${errors.map(e => e.model).join(' → ')}`);
        }

        return {
          ...result,
          fallbackHistory: errors,
          modelUsed: candidate.label,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push({
          model: `${candidate.label} (attempt ${attempt})`,
          error: msg,
        });
        console.warn(`❌ ${candidate.label} 第 ${attempt} 次失败: ${msg.slice(0, 80)}`);

        // 等待后重试
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, config.retryDelayMs));
        }
      }
    }
  }

  throw new Error(
    `所有模型均失败:\n${errors.map(e => `  - ${e.model}: ${e.error}`).join('\n')}`
  );
}

// 使用示例
async function main() {
  const result = await generateTextWithFallback(
    '写一个快速排序算法',
    {
      primary: anthropic('claude-sonnet-4-5-20241022'),
      fallbacks: [
        openai('gpt-4o'),
        openai('gpt-4o-mini'),
      ],
      maxRetries: 2,
      retryDelayMs: 1000,
    },
    '你是一个算法专家'
  );

  console.log('✅ 成功!');
  console.log(`使用的模型: ${result.modelUsed}`);
  console.log(`回答:\n${result.text.slice(0, 300)}...`);
  console.log(`回退历史:`, result.fallbackHistory);
}

main().catch(console.error);
```

### 概念六：自定义 Provider

如果你的团队使用自研模型或第三方代理服务，可以实现自定义 Provider：

```typescript
// src/04-custom-provider.ts
import { type LanguageModelV1 } from 'ai';

/**
 * 自定义 Provider 实现
 *
 * 场景：公司内部部署了 Llama 3 的代理服务
 * API 格式：POST /v1/chat/completions (兼容 OpenAI 格式)
 */
function createCustomProvider(baseURL: string, apiKey: string) {
  return function (modelId: string): LanguageModelV1 {
    return {
      specificationVersion: 'v1',
      provider: 'custom-llama',
      modelId,

      // 核心：将 AI SDK 的统一参数转为 Provider 原生格式
      async doGenerate(options) {
        const response = await fetch(`${baseURL}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            messages: options.prompt.map(msg => ({
              role: msg.role,
              content: msg.content,
            })),
            max_tokens: options.maxTokens,
            temperature: options.temperature,
            stream: false,
          }),
        });

        const data = await response.json();

        // 必须返回 AI SDK 统一格式
        return {
          text: data.choices[0].message.content,
          finishReason: data.choices[0].finish_reason === 'stop'
            ? 'stop'
            : 'unknown',
          usage: {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
          },
          rawCall: { rawPrompt: options.prompt, rawSettings: {} },
          rawResponse: { headers: response.headers },
        };
      },

      // 流式支持（可选，但推荐实现）
      async doStream(options) {
        const response = await fetch(`${baseURL}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            messages: options.prompt.map(msg => ({
              role: msg.role,
              content: msg.content,
            })),
            max_tokens: options.maxTokens,
            temperature: options.temperature,
            stream: true,
          }),
        });

        if (!response.body) throw new Error('Response body is null');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        return {
          stream: new ReadableStream({
            async pull(controller) {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  controller.close();
                  return;
                }

                const chunk = decoder.decode(value);
                // 解析 SSE 格式
                const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
                for (const line of lines) {
                  const data = JSON.parse(line.slice(6));
                  const delta = data.choices?.[0]?.delta?.content;
                  if (delta) {
                    controller.enqueue({
                      type: 'text-delta' as const,
                      textDelta: delta,
                    });
                  }
                }
              }
            },
          }),
          rawCall: { rawPrompt: options.prompt, rawSettings: {} },
          rawResponse: { headers: response.headers },
        };
      },
    };
  };
}

// 使用自定义 Provider
const customLlama = createCustomProvider(
  'https://your-company-llama-proxy.com',
  process.env.CUSTOM_API_KEY || ''
);

const { text } = await generateText({
  model: customLlama('llama-3-70b'),
  prompt: '你好，请用中文回答',
});

console.log(text);
```

### 概念七：模型对比基准工具

构建一个完整的模型评测工具，帮助团队做技术选型：

```typescript
// src/05-model-benchmark.ts
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

// =====================================================
// 1. 定义测试套件
// =====================================================
interface BenchmarkCase {
  name: string;
  system: string;
  prompt: string;
  expectedBehaviors: string[]; // 用于后续自动评分
}

const TEST_SUITE: BenchmarkCase[] = [
  {
    name: '代码生成',
    system: '你是一个 TypeScript 专家',
    prompt: '写一个类型安全的 EventEmitter 实现',
    expectedBehaviors: ['泛型', '类型安全', 'TypeScript'],
  },
  {
    name: '逻辑推理',
    system: '你是一个逻辑学家',
    prompt: `有三个箱子：一个装苹果，一个装橘子，一个装苹果和橘子。
所有标签都是错的。你只能从一个箱子里拿一个水果，
不看其他箱子，如何确定所有箱子的内容？`,
    expectedBehaviors: ['推理', '逻辑'],
  },
  {
    name: '中文理解',
    system: '你是一个中文语言专家',
    prompt: '解释"塞翁失马，焉知非福"这个成语的出处和含义',
    expectedBehaviors: ['成语', '出处', '寓意'],
  },
];

// =====================================================
// 2. 评测模型列表
// =====================================================
interface ModelToBenchmark {
  name: string;
  model: ReturnType<typeof anthropic | typeof openai | typeof google>;
  costPer1KInput: number;  // $/1K tokens
  costPer1KOutput: number;
}

const MODELS: ModelToBenchmark[] = [
  { name: 'Claude Sonnet', model: anthropic('claude-sonnet-4-5-20241022'), costPer1KInput: 0.003, costPer1KOutput: 0.015 },
  { name: 'GPT-4o', model: openai('gpt-4o'), costPer1KInput: 0.0025, costPer1KOutput: 0.01 },
  { name: 'Gemini Flash', model: google('gemini-2.0-flash'), costPer1KInput: 0.001, costPer1KOutput: 0.004 },
  { name: 'GPT-4o Mini', model: openai('gpt-4o-mini'), costPer1KInput: 0.00015, costPer1KOutput: 0.0006 },
  { name: 'Claude Haiku', model: anthropic('claude-haiku-4-5-20251001'), costPer1KInput: 0.00025, costPer1KOutput: 0.00125 },
];

// =====================================================
// 3. 运行基准测试
// =====================================================
interface BenchmarkRecord {
  model: string;
  case: string;
  latency: number;
  outputLength: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  answer: string;
  error?: string;
}

async function runBenchmark(): Promise<BenchmarkRecord[]> {
  const records: BenchmarkRecord[] = [];

  for (const testCase of TEST_SUITE) {
    console.log(`\n📝 测试: ${testCase.name}`);

    for (const modelConfig of MODELS) {
      const start = Date.now();

      try {
        const { text, usage } = await generateText({
          model: modelConfig.model as any,
          system: testCase.system,
          prompt: testCase.prompt,
          maxTokens: 1024,
        });

        const latency = Date.now() - start;
        const cost =
          (usage.promptTokens * modelConfig.costPer1KInput +
            usage.completionTokens * modelConfig.costPer1KOutput) /
          1000;

        records.push({
          model: modelConfig.name,
          case: testCase.name,
          latency,
          outputLength: text.length,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          cost,
          answer: text,
        });

        console.log(`  ${modelConfig.name.padEnd(16)} ${latency}ms\t${text.length}字\t$${cost.toFixed(6)}`);
      } catch (e) {
        records.push({
          model: modelConfig.name,
          case: testCase.name,
          latency: Date.now() - start,
          outputLength: 0,
          promptTokens: 0,
          completionTokens: 0,
          cost: 0,
          answer: '',
          error: (e as Error).message,
        });
        console.error(`  ${modelConfig.name.padEnd(16)} ❌ 失败`);
      }
    }
  }

  return records;
}

// =====================================================
// 4. 生成报告
// =====================================================
function generateReport(records: BenchmarkRecord[]) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 模型基准测试报告');
  console.log('='.repeat(80));

  // 按模型分组统计
  const stats = new Map<string, {
    avgLatency: number;
    avgOutput: number;
    totalCost: number;
    errors: number;
    total: number;
  }>();

  for (const r of records) {
    const s = stats.get(r.model) || { avgLatency: 0, avgOutput: 0, totalCost: 0, errors: 0, total: 0 };
    s.avgLatency += r.latency;
    s.avgOutput += r.outputLength;
    s.totalCost += r.cost;
    if (r.error) s.errors++;
    s.total++;
    stats.set(r.model, s);
  }

  // 表格输出
  console.log('\n| 模型 | 平均延迟 | 平均输出 | 总成本 | 成功率 |');
  console.log('|------|----------|----------|--------|--------|');

  const sorted = [...stats.entries()].sort((a, b) => a[1].avgLatency - b[1].avgLatency);
  for (const [name, s] of sorted) {
    const avgLat = (s.avgLatency / s.total).toFixed(0);
    const avgOut = (s.avgOutput / s.total).toFixed(0);
    const cost = s.totalCost.toFixed(6);
    const rate = ((1 - s.errors / s.total) * 100).toFixed(0);
    console.log(`| ${name.padEnd(16)} | ${avgLat}ms | ${avgOut}字 | $${cost} | ${rate}% |`);
  }

  // 推荐结论
  console.log('\n🏆 推荐结论:');
  console.log('  延迟优先: GPT-4o Mini / Claude Haiku');
  console.log('  质量优先: Claude Sonnet / GPT-4o');
  console.log('  性价比:   Gemini Flash');
  console.log('='.repeat(80));
}

// 主流程
async function main() {
  console.log('🚀 开始模型基准测试...');
  const records = await runBenchmark();
  generateReport(records);
}

main().catch(console.error);
```

---

## 🔨 实战演练

### 练习：构建环境变量配置器

```typescript
// src/06-config-manager.ts
import { z } from 'zod';

// 环境变量 Schema 验证
const ConfigSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, '缺少 Anthropic API Key'),
  OPENAI_API_KEY: z.string().min(1, '缺少 OpenAI API Key'),
  GOOGLE_API_KEY: z.string().min(1, '缺少 Google API Key'),
  DEFAULT_MODEL: z.enum(['claude', 'gpt', 'gemini']).default('claude'),
  FALLBACK_ENABLED: z.coerce.boolean().default(true),
});

type AppConfig = z.infer<typeof ConfigSchema>;

function loadConfig(): AppConfig {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ 配置错误:');
    result.error.issues.forEach(issue => {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }
  return result.data;
}

export { loadConfig, type AppConfig };
```

---

## ⚡ 进阶技巧

### 技巧一：模型版本锁定

生产环境中，**永远不要使用未指定版本的模型名**（如 `claude-3` 或 `gpt-4`）。模型提供商会默认指向最新版，这意味着你的应用可能在不知情的情况下行为改变：

```typescript
// ❌ 危险：隐含版本变化风险
const model = anthropic('claude-3-haiku');

// ✅ 安全：显式指定完整版本号
const model = anthropic('claude-haiku-4-5-20251001');
```

### 技巧二：Provider 健康检查

```typescript
async function healthCheck(): Promise<Record<string, boolean>> {
  const providers = {
    anthropic: { model: anthropic('claude-haiku-4-5-20251001'), key: process.env.ANTHROPIC_API_KEY },
    openai: { model: openai('gpt-4o-mini'), key: process.env.OPENAI_API_KEY },
    google: { model: google('gemini-2.0-flash'), key: process.env.GOOGLE_API_KEY },
  };

  const results: Record<string, boolean> = {};

  for (const [name, { model, key }] of Object.entries(providers)) {
    if (!key) {
      results[name] = false;
      continue;
    }
    try {
      await generateText({ model: model as any, prompt: 'ping', maxTokens: 1 });
      results[name] = true;
    } catch {
      results[name] = false;
    }
  }

  return results;
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：AI SDK 如何实现多模型统一调用？**

> A：通过 `LanguageModel` 接口抽象。每个 Provider（`@ai-sdk/anthropic` 等）返回符合该接口的对象，AI SDK Core 函数（`generateText`、`streamText`）只依赖这个接口，不关心底层实现。更换模型只需修改 `model` 参数。

**Q2：生产环境中如何做模型容灾？**

> A：使用 Fallback 策略。首选模型失败后（如 API 限流），自动切换到备用模型。建议配置：主模型重试 2-3 次（间隔 1 秒），然后按优先级降级到更便宜的模型。

**Q3：自定义 Provider 需要实现哪些核心方法？**

> A：最少需要实现 `doGenerate`（非流式生成），推荐同时实现 `doStream`（流式生成）。两者都需要将 AI SDK 的统一参数格式转换为 Provider 原生 API 格式，再将响应转换为统一的 `LanguageModelV1` 格式。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Fallback 链中后一个模型也使用了相同 API Key 导致连锁失败 | 多个模型使用同一 Provider 且 Provider 本身不可用 | 在 Fallback 链中使用不同 Provider 的模型（如 Anthropic → OpenAI → Google）实现真正的冗余 |
| 动态模型选择的判断条件过于简单，选错了模型 | 仅根据任务名称匹配，未考虑模型的实际能力 | 结合任务复杂度、成本预算、延迟要求等多维度指标进行模型路由 |
| 自定义 Provider 的 `doGenerate` 返回格式不符合规范 | 未完全实现 Vercel AI SDK 的 Provider 接口契约 | 参考官方示例，确保返回对象包含 `id`、`choices`、`usage` 等必填字段 |
| 基准测试中不同模型的 Prompt 不一致影响公平比较 | 未控制 Prompt 变量，导致测试结果不可比 | 使用完全相同的 Prompt 和测试用例，仅切换 model 参数进行对比 |

---

## 📝 本章小结

- ✅ **Provider 架构** — 统一的 `LanguageModel` 接口抽象多模型
- ✅ **动态模型选择** — 按任务类型或用户选择自动路由
- ✅ **Fallback 回退** — 主模型失败时自动降级到备用模型
- ✅ **自定义 Provider** — 实现 `doGenerate`/`doStream` 接口接入私有模型
- ✅ **基准测试** — 系统评估不同模型的延迟、成本和输出质量

## ➡️ 下一章预告

> [第4章：Streaming 流式处理](./04-streaming.md) — 深入 streamText、streamObject、Data Stream 协议和流式中间件。
