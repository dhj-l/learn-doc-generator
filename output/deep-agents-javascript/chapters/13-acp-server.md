# 第13章 ACP 协议与服务端

> 预计学习时间：45 分钟

## 🎯 本章目标

学习完本章，你将能够：
- 理解 ACP（Agent Communication Protocol）的概念
- 使用 `startServer()` 快速启动 Deep Agents 服务
- 使用 `DeepAgentsServer` 类配置多 Agent 服务端
- 通过 CLI 模式启动 Deep Agents
- 将 Deep Agents 集成到 Zed 编辑器中

## 📋 前置知识

> 如果你还没有学习以下内容，建议先完成：
> - [第7章 后端系统详解](./07-backend.md) —— 了解 ACP Server 后端的工作原理
> - [第3章 工具系统详解](./03-tool-system.md) —— 了解工具如何与外部系统通信

## 💡 核心概念

### 13.1 什么是 ACP？

**用一个类比来理解：**

> ACP（Agent Communication Protocol）就像为 Agent 提供的一个**标准 API 接口**。想象你开了一家餐厅（Agent 服务端），客人可以通过统一的电话热线（ACP）点餐，而不用管厨房里是哪个厨师在做菜。这个热线规定了统一的菜单格式（请求格式）和上菜方式（流式响应）。
>
> ACP = Agent 之间的标准化通信协议。

**ACP 的核心价值：**
- 📡 **标准化**：统一 Agent 的通信方式，不同工具使用同一协议
- 🔌 **可互操作**：不同工具和 IDE 可以连接到同一个 Agent
- ⚡ **流式支持**：支持 SSE（Server-Sent Events）流式输出
- 🔄 **跨平台**：可以在本地开发环境运行，也可以部署到远程服务器

**ACP 解决了什么实际问题？**

在没有 ACP 之前，如果你想在 VS Code 中使用 Agent 辅助编码、在终端中调用 Agent 执行命令、在 Web 页面中嵌入 Agent 对话——你需要为每个场景编写不同的集成代码，每种集成方式都可能使用不同的协议和认证方式。ACP 统一了这一切：Agent 以 ACP 服务端的形式启动，所有客户端工具都通过同一个 ACP 接口与 Agent 通信。无论你的 Agent 运行在本地还是远程，无论调用方是编辑器、终端还是 Web 应用，它们都使用相同的 ACP 协议。

> **💡 为什么这样做？**
> 在 ACP 出现之前，每次将 Agent 集成到新的工具或平台时，你都需要重新实现一套通信接口——为 VS Code 插件写一套 WebSocket 服务，为命令行工具写一套 stdin/stdout 协议，为 Web 页面写一套 REST API。这不仅是重复劳动，还意味着每个集成都需要单独维护和测试。ACP 将这一切标准化了：Agent 只需要实现一个 ACP 服务端，所有客户端（无论是编辑器、终端还是 Web 应用）都通过同一套协议与 Agent 通信。这种"一次实现，到处连接"的方式，极大地降低了 Agent 集成的维护成本和出错概率。

**什么时候使用 ACP 服务端？**
- 当你需要将 Agent 暴露给外部工具或服务时（如 IDE 插件、命令行工具）
- 当你需要多个 Agent 协同工作时（每个 Agent 一个端口或名称）
- 当你需要与 LangSmith 生态系统集成时（ACP 是 LangSmith 的通信基础） Agent
- 🚀 **开箱即用**：快速启动，无需手写 HTTP 服务

### 13.2 `startServer()` 快速启动

最简单的方式，几行代码启动一个 ACP 服务端：

```typescript
import { startServer } from "deepagents-acp";

await startServer({
  agents: [
    {
      name: "project-agent",
      description: "Agent with project-specific knowledge",
      skills: ["./skills/", "~/.deepagents/skills/"],
      memory: ["./.deepagents/AGENTS.md"],
    },
  ],
  workspaceRoot: process.cwd(),
});
```

### 13.3 `DeepAgentsServer` 类（完全控制）

对于需要精细控制的场景，使用 `DeepAgentsServer` 类：

