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

> **💡 为什么需要网关架构？**
> 直接在前端代码中调用多个模型提供商的 API 会导致严重耦合：前端必须知道所有模型的路由逻辑、API 密钥管理和错误处理策略。网关架构将路由逻辑集中到一层，前端只需发送统一格式的请求，网关负责所有复杂的转发、降级和成本控制工作。这不仅降低了前端维护成本，还提升了系统的可观测性和可靠性。

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

> **💡 为什么使用统一的 Gateway 接口？**
> 核心价值在于「关注点分离」：客户端代码只关注「发什么消息」，网关负责「发给谁 + 怎么发 + 失败了怎么办」。这让业务代码与模型提供商的 SDK 解耦，切换模型时前端代码无需改动。

**预期输出：**
```
使用模型: deepseek/deepseek-chat
完整的快速排序算法实现（含 TypeScript 类型标注和测试用例）
```

---

## 🔨 实战演练

### 场景：为企业构建一个统一的 AI 网关服务

**场景描述：**
假设你的公司正在开发一个 AI 助手平台，需要接入 DeepSeek、通义千问和 GLM-4 三个模型。前端团队希望只用一套 API，后端需要做成本控制，运维需要降级容错。你需要设计一个统一网关来满足这些需求。

**你的任务：**
1. 设计 ProviderConfig 和 GatewayRequest 的类型定义，支持任务类型和预算配置
2. 实现基于任务类型和预算的智能路由算法
3. 添加降级容错和速率限制机制
4. 集成成本追踪功能，确保日预算不超支

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/enterprise-gateway.ts
import OpenAI from 'openai';

interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKey: string;
  models: Record<string, ModelConfig>;
  priority: number;
  rateLimit: number;
  timeout: number;
}

interface ModelConfig {
  id: string;
  maxTokens: number;
  costPerMillionInput: number;
  costPerMillionOutput: number;
  supportedTaskTypes: string[];
}

interface GatewayRequest {
  messages: Array<{ role: string; content: string }>;
  taskType?: 'chat' | 'code' | 'analysis' | 'creative';
  budget?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

class EnterpriseGateway {
  private providers: Map<string, { client: OpenAI; config: ProviderConfig }> = new Map();
  private costTracker = { daily: 0, limit: 100 };

