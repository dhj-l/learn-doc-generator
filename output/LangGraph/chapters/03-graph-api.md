# 第3章：Graph API——构建你的第一个 Agent

> 预计学习时间：1.5 小时

## 🎯 本章目标

学习完本章，你将能够：
- 用 `StateGraph` 构建一个带工具的 Agent
- 理解 LLM 调用节点和工具节点的配合方式
- 使用条件边实现 LLM 的「判断 → 行动」循环
- 使用 `Command` 同时更新状态和路由

## 📋 前置知识

> 如果你还没有学习以下内容，建议先完成：
> - [第1章：概述与环境搭建](./01-introduction.md)
> - [第2章：核心概念](./02-core-concepts.md)

---

## 💡 Agent 的核心模式

在开始写代码之前，先理解 Agent 的**核心运行模式**：

```
用户提问
    │
    ▼
┌──────────────┐
│  LLM 判断     │──── 需要调用工具吗？ ────┐
│  (llmCall)   │                          │
│              │◀──────────────────────────┘
└──────┬───────┘                           │
       │ 不需要工具                         │ 需要工具
       ▼                                   ▼
   输出答案                       ┌──────────────┐
                                 │  调用工具     │
                                 │  (toolNode)  │
                                 └──────┬───────┘
                                        │
                                        ▼
                                 回到 LLM 判断
                               （带着工具结果再思考）
```

这个模式的关键在于：**LLM 判断 → 可能需要工具 → 调用工具 → 拿结果回来再判断 → 循环直到不需要工具为止**。

这就是一个典型的「Agent Loop」（Agent 循环）。

---

## 🔨 构建 Agent 的 5 个步骤

让我们一步步构建一个能做**四则运算**的 Agent。

### 第1步：定义工具

首先，用 LangChain 的 `tool` 定义我们的计算工具：

```typescript
import { tool } from "@langchain/core/tools";
import * as z from "zod";

// 加法工具
const add = tool(({ a, b }) => a + b, {
  name: "add",
  description: "计算两个数的和",
  schema: z.object({
    a: z.number().describe("第一个数"),
    b: z.number().describe("第二个数"),
  }),
});

// 乘法工具
const multiply = tool(({ a, b }) => a * b, {
  name: "multiply",
  description: "计算两个数的积",
  schema: z.object({
    a: z.number().describe("第一个数"),
    b: z.number().describe("第二个数"),
  }),
});

// 除法工具
const divide = tool(({ a, b }) => a / b, {
  name: "divide",
  description: "计算两个数的商",
  schema: z.object({
    a: z.number().describe("被除数"),
    b: z.number().describe("除数"),
  }),
});

// 把工具收集起来
const tools = [add, multiply, divide];
const toolsByName = {
  [add.name]: add,
  [multiply.name]: multiply,
  [divide.name]: divide,
};
```

> **💡 为什么用 tool()？**
> `tool()` 是 LangChain 提供的工具封装函数。它把函数、描述和参数 schema 打包成一个「工具」，LLM 可以理解这个工具的用途和参数格式。

### 第2步：准备 LLM

```typescript
import { ChatAnthropic } from "@langchain/anthropic";

// 创建 LLM 实例
const model = new ChatAnthropic({
  model: "claude-sonnet-4-6",
  temperature: 0,  // 数学计算，温度设为 0 保证确定性
});

// 把工具绑定到模型上
// 这样 LLM 就知道它可以用这些工具
const modelWithTools = model.bindTools(tools);
```

> **💡 bindTools 的作用：**
> `bindTools(tools)` 把工具的定义作为函数调用（function calling）的 schema 注册到 LLM 上。当 LLM 认为需要调用工具时，它会返回一个 `tool_calls` 数组。

### 第3步：定义状态

```typescript
import { StateSchema, MessagesValue } from "@langchain/langgraph";

const State = new StateSchema({
  messages: MessagesValue,  // 存储所有对话消息
});
```

### 第4步：定义节点

有了工具和模型，现在定义图的节点：

```typescript
import { StateGraph, GraphNode, ConditionalEdgeRouter, ToolNode, START, END } from "@langchain/langgraph";

// 🟢 LLM 调用节点
const llmCall: GraphNode<typeof State> = async (state) => {
  // 把系统提示词和对话历史发给 LLM
  const result = await modelWithTools.invoke([
    {
      role: "system",
      content: "你是一个乐于助人的助手，可以执行算术运算。",
    },
    ...state.messages,  // 包含用户消息和之前的工具结果
  ]);

  // 把 LLM 的回复追加到消息列表中
  return { messages: [result] };
};

// 🟢 工具执行节点
// ToolNode 是 LangGraph 预置的节点，它会自动执行 LLM 请求的工具
const toolNode = new ToolNode(tools);
```

