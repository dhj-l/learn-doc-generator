# 第4章：传输协议 — MCP 的通信基石

> 预计学习时间：80-100 分钟

## 💡 本章概览

**生活类比：** 假设你要从北京寄一封信到上海。你可以选择：
- **自己开车送**（速度最快，但只能送本地）→ 类比 **stdio**
- **通过邮局寄平信**（可靠，支持全国）→ 类比 **HTTP SSE**
- **用顺丰快递**（快速、可追踪、双向实时）→ 类比 **Streamable HTTP**

MCP 的传输层就是这个「快递系统」。它负责把 LLM 的调用请求（我想查询数据库）从 Client 传递到 Server，再把结果（查询结果）从 Server 送回 Client。不同的传输协议适用于不同的场景，选择正确的协议直接决定了系统的性能、可靠性和部署复杂度。

**本章核心问题：** 在什么场景下选择哪种传输协议？如何配置和优化每种传输方式？

## 📋 前置知识

> 建议先完成：[第2章：MCP Server 开发](./02-mcp-server.md)

---

## 一、传输协议概览

### 1.1 MCP 的传输层架构

MCP 的传输层遵循 JSON-RPC 2.0 标准，所有的请求和响应都是 JSON 格式的消息：

```typescript
// MCP 消息格式（JSON-RPC 2.0）
// 请求
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": {
      "path": "./data.txt"
    }
  }
}

// 响应
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "文件内容..."
    }]
  }
}

// 通知（不需要响应）
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progress": 50,
    "total": 100
  }
}
```

> **关键概念：** 传输层只负责「怎么把消息发出去」，不关心「消息里有什么」。这就像快递公司只负责运送包裹，不关心包裹里装的是书还是衣服。这种关注点分离使得 MCP 可以灵活支持多种传输协议。

### 1.2 三种传输协议的对比

| 特性 | stdio | HTTP SSE | Streamable HTTP |
|------|-------|----------|-----------------|
| **通信方式** | 进程内标准输入/输出 | HTTP 请求 + SSE 流 | 双向 HTTP 流 |
| **延迟** | 最低（微秒级） | 中等（毫秒级） | 低（毫秒级） |
| **部署复杂度** | 最简单 | 中等（需要 HTTP 服务器） | 中等 |
| **远程访问** | ❌ 仅本地 | ✅ 支持远程 | ✅ 支持远程 |
| **双向通信** | ✅ 原生支持 | ✅ Server→Client (SSE) | ✅ 全双工 |
| **负载均衡** | ❌ 不支持 | ✅ 支持 | ✅ 支持 |
| **超时控制** | ❌ 无 | ✅ HTTP 超时 | ✅ 流式超时 |
| **适用场景** | 本地开发、CLI 工具 | 远程服务、Web 集成 | 生产环境、高并发 |

---

## 二、stdio 传输协议

### 2.1 工作原理

**生活类比：** stdio 就像是两个人面对面坐着，通过一张纸（stdout）和一张纸（stdin）交流。第一个人把问题写在纸上推过去（stdin），第二个人把答案写在另一张纸上推回来（stdout）。速度极快，但两个人在同一间屋子里才能这样交流。

```
┌─────────────────────────┐
│       MCP Client        │
│                         │
│  ┌───────────────────┐  │
│  │  写入 stdin ──────→  │  ← 请求
│  │  读取 stdout ←────  │  → 响应
│  └───────────────────┘  │
└────────┬────────────────┘
         │ 子进程
         ▼
┌─────────────────────────┐
│     MCP Server (stdio)  │
│  process.stdin  → 接收  │
│  process.stdout → 发送  │
│  process.stderr → 日志  │
└─────────────────────────┘
```

### 2.2 stdio Server 实现

```typescript
// stdio-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'stdio-demo-server',
  version: '1.0.0',
});

server.tool(
  'echo',
  '回显输入内容',
  { message: z.string() },
  async ({ message }) => ({
    content: [{ type: 'text', text: `你说了: ${message}` }],
  })
);

// 使用 stdio 传输
const transport = new StdioServerTransport();
await server.connect(transport);

// 注意：stdout 被用于 MCP 通信，所有日志必须输出到 stderr
console.error('✅ stdio Server 已启动');
```

