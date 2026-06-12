# 第4章：多模型网关设计 — 统一接口与智能路由

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **设计统一的 LLM 网关接口** — 一个 API 兼容所有模型
- **实现智能模型路由** — 根据任务自动选择最优模型
- **构建降级和容错机制** — 主模型不可用时自动切换备用
- **管理 Token 预算和成本** — 防止成本失控

## 📋 前置知识

> 建议先完成：[第2章：国产模型兼容接口](./02-compatible-models.md)

---

## 💡 核心概念

### 概念一：为什么需要多模型网关？

**生活类比：** 多模型网关就像一个智能客服中心的前台——客户不需要知道哪个客服擅长处理什么问题，前台会自动分配最合适的客服。

```
无网关：
  前端 → 直接调用 DeepSeek API
  前端 → 直接调用通义千问 API
  前端 → 直接调用 Claude API
  （前端需要知道每个模型的 API 差异）

有网关：
  前端 → 统一网关 → 路由 → DeepSeek
                     → 路由 → 通义千问
                     → 路由 → Claude
  （前端只需要调用一个接口）
```

### 概念二：网关架构设计

```
┌─────────────────────────────────────────────┐
│              前端 / 客户端                     │
└──────────────────┬──────────────────────────┘
                   │ POST /v1/chat/completions
                   ▼
┌─────────────────────────────────────────────┐
│              统一 API 网关                     │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
│  │请求解析器│→│路由引擎   │→│成本控制器     │  │
│  └─────────┘ └──────────┘ └──────────────┘  │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
│  │缓存层   │ │重试机制   │ │日志记录       │  │
│  └─────────┘ └──────────┘ └──────────────┘  │
└──────────────────┬──────────────────────────┘
         ┌────────┼────────┐
         ▼        ▼        ▼
    ┌────────┐┌────────┐┌────────┐
    │DeepSeek││通义千问 ││ Claude │
    └────────┘└────────┘└────────┘
```

### 概念三：核心网关实现

