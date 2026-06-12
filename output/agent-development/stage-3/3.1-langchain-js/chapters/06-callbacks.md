# 第6章：Callbacks 与调试 — 让 LLM 执行过程透明可见

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 LangChain 的 Callback 系统** — 事件驱动的执行监控
- **使用内置回调处理器** — ConsoleCallbackHandler、LangTracer
- **构建自定义回调** — Token 成本追踪、日志记录、性能监控
- **掌握流式事件处理** — 实时获取 LLM 输出
- **集成 LangSmith** — 专业的调试和可观测性平台

## 📋 前置知识

> 建议先完成：
> - [第1章：LangChain.js 概述](./01-introduction.md) — 理解 Chain 执行流程
> - [第2章：LCEL 链式调用](./02-lcel.md) — Runnable 和管道操作

---

## 💡 核心概念

### 概念一：为什么需要 Callback 系统？

**生活类比：** 你在厨房做一道复杂的菜。你不可能一直站在锅前盯着，而是装了几个"报警器"：
- 定时器响了 → 烤箱预热完成（handleLLMStart）
- 蒸汽报警器响了 → 水烧开了（handleLLMEnd）
- 烟雾报警器响了 → 菜糊了（handleLLMError）

Callback 系统就是 LLM 执行的"报警器"——它在链执行的各个阶段触发事件，让你了解执行状态。

```
没有 Callback：
  输入 → [黑箱] → 输出
  ❌ 不知道执行了多久
  ❌ 不知道花了多少 Token
  ❌ 出错了不知道原因

有 Callback：
  输入 → [透明管线] → 输出
  ✅ 知道每一步的耗时
  ✅ 精确统计 Token 用量
  ✅ 错误时有详细堆栈
```

### 概念二：Callback 事件生命周期

LangChain 的 Callback 系统定义了一系列事件，覆盖了 LLM 调用的完整生命周期：

```
prompt.invoke()
  ↓
on_chain_start       → 链开始执行
  ↓
on_llm_start         → LLM 开始生成
  ├── on_llm_new_token  → 每个新 Token（流式）
  └── on_llm_end      → LLM 生成完成
  ↓
on_chain_end         → 链执行完成

或（如果出错）：
on_llm_error         → LLM 调用出错
on_chain_error       → 链执行出错
```

### 概念三：ConsoleCallbackHandler — 最快速的内置调试工具

**生活类比：** ConsoleCallbackHandler 就像在汽车仪表盘上装了"透明底盘"——你开车时能直接看到路面和引擎的工作状态。它会把链的每一步都打印到控制台，适合开发调试。

```typescript
// src/01-console-callback.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ConsoleCallbackHandler } from '@langchain/core/tracers/console';

const model = new ChatAnthropic({
  modelName: 'claude-sonnet-4-5-20241022',
});

const prompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个{role}。用一句话回答。'],
  ['user', '{question}'],
]);

const parser = new StringOutputParser();
const chain = prompt.pipe(model).pipe(parser);

// 在 invoke 时传入 callbacks
const result = await chain.invoke(
  {
    role: '编程导师',
    question: '什么是回调函数？',
  },
  {
    callbacks: [new ConsoleCallbackHandler()],
  }
);

console.log(`\n📝 最终结果: ${result}`);
```

运行上述代码时，控制台会输出类似这样的详细日志：
```
[chain/start] [1:chain:...] {"id":["langchain","chains","RunnableSequence"]}
[chain/start] [1:chain:...] 输入: {"role":"编程导师","question":"什么是回调函数？"}
[chain/start] [2:prompt:...] 开始格式化模板...
[chain/end] [2:prompt:...] 输出: ChatPromptValue
[llm/start] [3:llm:...] 开始调用 LLM...
[llm/end] [3:llm:...] 完成, 输出 Token 数: 128
[chain/end] [1:chain:...] 链执行完成

📝 最终结果: 回调函数是一种通过函数参数传递、在特定事件发生时被调用的编程模式...
```

> **💡 ConsoleCallbackHandler 的局限**
>
> ConsoleCallbackHandler 会在控制台输出大量信息，适合开发阶段调试。但生产环境中日志过于冗长，应该替换为自定义的、更精简的回调处理器。

