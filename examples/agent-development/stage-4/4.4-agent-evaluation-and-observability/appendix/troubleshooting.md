# 🔧 Agent 评估与可观测性 — 常见问题排查

> 收集了 18 个 Agent 评估与可观测性中的常见错误及解决方案

---

## 1. LLM-as-Judge 评分不稳定

**错误信息：** 同一输入多次评估得到不同分数

**原因分析：** LLM 评估本身具有随机性，温度参数 > 0 导致结果不一致

**解决方案：** 设置 `temperature: 0`，并增加明确的评分标准（rubric）：

```typescript
const judge = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 500,
  temperature: 0, // 确定性输出
  messages: [{
    role: 'user',
    content: `严格按照以下评分标准打分：
- 10 分：完全正确且完整
- 7-9 分：正确但有小遗漏
- 4-6 分：部分正确
- 1-3 分：基本错误
输出仅包含 JSON。`
  }]
});
```

---

## 2. 评估指标过多导致优化方向混乱

**错误信息：** 团队同时优化 6 个指标，结果哪个都没做好

**原因分析：** 没有一个北极星指标，各指标之间存在权衡关系

**解决方案：** 确定一个核心指标（如「任务完成率」），其他指标作为约束条件：

```typescript
const constraints = {
  minCompletionRate: 0.85,  // 核心指标 ≥ 85%
  maxLatency: 5000,         // 约束：延迟 ≤ 5s
  maxCostPerCall: 0.05,     // 约束：成本 ≤ $0.05
  minUserRating: 3.5,       // 约束：评分 ≥ 3.5
};
```

---

## 3. 测试数据集过小导致评估不准确

**错误信息：** 评估结果 95%，但上线后实际表现只有 60%

**原因分析：** 测试集只有几十条，覆盖了有限的场景

**解决方案：** 使用多样化的测试集，确保覆盖边界情况：

```typescript
// 测试集应包含：
const testCases = [
  { type: 'happy_path',    count: 100 },  // 正常场景
  { type: 'edge_case',     count: 50 },   // 边界情况
  { type: 'error_input',   count: 50 },   // 异常输入
  { type: 'long_context',  count: 30 },   // 长上下文
  { type: 'multi_lang',    count: 20 },   // 多语言
];
// 总计 ≥ 250 条
```

---

## 4. LangSmith 追踪不到 Agent 调用

**错误信息：** LangSmith 面板中没有数据

**原因分析：** API Key 配置错误，或 wrap 的函数未正确导出

**解决方案：** 检查 LangSmith 客户端配置和 `traceable` 装饰器：

```typescript
const client = new Client({
  apiKey: process.env.LANGSMITH_API_KEY, // 确保已设置
  projectName: 'my-agent',
});
// 确保函数被 traceable 包裹
const tracedFn = traceable(myFunction, { client, name: 'my-agent-process' });
await tracedFn(input); // 不是直接调 myFunction
```

---

## 5. LangFuse 生产环境上报延迟高

**错误信息：** LangFuse 上报调用阻塞了主请求

**原因分析：** 同步等待 langfuse.flushAsync() 完成

**解决方案：** 异步上报，不阻塞主流程：

```typescript
async function trackAndContinue(input, output) {
  // 非阻塞上报
  langfuse.trace({ name: 'agent-call', input, output });
  // 不 await flushAsync，让它在后台执行
  langfuse.flushAsync().catch(console.warn);
}
```

---

## 6. Agent 追踪中的 Span 数据不完整

**错误信息：** Trace 中只有根 span，没有子 span

**原因分析：** 嵌套调用未正确创建子 span

**解决方案：** 确保每个子操作独立创建 span：

```typescript
const trace = langfuse.trace({ name: 'agent-process' });
const thinkSpan = trace.span({ name: 'thinking' });
// LLM 调用...
thinkSpan.end();
const toolSpan = trace.span({ name: 'tool-call' });
// 工具调用...
toolSpan.end();
```

---

## 7. 告警规则过于敏感

**错误信息：** 凌晨 3 点不断收到告警通知

**原因分析：** 单次异常即触发告警，未考虑持续时间和样本量

**解决方案：** 设置持续时间和最小样本量：

```typescript
const alertRule = {
  metric: 'errorRate',
  condition: '>',
  threshold: 0.05,       // 错误率 > 5%
  duration: 300,         // 持续 5 分钟
  minSamples: 100,       // 至少 100 个请求样本
  severity: 'warning',
};
```

---

## 8. 成本分析中 Token 统计不一致

**错误信息：** LangFuse 显示的成本与云账单差异很大

**原因分析：** Token 计数方式不同（prompt vs completion 计价不同）

**解决方案：** 使用模型官方的计价公式计算：

```typescript
function calculateCost(model: string, promptTokens: number, completionTokens: number) {
  const pricing = {
    'claude-sonnet-4':  { prompt: 3, completion: 15 }, // per 1K tokens
    'claude-3-haiku':   { prompt: 0.25, completion: 1.25 },
    'gpt-4o-mini':      { prompt: 0.15, completion: 0.6 },
  };
  const price = pricing[model] || pricing['claude-sonnet-4'];
  return (promptTokens * price.prompt + completionTokens * price.completion) / 1000;
}
```

