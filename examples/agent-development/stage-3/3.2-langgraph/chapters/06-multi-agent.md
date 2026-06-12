# 第6章：Multi-Agent 系统 — 多 Agent 协作

> 预计学习时间：90-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Multi-Agent 系统的设计模式** — Supervisor、Hierarchical、Network
- **实现 Supervisor 模式** — 一个调度者管理多个专家 Agent
- **构建 Agent 之间的通信机制** — 消息传递和状态共享
- **设计生产级的多 Agent 工作流**

## 📋 前置知识

> 建议先完成：
> - [第5章：子图与模块化](./05-subgraph.md)
> - [第2章：内置 ReAct Agent](./02-react-agent.md)

---

## 💡 核心概念

### 概念一：Multi-Agent 的三大模式

**生活类比：**
- **Supervisor（主管模式）**：项目经理管理团队成员，分配任务给合适的专家
- **Hierarchical（层级模式）**：CEO → 部门经理 → 员工，多层管理
- **Network（网络模式）**：团队成员直接互相沟通协作

```
Supervisor 模式：
  用户 → Supervisor → Agent A（搜索专家）
                    → Agent B（代码专家）
                    → Agent C（写作专家）
                    → Supervisor → 输出

Hierarchical 模式：
  用户 → 总监 → 经理1 → Agent A, Agent B
              → 经理2 → Agent C, Agent D

Network 模式：
  Agent A ←→ Agent B
    ↕           ↕
  Agent C ←→ Agent D
```

### 概念二：实现 Supervisor 模式

```typescript
// src/01-supervisor.ts
import { StateGraph, START, END, Annotation, MessagesAnnotation } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

// 专家 Agent 1：搜索专家
const searchTool = tool(
  async ({ query }) => `搜索"${query}"的结果：相关文档摘要...`,
  { name: 'search', description: '搜索互联网', schema: z.object({ query: z.string() }) }
);

const searchAgent = createReactAgent({
  llm: model,
  tools: [searchTool],
  messageModifier: '你是搜索专家，擅长查找和整理信息。用中文回答。',
});

// 专家 Agent 2：代码专家
const codeTool = tool(
  async ({ requirement }) => `function solution() { /* ${requirement} 的实现 */ }`,
  { name: 'write_code', description: '编写代码', schema: z.object({ requirement: z.string() }) }
);

const codeAgent = createReactAgent({
  llm: model,
  tools: [codeTool],
  messageModifier: '你是代码专家，擅长写 TypeScript/JavaScript 代码。用中文回答。',
});

// Supervisor 状态
const SupervisorState = Annotation.Root({
  messages: MessagesAnnotation.spec.reducer,
  nextAgent: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  results: Annotation<Record<string, string>>({
    reducer: (p, c) => ({ ...p, ...c }),
    default: () => ({}),
  }),
});

// Supervisor 节点 — 决定下一步由哪个 Agent 处理
async function supervisorNode(state: typeof SupervisorState.State) {
  const response = await model.invoke([
    new SystemMessage(`你是调度者。根据用户的需求，决定由哪个专家处理。

可用的专家：
- search_agent: 搜索和信息整理
- code_agent: 编写代码
- FINISH: 所有任务已完成，可以输出最终结果

回复专家名称，不要回复其他内容。`),
    ...state.messages,
  ]);

  const nextAgent = (response.content as string).trim().toLowerCase();
  return { nextAgent };
}

// 搜索 Agent 节点
async function searchAgentNode(state: typeof SupervisorState.State) {
  const result = await searchAgent.invoke({
    messages: state.messages,
  });
  const lastMsg = result.messages[result.messages.length - 1];
  return {
    messages: [new AIMessage(`[搜索结果] ${lastMsg.content}`)],
    results: { search: lastMsg.content as string },
  };
}

// 代码 Agent 节点
async function codeAgentNode(state: typeof SupervisorState.State) {
  const result = await codeAgent.invoke({
    messages: state.messages,
  });
  const lastMsg = result.messages[result.messages.length - 1];
  return {
    messages: [new AIMessage(`[代码结果] ${lastMsg.content}`)],
    results: { code: lastMsg.content as string },
  };
}

// 路由函数
function routeSupervisor(state: typeof SupervisorState.State): string {
  const next = state.nextAgent;
  if (next.includes('search')) return 'search_agent';
  if (next.includes('code')) return 'code_agent';
  return 'end';
}

// 构建 Supervisor 图
const supervisorGraph = new StateGraph(SupervisorState)
  .addNode('supervisor', supervisorNode)
  .addNode('search_agent', searchAgentNode)
  .addNode('code_agent', codeAgentNode)
  .addEdge(START, 'supervisor')
  .addConditionalEdges('supervisor', routeSupervisor, {
    search_agent: 'search_agent',
    code_agent: 'code_agent',
    end: END,
  })
  .addEdge('search_agent', 'supervisor')
  .addEdge('code_agent', 'supervisor')
  .compile();

// 使用
const result = await supervisorGraph.invoke({
  messages: [new HumanMessage('帮我搜索 Vue 3 Vapor Mode 的信息，然后写一个示例代码')],
});

console.log('结果:', result.results);
```

