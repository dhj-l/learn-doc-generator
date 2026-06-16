# 第2章 核心概念与架构

> 预计学习时间：50 分钟

## 🎯 本章目标

学习完本章，你将能够：
- 深入理解 Agent Harness 的设计哲学和核心思想
- 掌握 `createDeepAgent()` 的所有 12 个配置参数及其用途
- 区分 agent.invoke / stream / streamEvents 三种调用模式及其适用场景
- 理解 Browser 与 Node.js 运行时的功能差异和选择依据
- 掌握模型命名规范（`provider:model_id`）和 7 种提供商配置

## 📋 前置知识

> 如果你还没有学习以下内容，建议先完成：
> - [第1章 概述与环境搭建](./01-introduction.md) 的三层架构部分，了解 Harness/Framework/Runtime 的基本概念

---

## 💡 核心概念

### 2.1 Agent Harness 设计哲学

**用一个类比来理解：**

> 如果说 LangChain 是一套**工具箱**——里面装满了各种扳手、螺丝刀和测量仪器，你可以按需挑选组合；LangGraph 是一张**工作流程图**——清晰标注了每一步该做什么、做完后下一步去哪；那么 Deep Agents 就是一个**全自动工作间**——你只需要把原材料（用户需求）放进去，告诉它你要什么样的成品，它就会自动从工具箱里取出合适的工具，按照工作流程图一步步操作，中途还会自己判断是否需要调整方案，最终把成品交到你手上。

**Harness 的核心思想：**

Agent Harness 的设计理念可以用四个关键词概括：

1. **约定优于配置（Convention over Configuration）** —— 框架提供一套合理的默认值，让你在无需任何配置的情况下就能得到一个可工作的 Agent。你可以根据需要覆盖这些默认值，但不必从零开始。

2. **内置常用能力（Batteries Included）** —— 常见的需求（文件系统、任务规划、子代理、记忆）都已经内置，不需要你自己去找第三方库集成。这就像买了一台电脑，操作系统、浏览器、文本编辑器都已经预装好了。

3. **可定制但不强制（Customizable, Not Mandatory）** —— 所有内置能力都可以被替换或覆盖。如果你有特殊的文件系统需求，可以传入自定义 backend；如果你需要特殊的调用逻辑，可以添加中间件。框架提供默认实现，但不限制你的创造力。

4. **生产就绪（Production-Ready）** —— 内置了从开发到生产所需的所有要素：流式传输、权限控制、多租户支持、可观测性集成。你不需要在项目上线前额外花时间添加这些基础设施。

```typescript
// 设计哲学的代码体现 —— 默认即可用，需要时可定制

// 极简模式：遵循"约定优于配置"，0 额外配置
const defaultAgent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  systemPrompt: "You are a helpful assistant.",
});

// 完整定制模式：覆盖所有内置能力
const customizedAgent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  systemPrompt: "You are a coding assistant.",
  tools: [customTool1, customTool2],         // 自定义工具
  subagents: [specialistAgent],              // 自定义子代理
  backend: new FilesystemBackend({           // 自定义文件系统
    rootDir: "./workspace",
  }),
  permissions: [                             // 自定义权限
    { operations: ["write"], paths: ["/**"], mode: "deny" },
  ],
  middleware: [loggingMiddleware],           // 自定义中间件
});
```

### 2.2 `createDeepAgent()` 完整参数解析

`createDeepAgent` 是 Deep Agents 的核心 API，它接受一个 `DeepAgentConfig` 配置对象。理解每个参数的作用和适用场景，是高效使用 Deep Agents 的关键。

```typescript
import { createDeepAgent, CompositeBackend, FilesystemBackend } from "deepagents";

const agent = await createDeepAgent({
  // ==== 必填参数（仅 1 个）====
  model: "anthropic:claude-sonnet-4-6",

  // ==== 基础可选参数 ====
  systemPrompt: "You are a helpful assistant.",     // Agent 的行为定义
  tools: [searchTool, fetchTool],                    // Agent 可调用的工具
  subagents: [researchAgent, codingAgent],            // 子代理配置
  memory: ["./AGENTS.md", "~/.deepagents/preferences.md"], // 长期记忆
  skills: ["./skills/", "~/.deepagents/skills/"],    // 技能目录

  // ==== 高级配置参数 ====
  backend: new CompositeBackend(                      // 文件系统后端
    new FilesystemBackend({ rootDir: "./workspace" })
  ),
  checkpointer: new MemorySaver(),                    // 状态持久化
  store: new InMemoryStore(),                          // 数据存储
  contextSchema: z.object({ userId: z.string() }),    // 运行时上下文
  permissions: [                                       // 权限规则
    { operations: ["write"], paths: ["/**"], mode: "deny" },
  ],
  middleware: [myMiddleware],                          // 中间件
});
```