### 概念四：自定义 Callback — 精确控制监控内容

**生活类比：** 内置回调就像成品报税软件——功能全但不可定制。自定义回调就像自己用 Excel 做记账表——想记什么记什么，格式完全由你决定。

```typescript
// src/02-custom-callback.ts
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { Serialized } from '@langchain/core/load/serializable';

// 自定义回调：精确追踪 Token 使用和耗时
class TokenCostTracker extends BaseCallbackHandler {
  name = 'TokenCostTracker';

  private llmStartTime: Map<string, number> = new Map();
  private totalTokens: number = 0;
  private totalCost: number = 0;
  private llmCalls: number = 0;

  // Token 定价（每 1000 Token 的美元价格）
  private pricing: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-5-20241022': { input: 0.003, output: 0.015 },
    'claude-haiku': { input: 0.00025, output: 0.00125 },
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  };

  async handleLLMStart(llm: Serialized, prompts: string[]) {
    const runId = `llm-${Date.now()}`;
    this.llmStartTime.set(runId, Date.now());
    this.llmCalls++;

    const elapsed = Date.now() - this.llmStartTime.get(runId)!;

    console.log(`\n🚀 [LLM 调用 #${this.llmCalls}]`);
    console.log(`   模型: ${llm.name || '未知'}`);
    console.log(`   输入提示前 100 字符: ${prompts[0]?.slice(0, 100)}...`);
  }

  async handleLLMEnd(output: any) {
    const tokenUsage = output.llmOutput?.tokenUsage || {};
    const inputTokens = tokenUsage.promptTokens || 0;
    const outputTokens = tokenUsage.completionTokens || 0;
    const totalTokensForCall = tokenUsage.totalTokens || 0;

    const modelName = output.llmOutput?.model || 'unknown';
    const price = this.pricing[modelName] || { input: 0.001, output: 0.002 };
    const cost = (inputTokens / 1000) * price.input +
                 (outputTokens / 1000) * price.output;

    this.totalTokens += totalTokensForCall;
    this.totalCost += cost;

    console.log(`✅ [LLM 完成]`);
    console.log(`   Input Tokens: ${inputTokens}`);
    console.log(`   Output Tokens: ${outputTokens}`);
    console.log(`   本次费用: \$${cost.toFixed(6)}`);
    console.log(`   🌐 累计 Token: ${this.totalTokens}`);
    console.log(`   💰 累计费用: \$${this.totalCost.toFixed(6)}`);
  }

  async handleLLMError(error: Error) {
    console.error(`❌ [LLM 错误] ${error.message}`);
  }

  // 获取报告
  getReport() {
    return {
      totalLlmCalls: this.llmCalls,
      totalTokens: this.totalTokens,
      totalCostUSD: this.totalCost,
    };
  }
}

// 使用自定义回调
const tracker = new TokenCostTracker();

const chain = prompt.pipe(model).pipe(parser);

await chain.invoke(
  { role: '编程导师', question: '什么是递归？' },
  { callbacks: [tracker] }
);

await chain.invoke(
  { role: '哲学导师', question: '存在先于本质是什么意思？' },
  { callbacks: [tracker] }
);

