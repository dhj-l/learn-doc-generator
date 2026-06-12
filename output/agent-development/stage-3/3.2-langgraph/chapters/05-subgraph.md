# 第5章：子图与模块化 — 复杂 Agent 的拆分艺术

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解子图（Subgraph）的概念** — 将大图分解为小图
- **实现子图的定义和组合** — 可复用的模块化 Agent
- **掌握父子图通信** — 状态在层级间的传递
- **设计可复用的子图模式** — 标准化的 Agent 模块

---

## 💡 为什么需要子图？

### 概念一：模块化的必要性

**生活类比：** 建造房子时，你不会用一块巨石雕刻出整栋房子，而是用砖块、预制板、门窗等标准件组装。每个标准件都有自己的功能，可以独立生产、测试和替换。子图就是 Agent 世界里的"标准件"。

```
没有子图（单体图）：所有节点硬编码在一个图中，无法复用

有了子图（模块化图）：
  main_agent
  ├── research_subgraph (可独立测试/复用)
  │   ├── search_node
  │   ├── analyze_node
  │   └── summarize_node
  └── writing_subgraph (可独立测试/复用)
      ├── outline_node
      ├── draft_node
      └── review_node
```

> **💡 为什么需要子图？**
>
> 1）**关注点分离** — 每个子图负责一个明确的功能领域；2）**可复用性** — 子图可在多个父图中重复使用；3）**可测试性** — 子图可独立测试，定位问题更快；4）**团队协作** — 不同团队并行开发不同子图；5）**版本管理** — 子图可独立升级和迭代。

---

## 🧱 子图基础

### 概念二：定义子图

子图本身也是一个完整的 `StateGraph`，拥有自己的状态、节点和边：

```typescript
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

// ============ 定义子图 ============

const SearchSubgraphState = Annotation.Root({
  query: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  searchResults: Annotation<string[]>({ reducer: (p: any, c: any) => [...p, ...c], default: () => [] }),
  currentBatch: Annotation<number>({ reducer: (p, c) => c, default: () => 0 }),
  status: Annotation<string>({ reducer: (_, c) => c, default: () => 'idle' }),
});
type SearchState = typeof SearchSubgraphState.State;

// 解析查询节点
async function parseQueryNode(state: SearchState) {
  const keywords = state.query.split('和').filter(k => k.trim());
  return { searchResults: keywords.map(k => `关键词: ${k.trim()}`), currentBatch: 0, status: 'searching' };
}

// 执行搜索节点
async function executeSearchNode(state: SearchState) {
  const keyword = state.searchResults[state.currentBatch];
  const result = `[搜索结果] ${keyword}: 找到相关结果...`;
  return { searchResults: [result], currentBatch: state.currentBatch + 1 };
}

// 路由：是否还有更多关键词
function routeSearch(state: SearchState): string {
  return state.currentBatch < state.searchResults.length ? 'search' : 'aggregate';
}

// 聚合节点
async function aggregateNode(state: SearchState) {
  return { status: 'completed' };
}

// 构建子图
const searchSubgraph = new StateGraph(SearchSubgraphState)
  .addNode('parse', parseQueryNode)
  .addNode('search', executeSearchNode)
  .addNode('aggregate', aggregateNode)
  .addEdge(START, 'parse')
  .addEdge('parse', 'search')
  .addConditionalEdges('search', routeSearch, { search: 'search', aggregate: 'aggregate' })
  .addEdge('aggregate', END)
  .compile();

// 子图可独立调用
// const result = await searchSubgraph.invoke({ query: '人工智能和机器学习' });
```

### 概念三：在主图中嵌入子图

