# 第4章：传输协议 — stdio、HTTP SSE 与 Streamable HTTP

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解三种传输协议的区别** — stdio、HTTP SSE、Streamable HTTP 各自的特点和适用场景
- **选择合适的传输方式** — 根据部署环境判断用哪种协议
- **实现跨网络的 MCP 通信** — 构建能远程访问的 MCP Server
- **处理传输层的异常** — 断线重连、超时控制、负载均衡

## 📋 前置知识

> 建议先完成：
> - [第1章：MCP 概述](./01-mcp-overview.md) — 理解 MCP 整体架构
> - [第2章：MCP Server 开发](./02-mcp-server.md) — 熟悉 Server 基础构建
> - 了解 HTTP 协议基础（请求/响应、状态码、Header）

---

## 💡 核心概念

### 为什么传输协议如此重要？

**生活类比：** MCP 的传输协议就像物流公司的配送方式。你下单购买商品（调用工具），货物可以通过不同方式送达：
- 🚶 **同城闪送（stdio）** — 最快、最直接，但只能服务本地
- 🚗 **普通快递（HTTP SSE）** — 可以送到全国，但要经过中转站
- 🚀 **冷链专运（Streamable HTTP）** — 适合特殊需求，可以边送边查看货物状态

选择哪种传输方式，取决于你的货物（数据）需要送到多远、多快、多大体积。

### Stdio 传输协议 — 本地进程通信

Stdio 是最简单的传输方式：MCP Server 作为一个子进程运行，通过标准输入（stdin）接收消息，通过标准输出（stdout）发送消息。

```
┌─────────────────┐      stdin/stdout       ┌─────────────────┐
│   MCP Client    │ ◄──────────────────────► │   MCP Server    │
│  （主进程）      │     JSON-RPC 消息       │  （子进程）      │
└─────────────────┘                          └─────────────────┘
```

```typescript
// Client 端连接 stdio Server
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',                    // 启动命令
  args: ['./dist/weather-server.js'], // 参数
  env: {                              // 环境变量
    NODE_ENV: 'production',
    LOG_LEVEL: 'info',
  },
});

const client = new Client({
  name: 'my-agent',
  version: '1.0.0',
});

await client.connect(transport);

// 调用工具
const result = await client.callTool({
  name: 'get_weather',
  arguments: { city: '北京' },
});
```

**💡 什么时候用 stdio？**
- Agent 在本地运行（如 Claude Desktop、本地脚本）
- 不需要远程访问工具
- 追求最低延迟（没有网络开销）
- 开发阶段快速测试

### HTTP SSE 传输协议 — 远程访问

HTTP SSE（Server-Sent Events）让 MCP Server 可以通过 HTTP 协议被远程访问。Client 通过 HTTP POST 发送请求，Server 通过 SSE 流式返回结果。

```
┌─────────────┐   HTTP POST    ┌──────────────┐
│ MCP Client  │ ──────────────►│  MCP Server  │
│ （远程）     │                │  （HTTP 服务） │
│             │ ◄──────────────│              │
└─────────────┘   SSE 流       └──────────────┘
```

```typescript
// Server 端：使用 HTTP SSE 传输
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const app = express();
const server = new McpServer({
  name: 'remote-server',
  version: '1.0.0',
});

// 注册工具
server.tool('hello', { name: z.string() }, async ({ name }) => ({
  content: [{ type: 'text', text: `你好，${name}！` }],
}));

// SSE 端点：Client 先连接这里建立 SSE 流
const transports: Map<string, SSEServerTransport> = new Map();

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  transports.set(transport.sessionId, transport);
  res.on('close', () => {
    transports.delete(transport.sessionId);
  });
  await server.connect(transport);
});

// 消息端点：Client 通过这里发送请求
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(404).send('Session 未找到');
  }
});

app.listen(3000, () => {
  console.log('MCP Server (SSE) 运行在 http://localhost:3000');
});
```

```typescript
// Client 端：连接远程 SSE Server
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport({
  url: new URL('http://localhost:3000/sse'),
});

const client = new Client({
  name: 'remote-agent',
  version: '1.0.0',
});

await client.connect(transport);

// 就像调用本地工具一样
const result = await client.callTool({
  name: 'hello',
  arguments: { name: 'Agent' },
});
console.log(result);
```

**💡 什么时候用 HTTP SSE？**
- Agent 和 Server 不在同一台机器
- 需要多个 Agent 共享同一个工具服务
- 工具需要调用外部 API（需要网络访问）
- 需要负载均衡和水平扩展

### Streamable HTTP 传输协议 — 生产级流式通信

