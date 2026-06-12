# 第5章：子图与模块化 — 拆分复杂 Agent

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解子图的设计思想** — 将复杂图拆分为可复用的模块
- **实现子图的嵌套和组合** — 子图作为节点嵌入主图
- **管理父子图之间的状态传递** — 状态映射和转换
- **构建模块化的 Agent 系统**

## 📋 前置知识

> 建议先完成：[第1章：LangGraph 核心概念](./01-core-concepts.md)

---

## 💡 核心概念

### 概念一：为什么需要子图？

**生活类比：** 一家大公司不会把所有部门放在一个房间里。研发部、市场部、财务部各自有自己的组织结构和流程，但通过接口（汇报、预算审批）互相协作。子图就是 Agent 系统中的「部门」。

```
没有子图的问题：

图太大：
  [节点A] → [节点B] → [节点C] → [节点D] → [节点E]
  → [节点F] → [节点G] → [节点H] → [节点I] → [节点J]

  20+ 个节点的图难以理解和维护 ❌

使用子图：

  主图：
    [研究子图] → [写作子图] → [审核子图]

  研究子图内部：
    [搜索] → [分析] → [整理]

  写作子图内部：
    [大纲] → [写作] → [润色]

  模块化、可复用、易维护 ✅
```

### 概念二：创建和使用子图

```typescript
// src/01-subgraph.ts
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

// ===== 子图 1：研究子图 =====
const ResearchState = Annotation.Root({
  query: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  findings: Annotation<string[]>({
    reducer: (p, c) => [...p, ...c],
    default: () => [],
  }),
  summary: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
});

async function searchNode(state: typeof ResearchState.State) {
  // 模拟搜索
  return { findings: [`关于"${state.query}"的搜索结果 1`, `搜索结果 2`] };
}

async function summarizeNode(state: typeof ResearchState.State) {
  const response = await model.invoke(`总结以下发现：${state.findings.join('\n')}`);
  return { summary: response.content as string };
}

const researchSubgraph = new StateGraph(ResearchState)
  .addNode('search', searchNode)
  .addNode('summarize', summarizeNode)
  .addEdge(START, 'search')
  .addEdge('search', 'summarize')
  .addEdge('summarize', END)
  .compile();

// ===== 子图 2：写作子图 =====
const WritingState = Annotation.Root({
  topic: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  research: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  draft: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  finalText: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
});

async function draftNode(state: typeof WritingState.State) {
  const response = await model.invoke(
    `基于以下研究资料，写一篇关于"${state.topic}"的文章：\n${state.research}`
  );
  return { draft: response.content as string };
}

async function polishNode(state: typeof WritingState.State) {
  const response = await model.invoke(`润色以下文章：\n${state.draft}`);
  return { finalText: response.content as string };
}

const writingSubgraph = new StateGraph(WritingState)
  .addNode('draft', draftNode)
  .addNode('polish', polishNode)
  .addEdge(START, 'draft')
  .addEdge('draft', 'polish')
  .addEdge('polish', END)
  .compile();

// ===== 主图：组合子图 =====
const MainState = Annotation.Root({
  topic: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  researchSummary: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  article: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
});

// 将子图包装为节点
async function researchNode(state: typeof MainState.State) {
  const result = await researchSubgraph.invoke({ query: state.topic });
  return { researchSummary: result.summary };
}

async function writingNode(state: typeof MainState.State) {
  const result = await writingSubgraph.invoke({
    topic: state.topic,
    research: state.researchSummary,
  });
  return { article: result.finalText };
}

const mainGraph = new StateGraph(MainState)
  .addNode('research', researchNode)
  .addNode('write', writingNode)
  .addEdge(START, 'research')
  .addEdge('research', 'write')
  .addEdge('write', END)
  .compile();

// 使用
const result = await mainGraph.invoke({ topic: 'Vue 3 Vapor Mode' });
console.log('📄 文章:', result.article.slice(0, 200));
```

### 概念三：状态映射

当子图的状态结构与主图不同时，需要做状态映射。

```typescript
// 子图状态 → 主图状态的映射
async function researchWithMapping(state: typeof MainState.State) {
  // 主图状态 → 子图输入
  const subInput = {
    query: state.topic,  // topic → query 的映射
  };

  const subResult = await researchSubgraph.invoke(subInput);

  // 子图输出 → 主图状态
  return {
    researchSummary: subResult.summary,  // summary → researchSummary 的映射
  };
}
```