// 打印汇总报告
const report = tracker.getReport();
console.log('\n' + '='.repeat(50));
console.log('📊 Token 使用报告');
console.log('='.repeat(50));
console.log(`总 LLM 调用次数: ${report.totalLlmCalls}`);
console.log(`总 Token 消耗: ${report.totalTokens}`);
console.log(`总费用: \$${report.totalCostUSD.toFixed(6)}`);
```

```
预期输出：
🚀 [LLM 调用 #1]
   模型: claude-sonnet-4-5-20241022
   输入提示前 100 字符: 你是一个编程导师。用一句话回答。...

✅ [LLM 完成]
   Input Tokens: 35
   Output Tokens: 120
   本次费用: $0.001905
   🌐 累计 Token: 155
   💰 累计费用: $0.001905

🚀 [LLM 调用 #2]
   模型: claude-sonnet-4-5-20241022
   输入提示前 100 字符: 你是一个哲学导师。用一句话回答。...

✅ [LLM 完成]
   Input Tokens: 38
   Output Tokens: 156
   本次费用: $0.002454
   🌐 累计 Token: 349
   💰 累计费用: $0.004359

==================================================
📊 Token 使用报告
==================================================
总 LLM 调用次数: 2
总 Token 消耗: 349
总费用: $0.004359
```

### 概念五：Callback 的传递方式

Callback 可以通过多种方式传递给 LangChain 组件：

```typescript
// 方式 1：在 invoke 时传入（推荐 — 最灵活）
await chain.invoke(input, {
  callbacks: [new ConsoleCallbackHandler()],
});

// 方式 2：在组件创建时传入（全局生效）
const modelWithCallbacks = new ChatAnthropic({
  modelName: 'claude-sonnet-4-5-20241022',
  callbacks: [new ConsoleCallbackHandler()],
});

// 方式 3：使用 RunnableConfig 传递
import { RunnableConfig } from '@langchain/core/runnables';

const config: RunnableConfig = {
  callbacks: [new ConsoleCallbackHandler()],
  metadata: {
    sessionId: 'session-123',
    userId: 'user-456',
  },
  tags: ['production', 'v2'],
};

await chain.invoke(input, config);

// 方式 4：全局 Callback Manager（不常用）
import { getCallbackManager } from '@langchain/core/callbacks/manager';
```

**为什么推荐方式 1？** 因为 Callback 的传递遵循**就近原则**：invoke 时传入的 Callback 优先级最高，会覆盖组件创建时设置的 Callback。这样你可以在不同调用中使用不同的 Callback——一次调试用 ConsoleCallbackHandler，下一次生产用自定义监控。

### 概念六：流式事件处理 — 实时获取 LLM 输出

**生活类比：** 传统调用就像一次性把水倒进桶里——你只能看到最后装满的状态。流式调用就像打开水龙头——你可以看着水慢慢流出来，每一滴都看得见。

```typescript
// src/03-streaming-events.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

const model = new ChatAnthropic({
  modelName: 'claude-sonnet-4-5-20241022',
  streaming: true,  // 开启流式输出
});

const prompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个故事讲述者。'],
  ['user', '请讲一个关于{subject}的短故事，不超过 100 字。'],
]);

const parser = new StringOutputParser();
const chain = prompt.pipe(model).pipe(parser);

// 方案 A：stream() — 逐 Token 输出
console.log('🎬 方案 A: stream()\n');

const stream = await chain.stream(
  { subject: '一只会编程的猫' },
  {
    callbacks: [{
      handleLLMNewToken: (token: string) => {
        // 每个 Token 到达时触发
        process.stdout.write(token);
      },
    }],
  }
);

// 收集完整输出
let fullOutput = '';
for await (const chunk of stream) {
  fullOutput += chunk;
}
console.log('\n\n📝 完整输出:', fullOutput);

// 方案 B：streamEvents() — 区分不同类型的事件
console.log('\n\n🎬 方案 B: streamEvents()\n');

const eventStream = await chain.streamEvents(
  { subject: '一只会写代码的猫' },
  { version: 'v2' }
);

for await (const event of eventStream) {
  switch (event.event) {
    case 'on_chat_model_start':
      console.log('🤖 LLM 开始生成...');
      break;

    case 'on_chat_model_stream':
      // 产出新的 Token 片段
      process.stdout.write(event.data?.chunk?.content || '');
      break;

    case 'on_chat_model_end':
      console.log('\n✅ LLM 生成完成');
      break;

    case 'on_chain_error':
      console.error(`❌ 链执行错误: ${event.data?.error?.message}`);
      break;
  }
}
```

> **💡 stream() vs streamEvents()**
>
> - `stream()` — 只输出最终结果（经过所有链组件），适合直接展示给用户
> - `streamEvents()` — 输出所有中间事件，适合调试和监控

### 概念七：LangSmith 集成 — 企业级调试平台

**生活类比：** ConsoleCallbackHandler 就像用记事本写日志，LangSmith 就像用专业的日志分析平台（如 Splunk 或 ELK）。它把每次链执行的所有信息（输入、输出、Token 用量、耗时、错误）自动上传到云端，提供可视化的分析和搜索界面。

```typescript
// src/04-langsmith.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