Streamable HTTP 是 SSE 的进化版，解决了 SSE 的一些限制（如连接保持、断线重连）。

```typescript
// Streamable HTTP Server（需要使用支持流式的框架）
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamable-http.js';

const app = express();
const server = new McpServer({
  name: 'streamable-server',
  version: '1.0.0',
});

server.tool(
  'stream_process',
  '流式处理数据',
  {
    data: z.string().describe('要处理的数据'),
    format: z.enum(['upper', 'reverse', 'count']).default('upper'),
  },
  async ({ data, format }) => {
    // 模拟流式输出
    const results = [];
    for (const char of data) {
      if (format === 'upper') results.push(char.toUpperCase());
      else if (format === 'reverse') results.unshift(char);
      else results.push(char.charCodeAt(0).toString());
    }
    return {
      content: [{ type: 'text', text: results.join('') }],
    };
  }
);

// 单一端点处理所有请求
app.post('/mcp', express.json(), async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionId: req.headers['x-session-id'] as string || crypto.randomUUID(),
  });

  res.setHeader('Content-Type', 'text/event-stream');
  await transport.handleRequest(req, res);
  await server.connect(transport);
});

app.listen(3001);
```

**💡 Streamable HTTP vs SSE 的核心区别：**

| 特性 | HTTP SSE | Streamable HTTP |
|------|----------|----------------|
| 连接方式 | 长连接（一直保持） | 按需创建 |
| 断线重连 | 需手动实现 | 内置支持 |
| 负载均衡 | 困难（粘性会话） | 天然支持 |
| 适合场景 | 开发/小规模 | 生产环境/大规模 |

---

## 🔨 实战演练

### 练习：构建一个可远程访问的文件管理系统

**场景描述：** 你的团队分布在不同的城市，需要一个中央文件管理 Server。团队成员（通过 Agent）可以远程读取、搜索、管理文件。

**你的任务：**
1. 创建一个基于 HTTP SSE 的 MCP Server，提供文件管理工具
2. 实现三个工具：`list_files`、`read_file`、`search_files`
3. Client 端通过 HTTP 远程连接并调用工具

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