### 2.3 stdio Client 连接

```typescript
// stdio-client.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main() {
  // 创建 Client
  const client = new Client({
    name: 'stdio-client',
    version: '1.0.0',
  });

  // 创建 stdio 传输通道：启动 Server 子进程
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['./stdio-server.js'],
    // 可选：工作目录
    cwd: '/path/to/server',
    // 可选：环境变量
    env: {
      NODE_ENV: 'development',
      DEBUG: 'mcp:*',
    },
  });

  // 连接
  await client.connect(transport);
  console.log('✅ 已连接到 stdio Server');

  // 调用工具
  const result = await client.callTool({
    name: 'echo',
    arguments: { message: '你好，MCP！' },
  });

  console.log('响应:', result.content[0].text);

  // 关闭连接
  await client.close();
}

main().catch(console.error);
```

### 2.4 stdio 的优缺点与最佳实践

**优点：**
- 零网络开销，延迟最低
- 无需 HTTP 服务器，部署最简单
- 安全性好——没有网络暴露面

**缺点：**
- 只能本地使用，无法远程调用
- 每个 Client 需要启动一个 Server 进程，资源消耗大
- 进程崩溃后需要手动重启

**最佳实践：**
```typescript
// 1. 始终使用 stderr 输出日志（stdout 留给 MCP 协议）
console.error('[INFO] Server 启动中...');   // ✅ 正确
console.log('[INFO] Server 启动中...');      // ❌ 错误！会破坏 MCP 协议

// 2. 处理进程退出信号
process.on('SIGINT', async () => {
  console.error('正在关闭 Server...');
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('收到终止信号...');
  await server.close();
  process.exit(0);
});

// 3. 实现进程健康检查（通过工具）
server.tool(
  'health_check',
  '检查 Server 健康状态',
  {},
  async () => ({
    content: [{
      type: 'text',
      text: JSON.stringify({
        status: 'healthy',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage().heapUsed,
      }),
    }],
  })
);
```

---

## 三、HTTP SSE 传输协议

### 3.1 SSE 基础

**生活类比：** SSE（Server-Sent Events）就像是你在餐厅点餐——你告诉服务员你要什么（HTTP 请求），然后服务员在厨房和你的桌子之间建立了一条专用的传菜通道，做好一道菜就送一道出来（SSE 事件流）。

```
时序图：

Client                          Server
  │                                │
  │──── POST /message (请求) ─────→│
  │                                │  ← 客户端先发送请求
  │←─ 200 OK (立即返回) ──────────│
  │                                │
  │←─ SSE: event (工具结果) ──────│  ← 服务器通过 SSE 推送结果
  │←─ SSE: event (进度通知) ─────│
  │←─ SSE: event (最终结果) ─────│
  │                                │
```

### 3.2 SSE Server 实现

```typescript
// sse-server.ts
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const app = express();
const server = new McpServer({
  name: 'sse-demo-server',
  version: '1.0.0',
});

// 注册工具
server.tool(
  'calculate',
  '执行数学计算',
  {
    expression: z.string().describe('数学表达式，如 "2 + 3 * 4"'),
  },
  async ({ expression }) => {
    try {
      // 安全起见，使用 mathjs 或类似库
      const result = eval(expression); // 仅示例，生产环境请使用安全沙箱
      return {
        content: [{ type: 'text', text: `${expression} = ${result}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `计算错误: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// SSE 端点：建立连接
app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);

  // 连接断开时清理
  req.on('close', () => {
    console.error('客户端断开连接');
  });
});

// 消息端点：接收 Client 发送的消息
app.post('/messages', async (req, res) => {
  // 注意：实际实现需要关联 session
  // 这里简化处理
  res.status(200).json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.error(`🚀 SSE Server 运行在 http://localhost:${PORT}/sse`);
});
```

### 3.3 SSE 的多 Client 管理

生产环境中，SSE Server 需要支持多个客户端同时连接：

```typescript
// multi-client-sse.ts
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

