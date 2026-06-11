# 4.4 Agent 评估与可观测性 — 质量监控体系

> 🎯 **学习目标**：建立 Agent 质量评估和监控体系
> ⏱️ **预计学习时间**：6-8 小时

## 🗺️ 章节导航

| 章节 | 标题 |
|------|------|
| [第1章](./chapters/01-evaluation-dimensions.md) | Agent 评估维度 |
| [第2章](./chapters/02-automated-eval.md) | 自动化评估（LLM-as-Judge） |
| [第3章](./chapters/03-observability-tools.md) | 可观测性工具（LangSmith、LangFuse） |
| [第4章](./chapters/04-production-monitoring.md) | 生产监控 |
| [第5章](./chapters/05-cost-optimization.md) | 成本优化 |

### 评估维度

```typescript
interface AgentEvaluation {
  taskCompletion: number;     // 任务完成率 (0-1)
  reasoningQuality: number;   // 推理质量 (1-10)
  toolAccuracy: number;       // 工具使用准确率 (0-1)
  responseLatency: number;    // 响应延迟 (ms)
  tokenConsumption: number;   // Token 消耗
  userSatisfaction: number;   // 用户满意度 (1-5)
}
```

### LLM-as-Judge 评估

```typescript
async function evaluateWithLLM(
  question: string,
  answer: string,
  expectedBehavior: string
): Promise<{ score: number; feedback: string }> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `评估以下 AI 回答的质量（1-10）：
问题：${question}
回答：${answer}
期望行为：${expectedBehavior}
输出 JSON: {"score": N, "feedback": "..."}`
    }],
  });
  return JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '{}');
}
```
