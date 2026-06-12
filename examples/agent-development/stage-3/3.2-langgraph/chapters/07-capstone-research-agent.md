# 第7章：综合实战 — 多 Agent 研究助手

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **综合运用 LangGraph 全部核心能力** — 有向图、子图、Multi-Agent、人机协作
- **构建生产级的多 Agent 研究系统** — Supervisor + 专家 Agent 架构
- **实现完整的研究→分析→写作→审核管线**

## 📋 前置知识

> 建议完成：[第1-6章](./01-core-concepts.md) 的所有内容

---

## 💡 项目概述

构建一个**技术研究助手**，可以：
1. 接受研究主题
2. Supervisor 规划研究步骤
3. 搜索 Agent 收集信息
4. 分析 Agent 整理和分析
5. 写作 Agent 撰写研究报告
6. 输出结构化的研究报告

```
┌──────────────────────────────────────────────────────┐
│                  研究助手架构                           │
├──────────────────────────────────────────────────────┤
│                                                       │
│  用户输入: "研究 AI Agent 的最新发展趋势"               │
│                                                       │
│  ┌─────────────┐                                     │
│  │  Supervisor  │  ← 制定研究计划，分配任务              │
│  └──────┬──────┘                                     │
│         │                                             │
│  ┌──────┴──────────────────────────┐                 │
│  ↓              ↓              ↓                     │
│ ┌──────┐   ┌──────────┐   ┌──────┐                  │
│ │搜索   │   │ 分析      │   │ 写作  │                  │
│ │Agent  │   │ Agent    │   │ Agent │                  │
│ └──────┘   └──────────┘   └──────┘                  │
│                                                       │
│  ┌─────────────┐                                     │
│  │   输出       │  ← 结构化研究报告                     │
│  └─────────────┘                                     │
└──────────────────────────────────────────────────────┘
```

---

## 🔨 实战演练

### 完整代码实现

```typescript
// src/research-assistant.ts
import { StateGraph, START, END, Annotation, MessagesAnnotation, MemorySaver } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { tool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

// ========== 1. 定义工具 ==========

const webSearchTool = tool(
  async ({ query }) => {
    // 实际项目中接入真实搜索 API
    const mockResults: Record<string, string> = {
      'AI Agent': '2024-2025年，AI Agent 成为最热门的技术趋势。主要框架包括 LangChain、CrewAI、AutoGen 等。多 Agent 协作、工具使用、记忆系统是三大核心技术。',
      'Multi-Agent': '多 Agent 系统正在从简单的顺序执行发展为复杂的协作网络。主要模式包括 Supervisor、Hierarchical 和 Network 模式。',
      'Agent Framework': '主流框架：LangChain/LangGraph（最成熟）、CrewAI（最易用）、AutoGen（微软出品）。选择标准：生态、社区、文档质量。',
    };
    const key = Object.keys(mockResults).find(k => query.includes(k));
    return key ? mockResults[key] : `搜索"${query}"的结果：相关技术文档和博客文章...`;
  },
  { name: 'web_search', description: '搜索互联网获取信息', schema: z.object({ query: z.string() }) }
);

// ========== 2. 构建专家 Agent ==========

const searchAgent = createReactAgent({
  llm: model,
  tools: [webSearchTool],
  messageModifier: `你是信息搜索专家。你的职责是搜索和整理信息。
使用 web_search 工具查找信息，然后整理成结构化的搜索结果。
每次搜索 2-3 个相关查询以确保覆盖面。用中文回答。`,
});

// ========== 3. 定义研究状态 ==========
const ResearchState = Annotation.Root({
  topic: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  messages: MessagesAnnotation.spec.reducer,
  researchPlan: Annotation<string[]>({
    reducer: (_, c) => c,
    default: () => [],
  }),
  searchResults: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  analysis: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  report: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  currentPhase: Annotation<string>({ reducer: (_, c) => c, default: () => 'plan' }),
});

// ========== 4. 节点实现 ==========

// 规划节点
async function planNode(state: typeof ResearchState.State) {
  console.log('\n📋 制定研究计划...');

  const prompt = ChatPromptTemplate.fromTemplate(
    `你是一个研究规划专家。为以下研究主题制定计划：

主题：{topic}