### 概念三：Agent 间通信

```typescript
// 方式 1：通过共享状态通信（推荐）
// 所有 Agent 读写同一个 State 对象
const sharedState = Annotation.Root({
  messages: MessagesAnnotation.spec.reducer,
  sharedData: Annotation<Record<string, any>>({
    reducer: (p, c) => ({ ...p, ...c }),
    default: () => ({}),
  }),
});

// Agent A 写入
async function agentA(state) {
  return { sharedData: { searchResults: '...' } };
}

// Agent B 读取
async function agentB(state) {
  const searchData = state.sharedData.searchResults;
  // 使用 Agent A 的搜索结果
}
```

```typescript
// 方式 2：通过消息列表通信
// Agent 通过 messages 传递信息，更灵活但需要解析
async function agentA(state) {
  return { messages: [new AIMessage('[research_result] Vue 3 Vapor Mode...')] };
}

async function agentB(state) {
  // 从消息中提取 Agent A 的结果
  const researchMsg = state.messages.find(m =>
    typeof m.content === 'string' && m.content.includes('[research_result]')
  );
}
```

---

## 🔨 实战演练

### 练习：构建一个代码审查团队

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// Supervisor + 3 个专家 Agent：
// 1. security_agent — 安全审计
// 2. performance_agent — 性能分析
// 3. style_agent — 代码风格检查

// Supervisor 分配代码给不同专家
// 汇总所有专家的意见
// 输出综合审查报告
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：并行执行多个 Agent

```typescript
import { RunnableParallel } from '@langchain/core/runnables';

// 并行执行搜索和代码分析
const parallelAgents = RunnableParallel.from({
  search: searchAgent,
  code: codeAgent,
});

const results = await parallelAgents.invoke({
  messages: [{ role: 'user', content: '...' }],
});
```

### 技巧二：最大循环次数保护

```typescript
// 防止 Supervisor 循环调用
const result = await supervisorGraph.invoke(
  { messages: [...] },
  { recursionLimit: 20 }  // 最多 20 步
);
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Supervisor 模式和 Network 模式分别适用于什么场景？**

> A：Supervisor 模式适用于任务可以明确分配给不同专家 Agent 的场景，如代码审查团队。Network 模式适用于 Agent 之间需要自由协商和协作的复杂场景，如多角色辩论或创意协作。

**Q2：多个 Agent 之间如何共享上下文？**

> A：有两种方式：1）通过共享状态（Shared State）——所有 Agent 读写同一个 State 对象中的公共字段；2）通过消息列表——每个 Agent 在 messages 中追加自己的输出，后续 Agent 从中解析。推荐使用共享状态，更高效且易于维护。

**Q3：如何防止 Supervisor 调度进入死循环？**

> A：设置 `recursionLimit` 限制最大执行步数；在 Supervisor 的路由逻辑中添加去重检测（避免重复分配给同一个 Agent）；添加最大调度轮次计数器。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Supervisor 分配到不存在 Agent | 路由映射表中缺少某个 Agent 名称对应的节点 | 在 `addConditionalEdges` 的映射表中包含所有可能的 Agent 名称 |
| 专家 Agent 的返回覆盖了共享数据 | 多个 Agent 同时写入同一字段导致竞态条件 | 使用带有合并逻辑的 reducer，或为每个 Agent 分配独立的字段前缀 |
| Agent 之间消息格式不兼容 | 不同 Agent 使用不同的消息格式或标记语言 | 统一消息格式约定，或在共享状态中定义标准化的通信协议 |
| Supervisor 误判任务类型 | LLM 作为 Supervisor 时可能理解错误 | 在 Supervisor 的 system prompt 中提供明确的分类标准和示例，降低模型温度 |

---

## 📝 本章小结

- ✅ **Supervisor 模式** — 调度者分配任务给专家 Agent
- ✅ **Agent 通信** — 通过共享状态或消息列表传递数据
- ✅ **并行执行** — 多个 Agent 同时处理不同任务
- ✅ **循环保护** — `recursionLimit` 防止无限循环

## ➡️ 下一章预告

> [第7章：综合实战 — 研究助手](./07-capstone-research-agent.md) — 构建一个完整的多 Agent 研究系统。