```typescript
import { DeepAgentsServer } from "deepagents-acp";

const server = new DeepAgentsServer({
  agents: [
    {
      name: "code-agent",
      description: "Full-featured coding assistant",
      model: "anthropic:claude-sonnet-4-6",
      skills: ["./skills/"],
      memory: ["./.deepagents/AGENTS.md"],
    },
    {
      name: "reviewer",
      description: "Code review specialist",
      systemPrompt: "You are a code review expert. Focus on security and best practices.",
    },
  ],
  serverName: "my-deepagents-acp",
  serverVersion: "1.0.0",
  workspaceRoot: process.cwd(),
  debug: true,  // 开启调试日志
});

// 启动服务端
await server.start();
```

#### 完整配置选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `agents` | `DeepAgentConfig \| DeepAgentConfig[]` | 必填 | Agent 配置（可配置多个） |
| `serverName` | `string` | `"deepagents-acp"` | 服务端名称 |
| `serverVersion` | `string` | `"0.0.1"` | 版本号 |
| `workspaceRoot` | `string` | `process.cwd()` | 工作区根目录 |
| `debug` | `boolean` | `false` | 调试日志开关 |

### 13.4 CLI 模式启动

也可以通过命令行直接启动：

```bash
# 最简启动
npx deepagents-acp

# 指定名称和技能目录
npx deepagents-acp \
  --name my-assistant \
  --skills ./skills \
  --debug

# 指定模型
npx deepagents-acp --name code-bot --model anthropic:claude-sonnet-4-6
```

| CLI 参数 | 说明 |
|---------|------|
| `--name` | Agent 名称 |
| `--model` | 指定模型 |
| `--skills` | 技能目录路径 |
| `--debug` | 开启调试模式 |
| `-y` | 自动确认工具调用 |

### 13.5 IDE 集成：Zed 编辑器

Deep Agents 可以集成到 Zed 编辑器中：

```json
{
  "agent": {
    "profiles": {
      "deepagents": {
        "name": "DeepAgents",
        "command": "npx",
        "args": [
          "deepagents-acp",
          "--name", "my-assistant",
          "--skills", "./skills",
          "--debug"
        ],
        "env": {
          "ANTHROPIC_API_KEY": "sk-ant-..."
        }
      }
    }
  }
}
```

### 13.6 多 Agent 服务端

一个服务端可以同时运行多个 Agent，每个 Agent 有不同的能力和角色：

```typescript
const server = new DeepAgentsServer({
  agents: [
    {
      name: "coder",
      description: "Writes and debugs code",
      model: "anthropic:claude-sonnet-4-6",
      skills: ["./skills/coding/"],
    },
    {
      name: "reviewer",
      description: "Reviews code for issues",
      model: "anthropic:claude-sonnet-4-6",
      systemPrompt: "You are a strict code reviewer. Check for bugs, security issues, and style.",
    },
    {
      name: "helper",
      description: "General Q&A and documentation",
      model: "openai:gpt-5-nano",  // 简单任务用轻量模型
      systemPrompt: "You answer general questions and help with documentation.",
    },
  ],
});
```

---

## 🔨 实战演练

### 练习 1：启动一个本地 ACP 服务

**场景描述：**
创建一个包含开发助手和代码审查员的服务端，并通过 ACP 协议提供服务。

**你的任务：**
1. 使用 `DeepAgentsServer` 类创建一个包含至少两个 Agent 的服务端
2. 分别配置不同的名称、描述和系统提示
3. 启动服务端并观察控制台输出
4. 通过 CLI 方式验证同样的功能

<details>
<summary>🧑‍💻 先自己尝试，写完再展开看参考答案</summary>

**参考代码：**

```typescript
// server.ts
import { DeepAgentsServer } from "deepagents-acp";

const server = new DeepAgentsServer({
  agents: [
    {
      name: "dev-assistant",
      description: "General development assistant",
      model: "anthropic:claude-sonnet-4-6",
      skills: ["./.deepagents/skills/"],
      memory: ["./.deepagents/AGENTS.md"],
    },
    {
      name: "code-reviewer",
      description: "Specialized code reviewer",
      model: "anthropic:claude-sonnet-4-6",
      systemPrompt: `You are a senior code reviewer.
      Analyze code for:
      - Security vulnerabilities
      - Performance issues
      - Best practices
      Provide actionable feedback.`,
    },
  ],
  workspaceRoot: process.cwd(),
  debug: true,
});

console.log("🚀 Starting Deep Agents ACP Server...");
await server.start();
```

