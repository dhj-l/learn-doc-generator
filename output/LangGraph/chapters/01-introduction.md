# 第1章：概述与环境搭建

> 预计学习时间：30 分钟

## 🎯 本章目标

学习完本章，你将能够：
- 理解 LangGraph 是什么以及它能解决什么问题
- 厘清 LangGraph 与 LangChain 的定位差异
- 在项目中安装并配置 LangGraph
- 运行你的第一个"Hello World" LangGraph

---

## 💡 什么是 LangGraph？

### 🏭 先看一个场景

假设你要做一个**智能客服 Agent**，它需要：

1. 接收用户的问题
2. 判断需要调用哪个工具（查订单、查物流、转人工...）
3. 调用工具并获取结果
4. 根据结果决定下一步
5. 如果用户不满意，继续追问
6. 整个对话过程中，要记住之前说了什么
7. 如果 Agent 出错了，要从断点恢复而不是从头开始

用简单的「请求 → 响应」模式根本搞不定。你需要一个能**精确控制每一步执行、支持循环和条件判断、能在任何一步暂停和恢复**的框架。

**这就是 LangGraph 的用武之地。**

### 🧩 LangGraph 的定位

LangGraph 是一个**底层编排框架**，专门用于构建「有状态的 Agent 工作流」。它的核心思想是：

> 把 Agent 的执行过程看作一个**有向图（Directed Graph）**——图中有多个**节点（Node）**，节点之间通过**边（Edge）**连接，数据在节点间流动，状态在整个图中共享。

```
  用户输入 → [理解问题] → [需要工具?] → 是 → [调用工具] → 
                                      ↘ 否 → [直接回答] →
                                                        ↘
                                    [整理结果] → 输出给用户
```

每个方框就是一个**节点**，箭头就是**边**，菱形就是**条件边（Conditional Edge）**。

### 🎯 LangGraph 的核心能力

| 能力 | 说明 | 类比 |
|------|------|------|
| **状态管理** | 整个执行过程中的数据自动维护 | 📋 办事流程表，每步都记录进展 |
| **持久化（Checkpointer）** | 每一步执行都保存快照 | 🎮 游戏自动存档 |
| **人机交互（Interrupt）** | 在关键步骤暂停，等人批准再继续 | ✅ 审批流程 |
| **时间旅行（Time Travel）** | 回溯到之前的某个状态重新执行 | ⏪ 看回放并分叉 |
| **流式输出（Streaming）** | 逐字输出 LLM 的响应 | 🖨️ 逐行打印 |
| **容错（Fault Tolerance）** | 执行失败后从断点恢复 | 🔄 断电续传 |

---

## 🔄 LangGraph vs LangChain：一次说清

这是初学者最容易混淆的地方。让我用一个**工具箱 vs 施工队**的类比来解释：

### LangChain = 🧰 工具箱

LangChain 提供了一系列**工具**：
- 各种 LLM 模型的封装（ChatOpenAI、ChatAnthropic...）
- 提示词模板（PromptTemplate）
- 输出解析器（OutputParser）
- 文档加载器（DocumentLoader）
- 向量存储（VectorStore）
- 各种工具（Tool）

你可以用这些工具快速做简单的链式调用：

```typescript
// LangChain 风格：链式调用
const chain = prompt.pipe(model).pipe(outputParser);
const result = await chain.invoke({ question: "你好" });
```

但是当流程变复杂——有分支、循环、条件判断时，链式调用就力不从心了。

### LangGraph = 🏗️ 施工队 + 建筑蓝图

LangGraph 提供了**完整的执行框架**：
- `StateGraph`：定义工作流的蓝图
- `Node`：工作流中的每个执行步骤
- `Edge`：步骤之间的连接
- `Conditional Edge`：根据条件选择下一步
- `Checkpointer`：每一步都存档
- `Interrupt`：在任意步骤暂停等待输入

### 什么时候用哪个？

| 场景 | 推荐工具 | 原因 |
|------|----------|------|
| 简单的 LLM 调用 | LangChain | 一行代码搞定 |
| 简单的 RAG 问答 | LangChain | LCEL 链式调用足够 |
| 需要调用工具的 Agent | LangGraph | 需要循环（LLM 可能多次调用工具） |
| 需要用户审批的流程 | LangGraph | 需要 Interrupt 能力 |
| 需要容错和断点恢复 | LangGraph | 需要 Checkpointer |
| 需要调试和回放 | LangGraph | 需要 Time Travel |
| 只需要 API 封装 | LangChain | 轻量级 |

### 📌 重点：LangGraph 和 LangChain 不是二选一

