# 第6章：Callbacks 与调试 — 监控和调试 LLM 应用

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Callback 系统的工作原理** — 在链的每个生命周期阶段插入自定义逻辑
- **实现自定义 Callback** — 日志、性能监控、Token 计数
- **使用 LangSmith 进行调试** — 可视化追踪链的执行过程
- **排查常见 LLM 应用问题** — 找出延迟瓶颈和错误根源

## 📋 前置知识

> 建议先完成：
> - [第2章：LCEL 链式调用](./02-lcel.md) — 理解链的执行模型

---

## 💡 核心概念

### 概念一：为什么需要 Callback？

**生活类比：** 想象你在组装一条流水线。流水线运行时，你看不到里面发生了什么——哪个步骤最慢？哪个步骤出了错？Callback 就是安装在流水线各个节点上的「监控摄像头」，让你随时了解运行状态。

```
没有 Callback 的痛点：

const result = await chain.invoke(input);
// 只看到最终结果，不知道：
// - 每一步花了多少时间？
// - Token 用了多少？
// - 检索到的文档是否相关？
// - 中间步骤的输出是什么？

有了 Callback：
✅ LLM 调用开始 → 输入 Prompt（320 tokens）
✅ LLM 调用完成 → 输出（150 tokens），耗时 2.3s
✅ 检索完成 → 返回 3 个文档
✅ 总耗时 2.8s
```

### 概念二：内置 Callback Handler

```typescript
// src/01-builtin-callbacks.ts
import { ConsoleCallbackHandler } from '@langchain/core/tracers/console';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });
const prompt = ChatPromptTemplate.fromTemplate('用一句话解释：{concept}');
const chain = prompt.pipe(model).pipe(new StringOutputParser());

// 方式 1：在调用时传入 Callback
const result = await chain.invoke(
  { concept: '闭包' },
  { callbacks: [new ConsoleCallbackHandler()] }  // 会在控制台输出详细日志
);

// 控制台输出类似：
// [chain/start] [chain:RunnableSequence] Entering Chain run with input: { concept: "闭包" }
// [prompt/start] [prompt:ChatPromptTemplate] Entering Prompt run
// [prompt/end] [prompt:ChatPromptTemplate] Exiting Prompt run
// [llm/start] [llm:ChatAnthropic] Entering LLM run with input: [...]
// [llm/end] [llm:ChatAnthropic] Exiting LLM run with output: AIMessage
// [parser/start] [parser:StringOutputParser] Entering Parser run
// [parser/end] [parser:StringOutputParser] Exiting Parser run
// [chain/end] [chain:RunnableSequence] Exiting Chain run with output: "闭包是..."
```

### 概念三：自定义 Callback Handler

```typescript
// src/02-custom-callback.ts
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { ChatAnthropic } from '@langchain/anthropic';

// 自定义性能监控 Callback
class PerformanceCallback extends BaseCallbackHandler {
  name = 'PerformanceCallback';
  private timings: Map<string, number> = new Map();
  private totalTokens = 0;

  // LLM 调用开始
  async handleLLMStart(llm: any, prompts: string[]) {
    this.timings.set('llm', Date.now());
    console.log(`🚀 [LLM] 开始调用`);
    console.log(`   输入长度: ${prompts[0]?.length || 0} 字符`);
  }

  // LLM 调用结束
  async handleLLMEnd(output: any) {
    const elapsed = Date.now() - (this.timings.get('llm') || Date.now());
    const tokens = output.llmOutput?.usage;
    if (tokens) {
      this.totalTokens += (tokens.input_tokens || 0) + (tokens.output_tokens || 0);
    }
    console.log(`✅ [LLM] 完成，耗时 ${elapsed}ms`);
    console.log(`   Token: ${tokens?.input_tokens || '?'} 输入 + ${tokens?.output_tokens || '?'} 输出`);
  }

  // LLM 出错
  async handleLLMError(error: Error) {
    console.error(`❌ [LLM] 错误: ${error.message}`);
  }

  // 链开始
  async handleChainStart(chain: any) {
    this.timings.set('chain', Date.now());
    console.log(`🔗 [Chain] 开始: ${chain.name || 'unnamed'}`);
  }

  // 链结束
  async handleChainEnd(output: any) {
    const elapsed = Date.now() - (this.timings.get('chain') || Date.now());
    console.log(`🔗 [Chain] 完成，总耗时 ${elapsed}ms`);
    console.log(`📊 总 Token 消耗: ${this.totalTokens}`);
  }

  // 获取报告
  getReport() {
    return {
      totalTokens: this.totalTokens,
    };
  }
}

// 使用
const perfCallback = new PerformanceCallback();
const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

const result = await model.invoke('什么是闭包？', {
  callbacks: [perfCallback],
});

console.log('\n📊 性能报告:', perfCallback.getReport());
```

