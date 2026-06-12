# 第1章：MCP 概述 — 标准化的 Agent 工具协议

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 MCP 协议的定位和价值** — 为什么需要统一的 Agent 工具协议
- **掌握 MCP 的 Client-Server 架构** — Host、Client、Server 三者的关系
- **理解 MCP 的三大核心能力** — Tools、Resources、Prompts
- **为后续章节的 Server 开发打下基础** — 知道 MCP 协议的生态和使用场景

## 📋 前置知识

> 建议先完成：
> - [2.1 Agent 架构与设计](../../stage-2/2.1-agent-architecture-and-design/README.md) — 理解 Agent 的基本概念
> - [1.2 Claude API](../../stage-1/1.2-claude-api/README.md) — 了解 LLM API 调用方式

---

## 💡 核心概念

### 什么是 MCP？

**生活类比：** MCP（Model Context Protocol）就像是 AI Agent 世界的 **USB 接口标准**。以前每个 AI 工具都需要定制的连接方式，现在有了 MCP，任何工具都能「即插即用」。

```
没有 MCP：
  Agent A —[定制接口]→ 工具 X
  Agent B —[定制接口]→ 工具 Y
  每个连接都需要单独开发

有了 MCP：
  Agent A —[MCP]→ 工具 X
  Agent B —[MCP]→ 工具 Y
  Agent A —[MCP]→ 工具 Y  ← 工具复用！
```

### MCP 架构

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

### MCP 的三大能力

```typescript
// MCP Server 暴露三种类型的资源：

// 1. Tools（工具）— 让 LLM 执行操作
server.tool('read_file', { path: z.string() }, async ({ path }) => {
  const content = await fs.readFile(path, 'utf-8');
  return { content };
});

// 2. Resources（资源）— 让 LLM 获取数据
server.resource('config', 'config://app', async () => {
  return { contents: [{ uri: 'config://app', text: JSON.stringify(config) }] };
});

// 3. Prompts（提示）— 预置的 Prompt 模板
server.prompt('code-review', { code: z.string() }, ({ code }) => ({
  messages: [{ role: 'user', content: `审查以下代码：${code}` }],
}));
```

---

## 🔨 实战演练

### 练习：识别你身边的 MCP 场景

**场景描述：** 假设你要为一个 AI 开发工具构建一个 MCP 生态系统，让 Agent 能够：
1. 读取项目文件
2. 搜索网络文档
3. 发送代码审查结果到 Slack

**你的任务：** 针对以上场景，识别应该使用 MCP 的哪种能力，并画出简化的架构图。

<details>
<summary>🧑‍💻 参考答案</summary>

**架构分析：**

```
┌─────────────────────────────────────┐
│          AI 开发助手 (Host)          │
│                                     │
│  ┌──────────────┐                   │
│  │  MCP Client   │                   │
│  └──────┬───────┘                   │
└─────────┼───────────────────────────┘
          │
     ┌────┴─────────────────────┐
     │                          │
  ┌──┴───┐                ┌───┴──┐
  │ 文件  │                │ Slack │
  │ Server│               │ Server│
  └──────┘               └──────┘
  Tool: read_file        Tool: send_message
  Tool: write_file       Tool: list_channels
  Resource: project-info
```

**能力对应关系：**
- 读取项目文件 → `Resources`（获取数据）
- 搜索网络文档 → `Tools`（执行操作）
- 发送到 Slack → `Tools`（执行操作）

</details>

---

## ⚡ 进阶技巧

### 技巧一：MCP vs 传统 API 的对比

| 维度 | MCP | 传统 REST API |
|------|-----|---------------|
| 发现机制 | 自动发现（client.listTools） | 手动文档阅读 |
| 类型安全 | Zod Schema 运行时验证 | 通常无验证 |
| 协议标准 | 统一标准 | 每个 API 各自定义 |
| LLM 友好 | 天然适合 LLM 调用 | 需要额外适配层 |

### 技巧二：MCP 的生态现状

MCP 由 Anthropic 在 2024 年底提出，目前已获得广泛支持：
- **Claude Desktop** — 原生支持 MCP
- **VS Code 扩展** — 通过 MCP 连接开发工具
- **社区 Server** — 已有数百个开源 MCP Server

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：MCP 的三大能力分别是什么？各适用于什么场景？**

> A：（1）Tools（工具）— 让 LLM 执行有副作用或计算的操作，如读写文件、查询数据库；（2）Resources（资源）— 让 LLM 获取结构化数据，如配置信息、文档内容；（3）Prompts（提示模板）— 预置的模板化 Prompt，让用户快速触发特定任务。

**Q2：MCP 中的 Host、Client、Server 分别扮演什么角色？**

> A：Host 是运行 Agent 的应用程序（如 Claude Desktop）；Client 是 Host 内部负责与 Server 通信的组件，每个 Server 对应一个 Client 实例；Server 是提供具体工具和资源的服务进程。一个 Host 可连接多个 Server。

**Q3：为什么说 MCP 对 Agent 开发很重要？**

> A：MCP 提供了一套标准化的工具接入协议，让 Agent 无需为每个工具定制集成代码。工具开发者只需要实现一次 MCP Server 接口，所有支持 MCP 的 Agent 都能使用该工具，大大降低了工具生态的碎片化。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Server 启动后没有任何输出 | 没有调用 `server.connect(transport)` | 确保在 main 函数中调用了 `await server.connect(transport)` |
| LLM 无法找到已注册的工具 | 工具注册在 connect 之后才执行 | 在 connect 之前完成所有 `server.tool()` 调用 |
| 工具调用返回参数错误 | LLM 生成的参数不符合 Zod Schema | 提供清晰的参数名称和 description，避免复杂嵌套 |
| 多个 Server 工具名冲突 | 不同 Server 提供了同名的工具 | 在 Host 端加 namespace 前缀，如 `fs__read_file` |

---

## 📝 本章小结

- ✅ **MCP 定义** — AI Agent 工具的标准化协议
- ✅ **三大能力** — Tools（执行操作）、Resources（获取数据）、Prompts（提示模板）
- ✅ **Client-Server** — Host 通过 Client 连接多个 Server

## ➡️ 下一章预告

> [第2章：MCP Server 开发](./02-mcp-server.md)