#### 参数详解与选择指南

| 参数 | 类型 | 必填 | 说明 | 何时使用 |
|------|------|------|------|---------|
| `model` | `string` | ✅ | 模型标识，格式 `provider:model_id` | **始终需要** |
| `systemPrompt` | `string` | ❌ | 系统提示词，定义 Agent 的角色和行为 | 需要控制 Agent 行为时 |
| `tools` | `Tool[]` | ❌ | 工具列表，Agent 可调用的外部能力 | Agent 需要访问外部系统时 |
| `subagents` | `SubAgentConfig[]` | ❌ | 子代理配置，用于任务委派 | 需要多 Agent 协同时 |
| `memory` | `string[]` | ❌ | 记忆文件路径列表 | 需要跨对话记住信息时 |
| `skills` | `string[]` | ❌ | 技能目录路径列表 | 需要按需加载专业知识时 |
| `backend` | `Backend` | ❌ | 文件系统后端（默认 StateBackend） | 需要持久化文件系统时 |
| `checkpointer` | `BaseCheckpointSaver` | ❌ | 状态检查点 | 需要跨请求对话持久化时 |
| `store` | `BaseStore` | ❌ | 存储后端 | 需要共享数据时 |
| `contextSchema` | `ZodSchema` | ❌ | 运行时上下文 Schema | 需要传递用户身份等上下文时 |
| `permissions` | `FilesystemPermission[]` | ❌ | 文件系统权限规则 | 需要安全防护时 |
| `middleware` | `Middleware[]` | ❌ | 中间件列表 | 需要自定义处理逻辑时 |

> **💡 参数选择原则：** 从最小配置开始，按需添加。大多数场景只需要 `model` + `systemPrompt` + `tools` 三个参数就能工作得很好。

### 2.3 三种调用模式

Deep Agents 提供三种调用方式，它们的区别在于**返回结果的粒度**和**实时性**：

```typescript
// 调用模式选择指南
//
// agent.invoke()       → 简单直接，等全部完成
// agent.stream()       → 中间状态快照，实时追踪进度
// agent.streamEvents() → 细粒度事件流，追踪子代理
```

```
┌──────────────────────────────────────────────────┐
│                agent.invoke()                     │
│  输入 → [Agent 完整处理] → 输出                   │
│  适用：简单问答、无需中间结果的场景                │
│  特点：最简单，等待全部完成后一次性返回              │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│                agent.stream()                     │
│  输入 → [chunk1] → [chunk2] → ... → [chunkN]    │
│  适用：需要展示中间进度、流式输出的场景             │
│  特点：每次返回当前完整状态的快照                   │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│            agent.streamEvents()                   │
│  输入 → [事件1] → [事件2] → ... → [事件N]       │
│  适用：需要细粒度事件追踪（子代理、工具调用等）     │
│  特点：区分主 Agent 和子代理事件流                  │
└──────────────────────────────────────────────────┘
```

#### 2.3.1 `agent.invoke()` — 同步调用

这是最简单的调用方式：发送消息，等待 Agent 完整处理，一次性获取结果。

```typescript
// invoke() 用法：发送问题，等待完整回答
const result = await agent.invoke({
  messages: [
    { role: "user", content: "What is the capital of France?" },
  ],
});

// 获取最后一条消息（即 Agent 的回答）
console.log(result.messages.at(-1)?.content);
// 预期输出: The capital of France is Paris.
```

**适用场景：** 简单问答、不需要中间结果的单轮对话、批处理任务。

#### 2.3.2 `agent.stream()` — 流式调用

逐步获取每次状态变化后的完整快照，让你可以实时观察 Agent 的思考过程：

```typescript
// stream() 用法：逐步获取中间状态
const stream = await agent.stream(
  {
    messages: [
      { role: "user", content: "Search for AI news and summarize." },
    ],
  },
  { streamMode: "values" }  // 每次返回当前完整状态
);

// 遍历每个中间状态
for await (const chunk of stream) {
  const latestMessage = chunk.messages.at(-1);

  if (latestMessage?.content) {
    // Agent 生成了文本内容
    console.log(`Agent: ${latestMessage.content}`);
  } else if (latestMessage?.tool_calls) {
    // Agent 调用了工具
    const toolNames = latestMessage.tool_calls.map((tc) => tc.name);
    console.log(`🔧 Calling tools: ${toolNames.join(", ")}`);
  }
}
```

