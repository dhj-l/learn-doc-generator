# 第5章：综合实战 — 多模型 API 网关

> 预计学习时间：120-150 分钟

## 🎯 本章目标

综合运用前四章知识，构建一个完整的多模型 API 网关服务。

---

## 📋 前置知识

> 建议先完成：
> - [第4章：多模型网关设计](./04-multi-model-gateway.md) — 理解网关的核心架构和路由算法
> - [第3章：结构化输出](./03-structured-outputs.md) — 了解 Zod Schema 和 JSON 输出控制

---

## 💡 核心概念

### 概念一：Capstone 项目架构

**生活类比：** 盖房子之前需要先画好设计图纸。一个完整的多模型网关项目就像一栋精心设计的房子——**每个模块各司其职，组合起来才是一栋完整的建筑**。

```
项目结构（房子）：
  ├── types.ts        ← 地基（所有模块共享的类型定义）
  ├── providers.ts    ← 水电管道（各模型提供商的连接配置）
  ├── router.ts       ← 房间布局（智能路由逻辑）
  ├── gateway.ts      ← 主体结构（网关核心逻辑）
  ├── cache.ts        ← 储物间（缓存层）
  ├── cost-tracker.ts ← 电表（成本追踪）
  └── index.ts        ← 大门（入口文件）
```

> **💡 为什么这样拆分？** 单一职责原则——每个文件只负责一件事。网关核心只做请求分发，路由引擎只做模型选择，缓存层只做数据暂存。这样当某个模块需要修改时，不会牵连其他模块。

### 概念二：模块间协作流程

```
┌──────────┐    路由请求    ┌──────────┐
│ index.ts │ ────────────→ │ gateway  │
│ (入口)   │ ←──────────── │ .ts      │
└──────────┘   返回响应    └────┬─────┘
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
               ┌────────┐ ┌────────┐ ┌────────┐
               │router  │ │cache   │ │cost-   │
               │.ts     │ │.ts     │ │tracker │
               └────────┘ └────────┘ └────────┘
                    │          │          │
                    ▼          │          │
               ┌────────┐     │          │
               │providers│     │          │
               │.ts     │     │          │
               └────────┘     │          │
                              ▼          ▼
                          (缓存命中?)  (预算检查?)
```

请求处理流程：
1. `index.ts` 接收 HTTP 请求，解析参数
2. `gateway.ts` 调用 `router.ts` 获取目标模型
3. 检查 `cache.ts` 是否有缓存命中
4. 检查 `cost-tracker.ts` 是否超预算
5. 通过 `providers.ts` 配置的客户端发起 API 调用
6. 记录成本信息到 `cost-tracker.ts`
7. 返回统一格式的响应

### 概念三：统一响应格式

```typescript
// src/types.ts
export interface GatewayResponse {
  success: boolean;
  provider: string;
  model: string;
  data: {
    content: string | null;
    finishReason: 'stop' | 'length' | 'error' | 'fallback';
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  metadata: {
    latency: number;        // 请求耗时（毫秒）
    cached: boolean;        // 是否命中缓存
    fallbackUsed: boolean;  // 是否触发了降级
  };
}
```

> **💡 为什么统一响应格式很重要？** 前端团队不需要关心后端用的是哪个模型提供商——不管是 DeepSeek、通义千问还是 Claude，返回的数据结构完全一致。这让前端代码与后端实现彻底解耦，切换模型时不需要修改前端代码。

---

## 🔨 实战演练

### 场景：构建一个完整的可部署多模型 API 网关

**场景描述：**
你所在的公司正在将 AI 能力集成到所有产品线中，不同的团队使用不同的模型提供商——前端团队用 DeepSeek，数据分析团队用通义千问，创意团队用 GLM-4。管理层要求统一管理 API 调用，控制成本，同时保证服务的高可用性。你需要设计并实现一个多模型 API 网关来满足全公司的 AI 需求。

**你的任务：**
本实战项目将综合运用前四章的知识，构建一个包含完整模块的多模型 API 网关服务。请按以下步骤完成：

### 第一步：需求分析

**项目目标：**
- 提供一个统一的 REST API，支持多个 LLM 提供商
- 支持智能路由（按任务类型和预算自动选择模型）
- 支持降级容错（主模型不可用时自动切换备用）
- 支持成本追踪和预算管理
- 支持缓存层减少重复调用

**功能列表：**
1. 统一的 `/v1/chat/completions` 接口
2. 自动模型路由（基于任务类型和预算）
3. 降级到备用模型
4. 内存缓存（TTL 可配置）
5. 日预算控制和成本统计
6. 请求日志和监控

### 第二步：技术选型

