# 第5章：成本优化 — 降低 Agent 运行成本

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Agent 成本构成** — Token 消耗、API 调用、基础设施
- **实施成本优化策略** — 缓存、模型选择、Prompt 优化
- **建立成本监控和预警** — 防止成本失控

## 📋 前置知识

> 建议先完成：
> - [第4章：生产监控](./04-production-monitoring.md) — 了解生产环境监控的各项指标

---

## 💡 核心概念

### 成本构成

```
Agent 调用总成本 = 
  Σ(每次 LLM 调用的 Token 成本) + 
  Σ(工具调用 API 成本) + 
  基础设施成本（部署、存储）
```

#### 理解 AI 成本的关键：不是「贵不贵」，而是「值不值」

很多人第一次看到 AI API 的价格时会说：「好贵！一个请求就要几毛钱！」

但判断 AI 成本不能这么看。我一般从三个角度来理解：

**1. 边际成本：用得越多，单次越便宜**

AI 推理有一个很有意思的特性：**GPU 可以「拼车」**。

想象你叫了一辆能坐 10 个人的车。只坐你一个人是 100 块，坐满 10 个人也是 100 块——人均成本从 100 降到了 10 块。GPU 也是这样——它的核心计算架构（矩阵乘法）本来就是为并行设计的，同时处理 1 个请求和处理 8 个请求的耗时相差不大。

这就是为什么**批处理（Batching）**能省钱——把多个请求合并成一批发送，总成本基本不变，但每个请求的**边际成本**大幅降低。

```typescript
// 批处理 vs 单次调用的成本对比
function batchCostComparison(requestCount: number) {
  const singleCallCost = 0.01   // 单次调用 $0.01
  const batchCallCost = 0.025   // 批量调用 $0.025（不是 8 倍！）

  const singleTotal = requestCount * singleCallCost     // 8 × 0.01 = $0.08
  const batchTotal = batchCallCost + requestCount * 0   // 拼车费 $0.025，后续近乎免费

  return {
    single: singleTotal,
    batch: batchTotal,
    savings: ((singleTotal - batchTotal) / singleTotal * 100).toFixed(0) + '%',
  }
}
// 8 个请求：单次 $0.08 → 批处理 $0.025 → 节省 69%
```

**2. 机会成本：便宜的模型不一定真便宜**

这可能是最反直觉的一点。

Claude Haiku（便宜模型）每千 Token 的价格是 $0.00025，Claude Sonnet（贵模型）是 $0.003——Sonnet 贵了 12 倍。按说用 Haiku 肯定更省钱，对吧？

不一定。考虑这种情况：

```
用户请求：「分析一下这份 SaaS 产品的定价策略」

用 Haiku 的情况：
  第 1 轮：Haiku 给出了一个浅层的分析（漏掉了关键点）
  用户： 「再深入分析一下竞争对手的定价」
  第 2 轮：Haiku 补充了一些内容但不够具体
  用户： 「给我具体的数据」
  第 3 轮：...最终完成了

  总成本：3 轮 × 800 Token × $0.00025 = $0.0006

用 Sonnet 的情况：
  第 1 轮：Sonnet 一次性给出了完整的深度分析
  用户： 「好的，谢谢」
  完成。

  总成本：1 轮 × 1500 Token × $0.003 = $0.0045
```

咦？Sonnet 的单次成本确实比 Haiku 高，但如果 Sonnet 能**一轮搞定**而 Haiku 需要**多轮追问**，那总成本可能相差不大，而用户体验却是天壤之别。

这就是**机会成本**——便宜的模型可能需要更多的轮数，用户的时间也是成本。所以「模型分层」的逻辑不是「简单任务用便宜模型」，而是**「简单任务用便宜模型就能一轮搞定的，用便宜模型；复杂任务必须用贵模型才能一轮搞定的，用贵模型反而省钱」**。

**3. 缓存的经济学：一次生成，无限复用**

这是最简单的省钱方法——如果两个用户问了一模一样的问题，为什么要调两次 API？

缓存的命脉在于**命中率（Hit Rate）**：

- 命中率 0%：每次都要调 API，成本 = 100%
- 命中率 40%：40% 的请求不花钱，成本 = 60%
- 命中率 80%：80% 的请求不花钱，成本 = 20%

但缓存也有成本——**存储和隐私**。如果不加限制地缓存所有结果，存几个月后存储成本就高了。而且如果用户问了敏感信息（如「我的工资是多少」），缓存这个结果就有隐私风险。

我通常的建议是：**缓存公共知识类的问题（API 用法、文档查询），不缓存个性化问题（用户数据、隐私信息）。缓存时间不要超过 24 小时，因为信息可能过时。**

### 优化策略

