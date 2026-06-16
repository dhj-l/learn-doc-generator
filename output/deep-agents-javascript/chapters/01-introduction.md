# 第1章 概述与环境搭建

> 预计学习时间：50 分钟

## 🎯 本章目标

学习完本章，你将能够：
- 理解 Deep Agents 在整个 LangChain 生态中的定位和角色
- 区分 Agent Harness、Agent Framework、Agent Runtime 三层架构及其选择标准
- 搭建完整的 Node.js 开发环境并安装 Deep Agents 及其依赖
- 创建并运行你的第一个 Deep Agent，理解基础调用模式
- 理解多轮对话和跨请求状态持久化的实现方式

---

## 💡 核心概念

### 1.1 什么是 Deep Agents？

**用一个类比来理解：**

> 你可以把 Deep Agents 想象成一个**"全副武装的机器人操作间"**——它不仅仅给你一个机器人（AI 模型），还配备了完整的工具箱：机械臂（工具）、储物柜（文件系统）、任务看板（规划系统）、便签本（长期记忆）和一支随时待命的助手团队（子代理）。你只需要告诉它"去把这件事做了"，它就能自己规划步骤、调用工具、执行任务、并在遇到困难时调整策略，最终交付结果。

**为什么需要 Agent Harness？**

在 Deep Agents 出现之前，构建一个生产可用的 AI Agent 是一个极其繁琐的过程。想象一下，如果你要开发一个能自动搜索网络、读取文件、并生成报告的智能助手，你需要：

1. **手动编写工具调用循环** —— 你需要自己实现一个 while 循环：调用 LLM → 解析响应 → 如果有工具调用就执行 → 将结果返回给 LLM → 重复。这个循环看起来简单，但边界情况极多：工具调用失败怎么办？LLM 返回了格式错误的 JSON 怎么办？工具调用太多导致上下文超长怎么办？

2. **自己实现文件读写能力** —— 如果你想让 Agent 能读写文件，你需要额外开发一套文件系统接口，处理路径安全、权限控制、编码转换等问题。

3. **自己管理对话上下文和 Token 预算** —— 对话越长，Token 消耗越大。你需要实现对话历史的摘要机制、早期消息的淘汰策略、以及 Token 使用量的追踪。这些工作非常容易出错。

4. **自己搭建子代理调度系统** —— 当任务需要分解为多个子任务并行执行时，你需要实现子 Agent 的创建、通信、结果收集、错误处理等机制，相当于自己搭建一个微型分布式系统。

5. **自己处理权限和安全** —— 如果 Agent 需要访问敏感文件，你需要自己实现一套权限校验系统。如果做得不好，Agent 可能会意外删除重要文件或泄露敏感信息。

**Deep Agents 如何解决这些问题？**

Deep Agents 将这些**通用能力内置**到框架中，让你从繁琐的基础设施工作中解放出来，专注于业务逻辑本身：

```typescript
// 使用 Deep Agents —— 以上所有问题都已为你解决
const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  systemPrompt: "You are a helpful assistant.",
  // ✅ 工具调用循环 —— 内置
  // ✅ 文件系统 —— 内置 6 个工具
  // ✅ Token 管理 —— 自动摘要和驱逐
  // ✅ 子代理 —— 通过 subagents 配置
  // ✅ 权限控制 —— 通过 permissions 配置
});
```

你无需理解 LLM 调用循环的实现细节，也无需担心文件系统的权限校验。所有基础设施都已经内置，并且经过生产环境的验证。

```typescript
// Deep Agents 最简示例 —— 只需几行代码
import { createDeepAgent } from "deepagents";

const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  systemPrompt: "You are a helpful assistant.",
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "Hello! What can you do?" }],
});

console.log(result.messages.at(-1)?.content);
```

> **💡 为什么这段代码就能工作？**
> `createDeepAgent` 内部已经完成了 Agent 循环的搭建——它自动创建了 LLM 调用、工具调度、消息历史管理、上下文窗口控制等基础设施。你只需要指定模型和系统提示即可。