// LangSmith 自动集成
// 设置环境变量后，所有链执行会自动被追踪
// export LANGCHAIN_TRACING_V2=true
// export LANGCHAIN_API_KEY=ls_...
// export LANGCHAIN_PROJECT=my-rag-app

const model = new ChatAnthropic({
  modelName: 'claude-sonnet-4-5-20241022',
});

const prompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个{role}。回答要{style}。'],
  ['user', '{question}'],
]);

const chain = prompt.pipe(model).pipe(new StringOutputParser());

// 每次 invoke 都会自动上传追踪数据到 LangSmith
const result = await chain.invoke(
  {
    role: '技术导师',
    style: '简洁明了',
    question: '什么是 TypeScript 的装饰器？',
  },
  {
    // 添加自定义元数据，方便在 LangSmith 中搜索
    metadata: {
      user_id: 'user-123',
      session_id: 'session-abc',
      feature: 'qna',
    },
    tags: ['production', 'v2', 'typescript'],
  }
);

console.log(result);
```

**LangSmith 能告诉你什么？**

```
在 LangSmith 仪表板中，你可以看到每次运行的：
┌──────────────────────────────────────────────────┐
│  Run ID: abc-123-def-456                         │
│  ═══════════════════════════════════════════════  │
│  ▶ 输入: {"role":"技术导师","question":"什么是..."} │
│                                                  │
│  Chain: RunnableSequence                         │
│  ├── Prompt: ChatPromptTemplate                  │
│  │   └── 输出: ChatPromptValue (132 tokens)      │
│  ├── LLM: ChatAnthropic                          │
│  │   ├── 输入 Tokens: 132                        │
│  │   ├── 输出 Tokens: 245                        │
│  │   └── 延迟: 2.34s                             │
│  └── Parser: StringOutputParser                  │
│                                                  │
│  ▶ 输出: "装饰器是一种特殊类型的声明..."            │
│                                                  │
│  标签: production, v2, typescript                │
│  元数据: user_id=user-123, feature=qna           │
│  总耗时: 2.8s                                    │
│  总费用: $0.0038                                 │
└──────────────────────────────────────────────────┘
```

---

## 🔨 实战演练

### 练习：构建一个全功能的链监控系统

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/05-monitoring-system.ts
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Serialized } from '@langchain/core/load/serializable';

// 全功能监控回调
class ChainMonitor extends BaseCallbackHandler {
  name = 'ChainMonitor';

  private metrics = {
    chainStarts: 0,
    chainEnds: 0,
    chainErrors: 0,
    llmCalls: 0,
    totalTokens: 0,
    totalCost: 0,
    startTime: Date.now(),
    maxLatency: 0,
    totalLatency: 0,
  };

  private currentChainStart: number = 0;
  private currentChainName: string = '';

  async handleChainStart(chain: Serialized) {
    this.metrics.chainStarts++;
    this.currentChainStart = Date.now();
    this.currentChainName = chain.id?.[chain.id?.length - 1] || 'unknown';
    console.log(`\n🔗 [${this.currentChainName}] 开始执行`);
  }

  async handleChainEnd(output: any) {
    const latency = Date.now() - this.currentChainStart;
    this.metrics.chainEnds++;
    this.metrics.totalLatency += latency;
    this.metrics.maxLatency = Math.max(this.metrics.maxLatency, latency);

    console.log(`✅ [${this.currentChainName}] 完成 (${latency}ms)`);
    console.log(`   输出长度: ${JSON.stringify(output).length} 字符`);
  }

  async handleChainError(error: Error) {
    this.metrics.chainErrors++;
    console.error(`❌ [${this.currentChainName}] 错误: ${error.message}`);
  }

  async handleLLMStart(llm: Serialized, prompts: string[]) {
    this.metrics.llmCalls++;
    console.log(`  🤖 [LLM] 调用 #${this.metrics.llmCalls}`);
    console.log(`    输入长度: ${prompts[0]?.length || 0} 字符`);
  }

  async handleLLMEnd(output: any) {
    const usage = output.llmOutput?.tokenUsage || {};
    const inputT = usage.promptTokens || 0;
    const outputT = usage.completionTokens || 0;
    const totalT = usage.totalTokens || 0;

    this.metrics.totalTokens += totalT;
    this.metrics.totalCost += (inputT + outputT) * 0.000003; // 估算费率

    console.log(`  ✅ [LLM] 完成 (输入:${inputT} → 输出:${outputT} Tokens)`);
  }

  getSummary() {
    const elapsed = ((Date.now() - this.metrics.startTime) / 1000).toFixed(1);
    const avgLatency = this.metrics.chainEnds > 0
      ? (this.metrics.totalLatency / this.metrics.chainEnds).toFixed(0)
      : 'N/A';

    return {
      运行时长: `${elapsed}s`,
      链执行次数: this.metrics.chainStarts,
      链成功次数: this.metrics.chainEnds,
      链失败次数: this.metrics.chainErrors,
      LLM调用次数: this.metrics.llmCalls,
      总Token消耗: this.metrics.totalTokens,
      总费用估算: `$${this.metrics.totalCost.toFixed(6)}`,
      平均延迟: `${avgLatency}ms`,
      最大延迟: `${this.metrics.maxLatency}ms`,
    };
  }
}

