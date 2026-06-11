# 第1章：LangChain.js 概述 — LLM 应用开发框架

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 LangChain 的定位和核心价值** — 知道它解决什么问题
- **掌握 Model、Prompt、Chain 三大核心概念** — 构建 LLM 应用的基础
- **使用 LangChain.js 调用 Claude 和 GPT** — 实际动手使用
- **理解 LangChain 生态系统的组成** — 知道各个包的作用

## 📋 前置知识

> 建议先完成：
> - [1.2 Claude API](../../stage-1/1.2-claude-api/README.md) — 理解 LLM API 调用
> - [1.3 OpenAI API](../../stage-1/1.3-openai-api/README.md) — 理解 Chat Completions API

---

## 💡 核心概念

### 概念一：LangChain 解决什么问题？

**生活类比：** 想象你要组装一台电脑。你可以一个一个零件买回来自己组装（直接用 LLM API），也可以买一个品牌机（使用 LangChain）。LangChain 就是 LLM 应用开发的「品牌机」——它把常用组件预装好了，你只需要配置和使用。

```
直接使用 LLM API 的痛点：

1. 模型切换困难
   → Claude 用 Anthropic SDK，GPT 用 OpenAI SDK，两套代码
   → LangChain：统一接口，一行代码切换模型

2. 组合能力繁琐
   → 想实现「Prompt + 模型 + 解析器」的管线，需要手写胶水代码
   → LangChain：LCEL 管道操作符，一行代码串联组件

3. 文档处理从零开始
   → 加载 PDF、分块、生成 Embedding、存入向量数据库，每一步都要自己写
   → LangChain：DocumentLoader + TextSplitter + VectorStore 开箱即用

4. 缺乏标准化
   → 每个项目都有自己的代码组织方式
   → LangChain：统一的组件接口和最佳实践
```

### 概念二：LangChain 生态系统

```
┌─────────────────────────────────────────────────┐
│                LangChain 生态                     │
├─────────────────────────────────────────────────┤
│                                                  │
│  @langchain/core      — 核心抽象和接口            │
│  langchain            — 主包，包含 Chains、Agents  │
│  @langchain/anthropic — Claude 集成               │
│  @langchain/openai    — OpenAI 集成               │
│  @langchain/community — 社区贡献的集成             │
│  @langchain/langgraph — Agent 工作流框架          │
│  langsmith            — 调试和可观测性平台         │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 概念三：安装和配置

```bash
# 基础安装
npm install langchain @langchain/core

# 选择模型提供商
npm install @langchain/anthropic   # Claude
npm install @langchain/openai      # GPT

# 可选：向量存储
npm install @langchain/community

# 环境变量
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
```

### 概念四：Model（模型）— 统一的 LLM 接口

```typescript
// src/01-models.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

// 初始化 Claude 模型
const claude = new ChatAnthropic({
  modelName: 'claude-sonnet-4-5-20241022',
  maxTokens: 1024,
  temperature: 0.7,
  // apiKey: 'sk-ant-...'  // 或使用环境变量 ANTHROPIC_API_KEY
});

// 初始化 OpenAI 模型
const gpt4 = new ChatOpenAI({
  modelName: 'gpt-4o',
  maxTokens: 1024,
  temperature: 0.7,
});

// 统一的调用方式
async function chatWithModel(model: any, question: string) {
  const response = await model.invoke([
    new SystemMessage('你是一个友好的编程助手，回答简洁明了。'),
    new HumanMessage(question),
  ]);

  console.log(`模型: ${model.modelName || model.model}`);
  console.log(`回答: ${response.content}`);
  console.log(`Token: ${response.usage_metadata?.total_tokens || '未知'}`);
  console.log('---');

  return response.content;
}

