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
