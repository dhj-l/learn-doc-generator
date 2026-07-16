# 第7章：LangGraph vs LangChain 深度对比

> 预计学习时间：30 分钟

## 🎯 本章目标

学习完本章，你将能够：
- 清晰说出 LangChain 和 LangGraph 各自的定位
- 面对实际需求时，准确判断该用哪个框架
- 理解两者如何协同工作
- 读懂官方文档和技术文章中的相关讨论

> 💡 **本章是复习+总结篇**。前面几章的内容我们已经分别学过了 LangChain 和 LangGraph，本章把它们放在一起做系统性对比。

---

## 🔄 核心定位差异

### LangChain——LLM 工具箱

**一句话**：LangChain 是 LLM 应用的**瑞士军刀**。

它提供了一整套与 LLM 交互的抽象层：
- 模型封装（Model I/O）
- 提示词管理（Prompt Templates）
- 链式调用（LCEL — LangChain Expression Language）
- RAG 组件（文档加载、向量存储）
- 工具调用（Tool calling）

### LangGraph——Agent 编排引擎

**一句话**：LangGraph 是 Agent 工作流的**操作系统**。

它在 LangChain 的基础上提供了：
- 图状工作流编排
- 持久化状态管理
- 人机交互（暂停/恢复）
- 流式输出与控制
- 容错与重试

---

## 📊 分类对比表

### 1. 定位与抽象层次

| 维度 | LangChain | LangGraph |
|------|-----------|-----------|
| **抽象层次** | 上层应用框架 | 底层编排引擎 |
| **核心理念** | 链（Chain）——线性处理 | 图（Graph）——有状态工作流 |
| **设计目标** | 简化 LLM 应用开发 | 构建复杂的 Agent 系统 |
| **状态管理** | ❌ 无内置状态 | ✅ 内置 State + Checkpointer |
| **控制流** | 线性（a → b → c） | 图状（分支、循环、并行） |

### 2. 关键能力对比

| 能力 | LangChain | LangGraph |
|------|-----------|-----------|
| LLM 调用封装 | ✅ | ✅（使用 LangChain 的模型） |
| 提示词模板 | ✅ | ❌（用 LangChain 的） |
| 工具定义 | ✅（`@tool` 装饰器） | ✅（直接复用 LangChain 的工具） |
| 链式编排 | ✅ LCEL | ❌（用图代替链） |
| 条件分支 | ❌（难实现） | ✅ 原生支持 |
| 循环/重试 | ❌（需手动写） | ✅ 原生支持 |
| 状态持久化 | ❌ | ✅ Checkpointer |
| 人机交互 | ❌ | ✅ Interrupt |
| 时间旅行 | ❌ | ✅ |
| 流式输出 | ✅ | ✅（更细粒度） |
| 容错恢复 | ❌ | ✅ |
| 并行执行 | ❌ | ✅ Send API |
| 子图/模块化 | ❌ | ✅ Subgraph |

### 3. 适用场景对比

| 场景 | 推荐 | 原因 |
|------|------|------|
| "我就要调一次 LLM" | LangChain | `model.invoke()` 就够了 |
| "做简单的 RAG 问答" | LangChain | Document Loading + VectorStore + Chain |
| "翻译一段文本" | LangChain | LCEL 链式调用简洁高效 |
| "Agent 需要调用多个工具" | **LangGraph** | 需要循环判断是否要继续调用工具 |
| "用户下单需要审核" | **LangGraph** | Interrupt 实现审批流程 |
| "客服机器人需要上下文" | **LangGraph** | Checkpointer 持久化对话 |
| "需要调试 Agent 行为" | **LangGraph** | Time Travel 回溯状态 |
| "Agent 需要在云端部署" | **LangGraph** | 内置部署支持 |
| "写个简单的 API 包装" | LangChain | 轻量，无额外依赖 |

---

## 🧪 代码对比：同一需求两种写法

### 需求：写一个能查天气和查时间的工具型助手

#### LangChain 方式（链式）

```typescript
import { ChatAnthropic } from "@langchain/anthropic";
import { tool } from "@langchain/core/tools";

const model = new ChatAnthropic({ model: "claude-sonnet-4-6" });

// 定义工具
const weatherTool = tool(async ({ city }) => {
  return `${city} 的天气是晴天，25°C`;
}, {
  name: "get_weather",
  description: "查询天气",
  schema: z.object({ city: z.string() }),
});

const timeTool = tool(async ({ city }) => {
  return `${city} 的当前时间是 14:30`;
}, {
  name: "get_time",
  description: "查询时间",
  schema: z.object({ city: z.string() }),
});

const modelWithTools = model.bindTools([weatherTool, timeTool]);

// ❌ LangChain 的链式调用只支持线性流程
// 如果 LLM 连续调用了两个工具，链式调用就处理不了
// 需要自己写循环
const response = await modelWithTools.invoke("北京天气怎么样？");
// ✅ 一次调用没问题
// ❌ "先查天气再查时间"这种连续工具调用很麻烦
```

**问题**：当 LLM 需要多次调用工具时，LangChain 没有内置的循环机制。

#### LangGraph 方式（图）

