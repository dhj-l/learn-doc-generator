# 第2章：架构设计与技术选型

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **根据项目需求设计完整的系统架构**
- **理解 LangGraph StateGraph 的状态管理原理**
- **做出明智的技术选型决策**

## 📋 前置知识

> 建议先完成 [第1章：项目选择与需求分析](./01-project-overview.md)。

---

## 💡 核心概念

### 概念一：分层架构设计模式

**生活类比：** 分层架构就像一座现代化写字楼——每层有独立的电梯（API 接口），保安在入口检查证件（认证），修整某一层的水管不影响整栋楼正常使用。

```
┌─────────┐     ┌──────────┐     ┌───────────┐     ┌──────────┐
│  前端 UI ├────►│ API 层   ├────►│  Agent 层  ├────►│ MCP 工具  │
│ Vue/React │    │ Hono/Express│   │ LangGraph │     │  Server   │
└─────────┘     └────┬─────┘     └─────┬─────┘     └──────────┘
                     │                  │
                     ▼                  ▼
                ┌──────────┐     ┌──────────┐
                │ 数据库/   │     │ LLM API  │
                │ 向量存储   │     │ Claude   │
                └──────────┘     └──────────┘
```

### 概念二：LangGraph StateGraph 状态管理理论

**生活类比：** StateGraph 就像一份「旅行攻略」。攻略上记录了你当前的「状态」（在哪个城市、还剩多少钱、已经去了哪些景点），以及「决策规则」（如果下雨就去博物馆，如果晴天就去公园）。每次你执行一个行动（游览一个景点），攻略上的状态就会被更新。LangGraph 的 StateGraph 就是这种「状态 + 决策规则 + 行动」的结构化描述。

#### 状态管理的核心原理

根据 LangGraph 官方文档，StateGraph 的状态管理基于三个核心概念：

**1. State（状态）— 应用程序的"内存"**

```typescript
import { StateGraph, Annotation } from '@langchain/langgraph';

// 定义 Agent 的状态结构
const AgentState = Annotation.Root({
  // messages：对话消息列表
  // reducer 定义了如何合并状态更新
  messages: Annotation<any[]>({
    reducer: (current, update) => [...current, ...update], // 追加模式
    default: () => [],
  }),
  // iterations：迭代计数（简单覆盖）
  iterations: Annotation<number>({
    reducer: (current, update) => current + update, // 累加模式
    default: () => 0,
  }),
});
```

> **💡 为什么需要 Reducer？** 在 Agent 的多次执行步骤中，每个节点（Node）可能只更新状态的某一部分。Reducer 定义了当多个节点并发更新同一状态时如何合并。`append` 模式用于消息列表（每条消息都很重要），`replace` 模式用于计数器（只需最新值）。

**2. Node（节点）— 执行单元**

每个 Node 是一个 async 函数，接收当前状态，返回状态更新：

```typescript
// Agent Node — LLM 推理
const agentNode = async (state: typeof AgentState.State) => {
  const response = await model.invoke(state.messages);
  return { messages: [response], iterations: 1 };
};

// Tool Node — 工具执行
const toolNode = async (state: typeof AgentState.State) => {
  const lastMessage = state.messages[state.messages.length - 1];
  const results = await Promise.all(
    lastMessage.tool_calls.map(executeTool)
  );
  return { messages: results };
};
```

**3. Edge（边）— 控制流**

Edge 定义了执行的顺序和条件：

```typescript
const workflow = new StateGraph(AgentState)
  .addNode('agent', agentNode)    // 添加节点
  .addNode('tools', toolNode)
  .addEdge('__start__', 'agent')  // 固定边：起点 → agent
  .addConditionalEdges(           // 条件边：由 router 决定
    'agent',
    (state) => state.messages.at(-1)?.tool_calls?.length ? 'tools' : '__end__',
    { tools: 'tools', __end__: '__end__' }
  )
  .addEdge('tools', 'agent')      // 循环边：tools → agent
  .compile();                     // 编译为可执行图
```

**4. Checkpointer（检查点）— 持久化**

根据 LangGraph 官方文档，Checkpointer 提供了持久化层，在每个超级步骤（superstep）保存状态的检查点：