### 1.2 LangChain 生态中的三层架构

要理解 Deep Agents 的价值，必须先看清它在整个 LangChain 生态中的位置。整个 LangChain OSS JavaScript 栈分为三个清晰的层次：

```
┌─────────────────────────────────────────────────┐
│           Agent Harness（套件层）                  │
│   ┌─────────────────────────────────────────┐   │
│   │         Deep Agents SDK                │   │
│   │  内置：规划 · 文件系统 · 子代理 · 记忆    │   │
│   └─────────────────────────────────────────┘   │
├─────────────────────────────────────────────────┤
│           Agent Framework（框架层）               │
│   ┌─────────────────────────────────────────┐   │
│   │           LangChain.js                 │   │
│   │  抽象：LLM · 工具 · 中间件 · 输出解析器   │   │
│   └─────────────────────────────────────────┘   │
├─────────────────────────────────────────────────┤
│           Agent Runtime（运行时层）               │
│   ┌─────────────────────────────────────────┐   │
│   │           LangGraph                     │   │
│   │  有状态 · 持久化 · Human-in-the-Loop    │   │
│   └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

#### 每一层的定位与职责

**第一层：Agent Runtime（LangGraph）**
这一层是最底层的基础设施，负责 Agent 的**状态管理**和**执行编排**。可以把 LangGraph 想象成一张"工作流程图"——你定义好每个节点做什么、节点之间如何连线（条件边），LangGraph 负责按照你的设计执行流程，并且可以在任意节点暂停、保存进度、之后恢复执行。

LangGraph 提供：
- **有状态图执行引擎** —— Agent 的每一步都可以追踪和回放。这在调试和生产问题排查中极为有用：你可以精确地看到 Agent 在哪个步骤做出了什么决策。
- **检查点机制** —— 对话进度可以暂停、持久化、恢复。这意味着即使用户的浏览器崩溃了，重新打开后对话还可以从断点继续。
- **Human-in-the-Loop 支持** —— 在关键步骤让人类介入审批。例如，在 Agent 执行"删除文件"操作前，可以暂停执行并等待用户确认。

```typescript
// LangGraph 层面的有状态执行示例
import { StateGraph, MemorySaver } from "@langchain/langgraph";

// MemorySaver 是内置的内存检查点保存器
// 每次 Agent 执行一步，当前状态都会被自动保存
const checkpointer = new MemorySaver();

// 构建状态图 —— 定义节点之间的流转关系
// LangGraph 会按照你定义的图结构执行
```

**何时使用 LangGraph？** 当你的 Agent 需要复杂的多步骤工作流、需要在任意步骤暂停和恢复、或者需要人类在关键环节参与决策时，LangGraph 是最佳选择。

**第二层：Agent Framework（LangChain.js）**
这一层提供了构建 Agent 所需的**标准抽象**——统一的 LLM 接口、工具定义规范、输出解析器、以及可插拔的中间件系统。LangChain 的核心理念是"一切皆可组合"：你可以自由组合不同的 LLM、工具、检索器、记忆组件，而不需要关心它们底层的实现差异。

LangChain.js 提供：
- **统一的 LLM 接口** —— 无论你使用 Anthropic、OpenAI 还是 Google 的模型，调用方式完全一致
- **工具定义规范** —— 通过 `tool()` 函数，用标准化的方式定义 Agent 可调用的外部能力
- **输出解析器** —— 将 LLM 的非结构化输出解析为结构化数据
- **中间件系统** —— 在 Agent 的生命周期中插入自定义逻辑

```typescript
// LangChain 层面的工具定义 —— 统一的工具接口
import { tool } from "langchain";
import { z } from "zod";

// 无论底层是哪个 LLM，工具的定义方式完全相同
const searchTool = tool(
  async ({ query }) => `Searching: ${query}`,
  {
    name: "search",
    description: "Search the web",
    schema: z.object({ query: z.string() }),
  }
);
```

**何时使用 LangChain？** 当你需要一个轻量级的、标准化的 Agent 构建方式，并且不需要 Deep Agents 提供的全套内置能力时（比如简单的问答系统、单工具调用场景），LangChain 是很好的选择。

```typescript
// LangChain 层面的工具定义
import { tool } from "langchain";
import { z } from "zod";

