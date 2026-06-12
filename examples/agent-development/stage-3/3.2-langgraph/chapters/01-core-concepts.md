# 第1章：LangGraph 核心概念 — 有向图驱动的 Agent

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 LangGraph 的有向图执行模型** — 状态机驱动的 Agent 架构
- **掌握 State、Node、Edge 三大核心概念** — 构建图的基本元素
- **实现条件边和循环** — 让 Agent 具备决策和迭代能力
- **使用检查点实现状态持久化** — Agent 暂停和恢复

## 📋 前置知识

> 建议先完成：[2.1 Agent 架构与设计](../../stage-2/2.1-agent-architecture-and-design/README.md)

---

## 💡 核心概念

### 概念一：为什么需要 LangGraph？

**生活类比：** 如果 LangChain 是流水线工厂（A→B→C 线性执行），那 LangGraph 就是城市交通网络——有主干道、有环路、有立交桥，可以根据实时路况选择最优路径。

```
LangChain 的限制：
  A → B → C → D
  （线性管线，无法回退、无法分支、无法循环）

LangGraph 的能力：
  A → B → C → D
  ↑    ↓    ↓
  E ←──┘    ↓
  ↑         ↓
  F ←───────┘
  （支持循环、分支、条件跳转、并行执行）
```

### 概念二：三大核心概念

#### State（状态）

State 是贯穿整个图执行的数据结构，所有节点共享和修改同一个状态。

```typescript
import { Annotation } from '@langchain/langgraph';

// 定义状态结构
const AgentState = Annotation.Root({
  // 消息列表 — 使用 reducer 追加
  messages: Annotation<Array<{ role: string; content: string }>>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),

  // 当前步骤 — 使用 reducer 覆盖
  currentStep: Annotation<string>({
    reducer: (_, curr) => curr,
    default: () => 'start',
  }),

  // 迭代计数 — 使用 reducer 累加
  iteration: Annotation<number>({
    reducer: (prev, curr) => prev + curr,
    default: () => 0,
  }),
});
```

> **💡 为什么需要 reducer？**
>
> 因为图中的多个节点可能同时修改同一个字段。reducer 定义了如何合并多次修改。例如 messages 用 `[...prev, ...curr]` 来追加，而 currentStep 用 `(_, curr) => curr` 来覆盖。

#### Node（节点）

节点是图中的处理单元，每个节点是一个接收状态、返回状态更新的函数。

```typescript
import { ChatAnthropic } from '@langchain/anthropic';
import { AIMessage } from '@langchain/core/messages';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

// 节点 1：推理节点
async function reasoningNode(state: typeof AgentState.State) {
  const response = await model.invoke(state.messages);
  return {
    messages: [new AIMessage(response.content as string)],
    iteration: 1,
  };
}

// 节点 2：工具执行节点
async function toolExecutionNode(state: typeof AgentState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  const result = await executeTool(lastMessage.content);
  return {
    messages: [new AIMessage(`工具结果: ${result}`)],
  };
}
```

#### Edge（边）

边定义了节点之间的连接关系。

```typescript
import { StateGraph, START, END } from '@langchain/langgraph';

// 条件路由函数
function shouldContinue(state: typeof AgentState.State): string {
  const lastMsg = state.messages[state.messages.length - 1];
  const content = typeof lastMsg.content === 'string' ? lastMsg.content : '';

  if (content.includes('Action:')) return 'tools';
  if (state.iteration >= 5) return 'end';
  return 'answer';
}

// 构建图
const graph = new StateGraph(AgentState)
  .addNode('reasoning', reasoningNode)
  .addNode('tools', toolExecutionNode)
  .addNode('answer', answerNode)

  // 起始边
  .addEdge(START, 'reasoning')

  // 条件边：推理后决定下一步
  .addConditionalEdges('reasoning', shouldContinue, {
    tools: 'tools',
    answer: 'answer',
    end: END,
  })

  // 工具执行后回到推理
  .addEdge('tools', 'reasoning')

  // 最终回答后结束
  .addEdge('answer', END)
  .compile();
```

### 概念三：完整 ReAct Agent 图

```
┌────────┐     ┌────────────┐     ┌──────────┐
│ START  │ ──→ │ reasoning  │ ──→ │  tools   │
└────────┘     │ (LLM 推理)  │     │(工具执行) │
               └─────┬──────┘     └────┬─────┘
                     │                  │
                     │ (需要工具)        │ (回到推理)
                     │    ┌─────────────┘
                     │    ↓
                     │  reasoning ←────┘
                     │
                     │ (达到结论)
                     ↓
               ┌────────────┐
               │   answer   │ ──→ END
               └────────────┘
```

### 概念四：编译和执行

```typescript
// 编译图（验证图结构的正确性）
const app = graph.compile();

// 执行
const result = await app.invoke({
  messages: [{ role: 'user', content: '北京今天天气如何？' }],
});

// 流式执行（观察每个节点的输出）
const stream = await app.stream({
  messages: [{ role: 'user', content: '北京今天天气如何？' }],
});

for await (const event of stream) {
  for (const [nodeName, nodeOutput] of Object.entries(event)) {
    console.log(`📍 节点 ${nodeName}:`, JSON.stringify(nodeOutput).slice(0, 100));
  }
}
```

```
预期输出：
📍 节点 reasoning: {"messages":[{"role":"assistant","content":"Thought: 需要查询天气..."}],"iteration":1}
📍 节点 tools: {"messages":[{"role":"assistant","content":"工具结果: 北京 25°C 晴"}]}
📍 节点 reasoning: {"messages":[{"role":"assistant","content":"北京今天 25 度..."}]}
📍 节点 answer: {"messages":[{"role":"assistant","content":"北京今天非常适合户外运动！"}]}
```