```bash
# 运行
npx tsx server.ts

# 或使用 CLI
npx deepagents-acp --name dev-assistant --skills ./.deepagents/skills --debug
```

</details>

**预期输出：**

```
🚀 Starting Deep Agents ACP Server...
[DeepAgentsServer] Server "my-deepagents-acp" starting...
[DeepAgentsServer] Agent "dev-assistant" registered (model: anthropic:claude-sonnet-4-6)
[DeepAgentsServer] Agent "code-reviewer" registered (model: anthropic:claude-sonnet-4-6)
[DeepAgentsServer] Listening on http://localhost:2024
```

或者使用 CLI：

```
$ npx deepagents-acp --name dev-assistant --skills ./.deepagents/skills --debug
ACP server started on port 2024
Agent "dev-assistant" ready
```

### 练习 2：连接到 ACP 服务

**场景描述：**
编写一个客户端程序，连接到上一步启动的 ACP 服务端，分别调用"开发助手"和"代码审查员"两个 Agent 并获取它们的回复。

**你的任务：**
1. 使用 `fetch` API 向 ACP 服务端发送 POST 请求
2. 分别调用 `dev-assistant` 和 `code-reviewer` 两个 Agent
3. 验证不同 Agent 返回不同的回复内容
4. 尝试使用 `/stream` 端点获取流式输出

<details>
<summary>🧑‍💻 先自己尝试，写完再展开看参考答案</summary>

以下代码演示了如何从客户端连接到 ACP 服务端，并调用指定名称的 Agent。客户端通过 HTTP 请求与服务端通信，使用标准的 fetch API 即可完成，不需要额外的 SDK：

> **💡 ACP 客户端调用的关键点：**
> 1. URL 格式为 `http://host:port/{agentName}/invoke`
> 2. 请求体包含 messages 数组，与 invoke 的格式相同
> 3. 如果想实时看到输出，可以将 `/invoke` 改为 `/stream` 使用流式接口
> 4. 通过不同的 agentName 可以调用同一服务端上的不同 Agent

```typescript
// 客户端代码（假设 ACP 运行在 localhost:2024）
async function queryAgent(agentName: string, question: string) {
  const response = await fetch(`http://localhost:2024/${agentName}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: question }],
    }),
  });

  const result = await response.json();
  return result.messages.at(-1)?.content;
}

// 使用
const codingAnswer = await queryAgent("dev-assistant", "How do I use async/await in TypeScript?");
const review = await queryAgent("code-reviewer", "Review this code: function add(a,b){return a+b}");
```
</details>

**预期输出：**

```
// 调用 dev-assistant
> How do I use async/await in TypeScript?
async/await is a modern JavaScript pattern for handling asynchronous operations...

