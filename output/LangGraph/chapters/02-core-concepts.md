# 第2章：核心概念——图、节点、边

> 预计学习时间：1 小时

## 🎯 本章目标

学习完本章，你将能够：
- 透彻理解 State、Node、Edge 三大概念
- 区分普通边和条件边的用途
- 理解 StateSchema 的运作方式
- 用 Zod 定义类型安全的状态

## 📋 前置知识

> 如果你还没有学习以下内容，建议先完成：
> - [第1章：概述与环境搭建](./01-introduction.md) 的安装和 Hello World 部分

---

## 💡 核心概念总览

LangGraph 的核心只有三个概念——记住这个**铁三角**：

```
┌─────────────────────────────────────────────┐
│                  StateGraph                  │
│                                              │
│   ┌──────────┐     ┌──────────┐             │
│   │  Node A   │────▶│  Node B  │             │
│   │ (LLM调用) │     │ (工具执行)│             │
│   └──────────┘     └──────────┘             │
│         │                                    │
│         │  Conditional Edge                  │
│         ▼                                    │
│   ┌──────────┐                               │
│   │  Node C  │          State:               │
│   │ (直接回答)│     { messages: [...],        │
│   └──────────┘       value: 42 }             │
└─────────────────────────────────────────────┘
```

**角色分工：**
- **State（状态）**：整个图的「记事本」——所有节点共享的数据
- **Node（节点）**：图中的「办事窗口」——每个节点完成一个具体任务
- **Edge（边）**：节点之间的「路径」——决定执行顺序

---

## 📦 State（状态）——图的记事本

### 概念类比

> 你可以把 State 想象成一个**共享白板**。每个节点执行完后，都可以在白板上写东西。下一个节点可以读取白板上已有的内容来做决策。

### 为什么需要 State？

一个 Agent 在执行过程中需要记住很多信息：
- 用户说了什么？
- LLM 返回了什么？
- 调用工具的结果是什么？
- 当前执行到哪一步了？

State 就是用来存这些信息的。

### 用 StateSchema 定义状态

在 LangGraph 中，我们使用 `StateSchema` 来定义状态的「形状」：

```typescript
import { StateSchema, MessagesValue } from "@langchain/langgraph";
import * as z from "zod";

// 定义状态的 schema
const State = new StateSchema({
  // messages: 用于存储对话消息（内置类型）
  messages: MessagesValue,
  
  // 自定义字段：使用 Zod 定义类型
  input: z.string(),
  output: z.string(),
  
  // 带默认值的字段
  counter: z.number().default(0),
});
```

### MessagesValue——消息列表

`MessagesValue` 是 LangGraph 内置的特殊类型，用于存储对话消息列表。它自动处理消息的追加（而不是覆盖）：

```typescript
const State = new StateSchema({
  messages: MessagesValue,
});

// 节点中追加消息
const node: GraphNode<typeof State> = (state) => {
  // 之前的所有消息还在，我们只是追加新消息
  return {
    messages: [{ role: "ai", content: "这是新消息" }]
  };
  // State 会自动把新旧消息合并
};
```

### ReducedValue——自定义合并逻辑

有时候你不只是想要「覆盖」或「追加」，而是需要自定义合并逻辑（比如求和）。这时用 `ReducedValue`：

```typescript
import { ReducedValue } from "@langchain/langgraph";
import * as z from "zod";

const State = new StateSchema({
  // 自定义 reducer：每次更新时，把新旧值相加
  total: new ReducedValue(
    z.number().default(0),        // 类型和默认值
    { reducer: (x, y) => x + y }  // 合并规则
  ),
  
  // 数组追加
  items: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: (a, b) => [...a, ...b] }
  ),
});

// 在节点中
const node: GraphNode<typeof State> = (state) => {
  return { total: 5 };  // 如果之前 total=3，现在 total=8
};
```

> **💡 为什么需要 Reducer？**
> LangGraph 的一个节点可能在同一轮被多次调用（比如并行节点）。Reducer 定义了当多个节点同时更新同一个字段时，应该如何合并结果。

### 状态的生命周期

```
初始状态 → Node A → 更新状态 → Node B → 更新状态 → ... → 最终状态
   │                    │                    │
   └── Checkpointer ────┴── Checkpointer ────┴── Checkpointer
       保存快照             保存快照             保存快照
```

每一步执行完后，状态都会被更新，并且（如果启用了 Checkpointer）会被保存为快照。

---

## 🎯 Node（节点）——执行单元

### 概念类比

> 节点就是**工作流中的每一个具体步骤**。好比做菜的每一步：洗菜 → 切菜 → 炒菜 → 装盘。

### 定义一个节点

节点就是一个**函数**，接收当前状态，返回更新后的状态：