const searchTool = tool(
  async ({ query }) => `Searching: ${query}`,
  {
    name: "search",
    description: "Search the web",
    schema: z.object({ query: z.string() }),
  }
);
```

**第三层：Agent Harness（Deep Agents SDK）**
这一层是**最上层的封装**，也是我们本文档的重点。它提供了开箱即用的完整 Agent 体验，构建在 LangChain 和 LangGraph 之上。如果把 LangGraph 比作"工作流程图纸"，LangChain 比作"标准化零件库"，那么 Deep Agents 就是"预制好的智能机器人"——你接通电源（配置 API Key），告诉它要做什么（系统提示），它就能开始工作。

Deep Agents 的内置能力覆盖了生产级 Agent 所需的绝大部分场景：

| 能力 | 内置工具/机制 | 解决的问题 |
|------|-------------|-----------|
| 📋 **任务规划** | `write_todos` | Agent 自动将大任务分解为可执行的小步骤 |
| 📁 **文件系统** | `ls`/`read_file`/`write_file`/`edit_file`/`grep`/`glob` | Agent 可以读写和管理项目文件 |
| 🧑‍💻 **子代理** | `task()` 工具 | Agent 可以创建隔离的子 Agent 并行处理子任务 |
| 🧠 **长期记忆** | Memory 文件（AGENTS.md） | Agent 跨对话记住用户偏好和项目约定 |
| 🗑️ **Token 管理** | 自动摘要 + 结果驱逐 | 处理超长对话而不超限 |
| 🔒 **权限控制** | FilesystemPermission | 声明式文件访问安全策略 |

**选择指南：如何决定用哪一层？**

```
你的任务需要？
├── 快速原型、简单工具调用 → LangChain（Framework层）
│   适用：单个工具、简单问答、无状态场景
│   
├── 复杂状态机、需持久化 → LangGraph（Runtime层）
│   适用：多步骤工作流、需要回滚、人类审批
│   
└── 多步规划、文件操作、子代理 → Deep Agents（Harness层）
    适用：复杂多步任务、需要文件系统/子代理/长期记忆
```

#### LangChain 完整生态图

```
                    ┌──────────┐
                    │ LangSmith │ ← 可观测性 · 评估 · Prompt 管理 · 部署
                    └────┬─────┘
                         │ 集成
    ┌──────────┐  ┌──────┴──────┐  ┌──────────┐
    │ Deep     │  │  LangChain  │  │ LangGraph │
    │ Agents   │←→│  (Framework)│←→│ (Runtime) │
    │ (Harness)│  └─────────────┘  └──────────┘
    └──────────┘