**Server 端 (file-server.ts)：**
```typescript
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

const allowedBaseDir = process.env.ALLOWED_DIR || './shared-files';

const server = new McpServer({
  name: 'remote-file-server',
  version: '1.0.0',
});

// 安全检查：确保路径在允许的目录内
function safePath(filePath: string): string {
  const resolved = path.resolve(allowedBaseDir, filePath);
  if (!resolved.startsWith(path.resolve(allowedBaseDir))) {
    throw new Error(`路径越权：不允许访问 ${filePath} 之外的目录`);
  }
  return resolved;
}

server.tool(
  'list_files',
  '列出指定目录的文件和文件夹',
  {
    dir: z.string().default('.').describe('相对于共享目录的路径'),
  },
  async ({ dir }) => {
    try {
      const targetDir = safePath(dir);
      const entries = await fs.readdir(targetDir, { withFileTypes: true });
      const files = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: entry.isFile() ? (await fs.stat(path.join(targetDir, entry.name))).size : null,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(files, null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `错误: ${(error as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  'read_file',
  '读取文件内容',
  {
    file: z.string().describe('相对于共享目录的文件路径'),
    encoding: z.enum(['utf-8', 'base64']).default('utf-8'),
  },
  async ({ file, encoding }) => {
    try {
      const targetFile = safePath(file);
      const content = await fs.readFile(targetFile, encoding);
      return { content: [{ type: 'text', text: content as string }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `错误: ${(error as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  'search_files',
  '在共享目录中搜索文件',
  {
    pattern: z.string().describe('搜索关键词'),
    ext: z.string().optional().describe('文件扩展名过滤，如 .ts、.md'),
  },
  async ({ pattern, ext }) => {
    try {
      async function* walk(dir: string): AsyncGenerator<string> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) yield* walk(fullPath);
          else yield fullPath;
        }
      }

      const matches: string[] = [];
      for await (const filePath of walk(allowedBaseDir)) {
        const relativePath = path.relative(allowedBaseDir, filePath);
        if (ext && !filePath.endsWith(ext)) continue;
        if (relativePath.toLowerCase().includes(pattern.toLowerCase())) {
          matches.push(relativePath);
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `错误: ${(error as Error).message}` }], isError: true };
    }
  }
);

// HTTP 服务
const app = express();
const transports = new Map<string, SSEServerTransport>();

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  transports.set(transport.sessionId, transport);
  res.on('close', () => transports.delete(transport.sessionId));
  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  if (!transport) return res.status(404).send('Session 未找到');
  await transport.handlePostMessage(req, res);
});

app.listen(3000, () => console.log('远程文件 Server 运行在 http://localhost:3000'));
```

**Client 端 (client.ts)：**
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport({
  url: new URL('http://localhost:3000/sse'),
});

const client = new Client({ name: 'remote-agent', version: '1.0.0' });
await client.connect(transport);

// 列出文件
const files = await client.callTool({
  name: 'list_files',
  arguments: { dir: '.' },
});
console.log('文件列表:', files);

// 搜索 Markdown 文件
const found = await client.callTool({
  name: 'search_files',
  arguments: { pattern: 'readme', ext: '.md' },
});
console.log('找到的文件:', found);

await client.close();
```

**预期输出：**
```
文件列表: [
  { "name": "docs", "type": "directory", "size": null },
  { "name": "README.md", "type": "file", "size": 2341 },
  { "name": "config.json", "type": "file", "size": 567 }
]
找到的文件: [
  "README.md",
  "docs/api-readme.md"
]
```

</details>

---

## ⚡ 进阶技巧

### 多 Client 连接管理

当多个 Agent 同时连接时，需要管理好每个会话的传输实例：

```typescript
class ConnectionPool {
  private connections = new Map<string, { transport: SSEServerTransport; createdAt: Date }>();

  register(sessionId: string, transport: SSEServerTransport) {
    this.connections.set(sessionId, { transport, createdAt: new Date() });
  }

  get(sessionId: string): SSEServerTransport | undefined {
    return this.connections.get(sessionId)?.transport;
  }

  remove(sessionId: string) {
    this.connections.delete(sessionId);
  }

  // 清理超时会话（30分钟无活动）
  cleanup(maxAgeMs: number = 30 * 60 * 1000) {
    const now = Date.now();
    for (const [id, conn] of this.connections) {
      if (now - conn.createdAt.getTime() > maxAgeMs) {
        this.connections.delete(id);
      }
    }
  }
}
```

### 传输协议选择决策树

```
工具是否需要远程访问？
├─ 否 → Stdio（最简单、最快）
└─ 是 → 是否需要生产级特性？
    ├─ 否 → HTTP SSE（开发/小规模远程）
    └─ 是 → Streamable HTTP（生产环境）
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：stdio 传输模式下，为什么错误日志要写到 stderr 而不是 stdout？**

> A：MCP 协议通过 stdout 传递 JSON-RPC 消息。如果把日志写到 stdout，会污染消息流，导致 Client 解析失败。stderr 是独立的输出通道，写入的内容不会被 MCP 协议解析，可以安全地用于日志记录。

**Q2：SSE 传输中为什么需要两个端点（/sse 和 /messages）？**

> A：SSE 是单向通道（Server → Client），只能用于推送消息。所以需要额外的 /messages 端点让 Client → Server 发送请求。这被称为「双通道模式」——一个通道用于推送，一个通道用于接收请求。

**Q3：Streamable HTTP 如何解决负载均衡问题？**

> A：SSE 需要长连接保持，负载均衡器需要「粘性会话」将同一个 Client 始终路由到同一台 Server。而 Streamable HTTP 每次请求都是独立的 HTTP 调用，负载均衡器可以自由分配请求到任何 Server 实例。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| SSE 连接成功后立即断开 | 未正确处理 Server 端连接的生命周期 | 添加 `res.on('close')` 清理逻辑，确保连接保持 |
| 远程调用时出现 CORS 错误 | SSE 端点的跨域配置缺失 | 在 express 中添加 `cors()` 中间件 |
| stdio 模式下大量日志输出导致消息错乱 | 日志写到了 stdout（应用日志） | 全部使用 `console.error` 输出日志 |
| Agent 调用远程工具超时 | 网络延迟 + 默认超时设置过短 | 设置合理的超时值：`client.connect(transport, { timeout: 30000 })` |
| 多个 Agent 共享 Server 时数据混乱 | 所有 Agent 使用同一个传输实例 | 每个 Agent 连接创建独立的 SSEServerTransport |

---

## 📝 本章小结

- ✅ **Stdio 传输** — 本地进程通信，零网络开销，适合本地 Agent
- ✅ **HTTP SSE 传输** — 双向通道模式（/sse + /messages），实现远程访问
- ✅ **Streamable HTTP** — 生产级方案，内置断线重连，支持负载均衡
- ✅ **选择策略** — 本地用 stdio，远程小规模用 SSE，生产环境用 Streamable HTTP

## ➡️ 下一章预告

> 在下一章中，我们将动手构建 3 个实用的 MCP Server——文件系统、数据库查询和 API 集成，将这些理论知识应用到真实场景中。
> [第5章：实战 Server](./05-practical-servers.md)