```typescript
// ============ 主图状态 ============

const MainAgentState = Annotation.Root({
  messages: Annotation<any[]>({ reducer: (p: any, c: any) => [...p, ...c], default: () => [] }),
  currentQuery: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  researchResults: Annotation<string[]>({ reducer: (p: any, c: any) => [...p, ...c], default: () => [] }),
  finalAnswer: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
});
type MainState = typeof MainAgentState.State;

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

// 分析用户查询
async function queryAnalyzer(state: MainState) {
  const response = await model.invoke([
    new SystemMessage('提取用户问题中的搜索关键词。仅返回关键词。'),
    ...state.messages,
  ]);
  return { currentQuery: response.content as string };
}

// 将子图包装为节点
async function researchNode(state: MainState) {
  const subgraphResult = await searchSubgraph.invoke({ query: state.currentQuery });
  return { researchResults: subgraphResult.searchResults };
}

// 生成最终答案
async function answerGenerator(state: MainState) {
  const response = await model.invoke([
    new SystemMessage(`基于研究结果回答：${JSON.stringify(state.researchResults)}`),
    ...state.messages,
  ]);
  return { finalAnswer: response.content as string, messages: [new AIMessage(response.content as string)] };
}

// 构建主图
const mainGraph = new StateGraph(MainAgentState)
  .addNode('analyzer', queryAnalyzer)
  .addNode('researcher', researchNode)
  .addNode('answerer', answerGenerator)
  .addEdge(START, 'analyzer')
  .addEdge('analyzer', 'researcher')
  .addEdge('researcher', 'answerer')
  .addEdge('answerer', END)
  .compile();
```

---

## 🔗 子图高级用法

### 概念四：状态映射

当子图和主图状态结构不同时，需要做映射：

```typescript
// 子图状态：query / results
const SearchState = Annotation.Root({
  query: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  results: Annotation<string[]>({ reducer: (p: any, c: any) => [...p, ...c], default: () => [] }),
});

// 主图状态：searchQuery / searchResults
const MainState = Annotation.Root({
  messages: Annotation<any[]>({ reducer: (p: any, c: any) => [...p, ...c], default: () => [] }),
  searchQuery: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  searchResults: Annotation<string[]>({ reducer: (p: any, c: any) => [...p, ...c], default: () => [] }),
  answer: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
});

// 在包装函数中做映射
async function researchNodeWithMapping(state: typeof MainState.State) {
  // 主图 → 子图
  const subgraphOutput = await searchSubgraph.invoke({ query: state.searchQuery });
  // 子图 → 主图
  return { searchResults: subgraphOutput.results };
}
```

### 概念五：可复用子图工厂

```typescript
interface SearchConfig { maxResults: number; source: 'web' | 'kb'; language: 'zh' | 'en'; }

function createSearchSubgraph(config: SearchConfig) {
  const SState = Annotation.Root({
    query: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
    results: Annotation<string[]>({ reducer: (p: any, c: any) => [...p, ...c], default: () => [] }),
  });

  async function searchNode(state: typeof SState.State) {
    const result = `[${config.source}] ${state.query} (${config.language})`;
    return { results: [result] };
  }

  return new StateGraph(SState)
    .addNode('search', searchNode)
    .addEdge(START, 'search').addEdge('search', END)
    .compile();
}

// 创建不同配置的子图实例
const webSearch = createSearchSubgraph({ maxResults: 10, source: 'web', language: 'zh' });
const kbSearch = createSearchSubgraph({ maxResults: 5, source: 'kb', language: 'en' });
```

### 概念六：子图组合

```typescript
// 分析子图
const analysisSubgraph = new StateGraph(Annotation.Root({
  data: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  analysis: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
}))
  .addNode('analyze', async (s) => ({ analysis: `分析: ${s.data}` }))
  .addEdge(START, 'analyze').addEdge('analyze', END).compile();

// 组合：搜索 → 分析
async function pipeline(state: any) {
  const search = await webSearch.invoke({ query: state.query });
  const analysis = await analysisSubgraph.invoke({ data: search.results[0] });
  return { result: analysis.analysis };
}
```

---

## 🔨 实战演练：模块化写作助手

```typescript
// 子图1：资料收集
const ResearchSubState = Annotation.Root({
  topic: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  sources: Annotation<string[]>({ reducer: (p: any, c: any) => [...p, ...c], default: () => [] }),
  summary: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
});

const researchSubgraph = new StateGraph(ResearchSubState)
  .addNode('collect', async (s) => ({
    sources: [`来源1: ${s.topic} 论文`, `来源2: ${s.topic} 博客`, `来源3: ${s.topic} 报告`],
  }))
  .addNode('summarize', async (s) => ({ summary: `关于"${s.topic}"的研究摘要...` }))
  .addEdge(START, 'collect').addEdge('collect', 'summarize').addEdge('summarize', END).compile();

// 子图2：文章生成
const WritingSubState = Annotation.Root({
  topic: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  material: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  article: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
});

const writingSubgraph = new StateGraph(WritingSubState)
  .addNode('outline', async (s) => ({ outline: ['引言', '原理', '进展', '展望', '结论'] }))
  .addNode('draft', async (s) => ({ article: `# ${s.topic}\n\n${s.material.slice(0, 100)}...` }))
  .addEdge(START, 'outline').addEdge('outline', 'draft').addEdge('draft', END).compile();