| 组件 | 技术选型 | 选择理由 |
|------|----------|----------|
| 运行时 | Node.js + TypeScript | 类型安全，生态丰富 |
| API 客户端 | OpenAI SDK | 兼容所有兼容 OpenAI API 的模型 |
| 缓存 | 内存 Map | 简单高效，无需额外依赖 |
| 日志 | console + 文件输出 | 零依赖，易于扩展 |
| 配置 | 环境变量 | 12-Factor App 最佳实践 |

### 第三步：核心实现

#### 类型定义

```typescript
// src/types.ts
export interface GatewayResponse {
  success: boolean;
  provider: string;
  model: string;
  data: {
    content: string | null;
    finishReason: 'stop' | 'length' | 'error' | 'fallback';
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  metadata: {
    latency: number;        // 请求耗时（毫秒）
    cached: boolean;        // 是否命中缓存
    fallbackUsed: boolean;  // 是否触发了降级
  };
}
```

#### 提供商配置

```typescript
// src/providers.ts
import OpenAI from 'openai';

export interface ProviderConfig {
  name: string;
  client: OpenAI;
  models: Record<string, {
    id: string;
    maxTokens: number;
    costPerMillionInput: number;
    costPerMillionOutput: number;
    taskTypes: string[];
  }>;
  priority: number;
  rateLimit: number;
}

export function createProviders(): ProviderConfig[] {
  return [
    {
      name: 'deepseek',
      client: new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com/v1',
      }),
      models: {
        'deepseek-chat': { id: 'deepseek-chat', maxTokens: 8192, costPerMillionInput: 2, costPerMillionOutput: 8, taskTypes: ['chat', 'code'] },
      },
      priority: 1,
      rateLimit: 60,
    },
    {
      name: 'qwen',
      client: new OpenAI({
        apiKey: process.env.DASHSCOPE_API_KEY,
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      }),
      models: {
        'qwen-plus': { id: 'qwen-plus', maxTokens: 8192, costPerMillionInput: 4, costPerMillionOutput: 12, taskTypes: ['chat', 'creative'] },
        'qwen-max': { id: 'qwen-max', maxTokens: 8192, costPerMillionInput: 20, costPerMillionOutput: 60, taskTypes: ['analysis'] },
      },
      priority: 2,
      rateLimit: 60,
    },
  ];
}
```

#### 路由器

```typescript
// src/router.ts
import { ProviderConfig } from './providers';

export interface RouteRequest {
  taskType?: string;
  budget?: 'low' | 'medium' | 'high';
  preferredModel?: string;
}

export interface RouteResult {
  provider: ProviderConfig;
  modelKey: string;
}

export function route(request: RouteRequest, providers: ProviderConfig[]): RouteResult {
  const candidates: Array<{ provider: ProviderConfig; modelKey: string; score: number }> = [];

  for (const provider of providers) {
    for (const [modelKey, modelConfig] of Object.entries(provider.models)) {
      let score = provider.priority * 10;

      // 任务类型匹配加分
      if (request.taskType && modelConfig.taskTypes.includes(request.taskType)) {
        score += 20;
      }

      // 预算匹配
      if (request.budget === 'low' && modelConfig.costPerMillionInput <= 5) score += 30;
      if (request.budget === 'high' && modelConfig.costPerMillionInput >= 15) score += 15;

      candidates.push({ provider, modelKey, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return { provider: candidates[0].provider, modelKey: candidates[0].modelKey };
}
```

#### 缓存层

```typescript
// src/cache.ts
interface CacheEntry {
  response: any;
  timestamp: number;
}

export class ResponseCache {
  private store = new Map<string, CacheEntry>();
  private ttl: number;

  constructor(ttlMs: number = 60000) {
    this.ttl = ttlMs;
  }

  get(key: string): any | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.store.delete(key);  // 过期条目自动清理
      return null;
    }
    return entry.response;
  }

  set(key: string, response: any): void {
    this.store.set(key, { response, timestamp: Date.now() });
  }

  clear(): void {
    this.store.clear();
  }
}
```

<details>
<summary>🧑‍💻 完整 gateway.ts 实现 — 先自己思考，再展开查看</summary>

