# 第1章：MCP 概述 — 标准化的 Agent 工具协议

> 预计学习时间：80-100 分钟

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

## 📝 本章小结

- ✅ **MCP 定义** — AI Agent 工具的标准化协议
- ✅ **三大能力** — Tools（执行操作）、Resources（获取数据）、Prompts（提示模板）
- ✅ **Client-Server** — Host 通过 Client 连接多个 Server

## ➡️ 下一章预告

> [第2章：MCP Server 开发](./02-mcp-server.md)
