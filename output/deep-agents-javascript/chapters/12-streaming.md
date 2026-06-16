# 第12章 流式传输与实时进度

> 预计学习时间：1 小时

## 🎯 本章目标

学习完本章，你将能够：
- 理解三种流式传输模式（values / messages / events）
- 使用 `agent.stream()` 实现实时 Token 输出
- 使用 `agent.streamEvents()` 追踪子代理进度
- 使用 React `useStream` Hook 构建交互式 UI
- 实现 Headless Tools（浏览器端工具执行）
- 构建 SubagentCard、TodoList 等前端组件

## 📋 前置知识

> 如果你还没有学习以下内容，建议先完成：
> - [第2章 核心概念与架构](./02-core-concepts.md) —— 了解 stream/streamEvents 调用模式
> - [第11章 子代理系统](./11-subagents.md) —— 了解子代理的 Token 流辨识

## 💡 核心概念

### 12.1 为什么需要流式传输？

**用一个类比来理解：**

> 没有流式传输时，用户问一个问题，要等 Agent 全部思考完才能看到答案——就像外卖必须等做好才送，中间看不到厨师在切菜还是炒菜。有了流式传输，Agent 一边思考一边告诉你进度——"正在查资料...找到了第1条...正在分析..."——就像开放厨房，你能看到厨师每一步操作。

**流式传输的价值：**
- ⏱️ **降低等待感知**：用户不用干等，即时看到反馈
- 🔍 **可视化思考过程**：用户能看到 Agent 在做什么
- 🎨 **丰富的 UI 交互**：实时更新进度条、思维气泡

> **💡 流式传输的典型应用场景：**
> 1. **聊天机器人**：逐字显示 AI 回复，用户无需等待全部生成
> 2. **代码生成工具**：边生成边显示代码，用户可以提前看到部分结果
> 3. **数据分析 Agent**：实时展示查询进度、中间结果和最终报告
> 4. **多代理协作系统**：分别展示每个子代理的工作进展和输出

### 12.2 三种流式模式

Deep Agents 提供了三种不同的流式模式，分别适用于不同的场景。理解它们的区别，可以帮助你选择最合适的方案：

| 模式 | 返回内容 | 适用场景 | 数据量 |
|------|---------|---------|:-----:|
| **values** | 每次返回当前完整状态（包含所有消息） | 需要完整对话状态的场景 | 大 |
| **messages** | 只返回新增的消息内容（Token 级别） | 实时文本输出，前端逐字显示 | 小 |
| **events** (v3 API) | 事件驱动的细粒度流 | 需要区分主/子代理、追踪子任务进度 | 灵活 |

```
┌──────────────────────────────────────────────────┐
│ streamMode: "values"                              │
│ 每次返回当前完整状态                                │
│ ✅ 容易理解，数据完整                              │
│ ❌ 数据量大，重复信息多                            │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ streamMode: "messages"                            │
│ 只返回新消息（Token 级流式）                      │
│ ✅ 轻量，适合实时输出                              │
│ ✅ 支持子代理来源辨识                              │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ streamEvents() — v3 API                          │
│ 事件驱动，细粒度控制                               │
│ ✅ 区分主 Agent 和子 Agent 事件                   │
│ ✅ 支持 Promise.all() 并行处理                    │
└──────────────────────────────────────────────────┘
```

> **💡 为什么这样做？**
> 提供三种流式模式而不是一种，是因为不同的前端场景对数据的需求完全不同。聊天机器人需要逐字输出（messages），让用户感受不到等待；管理后台需要完整的对话快照（values），方便保存和回溯；而多代理协作系统则需要区分每个子代理的事件流（events），才能在前端分别渲染不同的 UI 组件。选择正确的流式模式，可以显著提升用户体验并减少不必要的数据传输。

> **💡 如何选择？**
> - 如果你只需要在终端或日志中看到 Agent 的实时输出，使用 **messages** 模式就够了
> - 如果你需要在前端展示完整的对话状态（包括历史消息），使用 **values** 模式
> - 如果你正在构建复杂的 UI，需要区分主 Agent 和子 Agent 的事件、或者需要追踪子任务的完成进度，使用 **events** 模式