```typescript
// src/gateway.ts
import OpenAI from 'openai';
import { ProviderConfig } from './providers';
import { route, RouteRequest } from './router';
import { ResponseCache } from './cache';
import { GatewayResponse } from './types';

export class LLMGateway {
  private providers: ProviderConfig[];
  private cache: ResponseCache;
  private totalCost = 0;
  private dailyBudget: number;

  constructor(providers: ProviderConfig[], options?: { cacheTTL?: number; dailyBudget?: number }) {
    this.providers = providers;
    this.cache = new ResponseCache(options?.cacheTTL ?? 60000);
    this.dailyBudget = options?.dailyBudget ?? 100;
  }

  async chat(messages: any[], options?: RouteRequest): Promise<GatewayResponse> {
    const startTime = Date.now();

    // 1. 检查日预算
    if (this.totalCost >= this.dailyBudget) {
      return this.errorResponse('日预算已耗尽', startTime);
    }

    // 2. 路由选择
    const { provider, modelKey } = route(options ?? {}, this.providers);
    const modelConfig = provider.models[modelKey];

    // 3. 检查缓存
    const cacheKey = JSON.stringify({ model: modelConfig.id, messages });
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, metadata: { ...cached.metadata, cached: true } };
    }

    // 4. 发起请求
    try {
      const response = await provider.client.chat.completions.create({
        model: modelConfig.id,
        max_tokens: modelConfig.maxTokens,
        messages: messages as any,
      });

      const usage = response.usage!;
      const cost = (usage.prompt_tokens * modelConfig.costPerMillionInput +
        usage.completion_tokens * modelConfig.costPerMillionOutput) / 1000000;

      this.totalCost += cost;

      const result: GatewayResponse = {
        success: true,
        provider: provider.name,
        model: modelConfig.id,
        data: {
          content: response.choices[0]?.message?.content ?? '',
          finishReason: 'stop',
        },
        usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, cost },
        metadata: { latency: Date.now() - startTime, cached: false, fallbackUsed: false },
      };

      // 缓存结果
      this.cache.set(cacheKey, result);

      return result;
    } catch (error) {
      // 5. 降级处理
      return this.fallback(messages, provider.name, startTime);
    }
  }

  private async fallback(messages: any[], failedProvider: string, startTime: number): Promise<GatewayResponse> {
    for (const fbProvider of this.providers) {
      if (fbProvider.name === failedProvider) continue;
      try {
        const fbModelKey = Object.keys(fbProvider.models)[0];
        const fbConfig = fbProvider.models[fbModelKey];
        const response = await fbProvider.client.chat.completions.create({
          model: fbConfig.id,
          max_tokens: fbConfig.maxTokens,
          messages: messages as any,
        });

        const cost = 0.001; // 简化计算
        this.totalCost += cost;

        return {
          success: true,
          provider: fbProvider.name,
          model: fbConfig.id,
          data: { content: response.choices[0]?.message?.content ?? '', finishReason: 'fallback' },
          usage: { inputTokens: 0, outputTokens: 0, cost },
          metadata: { latency: Date.now() - startTime, cached: false, fallbackUsed: true },
        };
      } catch { continue; }
    }
    return this.errorResponse('所有模型提供商均不可用', startTime);
  }

  private errorResponse(message: string, startTime: number): GatewayResponse {
    return {
      success: false,
      provider: '',
      model: '',
      data: { content: message, finishReason: 'error' },
      usage: { inputTokens: 0, outputTokens: 0, cost: 0 },
      metadata: { latency: Date.now() - startTime, cached: false, fallbackUsed: false },
    };
  }

  getStats() {
    return { totalCost: this.totalCost };
  }
}
```

</details>

### 第四步：集成和测试

```typescript
// src/index.ts
import { LLMGateway } from './gateway';
import { createProviders } from './providers';

async function main() {
  const gateway = new LLMGateway(createProviders(), {
    dailyBudget: 50,  // 日预算 50 元
    cacheTTL: 30000,  // 缓存 30 秒
  });

  // 测试场景 1：简单问答（自动选低成本模型）
  console.log('=== 场景 1：简单问答 ===');
  const r1 = await gateway.chat(
    [{ role: 'user', content: '什么是 TypeScript？' }],
    { taskType: 'chat', budget: 'low' }
  );
  console.log(`使用: ${r1.provider}/${r1.model}`);
  console.log(`响应: ${r1.data.content?.substring(0, 100)}...`);
  console.log(`耗时: ${r1.metadata.latency}ms`);

  // 测试场景 2：代码生成（自动选代码能力强的模型）
  console.log('\n=== 场景 2：代码生成 ===');
  const r2 = await gateway.chat(
    [{ role: 'user', content: '用 TypeScript 实现一个防抖函数' }],
    { taskType: 'code', budget: 'medium' }
  );
  console.log(`使用: ${r2.provider}/${r2.model}`);
  console.log(`命中缓存: ${r2.metadata.cached}`);

  // 测试场景 3：验证缓存（第二次请求应命中缓存）
  console.log('\n=== 场景 3：缓存验证 ===');
  const r3 = await gateway.chat(
    [{ role: 'user', content: '什么是 TypeScript？' }],
    { taskType: 'chat', budget: 'low' }
  );
  console.log(`命中缓存: ${r3.metadata.cached}`);

  // 输出统计
  console.log('\n📊 成本统计: ¥', gateway.getStats().totalCost.toFixed(4));
}

main().catch(console.error);
```

