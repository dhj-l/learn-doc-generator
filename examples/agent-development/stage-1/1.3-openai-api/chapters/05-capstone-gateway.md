# 第5章：综合实战 — 多模型 API 网关

> 预计学习时间：120-150 分钟

## 🎯 本章目标

综合运用前四章知识，构建一个完整的多模型 API 网关服务。

## 📋 前置知识

> 建议按顺序完成前四章内容：
> - [第1章：Chat Completions API](./01-chat-completions.md) — API 基础调用
> - [第2章：国产模型兼容接口](./02-compatible-models.md) — 了解多模型差异
> - [第3章：结构化输出](./03-structured-outputs.md) — 输出格式处理
> - [第4章：多模型网关设计](./04-multi-model-gateway.md) — 网关架构设计

---

## 💡 核心概念

### 概念一：网关的「统一接口」模式

**生活类比：** 你家里有各种电器——电视、空调、音响，每个都有自己的遥控器（不同 API）。多模型网关就像一个「万能遥控器」——把所有遥控功能集中到一个界面，你只需要按一个键就能控制所有设备。

```typescript
// 统一接口 — 无论后端是什么模型，前端看到的 API 都一样
interface GatewayChatParams {
  messages: Array<{ role: string; content: string }>;
  taskType: 'chat' | 'code' | 'analysis';  // 任务类型
  budget: 'low' | 'medium' | 'high';        // 预算
}

interface GatewayChatResult {
  provider: string;    // 实际调用的模型提供商
  model: string;       // 实际使用的模型
  response: any;       // 统一的响应格式
  cost: number;        // 本次调用花费
}
```

> **💡 为什么需要统一接口？** 没有统一接口时，前端代码要为每个模型写不同的 adapter（适配器）。多一个模型就要改一次前端。统一接口将适配逻辑下沉到网关层，前端永远只调用一个 API，后端新增模型时前端零改动。

### 概念二：智能路由的本质

网关的核心价值不是「转发请求」，而是「为每个请求选择最优的模型」：

```
         ┌──────────────┐
请求 ──► │   智能路由    │ ──► 简单问答 → 最便宜的模型
         │              │ ──► 代码生成 → 代码能力最强的模型
         │              │ ──► 深度分析 → 推理最强的模型
         └──────────────┘
```

> **💡 为什么路由比「用最强的模型」更好？** 让 Opus 回答「1+1=?」是对算力的浪费（成本高 10 倍）。80% 的日常请求用 Haiku 就能搞定。智能路由在不牺牲质量的前提下大幅降低成本——这是网关最重要的价值。

---

## 🔨 实战演练

### 完整项目结构

```
multi-model-gateway/
├── src/
│   ├── index.ts              # 入口
│   ├── gateway.ts            # 网关核心
│   ├── providers.ts          # 模型提供商配置
│   ├── router.ts             # 智能路由
│   ├── cache.ts              # 缓存层
│   ├── cost-tracker.ts       # 成本追踪
│   └── types.ts              # 类型定义
├── package.json
└── tsconfig.json
```

### 核心代码

<details>
<summary>🧑‍💻 先自己试写网关核心逻辑，再展开看参考答案</summary>

```typescript
// src/index.ts
import { LLMGateway } from './gateway';

async function demo() {
  const gateway = new LLMGateway([
    // 配置多个提供商（详见第4章）
  ]);

  // 场景 1：简单问答 — 自动选择便宜的模型
  console.log('--- 简单问答 ---');
  const r1 = await gateway.chat({
    messages: [{ role: 'user', content: '1+1=?' }],
    taskType: 'chat',
    budget: 'low',
  });
  console.log(`[${r1.provider}] ${r1.response.choices[0].message.content}`);

  // 场景 2：代码生成 — 自动选择代码能力强的模型
  console.log('\n--- 代码生成 ---');
  const r2 = await gateway.chat({
    messages: [{ role: 'user', content: '写一个二分查找算法（TypeScript）' }],
    taskType: 'code',
    budget: 'medium',
  });
  console.log(`[${r2.provider}] ${r2.response.choices[0].message.content?.substring(0, 200)}...`);

  // 场景 3：深度分析 — 自动选择高质量模型
  console.log('\n--- 深度分析 ---');
  const r3 = await gateway.chat({
    messages: [{ role: 'user', content: '分析微服务架构的优缺点' }],
    taskType: 'analysis',
    budget: 'high',
  });
  console.log(`[${r3.provider}] ${r3.response.choices[0].message.content?.substring(0, 200)}...`);

  // 查看成本统计
  console.log('\n📊 成本统计:', gateway.getStats());
}

demo().catch(console.error);
```

