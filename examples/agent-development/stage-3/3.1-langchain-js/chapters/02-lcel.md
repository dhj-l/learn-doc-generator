# 第2章：LCEL 链式调用 — LangChain 的核心编程范式

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **精通 LCEL 管道操作符 `|`** — 用一行代码串联多个组件
- **实现并行执行** — 同时调用多个模型或工具
- **构建条件分支** — 根据输入动态选择执行路径
- **使用流式处理** — 实时获取链的执行结果

## 📋 前置知识

> 建议先完成：[第1章：LangChain.js 概述](./01-introduction.md)

---

## 💡 核心概念

### 概念一：LCEL 是什么？

**生活类比：** LCEL 就像 Unix 的管道命令 `|`。`cat file | grep keyword | sort` 是把文件内容传给 grep 过滤再排序。LCEL 也一样：`prompt | model | parser` 是把提示词传给模型再解析输出。

```typescript
// LCEL 的核心思想：每个组件都是一个 Runnable
// Runnable 的接口：
interface Runnable<Input, Output> {
  invoke(input: Input): Promise<Output>;        // 单次调用
  batch(inputs: Input[]): Promise<Output[]>;     // 批量调用
  stream(input: Input): AsyncGenerator<Output>;  // 流式调用
  pipe<Next>(next: Runnable<Output, Next>): Runnable<Input, Next>;  // 管道连接
}
```

### 概念二：基础管道操作

```typescript
// src/01-basic-pipe.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });
const parser = new StringOutputParser();

// 创建提示模板
const prompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个{style}风格的{role}。'],
  ['user', '{question}'],
]);

// 方式 1：使用 .pipe() 方法
const chain1 = prompt.pipe(model).pipe(parser);

// 方式 2：等价写法（更直观）
const chain2 = prompt
  .pipe(model)       // 模板渲染结果 → 模型调用
  .pipe(parser);     // 模型响应 → 文本解析

// 执行链
const result = await chain2.invoke({
  role: '编程导师',
  style: '通俗易懂',
  question: '什么是闭包？',
});

console.log(result);
// "闭包就是一个函数和它出生时周围环境的组合。想象一下你的背包——
//  不管你走到哪里，背包里的东西都跟着你。闭包也是如此..."
```

### 概念三：RunnableParallel — 并行执行

**生活类比：** 你在餐厅同时点了主菜、汤和甜点，服务员同时通知厨房做三样东西——这就是并行执行。

```typescript
// src/02-parallel.ts
import { RunnableParallel, RunnablePassthrough } from '@langchain/core/runnables';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });
const parser = new StringOutputParser();

// 定义三个独立的分析链
const summaryPrompt = ChatPromptTemplate.fromTemplate('用一句话总结：{text}');
const keywordsPrompt = ChatPromptTemplate.fromTemplate('提取 5 个关键词：{text}');
const sentimentPrompt = ChatPromptTemplate.fromTemplate('判断情感倾向（正面/负面/中性）：{text}');

const summaryChain = summaryPrompt.pipe(model).pipe(parser);
const keywordsChain = keywordsPrompt.pipe(model).pipe(parser);
const sentimentChain = sentimentPrompt.pipe(model).pipe(parser);

// 并行执行三个链
const analysisChain = RunnableParallel.from({
  summary: summaryChain,
  keywords: keywordsChain,
  sentiment: sentimentChain,
});

// 一次调用，三个分析同时执行
const result = await analysisChain.invoke({
  text: 'React 18 引入了并发渲染特性，允许中断和恢复渲染任务。这是 React 自 Hooks 以来最大的架构改进，显著提升了大型应用的性能和用户体验。',
});

console.log('📝 摘要:', result.summary);
console.log('🏷️ 关键词:', result.keywords);
console.log('😊 情感:', result.sentiment);
```

```
预期输出：
📝 摘要: React 18 通过并发渲染特性实现了自 Hooks 以来最重要的架构改进。
🏷️ 关键词: React 18, 并发渲染, Hooks, 架构改进, 用户体验
😊 情感: 正面
```

> **💡 性能优势**
>
> `RunnableParallel` 会让三个链**同时执行**，总耗时等于最慢的那个链。如果串行执行，总耗时是三个链的总和。对于独立的分析任务，并行可以节省 2-3 倍时间。

### 概念四：RAG 管线实现

LCEL 天然适合构建 RAG 管线：

```typescript
// src/03-rag-pipe.ts
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });
const parser = new StringOutputParser();

const ragPrompt = ChatPromptTemplate.fromMessages([
  ['system', `基于以下上下文回答问题。如果上下文中没有相关信息，请说"我找不到相关信息"。

