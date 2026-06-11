# 第2-7章概要

## 第2章：内置 ReAct Agent

```typescript
import { createReactAgent } from '@langchain/langgraph/prebuilt';
const agent = createReactAgent({ llm: model, tools: [tool1, tool2] });
```

## 第3章：Plan-and-Execute Agent

```typescript
// LangGraph 中实现 Plan-and-Execute
const planner = new StateGraph(PlanState)
  .addNode('plan', planNode)
  .addNode('execute', executeNode)
  .addNode('replan', replanNode)
  .addEdge('plan', 'execute')
  .addConditionalEdges('execute', shouldReplan, { replan: 'replan', end: END })
  .compile();
```

## 第4章：Human-in-the-Loop

```typescript
const graph = new StateGraph(State)
  .addNode('agent', agentNode)
  .addNode('human_review', humanReviewNode)  // 人工审查节点
  .compile();

// 使用 interruptBefore 在指定节点前暂停
const app = graph.compile({ interruptBefore: ['human_review'] });
```

## 第5章：子图与模块化

```typescript
// 将子图作为节点嵌入主图
const mainGraph = new StateGraph(MainState)
  .addNode('research', researchSubgraph)  // 子图
  .addNode('write', writeSubgraph)        // 子图
  .compile();
```

## 第6章：Multi-Agent 系统

```typescript
// Supervisor 模式
const supervisor = new StateGraph(MultiAgentState)
  .addNode('supervisor', supervisorNode)
  .addNode('researcher', researcherAgent)
  .addNode('writer', writerAgent)
  .addConditionalEdges('supervisor', routeToAgent, {
    researcher: 'researcher',
    writer: 'writer',
    end: END,
  })
  .compile();
```

## 第7章：综合实战 — 多 Agent 研究助手

构建一个 Supervisor + Researcher + Writer 的多 Agent 研究系统。