---

## 🔨 实战演练

### 练习：构建模块化的内容创作系统

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// 三个子图：研究 → 写作 → 审核
// 研究子图：搜索 → 分析 → 整理
// 写作子图：大纲 → 写作 → 润色
// 审核子图：事实核查 → 风格检查 → 最终审批（可接入 human-in-the-loop）

const contentPipeline = new StateGraph(MainState)
  .addNode('research', researchNode)
  .addNode('write', writingNode)
  .addNode('review', reviewNode)
  .addEdge(START, 'research')
  .addEdge('research', 'write')
  .addEdge('write', 'review')
  .addEdge('review', END)
  .compile();
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：子图之间的状态共享

多个子图可以通过主图状态共享数据，避免重复计算。

```typescript
// 主图状态中定义共享缓存
const MainState = Annotation.Root({
  topic: Annotation<string>({ reducer: (_, c) => c }),
  sharedCache: Annotation<Record<string, any>>({
    reducer: (p, c) => ({ ...p, ...c }),
    default: () => ({}),
  }),
});

// 子图 1 写入缓存
async function researchNode(state) {
  const result = await researchSubgraph.invoke({ query: state.topic });
  return { sharedCache: { researchData: result } };
}

// 子图 2 读取缓存，无需重新搜索
async function writingNode(state) {
  const cached = state.sharedCache.researchData;
  // 直接使用缓存数据
}
```

### 技巧二：复用子图构建 Agent 工厂

通过工厂函数动态创建子图实例，每个实例使用不同的配置。

```typescript
function createResearchAgent(modelName: string, maxResults: number) {
  const model = new ChatAnthropic({ modelName });
  return new StateGraph(ResearchState)
    .addNode('search', searchNodeFactory(model))
    .addNode('analyze', analyzeNodeFactory(model, maxResults))
    .addEdge(START, 'search')
    .addEdge('search', 'analyze')
    .addEdge('analyze', END)
    .compile();
}
```

### 技巧三：深层嵌套子图的状态映射

当有多层子图嵌套时，使用映射函数链清晰传递数据。

```typescript
// 三层嵌套：主图 → 研究子图 → 搜索子子图
async function mappedResearchNode(state: typeof MainState.State) {
  // 主图状态 → 子图输入
  const subInput = mapMainToResearch(state);
  const subResult = await researchSubgraph.invoke(subInput);
  // 子图输出 → 主图状态
  return mapResearchToMain(subResult);
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：子图和普通节点有什么区别？**

> A：子图本身就是一个完整的 `StateGraph`，内部可以有多个节点和边。子图作为节点嵌入主图时，主图将其视为一个黑盒，只关心它的输入和输出状态。

**Q2：子图的状态如何与主图同步？**

> A：子图和主图各自维护独立的状态。主图在调用子图时手动做状态映射——将主图状态的字段传递给子图的输入参数，再将子图的输出结果写回主图状态。

**Q3：什么情况下应该使用子图？**

> A：当某个功能模块具有独立的状态、多个内部节点、或需要被多个图复用时，就应该拆分为子图。例如：独立的搜索模块、审核模块、数据处理管线等。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 子图编译时提示状态不匹配 | 子图的状态定义与传入的输入字段不一致 | 检查子图状态定义，确保传入的字段在子图状态中有对应的 reducer |
| 子图内部无限循环 | 子图的条件边缺少终止条件，导致在子图内部死循环 | 为子图添加 `recursionLimit` 或在条件边中提供明确的 `END` 出口 |
| 状态映射丢失数据 | 主图到子图的映射只传递了部分字段，其他字段被覆盖 | 使用展开运算符保留原始字段：`return { ...state, specificField: newValue }` |
| 子图修改了主图不应变的数据 | 子图内部的节点通过引用修改了共享对象 | 在子图边界做深拷贝，确保子图的修改不影响主图状态 |

---

## 📝 本章小结

- ✅ **子图** — 将复杂图拆分为可复用的模块
- ✅ **状态映射** — 主图和子图之间的数据转换
- ✅ **模块化设计** — 研究、写作、审核各自独立的子图

## ➡️ 下一章预告

> [第6章：Multi-Agent 系统](./06-multi-agent.md) — 多个 Agent 协作完成复杂任务。