制定 3-5 个具体的研究步骤，每步是一个具体的搜索查询或分析任务。
返回编号列表。`
  );

  const chain = prompt.pipe(model).pipe(new StringOutputParser());
  const planText = await chain.invoke({ topic: state.topic });

  const steps = planText.split('\n')
    .filter(l => /^\d+\./.test(l.trim()))
    .map(l => l.replace(/^\d+\.\s*/, '').trim());

  steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

  return { researchPlan: steps, currentPhase: 'search' };
}

// 搜索节点
async function searchNode(state: typeof ResearchState.State) {
  console.log('\n🔍 搜索信息...');

  const result = await searchAgent.invoke({
    messages: [new HumanMessage(
      `研究主题：${state.topic}\n\n研究计划：\n${state.researchPlan.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n请执行所有搜索步骤，整理搜索结果。`
    )],
  });

  const lastMsg = result.messages[result.messages.length - 1];
  console.log('  ✅ 搜索完成');

  return {
    searchResults: lastMsg.content as string,
    currentPhase: 'analyze',
  };
}

// 分析节点
async function analyzeNode(state: typeof ResearchState.State) {
  console.log('\n📊 分析信息...');

  const prompt = ChatPromptTemplate.fromTemplate(
    `你是一个技术分析师。基于以下搜索结果，进行深入分析：

研究主题：{topic}

搜索结果：
{searchResults}

请分析：
1. 核心趋势和变化
2. 关键技术点
3. 对前端工程师的影响
4. 实际应用建议

用中文输出结构化分析。`
  );

  const chain = prompt.pipe(model).pipe(new StringOutputParser());
  const analysis = await chain.invoke({
    topic: state.topic,
    searchResults: state.searchResults,
  });

  console.log('  ✅ 分析完成');

  return { analysis, currentPhase: 'write' };
}

// 写作节点
async function writeNode(state: typeof ResearchState.State) {
  console.log('\n✍️ 撰写报告...');

  const prompt = ChatPromptTemplate.fromTemplate(
    `你是一个技术写作专家。基于以下分析结果，撰写一份研究报告：

研究主题：{topic}

分析结果：
{analysis}

报告结构：
1. 概述（100字）
2. 核心发现（300字）
3. 技术细节（500字）
4. 实践建议（200字）
5. 总结（100字）

用中文撰写，保持专业但易读的风格。`
  );

  const chain = prompt.pipe(model).pipe(new StringOutputParser());
  const report = await chain.invoke({
    topic: state.topic,
    analysis: state.analysis,
  });

  console.log('  ✅ 报告撰写完成');

  return { report, currentPhase: 'done' };
}

// ========== 5. 构建图 ==========
const graph = new StateGraph(ResearchState)
  .addNode('plan', planNode)
  .addNode('search', searchNode)
  .addNode('analyze', analyzeNode)
  .addNode('write', writeNode)
  .addEdge(START, 'plan')
  .addEdge('plan', 'search')
  .addEdge('search', 'analyze')
  .addEdge('analyze', 'write')
  .addEdge('write', END)
  .compile();

// ========== 6. 执行 ==========
async function main() {
  const topic = 'AI Agent 技术发展趋势（2024-2025）';

  console.log(`\n🔬 开始研究: ${topic}`);
  console.log('='.repeat(50));

  const result = await graph.invoke({
    topic,
    messages: [new HumanMessage(topic)],
  });

  console.log('\n' + '='.repeat(50));
  console.log('📄 研究报告：\n');
  console.log(result.report);
}

main().catch(console.error);
```

### 运行结果示例

```
🔬 开始研究: AI Agent 技术发展趋势（2024-2025）
==================================================

📋 制定研究计划...
  1. 搜索 AI Agent 最新发展动态
  2. 调研主流 Agent 框架对比
  3. 分析多 Agent 协作技术
  4. 了解 Agent 在前端的应用

🔍 搜索信息...
  ✅ 搜索完成

📊 分析信息...
  ✅ 分析完成

✍️ 撰写报告...
  ✅ 报告撰写完成

==================================================
📄 研究报告：

## AI Agent 技术发展趋势（2024-2025）

### 概述
AI Agent 已成为 2024-2025 年最重要的技术趋势...

### 核心发现
1. 多 Agent 协作成为主流
2. 工具使用能力不断增强
3. ...

### 技术细节
...

### 实践建议
...

### 总结
...
```

---

## ⚡ 进阶技巧

### 技巧一：生产级错误处理与重试

为每个关键节点添加重试机制和优雅降级，确保系统稳定性。

```typescript
async function resilientSearchNode(state: typeof ResearchState.State) {
  let retries = 3;
  while (retries > 0) {
    try {
      const result = await searchAgent.invoke({ messages: [...] });
      return { searchResults: result.messages[result.messages.length - 1].content };
    } catch (error) {
      retries--;
      if (retries === 0) {
        return { searchResults: `搜索失败，请手动重试：${error.message}` };
      }
      await new Promise(r => setTimeout(r, 1000)); // 退避等待
    }
  }
}
```

### 技巧二：流式输出研究报告

使用 `stream` 模式实时向用户展示进度，提升体验。

```typescript
const stream = await graph.stream({ topic, messages: [new HumanMessage(topic)] });

for await (const event of stream) {
  for (const [nodeName] of Object.entries(event)) {
    const progressMap: Record<string, string> = {
      plan: '📋 正在制定研究计划...',
      search: '🔍 正在搜索信息...',
      analyze: '📊 正在分析数据...',
      write: '✍️ 正在撰写报告...',
    };
    if (progressMap[nodeName]) {
      console.log(progressMap[nodeName]);
    }
  }
}
```

### 技巧三：研究报告分段缓存

对于长报告，分段生成并缓存，避免单次 Token 耗尽。

```typescript
async function cachedWriteNode(state: typeof ResearchState.State) {
  const sections = ['概述', '核心发现', '技术细节', '实践建议', '总结'];
  const reportParts: string[] = [];

  for (const section of sections) {
    const cached = await cache.get(`report:${state.topic}:${section}`);
    if (cached) {
      reportParts.push(cached);
    } else {
      const part = await generateSection(state, section);
      await cache.set(`report:${state.topic}:${section}`, part);
      reportParts.push(part);
    }
  }
  return { report: reportParts.join('\n\n') };
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么这个项目使用 Supervisor + 专家 Agent 而不是单一的 ReAct Agent？**

> A：单一 ReAct Agent 在处理复杂研究任务时容易丢失上下文、偏离主题。Supervisor + 专家 Agent 架构将研究过程分为规划、搜索、分析、写作四个独立阶段，每个阶段由专门的 Agent 处理，结果更可控、更可靠。

**Q2：研究助手中的 `currentPhase` 字段有什么作用？**

> A：`currentPhase` 跟踪当前执行阶段（plan → search → analyze → write → done），便于调试和进度展示。在实际项目中，还可以基于阶段状态做条件判断或错误恢复。

**Q3：如何将本系统扩展到更多 Agent？**

> A：可以在图中添加更多专家 Agent 节点，如代码审查 Agent、翻译 Agent、数据可视化 Agent。Supervisor 可以通过路由逻辑根据任务类型动态调度不同的专家组合。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 搜索 Agent 返回结果为空 | mock 数据中没有匹配的关键词，导致搜索函数返回空结果 | 添加默认搜索结果，并在 Agent 的系统提示中要求使用多个关键词搜索 |
| 报告阶段跳过了分析步骤 | `currentPhase` 的状态转换逻辑错误，导致从搜索直接跳到写作 | 在路由函数中显式检查 `currentPhase` 的值，确保严格按照 plan → search → analyze → write 的顺序执行 |
| 多次执行同一主题时结果不一致 | 每次执行从头开始，没有利用之前的研究成果 | 实现缓存机制，对相同主题的搜索结果和分析结果做持久化缓存 |
| 生成的报告结构不完整 | 写作节点的 prompt 中缺少对报告结构的严格约束 | 在 prompt 中提供明确的 Markdown 模板，并使用输出解析器确保结构完整性 |

---

## 📝 本章小结

- ✅ **完整的研究助手系统** — 从规划到输出的全流程
- ✅ **Supervisor + 专家 Agent** — 多 Agent 协作架构
- ✅ **子图设计** — 搜索 Agent 作为独立子图
- ✅ **四阶段管线** — 规划 → 搜索 → 分析 → 写作

## ➡️ 下一步

恭喜你完成了 LangGraph 的全部学习！接下来可以：
- 📘 [3.3 Vercel AI SDK](../3.3-vercel-ai-sdk/README.md) — 前端 AI 集成框架
- 📗 [3.4 MCP 协议](../3.4-mcp-model-context-protocol/README.md) — 模型上下文协议
- 📙 [3.5 CrewAI 与多 Agent](../3.5-crewai-and-multi-agent/README.md) — Python 多 Agent 框架