```typescript
import { InMemorySaver } from '@langchain/langgraph';

// 内存检查点（开发环境）
const memory = new InMemorySaver();
const graph = workflow.compile({ checkpointer: memory });

// 带检查点的调用
const config = { configurable: { thread_id: 'user-123' } };
const result = await graph.invoke(
  { messages: [{ role: 'user', content: '你好' }] },
  config
);

// 从检查点恢复
const savedState = await memory.get(config);
```

> **💡 为什么 Checkpointer 对 Agent 如此重要？** 没有 Checkpointer，每次调用 Agent 都是"一次性"的——Agent 不记得之前的对话。有了 Checkpointer，Agent 可以实现多轮对话的记忆、人工介入（Human-in-the-Loop）、以及失败后的断点续执行。

---

### 概念三：Agent 与工具的交互协议

```typescript
// 统一的工具调用协议
interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

async function executeToolCall(call: ToolCall): Promise<ToolResult> {
  const tool = toolRegistry[call.name];
  if (!tool) return { success: false, error: '未知工具' };
  try {
    const result = await tool.execute(call.arguments);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

---

### 概念四：技术选型对照表

| 组件 | 推荐方案 | 备选方案 | 适用项目 |
|------|----------|----------|----------|
| **前端框架** | Vue 3 + Vite | React + Next.js | 全部 |
| **状态管理** | Pinia | Zustand | 全部 |
| **API 层** | Hono | Express / Fastify | 全部 |
| **Agent 框架** | LangGraph | Vercel AI SDK | 全部 |
| **向量数据库** | ChromaDB | Supabase pgvector | B, C |
| **部署** | Vercel + Docker | Railway / Fly.io | 全部 |

---

## 🔨 实战演练

**场景描述：** 你选择了"智能代码助手"项目。需要完成架构设计。

**你的任务：** 画架构图 → 定义工具接口 → 确定 Agent 状态流转 → 选择技术栈 → 创建目录结构

<details>
<summary>📖 参考答案</summary>

### 工具接口
```typescript
read_file(path) → { content, size, language }
search_code(query, filePattern?) → SearchResult[]
analyze_code(filePath, analysisType) → { issues, metrics }
```

### 状态流转
```
IDLE → THINKING → TOOL_CALL → EXECUTING → EVALUATE → COMPLETE
                                         ↓ (需更多工具)
                                       THINKING（循环）
```

### 目录结构
```
code-assistant/
├── frontend/ (components/Editor, ChatPanel + stores/ + api/)
├── api/ (routes/chat + agent/graph + agent/tools)
├── docker-compose.yml + .env.example + README.md
```
</details>

---

## ⚡ 进阶技巧

### 技巧一：API 版本管理
`/api/v1/chat` 和 `/api/v2/chat` 并行，平滑升级。

### 技巧二：错误标准化
统一的 `{ success, data, error }` 响应格式。

### 技巧三：使用 LangGraph Studio 调试
`npx @langchain/langgraph-cli dev` 可视化查看 Agent 执行过程。

---

## 🧠 知识检查点

<details>
<summary>🧠 Q1：为什么架构设计要在编码之前完成？</summary>
减少返工、便于分工、可测试性、可扩展性。
</details>
<details>
<summary>🧠 Q2：StateGraph 的 Reducer 解决了什么问题？</summary>
多个节点并发更新同一状态时的合并冲突问题。
</details>
<details>
<summary>🧠 Q3：Checkpointer 对 Agent 有什么作用？</summary>
实现多轮对话记忆、人工介入、断点续执行。
</details>
<details>
<summary>🧠 Q4：MCP Server 和直接写函数有什么区别？</summary>
MCP：标准化协议、独立部署、工具发现、权限隔离。劣势：开发成本略高。
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 没有架构图直接开始编码 | 觉得太简单 | 至少画 ASCII 架构图 |
| 工具定义太抽象 | 描述不具体 | 写示例调用 |
| 数据库选型过重 | 三件套起步 | MVP 后用内存存储 |

---

## 📝 本章小结

- ✅ **四层架构** — 前端 → API → Agent → 数据
- ✅ **LangGraph 状态管理** — State + Node + Edge + Checkpointer
- ✅ **技术选型** — Vue 3 + Hono + LangGraph
- ✅ **关注点分离** — 各层独立开发部署

## ➡️ 下一章预告

> [第3章：核心功能实现](./03-implementation.md)
