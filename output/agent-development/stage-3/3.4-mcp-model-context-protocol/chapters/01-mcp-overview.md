# 第1章：MCP 概述 — 标准化的 Agent 工具协议

> 预计学习时间：80-100 分钟

## 🎯 本章目标

完成本章学习后，你将能够：

- ✅ **理解** MCP 协议的核心理念和设计动机
- ✅ **掌握** MCP 的 Client-Server 架构模型
- ✅ **区分** MCP 三大能力：Tools、Resources、Prompts
- ✅ **识别** MCP 与传统 API 集成方式的本质区别
- ✅ **评估** MCP 在实际项目中的应用价值

## 📋 前置知识

- 了解 LLM Agent 的基本概念（工具调用、Function Calling）
- 熟悉 HTTP API 和 RESTful 设计风格
- 了解 JSON Schema 的基本语法（用于定义工具参数）

## 💡 核心概念

### 什么是 MCP？

**MCP（Model Context Protocol）** 是由 Anthropic 提出的一种开放协议，旨在为 AI Agent 提供**标准化的工具集成方式**。

#### 生活类比：USB 接口

MCP 就像是 AI Agent 世界的 **USB 接口标准**。回忆一下 USB 出现之前的世界：打印机用串口、鼠标用 PS/2、键盘用圆口——每种设备都需要专用的接口和驱动。USB 的出现统一了一切，任何设备都可以「即插即用」。

MCP 做的事情完全一样。在 MCP 出现之前，每个 AI Agent 与外部工具的集成都需要定制开发：

```
没有 MCP：
  Agent A —[定制接口 1]→ 工具 X（搜索引擎）
  Agent B —[定制接口 2]→ 工具 Y（数据库）
  Agent C —[定制接口 3]→ 工具 Z（文件系统）
  每对接一个新工具，就要写一套新的集成代码

有了 MCP：
  Agent A —[MCP]→ 工具 X  ← 标准化连接
  Agent B —[MCP]→ 工具 X  ← 工具复用！
  Agent C —[MCP]→ 工具 Y  ← 即插即用！
```

#### 类比延伸：为什么标准化如此重要？

想象一下，如果每个电器品牌都有自己的插座标准，你的家里会是什么样子？小米的空调需要小米专用插座，格力的冰箱需要格力专用插座——这显然是荒谬的。MCP 解决了 AI 领域同样的问题：它为工具提供了一套「通用插座」，任何遵循 MCP 协议的 Agent 都可以连接任何遵循 MCP 协议的工具。

### MCP 架构

MCP 采用轻量级的 **Client-Server 架构**，通过 JSON-RPC 2.0 协议进行通信。

```
┌─────────────────────────────────────────┐
│               MCP Host                  │
│  (Claude Desktop, IDE, 自建应用)         │
│                                          │
│  ┌────────────┐  ┌────────────┐         │
│  │ MCP Client │  │ MCP Client │         │
│  └─────┬──────┘  └─────┬──────┘         │
└────────┼────────────────┼───────────────┘
         │                │
    ┌────┴────┐      ┌────┴────┐
    │MCP Server│     │MCP Server│
    │ 文件系统  │     │ 数据库   │
    └─────────┘      └─────────┘
```

#### 架构中的三个角色

1. **MCP Host**：用户直接交互的应用程序，如 Claude Desktop、VS Code 插件、或你自建的前端应用。Host 负责发现和连接 MCP Server。

2. **MCP Client**：Host 内部维护的连接器，每个 Server 对应一个 Client。Client 负责与 Server 建立 JSON-RPC 通信通道。

3. **MCP Server**：提供具体工具能力的服务端程序。一个 Server 可以暴露多个 Tools、Resources 和 Prompts。Server 可以是本地进程（通过 stdio 通信），也可以是远程服务（通过 HTTP/SSE 通信）。

### MCP 的三大能力

MCP 定义了三种核心能力，覆盖了 Agent 与外部世界交互的绝大多数场景：

```typescript
// MCP Server 暴露三种类型的资源：

// 1. Tools（工具）— 让 LLM 执行操作
// 类比：Agent 的「手」——可以动手做事情
server.tool('read_file', { path: z.string() }, async ({ path }) => {
  const content = await fs.readFile(path, 'utf-8');
  return { content };
});

// 2. Resources（资源）— 让 LLM 获取数据
// 类比：Agent 的「眼睛」——可以读取信息
server.resource('config', 'config://app', async () => {
  return { contents: [{ uri: 'config://app', text: JSON.stringify(config) }] };
});

// 3. Prompts（提示）— 预置的 Prompt 模板
// 类比：Agent 的「训练手册」——预设好的工作流程
server.prompt('code-review', { code: z.string() }, ({ code }) => ({
  messages: [{ role: 'user', content: `审查以下代码：${code}` }],
}));
```