```

> **💡 为什么这样分层？** 这种三层架构的核心理念是**关注点分离**：
> - LangGraph 管"状态和执行流程"
> - LangChain 管"抽象和标准化"
> - Deep Agents 管"开箱即用的完整体验"
>
> 你可以根据需求选择适合的层次，也可以混用各层的能力。

### 1.3 Deep Agents 内置能力全景

Deep Agents 开箱即提供以下能力，无需任何手动集成：

```typescript
// Deep Agents 开箱即用的能力一览
const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  // 以下能力全部内置，无需额外配置
  // ✅ 任务规划 —— write_todos 自动可用
  // ✅ 文件系统 —— ls/read_file/write_file 等 6 个工具
  // ✅ 子代理 —— task() 工具
  // ✅ 长期记忆 —— 通过 memory 参数加载
  // ✅ Token 管理 —— 自动摘要和驱逐
  // ✅ 权限控制 —— 通过 permissions 参数配置
});
```

| 能力 | 内置工具/机制 | 说明 |
|------|-------------|------|
| 📋 **任务规划** | `write_todos` | 自动分解任务，跟踪 pending→in_progress→completed 状态 |
| 📁 **文件系统** | `ls` / `read_file` / `write_file` / `edit_file` / `grep` / `glob` | 读写和管理文件 |
| 🧑‍💻 **子代理** | `task()` 工具 | 生成隔离的子 Agent 执行并行任务 |
| 🧠 **长期记忆** | Memory 文件（AGENTS.md） | 跨对话持久化知识 |
| 🗑️ **Token 管理** | 自动摘要 + 结果驱逐 | 处理超长对话历史 |
| 🔒 **权限控制** | FilesystemPermission | 声明式文件访问控制 |

### 1.4 Deep Agents 与其他 Harness 的对比

市面上有多款 Agent Harness 产品，了解它们的差异有助于你做出正确的技术选型：

**Deep Agents vs Claude Agent SDK：核心差异**

Deep Agents 和 Claude Agent SDK 是目前最受关注的两款 Agent Harness。它们的核心差异在于"灵活性 vs 专一性"：

- **Deep Agents** 的策略是"通用基础设施"——你可以接入任何模型提供商（Anthropic、OpenAI、Google、本地 Ollama 等），可以选择 LangSmith 托管部署也可以自托管，可以在不修改代码的情况下切换底层模型。这种灵活性使得 Deep Agents 特别适合需要多模型策略、多租户架构、或已有 LangSmith 基础设施的团队。

- **Claude Agent SDK** 的策略是"深度优化"——它专为 Claude 模型设计，在 Claude 的使用体验上做了极致优化。但这也意味着你被绑定在 Anthropic 生态中，如果需要切换模型或自建多租户架构，需要额外投入开发成本。

**对比表格：**

| 维度 | Deep Agents | Claude Agent SDK | Manus |
|------|------------|-----------------|-------|
| **模型选择** | 任意模型提供商 | 仅 Claude | 未开源 |
| **部署方式** | LangSmith 托管 / 自托管 | 自建 API + 认证 | 自托管 |
| **多租户** | ✅ 内置 StoreBackend 命名空间 | ❌ 需自建 | ❌ |
| **子代理** | ✅ 声明式 + CompiledSubAgent | ✅ | ✅ |
| **文件系统** | ✅ CompositeBackend（4 种类型） | ✅ | ✅ |
| **中间件系统** | ✅ 6 个生命周期钩子 | ❌ | ❌ |
| **开源** | ✅ | ✅ | ❌ |

> **💡 什么时候选 Deep Agents？** 当你需要以下能力时，Deep Agents 是最佳选择：
> 1. **多模型灵活性** —— 在不同任务中使用最适合的模型
> 2. **多租户支持** —— 为不同用户提供隔离的 Agent 实例
> 3. **LangSmith 生态集成** —— 与 LangSmith 的可观测性、评估、部署深度集成
> 4. **自定义部署** —— 从本地开发到生产托管的平滑过渡

---

## 🔧 环境搭建

### 1.5 系统要求

在开始之前，请确保你的开发环境满足以下条件：

- **Node.js** >= 20（推荐 22 LTS）—— Deep Agents 依赖最新的 JavaScript 特性
- **npm** >= 9 或 **pnpm** >= 8 或 **yarn** >= 1.22
- 或者使用 **Bun** >= 1.0.0（更快的运行时）

```bash
# 检查 Node.js 版本
node --version
# 应该输出 v20.x.x 或更高

# 检查 npm 版本
npm --version
# 应该输出 9.x.x 或更高
```

### 1.6 安装 Deep Agents

创建一个新项目并安装所需依赖：

```bash
# 创建项目目录
mkdir my-first-deep-agent
cd my-first-deep-agent

# 初始化 package.json
npm init -y

# 安装核心依赖
npm install deepagents langchain @langchain/core

