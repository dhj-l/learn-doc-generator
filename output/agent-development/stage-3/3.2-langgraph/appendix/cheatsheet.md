# LangGraph 速查表

## 🚀 安装
```bash
npm install @langchain/langgraph @langchain/core @langchain/anthropic
```

## 🔧 核心 API

```typescript
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

// 定义状态
const State = Annotation.Root({ messages: Annotation() });

// 构建图
const graph = new StateGraph(State)
  .addNode('name', nodeFn)
  .addEdge(START, 'name')
  .addEdge('name', END)
  .compile();

// 执行
const result = await graph.invoke(initialState);
```

## 📊 内置 Agent

| 类型 | 创建方式 |
|------|----------|
| ReAct | `createReactAgent({ llm, tools })` |
| Plan-and-Execute | 自定义图 |
| Multi-Agent | Supervisor 图 |
