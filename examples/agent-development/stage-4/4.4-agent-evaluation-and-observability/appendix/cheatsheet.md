# 🚀 Agent 评估与可观测性 — API 速查表

> 按使用频率排序，每个 API 附带一行最简示例

---

## Agent 评估六大维度

```typescript
interface AgentEvaluation {
  taskCompletionRate: number;   // 任务完成率 (%)
  reasoningScore: number;       // 推理质量 (1-10)
  toolAccuracy: number;         // 工具准确率 (%)
  totalLatency: number;         // 响应延迟 (ms)
  promptTokens: number;         // 请求 Token 数
  completionTokens: number;     // 生成 Token 数
  userRating: number;           // 用户评分 (1-5)
  followUpRate: number;         // 追问率 (%)
}
```

## LLM-as-Judge 评估

```typescript
async function judgeResponse(question, answer, expected, config) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `评估以下回答。维度：${config.criteria}
评分标准：${config.rubric}
问题：${question}
期望：${expected}
回答：${answer}
输出 JSON: {"score": N, "feedback": "..."}`
    }],
  });
  return JSON.parse(response.content[0].text);
}
```

## 自动化评估流水线

```typescript
class AutoEvalPipeline {
  async loadTestCases(filePath: string) { /* 加载测试用例 */ }
  async runAll() { /* 批量评估，返回通过/总数 */ }
}
// 通过标准：score >= 7 (满分 10)
```

## 可观测性工具

| 工具 | 用途 | 核心 API |
|------|------|---------|
| LangSmith | 开发调试追踪 | `traceable(agentFn, { name, client })` |
| LangFuse | 生产监控 | `langfuse.trace({ name, userId })` / `trace.generation({ model, input, output })` |

## 生产监控指标

```typescript
interface ProductionMetrics {
  uptime: number;           // 可用率 (%)
  errorRate: number;        // 错误率 (%)
  p50Latency: number;       // 中位延迟
  p95Latency: number;       // 95 分位延迟
  p99Latency: number;       // 99 分位延迟
  totalRequests: number;    // 总请求数
  dailyCost: number;        // 每日成本
  avgCostPerRequest: number;// 平均每次请求成本
}
```

## 成本优化策略

| 策略 | 方法 |
|------|------|
| Token 缓存 | `cache.getOrGenerate(key, generator, ttl)` |
| 模型分层 | 简单任务用 `claude-3-haiku`，复杂用 `claude-sonnet-4` |
| Prompt 压缩 | 压缩空白、截断超长内容、复用系统 prompt |
| 批量处理 | 合并多个请求减少 API 调用次数 |