// 调用 code-reviewer
> Review this code: function add(a,b){return a+b}
⚠ Security: The function lacks type checking for parameters.
💡 Suggestion: Add TypeScript type annotations and input validation.
```

---

## ⚡ 进阶技巧

### 技巧一：调试模式

在开发 ACP 服务端时，调试模式可以帮助你了解 Agent 的内部决策过程。启用后，服务端会输出每条消息的流转细节、工具调用情况和中间件的执行过程，这对于排查问题非常有帮助。调试模式的输出非常详细，建议只在开发和调试阶段启用，生产环境中应关闭以避免日志过多：

> **💡 什么时候需要调试模式？**
> 当你发现 Agent 的行为不符合预期、工具调用没有正确触发、或者中间件没有按预期执行时，启用调试模式可以让你看到每个环节的详细日志，快速定位问题所在。

### 技巧二：多 Agent 路由

ACP 服务端支持同时运行多个不同用途的 Agent。你可以为每个 Agent 配置不同的名称、模型、系统提示和工具集，客户端通过 URL 中的 Agent 名称来区分调用哪个 Agent。这种设计非常适合于微服务架构——每个 Agent 负责一个特定的领域，通过统一的 ACP 接口对外提供服务。

```typescript
// 在应用层实现智能路由
async function smartRoute(question: string) {
  if (question.includes("review") || question.includes("bug")) {
    return queryAgent("code-reviewer", question);
  }
  return queryAgent("dev-assistant", question);
}
```

**智能路由的优势：**
- **职责分离**：每个 Agent 只负责自己擅长的领域，不需要一个 Agent 学会所有技能，降低了每个 Agent 的系统提示复杂度和出错概率
- **独立部署**：不同 Agent 可以独立升级和扩展，一个 Agent 出问题不影响其他 Agent 的正常运行，提高了系统的整体可用性
- **灵活组合**：可以根据业务需求动态添加或移除 Agent，不需要修改现有代码

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：ACP 的全称是什么？它的作用是什么？**
> A：ACP 全称是 Agent Communication Protocol（Agent 通信协议）。它提供了一套标准化的 Agent 通信接口，让不同的工具、编辑器（如 Zed）和 IDE 都可以连接到同一个 Agent 实例。有了 ACP，你不需要为每个工具单独适配 Agent——它们都通过 ACP 协议与 Agent 通信。

**Q2：`startServer()` 和 `DeepAgentsServer` 类有什么区别？**
> A：`startServer()` 是一个便捷的快速启动函数，适合简单的单 Agent 场景。`DeepAgentsServer` 类提供更完整的控制能力，支持多 Agent 配置（每个 Agent 可以有不同名称、模型和工具）、详细的选项配置和调试功能，适合复杂的生产环境。

**Q3：如何通过命令行启动 Deep Agents？**
> A：使用 `npx deepagents-acp --name my-agent --skills ./skills`。CLI 模式适合在终端中快速启动 Agent 服务，也方便集成到脚本和 CI/CD 流程中。

**Q4：一个 ACP 服务端可以同时运行几个 Agent？**
> A：任意数量。通过 `DeepAgentsServer` 的 agents 配置，你可以注册多个名称不同、模型不同、系统提示和工具也不同的 Agent，客户端通过名称来区分和调用。

**Q5：ACP 协议的核心价值是什么？**
> A：ACP 协议让 Agent 的调用方式和部署位置解耦——你可以在本地启动 ACP 服务器进行开发和调试，然后无缝切换到远程 ACP 服务器进行生产部署，客户端的代码完全不需要修改。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `deepagents-acp not found` | 未安装 deepagents-acp 包 | 运行 `npm install deepagents-acp` 安装 |
| `Address in use` | 端口被占用，无法启动服务 | 检查端口占用情况，或配置使用不同的端口号 |
| `Agent 'xxx' not found` | 请求的 Agent 名称在服务端不存在 | 检查 Server 配置中的 agents 名称列表，确保名称拼写正确 |
| 连接被拒绝 | 客户端尝试连接时服务端尚未启动 | 确保先运行 server.start() 再发起客户端请求 |
| ACP 版本不兼容 | 客户端和服务端的 ACP 协议版本不一致 | 升级客户端或服务端到匹配的版本 |

---

## 📝 本章小结

- ✅ ACP 是 Agent 的标准通信协议，统一了不同工具和 IDE 与 Agent 的通信方式
- ✅ `startServer()` 用于快速启动 ACP 服务端，适合简单的单 Agent 场景
- ✅ `DeepAgentsServer` 类提供完整控制能力，支持多 Agent、调试模式等高级功能
- ✅ CLI 模式：`npx deepagents-acp --name ...` 适合在终端中快速启动
- ✅ ACP 服务端可以集成到 Zed 编辑器中，实现 AI 辅助编码
- ✅ 一个服务端可以同时运行多个不同用途的专用 Agent，客户端通过名称区分
- ✅ 多 Agent 智能路由可以实现职责分离，每个 Agent 专注于自己的专业领域，降低系统复杂度

## ➡️ 下一章预告

> 在下一章中，我们将学习 Deep Agents 的生产环境部署——如何使用 LangSmith 托管运行时、配置 Deployment、实现认证和 Webhooks，以及如何监控生产环境中的 Agent。
>
> [第14章 生产部署](./14-production.md)
