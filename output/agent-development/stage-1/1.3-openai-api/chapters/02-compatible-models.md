# 第2章：国产模型兼容接口 — 一套代码调用所有模型

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 OpenAI 格式调用国产模型** — 通义千问、DeepSeek、GLM、文心一言等
- **设计统一的模型配置管理** — 一个配置文件管理所有模型
- **实现模型自动切换** — 根据任务类型选择最合适的模型

## 📋 前置知识

> 建议先完成：[第1章：Chat Completions API](./01-chat-completions.md)

---

## 💡 核心概念

### 概念一：OpenAI 兼容协议

为什么国产模型都兼容 OpenAI 格式？因为 OpenAI 的 Chat Completions API 已经成为事实上的行业标准。兼容这个格式意味着：

```
1. 用户可以零成本切换到国产模型
2. 所有支持 OpenAI SDK 的工具都能直接使用
3. 生态系统可以复用
```

### 概念二：主流国产模型配置

```typescript
// src/model-configs.ts
export interface ModelConfig {
  name: string;               // 显示名称
  provider: string;           // 提供商
  baseURL: string;            // API 地址
  apiKey: string;             // API Key
  model: string;              // 模型 ID
  maxTokens: number;          // 默认最大输出 Token
  contextWindow: number;      // 上下文窗口大小
  pricing: {                  // 价格（每百万 Token，人民币）
    input: number;
    output: number;
  };
  features: string[];         // 支持的功能
}

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // ====== 通义千问 ======
  'qwen-max': {
    name: '通义千问 Max',
    provider: 'alibaba',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env.DASHSCOPE_API_KEY || '',
    model: 'qwen-max',
    maxTokens: 8192,
    contextWindow: 131072,
    pricing: { input: 20, output: 60 },
    features: ['chat', 'streaming', 'vision', 'tool-calling'],
  },
  'qwen-plus': {
    name: '通义千问 Plus',
    provider: 'alibaba',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env.DASHSCOPE_API_KEY || '',
    model: 'qwen-plus',
    maxTokens: 8192,
    contextWindow: 131072,
    pricing: { input: 4, output: 12 },
    features: ['chat', 'streaming', 'tool-calling'],
  },

  // ====== DeepSeek ======
  'deepseek-chat': {
    name: 'DeepSeek V3',
    provider: 'deepseek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    model: 'deepseek-chat',
    maxTokens: 8192,
    contextWindow: 131072,
    pricing: { input: 2, output: 8 },
    features: ['chat', 'streaming', 'tool-calling', 'json-mode'],
  },
  'deepseek-reasoner': {
    name: 'DeepSeek R1',
    provider: 'deepseek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    model: 'deepseek-reasoner',
    maxTokens: 8192,
    contextWindow: 131072,
    pricing: { input: 4, output: 16 },
    features: ['chat', 'streaming', 'reasoning'],
  },

  // ====== GLM（智谱） ======
  'glm-4-plus': {
    name: 'GLM-4 Plus',
    provider: 'zhipu',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: process.env.ZHIPU_API_KEY || '',
    model: 'glm-4-plus',
    maxTokens: 4096,
    contextWindow: 128000,
    pricing: { input: 50, output: 50 },
    features: ['chat', 'streaming', 'vision', 'tool-calling'],
  },

  // ====== 月之暗面 Kimi ======
  'kimi-latest': {
    name: 'Kimi',
    provider: 'moonshot',
    baseURL: 'https://api.moonshot.cn/v1',
    apiKey: process.env.MOONSHOT_API_KEY || '',
    model: 'moonshot-v1-128k',
    maxTokens: 8192,
    contextWindow: 128000,
    pricing: { input: 60, output: 60 },
    features: ['chat', 'streaming', 'tool-calling', 'long-context'],
  },

  // ====== 零一万物 ======
  'yi-large': {
    name: 'Yi-Large',
    provider: '01ai',
    baseURL: 'https://api.lingyiwanwu.com/v1',
    apiKey: process.env.YI_API_KEY || '',
    model: 'yi-large',
    maxTokens: 4096,
    contextWindow: 32768,
    pricing: { input: 20, output: 20 },
    features: ['chat', 'streaming', 'tool-calling'],
  },
};
```