**streamMode 选项对比：**

| streamMode | 返回内容 | 适用场景 |
|-----------|---------|---------|
| `"values"` | 每次返回当前**完整状态**（包含所有历史消息） | 需要完整上下文、状态驱动 UI |
| `"messages"` | 只返回**新增的消息**（更轻量） | 实时流式文本输出、Token 级显示 |

#### 2.3.3 `agent.streamEvents()` — 事件流调用（v3 API）

最强大的调用方式，专为**包含子代理**的复杂场景设计：

```typescript
// streamEvents() 用法：同时处理主 Agent 和子代理事件
const stream = await agent.streamEvents(
  {
    messages: [
      { role: "user", content: "Research quantum computing advances." },
    ],
  },
  { version: "v3" }  // 使用 v3 事件 API
});

// 使用 Promise.all 并行处理两类事件
await Promise.all([
  // 处理主 Agent（协调者）的消息
  (async () => {
    for await (const message of stream.messages) {
      console.log("[coordinator]", await message.text);
    }
  })(),

  // 处理各个子代理的消息
  (async () => {
    for await (const subagent of stream.subagents) {
      console.log(`[${subagent.name}] started`);
      for await (const msg of subagent.messages) {
        console.log(`[${subagent.name}]`, await msg.text);
      }
    }
  })(),
]);
```

> **💡 什么时候用哪种？**
> - 简单的 QA 场景 → `invoke()`（最直接）
> - 需要展示实时文本输出 → `stream()`（流式）
> - 有子代理、需要区分消息来源 → `streamEvents()`（事件级控制）

### 2.4 模型命名规范

Deep Agents 使用统一的 `provider:model_id` 格式来标识模型。这个看似简单的设计带来了巨大的灵活性——你可以在不修改任何代码的情况下切换底层模型：

```typescript
// 所有模型使用同一格式，切换只需改一个字符串
const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",  // 🟢 换成 OpenAI
  // model: "openai:gpt-5.5",            // 只需取消注释这行
});
```

**支持的模型提供商：**

```
格式: <provider>:<model_id>

示例:
  anthropic:claude-sonnet-4-6               ← Anthropic Claude
  openai:gpt-5.5                             ← OpenAI GPT
  google_genai:gemini-3.5-flash              ← Google Gemini
  openrouter:anthropic/claude-sonnet-4-6     ← OpenRouter 网关
  baseten:zai-org/GLM-5                      ← Baseten
  fireworks:accounts/fireworks/models/...    ← Fireworks
  ollama:devstral-2                          ← Ollama 本地
```

| 提供商 | 前缀 | 环境变量 | 示例 |
|--------|------|---------|------|
| Anthropic | `anthropic:` | `ANTHROPIC_API_KEY` | `anthropic:claude-sonnet-4-6` |
| OpenAI | `openai:` | `OPENAI_API_KEY` | `openai:gpt-5.5` |
| Google Gemini | `google_genai:` | `GOOGLE_API_KEY` | `google_genai:gemini-3.5-flash` |
| OpenRouter | `openrouter:` | `OPENROUTER_API_KEY` | `openrouter:anthropic/claude-sonnet-4-6` |
| Baseten | `baseten:` | `BASETEN_API_KEY` | `baseten:zai-org/GLM-5` |
| Fireworks | `fireworks:` | `FIREWORKS_API_KEY` | `fireworks:accounts/fireworks/models/qwen3p5-397b-a17b` |
| Ollama（本地） | `ollama:` | 无 | `ollama:devstral-2` |

> **💡 环境变量：** 使用哪个提供商，就必须设置对应的 API Key 环境变量。建议使用 `.env` 文件管理，不要将 Key 硬编码在代码中。

### 2.5 Browser vs Node.js 运行时

Deep Agents 针对不同运行环境提供了差异化的入口点。选择正确的入口点可以避免导入不支持的模块：

| 特性 | Node.js | Browser |
|------|---------|---------|
| 文件系统 | ✅ FilesystemBackend（真实磁盘） | ❌ StateBackend（仅内存） |
| 沙箱 | ✅ Daytona / Deno Sandbox | ❌ |
| 代码执行 | ✅ execute 工具 | ❌ |
| 入口点 | `import from "deepagents"` | `import from "deepagents/browser"` |

```typescript
// Node.js —— 完整功能，支持文件系统和沙箱
// 适用于：后端服务、CLI 工具、本地开发
import { createDeepAgent, FilesystemBackend, DenoSandbox } from "deepagents";

// Browser —— 轻量级，无文件系统，仅内存状态
// 适用于：浏览器扩展、前端演示、纯对话场景
import { createDeepAgent, StateBackend } from "deepagents/browser";

const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  // 浏览器中只能使用 StateBackend（基于内存）
  backend: new StateBackend(),
});
```

