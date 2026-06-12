# 第3章：可观测性工具 — LangSmith 与 LangFuse

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Agent 可观测性的核心需求** — 追踪、调试、分析 Agent 行为
- **使用 LangSmith 追踪 Agent 调用链** — 记录 LLM 调用、工具调用、推理过程
- **使用 LangFuse 监控生产环境** — 实时监控 Agent 性能和质量

## 📋 前置知识

> 建议先完成：
> - [第1章：Agent 评估维度](./01-evaluation-dimensions.md) — 了解评估的六大维度
> - [第2章：自动化评估](./02-automated-eval.md) — 了解 LLM-as-Judge 评估模式

---

## 💡 核心概念

### 为什么要可观测性？

Agent 的「黑盒」问题：用户看到输入和输出，但中间发生了什么？LLM 调用了几次？工具调用成功了还是失败了？哪一步最耗时？

**生活类比：** 你的外卖到了，但迟了 1 小时。你不知道是餐厅做菜慢、外卖员取餐晚、还是路上堵车。可观测性就是给你的 Agent 装一个「行车记录仪」。

```typescript
// Agent 调用追踪基础结构
interface TraceSpan {
  name: string;           // 操作名称
  startTime: number;
  endTime?: number;
  input?: any;            // 输入
  output?: any;           // 输出
  error?: string;         // 错误信息
  metadata?: Record<string, unknown>;
  children: TraceSpan[];  // 子操作
}

class AgentTracer {
  private traces: TraceSpan[] = [];
  private currentSpan?: TraceSpan;

  startSpan(name: string, input?: any) {
    const span: TraceSpan = {
      name,
      startTime: Date.now(),
      children: [],
      input,
    };

    if (this.currentSpan) {
      this.currentSpan.children.push(span);
    } else {
      this.traces.push(span);
    }

    this.currentSpan = span;
  }

  endSpan(output?: any) {
    if (this.currentSpan) {
      this.currentSpan.endTime = Date.now();
      this.currentSpan.output = output;
      this.currentSpan = undefined; // 简化：只支持单层
    }
  }
}
```

### LangSmith 集成

```typescript
// 使用 LangSmith 追踪 LangChain Agent
import { Client } from 'langsmith';
import { traceable } from 'langsmith/traceable';

const client = new Client({
  apiKey: process.env.LANGSMITH_API_KEY,
  projectName: 'my-agent-project',
});

// 用 traceable 装饰 Agent 函数
const tracedAgent = traceable(
  async (input: string) => {
    const result = await agent.process(input);
    return result;
  },
  {
    name: 'agent-process',
    client,
    projectName: 'production',
    metadata: { version: '1.2.0' },
  }
);
```

### LangFuse 生产监控

```typescript
// LangFuse 集成
import Langfuse from 'langfuse';

const langfuse = new Langfuse({
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  baseUrl: process.env.LANGFUSE_HOST,
});

async function trackAgentCall(userId: string, input: string, output: string) {
  const trace = langfuse.trace({
    name: 'agent-call',
    userId,
    metadata: { input, output },
  });

  const generation = trace.generation({
    name: 'llm-call',
    model: 'claude-sonnet-4',
    input,
    output,
    usage: { promptTokens: 500, completionTokens: 200 },
  });

  await langfuse.flushAsync();
}
```

---

## 🔨 实战演练

### 练习：集成 LangSmith 追踪你的 Agent

**场景描述：** 你有一个处理客户问询的 Agent，需要接入 LangSmith 来追踪每次 Agent 调用的完整链路。

<details>
<summary>🧑‍💻 参考答案</summary>

```typescript
// integrate-langsmith.ts
import { Client } from 'langsmith'
import { traceable } from 'langsmith/traceable'

const client = new Client({
  apiKey: process.env.LANGSMITH_API_KEY,
  projectName: 'customer-support-agent',
})

// 1. 装饰整个 Agent 流程
const tracedAgent = traceable(
  async (input: { userId: string; query: string }) => {
    // 2. 追踪子步骤：LLM 调用
    const analysis = await analyzeQuery(input.query)

    // 3. 追踪子步骤：工具调用
    const customerData = await lookupCustomer(input.userId)
    const knowledgeBase = await searchKnowledgeBase(input.query)

    // 4. 追踪子步骤：生成回复
    const reply = await generateResponse(analysis, customerData, knowledgeBase)

    return { reply, metadata: { customerFound: !!customerData } }
  },
  {
    name: 'customer-support-flow',
    client,
    metadata: { version: '1.2.0', environment: 'staging' },
  }
)

// 使用
const result = await tracedAgent({ userId: '123', query: '如何重置密码？' })
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：自定义 Span 添加业务标签

```typescript
const trace = langfuse.trace({ name: 'agent-process' })
const span = trace.span({
  name: 'tool-call',
  metadata: {
    toolName: 'search_knowledge_base',
    query: 'reset password',
    resultCount: 5,
    latency: 320,  // ms
  },
})
span.end()
// 这些标签可以在 LangFuse Dashboard 中过滤和聚合
```

### 技巧二：成本追踪

```typescript
// 将 Token 消耗映射为成本数据
function trackCost(trace: any, model: string, promptTokens: number, completionTokens: number) {
  trace.generation({
    name: 'llm-call',
    model,
    usage: { promptTokens, completionTokens },
    metadata: {
      estimatedCost: calculateCost(model, promptTokens, completionTokens),
    },
  })
}
```

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 可观测性上报阻塞了主请求 | 同步等待 flushAsync() | 异步上报，不 await |
| 开发和生产环境的追踪数据混在一起 | 使用了相同的 projectName | 用环境变量区分 projectName |
| Span 嵌套层级错误 | 未正确管理 span 的 start/end | 使用 try/finally 确保 span.end() 一定执行 |
| 追踪了太多无关数据 | 把 console.log 级别的信息也上报了 | 只追踪 LLM 调用、工具调用、错误等关键事件 |

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：LangSmith 和 LangFuse 哪个更适合生产环境？**

> A：LangSmith 更适合开发和测试阶段的调试追踪，LangFuse 更适合生产环境的持续监控。LangFuse 提供了更多的生产监控功能（仪表盘、告警、成本分析）。最佳实践是两者都用——开发用 LangSmith，生产用 LangFuse。

**Q2：Agent 的可观测性和传统的应用监控有什么不同？**

> A：传统监控关注「请求→响应」的简单链路。Agent 监控需要追踪 LLM 调用（可能有多次）、工具调用链、推理步骤——这是一种树状追踪而非线性追踪。而且 Agent 的「正确性」需要语义评估而非简单的状态码判断。

</details>

---

## 📝 本章小结

- ✅ **Agent 可观测性** — 追踪 LLM 调用、工具调用、推理过程
- ✅ **LangSmith** — 开发阶段的调试追踪
- ✅ **LangFuse** — 生产环境的持续监控

## ➡️ 下一章预告

> [第4章：生产监控](./04-production-monitoring.md)