### 概念三：统一调用客户端

```typescript
// src/unified-llm.ts
import OpenAI from 'openai';
import { MODEL_CONFIGS, ModelConfig } from './model-configs';

export class UnifiedLLM {
  private clients: Map<string, OpenAI> = new Map();

  // 获取或创建某个模型的客户端
  private getClient(modelKey: string): { client: OpenAI; config: ModelConfig } {
    const config = MODEL_CONFIGS[modelKey];
    if (!config) throw new Error(`未知模型: ${modelKey}`);

    if (!this.clients.has(modelKey)) {
      const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
      });
      this.clients.set(modelKey, client);
    }

    return { client: this.clients.get(modelKey)!, config };
  }

  // 统一调用接口
  async chat(
    modelKey: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: { maxTokens?: number; temperature?: number; stream?: boolean } = {}
  ) {
    const { client, config } = this.getClient(modelKey);

    const params: OpenAI.ChatCompletionCreateParams = {
      model: config.model,
      max_tokens: options.maxTokens || config.maxTokens,
      temperature: options.temperature,
      messages,
      stream: options.stream || false,
    };

    if (options.stream) {
      return client.chat.completions.create(params) as Promise<AsyncIterable<OpenAI.ChatCompletionChunk>>;
    }

    const response = await client.chat.completions.create(params);
    return {
      text: response.choices[0].message.content || '',
      usage: response.usage,
      model: response.model,
      finishReason: response.choices[0].finish_reason,
    };
  }

  // 列出所有可用模型
  listModels(): Array<{ key: string; name: string; provider: string; pricing: string }> {
    return Object.entries(MODEL_CONFIGS).map(([key, config]) => ({
      key,
      name: config.name,
      provider: config.provider,
      pricing: `¥${config.pricing.input}/M入 ¥${config.pricing.output}/M出`,
    }));
  }

  // 计算成本（人民币）
  estimateCost(modelKey: string, inputTokens: number, outputTokens: number): number {
    const config = MODEL_CONFIGS[modelKey];
    if (!config) return 0;
    return (inputTokens * config.pricing.input + outputTokens * config.pricing.output) / 1000000;
  }
}

// 使用示例
async function main() {
  const llm = new UnifiedLLM();

  // 查看可用模型
  console.log('📦 可用模型:');
  llm.listModels().forEach(m => {
    console.log(`  ${m.key}: ${m.name} (${m.provider}) — ${m.pricing}`);
  });

  // 调用 DeepSeek
  const result = await llm.chat('deepseek-chat', [
    { role: 'user', content: '用一句话介绍自己' },
  ]);
  console.log('\nDeepSeek:', result.text);

  // 调用通义千问
  const qwenResult = await llm.chat('qwen-plus', [
    { role: 'user', content: '用一句话介绍自己' },
  ]);
  console.log('通义千问:', qwenResult.text);
}

main();
```

### 概念四：模型自动选择策略