---

## 🔨 实战演练

### 练习 1：用 stream() 展示实时思考过程

**场景描述：**
构建一个带搜索功能的 Agent，当用户提问时，实时展示它的每一个思考步骤和工具调用过程，而不是等全部完成再显示结果。

**你的任务：**
1. 定义一个 `search_web` 工具
2. 使用 `createDeepAgent` 创建 Agent
3. 用 `agent.stream()` 替代 `agent.invoke()` 调用
4. 实时输出 Agent 的每个中间状态

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { createDeepAgent } from "deepagents";
import { tool } from "langchain";
import { z } from "zod";

// 第一步：定义一个搜索工具
// 在实际应用中，这个工具会调用真实的搜索 API
const searchWeb = tool(
  async ({ query }: { query: string }) => {
    // 模拟搜索结果
    return `Search results for "${query}":\n1. AI is transforming healthcare\n2. Latest AI breakthroughs in 2025\n3. How to learn AI in 30 days`;
  },
  {
    name: "search_web",
    description: "Search the web for current information",
    schema: z.object({ query: z.string() }),
  }
);

// 第二步：创建 Agent
const agent = createDeepAgent({
  tools: [searchWeb],
  systemPrompt: "You are a research assistant. Search and summarize.",
});

// 第三步：使用 stream() 实时追踪
async function streamAgentResponse() {
  console.log("🤖 Agent thinking...\n");

  const stream = await agent.stream(
    {
      messages: [
        { role: "user", content: "What are the latest AI trends?" },
      ],
    },
    { streamMode: "values" }  // 每次返回完整状态快照
  );

  // 第四步：遍历每个中间状态
  for await (const chunk of stream) {
    const lastMsg = chunk.messages.at(-1);

    // 如果 Agent 调用了工具，实时显示
    if (lastMsg?.tool_calls?.length) {
      for (const tc of lastMsg.tool_calls) {
        console.log(`🔧 Calling: ${tc.name}(${JSON.stringify(tc.args)})`);
      }
    }

    // 如果 Agent 生成了文本，实时显示
    if (lastMsg?.content && typeof lastMsg.content === "string") {
      console.log(`💬 ${lastMsg.content}`);
    }
  }
}

streamAgentResponse().catch(console.error);
```

**预期输出：**
```
🤖 Agent thinking...

🔧 Calling: search_web({"query": "latest AI trends 2025"})
💬 Let me search for the latest AI trends.
💬 Based on my research, here are the key AI trends in 2025:
1. AI is transforming healthcare with personalized medicine
2. Breakthroughs in multimodal AI models
3. AI-powered automation in software development
```

</details>

### 练习 2：多模型对比

**场景描述：**
创建一个对比工具，用三个不同模型（Claude、GPT、Gemini）回答同一个问题，观察它们的答案风格和质量的差异。这个练习帮助你理解模型选择对 Agent 输出的影响。

**你的任务：**
1. 创建一个模型列表，包含三个不同提供商的模型
2. 对每个模型创建一个临时 Agent 实例
3. 用同一个问题调用所有模型
4. 对比输出结果

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { createDeepAgent } from "deepagents";

// 定义要对比的模型列表
const models = [
  { name: "Claude Sonnet", id: "anthropic:claude-sonnet-4-6" },
  { name: "GPT-5", id: "openai:gpt-5.5" },
  { name: "Gemini Flash", id: "google_genai:gemini-3.5-flash" },
];

async function compareModels(question: string) {
  console.log(`📝 Question: ${question}\n`);

  for (const { name, id } of models) {
    console.log(`=== ${name} (${id}) ===`);

    // 为每个模型创建临时 Agent
    const agent = createDeepAgent({
      model: id,
      systemPrompt: "Answer in one sentence.",
    });

    try {
      const result = await agent.invoke({
        messages: [{ role: "user", content: question }],
      });

      console.log(`Answer: ${result.messages.at(-1)?.content}\n`);
    } catch (err) {
      // 如果某个模型不可用（如未配置 API Key），优雅地跳过
      console.log(`❌ Model unavailable: ${err}\n`);
    }
  }
}

compareModels("What is the meaning of life?").catch(console.error);
```