### 第5步：定义路由逻辑

这是 Agent 的**大脑**——决定下一步该做什么：

```typescript
// 🟡 条件边：判断是否需要继续调用工具
const shouldContinue: ConditionalEdgeRouter<typeof State, "toolNode"> = (
  state,
) => {
  const lastMessage = state.messages.at(-1);

  // 如果 LLM 发出了工具调用请求
  if (lastMessage?.tool_calls?.length) {
    return "toolNode";  // → 去执行工具
  }
  // 否则，LLM 已经给出了最终答案
  return END;  // → 结束
};
```

### 第6步：组装和编译

```typescript
// 构建图
const agent = new StateGraph(State)
  // 添加节点
  .addNode("llmCall", llmCall)
  .addNode("toolNode", toolNode)
  // 连接边
  .addEdge(START, "llmCall")                                    // 开始 → LLM
  .addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])  // LLM → ？→ 工具或结束
  .addEdge("toolNode", "llmCall")                               // 工具 → 回到LLM
  .compile();
```

> **💡 为什么 `toolNode → llmCall` 是普通边？**
> 因为工具执行完后，**永远**需要让 LLM 看一下结果，再次判断。用户能看到的最终回答必须来自 LLM，而不是原始的工具输出。

### 完整流程图

```
START → [llmCall] ──需要工具?──→ [toolNode] 
         ↑                          │
         └────────── 总是 ──────────┘
         
         │
         └── 不需要工具 → END
```

### 执行 Agent

```typescript
// 执行
const result = await agent.invoke({
  messages: [{ role: "user", content: "计算 3 加 4 等于多少？" }],
});

// 打印所有消息
for (const message of result.messages) {
  console.log(`[${message.type}]: ${message.text || JSON.stringify(message.tool_calls)}`);
}
```

---

## 🚀 使用 Command 简化路由

LangGraph 提供了一个更强大的方式——`Command`。它允许节点**同时**更新状态和指定下一个节点：

```typescript
import { Command } from "@langchain/langgraph";

// 用 Command 的路由节点
// 这样就不需要单独定义条件边函数了
const routerNode: GraphNode<typeof State, "toolNode" | typeof END> = (state) => {
  const lastMessage = state.messages.at(-1);

  if (lastMessage?.tool_calls?.length) {
    return new Command({
      goto: "toolNode",        // 下一步去 toolNode
      update: { /* 可选的状态更新 */ }
    });
  }
  return new Command({
    goto: END,                 // 结束
  });
};
```

### 用 Command 重写上面 Agent 的路由

```typescript
// 合并 LLM 调用和路由判断到一个节点
const agentNode: GraphNode<typeof State, "toolNode" | typeof END> = async (state) => {
  const result = await modelWithTools.invoke([
    {
      role: "system",
      content: "你是一个乐于助人的助手，可以执行算术运算。",
    },
    ...state.messages,
  ]);

  // 如果 LLM 要调用工具，去 toolNode
  if (result.tool_calls?.length) {
    return new Command({
      goto: "toolNode",
      update: { messages: [result] },
    });
  }

  // 否则结束
  return new Command({
    goto: END,
    update: { messages: [result] },
  });
};

// 更简洁的图定义
const agent = new StateGraph(State)
  .addNode("agent", agentNode)
  .addNode("toolNode", new ToolNode(tools))
  .addEdge(START, "agent")
  .addConditionalEdges("agent", (state) => {
    // 判断条件：如果当前节点返回了 Command 指向 END，则结束
    // 实际上 Command 已经在节点内处理了路由
    // 这里保持从 toolNode 回到 agent
    return "agent";
  }, ["toolNode", END])
  .addEdge("toolNode", "agent")  // 工具执行完回到 agent
  .compile();
```

> **💡 Command 的优势：**
> 传统方式需要**一个节点 + 一个条件边函数**两个部分配合。Command 把这两个合二为一——节点自己决定下一步去哪，逻辑更内聚。

---

## 🔨 实战演练

### 练习：构建一个路由工作流

**场景描述：**
用户输入一段文本，你需要根据内容类型路由到不同的处理节点：
- 如果用户要**故事** → 调用故事专家
- 如果用户要**笑话** → 调用笑话专家
- 如果用户要**诗歌** → 调用诗歌专家

