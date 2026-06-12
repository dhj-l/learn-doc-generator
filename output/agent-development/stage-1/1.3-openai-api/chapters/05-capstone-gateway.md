# 第5章：综合实战 — 多模型 API 网关

> 预计学习时间：120-150 分钟

## 🎯 本章目标

综合运用前四章知识，构建一个完整的多模型 API 网关服务。

---

## 🔨 项目实现

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

### 成本追踪器

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

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：多模型网关的核心价值是什么？**

> A：（1）统一接口——前端不需要适配不同模型的 API 差异；（2）智能路由——根据任务自动选择最优模型；（3）容错降级——主模型不可用时自动切换；（4）成本管理——统一的预算控制和成本追踪。

**Q2：如何设计模型降级策略？**

> A：按优先级排列候选模型列表。当主模型请求失败（超时、速率限制、服务不可用）时，按优先级尝试下一个模型。记录失败日志用于后续分析。

</details>

---

## 📝 本章小结

- ✅ **完整网关实现** — 统一接口 + 智能路由 + 降级 + 成本控制
- ✅ **成本追踪** — 日维度、模型维度的成本统计
- ✅ **预算管理** — 自动检测超预算并阻止请求

## ➡️ 下一步

查看附录：[速查表](../appendix/cheatsheet.md) | [排错指南](../appendix/troubleshooting.md)

然后进入 [1.4 Embedding 与向量数据库](../../1.4-embedding-and-vector-database/README.md)