### 12.3 `agent.stream()` — 基础流式传输

#### streamMode: "values"

```typescript
const stream = await agent.stream(
  {
    messages: [
      { role: "user", content: "Research AI trends." },
    ],
  },
  { streamMode: "values" }  // 每次返回完整状态
);

for await (const chunk of stream) {
  const lastMsg = chunk.messages.at(-1);

  if (lastMsg?.tool_calls?.length) {
    console.log(`🔧 Tools: ${lastMsg.tool_calls.map(tc => tc.name).join(", ")}`);
  }

  if (lastMsg?.content && typeof lastMsg.content === "string") {
    process.stdout.write(lastMsg.content);  // 实时输出
  }
}
```

#### streamMode: "messages"（Token 级流）

```typescript
const stream = await agent.stream(
  {
    messages: [
      { role: "user", content: "Write a haiku about coding." },
    ],
  },
  { streamMode: "messages" }
);

for await (const [namespace, chunk] of stream) {
  const [message] = chunk;
  if (message?.text) {
    process.stdout.write(message.text);  // 逐 Token 输出
  }
}
```

### 12.4 `agent.streamEvents()` — 事件流（v3 API）

对于需要细粒度控制的高级场景，Deep Agents 提供了 `streamEvents()` 方法。这是最新的 v3 API，它基于事件驱动模型，能够精确地区分主 Agent 和子 Agent 产生的事件。这样一来，当你构建复杂的多代理系统时，你能清楚地知道每个事件来自哪个 Agent，从而在前端渲染出不同的 UI 组件。这对于构建"Agent 思维可视化"的工具来说尤其重要——你可以分别展示主 Agent 的推理过程和子 Agent 的执行进展。

最强大的流式 API，同时处理主 Agent 和子代理：

```typescript
import { createDeepAgent } from "deepagents";

const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  subagents: [{
    name: "research-agent",
    description: "Research assistant",
    systemPrompt: "You are a great researcher. Return a brief summary.",
  }],
});

async function streamWithSubagents() {
  const stream = await agent.streamEvents(
    {
      messages: [
        { role: "user", content: "Research recent advances in quantum computing." },
      ],
    },
    { version: "v3" }
  );

  // 并行处理主 Agent 和子代理消息
  await Promise.all([
    // 处理主 Agent 消息
    (async () => {
      for await (const message of stream.messages) {
        console.log("[coordinator]", await message.text);
      }
    })(),
    // 处理子代理消息
    (async () => {
      for await (const subagent of stream.subagents) {
        console.log(`[${subagent.name}] started`);
        for await (const message of subagent.messages) {
          console.log(`[${subagent.name}]`, await message.text);
        }
      }
    })(),
  ]);
}
```

### 12.5 子代理 Token 流辨识

在使用子代理架构时，一个关键挑战是如何区分主 Agent 的输出和子 Agent 的输出。如果所有内容混在一起，用户无法知道每段结果来自谁。Deep Agents 通过 `subgraphs: true` 参数配合命名空间（namespace）追踪每条消息的来源：

> **💡 为什么要区分来源？**
> 如果你的系统有一个"搜索"子代理和一个"翻译"子代理，它们的输出如果混在一起，用户会困惑——这段是搜索结果还是翻译结果？通过命名空间区分，你可以为每个子代理绘制独立的 UI 区域。

```typescript
async function streamWithSourceTracking() {
  let currentSource = "";

  for await (const [namespace, chunk] of await agent.stream(
    {
      messages: [{ role: "user", content: "Research quantum computing advances" }],
    },
    { streamMode: "messages", subgraphs: true }
  )) {
    const [message] = chunk;
    const isSubagent = namespace.some((s: string) => s.startsWith("tools:"));

    if (isSubagent) {
      const subagentNs = namespace.find((s: string) => s.startsWith("tools:"))!;
      if (subagentNs !== currentSource) {
        process.stdout.write(`\n\n--- [${subagentNs}] ---\n`);
        currentSource = subagentNs;
      }
    } else {
      if ("main" !== currentSource) {
        process.stdout.write(`\n\n--- [main agent] ---\n`);
        currentSource = "main";
      }
    }

    if (message.text) {
      process.stdout.write(message.text);
    }
  }
}
```