# 如果使用 Anthropic Claude（推荐），还需安装模型包
npm install @langchain/anthropic
```

> **💡 包说明：**
> - `deepagents` — Deep Agents SDK 核心包，提供 `createDeepAgent` 等 API
> - `langchain` — LangChain 框架，提供 `tool`、`createMiddleware` 等工具函数
> - `@langchain/core` — LangChain 核心类型和消息类
> - `@langchain/anthropic` — Claude 模型提供商适配器

### 1.7 浏览器 vs Node.js 入口点

Deep Agents 针对不同运行环境提供了差异化的入口点：

```typescript
// 浏览器环境 —— 轻量级，无文件系统、无沙箱
import { createDeepAgent, StateBackend } from "deepagents/browser";

// Node.js 环境（推荐）—— 完整功能
import { createDeepAgent, FilesystemBackend } from "deepagents";

// 显式 Node.js 入口（可选）
// import { createDeepAgent, FilesystemBackend } from "deepagents/node";
```

| 特性 | Node.js | Browser |
|------|---------|---------|
| 文件系统 | ✅ FilesystemBackend | ❌ StateBackend 仅内存 |
| 沙箱 | ✅ Daytona/Deno Sandbox | ❌ |
| 代码执行 | ✅ execute 工具 | ❌ |
| 入口点 | `"deepagents"` | `"deepagents/browser"` |

---

## 🔨 实战演练

### 练习 1：你的第一个 Deep Agent

**场景描述：**
创建一个带天气查询工具的 Deep Agent，让它回答用户关于东京天气的问题。通过这个练习，你将掌握工具定义、Agent 创建和调用这三个基本步骤。

**你的任务：**
1. 安装依赖并创建 `agent.ts` 文件
2. 使用 `tool()` 函数定义一个 `get_weather` 工具
3. 使用 `createDeepAgent` 创建 Agent 实例
4. 调用 `agent.invoke()` 并输出 Agent 的响应

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// agent.ts
import { createDeepAgent } from "deepagents";
import { tool } from "langchain";
import { z } from "zod";

// Step 1: 定义一个工具
// tool() 接收两个参数：实现函数 和 元数据配置
const getWeather = tool(
  // 实现函数：接收 Zod Schema 解析后的参数
  ({ city }: { city: string }) => {
    // 在实际应用中，这里应调用真实的天气 API
    return `It's always sunny in ${city}! 🌤️`;
  },
  {
    // 元数据：告诉 LLM 这个工具的名称、用途和参数格式
    name: "get_weather",
    description: "Get the current weather for a given city",
    schema: z.object({
      city: z.string().describe("The city name, e.g. Tokyo, London"),
    }),
  }
);

// Step 2: 创建 Agent
// createDeepAgent 自动搭建了 Agent 运行所需的所有基础设施
const agent = createDeepAgent({
  tools: [getWeather],                     // 注册工具
  systemPrompt: "You are a helpful weather assistant. Use the get_weather tool to answer questions.",
});

// Step 3: 调用 Agent
async function main() {
  const result = await agent.invoke({
    messages: [
      { role: "user", content: "What's the weather like in Tokyo?" },
    ],
  });

  // 遍历所有消息，输出 Agent 的响应
  for (const msg of result.messages ?? []) {
    if (msg.content) {
      console.log(`${msg._getType()}: ${msg.content}`);
    }
  }
}

main().catch(console.error);
```

**预期输出：**
```
human: What's the weather like in Tokyo?
ai: Let me check the weather in Tokyo for you.

[这里 Agent 内部调用了 get_weather 工具...]

