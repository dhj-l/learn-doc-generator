# 第1章：Agent 评估维度 — 定义质量度量标准

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Agent 评估的六大关键维度** — 任务完成率、推理质量、工具准确性、响应延迟、Token 消耗、用户满意度
- **设计适合自己业务的评估指标** — 知道哪些指标重要、如何量化
- **建立评估基线（Baseline）** — 衡量改进是否有效的前提
- **区分离线评估和在线评估** — 开发阶段和生产阶段的不同评估策略

## 📋 前置知识

> 建议先完成阶段 1-3 的基础内容，了解 Agent 的基本工作原理。

---

## 💡 核心概念

### 为什么要评估 Agent？

**生活类比：** 如果你雇了一个助理，你会怎么判断他「干得好不好」？你会看：他交代的事情办完了吗（任务完成率）？他做事靠谱吗（工具准确性）？他速度快吗（响应延迟）？花费高吗（Token 消耗）？你满意吗（用户满意度）？

评估 Agent 不是在「找茬」，而是在回答一个关键问题：**Agent 真的帮到用户了吗？**

### 六大评估维度

```typescript
interface AgentEvaluation {
  // 1. 任务完成率 — Agent 能正确完成用户请求的百分比
  taskCompletionRate: number;

  // 2. 推理质量 — 思考过程的深度和准确性
  reasoningScore: number;

  // 3. 工具准确性 — 是否选择了正确的工具、传了正确的参数
  toolAccuracy: number;

  // 4. 响应延迟 — 从收到请求到返回响应的总时间
  totalLatency: number;      // ms
  thinkingLatency: number;  // LLM 推理时间
  toolLatency: number;      // 工具调用时间

  // 5. Token 消耗 — 每次调用的 Token 使用情况
  promptTokens: number;
  completionTokens: number;
  actualCalls: number;       // 实际 API 调用次数

  // 6. 用户满意度 — 用户给的反馈评分
  userRating: number;        // 1-5
  followUpRate: number;      // 需要追问的比例
}
```

**💡 为什么需要六个维度而不是一个？** 单一指标会误导优化方向。例如：只追求「任务完成率」→ Agent 会变得过度保守（只做简单任务）；只追求「低延迟」→ Agent 会跳过思考步骤。六个维度共同描绘 Agent 的真实质量画像。

### 离线评估 vs 在线评估

```typescript
// 离线评估：用预定义的数据集测试 Agent
class OfflineEvaluation {
  private testCases: Array<{
    input: string;
    expectedTool: string;
    expectedOutput: string;
  }>;

  async run(): Promise<EvaluationReport> {
    let correctTool = 0;
    let correctOutput = 0;

    for (const testCase of this.testCases) {
      const result = await agent.process(testCase.input);

      // 检查工具选择
      if (result.toolCalled === testCase.expectedTool) {
        correctTool++;
      }

      // 检查输出（使用语义匹配而非精确匹配）
      const isCorrect = await semanticMatch(testCase.expectedOutput, result.output);
      if (isCorrect) correctOutput++;
    }

    return {
      toolAccuracy: correctTool / this.testCases.length,
      outputAccuracy: correctOutput / this.testCases.length,
    };
  }
}

// 在线评估：监控生产环境中的真实用户交互
class OnlineEvaluation {
  private metrics = {
    totalRequests: 0,
    userRatings: [] as number[],
    errorCount: 0,
    averageLatency: 0,
  };

  trackRequest(startTime: number, success: boolean, rating?: number) {
    this.metrics.totalRequests++;
    this.metrics.averageLatency = (
      this.metrics.averageLatency * (this.metrics.totalRequests - 1) +
      (Date.now() - startTime)
    ) / this.metrics.totalRequests;

    if (!success) this.metrics.errorCount++;
    if (rating) this.metrics.userRatings.push(rating);
  }
}
```

### 建立评估基线

每次重大改动前，先跑一遍基线测试，记录当前数据：

```typescript
interface Baseline {
  version: string;
  date: string;
  metrics: {
    taskCompletionRate: 0.85;    // 85% 的任务成功完成
    averageLatency: 2500;         // 平均 2.5 秒
    averageTokens: 1500;          // 平均 1500 tokens
    toolAccuracy: 0.92;           // 92% 的工具调用正确
    userRating: 4.2;              // 4.2/5
  };
}
```

---

## ⚡ 进阶技巧