```typescript
import { GraphNode } from "@langchain/langgraph";

// 最简单的节点：同步函数
const simpleNode: GraphNode<typeof State> = (state) => {
  console.log("当前状态:", state);
  return { output: "处理完成" };
};

// 异步节点：调用 LLM 或 API
const asyncNode: GraphNode<typeof State> = async (state) => {
  const result = await someApi(state.input);
  return { output: result };
};
```

### 节点的输入和输出

```
输入: state（完整当前状态）
                    ┌──────────────┐
                    │    Node      │
                    │              │
                    │  做某些事情   │
                    │              │
                    └──────────────┘
输出: Partial<State>（要更新的字段）
     ——只返回你改变的部分，其他字段保持不变
```

注意：节点**不需要**返回完整的 state，只需返回你想更新的字段。没返回的字段会保持原样。

### 节点的三种形态

```typescript
// 1️⃣ 纯处理节点：转换数据
const transformer: GraphNode<typeof State> = (state) => {
  return { output: state.input.toUpperCase() };
};

// 2️⃣ LLM 调用节点：调用 AI
const llmNode: GraphNode<typeof State> = async (state) => {
  const response = await model.invoke(state.messages);
  return { messages: [response] };
};

// 3️⃣ 路由节点：用 Command 控制流向
// 这个我们会在第3章详细讲
const routerNode: GraphNode<typeof State, "nodeA" | "nodeB"> = (state) => {
  if (state.input.includes("天气")) {
    return new Command({ 
      update: { output: "查询天气中..." },
      goto: "weatherNode"  // 指定下一个节点
    });
  }
  return new Command({ goto: "chatNode" });
};
```

---

## 🔗 Edge（边）——连接路径

### 概念类比

> 边就是告诉图**下一步该去哪个节点**的规则。简单边就是「做完 A 就做 B」，条件边就是「根据情况决定去 B 还是 C」。

### 两种边

#### 1. 普通边（Edge）：固定路径

```typescript
// 做完 A 之后，必然去做 B
graph.addEdge("nodeA", "nodeB");
```

#### 2. 条件边（Conditional Edge）：动态路由

```typescript
// 根据当前状态，决定下一步
const router: ConditionalEdgeRouter<typeof State, "toolNode"> = (state) => {
  const lastMessage = state.messages.at(-1);
  
  if (lastMessage?.tool_calls?.length) {
    return "toolNode";    // 需要调用工具
  }
  return END;             // 直接结束
};

graph.addConditionalEdges("llmNode", router, ["toolNode", END]);
```

条件边的 `router` 函数可以返回：
- **节点名称**：去这个节点
- **`END`**：结束执行
- **节点名称数组**：分叉到多个节点（并行执行）

### 起点和终点

LangGraph 提供了两个特殊标记：

```typescript
import { START, END } from "@langchain/langgraph";

// START：图的入口点
// 所有图都必须从 START 开始
graph.addEdge(START, "firstNode");

// END：图的结束点
// 到达 END 就停止执行
graph.addEdge("lastNode", END);
```

---

## 🏗️ StateGraph——组装一切

把 State、Node、Edge 组装起来的就是 `StateGraph`：

```typescript
const graph = new StateGraph(State)   // 1. 传入状态定义
  .addNode("node1", node1)            // 2. 添加节点
  .addNode("node2", node2)            //    （可以加多个）
  .addEdge(START, "node1")            // 3. 连接起点
  .addEdge("node1", "node2")          // 4. 节点之间连线
  .addEdge("node2", END)              // 5. 连接到终点
  .compile();                         // 6. 编译——生成可执行的图
```

### compile() 做了什么？

`compile()` 把定义好的图结构「编译」成可执行的运行时。编译时会：
1. 验证所有节点是否存在
2. 验证所有边的目标节点是否存在
3. 检查是否有从 START 到 END 的路径
4. 创建一个可执行的 `CompiledStateGraph` 实例

### 执行图

```typescript
// invoke：完整执行一次
const result = await graph.invoke({ messages: [] });

// stream：流式获取中间结果
for await (const output of graph.stream({ messages: [] })) {
  console.log("中间状态:", output);
}
```

---

## 🔨 实战演练

### 练习：构建一个简单的数据处理流水线

**场景描述：**
你需要构建一个数据处理流水线：输入一个数字，先加 10，再乘以 2，最后输出结果。每一步都是一个节点，数据在节点之间传递。

**你的任务：**
1. 定义状态（包含一个 `value` 字段）
2. 创建三个节点：`addTen`、`multiplyTwo`、`printResult`
3. 用普通边连接它们
4. 编译并执行

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { StateSchema, StateGraph, GraphNode, START, END } from "@langchain/langgraph";
import * as z from "zod";

// 1️⃣ 定义状态
const State = new StateSchema({
  value: z.number(),
  message: z.string(),
});

// 2️⃣ 定义节点
const addTen: GraphNode<typeof State> = (state) => {
  const newValue = state.value + 10;
  console.log(`加 10: ${state.value} → ${newValue}`);
  return { value: newValue };
};