ai: The weather in Tokyo is sunny! 🌤️
```

</details>

### 练习 2：多轮对话

**场景描述：**
Deep Agents 天然支持多轮对话——同一个 Agent 实例可以连续对话，历史消息会自动保留并传递给后续的 LLM 调用。这在需要连续追问的场景中非常有用。

**你的任务：**
1. 创建一个 Agent 实例
2. 连续发送三条消息，每次携带之前的对话历史
3. 观察 Agent 是否能正确理解上下文

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { createDeepAgent } from "deepagents";

const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  systemPrompt: "You are a helpful assistant. Keep your answers brief.",
});

async function multiTurnConversation() {
  // 第一轮：初始问题
  const result1 = await agent.invoke({
    messages: [{ role: "user", content: "What is 2 + 2?" }],
  });
  console.log("Turn 1:", result1.messages.at(-1)?.content);

  // 第二轮：基于历史继续追问
  // 将上一轮的所有消息传入，Agent 就知道对话上下文
  const result2 = await agent.invoke({
    messages: [
      ...result1.messages,  // 包含之前的所有对话
      { role: "user", content: "Add 5 to that result." },
    ],
  });
  console.log("Turn 2:", result2.messages.at(-1)?.content);

  // 第三轮：继续追问
  const result3 = await agent.invoke({
    messages: [
      ...result2.messages,
      { role: "user", content: "Now subtract 3." },
    ],
  });
  console.log("Turn 3:", result3.messages.at(-1)?.content);
}

multiTurnConversation().catch(console.error);
```

**预期输出：**
```
Turn 1: 2 + 2 = 4
Turn 2: 4 + 5 = 9
Turn 3: 9 - 3 = 6
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：使用 thread_id 实现跨请求对话

在实际应用中，多轮对话通常跨越多个 HTTP 请求——用户可能在今天问一个问题，明天再继续追问。Deep Agents 通过 `thread_id` 配合 `MemorySaver` 支持这种跨请求的对话持久化：

```typescript
import { createDeepAgent } from "deepagents";
import { MemorySaver } from "@langchain/langgraph";

// MemorySaver 会将对话状态持久化到内存中
// 生产环境中可以替换为数据库存储
const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  checkpointer: new MemorySaver(), // 启用状态持久化
});

// 为每次对话会话生成一个唯一的 thread_id
const threadId = crypto.randomUUID();

// 请求 1：用户自我介绍
const result1 = await agent.invoke(
  { messages: [{ role: "user", content: "My name is Alice." }] },
  { configurable: { thread_id: threadId } }
);

// 请求 2：同一用户、同一 thread_id、不同时间
const result2 = await agent.invoke(
  { messages: [{ role: "user", content: "What's my name?" }] },
  { configurable: { thread_id: threadId } }
);

console.log(result2.messages.at(-1)?.content);
// 输出: Your name is Alice! 🎯

// 不同 thread_id 表示全新对话
const result3 = await agent.invoke(
  { messages: [{ role: "user", content: "What's my name?" }] },
  { configurable: { thread_id: crypto.randomUUID() } }
);
// 输出: I don't know your name yet.  ← 因为这是新的对话
```

### 技巧二：通过 stream() 观察 Agent 的实时思考过程

高级调试技巧——使用 `stream()` 替代 `invoke()`，实时观察 Agent 的推理过程：

```typescript
import { createDeepAgent, tool } from "deepagents";
import { z } from "zod";

const searchWeb = tool(
  async ({ query }) => `Search results for: ${query}`,
  {
    name: "search_web",
    description: "Search the web for information",
    schema: z.object({ query: z.string() }),
  }
);

const agent = createDeepAgent({
  tools: [searchWeb],
  systemPrompt: "You are a research assistant.",
});

async function observeThinking() {
  console.log("🤖 Agent is thinking...\n");

  const stream = await agent.stream(
    { messages: [{ role: "user", content: "Search for AI trends in 2025." }] },
    { streamMode: "values" }
  );

  for await (const chunk of stream) {
    const lastMsg = chunk.messages.at(-1);

    // 当 Agent 调用工具时，实时显示
    if (lastMsg?.tool_calls?.length) {
      for (const tc of lastMsg.tool_calls) {
        console.log(`🔧 [Tool Call] ${tc.name}`);
        console.log(`   Arguments: ${JSON.stringify(tc.args)}`);
      }
    }

    // 当 Agent 生成文本时，实时输出
    if (lastMsg?.content && typeof lastMsg.content === "string") {
      process.stdout.write(lastMsg.content);
    }
  }
}
```

### 技巧三：初始化时注入文件

通过 `files` 参数在调用时向 Agent 注入初始文件：

```typescript
const result = await agent.invoke(
  {
    messages: [{ role: "user", content: "Read the config file." }],
    // 注入文件到 Agent 的文件系统
    files: {
      "/config.json": {
        content: ['{"theme": "dark", "language": "zh"}'],
        created_at: new Date().toISOString(),
        modified_at: new Date().toISOString(),
      },
    },
  }
);
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Deep Agents 属于 LangChain 生态中的哪一层？为什么？**
> A：属于 Agent Harness（套件层）。它构建在 LangChain（Framework层）和 LangGraph（Runtime层）之上，提供了开箱即用的完整解决方案，包括内置的任务规划、文件系统、子代理和长期记忆。

