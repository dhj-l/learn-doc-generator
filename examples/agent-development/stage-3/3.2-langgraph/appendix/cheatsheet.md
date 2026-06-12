# LangGraph 速查表

## 🚀 安装

```bash
npm install @langchain/langgraph @langchain/core @langchain/anthropic
```

## 📐 核心概念

```
State（状态）  → 图中共享的数据结构，通过 Annotation 定义
Node（节点）   → 处理函数，接收状态，返回状态更新
Edge（边）     → 节点之间的连接，可以是无条件或条件边
```

## 🔧 StateGraph 构建

```typescript
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';

// 1. 定义状态
const MyState = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (prev, curr) => [...prev, ...curr],  // 追加
    default: () => [],
  }),
  value: Annotation<string>({
    reducer: (_, curr) => curr,  // 覆盖
    default: () => '',
  }),
});

// 2. 定义节点
async function myNode(state: typeof MyState.State) {
  return { value: 'updated' };
}

// 3. 构建图
const graph = new StateGraph(MyState)
  .addNode('nodeA', myNode)
  .addEdge(START, 'nodeA')
  .addEdge('nodeA', END)
  .compile();

// 4. 执行
const result = await graph.invoke({ value: 'initial' });
```

## 🔗 边的类型

```typescript
// 无条件边
.addEdge('nodeA', 'nodeB')

// 条件边
.addConditionalEdges('nodeA', (state) => {
  if (condition) return 'nodeB';
  return 'nodeC';
}, {
  nodeB: 'nodeB',
  nodeC: 'nodeC',
})

// 到结束
.addEdge('nodeA', END)
.addEdge(START, 'nodeA')
```

## 🤖 内置 ReAct Agent

```typescript
import { createReactAgent } from '@langchain/langgraph/prebuilt';

const agent = createReactAgent({
  llm: model,
  tools: [tool1, tool2],
  messageModifier: '系统提示...',
});

const result = await agent.invoke({
  messages: [{ role: 'user', content: '...' }],
});

// 流式
for await (const event of agent.stream({ messages: [...] })) {
  console.log(event);
}
```

## ⏸️ Human-in-the-Loop

```typescript
import { interrupt, MemorySaver } from '@langchain/langgraph';

// 在节点中暂停
async function approvalNode(state) {
  const humanInput = interrupt({ message: '请确认' });
  // ... 恢复后继续
}

// 编译时需要 checkpointer
const checkpointer = new MemorySaver();
const app = graph.compile({ checkpointer });

// 执行（会暂停）
await app.invoke(input, { configurable: { thread_id: '1' } });

// 恢复
await app.invoke({ approved: true }, { configurable: { thread_id: '1' } });
```

## 🧩 子图

```typescript
// 子图编译后作为普通函数使用
const subgraph = subGraphBuilder.compile();

async function parentNode(state) {
  const subResult = await subgraph.invoke({ input: state.data });
  return { output: subResult.result };
}
```

## 📊 流式执行

```typescript
// 按节点流式
for await (const event of app.stream(input)) {
  for (const [nodeName, output] of Object.entries(event)) {
    console.log(`${nodeName}:`, output);
  }
}

// 按 Token 流式
for await (const event of app.streamEvents(input, { version: 'v2' })) {
  if (event.event === 'on_chat_model_stream') {
    process.stdout.write(event.data?.chunk?.content || '');
  }
}
```

## 📊 Agent 模式对比

| 模式 | 适用场景 | 复杂度 |
|------|----------|--------|
| ReAct | 简单工具调用 | 低 |
| Plan-and-Execute | 复杂多步任务 | 中 |
| Human-in-the-Loop | 需要人工审核 | 中 |
| Multi-Agent (Supervisor) | 多专家协作 | 高 |