```typescript
// 1. Token 缓存 — 避免重复生成相同内容
class TokenCache {
  private cache = new Map<string, { result: string; expiresAt: number }>();

  async getOrGenerate(key: string, generator: () => Promise<string>, ttl: number) {
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.result;
    }

    const result = await generator();
    this.cache.set(key, { result, expiresAt: Date.now() + ttl });
    return result;
  }
}

// 2. 模型分层 — 简单任务用小模型
const modelSelector = {
  'simple': 'claude-3-haiku',    // 分类、简单问答
  'medium': 'claude-sonnet-4',   // 分析、中等复杂度
  'complex': 'claude-opus-4',    // 代码生成、深度推理
};

function selectModel(taskComplexity: number): string {
  if (taskComplexity < 0.3) return modelSelector.simple;
  if (taskComplexity < 0.7) return modelSelector.medium;
  return modelSelector.complex;
}

// 3. Prompt 压缩
function compressMessages(messages: any[]): any[] {
  return messages.map(msg => ({
    ...msg,
    content: typeof msg.content === 'string'
      ? msg.content.replace(/\s+/g, ' ')  // 压缩空白
          .substring(0, 2000)              // 截断
      : msg.content,
  }));
}
```

---

## 🔨 实战演练

### 练习：实现成本监控面板

**场景描述：** 你的 Agent 每天处理 10000+ 次请求，AI API 成本每月超过 $5000。需要构建一个成本监控面板来追踪和优化支出。

<details>
<summary>🧑‍💻 参考答案</summary>

```typescript
// cost-monitor.ts
interface CostReport {
  date: string
  totalCost: number
  byModel: Record<string, number>
  byUser: Array<{ userId: string; cost: number; requestCount: number }>
  topExpensiveCalls: Array<{ query: string; cost: number; tokens: number }>
}

class CostMonitor {
  private dailyBudget: number

  constructor(dailyBudget: number) {
    this.dailyBudget = dailyBudget
  }

  async recordCall(call: {
    userId: string; model: string; promptTokens: number; completionTokens: number; query: string
  }) {
    const cost = calculateCost(call.model, call.promptTokens, call.completionTokens)
    await this.saveToDB({ ...call, cost, timestamp: new Date().toISOString() })
    await this.checkBudgetAlert(cost)
  }

  private async checkBudgetAlert(cost: number) {
    const todayTotal = await this.getTodayTotal()
    const usedPercent = (todayTotal / this.dailyBudget) * 100
    if (usedPercent > 80) await this.sendAlert(`⚠️ 今日成本已达预算的 ${usedPercent.toFixed(0)}%`)
    if (usedPercent > 95) await this.sendAlert(`🚨 今日成本即将超预算！`)
  }

  async findAnomalies() {
    const daily = await this.getDailyCosts()
    const avg = daily.reduce((s, d) => s + d, 0) / daily.length
    const stdDev = Math.sqrt(daily.reduce((s, d) => s + (d - avg) ** 2, 0) / daily.length)
    return daily.map((cost, i) => ({ date: i, cost, isAnomaly: cost > avg + 2 * stdDev })).filter(d => d.isAnomaly)
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：自动预算控制

```typescript
class AutoBudgetControl {
  private readonly TIERS = [
    { threshold: 0.5, model: 'claude-sonnet-4' },
    { threshold: 0.8, model: 'claude-3-haiku' },
    { threshold: 0.95, model: 'claude-3-haiku', cacheOnly: true },
  ]
  getCurrentTier(budgetUsed: number) {
    for (const tier of this.TIERS) {
      if (budgetUsed <= tier.threshold) return tier
    }
    return this.TIERS[this.TIERS.length - 1]
  }
}
```

### 技巧二：批量处理降成本

```typescript
async function batchProcess(requests: string[]) {
  const combined = requests.map((r, i) => `[${i}] ${r}`).join('\n')
  const response = await callLLM(`请依次回答以下问题：\n${combined}`)
  return parseBatchResponse(response)
}
// 批处理比独立调用的 Token 成本低 30-50%
```

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 低估系统 Prompt 的 Token 消耗 | 只统计了用户和助手消息 | 统计所有消息（含系统 prompt）的 Token |
| 缓存命中率低 | 缓存的 key 粒度过细（含时间戳） | 去除 key 中的动态部分，语义相近的问题映射到同一 key |
| 成本超预算后才收到告警 | 预算预警阈值设得太高 | 设置 80% 预警和 95% 紧急两个阈值 |
| 高峰期和低峰期用同一模型 | 没有利用非高峰时段的低成本资源 | 高峰期用快速模型，低峰期用便宜模型 |

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么小模型在简单任务上可能比大模型更好？**

> A：小模型的延迟更低、成本更低，而且对于简单任务（分类、提取），小模型的表现与大模型相当。用大模型做简单任务是「杀鸡用牛刀」，不仅成本高，还因为过度思考导致不必要的 Token 消耗。

**Q2：Token 缓存的最佳实践是什么？**

> A：缓存「确定性输出」（如代码模板、格式化输出），不缓存「需要创意的输出」。设置合理的 TTL（缓存过期时间），对于可能变化的数据（如实时信息）缓存时间要短。

</details>

---

## 📝 本章小结

- ✅ **成本构成** — Token + API + 基础设施
- ✅ **优化策略** — 缓存、模型分层、Prompt 压缩
- ✅ **成本监控** — 设置预算预警

## ➡️ 下一步

> 完成 Agent 评估与可观测性的学习后，进入 [阶段 5：综合实战](../stage-5/README.md)