#### 🔧 Tools（工具）

Tools 是 MCP 中最核心的能力，代表 Agent 可以**主动执行的操作**。每个 Tool 包含：
- **名称**：唯一标识符，如 `read_file`、`search_web`
- **参数 Schema**：描述工具需要哪些参数，使用 JSON Schema 或 Zod 定义
- **处理函数**：实际执行业务逻辑的异步函数
- **返回值**：工具执行后返回给 Agent 的数据

**典型应用：** 文件读写、数据库查询、API 调用、发送邮件、执行代码

#### 📂 Resources（资源）

Resources 代表 Agent 可以**被动读取的数据源**，类似于 REST API 中的 GET 端点。每个 Resource 包含：
- **URI**：资源的唯一地址，如 `file:///config/app.json`、`database://users/123`
- **内容**：资源的实际数据，可以是文本或二进制

**典型应用：** 读取配置文件、查询文档库、获取系统状态信息

#### 📝 Prompts（提示）

Prompts 是**预定义的 Prompt 模板**，让 Agent 能够快速进入特定的工作模式。每个 Prompt 包含：
- **名称**：模板的唯一标识
- **参数定义**：模板需要的输入参数
- **消息列表**：预置的 system/user/assistant 消息

**典型应用：** 代码审查模板、翻译模板、数据分析模板

### MCP vs 传统集成方式

| 维度 | 传统方式 | MCP |
|------|---------|-----|
| 连接方式 | 每个工具定制接口 | 统一 JSON-RPC 协议 |
| 工具发现 | 手动配置与管理 | 自动发现（Server 暴露能力列表） |
| 类型安全 | 依赖文档 | Schema 驱动，自动类型校验 |
| 复用性 | 低，Agent 与工具强耦合 | 高，任何 MCP Agent 可连任何 MCP 工具 |
| 扩展性 | 每加一个工具需要开发新集成 | 启动新 Server 即可 |

## 🔨 实战演练：搭建第一个 MCP Server

以下是一个使用 TypeScript 搭建的简单 MCP Server，提供文件搜索和内容读取能力：

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new Server(
  { name: 'file-helper', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

// 注册工具：搜索文件
server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'search_files') {
    const { pattern } = request.params.arguments;
    // 模拟文件搜索逻辑
    return { content: [{ type: 'text', text: `找到匹配 ${pattern} 的文件列表` }] };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

// 启动 Server
const transport = new StdioServerTransport();
await server.connect(transport);
```

## ⚡ 进阶技巧

1. **本地 vs 远程 Server**：开发阶段使用 stdio 传输（本地进程），生产环境可切换到 SSE（Server-Sent Events）传输
2. **安全隔离**：每个 MCP Server 运行在独立的进程中，通过标准输入输出通信，天然具有进程级隔离
3. **能力声明**：Server 启动时应准确声明 capabilities，Host 会根据声明自动发现可用功能
4. **错误处理**：工具执行失败时应返回有意义的错误信息，而非直接抛出异常

## 🧠 知识检查点

1. MCP 解决了 AI Agent 工具集成中的哪些核心痛点？
2. Client-Server 架构中，Host、Client、Server 三者的职责分别是什么？
3. Tools、Resources、Prompts 三种能力各适合什么场景？请举例说明。
4. MCP 的标准化如何改变 AI Agent 生态系统的演进方向？

## 🐛 常见错误

- ❌ **混淆 Tools 和 Resources**：Tools 是「写操作」或「执行操作」，Resources 是「读操作」
- ❌ **忽略错误处理**：工具执行失败时不返回错误信息，导致 Agent 困惑
- ❌ **过度暴露能力**：一个 Server 暴露了太多不相关的 Tools，增加 Agent 的选择负担
- ❌ **参数设计不合理**：Tool 的参数名称晦涩难懂，LLM 无法正确理解如何使用

## 📝 本章小结

- ✅ **MCP 定义** — AI Agent 工具的标准化协议，类比 USB 接口标准
- ✅ **三大能力** — Tools（执行操作）、Resources（获取数据）、Prompts（提示模板）
- ✅ **Client-Server 架构** — Host 通过 Client 连接多个 Server，协议基于 JSON-RPC 2.0
- ✅ **核心价值** — 标准化工具集成、即插即用、跨 Agent 可复用

MCP 正在成为 AI Agent 生态中的基础性协议。就像 HTTP 协议统一了 Web 通信一样，MCP 有望统一 AI Agent 与外部世界的交互方式。理解 MCP 将让你在未来 AI 应用开发中占据先机。

## ➡️ 下一章预告

> [第2章：MCP Server 开发](./02-mcp-server.md) — 深入学习如何开发功能完备的 MCP Server，包括工具注册、资源暴露、Prompt 模板设计以及部署最佳实践