// 同一个问题，不同模型
await chatWithModel(claude, '什么是闭包？');
await chatWithModel(gpt4, '什么是闭包？');
```

```
预期输出：
模型: claude-sonnet-4-5-20241022
回答: 闭包是一个函数加上它创建时能访问的外部变量的组合。函数「记住」了它出生时的环境。
Token: 120
---
模型: gpt-4o
回答: 闭包是指函数能够访问其词法作用域中定义的变量，即使该函数在该作用域之外执行。
Token: 95
---
```

> **💡 核心价值：模型可替换**
>
> 使用 LangChain 的统一接口，你只需要改一行代码就能切换模型提供商。这在以下场景非常有用：
> - 开发时用便宜的模型，上线后切到高质量模型
> - Claude 不可用时自动降级到 GPT
> - 不同任务用不同模型（简单任务用 Haiku，复杂任务用 Opus）

### 概念五：Prompt Template — 参数化的提示词

```typescript
// src/02-prompt-template.ts
import { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } from '@langchain/core/prompts';

// 方式 1：简洁模板
const simplePrompt = ChatPromptTemplate.fromTemplate(
  '你是一个{role}专家。请用{style}的方式解释：{concept}'
);

// 方式 2：消息列表模板
const messagePrompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个{domain}领域的资深专家。'],
  ['user', '{question}'],
]);

// 方式 3：带上下文的 RAG 模板
const ragPrompt = ChatPromptTemplate.fromMessages([
  ['system', `你是一个知识库问答助手。基于以下参考资料回答问题。
如果资料不足，如实说明。

参考资料：
{context}`],
  ['user', '{question}'],
]);

// 使用模板
const formatted = await simplePrompt.invoke({
  role: 'TypeScript',
  style: '通俗易懂',
  concept: '泛型',
});
console.log(formatted);
// [SystemMessage("你是一个TypeScript专家"), HumanMessage("请用通俗易懂的方式解释：泛型")]
```

### 概念六：Chain — 组件串联

```typescript
// src/03-chain.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

// 创建提示模板
const prompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个{style}风格的{role}。'],
  ['user', '{question}'],
]);

// 创建输出解析器
const parser = new StringOutputParser();

// 串联成链（使用管道操作符 |）
const chain = prompt.pipe(model).pipe(parser);

// 执行链
const result = await chain.invoke({
  role: '编程导师',
  style: '幽默风趣',
  question: '什么是递归？',
});

console.log(result);
// "递归就是——想知道什么是递归，你得先知道什么是递归。开个玩笑！
//  递归就是一个函数在执行过程中调用自己。就像俄罗斯套娃，打开一个还有一个..."
```

### 概念七：Callback — 日志和监控

```typescript
// src/04-callbacks.ts
import { ConsoleCallbackHandler } from '@langchain/core/tracers/console';

// 使用内置的控制台日志
const chain = prompt.pipe(model).pipe(parser);

await chain.invoke(
  { role: '编程导师', style: '简洁', question: '什么是 TypeScript？' },
  { callbacks: [new ConsoleCallbackHandler()] }  // 会在控制台输出详细的执行日志
);