---

## 9. 自动化评估流水线在 CI 中运行太慢

**错误信息：** 每次 CI 跑 250 条测试用例需要 20 分钟

**原因分析：** 串行执行所有测试用例，等待 LLM 逐个返回

**解决方案：** 并行执行 + 设置超时：

```typescript
async function runAllInParallel(testCases: TestCase[], concurrency = 5) {
  const results = [];
  const queue = [...testCases];
  const workers = Array(concurrency).fill(null).map(async () => {
    while (queue.length > 0) {
      const tc = queue.shift()!;
      results.push(await evaluateWithTimeout(tc, 30000));
    }
  });
  await Promise.all(workers);
  return results;
}
```

---

## 10. Agent 在评估中表现好但在生产中差

**错误信息：** 离线评估 90 分，上线后用户满意度只有 3/5

**原因分析：** 测试集与生产数据分布不一致（Distribution Shift）

**解决方案：** 定期从生产环境采样，更新测试集：

```typescript
// 每周从生产日志中随机抽取 50 条对话
async function refreshTestSet() {
  const productionSamples = await fetchProductionLogs({ days: 7, random: 50 });
  testCases = productionSamples.map(sample => ({
    input: sample.userMessage,
    expected: sample.expectedBehavior,
  }));
}
```

---

## 11. 监控仪表盘显示数据延迟

**错误信息：** Dashboard 上的数据比实际晚 1 小时

**原因分析：** 日志批量写入周期过长

**解决方案：** 缩短 flush 间隔：

```typescript
class AgentLogger {
  private flushInterval = 1000; // 从 5s 改为 1s
  private maxBufferSize = 50;   // 或缓冲区到 50 条就刷
}
```

---

## 12. 追踪数据中混入了测试流量

**错误信息：** 生产监控中包含了开发测试数据，导致指标失真

**原因分析：** 测试和生产的 API Key 或 projectName 相同

**解决方案：** 使用不同的 projectName 隔离环境：

```typescript
const client = new Client({
  apiKey: process.env.LANGSMITH_API_KEY,
  projectName: process.env.NODE_ENV === 'production' ? 'production' : 'development',
});
```

---

## 13. 用户反馈数据缺失

**错误信息：** 用户满意度指标一直是空的

**原因分析：** 前端未实现评价收集 UI

**解决方案：** 在每次 Agent 回复后植入简单的反馈组件：

```vue
<div class="feedback" v-if="!feedbackGiven">
  <button @click="rate(5)">😊</button>
  <button @click="rate(3)">😐</button>
  <button @click="rate(1)">😞</button>
</div>
```

---

## 14. 失败重试导致统计数据重复

**错误信息：** 请求量统计是实际请求的 2 倍

**原因分析：** 每次重试都记录了独立的请求计数

**解决方案：** 使用 requestId 去重：

```typescript
const requestId = crypto.randomUUID();
// 无论重试几次，requestId 不变
logAgentCall(requestId, { input, output, retryCount });
```

---

## 15. Token 消耗计量遗漏了系统 prompt

**错误信息：** 统计的 Token 消耗比账单少 20%

**原因分析：** 只统计了用户消息和助手回复，忽略了系统 prompt

**解决方案：** 统计时包含系统 prompt：

```typescript
const totalTokens = countTokens(systemPrompt) + countTokens(userMessages) + countTokens(assistantMessages);
```

---

## 16. 评估标准过于宽松导致 Agent 质量下降

**错误信息：** 评估通过率 95%，但用户明显感觉变差了

**原因分析：** 评分阈值设得太低（如 5/10），Agent 给出中等答案也能通过

**解决方案：** 提高通过阈值，增加关键维度权重：

```typescript
const passThreshold = 8; // 从 7 提高到 8
const weightedScore = 
  scores.taskCompletion * 0.4 +   // 任务完成权重最高
  scores.reasoning * 0.3 +        // 推理质量
  scores.toolAccuracy * 0.2 +     // 工具准确性
  scores.userSatisfaction * 0.1;  // 用户满意度
```

---

## 17. 生产环境 Agent 出现「退化」

**错误信息：** 上周评分 85，这周只剩 70

**原因分析：** 模型版本更新、提示词被无意修改、或数据分布变化

**解决方案：** 建立回归测试套件 + 版本对比：

```typescript
// 在 CI 中运行回归测试，与基线对比
const baseline = JSON.parse(await fs.readFile('eval-baseline.json'));
const current = await runEval();
const regression = current.score - baseline.score;
if (regression < -5) {
  throw new Error(`Agent 退化 ${Math.abs(regression)} 分，请检查变更`);
}
```

---

## 18. 可观测性工具本身成为故障点

**错误信息：** LangFuse 不可用导致主应用超时

**原因分析：** 可观测性工具的上报逻辑阻塞了主业务流程

**解决方案：** 使用断路器和超时保护：

```typescript
async function safeTrack(fn: () => Promise<void>, fallback: () => void) {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000)),
    ]);
  } catch {
    fallback(); // 降级：不追踪，只 console.warn
  }
}
```