用条件边实现这个路由逻辑。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { StateSchema, StateGraph, GraphNode, ConditionalEdgeRouter, START, END } from "@langchain/langgraph";
import * as z from "zod";

// 状态定义
const State = new StateSchema({
  input: z.string(),
  output: z.string(),
});

// 模拟 LLM 路由判断（实际项目中用真实 LLM）
const llmCallRouter: GraphNode<typeof State> = async (state) => {
  // 这里模拟 LLM 的结构化输出
  const input = state.input.toLowerCase();
  let decision: string;

  if (input.includes("故事") || input.includes("story")) {
    decision = "story";
  } else if (input.includes("笑话") || input.includes("joke")) {
    decision = "joke";
  } else if (input.includes("诗") || input.includes("poem")) {
    decision = "poem";
  } else {
    decision = "story"; // 默认
  }

  return { decision };
};

// 三个处理节点
const writeStory: GraphNode<typeof State> = async (state) => {
  return { output: `📖 从前有座山，山里有个庙...（关于"${state.input}"的故事）` };
};

const writeJoke: GraphNode<typeof State> = async (state) => {
  return { output: `😂 为什么程序员总是混淆万圣节和圣诞节？因为 Oct 31 == Dec 25！（关于"${state.input}"的笑话）` };
};

const writePoem: GraphNode<typeof State> = async (state) => {
  return { output: `🌙 床前明月光，\n疑是地上霜。\n（关于"${state.input}"的诗）` };
};

// 路由条件边
const routeDecision: ConditionalEdgeRouter<typeof State, "writeStory" | "writeJoke" | "writePoem"> = (state) => {
  if (state.decision === "joke") return "writeJoke";
  if (state.decision === "poem") return "writePoem";
  return "writeStory";
};

// 构建图
const routerWorkflow = new StateGraph(State)
  .addNode("llmCallRouter", llmCallRouter)
  .addNode("writeStory", writeStory)
  .addNode("writeJoke", writeJoke)
  .addNode("writePoem", writePoem)
  .addEdge(START, "llmCallRouter")
  .addConditionalEdges("llmCallRouter", routeDecision, ["writeStory", "writeJoke", "writePoem"])
  .addEdge("writeStory", END)
  .addEdge("writeJoke", END)
  .addEdge("writePoem", END)
  .compile();

// 执行测试
const result = await routerWorkflow.invoke({
  input: "给我讲个笑话",
  decision: "",
  output: "",
});
console.log(result.output);
```

**预期输出：**
```
😂 为什么程序员总是混淆万圣节和圣诞节？因为 Oct 31 == Dec 25！（关于"给我讲个笑话"的笑话）
```

</details>

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Agent 循环中，为什么 `toolNode` 结束后一定要回到 `llmCall`？**
> A：因为工具执行的结果需要让 LLM「看一看」——LLM 需要把工具输出转换成用户能理解的自然语言回答。用户不应该直接看到原始的 JSON 工具输出。

**Q2：`ConditionalEdgeRouter` 可以返回哪些值？**
> A：可以返回节点名称（字符串）、`END`、节点名称数组（用于并行）。如果返回 null/undefined，会报错——必须明确指定下一步。

**Q3：`Command` 相比传统条件边有什么好处？**
> A：Command 把「状态更新」和「路由决策」合并到节点内部，代码更内聚。节点既做事情，又决定下一步去哪，不需要额外定义一个条件边函数。

**Q4：`ToolNode` 是什么？**
> A：`ToolNode` 是 LangGraph 预置的节点，它会自动读取 LLM 返回的 `tool_calls`，找到对应的工具并执行，然后把工具结果追加到消息列表中。

</details>

---

## 📝 本章小结

- ✅ Agent 的核心是 **LLM 判断 → 工具执行 → LLM 再判断** 的循环
- ✅ `bindTools` 让 LLM 知道可用哪些工具
- ✅ `ToolNode` 自动执行 LLM 请求的工具调用
- ✅ 条件边实现「是否需要调用工具」的判断逻辑
- ✅ `Command` 可以同时更新状态和控制路由
- ✅ 图的生命周期：`START → LLM → (要工具? 工具 → LLM) → END`

## ➡️ 下一章预告

> 在下一章中，我们将学习 LangGraph 的 **Functional API**——一种更简洁、更直觉的方式来构建 Agent，不需要显式定义图和节点。
> [下一章：Functional API →](./04-functional-api.md)