```
预期输出：
🚀 [LLM] 开始调用
   输入长度: 15 字符
✅ [LLM] 完成，耗时 2341ms
   Token: 25 输入 + 120 输出
🔗 [Chain] 完成，总耗时 2341ms
📊 总 Token 消耗: 145

📊 性能报告: { totalTokens: 145 }
```

### 概念四：Token 成本追踪器

```typescript
// src/03-cost-tracker.ts
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';

// 模型定价（每百万 Token，美元）
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5-20241022': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

class CostTracker extends BaseCallbackHandler {
  name = 'CostTracker';
  private costs: Array<{ model: string; inputTokens: number; outputTokens: number; cost: number }> = [];

  async handleLLMEnd(output: any, runId: string, parentRunId?: string, tags?: string[], metadata?: any) {
    const modelName = output.llmOutput?.model || 'unknown';
    const inputTokens = output.llmOutput?.usage?.input_tokens || 0;
    const outputTokens = output.llmOutput?.usage?.output_tokens || 0;

    const pricing = MODEL_PRICING[modelName] || { input: 10, output: 30 };
    const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

    this.costs.push({ model: modelName, inputTokens, outputTokens, cost });
  }

  getTotalCost(): number {
    return this.costs.reduce((sum, c) => sum + c.cost, 0);
  }

  getReport(): string {
    const total = this.getTotalCost();
    const lines = this.costs.map((c, i) =>
      `  ${i + 1}. ${c.model}: ${c.inputTokens}+${c.outputTokens} tokens = $${c.cost.toFixed(6)}`
    );
    return `💰 成本报告\n${lines.join('\n')}\n  总计: $${total.toFixed(6)}`;
  }
}

// 使用
const costTracker = new CostTracker();
const chain = prompt.pipe(model).pipe(parser);

await chain.invoke({ question: '什么是闭包？' }, { callbacks: [costTracker] });
await chain.invoke({ question: '什么是递归？' }, { callbacks: [costTracker] });

console.log(costTracker.getReport());
```

```
预期输出：
💰 成本报告
  1. claude-sonnet-4-5-20241022: 30+150 tokens = $0.002340
  2. claude-sonnet-4-5-20241022: 28+130 tokens = $0.002034
  总计: $0.004374
```

### 概念五：LangSmith — 可视化调试平台

LangSmith 是 LangChain 官方的可观测性平台，可以在 Web 界面中查看链的完整执行过程。

```typescript
// src/04-langsmith.ts

// 1. 安装：npm install langsmith
// 2. 设置环境变量：
//    export LANGCHAIN_TRACING_V2=true
//    export LANGCHAIN_API_KEY="ls-..."
//    export LANGCHAIN_PROJECT="my-project"

// 设置好环境变量后，所有 LangChain 调用自动追踪到 LangSmith
// 无需修改代码！

import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });
const prompt = ChatPromptTemplate.fromTemplate('解释：{concept}');
const chain = prompt.pipe(model).pipe(new StringOutputParser());

// 正常调用 — 自动发送追踪数据到 LangSmith
const result = await chain.invoke({ concept: '闭包' });

// 在 LangSmith 控制台（smith.langchain.com）可以看到：
// - 链的执行流程图
// - 每一步的输入/输出
// - Token 使用量和延迟
// - 错误详情和堆栈
```

```bash
# 环境变量配置
export LANGCHAIN_TRACING_V2=true
export LANGCHAIN_API_KEY="ls_your_api_key"
export LANGCHAIN_PROJECT="agent-dev-learning"

# 或在 .env 文件中配置
echo 'LANGCHAIN_TRACING_V2=true' >> .env
echo 'LANGCHAIN_API_KEY=ls_your_api_key' >> .env
```

> **💡 LangSmith vs 自建 Callback**
>
> | 场景 | 推荐方案 |
> |------|----------|
> | 开发调试 | LangSmith（可视化、可回放） |
> | 生产监控 | 自建 Callback + Prometheus/Grafana |
> | 成本控制 | 自建 CostTracker Callback |
> | 快速原型 | ConsoleCallbackHandler |

### 概念六：流式事件追踪

```typescript
// src/05-stream-events.ts

// 使用 streamEvents 追踪链的执行过程
const eventStream = await chain.streamEvents(
  { concept: 'TypeScript 泛型' },
  { version: 'v2' }
);

for await (const event of eventStream) {
  switch (event.event) {
    case 'on_chat_model_stream':
      // LLM 流式输出的每个 Token
      process.stdout.write(event.data?.chunk?.content || '');
      break;
    case 'on_tool_start':
      // 工具开始执行
      console.log(`\n🔧 工具: ${event.name}`);
      break;
    case 'on_retriever_end':
      // 检索完成
      console.log(`\n📚 检索到 ${event.data?.output?.length || 0} 个文档`);
      break;
  }
}
```