它们是**互补的**！一个典型的 LangGraph 项目会同时使用两者：

```typescript
// LangChain 提供模型和工具
import { ChatAnthropic } from "@langchain/anthropic";
import { tool } from "@langchain/core/tools";

// LangGraph 提供编排框架
import { StateGraph, StateSchema } from "@langchain/langgraph";

// 一起用！LangChain 的工具 + LangGraph 的编排
const model = new ChatAnthropic({ model: "claude-sonnet-4-6" });
const tools = [myTool];

const graph = new StateGraph(State)
  .addNode("llmCall", llmCall)
  .addNode("toolNode", new ToolNode(tools))
  // ...
  .compile();
```

---

## 🔧 环境搭建

### 前置要求

- Node.js >= 18
- npm 或 yarn
- 一个 LLM API Key（我们以 Anthropic Claude 为例）

### 安装

创建一个新项目并安装依赖：

```bash
# 创建项目目录
mkdir my-langgraph-app && cd my-langgraph-app

# 初始化 package.json
npm init -y

# 安装 LangGraph 核心包
npm install @langchain/langgraph

# 安装 LangChain 核心包（用于模型和工具）
npm install @langchain/core

# 安装模型提供商（任选其一）
npm install @langchain/anthropic    # Anthropic Claude
# 或
npm install @langchain/openai      # OpenAI
# 或
npm install @langchain/google-genai # Google Gemini

# 安装 Zod（用于数据验证）
npm install zod
```

### 配置环境变量

创建 `.env` 文件：

```bash
# .env
ANTHROPIC_API_KEY=你的_claude_api_key
# 或
OPENAI_API_KEY=你的_openai_api_key
```

> 💡 **提示**：没有 API Key 也没关系，第1-2章的概念学习不需要调用 LLM，我们可以用模拟数据来测试。

---

## 🚀 第一个 LangGraph：Hello World

让我们运行一个最简单的 LangGraph，不需要任何 API Key：

```typescript
// hello-world.ts
import { StateSchema, MessagesValue, type GraphNode, StateGraph, START, END } from "@langchain/langgraph";

// 1️⃣ 定义状态
// 状态就是整个流程中共享的数据
const State = new StateSchema({
  messages: MessagesValue,  // messages 是一个消息列表，用于存储对话
});

// 2️⃣ 定义一个节点
// 节点就是流程中的一个执行步骤
// 它接收当前状态，返回更新后的状态
const mockLlm: GraphNode<typeof State> = (state) => {
  return { 
    messages: [{ role: "ai", content: "hello world" }] 
  };
};

// 3️⃣ 构建图
const graph = new StateGraph(State)
  .addNode("mock_llm", mockLlm)   // 添加节点
  .addEdge(START, "mock_llm")     // 从起点连接到节点
  .addEdge("mock_llm", END)       // 从节点连接到终点
  .compile();                     // 编译图

// 4️⃣ 执行图
const result = await graph.invoke({ 
  messages: [{ role: "user", content: "hi!" }] 
});

console.log(JSON.stringify(result, null, 2));
```

**预期输出：**

```json
{
  "messages": [
    { "role": "user", "content": "hi!" },
    { "role": "ai", "content": "hello world" }
  ]
}
```

运行方式：

```bash
npx tsx hello-world.ts
```

### 这个例子告诉我们什么？

1. **State（状态）**：定义了图中共享的数据结构——这里是一个消息列表
2. **Node（节点）**：图中的执行单元——这里是一个模拟的 LLM 调用
3. **Edge（边）**：节点之间的连接方式——`START → mock_llm → END`
4. **Graph（图）**：把节点和边组装起来形成一个完整的工作流
5. **invoke（执行）**：输入初始状态，让图按照我们定义的路径执行

> 💡 **为什么叫"图"？**
> 因为执行流程是一个**有向图**，而不是一条直线。节点可以有多个出口（条件分支），也可以形成循环（Agent 多次调用工具）。

---

## 📝 本章小结

- ✅ LangGraph 是构建有状态 Agent 的**底层编排框架**
- ✅ LangGraph 把执行流程建模为**有向图**：节点 + 边 + 条件边
- ✅ LangGraph 和 LangChain 是**互补关系**，不是替代关系
- ✅ 安装只需要 `@langchain/langgraph` 核心包
- ✅ 最简单的图包含：状态定义 → 节点定义 → 连接边 → 编译 → 执行

## ➡️ 下一章预告

> 在下一章中，我们将深入 LangGraph 的**三大核心概念**：State（状态）、Node（节点）和 Edge（边），并学习如何用它们构造复杂的工作流。
> [下一章：核心概念 →](./02-core-concepts.md)