### 技巧一：加权评分

不同业务的评估维度权重不同，使用加权评分更合理：

```typescript
function weightedScore(metrics: AgentEvaluation, weights: Partial<AgentEvaluation>): number {
  let score = 0
  let totalWeight = 0
  for (const [key, weight] of Object.entries(weights)) {
    if (weight && metrics[key as keyof AgentEvaluation] !== undefined) {
      score += metrics[key as keyof AgentEvaluation]! * weight
      totalWeight += weight
    }
  }
  return totalWeight > 0 ? score / totalWeight : 0
}
// 客服场景：任务完成率权重 0.4，用户满意度权重 0.3
// 代码场景：工具准确率权重 0.4，推理质量权重 0.3
```

### 技巧二：回归测试自动化

```typescript
// 将基线测试集成到 CI/CD
async function runRegressionCheck() {
  const baseline = JSON.parse(await fs.readFile('baseline.json', 'utf-8'))
  const current = await runEvaluation()
  const regression = current.taskCompletionRate - baseline.taskCompletionRate
  if (regression < -0.05) {
    throw new Error(`任务完成率下降 ${Math.abs(regression) * 100}%，请检查变更`)
  }
}
```

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 只用「任务完成率」一个指标 | 单一指标容易被优化「作弊」 | 使用 6 个维度共同评估，防止指标作弊 |
| 离线测试集和生产数据分布不一致 | 测试集未及时从生产采样更新 | 每周从生产环境采样更新测试集 |
| 评估频率过高导致成本飙升 | 每次代码提交都跑全量评估 | 按变更影响范围分级：小变更跑子集，大变更跑全量 |
| 基线数据未版本化管理 | 无法回溯历史基线，看不清退化趋势 | 每次评估结果与 git commit 绑定存储 |

---

## 🔨 实战演练

<details>
<summary>🧑‍💻 实战：构建评估仪表盘</summary>

```typescript
// evaluation-dashboard.ts
interface EvalMetric {
  name: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  threshold: { warning: number; critical: number };
}

class AgentEvalDashboard {
  private metrics: EvalMetric[] = [];

  constructor() {
    this.metrics = [
      { name: '任务完成率', value: 0.87, unit: '%', trend: 'up',
        threshold: { warning: 0.8, critical: 0.6 } },
      { name: '平均延迟', value: 2100, unit: 'ms', trend: 'down',
        threshold: { warning: 3000, critical: 5000 } },
      { name: 'Token 消耗', value: 1450, unit: 'tokens', trend: 'stable',
        threshold: { warning: 2000, critical: 3000 } },
    ];
  }

  getStatus(): 'healthy' | 'warning' | 'critical' {
    const statuses = this.metrics.map(m => {
      if (m.trend === 'critical') return 'critical';
      // 简化逻辑
      return m.value >= m.threshold.warning ? 'healthy' : 'warning';
    });
    return statuses.includes('critical') ? 'critical'
      : statuses.includes('warning') ? 'warning'
      : 'healthy';
  }

  report(): string {
    return this.metrics.map(m =>
      `${m.name}: ${m.value}${m.unit} (${m.trend === 'up' ? '📈' : '📉'})`
    ).join('\n');
  }
}
```

</details>

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么「工具调用准确率」比「任务完成率」更容易测量？**

> A：任务完成是主观的——用户觉得「完成了」才算完成。工具调用是客观的——调用 A 工具还是 B 工具，参数是否正确，这些都是明确的。所以工具准确率适合自动化测试，任务完成率需要人工评估或 LLM-as-Judge。

**Q2：离线评估和在线评估的结果不一致怎么办？**

> A：这是常见情况。离线评估用的是固定数据集（可能过时），在线评估面对的是真实用户的多样化需求。解决方案：1) 定期更新离线数据集；2) 用在线数据补充离线数据集；3) 以在线评估的「用户满意度」为最终标准。

</details>

---

## 📝 本章小结

- ✅ **六大评估维度** — 任务完成率、推理质量、工具准确性、延迟、Token 消耗、用户满意度
- ✅ **离线 vs 在线评估** — 开发阶段用离线（自动化），生产阶段用在线（真实数据）
- ✅ **评估基线** — 每次改动前记录基线，衡量改进效果

## ➡️ 下一章预告

> [第2章：自动化评估 — LLM-as-Judge](./02-automated-eval.md)