```typescript
import { StateGraph, StateSchema, MessagesValue, ToolNode, START, END } from "@langchain/langgraph";

const State = new StateSchema({ messages: MessagesValue });

// 用同样的工具
const tools = [weatherTool, timeTool];
const modelWithTools = model.bindTools(tools);

// LLM 节点
const llmCall: GraphNode<typeof State> = async (state) => {
  const response = await modelWithTools.invoke([
    { role: "system", content: "你是一个助手，可以查天气和时间。" },
    ...state.messages,
  ]);
  return { messages: [response] };
};

// 工具节点（自动处理所有工具调用）
const toolNode = new ToolNode(tools);

// 条件边——循环判断
const shouldContinue = (state) => {
  const lastMessage = state.messages.at(-1);
  return lastMessage?.tool_calls?.length ? "toolNode" : END;
};

// ✅ 图可以自动处理多次工具调用的循环
const graph = new StateGraph(State)
  .addNode("llmCall", llmCall)
  .addNode("toolNode", toolNode)
  .addEdge(START, "llmCall")
  .addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
  .addEdge("toolNode", "llmCall")  // 循环！
  .compile();

// 不管 LLM 调用多少次工具，图都会自动处理
const result = await graph.invoke({
  messages: [{ role: "user", content: "先查北京的天气，再查东京的时间" }],
});
```

---

## 🧠 换个角度：从「数据结构」理解

这是一个很好的理解角度：

| | LangChain | LangGraph |
|---|-----------|-----------|
| **数据结构** | 列表（List） | 图（Graph） |
| **执行方式** | 遍历列表 | 遍历图 |
| **复杂度** | O(n) 线性 | O(n) 可能有环 |

**LangChain 的链 = 一个列表：**
```
[步骤1, 步骤2, 步骤3, ..., 步骤N]
```
每次按顺序执行一个步骤，执行完就结束。

**LangGraph 的图 = 一个有向图：**
```
   ┌──── A ────┐
   │           │
START       条件判断
   │           │
   └──── B ────┘
       │
   条件判断
    /    \
  C      D
   \    /
    END
```
可以在图中循环、分支、合并，灵活得多。

---

## 🎯 最佳实践：什么时候混用？

实际项目中，你很少只用其中一个。最佳实践是：

### 组合使用模式

```
┌─────────────────────────────────────┐
│  LangGraph Graph（编排层）            │
│  ┌───────────────────────────────┐  │
│  │  LangChain 工具和模型（工具层） │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │  LangChain 工具（@tool） │  │  │
│  │  │  LangChain 模型（Model） │  │  │
│  │  │  LangChain 向量存储（VS）│  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
│                                      │
│  角色：LangGraph 控制"什么时候做"     │
│        LangChain 提供"具体怎么做"     │
└─────────────────────────────────────┘
```

### 一个典型项目结构

```typescript
// 1️⃣ LangChain：定义工具
const searchTool = tool(...);
const weatherTool = tool(...);

// 2️⃣ LangChain：定义模型
const model = new ChatAnthropic({ model: "claude-sonnet-4-6" });
const modelWithTools = model.bindTools([searchTool, weatherTool]);

// 3️⃣ LangGraph：定义状态
const State = new StateSchema({
  messages: MessagesValue,
  orderInfo: z.string().optional(),
});

// 4️⃣ LangGraph：定义节点（内部使用 LangChain）
const llmCall: GraphNode<typeof State> = async (state) => {
  const response = await modelWithTools.invoke([
    { role: "system", content: "你是客服助手" },
    ...state.messages,
  ]);
  return { messages: [response] };
};

// 5️⃣ LangGraph：编排工作流
const agent = new StateGraph(State)
  .addNode("llmCall", llmCall)
  .addNode("toolNode", new ToolNode([searchTool, weatherTool]))
  .addEdge(START, "llmCall")
  .addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
  .addEdge("toolNode", "llmCall")
  .compile({ checkpointer: new MemorySaver() });
```

---

## 📝 本章小结

- ✅ LangChain 是 **工具箱**，LangGraph 是 **建筑队**
- ✅ LangChain 适合线性、简单的 LLM 调用；LangGraph 适合复杂、有状态的 Agent 工作流
- ✅ **两者不是竞争关系，是互补关系**
- ✅ 一个典型项目：LangChain 提供模型和工具，LangGraph 提供编排和状态管理
- ✅ 从数据结构理解：LangChain = 列表，LangGraph = 图
- ✅ 需要循环、持久化、人机交互时，选 LangGraph

### 最终决策树

```
你的任务需要？
│
├─ 只调一次 LLM → LangChain
├─ 简单的链式处理（A→B→C） → LangChain
├─ 需要调用工具 → 考虑 LangGraph
├─ 需要多次工具调用循环 → LangGraph ✅
├─ 需要记忆/持久化 → LangGraph ✅
├─ 需要人工审批 → LangGraph ✅
├─ 需要容错恢复 → LangGraph ✅
├─ 需要调试和回放 → LangGraph ✅
└─ 需要并行任务 → LangGraph ✅
```

## ➡️ 下一章预告

> 下一章是**综合实战项目**——我们将用学到的所有知识点，从 0 到 1 构建一个生产级的智能客服 Agent！
> [下一章：综合实战项目 →](./capstone-project.md)