const app = express();
const server = new McpServer({
  name: 'multi-client-server',
  version: '1.0.0',
});

// 管理多个客户端连接
const clients: Map<string, SSEServerTransport> = new Map();

// SSE 连接端点
app.get('/sse', async (req, res) => {
  const sessionId = req.query.sessionId as string || crypto.randomUUID();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Session-Id': sessionId,
  });

  const transport = new SSEServerTransport('/messages', res);
  clients.set(sessionId, transport);

  await server.connect(transport);

  console.error(`🟢 客户端 ${sessionId} 已连接（当前在线: ${clients.size}）`);

  req.on('close', () => {
    clients.delete(sessionId);
    console.error(`🔴 客户端 ${sessionId} 已断开（当前在线: ${clients.size}）`);
  });
});

// 消息端点（需要 sessionId 路由）
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = clients.get(sessionId);

  if (!transport) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // 处理消息...
  res.status(202).json({ status: 'received' });
});

app.listen(3000);
```

### 3.4 SSE Client 实现

```typescript
// sse-client.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

async function main() {
  const client = new Client({
    name: 'sse-client',
    version: '1.0.0',
  });

  // 连接远程 SSE Server
  const transport = new SSEClientTransport({
    url: new URL('http://localhost:3000/sse'),
    // 可选：认证头
    headers: {
      Authorization: 'Bearer sk-prod-abc123',
    },
    // 可选：连接超时
    timeout: 10_000, // 10 秒
  });

  try {
    await client.connect(transport);
    console.log('✅ 已连接到远程 SSE Server');

    // 调用工具
    const result = await client.callTool({
      name: 'calculate',
      arguments: { expression: '42 * 2' },
    });

    console.log('计算结果:', result.content[0].text);
  } catch (error) {
    console.error('连接失败:', (error as Error).message);
  } finally {
    await client.close();
  }
}

main();
```

---

## 四、Streamable HTTP 传输协议

### 4.1 什么是 Streamable HTTP？

Streamable HTTP 是 MCP 最新引入的传输协议，它解决了 SSE 的一些固有问题：

**生活类比：** 如果说 SSE 是「打电话时对方说话你只能听着」，那么 Streamable HTTP 就是「视频通话」——双方可以随时说话，随时打断，随时插话。这是真正的双向实时通信。

```
传统 SSE：
  Client ──→ Server (请求)
  Client ←── Server (SSE 流)   ← 单向推送

Streamable HTTP：
  Client ──→ Server (流式请求)
  Client ←── Server (流式响应)
  同时全双工通信
```

### 4.2 Streamable HTTP 的核心特性

```typescript
// streamable-http-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { z } from 'zod';

const server = new McpServer({
  name: 'streamable-http-server',
  version: '1.0.0',
  capabilities: {
    tools: {},
    logging: {},
    // Streamable HTTP 支持 streaming
    streaming: true,
  },
});

// 注册一个流式响应工具
server.tool(
  'stream_analysis',
  '流式分析文本内容（支持渐进式输出）',
  {
    text: z.string().min(1).max(10000).describe('要分析的文本'),
    analysis_type: z.enum(['sentiment', 'keywords', 'summary']).describe('分析类型'),
  },
  async ({ text, analysis_type }, extra) => {
    // Streamable HTTP 支持发送部分结果
    if (extra?.sendProgress) {
      await extra.sendProgress({
        progress: 10,
        message: '正在解析文本...',
      });
    }

    // 模拟分步处理
    const words = text.split(/\s+/);
    const wordCount = words.length;

    if (extra?.sendProgress) {
      await extra.sendProgress({
        progress: 50,
        message: `分析完成: ${wordCount} 个词`,
      });
    }

    // 最终结果
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          word_count: wordCount,
          char_count: text.length,
          analysis_type,
          result: `基于 ${analysis_type} 分析的详细结果...`,
        }, null, 2),
      }],
    };
  }
);
```

### 4.3 完整的 Streamable HTTP 集成

```typescript
// complete-streamable-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import express from 'express';
import { z } from 'zod';
import http from 'http';