// 使用监控系统
const monitor = new ChainMonitor();
const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });
const prompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个编程助手。用一句话回答。'],
  ['user', '{question}'],
]);

const chain = prompt.pipe(model).pipe(new StringOutputParser());

// 执行多个查询
const questions = [
  '什么是闭包？',
  'TypeScript 和 JavaScript 的区别？',
  '什么是 Promise？',
];

for (const question of questions) {
  try {
    const answer = await chain.invoke({ question }, { callbacks: [monitor] });
    console.log(`📝 回答: ${answer.slice(0, 100)}...\n`);
  } catch (error) {
    console.error(`❌ 查询失败: ${question}`);
  }
}

// 生成监控报告
console.log('\n' + '='.repeat(60));
console.log('📊 链执行监控报告');
console.log('='.repeat(60));
const summary = monitor.getSummary();
Object.entries(summary).forEach(([key, value]) => {
  console.log(`${key}: ${value}`);
});
console.log('='.repeat(60));
```

**预期输出：**
```
🔗 [RunnableSequence] 开始执行
  🤖 [LLM] 调用 #1
  ✅ [LLM] 完成 (输入:30 → 输出:85 Tokens)
✅ [RunnableSequence] 完成 (2340ms)
📝 回答: 闭包是函数与其词法环境的组合，使函数能访问外部函数的变量...

🔗 [RunnableSequence] 开始执行
  🤖 [LLM] 调用 #2
  ✅ [LLM] 完成 (输入:32 → 输出:120 Tokens)
✅ [RunnableSequence] 完成 (3100ms)
📝 回答: TypeScript 是 JavaScript 的超集...

🔗 [RunnableSequence] 开始执行
  🤖 [LLM] 调用 #3
  ✅ [LLM] 完成 (输入:28 → 输出:95 Tokens)
✅ [RunnableSequence] 完成 (2100ms)
📝 回答: Promise 是处理异步操作的对象...

============================================================
📊 链执行监控报告
============================================================
运行时长: 8.2s
链执行次数: 3
链成功次数: 3
链失败次数: 0
LLM调用次数: 3
总Token消耗: 390
总费用估算: $0.001170
平均延迟: 2513ms
最大延迟: 3100ms
============================================================
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：Callback 的继承和复用

```typescript
// 创建一个可复用的基础监控回调
class BaseMonitor extends BaseCallbackHandler {
  protected startTimes: Map<string, number> = new Map();

  protected markStart(id: string) {
    this.startTimes.set(id, Date.now());
  }

  protected getElapsed(id: string): number {
    const start = this.startTimes.get(id);
    return start ? Date.now() - start : 0;
  }
}

// 子类只需要关注特定的逻辑
class LatencyMonitor extends BaseMonitor {
  async handleLLMStart(llm: Serialized, prompts: string[]) {
    this.markStart('llm');
  }

  async handleLLMEnd(output: any) {
    const latency = this.getElapsed('llm');
    console.log(`⏱️ LLM 延迟: ${latency}ms`);
  }
}
```

### 技巧二：生产级别的 Callback 组合