**预期输出：**
```
=== 场景 1：简单问答 ===
使用: deepseek/deepseek-chat
响应: TypeScript 是 JavaScript 的超集，添加了静态类型系统...
耗时: 1234ms

=== 场景 2：代码生成 ===
使用: deepseek/deepseek-chat
命中缓存: false

=== 场景 3：缓存验证 ===
命中缓存: true

📊 成本统计: ¥ 0.0024
```

---

## ⚡ 进阶技巧

### 技巧一：健康检查与自动恢复

为每个模型提供商添加健康检查端点，定期检测可用性：

```typescript
// 每 60 秒检查一次各提供商的健康状态
async function healthCheck(providers: ProviderConfig[]) {
  for (const provider of providers) {
    try {
      const response = await provider.client.chat.completions.create({
        model: Object.keys(provider.models)[0],
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      console.log(`✅ ${provider.name}: 正常`);
    } catch {
      console.warn(`❌ ${provider.name}: 不可用，将跳过该提供商`);
      // 标记为不可用，路由时跳过
    }
  }
}
```

### 技巧二：请求重试与指数退避

当 API 调用失败时，使用指数退避策略重试：

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = baseDelay * Math.pow(2, attempt);  // 指数增长：1s, 2s, 4s
      console.warn(`第 ${attempt + 1} 次失败，${delay}ms 后重试...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('重试耗尽');
}
```

### 技巧三：结构化日志

```typescript
// 记录每次请求的结构化日志，方便后续分析
interface RequestLog {
  timestamp: string;
  provider: string;
  model: string;
  latency: number;
  cached: boolean;
  fallback: boolean;
  cost: number;
  inputTokens: number;
  outputTokens: number;
}

// 可以将日志写入文件或发送到日志收集服务（如 ELK）
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：多模型网关的核心价值是什么？**

A：（1）统一接口——前端不需要适配不同模型的 API 差异；（2）智能路由——根据任务自动选择最优模型；（3）容错降级——主模型不可用时自动切换；（4）成本管理——统一的预算控制和成本追踪。

**Q2：如何设计模型降级策略？**

A：按优先级排列候选模型列表。当主模型请求失败（超时、速率限制、服务不可用）时，按优先级尝试下一个模型。记录失败日志用于后续分析。

**Q3：缓存层的 TTL 应该如何设置？**

A：取决于业务场景。一般问答场景 30-60 秒缓存即可；FAQ 类可以延长到 5-10 分钟；实时性要求高的场景（如聊天）可以不缓存或只用短 TTL（5 秒）。

**Q4：什么情况下适合使用竞速模式（同时请求多个模型取最快）？**

A：对延迟极其敏感的场景（如实时客服、即时翻译）。缺点是会浪费配额和产生额外费用，建议只在高优先级请求中使用。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 路由总是选同一个模型 | 优先级权重过高，忽略了任务类型匹配 | 降低基础优先级分，增加任务匹配的加分比例 |
| 降级后响应格式不一致 | 不同模型的响应结构有差异，没有统一格式化 | 在网关层对 response 做统一包装 |
| 缓存过期后仍然返回旧数据 | TTL 设置过长，或缓存清理不及时 | 缩短 TTL，或添加手动清除缓存的接口 |
| 日预算超支 | 成本计算只统计了部分 Token | 同时统计 input 和 output 的 Token，加上固定系数 |
| API Key 泄露 | 将 Key 硬编码在代码中 | 使用环境变量 + 密钥管理服务（Vault） |

---

## 📝 本章小结

- ✅ **项目架构** — 模块化设计：types / providers / router / cache / gateway 各司其职
- ✅ **智能路由** — 基于任务类型和预算的自动模型选择算法
- ✅ **降级容错** — 主模型失败时自动切换到备用提供商
- ✅ **缓存层** — 内存缓存减少重复 API 调用，降低成本和延迟
- ✅ **成本控制** — 日预算限制和精确的成本追踪
- ✅ **完整可部署** — 从类型定义到入口文件的完整项目结构

## ➡️ 下一章预告

> 完成第5章后，你已经掌握了 OpenAI API 的全部核心技能！接下来将进入 [1.4 Embedding 与向量数据库](../../1.4-embedding-and-vector-database/README.md) — 学习如何将文本转换为向量并进行语义搜索。