// 自定义 Streamable HTTP 传输实现
class CustomStreamableTransport {
  private req: http.IncomingMessage;
  private res: http.ServerResponse;

  constructor(req: http.IncomingMessage, res: http.ServerResponse) {
    this.req = req;
    this.res = res;
  }

  async start() {
    this.res.writeHead(200, {
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
  }

  async sendResponse(response: any) {
    this.res.write(JSON.stringify(response) + '\n');
  }

  async sendError(error: Error) {
    this.res.write(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32603, message: error.message },
    }) + '\n');
  }

  async end() {
    this.res.end();
  }
}

// 使用 Express 承载 Streamable HTTP
const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
  const transport = new CustomStreamableTransport(req, res);
  await transport.start();

  const { method, params, id } = req.body;

  // 根据方法分发处理
  switch (method) {
    case 'tools/list':
      await transport.sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'greet',
              description: '返回问候语',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                },
              },
            },
          ],
        },
      });
      break;

    case 'tools/call':
      const { name, arguments: args } = params;
      if (name === 'greet') {
        // 模拟流式输出
        await transport.sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: `你好，${args.name}！欢迎使用 Streamable HTTP！`,
            }],
          },
        });
      }
      break;

    default:
      await transport.sendError(new Error(`未知方法: ${method}`));
  }

  await transport.end();
});

app.listen(3001, () => {
  console.error('🚀 Streamable HTTP Server 已启动 (端口 3001)');
});
```

---

## 五、连接生命周期管理

### 5.1 完整的连接生命周期

无论是哪种传输协议，MCP 连接都遵循相同的生命周期：

```
[初始化] → [连接建立] → [能力协商] → [正常运行] → [优雅关闭]
    ↓           ↓            ↓            ↓              ↓
  创建实例  transport.connect 初始化交换 消息往返     关闭信号
```

### 5.2 实现重连机制

```typescript
// 可重连的 MCP Client
class ReconnectingMCPClient {
  private client: Client;
  private transport: any;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // 初始延迟 1 秒

  constructor() {
    this.client = new Client({
      name: 'resilient-client',
      version: '1.0.0',
    });
  }

  async connectWithRetry(transportConfig: any) {
    while (this.reconnectAttempts < this.maxReconnectAttempts) {
      try {
        this.transport = this.createTransport(transportConfig);
        await this.client.connect(this.transport);
        console.log('✅ 连接成功');
        this.reconnectAttempts = 0;
        return;
      } catch (error) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        console.error(`❌ 连接失败 (尝试 ${this.reconnectAttempts}/${this.maxReconnectAttempts}), ${delay}ms 后重试...`);
        await this.sleep(delay);
      }
    }
    throw new Error(`无法连接到 Server (已尝试 ${this.maxReconnectAttempts} 次)`);
  }

  private createTransport(config: any) {
    if (config.type === 'stdio') {
      return new StdioClientTransport({
        command: config.command,
        args: config.args,
      });
    } else {
      return new SSEClientTransport({
        url: new URL(config.url),
        headers: config.headers,
      });
    }
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async disconnect() {
    await this.client.close();
  }
}
```

### 5.3 心跳和健康检查

```typescript
// Server 端健康检查
server.tool(
  'ping',
  '检查连接是否正常',
  {},
  async () => ({
    content: [{
      type: 'text',
      text: JSON.stringify({
        status: 'ok',
        timestamp: Date.now(),
        connections: clients.size,
      }),
    }],
  })
);

// Client 端的心跳机制
class HeartbeatClient {
  private client: Client;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL = 30_000; // 30 秒
  private readonly HEARTBEAT_TIMEOUT = 10_000;  // 10 秒超时