```typescript
// src/gateway.ts
import OpenAI from 'openai';

// ====== 配置定义 ======
interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKey: string;
  models: Record<string, { id: string; maxTokens: number; costPerMillionInput: number; costPerMillionOutput: number }>;
  priority: number;          // 优先级（数字越小越优先）
  rateLimit: number;         // 每分钟最大请求数
  timeout: number;           // 请求超时（毫秒）
}

interface GatewayRequest {
  model?: string;            // 指定模型（可选，不指定则自动路由）
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  taskType?: 'chat' | 'code' | 'analysis' | 'creative';
  budget?: 'low' | 'medium' | 'high';
}

// ====== 网关实现 ======
class LLMGateway {
  private providers: Map<string, { client: OpenAI; config: ProviderConfig }> = new Map();
  private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private totalCost = 0;

  constructor(providers: ProviderConfig[]) {
    for (const config of providers) {
      const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
      this.providers.set(config.name, { client, config });
    }
  }

  // 智能路由：选择最优模型
  private route(request: GatewayRequest): { provider: string; modelId: string } {
    // 如果指定了模型，直接使用
    if (request.model) {
      for (const [providerName, { config }] of this.providers) {
        if (config.models[request.model]) {
          return { provider: providerName, modelId: config.models[request.model].id };
        }
      }
    }

    // 否则根据任务类型和预算自动选择
    const candidates: Array<{ provider: string; modelKey: string; score: number }> = [];

    for (const [providerName, { config }] of this.providers) {
      for (const [modelKey, modelConfig] of Object.entries(config.models)) {
        // 检查速率限制
        if (this.isRateLimited(providerName)) continue;

        let score = config.priority * 10; // 基础分

        // 根据任务类型加分
        if (request.taskType === 'code' && modelKey.includes('deepseek')) score += 20;
        if (request.taskType === 'analysis' && modelKey.includes('qwen-max')) score += 15;
        if (request.taskType === 'creative' && modelKey.includes('qwen-max')) score += 15;

        // 根据预算加分
        if (request.budget === 'low' && modelConfig.costPerMillionInput <= 5) score += 30;
        if (request.budget === 'high' && modelConfig.costPerMillionInput >= 20) score += 10;

        candidates.push({ provider: providerName, modelKey, score });
      }
    }

    // 选择分数最高的
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    return { provider: best.provider, modelId: this.providers.get(best.provider)!.config.models[best.modelKey].id };
  }

  private isRateLimited(providerName: string): boolean {
    const counter = this.requestCounts.get(providerName);
    if (!counter) return false;
    if (Date.now() > counter.resetTime) {
      this.requestCounts.delete(providerName);
      return false;
    }
    const config = this.providers.get(providerName)!.config;
    return counter.count >= config.rateLimit;
  }

  private incrementRateLimit(providerName: string) {
    const now = Date.now();
    const counter = this.requestCounts.get(providerName);
    if (!counter || now > counter.resetTime) {
      this.requestCounts.set(providerName, { count: 1, resetTime: now + 60000 });
    } else {
      counter.count++;
    }
  }

  // 统一请求处理
  async chat(request: GatewayRequest) {
    const { provider: providerName, modelId } = this.route(request);
    const { client, config } = this.providers.get(providerName)!;

    this.incrementRateLimit(providerName);

    try {
      const response = await client.chat.completions.create({
        model: modelId,
        max_tokens: request.maxTokens || 2048,
        temperature: request.temperature,
        messages: request.messages as any,
        stream: request.stream || false,
      });

      // 计算成本
      if ('usage' in response && response.usage) {
        const modelConfig = Object.values(config.models).find(m => m.id === modelId);
        if (modelConfig) {
          const cost = (response.usage.prompt_tokens * modelConfig.costPerMillionInput +
            response.usage.completion_tokens * modelConfig.costPerMillionOutput) / 1000000;
          this.totalCost += cost;
        }
      }

      return {
        provider: providerName,
        model: modelId,
        response,
      };
    } catch (error) {
      // 降级：尝试其他提供商
      console.warn(`⚠️ ${providerName} 请求失败，尝试降级...`);
      return this.fallback(request, providerName);
    }
  }

  // 降级处理
  private async fallback(request: GatewayRequest, failedProvider: string) {
    for (const [providerName, { client, config }] of this.providers) {
      if (providerName === failedProvider) continue;
      if (this.isRateLimited(providerName)) continue;

      try {
        const modelKey = Object.keys(config.models)[0];
        const response = await client.chat.completions.create({
          model: config.models[modelKey].id,
          max_tokens: request.maxTokens || 2048,
          messages: request.messages as any,
        });
        return { provider: providerName, model: config.models[modelKey].id, response };
      } catch {
        continue;
      }
    }
    throw new Error('所有提供商均不可用');
  }

  getStats() {
    return { totalCost: this.totalCost };
  }
}
```

### 概念四：使用网关

```typescript
// src/use-gateway.ts
import { LLMGateway } from './gateway';

const gateway = new LLMGateway([
  {
    name: 'deepseek',
    baseURL: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    models: {
      'deepseek-chat': { id: 'deepseek-chat', maxTokens: 8192, costPerMillionInput: 2, costPerMillionOutput: 8 },
      'deepseek-reasoner': { id: 'deepseek-reasoner', maxTokens: 8192, costPerMillionInput: 4, costPerMillionOutput: 16 },
    },
    priority: 1,
    rateLimit: 60,
    timeout: 30000,
  },
  {
    name: 'qwen',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env.DASHSCOPE_API_KEY || '',
    models: {
      'qwen-plus': { id: 'qwen-plus', maxTokens: 8192, costPerMillionInput: 4, costPerMillionOutput: 12 },
      'qwen-max': { id: 'qwen-max', maxTokens: 8192, costPerMillionInput: 20, costPerMillionOutput: 60 },
    },
    priority: 2,
    rateLimit: 60,
    timeout: 30000,
  },
]);

// 自动路由
const result = await gateway.chat({
  messages: [{ role: 'user', content: '写一个快速排序算法' }],
  taskType: 'code',
  budget: 'low',
});

console.log(`使用模型: ${result.provider}/${result.model}`);
console.log(result.response.choices[0].message.content);
```

---

## 📝 本章小结

- ✅ **统一接口** — 一个 Gateway 兼容所有 LLM 提供商
- ✅ **智能路由** — 根据任务类型、预算、可用性自动选择
- ✅ **降级容错** — 主模型失败时自动切换备用
- ✅ **成本控制** — 实时统计和预算管理

## ➡️ 下一章预告

> [第5章：综合实战 — 多模型 API 网关](./05-capstone-gateway.md)