  constructor(providers: ProviderConfig[]) {
    for (const config of providers) {
      const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        maxRetries: 2,
        timeout: config.timeout,
      });
      this.providers.set(config.name, { client, config });
    }
  }

  private route(request: GatewayRequest): { provider: string; modelKey: string } {
    const candidates: Array<{ provider: string; modelKey: string; score: number }> = [];

    for (const [name, { config }] of this.providers) {
      for (const [modelKey, modelCfg] of Object.entries(config.models)) {
        let score = config.priority * 10;

        if (request.taskType && !modelCfg.supportedTaskTypes.includes(request.taskType)) {
          continue;  // 不支持该任务类型的模型直接跳过
        }

        if (request.budget === 'low' && modelCfg.costPerMillionInput <= 5) score += 30;
        if (request.budget === 'high' && modelCfg.costPerMillionInput >= 20) score += 10;

        candidates.push({ provider: name, modelKey, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  async chat(request: GatewayRequest) {
    const { provider: providerName, modelKey } = this.route(request);
    const { client, config } = this.providers.get(providerName)!;
    const modelConfig = config.models[modelKey];

    if (this.costTracker.daily >= this.costTracker.limit) {
      throw new Error('日预算已用完，请联系管理员');
    }

    try {
      const response = await client.chat.completions.create({
        model: modelConfig.id,
        max_tokens: request.maxTokens || 2048,
        messages: request.messages as any,
        stream: request.stream || false,
      });

      if ('usage' in response && response.usage) {
        const cost = (response.usage.prompt_tokens * modelConfig.costPerMillionInput +
          response.usage.completion_tokens * modelConfig.costPerMillionOutput) / 1000000;
        this.costTracker.daily += cost;
      }

      return { provider: providerName, model: modelConfig.id, response };
    } catch (error) {
      for (const [fallbackName, fb] of this.providers) {
        if (fallbackName === providerName) continue;
        try {
          const fbModelKey = Object.keys(fb.config.models)[0];
          const fbResponse = await fb.client.chat.completions.create({
            model: fb.config.models[fbModelKey].id,
            max_tokens: request.maxTokens || 2048,
            messages: request.messages as any,
          });
          return { provider: fallbackName, model: fb.config.models[fbModelKey].id, response: fbResponse };
        } catch { continue; }
      }
      throw new Error('所有模型提供商均不可用');
    }
  }

  getDailyCost() {
    return this.costTracker.daily;
  }
}

async function main() {
  const gateway = new EnterpriseGateway([
    {
      name: 'deepseek',
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      models: {
        'deepseek-chat': {
          id: 'deepseek-chat', maxTokens: 8192,
          costPerMillionInput: 2, costPerMillionOutput: 8,
          supportedTaskTypes: ['chat', 'code'],
        },
      },
      priority: 1,
      rateLimit: 60,
      timeout: 30000,
    },
    {
      name: 'glm',
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: process.env.GLM_API_KEY || '',
      models: {
        'glm-4-plus': {
          id: 'glm-4-plus', maxTokens: 8192,
          costPerMillionInput: 10, costPerMillionOutput: 30,
          supportedTaskTypes: ['chat', 'creative'],
        },
      },
      priority: 3,
      rateLimit: 30,
      timeout: 30000,
    },
  ]);

  const result = await gateway.chat({
    messages: [{ role: 'user', content: '帮我写一个 TypeScript 装饰器' }],
    taskType: 'code',
    budget: 'medium',
  });

  console.log('实际使用:', result.provider, result.model);
  console.log('日消耗: $', gateway.getDailyCost().toFixed(4));
}

main();
```

**预期输出：**
```
实际使用: deepseek deepseek-chat
日消耗: $ 0.0012
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：请求缓存层

对于重复性高的查询（如 FAQ、API 文档查询），可以在网关中添加缓存层来减少 API 调用次数和降低延迟。

```typescript
// 使用简单的内存缓存减少重复 API 调用
class GatewayCache {
  private cache = new Map<string, { response: any; timestamp: number }>();
  private ttl: number;

  constructor(ttlMs: number = 60000) {
    this.ttl = ttlMs;  // 默认缓存 1 分钟
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);  // 过期条目自动清除
      return null;
    }
    return entry.response;
  }

  set(key: string, response: any): void {
    this.cache.set(key, { response, timestamp: Date.now() });
  }
}
```

### 技巧二：并发请求与最快响应

当对延迟敏感时，可以同时向多个模型发送请求，取最先返回的结果——这适用于需要最快响应的场景。

```typescript
async function raceRequest(providers: Array<{ name: string; client: OpenAI; model: string }>, messages: any[]) {
  const requests = providers.map(p =>
    p.client.chat.completions.create({
      model: p.model,
      messages,
    }).then(resp => ({ provider: p.name, response: resp }))
  );

  return Promise.race(requests);
}
```

> **💡 为什么使用竞速模式？** 有些场景（如实时客服）对延迟极其敏感，通过竞速可以确保用户始终获得最快可用的响应。但要注意，竞速意味着会浪费其他模型的配额和费用。

### 技巧三：语义缓存

基于 Embedding 相似度判断请求是否与缓存中的内容语义相似，命中语义相似的结果可以直接返回：

```typescript
// 核心思路：将用户消息转为向量，与缓存中的向量比较
// 相似度 > 0.95 则直接返回缓存结果
// 这对于客服问答等场景特别有效，可以节省 60% 以上的 API 成本
// 实现时需要引入向量数据库或简单的向量比对库
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：多模型网关的核心职责是什么？**

A：核心职责包括：（1）统一接口抽象——所有模型提供商使用同一套 API；（2）智能路由——根据任务类型、预算、速率限制自动选择最优模型；（3）降级容错——主模型不可用时自动切换到备用模型；（4）成本控制——实时统计和限制 API 调用成本。

**Q2：网关的路由策略中，为什么要考虑「任务类型」这个维度？**

A：不同模型在不同任务上表现各异。例如 DeepSeek 在代码生成方面表现出色，通义千问在创意写作上更擅长。基于任务类型路由能确保用户获得最佳体验，同时避免「用大炮打蚊子」——简单的对话用便宜的模型即可满足需求。

**Q3：降级策略设计中需要注意哪些问题？**

A：（1）降级顺序应按优先级排列，避免「好的先挂」；（2）需要设置超时时间，避免长时间等待无效请求；（3）降级后的模型可能能力不同，要在响应中标注当前使用的模型；（4）记录降级日志用于后续分析。

**Q4：Rate Limit（速率限制）为什么是网关的必要功能？**

A：（1）避免因突发请求触发 API 提供商的限流惩罚；（2）公平分配资源——防止某个用户或服务占用所有配额；（3）控制成本——意外的调用激增可能导致巨额账单。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 路由总是选择同一个模型 | 评分算法中优先级权重过高，忽略了任务类型和预算因素 | 调整评分算法：降低优先级的基础分，增加任务匹配的加分权重 |
| 降级后返回的响应格式不一致 | 不同模型的响应结构有差异，降级时未做统一格式化 | 在网关层对响应做统一包装，确保前端收到的格式一致 |
| API Key 泄露风险 | 网关中硬编码了 API Key，或者环境变量管理不当 | 使用环境变量 + 密钥管理服务（如 Vault），网关只引用密钥 ID |
| 成本统计不准确 | 只统计了 prompt_tokens 而忽略了 completion_tokens | 同时统计输入和输出的 Token 消耗，使用提供商的实际计价公式 |
| 超时设置不合理 | timeout 太短导致频繁失败，或太长导致糟糕的用户体验 | 根据模型响应速度调整超时，一般 chat 模型 15-30s，推理模型 30-60s |

---

## 📝 本章小结

- ✅ **统一接口** — 一个 Gateway 兼容所有 LLM 提供商
- ✅ **智能路由** — 根据任务类型、预算、可用性自动选择最优模型
- ✅ **降级容错** — 主模型失败时自动切换备用提供商
- ✅ **成本控制** — 实时统计和每日预算管理
- ✅ **缓存策略** — 内存缓存和语义缓存减少重复调用
- ✅ **企业级架构** — 支持并发竞速、超时管理、密钥安全

## ➡️ 下一章预告

> [第5章：综合实战 — 多模型 API 网关](./05-capstone-gateway.md) — 将本章的设计理念落地为完整的可部署项目。