**Q2：Deep Agents 提供了哪些开箱即用的内置能力？**
> A：六大内置能力：任务规划（write_todos）、文件系统（ls/read_file/write_file 等6个工具）、子代理生成（task工具）、长期记忆（AGENTS.md）、Token管理（自动摘要和结果驱逐）、权限控制（FilesystemPermission声明式规则）。

**Q3：`agent.invoke()` 和 `agent.stream()` 的核心区别是什么？分别适用于什么场景？**
> A：`invoke()` 等待全部结果完成后一次性返回，适合简单问答等不需要中间结果的场景；`stream()` 逐步返回中间状态的快照，适合需要展示实时进度或流式输出的场景。

**Q4：什么时候应该选择 Deep Agents 而不是单纯的 LangChain 或 LangGraph？**
> A：当任务需要多步规划（write_todos）、文件系统操作（ls/read_file/write_file）、子代理并行执行（task()）、或长期记忆（AGENTS.md）时，Deep Agents 是最佳选择。简单工具调用用 LangChain，复杂有状态工作流用 LangGraph。

**Q5：`thread_id` 在 Deep Agents 中起到什么作用？**
> A：`thread_id` 标识一个对话会话。配合 `MemorySaver` 检查点机制，可以实现跨请求的对话状态持久化，让 Agent 在不同时间、不同 HTTP 请求之间保持记忆。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Cannot find module 'deepagents'` | 未安装 deepagents 包 | 运行 `npm install deepagents` |
| `Model not found: ...` | 模型名称格式错误 | 使用 `provider:model_id` 格式，如 `anthropic:claude-sonnet-4-6` |
| `API key not configured` | 未设置对应模型提供商的环境变量 | 设置环境变量，如 `ANTHROPIC_API_KEY=sk-ant-...` |
| `Node.js version >= 20 required` | Node.js 版本过旧 | 使用 `nvm install 22` 升级 Node.js |
| `checkpointer is required for thread_id` | 使用 thread_id 但未传入 checkpointer | 添加 `checkpointer: new MemorySaver()` |
| Agent 不调用任何工具 | 系统提示未引导工具的使用方式 | 在 systemPrompt 中明确描述工具的用途和调用场景 |

---

## 📝 本章小结

- ✅ Deep Agents 是 LangChain 生态中的 **Agent Harness（套件层）**，构建在 LangChain（Framework）和 LangGraph（Runtime）之上
- ✅ 三层架构：Harness（开箱即用） > Framework（抽象标准化） > Runtime（有状态执行）
- ✅ 安装只需 `npm install deepagents langchain @langchain/core`
- ✅ `createDeepAgent()` 是核心 API，一行代码即可创建功能完整的 Agent
- ✅ `agent.invoke()` 用于同步调用等待完整结果，`agent.stream()` 用于流式实时观察
- ✅ 通过 `thread_id` + `MemorySaver` 实现跨请求的多轮对话持久化
- ✅ 可通过 `files` 参数在调用时向 Agent 注入初始文件

## ➡️ 下一章预告

> 在下一章中，我们将深入 Deep Agents 的核心概念与架构，全面解析 `createDeepAgent` 的 12 个配置参数、三种调用模式的详细用法、以及 Agent Harness 的设计哲学与最佳实践。
>
> [第2章 核心概念与架构](./02-core-concepts.md)
