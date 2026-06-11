# Agent 架构速查表

---

## 🏗️ 三大经典架构

| 架构 | 核心思想 | 适用场景 | 复杂度 |
|------|----------|----------|--------|
| **ReAct** | 推理+行动交替 | 通用任务 | ⭐⭐ |
| **Plan-and-Execute** | 先规划后执行 | 复杂多步任务 | ⭐⭐⭐ |
| **Reflexion** | 尝试→评估→反思→重试 | 需要迭代改进的任务 | ⭐⭐⭐ |

## 🔄 ReAct 格式

```
Thought: [推理]
Action: [工具名(参数)]
Observation: [结果]
... 重复 ...
Thought: [总结]
Action: finish("答案")
```

## 📋 Plan-and-Execute 流程

```
1. Planner 生成计划
2. Executor 逐步执行
3. Observer 评估结果
4. Re-planner 调整计划（如需要）
```

## 🪞 Reflexion 流程

```
1. 尝试执行任务
2. 评估结果质量
3. 反思失败原因
4. 将反思加入上下文
5. 重新尝试（最多 N 次）
```

## 🏢 Multi-Agent 架构

| 架构 | 特点 | 适用 |
|------|------|------|
| Supervisor | 中央调度 | 任务分配明确 |
| Hierarchical | 层级管理 | 大型复杂系统 |
| Network | 对等协作 | 需要多角度分析 |

## ⚙️ Agent Loop 安全配置

```typescript
{
  maxIterations: 10,      // 最大循环次数
  maxTokens: 100000,      // Token 预算
  maxTime: 300000,        // 超时（5 分钟）
  retryCount: 3,          // 错误重试次数
  backoffMs: 1000,        // 退避起始时间
}
```