**预期输出：**
```
📝 Question: What is the meaning of life?

=== Claude Sonnet (anthropic:claude-sonnet-4-6) ===
Answer: The meaning of life is subjective...

=== GPT-5 (openai:gpt-5.5) ===
Answer: Life's meaning is a philosophical question...

=== Gemini Flash (google_genai:gemini-3.5-flash) ===
Answer: The meaning of life varies across cultures...
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：运行时动态选择模型

通过中间件实现根据对话轮数或内容长度动态切换模型，在简单任务上使用快速便宜的模型，在复杂任务上使用强大但较慢的模型：

```typescript
import { createAgent, createMiddleware } from "langchain";

const dynamicModel = createMiddleware({
  name: "DynamicModel",
  wrapModelCall: (request, handler) => {
    const messageCount = request.state.messages.length;

    // 根据对话轮数选择模型：简单问题用轻量模型
    const model = messageCount > 10
      ? "anthropic:claude-sonnet-4-6"  // 复杂对话用强大模型
      : "openai:gpt-5-nano";            // 早期对话用快速模型

    return handler({ ...request, model });
  },
});

const agent = createAgent({
  model: "openai:gpt-5-nano",  // 默认模型
  tools,
  middleware: [dynamicModel],
});
```

### 技巧二：使用 configurable 传递自定义配置

除了 `context` 参数外，你还可以通过 `configurable` 传递任意自定义配置：

```typescript
const result = await agent.invoke(
  { messages: [{ role: "user", content: "Hello" }] },
  {
    configurable: {
      thread_id: "conversation-123",
      // 自定义字段
      user_timezone: "Asia/Shanghai",
      ui_theme: "dark",
    },
  }
);
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：`createDeepAgent` 的 `model` 参数格式是什么？为什么这样设计？**
> A：`provider:model_id` 格式，例如 `anthropic:claude-sonnet-4-6`。这种设计的优势在于：统一接口、解耦模型提供商、运行时切换无需改代码。

**Q2：`agent.invoke()` 和 `agent.stream()` 的核心区别是什么？各自适用什么场景？**
> A：`invoke()` 等待全部完成一次性返回，适合简单问答；`stream()` 逐步返回中间状态快照，适合展示实时进度和调试。

**Q3：Browser 入口点不支持 Node.js 的哪些功能？为什么？**
> A：不支持 FilesystemBackend（真实文件系统）和 Sandbox（沙箱），因为浏览器沙箱限制无法直接访问文件系统和运行子进程。

**Q4：Deep Agents 的设计哲学中的四个核心原则是什么？**
> A：约定优于配置（默认即可用）、内置常用能力（无需自建基础设施）、可定制但不强制（所有组件可替换）、生产就绪（内置安全/权限/多租户）。

**Q5：`streamEvents()` 的 v3 API 相比 `stream()` 最大的优势是什么？**
> A：它可以区分主 Agent 和子代理的事件流，用 Promise.all 并行处理，适合包含子代理的复杂场景。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `model parameter is required` | 未传入 model | 添加 `model: "anthropic:claude-sonnet-4-6"` |
| `Unknown model provider` | 提供商前缀拼写错误 | 检查前缀：`anthropic:` / `openai:` / `google_genai:` 等 |
| `streamMode must be 'values' or 'messages'` | streamMode 参数值错误 | 使用 `"values"` 或 `"messages"` |
| `deepagents/browser` 中找不到 FilesystemBackend | 浏览器入口点不支持文件系统 | 改用 `StateBackend` 或切换到 Node.js 入口 |
| `context is not available in tool` | 工具中访问 context 但未定义 contextSchema | 在 createDeepAgent 中添加 `contextSchema` |
| 所有模型都返回 `Model unavailable` | 未配置任何 API Key | 检查环境变量是否正确设置 |

---

## 📝 本章小结

- ✅ `createDeepAgent(config)` 是核心 API，接受 12 个配置参数，但只需 1 个必填参数（model）
- ✅ 三种调用模式：`invoke()`（同步等待）、`stream()`（流式状态快照）、`streamEvents()`（事件级控制）
- ✅ 模型命名使用 `provider:model_id` 格式，支持 7 种提供商自由切换
- ✅ Browser 和 Node.js 入口点有不同的能力限制——浏览器无文件系统和沙箱
- ✅ 通过中间件可以实现运行时动态模型选择，优化成本和性能
- ✅ Deep Agents 的设计哲学：约定优于配置、内置常用能力、可定制但不强制、生产就绪

## ➡️ 下一章预告

> 在下一章中，我们将深入学习 Deep Agents 的工具系统 —— 如何使用 `tool()` 函数定义工具、理解工具调用循环的完整生命周期、实现多工具的顺序和并行调用、以及使用 `ToolRuntime` 接口访问运行时上下文。
>
> [第3章 工具系统详解](./03-tool-system.md)