上下文：
{context}`],
  ['user', '{question}'],
]);

// RAG 管线
const ragChain = RunnableSequence.from([
  // 步骤 1：准备输入（检索文档 + 传递问题）
  {
    context: async (input: { question: string }) => {
      // 调用检索器获取相关文档
      const docs = await retriever.invoke(input.question);
      return docs.map((d: any) => d.pageContent).join('\n\n');
    },
    question: new RunnablePassthrough(),  // 直接传递原始输入
  },
  // 步骤 2：格式化提示
  ragPrompt,
  // 步骤 3：调用模型
  model,
  // 步骤 4：解析输出
  parser,
]);

const answer = await ragChain.invoke({ question: '什么是微服务架构？' });
console.log(answer);
```

### 概念五：条件分支

```typescript
// src/04-branch.ts
import { RunnableBranch, RunnableLambda } from '@langchain/core/runnables';

// 分类函数
const classifyQuestion = RunnableLambda.from(async (input: { question: string }) => {
  const q = input.question.toLowerCase();
  if (q.includes('代码') || q.includes('bug') || q.includes('实现')) return 'code';
  if (q.includes('架构') || q.includes('设计') || q.includes('选型')) return 'architecture';
  return 'general';
});

// 不同类型的处理链
const codeChain = codePrompt.pipe(model).pipe(parser);           // 代码问题
const archChain = architecturePrompt.pipe(model).pipe(parser);   // 架构问题
const generalChain = generalPrompt.pipe(model).pipe(parser);     // 通用问题

// 条件分支
const branchChain = RunnableBranch.from([
  // [条件, 链] 的数组
  [(input) => input.type === 'code', codeChain],
  [(input) => input.type === 'architecture', archChain],
  generalChain,  // 默认分支（最后一个元素）
]);

// 完整链：分类 → 分支处理
const fullChain = classifyQuestion.pipe(branchChain);
```

### 概念六：流式处理

```typescript
// src/05-streaming.ts

// 方式 1：使用 .stream() 方法
const stream = await chain.stream({
  role: '编程导师',
  style: '简洁',
  question: '什么是 TypeScript 泛型？',
});

for await (const chunk of stream) {
  process.stdout.write(chunk);  // 逐字输出
}
console.log('\n');

// 方式 2：并行链的流式输出
const parallelStream = await analysisChain.stream({
  text: '长文本...',
});

for await (const chunk of parallelStream) {
  // chunk 包含每个链的部分结果
  if (chunk.summary) process.stdout.write(`摘要: ${chunk.summary}`);
  if (chunk.keywords) process.stdout.write(`关键词: ${chunk.keywords}`);
}

// 方式 3：带事件的流式输出
const eventStream = await chain.streamEvents(
  { question: '什么是闭包？' },
  { version: 'v2' }
);

for await (const event of eventStream) {
  if (event.event === 'on_chat_model_stream') {
    process.stdout.write(event.data?.chunk?.content || '');
  } else if (event.event === 'on_tool_start') {
    console.log(`\n🔧 工具开始: ${event.name}`);
  }
}
```

### 概念七：错误处理和重试

```typescript
// src/06-retry.ts
import { RunnableWithFallbacks } from '@langchain/core/runnables';

// 主链（使用 Claude）
const primaryChain = claudePrompt.pipe(claudeModel).pipe(parser);

// 降级链（使用 GPT）
const fallbackChain = gptPrompt.pipe(gptModel).pipe(parser);

// 带降级的链
const chainWithFallback = primaryChain.withFallbacks([fallbackChain]);

// 带重试的链
const chainWithRetry = primaryChain.withRetry({
  stopAfterAttempt: 3,     // 最多重试 3 次
  waitBetween: 1000,       // 每次重试间隔 1 秒
});

// 使用
try {
  const result = await chainWithFallback.invoke({ question: '...' });
} catch (error) {
  console.error('主链和降级链都失败了:', error);
}
```

---

## 🔨 实战演练

### 练习：构建一个多步骤文档分析管线

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableParallel, RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });
const parser = new StringOutputParser();

// 步骤 1：文档摘要（并行执行 3 个分析）
const summaryPrompt = ChatPromptTemplate.fromTemplate('用 2-3 句话总结以下文档：\n\n{document}');
const keyPointsPrompt = ChatPromptTemplate.fromTemplate('提取以下文档的 3-5 个关键要点（编号列表）：\n\n{document}');
const audiencePrompt = ChatPromptTemplate.fromTemplate('判断以下文档的目标读者是谁（一句话）：\n\n{document}');

const documentAnalysis = RunnableParallel.from({
  summary: summaryPrompt.pipe(model).pipe(parser),
  keyPoints: keyPointsPrompt.pipe(model).pipe(parser),
  audience: audiencePrompt.pipe(model).pipe(parser),
});