---

## 🔨 实战演练

### 练习：构建一个带监控的 RAG 应用

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/monitored-rag.ts
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';

// 综合监控 Callback
class RagMonitor extends BaseCallbackHandler {
  name = 'RagMonitor';
  private logs: string[] = [];
  private startTime = 0;

  async handleChainStart(chain: any) {
    this.startTime = Date.now();
    this.log(`🔗 链开始: ${chain.name || 'RAG Chain'}`);
  }

  async handleRetrieverStart(retriever: any, query: string) {
    this.log(`🔍 开始检索: "${query}"`);
  }

  async handleRetrieverEnd(documents: any[]) {
    this.log(`📚 检索到 ${documents.length} 个文档`);
    documents.forEach((doc, i) => {
      this.log(`   [${i + 1}] ${doc.pageContent.slice(0, 60)}...`);
    });
  }

  async handleLLMStart(llm: any, prompts: string[]) {
    this.log(`🤖 LLM 开始 (输入 ${prompts[0]?.length || 0} 字符)`);
  }

  async handleLLMEnd(output: any) {
    const usage = output.llmOutput?.usage;
    this.log(`🤖 LLM 完成 (${usage?.input_tokens || '?'} + ${usage?.output_tokens || '?'} tokens)`);
  }

  async handleChainEnd() {
    this.log(`✅ 总耗时: ${Date.now() - this.startTime}ms`);
  }

  async handleChainError(error: Error) {
    this.log(`❌ 链错误: ${error.message}`);
  }

  private log(msg: string) {
    this.logs.push(`[${new Date().toISOString()}] ${msg}`);
    console.log(msg);
  }

  getReport() {
    return this.logs.join('\n');
  }
}

// 使用
const monitor = new RagMonitor();
// 将 monitor 传入链的 callbacks 中...
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：Callback 的层级继承

Callback Handler 支持层级继承。如果你在 `chain.invoke()` 的 `callbacks` 参数中传入 handler，它只对该次调用生效。如果是在模型或链的构造函数中传入，则全局生效。这种机制让你可以「顶层监控 + 局部覆盖」。

```typescript
// 全局日志 handler（记录所有调用）
const model = new ChatAnthropic({
  callbacks: [new ConsoleCallbackHandler()],
});

// 某次调用单独覆盖（不记录日志）
await chain.invoke({ question: 'hi' }, { callbacks: [] });
```

### 技巧二：成本分析与优化

利用 Token 追踪 callback，可以构建成本分析仪表盘：

```typescript
// 累积统计
const stats = costTracker.getStats();
console.log(`总 Token: ${stats.totalTokens}`);
console.log(`预估成本: \$${stats.totalCost.toFixed(4)}`);
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：BaseCallbackHandler 提供了哪些钩子方法？分别在什么时候触发？**

> A：handleLLMStart（LLM 开始调用时）、handleLLMEnd（LLM 完成时）、handleLLMError（LLM 报错时）、handleChainStart/End（链开始/完成时）、handleToolStart/End（工具调用时）、handleText（文本流式输出时）等。

**Q2：为什么 Callback 在调试和监控中很重要？**

> A：Callback 提供了非侵入式的观测能力，让你在不修改业务逻辑的前提下，记录每次 LLM 调用的输入、输出、耗时、Token 消耗等信息。这些数据对于调试、成本控制、性能优化都至关重要。

**Q3：全局 Callback 和局部 Callback 有什么区别？**

> A：全局 Callback 在组件构造函数中传入，对所有调用生效；局部 Callback 在 invoke() 调用时传入，只对该次调用生效。两者可以叠加使用——全局记录全部日志，局部添加特定的业务监控。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Callback is not a constructor` | 导入路径错误 | 检查 `@langchain/core/callbacks/base` |
| LangSmith 不显示数据 | 环境变量未设置 | 确认 `LANGCHAIN_TRACING_V2=true` |
| Callback 中的异步操作未完成 | 忘记 `await` | 确保所有 Callback 方法都是 async 的 |
| 流式事件中丢失数据 | 未处理所有事件类型 | 用 switch-case 处理每种 event 类型 |

---

## 📝 本章小结

- ✅ **Callback 系统** — 在链的每个生命周期阶段插入自定义逻辑
- ✅ **内置 Handler** — `ConsoleCallbackHandler` 快速调试
- ✅ **自定义 Callback** — 性能监控、Token 追踪、成本计算
- ✅ **LangSmith** — 官方可视化调试平台，设置环境变量即用
- ✅ **streamEvents** — 追踪流式执行的每一步

## ➡️ 下一章预告

> 在下一章中，我们将综合运用前 6 章所学的知识，构建一个完整的文档问答助手——一个生产级的 RAG 应用。
> [第7章：综合实战 — 文档问答助手](./07-capstone-doc-qa.md)