```typescript
// src/cost-tracker.ts

interface CostRecord {
  timestamp: number;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;       // 人民币
  taskType: string;
}

class CostTracker {
  private records: CostRecord[] = [];
  private dailyBudget: number;

  constructor(dailyBudget: number = 100) { // 默认日预算 100 元
    this.dailyBudget = dailyBudget;
  }

  record(entry: CostRecord) {
    this.records.push(entry);
  }

  // 检查是否超预算
  isOverBudget(): boolean {
    const today = new Date().toISOString().split('T')[0];
    const todayCost = this.records
      .filter(r => new Date(r.timestamp).toISOString().startsWith(today))
      .reduce((sum, r) => sum + r.cost, 0);
    return todayCost >= this.dailyBudget;
  }

  // 获取日报
  getDailyReport() {
    const byProvider: Record<string, number> = {};
    const byModel: Record<string, { requests: number; cost: number }> = {};

    for (const record of this.records) {
      byProvider[record.provider] = (byProvider[record.provider] || 0) + record.cost;
      const key = `${record.provider}/${record.model}`;
      if (!byModel[key]) byModel[key] = { requests: 0, cost: 0 };
      byModel[key].requests++;
      byModel[key].cost += record.cost;
    }

    return { byProvider, byModel, totalCost: this.records.reduce((s, r) => s + r.cost, 0) };
  }
}

export { CostTracker, CostRecord };
```

**预期输出：**
```
--- 简单问答 ---
[deepseek] 1+1=2
--- 代码生成 ---
[claude-sonnet] 以下是二分查找算法的 TypeScript 实现...
--- 深度分析 ---
[claude-opus] 微服务架构的优缺点分析...
📊 成本统计: { byProvider: { deepseek: 0.0003, 'claude-sonnet': 0.002, 'claude-opus': 0.01 }, totalCost: 0.0123 }
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：添加请求重试和指数退避

网关应该自动处理临时性失败（速率限制、服务端错误）：

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (attempt === maxRetries - 1) throw error;
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('重试耗尽');
}
```

### 技巧二：缓存相同请求结果

对于完全相同的请求（相同提问、相同参数），直接返回缓存结果，零成本：

```typescript
const responseCache = new Map<string, { result: any; expiresAt: number }>();

function getCachedResult(key: string): any | null {
  const cached = responseCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.result;
  responseCache.delete(key);
  return null;
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：多模型网关的核心价值是什么？**

> A：（1）统一接口——前端不需要适配不同模型的 API 差异；（2）智能路由——根据任务自动选择最优模型；（3）容错降级——主模型不可用时自动切换；（4）成本管理——统一的预算控制和成本追踪。

**Q2：如何设计模型降级策略？**

> A：按优先级排列候选模型列表。当主模型请求失败（超时、速率限制、服务不可用）时，按优先级尝试下一个模型。记录失败日志用于后续分析。

**Q3：网关如何在不影响体验的前提下节省成本？**

> A：通过智能路由。简单任务（分类、提取）路由到便宜模型（Haiku、DeepSeek），复杂任务（代码生成、推理）路由到高质量模型（Sonnet、Opus）。大约 70% 的日常请求可以用便宜模型处理，整体成本降低 50-70%。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 模型降级后返回格式不兼容 | 不同模型的应答结构不同 | 在网关层统一标准化响应格式 |
| 成本追踪不准（漏计或重复计） | 失败重试时重复计数 | 只在最终成功的请求上记录成本 |
| 路由策略过于简单（只用固定模型） | 没有根据任务类型动态选择 | 实现基于 taskType + budget 的多级路由策略 |
| 缓存命中率低 | 缓存键设计不合理（如包含随机参数） | 使用标准化后的请求参数作为缓存键 |
| 超时设置不当导致网关响应慢 | 向下游模型请求的超时等待过长 | 设置合理的超时（10-15 秒），超时后快速降级 |

---

## 📝 本章小结

- ✅ **完整网关实现** — 统一接口 + 智能路由 + 降级 + 成本控制
- ✅ **成本追踪** — 日维度、模型维度的成本统计
- ✅ **预算管理** — 自动检测超预算并阻止请求

## ➡️ 下一步

查看附录：[速查表](../appendix/cheatsheet.md) | [排错指南](../appendix/troubleshooting.md)

然后进入 [1.4 Embedding 与向量数据库](../../1.4-embedding-and-vector-database/README.md)