const multiplyTwo: GraphNode<typeof State> = (state) => {
  const newValue = state.value * 2;
  console.log(`乘 2: ${state.value} → ${newValue}`);
  return { value: newValue };
};

const printResult: GraphNode<typeof State> = (state) => {
  const message = `最终结果: ${state.value}`;
  console.log(message);
  return { message };
};

// 3️⃣ 构建图
const graph = new StateGraph(State)
  .addNode("addTen", addTen)
  .addNode("multiplyTwo", multiplyTwo)
  .addNode("printResult", printResult)
  .addEdge(START, "addTen")
  .addEdge("addTen", "multiplyTwo")
  .addEdge("multiplyTwo", "printResult")
  .addEdge("printResult", END)
  .compile();

// 4️⃣ 执行
const result = await graph.invoke({ value: 5, message: "" });
console.log("最终状态:", result);
```

**预期输出：**
```
加 10: 5 → 15
乘 2: 15 → 30
最终结果: 30
最终状态: { value: 30, message: "最终结果: 30" }
```

</details>

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：State 和 Node 之间是什么关系？**
> A：State 是「数据」，Node 是「操作」。Node 读取 State，处理后返回更新后的 State。State 在整个图的所有节点之间共享。

**Q2：普通边和条件边的区别是什么？**
> A：普通边是固定的执行路径（A 做完一定去 B），条件边是根据当前状态动态选择下一步（根据条件去 B 或 C）。

**Q3：`compile()` 的作用是什么？**
> A：把定义好的图结构编译成可执行的运行时。编译时会做验证检查，确保所有节点和边的引用都是有效的。

**Q4：节点返回的状态是"覆盖"还是"合并"？**
> A：默认是合并（merge）。节点只需返回要更新的字段，未返回的字段保持原样。对于 `MessagesValue` 等特殊类型，使用预定义的 reducer 进行合并。

</details>

---

## 🧠 设计思路：用 LangGraph 思考

恭喜你学完了三大核心概念！现在你可能会问：**面对一个实际问题，该怎么拆解成 LangGraph？**

官方文档推荐了一个**5步方法论**，我们来走一遍：

### Step 1：把工作流拆成离散步骤

想象你要做一个**邮件客服 Agent**，工作流程应该是：

```
读邮件 → 分类意图 → 查知识库 → 拟回复 → 人工审核 → 发送
```

每个方框都是一个**节点（Node）**。

### Step 2：确定每步需要做什么

对每个节点，判断它的操作类型：

| 类型 | 说明 | 例子 |
|------|------|------|
| **LLM 步骤** | 需要理解、分析、生成文本 | 分类意图、拟回复 |
| **数据步骤** | 从外部获取信息 | 查知识库、查订单 |
| **操作步骤** | 执行外部动作 | 发送邮件、更新数据库 |
| **用户输入步骤** | 需要人类干预 | 人工审核 |

### Step 3：设计状态

问自己：「哪些数据需要被多个步骤共享？」这些就是状态。

对于邮件 Agent：
- 原始邮件（不能丢）
- 分类结果（后面要用）
- 草稿回复（审核要用）
- 执行记录（调试用）

### Step 4：实现节点

把每个步骤写成一个函数——现在我们终于开始写代码了：

```typescript
const readEmail: GraphNode<typeof State> = (state) => {
  // 解析邮件内容
  return { parsedEmail: { ... } };
};

const classifyIntent: GraphNode<typeof State> = async (state) => {
  const result = await model.invoke([...state.messages]);
  return { category: result.content };
};
```

### Step 5：连接成图

用边把节点连接起来：

```typescript
const graph = new StateGraph(State)
  .addNode("readEmail", readEmail)
  .addNode("classifyIntent", classifyIntent)
  .addNode("draftReply", draftReply)
  .addEdge(START, "readEmail")
  .addEdge("readEmail", "classifyIntent")
  .addConditionalEdges("classifyIntent", routeByCategory, ["draftReply", "humanReview"])
  .compile();
```

> **💡 核心思想：** 始终从**流程**出发，而不是从**代码**出发。先画出业务的流程图，再考虑怎么用 Node 和 Edge 实现它。

---

- ✅ **State**：图的共享数据，用 `StateSchema` 定义，支持 `MessagesValue` 和 `ReducedValue`
- ✅ **Node**：执行单元，是一个接收 state 返回 partial state 的函数（同步或异步）
- ✅ **Edge**：连接节点的路径，有普通边（固定）和条件边（动态）两种
- ✅ **Conditional Edge Router**：根据当前状态决定下一步走向
- ✅ **StateGraph**：把 State + Node + Edge 组装起来的框架
- ✅ **compile() → invoke()**：先编译后执行

## ➡️ 下一章预告

> 在下一章中，我们将用 Graph API 构建一个**真正的 Agent**——它能调用工具、处理工具返回结果、并决定是否需要继续调用更多工具。
> [下一章：Graph API →](./03-graph-api.md)