### 12.6 React `useStream` Hook

`@langchain/react` 包提供了 `useStream` Hook，让前端轻松接入 Agent：

```bash
npm install @langchain/react
```

#### 基础聊天 UI

```tsx
import { useStream } from "@langchain/react";

const AGENT_URL = "http://localhost:2024";

function Chat() {
  const stream = useStream<typeof agent>({
    apiUrl: AGENT_URL,
    assistantId: "agent",
  });

  return (
    <div>
      {stream.messages.map((msg) => (
        <Message key={msg.id} message={msg} />
      ))}
      <input
        type="text"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            stream.submit(e.currentTarget.value);
            e.currentTarget.value = "";
          }
        }}
      />
    </div>
  );
}
```

#### Todo List 实时进度

```tsx
import { useStream } from "@langchain/react";

function TodoAgent() {
  const stream = useStream<typeof myAgent>({
    apiUrl: AGENT_URL,
    assistantId: "deep_agent_todo_list",
  });

  const todos = stream.values?.todos ?? [];

  const completed = todos.filter((t) => t.status === "completed").length;
  const percentage = todos.length
    ? Math.round((completed / todos.length) * 100)
    : 0;

  return (
    <div>
      <h2>Agent Progress</h2>
      <p>{completed}/{todos.length} tasks ({percentage}%)</p>
      <ul>
        {todos.map((todo, i) => (
          <li key={i} style={{
            color: todo.status === "completed" ? "green" :
                   todo.status === "in_progress" ? "blue" : "gray"
          }}>
            {todo.status === "in_progress" ? "⏳" :
             todo.status === "completed" ? "✅" : "⏺"} {todo.description}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

#### 子代理 UI 卡片

```tsx
import { useStream } from "@langchain/react";
import { AIMessage, HumanMessage } from "langchain";