```typescript
// 多个 Callback 可以同时使用
const result = await chain.invoke(input, {
  callbacks: [
    new TokenCostTracker(),      // Token 追踪
    new LatencyMonitor(),        // 延迟监控
    new ConsoleCallbackHandler(), // 调试日志（开发环境）
  ],
  metadata: { environment: process.env.NODE_ENV },
  tags: ['production'],
});
```

### 技巧三：在回调中收集流式 Token 用于成本估算

```typescript
class StreamingTokenCounter extends BaseCallbackHandler {
  private tokenCount: number = 0;

  async handleLLMNewToken(token: string) {
    // 每个新 Token 到达时计数
    // 注意：这里的"token"可能是字符块，不是精确的 LLM Token
    this.tokenCount += token.length / 4;  // 粗略估算
  }

  async handleLLMEnd(output: any) {
    const actualTokens = output.llmOutput?.tokenUsage?.completionTokens || 0;
    console.log(`估算 Tokens: ${Math.round(this.tokenCount)}, 实际: ${actualTokens}`);
    this.tokenCount = 0;  // 重置
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Callback 的 handleLLMStart、handleLLMEnd、handleChainStart、handleChainEnd 分别在什么时候触发？**

> A：`handleLLMStart` 在 LLM 模型开始生成响应时触发，`handleLLMEnd` 在 LLM 生成完成后触发。`handleChainStart` 在整条链开始执行时触发，`handleChainEnd` 在链执行完成时触发。注意：一条链可能调用多次 LLM，所以 chain 事件和 llm 事件是 1:N 的关系。

**Q2：ConsoleCallbackHandler 适合生产环境吗？**

> A：不适合。ConsoleCallbackHandler 会在控制台输出大量详细的调试信息，生产环境中会导致日志爆炸、性能下降。生产环境建议使用自定义的、精简的 Callback，或者使用 LangSmith 进行集中式日志管理。

**Q3：stream() 和 streamEvents() 有什么区别？**

> A：`stream()` 只输出经过所有链组件处理后的最终结果（例如经过 Parser 解析后的字符串）。`streamEvents()` 输出所有中间事件（包括链开始/结束、LLM 开始/结束、每个 Token 等），提供更细粒度的控制。

**Q4：如何将 Callback 传递给链？**

> A：有四种方式：（1）在 `invoke()` 的配置参数中传入（最灵活）；（2）在组件构造函数中传入（全局生效）；（3）使用 `RunnableConfig` 对象；（4）通过全局 CallbackManager。推荐使用方式 1，因为它允许为每次调用设置不同的回调。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `Callback handler not supported` | 使用了不兼容的 Callback 接口 | 确认继承自 `BaseCallbackHandler` 并使用正确的事件名称 |
| `handleLLMNewToken not called` | 模型未启用流式模式 | 设置 `streaming: true` 或确保模型支持流式输出 |
| `Duplicate run detected` | 同一个 Callback 被多次注册 | 检查是否在组件构造函数和 invoke 中重复传入了同一个 Callback 实例 |
| `Cannot read properties of undefined (reading 'tokenUsage')` | 某些模型不返回 tokenUsage | 使用可选链 `?.` 访问 Token 统计，或检查模型文档 |
| LangSmith: `401 Unauthorized` | LANGCHAIN_API_KEY 无效 | 检查 LangSmith API Key 是否正确设置 |

---

## 📝 本章小结

- ✅ **Callback 系统** — 事件驱动的 LLM 执行监控框架
- ✅ **ConsoleCallbackHandler** — 开发阶段的快速调试工具
- ✅ **自定义 Callback** — 继承 `BaseCallbackHandler` 实现自定义监控
- ✅ **Token 成本追踪** — 精确计算每次 LLM 调用的费用
- ✅ **流式事件处理** — `stream()` 和 `streamEvents()` 实时获取输出
- ✅ **Callback 传递** — invoke 时传入 vs 组件创建时传入
- ✅ **LangSmith 集成** — 企业级可观测性平台
- ✅ **多个 Callback 组合** — 同时使用多个监控器

## ➡️ 下一章预告

> 在下一章中，我们将综合运用前 6 章的知识，完成一个完整的 RAG 文档问答助手——包括文档加载、分割、向量化存储、检索、生成、流式输出、成本追踪和多轮对话功能。
> [第7章：综合实战 — 文档问答助手](./07-capstone-doc-qa.md)