```typescript
// src/model-router.ts
import { MODEL_CONFIGS } from './model-configs';

interface TaskClassification {
  type: 'simple' | 'complex' | 'reasoning' | 'creative' | 'code' | 'long-context';
  estimatedTokens: number;
  budget: 'low' | 'medium' | 'high';
}

// 根据任务类型选择最优模型
function selectModel(task: TaskClassification): string {
  const strategies: Record<string, string[]> = {
    simple: ['qwen-plus', 'deepseek-chat'],            // 简单任务：便宜优先
    complex: ['qwen-max', 'deepseek-chat', 'glm-4-plus'], // 复杂任务：质量优先
    reasoning: ['deepseek-reasoner', 'qwen-max'],       // 推理任务：推理模型
    creative: ['qwen-max', 'glm-4-plus', 'kimi-latest'], // 创意任务：创造力优先
    code: ['deepseek-chat', 'qwen-max'],                // 代码任务：代码能力优先
    long-context: ['kimi-latest', 'deepseek-chat'],     // 长文本：长上下文优先
  };

  const candidates = strategies[task.type] || strategies.simple;

  // 根据预算过滤
  const filtered = candidates.filter(key => {
    const config = MODEL_CONFIGS[key];
    if (!config) return false;
    if (task.budget === 'low') return config.pricing.input <= 10;
    if (task.budget === 'medium') return config.pricing.input <= 50;
    return true; // high 预算不限制
  });

  return filtered[0] || candidates[0];
}

// 智能路由器
class SmartRouter {
  private llm: any; // UnifiedLLM 实例

  async smartChat(
    userMessage: string,
    options: { taskType?: TaskClassification['type']; budget?: TaskClassification['budget'] } = {}
  ) {
    const task: TaskClassification = {
      type: options.taskType || 'simple',
      estimatedTokens: userMessage.length * 2,
      budget: options.budget || 'medium',
    };

    const modelKey = selectModel(task);
    console.log(`🎯 自动选择模型: ${MODEL_CONFIGS[modelKey]?.name}`);

    return this.llm.chat(modelKey, [
      { role: 'user', content: userMessage },
    ]);
  }
}
```

---

## 🔨 实战演练

### 练习：构建模型性能对比测试工具

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/benchmark.ts
import { UnifiedLLM } from './unified-llm';

interface BenchmarkResult {
  model: string;
  response: string;
  latency: number;       // 毫秒
  inputTokens: number;
  outputTokens: number;
  cost: number;          // 人民币
}

async function benchmarkModels(
  prompt: string,
  modelKeys: string[]
): Promise<BenchmarkResult[]> {
  const llm = new UnifiedLLM();
  const results: BenchmarkResult[] = [];

  for (const key of modelKeys) {
    console.log(`\n⏱️ 测试 ${key}...`);
    const start = Date.now();

    try {
      const result = await llm.chat(key, [
        { role: 'user', content: prompt },
      ]);
      const latency = Date.now() - start;
      const inputTokens = result.usage?.prompt_tokens || 0;
      const outputTokens = result.usage?.completion_tokens || 0;

      results.push({
        model: key,
        response: result.text,
        latency,
        inputTokens,
        outputTokens,
        cost: llm.estimateCost(key, inputTokens, outputTokens),
      });

      console.log(`  ✅ ${latency}ms, ${outputTokens} tokens, ¥${results[results.length-1].cost.toFixed(4)}`);
    } catch (error: any) {
      console.log(`  ❌ 错误: ${error.message}`);
    }
  }

  // 输出对比表
  console.log('\n' + '='.repeat(70));
  console.log('| 模型 | 延迟 | 输出Token | 成本 |');
  console.log('|------|------|-----------|------|');
  for (const r of results) {
    console.log(`| ${r.model.padEnd(20)} | ${r.latency}ms | ${r.outputTokens} | ¥${r.cost.toFixed(4)} |`);
  }

  return results;
}

// 使用
await benchmarkModels(
  '用一段话解释什么是微服务架构',
  ['deepseek-chat', 'qwen-plus', 'glm-4-plus']
);
```

</details>

---

## 📝 本章小结

- ✅ **兼容协议** — 国产模型普遍兼容 OpenAI 格式
- ✅ **模型配置** — 统一管理 baseURL、apiKey、model 等参数
- ✅ **统一客户端** — 一套代码调用所有模型
- ✅ **智能路由** — 根据任务类型和预算自动选择最优模型

## ➡️ 下一章预告

> [第3章：结构化输出](./03-structured-outputs.md) — 让模型稳定输出 JSON 格式。