// 自定义回调
const customCallback = {
  handleLLMStart: async (llm: any, prompts: string[]) => {
    console.log(`🚀 LLM 开始调用，输入: ${prompts[0].slice(0, 100)}...`);
  },
  handleLLMEnd: async (output: any) => {
    console.log(`✅ LLM 完成，输出 Token: ${output.llmOutput?.tokenUsage?.totalTokens}`);
  },
  handleLLMError: async (error: Error) => {
    console.error(`❌ LLM 错误: ${error.message}`);
  },
};
```

---

## 🔨 实战演练

### 练习：构建一个模型切换器

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/model-switcher.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

// 模型注册表
const models = {
  'claude-sonnet': new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' }),
  'claude-haiku': new ChatAnthropic({ modelName: 'claude-haiku-4-5-20251001' }),
  'gpt-4o': new ChatOpenAI({ modelName: 'gpt-4o' }),
  'gpt-4o-mini': new ChatOpenAI({ modelName: 'gpt-4o-mini' }),
};

type ModelKey = keyof typeof models;

// 统一的提示模板
const prompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一个编程助手。用一句话回答。'],
  ['user', '{question}'],
]);

const parser = new StringOutputParser();

// 创建可切换的链
function createChain(modelKey: ModelKey) {
  return prompt.pipe(models[modelKey]).pipe(parser);
}

// 对比测试
async function compareModels(question: string, modelKeys: ModelKey[]) {
  console.log(`❓ 问题: ${question}\n`);

  for (const key of modelKeys) {
    const chain = createChain(key);
    const start = Date.now();
    const answer = await chain.invoke({ question });
    const elapsed = Date.now() - start;

    console.log(`🤖 ${key} (${elapsed}ms):`);
    console.log(`   ${answer}\n`);
  }
}

// 使用
await compareModels('什么是微服务架构？', ['claude-sonnet', 'gpt-4o']);
```

**预期输出：**
```
❓ 问题: 什么是微服务架构？

🤖 claude-sonnet (2300ms):
   微服务架构是一种将应用拆分为多个小型、独立部署的服务的架构风格，每个服务负责一个特定的业务功能。

🤖 gpt-4o (1800ms):
   微服务架构是一种软件架构模式，将大型应用分解为一组小型、松耦合的服务，每个服务独立开发和部署。
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：模型降级策略

```typescript
// 主模型失败时自动降级到备用模型
async function resilientChain(question: string) {
  const primary = createChain('claude-sonnet');
  const fallback = createChain('gpt-4o-mini');

  try {
    return await primary.invoke({ question });
  } catch (error) {
    console.warn('⚠️ Claude 调用失败，降级到 GPT-4o-mini');
    return await fallback.invoke({ question });
  }
}
```

### 技巧二：并行调用多个模型

```typescript
import { RunnableParallel } from '@langchain/core/runnables';

// 并行获取多个模型的回答
const parallelChain = RunnableParallel.from({
  claude: createChain('claude-sonnet'),
  gpt: createChain('gpt-4o'),
});

const results = await parallelChain.invoke({ question: '什么是闭包？' });
console.log('Claude:', results.claude);
console.log('GPT:', results.gpt);
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：LangChain 的核心价值是什么？**

> A：（1）统一接口——一套代码切换不同 LLM 提供商；（2）组件化——Prompt、Model、Parser、Retriever 等可组合的组件；（3）生态——集成文档加载、向量存储、Agent 等常用功能。

**Q2：LCEL 的管道操作符 `|` 是什么？**

> A：LCEL 的 `|` 操作符将多个 Runnable 组件串联成一个管线。前一个组件的输出自动作为后一个组件的输入。例如 `prompt.pipe(model).pipe(parser)` 意味着：模板渲染 → 模型调用 → 输出解析。

**Q3：什么时候应该用 LangChain，什么时候直接用原生 SDK？**

> A：简单场景（单个模型调用、一次性脚本）用原生 SDK 更直接。复杂场景（多模型切换、RAG 管线、Agent、文档处理）用 LangChain 可以大幅减少样板代码。

</details>

---

## 📝 本章小结

- ✅ **LangChain 定位** — LLM 应用开发框架，统一接口 + 组件化 + 生态
- ✅ **Model** — 统一的 LLM 调用接口，一行代码切换模型
- ✅ **Prompt Template** — 参数化的提示词管理
- ✅ **Chain** — 使用 `|` 管道操作符串联组件
- ✅ **Callback** — 执行过程的日志和监控
- ✅ **降级策略** — 主模型失败时自动切换备用模型

## ➡️ 下一章预告

> 在下一章中，我们将深入学习 LCEL（LangChain Expression Language）——LangChain 的核心编程范式，掌握并行执行、条件分支、流式处理等高级用法。
> [第2章：LCEL 链式调用](./02-lcel.md)