// 步骤 2：基于分析结果生成行动计划
const actionPlanPrompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个项目经理。'],
  ['user', `基于以下文档分析结果，制定一个 3 步行动计划：

摘要：{summary}
关键要点：{keyPoints}
目标读者：{audience}

行动计划：`],
]);

const actionPlanChain = actionPlanPrompt.pipe(model).pipe(parser);

// 完整管线：分析 → 生成计划
const fullPipeline = RunnableSequence.from([
  // 第一阶段：文档分析（并行）
  {
    analysis: documentAnalysis,
    original: new RunnablePassthrough(),
  },
  // 第二阶段：将分析结果展平
  RunnableSequence.from([
    (input) => ({
      summary: input.analysis.summary,
      keyPoints: input.analysis.keyPoints,
      audience: input.analysis.audience,
    }),
    // 第三阶段：生成行动计划
    actionPlanChain,
  ]),
]);

// 使用
const result = await fullPipeline.invoke({
  document: `
  React Server Components 是 React 19 的重要特性。它们允许组件在服务端渲染，
  减少客户端 JavaScript 体积。与传统 SSR 不同，Server Components 永远不会发送
  到客户端。它们可以直接访问数据库、文件系统等服务端资源。
  
  适用场景：数据密集型页面、SEO 重要页面、初始加载性能要求高的应用。
  不适用场景：需要大量客户端交互的组件、使用浏览器 API 的组件。
  `,
});

console.log('📋 行动计划:');
console.log(result);
```

**预期输出：**
```
📋 行动计划:
基于文档分析，以下是 3 步行动计划：

1. **技术评估**（第 1 周）
   - 评估当前项目中哪些页面适合迁移到 Server Components
   - 重点关注数据密集型页面和 SEO 关键页面

2. **试点实施**（第 2-3 周）
   - 选择 2-3 个页面进行 Server Components 改造
   - 对比改造前后的 JS 体积和加载性能

3. **全面推广**（第 4 周）
   - 总结试点经验，制定迁移规范
   - 逐步推广到更多页面
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：RunnablePassthrough 的妙用

`RunnablePassthrough` 在 LCEL 链中扮演「透传」角色——它让数据不经修改地通过，同时可以作为分叉点让数据同时流向多条路径。结合 `.assign()` 方法，可以在不中断链条的情况下添加新字段。

```typescript
import { RunnablePassthrough, RunnableParallel } from '@langchain/core/runnables';

// 在链中透传原始输入，同时添加检索结果
const chain = RunnableParallel.from({
  question: new RunnablePassthrough(),
  context: retriever,
}).pipe(prompt).pipe(model).pipe(parser);
```

### 技巧二：LCEL 与 LangSmith 集成

所有 LCEL 链自动与 LangSmith 集成。只要设置了 `LANGCHAIN_API_KEY` 环境变量，每次 `chain.invoke()` 的输入、输出、中间步骤、延迟都会被自动记录。

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：LCEL 的管道操作符 `|` 和普通的函数组合有什么区别？**

> A：LCEL 的管道操作符让每个组件都成为 `Runnable`，自动获得 `.invoke()`、`.batch()`、`.stream()` 三种调用方式。普通函数组合需要手动处理异步、错误、流式等场景。此外，LCEL 还自动支持并行执行、序列化、LangSmith 追踪等能力。

**Q2：RunnableParallel 什么时候使用？**

> A：当你有多个独立的分析任务时。例如同时分析文本的情感、摘要、关键词——这些任务互不依赖，可以并行执行以节省时间。

**Q3：流式处理和非流式处理的区别是什么？**

> A：非流式处理等待模型生成完整回答后一次性返回，可能需要等待数秒。流式处理在模型生成每个 Token 时就立即返回，用户可以即时看到输出，体验更好。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 链的输出不是预期的格式 | 前一个 Runnable 的输出类型与下一个的输入不匹配 | 使用 `.pipe()` 或 `RunnablePassthrough` 转换类型 |
| 并行执行时共享状态导致错误 | RunnableParallel 的子任务修改了同一个外部变量 | 确保每个子任务使用独立的资源副本 |
| 流式输出时某些步骤阻塞 | 链中包含不支持流式的同步操作 | 使用 `.withStreaming()` 封装不支持流式的组件 |

---

## 📝 本章小结

- ✅ **管道操作符 `|`** — 将 Runnable 组件串联成管线
- ✅ **RunnableParallel** — 并行执行独立任务
- ✅ **RAG 管线** — 用 LCEL 构建检索增强生成
- ✅ **条件分支** — 根据输入动态选择执行路径
- ✅ **流式处理** — `.stream()` 实时获取结果
- ✅ **错误处理** — `.withFallbacks()` 降级 + `.withRetry()` 重试

## ➡️ 下一章预告

> [第3章：输出解析器](./03-output-parsers.md) — 让 LLM 输出结构化数据。