### 概念五：持久化与检查点

```typescript
import { MemorySaver } from '@langchain/langgraph';

const checkpointer = new MemorySaver();
const app = graph.compile({ checkpointer });

// 执行时指定 thread_id
const result = await app.invoke(
  { messages: [{ role: 'user', content: '分析代码' }] },
  { configurable: { thread_id: 'thread-001' } }
);

// 稍后恢复
const state = await app.getState({ configurable: { thread_id: 'thread-001' } });
```

---

## 🔨 实战演练

### 练习：构建带循环的问答 Agent

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

const QAState = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
  iteration: Annotation<number>({
    reducer: (prev) => prev + 1,
    default: () => 0,
  }),
  finalAnswer: Annotation<string>({
    reducer: (_, curr) => curr,
    default: () => '',
  }),
});

async function analyze(state: typeof QAState.State) {
  const response = await model.invoke([
    new SystemMessage('分析问题。需要更多信息则说"需要搜索"，否则直接回答。'),
    ...state.messages,
  ]);
  return { messages: [new AIMessage(response.content as string)] };
}

async function search(state: typeof QAState.State) {
  const searchResult = '模拟搜索结果：相关信息...';
  return { messages: [new AIMessage(`搜索：${searchResult}`)] };
}

async function answer(state: typeof QAState.State) {
  const response = await model.invoke([
    new SystemMessage('基于已有信息给出最终答案。'),
    ...state.messages,
  ]);
  return {
    messages: [new AIMessage(response.content as string)],
    finalAnswer: response.content as string,
  };
}

function routeAfterAnalyze(state: typeof QAState.State) {
  const lastMsg = state.messages[state.messages.length - 1];
  const content = typeof lastMsg.content === 'string' ? lastMsg.content : '';
  if (content.includes('需要搜索') && state.iteration < 3) return 'search';
  return 'answer';
}

const qaGraph = new StateGraph(QAState)
  .addNode('analyze', analyze)
  .addNode('search', search)
  .addNode('answer', answer)
  .addEdge(START, 'analyze')
  .addConditionalEdges('analyze', routeAfterAnalyze, {
    search: 'search',
    answer: 'answer',
  })
  .addEdge('search', 'analyze')
  .addEdge('answer', END)
  .compile();

const result = await qaGraph.invoke({
  messages: [new HumanMessage('什么是量子纠缠？')],
});
console.log('最终答案:', result.finalAnswer);
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：使用 `addConditionalEdges` 构建分支路由

在 Agent 中，LLM 的决策往往不止二选一。利用 `addConditionalEdges` 可以构建多分支路由，让图根据状态自由分流。

```typescript
function routeBasedOnState(state: typeof AgentState.State): string {
  const lastMsg = state.messages[state.messages.length - 1];
  if (lastMsg.tool_calls?.length) return 'tools';
  if (state.iteration > 5) return 'error_handler';
  if (state.finalAnswer) return 'answer';
  return 'continue';
}
```

### 技巧二：利用 `reducer` 实现自定义合并策略

默认 reducer 是追加模式，但有些字段需要覆盖或累加。通过自定义 reducer 可以精确控制状态合并行为。

```typescript
const CustomState = Annotation.Root({
  retryCount: Annotation<number>({
    reducer: (prev) => prev + 1,  // 每次自动加 1
    default: () => 0,
  }),
  accumulatedLog: Annotation<string[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
});
```

### 技巧三：检查点持久化与多线程隔离

使用 `MemorySaver` 或 `SqliteSaver` 实现跨会话持久化，每个 `thread_id` 独立保存执行上下文。

```typescript
const app = graph.compile({ checkpointer: new MemorySaver() });

// 多用户隔离
const userA = await app.invoke(input, { configurable: { thread_id: 'user-a' } });
const userB = await app.invoke(input, { configurable: { thread_id: 'user-b' } });
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：LangGraph 的 State 和普通变量有什么区别？**

> A：State 是图中所有节点共享的数据结构，通过 reducer 定义合并策略。多个节点可以同时修改同一字段，reducer 确保合并的正确性。

**Q2：条件边和无条件边分别在什么场景下使用？**

> A：无条件边用于确定的流转。条件边用于需要根据当前状态决定下一步的场景，例如 LLM 决定是否需要调用工具。

**Q3：为什么 LangGraph 比 LangChain Chain 更适合构建 Agent？**

> A：Agent 的执行是有状态的循环，LangGraph 的有向图天然支持循环、条件分支和状态管理，更符合 Agent 的执行模式。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 节点函数返回了未定义的字段 | State 使用严格类型检查，未定义的字段会导致运行时错误 | 确保返回的对象只包含 State 中定义的字段 |
| 条件边缺少分支映射 | `addConditionalEdges` 的映射表中缺少某个返回值对应的目标节点 | 检查所有可能的返回值，确保映射表中都有对应的目标 |
| reducer 使用不当导致状态丢失 | 使用 `(_, curr) => curr` 覆盖时，多个节点同时写入会互相覆盖 | 根据业务需求选择合适的 reducer 策略（追加、累加、覆盖） |
| 图编译时报循环引用错误 | 图中的边形成了无限循环且没有终止条件 | 添加最大迭代次数检查，或在条件边中提供 `END` 出口 |

---

## 📝 本章小结

- ✅ **StateGraph** — 有向图构建器
- ✅ **State + Annotation** — 共享数据结构，支持 reducer 合并
- ✅ **Node** — 处理函数，接收状态返回更新
- ✅ **Edge / ConditionalEdge** — 无条件边和条件边
- ✅ **检查点** — 状态持久化，支持暂停和恢复

## ➡️ 下一章预告

> [第2章：内置 ReAct Agent](./02-react-agent.md) — 使用 `createReactAgent` 快速构建。