// 子图3：质量审核
const ReviewSubState = Annotation.Root({
  article: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  approved: Annotation<boolean>({ reducer: (_, c) => c, default: () => false }),
});

const reviewSubgraph = new StateGraph(ReviewSubState)
  .addNode('check', async (s) => ({ approved: s.article.length > 50 }))
  .addEdge(START, 'check').addEdge('check', END).compile();

// 主图组合
const WritingAgentState = Annotation.Root({
  topic: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  researchSummary: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  article: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  finalArticle: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
});

const writingAgent = new StateGraph(WritingAgentState)
  .addNode('research', async (s) => {
    const r = await researchSubgraph.invoke({ topic: s.topic });
    return { researchSummary: r.summary, sources: r.sources };
  })
  .addNode('write', async (s) => {
    const r = await writingSubgraph.invoke({ topic: s.topic, material: s.researchSummary });
    return { article: r.article };
  })
  .addNode('review', async (s) => {
    const r = await reviewSubgraph.invoke({ article: s.article });
    return { finalArticle: r.approved ? s.article : s.article + '\n[需修改]' };
  })
  .addEdge(START, 'research').addEdge('research', 'write')
  .addEdge('write', 'review').addEdge('review', END).compile();

const result = await writingAgent.invoke({ topic: '量子计算在金融领域的应用' });
console.log('最终文章:', result.finalArticle);
```

---

## ⚠️ 常见陷阱与最佳实践

| 陷阱 | 解决方案 |
|------|----------|
| 子图状态与主图混淆 | 明确划分职责，子图只关心内部状态，通过映射转换 |
| 子图过于庞大 | 遵循单一职责原则，一个子图只做一件事 |
| 子图间隐式依赖 | 通过主图显式编排子图的执行顺序和数据传递 |
| 忽略子图错误处理 | 每个子图独立处理自己的错误，通过状态传递 |
| 子图嵌套过深 | 限制2-3层，保持图结构可读 |

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：子图和普通节点的区别？**

> A：子图本身是一个完整的 StateGraph，拥有自己的状态、节点和边，可独立编译执行。普通节点只是一个处理函数。子图可独立测试、复用和版本管理。

**Q2：子图如何与主图共享状态？**

> A：子图有自己的独立状态。主图通过包装函数做状态映射：将主图状态字段传递给子图，子图执行完后将结果写回主图。

**Q3：何时应该用子图而非普通节点？**

> A：1）功能模块需要在多个 Agent 中复用；2）功能内部有复杂执行逻辑（多节点、条件边、循环）；3）需要独立测试和调试；4）不同团队负责不同模块。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 子图内部状态更新未正确映射到主图 | 主图和子图的 State Schema 不一致，数据传递丢失 | 使用状态映射函数显式转换主图和子图之间的字段，确保字段名一一对应 |
| 子图中使用了与主图相同的节点名称导致冲突 | 名称空间未隔离，节点注册冲突 | 为子图内的节点添加前缀或使用命名空间隔离，如 `subgraph_节点名` |
| 子图独立测试通过，但嵌入主图后行为异常 | 子图依赖了主图中的全局上下文 | 确保子图不依赖外部隐式状态，所有依赖通过显式的状态映射传入 |
| 多层嵌套子图时性能急剧下降 | 每层嵌套都复制了一份完整状态 | 优化状态传递策略，使用引用而非深拷贝，或合并多层子图为扁平结构 |

---

## 📝 本章小结

- ✅ **子图概念** — 图中有图，模块化 Agent 架构
- ✅ **子图定义** — 完整的 StateGraph，独立状态和节点
- ✅ **子图嵌入** — 作为主图节点或被包装函数调用
- ✅ **状态映射** — 主图和子图间的数据转换
- ✅ **子图工厂** — 配置参数创建不同功能的子图实例
- ✅ **子图组合** — 多个子图按需组合成复杂系统
- ✅ **独立测试** — 每个子图可独立验证

## ➡️ 下一章预告

> [第6章：Multi-Agent 系统](./06-multi-agent.md) — 多个 Agent 协作，构建真正的"AI 团队"。