  startHeartbeat() {
    this.heartbeatInterval = setInterval(async () => {
      try {
        const result = await Promise.race([
          this.client.callTool({ name: 'ping', arguments: {} }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('心跳超时')), this.HEARTBEAT_TIMEOUT)
          ),
        ]);
        console.log('💓 心跳正常');
      } catch (error) {
        console.error('💔 心跳失败:', (error as Error).message);
        this.handleHeartbeatFailure();
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  private handleHeartbeatFailure() {
    // 触发重连机制
    this.stopHeartbeat();
    // ... 重连逻辑
  }
}
```

---

## 六、传输协议选择决策树

以下决策树帮助你选择正确的传输协议：

```
所有工具都在本地运行吗？
├── ✅ 是 → 使用 stdio
│   └── 场景：开发调试、CLI 工具、本地 Agent
│
└── ❌ 否（需要远程访问）
    ├── 需要双向实时通信吗？
    │   ├── ✅ 是 → 使用 Streamable HTTP
    │   │   └── 场景：生产环境、高并发、流式 AI 响应
    │   │
    │   └── ❌ 否（主要是请求-响应模式）
    │       └── 使用 HTTP SSE
    │           └── 场景：Web 应用、API 网关、远程服务
    │
    └── 性能要求如何？
        ├── 高吞吐、低延迟 → Streamable HTTP
        ├── 中等 → HTTP SSE
        └── 开发测试 → stdio
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：什么情况下必须使用 Streamable HTTP 而不是 SSE？**

> A：当需要 Server 主动向 Client 发送消息（而不仅仅是响应 Client 的请求）时，必须使用 Streamable HTTP。典型场景包括：（1）实时进度推送——Server 需要持续报告长时间任务的状态；（2）Server 主动通知——如配置变更、数据更新事件；（3）双向流式通信——Client 和 Server 都在持续发送数据，如实时对话。

**Q2：stdio 的 stdout 为什么不能用于日志输出？**

> A：因为 stdio 传输协议使用 stdout（标准输出）作为 MCP 消息的传输通道。如果开发者将日志信息写入 stdout，这些日志会被 MCP Client 当作协议消息来解析，导致 JSON-RPC 解析失败。所有日志、调试信息必须通过 stderr（标准错误）输出。这是一个新手最容易犯的错误。

**Q3：如何选择合适的重连策略？**

> A：推荐「指数退避 + 随机抖动」（Exponential Backoff with Jitter）策略：每次重连的延迟时间按指数增长（1s → 2s → 4s → 8s），并加入随机抖动（±500ms）避免多个客户端同时重连造成「雪崩效应」。最大重连次数通常设为 5-10 次，超过后停止重连并报错。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| stdio 传输的子进程未正确处理标准输入/输出编码 | 默认编码不是 UTF-8，导致中文乱码 | 在启动子进程时设置 `encoding: 'utf-8'`，确保双方使用相同编码 |
| HTTP SSE 传输中连接未关闭导致资源泄漏 | 客户端断开后未清理 Server 端的 EventSource 连接 | 实现连接超时机制和断开事件的清理回调，及时释放资源 |
| Streamable HTTP 传输中流式数据顺序错乱 | 多个请求共享同一个流通道导致数据交错 | 为每个客户端请求建立独立的流通道，使用请求 ID 标识区分 |
| 重连策略配置不当导致频繁重连 | 心跳间隔过短或重连退避策略不合理 | 使用指数退避算法（初始 1s，最大 30s），心跳间隔设为 15~30 秒 |

---

## 📝 本章小结

- ✅ **stdio 传输** — 本地进程通信，零延迟，适合开发和 CLI 工具
- ✅ **HTTP SSE 传输** — 远程服务，Server→Client 推送，适合 Web 集成
- ✅ **Streamable HTTP 传输** — 全双工流式通信，适合生产环境和实时场景
- ✅ **连接生命周期** — 从初始化到优雅关闭的完整流程
- ✅ **重连与心跳** — 指数退避重连策略，心跳检测保活
- ✅ **决策树** — 根据场景选择最合适的传输协议

## ➡️ 下一章预告

> [第5章：实战 Servers](./05-practical-servers.md) — 构建文件系统、数据库、API 集成三个实用的 MCP Server。