function DeepAgentChat() {
  const stream = useStream<typeof myAgent>({
    apiUrl: AGENT_URL,
    assistantId: "deep_agent_subagent_cards",
  });

  const subagents = [...stream.subagents.values()];
  const subagentsByCallId = new Map(subagents.map((s) => [s.id, s]));

  return (
    <div>
      {stream.messages.map((msg) => {
        const turnSubagents = AIMessage.isInstance(msg)
          ? (msg.tool_calls ?? [])
              .map((tc) => subagentsByCallId.get(tc.id ?? ""))
              .filter(Boolean)
          : [];

        return (
          <div key={msg.id}>
            {HumanMessage.isInstance(msg) && <div className="user-msg">{msg.text}</div>}
            {AIMessage.isInstance(msg) && msg.text.trim() && (
              <div className="ai-msg">{msg.text}</div>
            )}
            {turnSubagents.map((subagent) => (
              <div key={subagent.id} className="subagent-card">
                <h4>🔬 {subagent.name}</h4>
                {/* 子代理的实时输出 */}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
```

#### 重连与状态恢复

```tsx
function App() {
  const stream = useStream<typeof agent>({
    apiUrl: "https://your-deployment.langsmith.dev",
    assistantId: "agent",
    reconnectOnMount: true,    // 页面刷新后自动恢复流
    fetchStateHistory: true,   // 加载完整对话历史
  });
}
```

### 12.7 Headless Tools（浏览器端工具）

Headless Tools 让 Agent 调用在**浏览器端执行的工具**——访问 Geolocation、IndexedDB、本地存储等：

```typescript
// 1. 在 Agent 端定义工具 Schema（不含实现）
import { tool } from "langchain";
import { z } from "zod";

export const geolocationGet = tool({
  name: "geolocation_get",
  description: "Get the user's current location",
  schema: z.object({
    save: z.boolean().optional().describe("Save to memory"),
  }),
});

// 2. 在前端实现工具逻辑
import { geolocationGet as geolocationGetDef } from "./tools";

const geolocationGetImpl = geolocationGetDef.implement(async ({ save }) => {
  const position = await new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject)
  );
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
});

// 3. 在 useStream 中注册
function Chat() {
  const stream = useStream<AgentState>({
    apiUrl: AGENT_URL,
    assistantId: "headless_tools",
    tools: [geolocationGetImpl],  // 浏览器端实现
  });
  // ...
}
```

---

## 🔨 实战演练

### 练习 1：流式输出到终端

**场景描述：**
构建一个 Agent，在终端中实时显示它的思考和工具调用过程。

**你的任务：**
1. 使用 `createDeepAgent` 创建一个包含搜索工具的 Agent
2. 使用 `agent.stream()` 的 values 模式获取实时输出
3. 在终端中分别显示工具调用和文本输出
4. 观察不同输出类型的实时打印效果

<details>
<summary>🧑‍💻 先自己尝试，写完再展开看参考答案</summary>

**参考代码：**

```typescript
import { createDeepAgent } from "deepagents";
import { tool } from "langchain";
import { z } from "zod";

const search = tool(
  async ({ query }) => `Results for: ${query}`,
  {
    name: "search",
    description: "Search the web",
    schema: z.object({ query: z.string() }),
  }
);

const agent = createDeepAgent({
  tools: [search],
  systemPrompt: "You are a research assistant. Search and synthesize.",
});

async function main() {
  console.log("🤖 Agent is thinking...\n");

  const stream = await agent.stream(
    {
      messages: [{ role: "user", content: "What are the latest AI trends?" }],
    },
    { streamMode: "values" }
  );

  for await (const chunk of stream) {
    const lastMsg = chunk.messages.at(-1);

    if (lastMsg?.tool_calls?.length) {
      for (const tc of lastMsg.tool_calls) {
        console.log(`\n🔧 ${tc.name}`);
        console.log(`   Args: ${JSON.stringify(tc.args)}`);
      }
    }

    if (lastMsg?.content && typeof lastMsg.content === "string") {
      process.stdout.write(lastMsg.content);
    }
  }
}

main().catch(console.error);
```
</details>

**预期输出：**

```
🤖 Agent is thinking...

🔧 search
   Args: {"query":"latest AI trends 2024"}

[实时输出内容逐段显示...]

根据搜索结果，2024年最值得关注的人工智能趋势包括：
1. 多模态 AI 的快速发展...
2. Agent 系统的广泛采用...
3. ...
```

---

## ⚡ 进阶技巧

### 技巧一：使用 `useStream` 的完整配置

`useStream` 是 Deep Agents 提供的 React Hook，用于在前端页面中与 Agent 建立流式连接。它的设计目标是让前端开发者不需要了解 Agent 的内部通信细节，只需要传入配置参数即可获得完整的实时交互能力。

> **💡 核心配置项解析：**
> - `reconnectOnMount: true` —— 当用户刷新页面后，自动恢复之前的流式连接，不会丢失上下文。这对于需要保持对话连续性的应用场景非常重要。
> - `fetchStateHistory: true` —— 页面加载时自动获取完整的对话历史，让用户看到之前的对话记录，避免对话中断的割裂感。
> - 这两个配置项结合使用，可以给用户"对话从未中断"的流畅体验，非常适合聊天类和客服类的应用。

```typescript
const stream = useStream<typeof agent>({
  apiUrl: AGENT_URL,
  assistantId: "agent",
  // 高级配置
  reconnectOnMount: true,
  fetchStateHistory: true,
  // 自定义工具（Headless Tools）
  tools: [myToolImpl1, myToolImpl2],
});
```

### 技巧二：Sandbox 前端集成

```typescript
// 获取沙箱文件树
async function fetchTree(threadId: string): Promise<FileEntry[]> {
  const res = await fetch(
    `${AGENT_URL}/sandbox/${encodeURIComponent(threadId)}/tree?filePath=/app`
  );
  const data = await res.json();
  return data.entries.filter((e) => !e.path.includes("node_modules"));
}

// 在 React 中使用
function SandboxView({ threadId }) {
  const [files, setFiles] = useState([]);
  useEffect(() => {
    fetchTree(threadId).then(setFiles);
  }, [threadId]);

  return (
    <div className="file-tree">
      {files.map((f) => (
        <div key={f.path}>{f.type === "directory" ? "📁" : "📄"} {f.name}</div>
      ))}
    </div>
  );
}
```

> **💡 使用流式传输时的性能注意事项：**
> 流式传输虽然用户体验好，但也有一些性能方面的考虑：
> 1. **Token 生成速度取决于模型** —— 快速模型（如 Haiku、Flash）适合流式，慢速模型（如 Opus）流式效果可能不理想
> 2. **网络延迟影响感知** —— 如果用户和服务器之间的网络延迟较高，流式输出的"逐字显示"效果会打折扣
> 3. **前端渲染压力** —— 频繁更新 DOM 可能导致页面卡顿，建议使用虚拟滚动或批量更新策略

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：`streamMode: "values"` 和 `streamMode: "messages"` 有什么区别？**
> A："values"模式每次返回完整的对话状态，数据量大但信息完整，适合需要保存或展示完整对话状态的场景。"messages"模式只返回新增的消息内容（Token级别），数据量小、效率高，适合实时逐字输出的场景。

**Q2：`streamEvents()` 的 v3 API 有什么独特优势？**
> A：它的事件驱动模型能够精确区分主 Agent（messages）和子代理（subagents）的事件流。你可以用 Promise.all() 并行处理不同来源的事件，在前端分别渲染主 Agent 的气泡和子代理的卡片。

**Q3：`useStream` Hook 返回的 `stream` 对象包含哪些关键属性？**
> A：messages（完整的消息列表）、values（当前完整状态）、toolCalls（实时工具调用信息）、subagents（子代理的独立状态）、submit（发送消息的方法）、error（错误状态）。

**Q4：Headless Tools 解决了什么问题？**
> A：让 Agent 能够调用只能在浏览器端执行的 API（如 Geolocation 地理位置、IndexedDB 本地数据库、localStorage 存储等）。工具的 Schema 在服务器端的 Agent 定义，具体的实现在前端页面中执行。

**Q5：为什么需要子代理 Token 流辨识？**
> A：当多个子代理并行工作时，如果不区分 Token 来源，用户无法知道输出的内容来自哪个子代理。通过命名空间追踪，可以为每个子代理渲染独立的 UI 区域，提升用户体验。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `streamMode must be 'values' or 'messages'` | 参数错误 | 使用正确的 streamMode 值 |
| `useStream requires apiUrl` | 未配置 API 地址 | 传入 `apiUrl` 和 `assistantId` |
| Headless Tool 不执行 | 工具实现未注册到 useStream | 在 `tools` 参数中传入实现 |
| 子代理事件不触发 | 未使用 streamEvents 或 subgraphs | 使用 `streamEvents({version: "v3"})` 并确保 subgraphs 参数为 true |
| 流式输出卡顿 | Token 生成速度慢或网络延迟高 | 检查模型提供商的状态，或切换为更快的模型（如 Haiku、Flash） |

---

## 📝 本章小结

- ✅ 三种流式模式：values（完整状态，数据量大但信息完整）、messages（Token 级流式，轻量高效）、events（事件驱动，支持细粒度控制）
- ✅ `agent.streamEvents()` v3 API 可以同时处理主 Agent 和子代理的事件流，用 Promise.all() 并行处理
- ✅ `useStream` Hook 提供了 React 前端集成的标准方案，支持重连和状态恢复
- ✅ TodoList 实时进度追踪通过读取 agent state 中的 todos 实现
- ✅ SubagentCard 组件可以分别展示每个子代理的实时输出
- ✅ Headless Tools 让 Agent 能够调用浏览器端 API（如地理位置、本地存储等）
- ✅ 支持页面刷新后的自动重连和对话状态恢复，提升用户体验

## ➡️ 下一章预告

> 在下一章中，我们将进入生产就绪的高级主题——ACP 协议与服务端部署，学习如何启动 Deep Agents Server、配置多 Agent 服务端，以及与 IDE 的集成。
>
> [第13章 ACP 协议与服务端](./13-acp-server.md)
