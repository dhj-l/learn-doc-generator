# 第6章：MCP Client 集成 — 连接与编排 MCP Server

> 预计学习时间：90-110 分钟

## 💡 本章概览

**生活类比：** 如果 MCP Server 是各种「工具人」——厨师（文件系统）、图书管理员（数据库）、快递员（API 集成），那么 MCP Client 就是 **项目经理**。项目经理知道：
- 手下有哪些工具人可用（listTools）
- 什么时候该叫哪个工具人（callTool）
- 怎么协调多个工具人一起完成大项目（多 Server 编排）

在前五章中，我们一直在构建 Server——学会了如何开发、保护、部署 MCP Server。现在我们要从 **供应端** 转向 **消费端**：如何开发一个 MCP Client，让它能够连接 Server、调用工具、管理资源，并在多个 Server 之间进行编排。

## 📋 前置知识

> 建议先完成：[第2章：MCP Server 开发](./02-mcp-server.md)、[第4章：传输协议](./04-transport.md)

---

## 一、MCP Client 基础

### 1.1 Client 的核心职责

MCP Client 在整个 MCP 架构中处于「中间人」位置：

```
┌─────────────────────────────────────────┐
│              MCP Host                    │
│  (你的应用：CLI、Web、Chat Bot 等)       │
│                                          │
│  ┌──────────────────────────────────┐    │
│  │         MCP Client               │    │
│  │  ┌─────────┐  ┌─────────┐      │    │
│  │  │ connect │  │ callTool│ ...  │    │
│  │  └────┬────┘  └────┬────┘      │    │
│  └───────┼────────────┼───────────┘    │
└──────────┼────────────┼────────────────┘
           │            │
      ┌────┴────┐  ┌────┴────┐
      │ Server 1 │  │ Server 2 │
      └─────────┘  └─────────┘
```

**Client 的核心职责：**
1. **连接管理** — 建立、维护、关闭与 Server 的连接
2. **协议转换** — 将应用程序的调用转换为 JSON-RPC 消息
3. **能力发现** — 发现 Server 提供的工具、资源和提示
4. **请求路由** — 将工具调用请求发送到正确的 Server
5. **结果聚合** — 接收 Server 的响应并返回给应用程序

### 1.2 创建基础 Client

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// 1. 创建 Client 实例
const client = new Client(
  {
    name: 'demo-client',
    version: '1.0.0',
  },
  {
    // 可选配置
    capabilities: {
      sampling: {},  // 支持 LLM 采样（高级特性）
    },
  }
);

// 2. 创建传输通道
const transport = new StdioClientTransport({
  command: 'node',
  args: ['./server.js'],
});

// 3. 建立连接
await client.connect(transport);
console.log('✅ 已连接到 Server');

// 4. 发现 Server 能力
const { tools, resources, prompts } = await client.listTools();
// 注意：listTools 返回工具列表
// resources 和 prompts 需要分别调用 listResources() 和 listPrompts()

// 5. 调用工具
const result = await client.callTool({
  name: 'read_file',
  arguments: {
    path: './data.txt',
  },
});

// 6. 关闭连接
await client.close();
```

**连接时协议握手的过程：**

```
Client                              Server
  │                                   │
  │─── initialize (协议版本协商) ────→│
  │                                   │
  │←── initialized (Server 能力信息) ─│
  │                                   │
  │─── tools/list ──────────────────→│
  │←── 工具列表 ─────────────────────│
  │                                   │
  │─── tools/call (工具调用) ────────→│
  │←── 工具结果 ─────────────────────│
  │                                   │
```

---

## 二、Client 核心 API 详解

### 2.1 connect() — 连接 Server

```typescript
const transport = new StdioClientTransport({
  command: 'node',
  args: ['./server.js'],
  // 工作目录
  cwd: '/path/to/project',
  // 环境变量
  env: {
    NODE_ENV: 'production',
    API_KEY: 'sk-xxx',
  },
});

await client.connect(transport);

// 连接成功后，可以获取 Server 信息
const serverInfo = client.getServerVersion();
console.log(`已连接到: ${serverInfo.name} v${serverInfo.version}`);
```

### 2.2 listTools() — 列出可用工具

```typescript
interface Tool {
  name: string;
  description?: string;
  inputSchema: {  // JSON Schema 格式
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

// 获取工具列表
const response = await client.listTools();
const tools: Tool[] = response.tools;

console.log(`Server 提供了 ${tools.length} 个工具:`);
for (const tool of tools) {
  console.log(`  🛠️ ${tool.name}: ${tool.description}`);
  console.log(`     参数: ${Object.keys(tool.inputSchema.properties || {}).join(', ')}`);
}
```

### 2.3 callTool() — 调用工具

```typescript
// 同步调用
const result = await client.callTool({
  name: 'calculate',
  arguments: {
    expression: '2 + 2',
  },
});

// 带进度回调的调用
const resultWithProgress = await client.callTool(
  {
    name: 'batch_process',
    arguments: {
      filePaths: ['a.txt', 'b.txt', 'c.txt'],
    },
  },
  {
    // 进度回调
    onProgress: (progress) => {
      console.log(`进度: ${progress.progress}%`);
      if (progress.message) {
        console.log(`  状态: ${progress.message}`);
      }
    },
    // 超时控制
    timeout: 120_000, // 2 分钟
  }
);

// 处理结果
const { content, isError } = result;
for (const item of content) {
  if (item.type === 'text') {
    console.log(item.text);
  }
  // 其他类型：image, resource, embedded 等
}
```

### 2.4 资源管理 API

```typescript
// 列出所有资源
const resources = await client.listResources();
console.log('可用资源:', resources);

// 读取特定资源
const resourceContent = await client.readResource({
  uri: 'config://app/settings',
});
console.log('资源内容:', resourceContent.contents[0].text);

// 订阅资源更新（Server 主动推送）
await client.subscribeResource({
  uri: 'config://app/settings',
});

// 监听资源更新
client.onNotification((notification) => {
  if (notification.method === 'notifications/resources/updated') {
    console.log('🔄 资源已更新:', notification.params.uri);
  }
});
```

### 2.5 提示模板 API

```typescript
// 列出提示模板
const prompts = await client.listPrompts();
console.log('可用提示模板:', prompts);

// 获取特定提示
const promptResult = await client.getPrompt({
  name: 'code-review',
  arguments: {
    code: 'const x = 1;',
    language: 'typescript',
  },
});
console.log('提示内容:', promptResult.messages[0].content.text);
```

---

## 三、多 Server 编排

### 3.1 多 Server 连接管理

实际应用中，一个 AI Agent 通常需要同时连接多个 MCP Server：

```typescript
// multi-client-manager.ts — 多 Server 连接管理器
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

interface ServerConnection {
  name: string;
  client: Client;
  transport: any;
  tools: any[];
}

class MultiServerManager {
  private connections: Map<string, ServerConnection> = new Map();

  /**
   * 注册并连接一个 MCP Server
   */
  async addServer(config: {
    name: string;
    transport: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    headers?: Record<string, string>;
  }): Promise<void> {
    const client = new Client({
      name: `multi-client-${config.name}`,
      version: '1.0.0',
    });

    let transport: any;
    if (config.transport === 'stdio') {
      transport = new StdioClientTransport({
        command: config.command!,
        args: config.args,
      });
    } else {
      transport = new SSEClientTransport({
        url: new URL(config.url!),
        headers: config.headers,
      });
    }

    await client.connect(transport);

    // 获取 Server 提供的工具列表
    const { tools } = await client.listTools();

    this.connections.set(config.name, {
      name: config.name,
      client,
      transport,
      tools,
    });

    console.log(`✅ 已连接 Server: ${config.name} (${tools.length} 个工具)`);
  }

  /**
   * 获取所有 Server 的工具总览
   */
  getAllTools(): Array<{ serverName: string; tool: any }> {
    const allTools: Array<{ serverName: string; tool: any }> = [];
    for (const [name, conn] of this.connections) {
      for (const tool of conn.tools) {
        allTools.push({ serverName: name, tool });
      }
    }
    return allTools;
  }

  /**
   * 调用指定 Server 的工具
   */
  async callTool(serverName: string, toolName: string, args: any) {
    const conn = this.connections.get(serverName);
    if (!conn) {
      throw new Error(`Server "${serverName}" 未连接`);
    }

    return conn.client.callTool({
      name: toolName,
      arguments: args,
    });
  }

  /**
   * 智能路由：根据工具名称自动选择 Server
   */
  async smartCall(toolName: string, args: any) {
    for (const [name, conn] of this.connections) {
      const tool = conn.tools.find(t => t.name === toolName);
      if (tool) {
        console.log(`🔀 路由到 Server "${name}" 的工具 "${toolName}"`);
        return conn.client.callTool({ name: toolName, arguments: args });
      }
    }
    throw new Error(`未找到工具 "${toolName}"（已连接 Servers: ${Array.from(this.connections.keys()).join(', ')}）`);
  }

  /**
   * 断开所有连接
   */
  async disconnectAll() {
    for (const [name, conn] of this.connections) {
      await conn.client.close();
      console.log(`🔌 已断开: ${name}`);
    }
    this.connections.clear();
  }
}
```

### 3.2 使用多 Server 管理器

```typescript
// app.ts — 使用多 Server 管理器
async function main() {
  const manager = new MultiServerManager();

  // 连接文件系统 Server
  await manager.addServer({
    name: 'filesystem',
    transport: 'stdio',
    command: 'node',
    args: ['./filesystem-server.js'],
  });

  // 连接数据库 Server
  await manager.addServer({
    name: 'database',
    transport: 'stdio',
    command: 'node',
    args: ['./database-server.js'],
  });

  // 连接远程 API 集成 Server
  await manager.addServer({
    name: 'api-integration',
    transport: 'sse',
    url: 'http://remote-server:3000/sse',
    headers: {
      Authorization: 'Bearer sk-prod-xxx',
    },
  });

  // 查看所有可用的工具
  const allTools = manager.getAllTools();
  console.log('📋 所有可用工具:');
  for (const { serverName, tool } of allTools) {
    console.log(`  [${serverName}] 🛠️ ${tool.name}`);
  }

  // 智能调用（自动路由到对应 Server）
  const readResult = await manager.smartCall('read_file', { path: './data.txt' });
  console.log('读取结果:', readResult.content[0].text);

  const queryResult = await manager.smartCall('execute_query', {
    dbType: 'mysql',
    host: 'localhost',
    database: 'test',
    user: 'root',
    password: 'password',
    sql: 'SELECT * FROM users LIMIT 5',
  });
  console.log('查询结果:', queryResult.content[0].text);

  // 断开所有连接
  await manager.disconnectAll();
}

main().catch(console.error);
```

### 3.3 工具调用编排模式

**生活类比：** 一个大型项目就像做一桌宴席。项目经理（编排器）需要按顺序执行：
1. 让采购员（API Server）购买食材
2. 让厨师（文件系统 Server）准备配料
3. 让主厨（数据库 Server）查询菜谱
4. 最后摆盘上菜

```typescript
// orchestrator.ts — 工具调用编排器
class ToolOrchestrator {
  private manager: MultiServerManager;

  constructor(manager: MultiServerManager) {
    this.manager = manager;
  }

  /**
   * 管道模式：前一个工具的输出作为后一个工具的输入
   *
   * 适用场景：数据处理流水线
   * 例：搜索文件 → 读取内容 → 分析内容 → 生成报告
   */
  async pipeline(steps: Array<{
    server: string;
    tool: string;
    mapArgs: (prevResult: any) => any;
  }>) {
    let prevResult: any = null;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const args = i === 0 ? {} : step.mapArgs(prevResult);

      console.log(`📋 步骤 ${i + 1}/${steps.length}: [${step.server}] ${step.tool}`);
      prevResult = await this.manager.callTool(step.server, step.tool, args);
    }

    return prevResult;
  }

  /**
   * 扇出模式：同时调用多个工具，聚合结果
   *
   * 适用场景：并行收集多源数据
   * 例：同时查询天气、新闻、股票 → 合并为综合报告
   */
  async fanOut(tasks: Array<{
    server: string;
    tool: string;
    args: any;
  }>): Promise<any[]> {
    const promises = tasks.map(async (task) => {
      console.log(`🔄 并行执行: [${task.server}] ${task.tool}`);
      const result = await this.manager.callTool(task.server, task.tool, task.args);
      return {
        server: task.server,
        tool: task.tool,
        result,
      };
    });

    return Promise.all(promises);
  }

  /**
   * 条件路由模式：根据条件选择不同的工具链
   *
   * 适用场景：根据不同输入走不同处理链路
   */
  async conditionalRoute(
    condition: () => Promise<boolean>,
    yesBranch: () => Promise<any>,
    noBranch: () => Promise<any>
  ) {
    const result = await condition();
    console.log(`🔀 条件判断: ${result ? '走 Yes 分支' : '走 No 分支'}`);
    return result ? yesBranch() : noBranch();
  }
}
```

---

## 四、错误处理与优雅降级

### 4.1 Client 端错误分类

```typescript
// client-error-handler.ts
class ClientErrorHandler {
  /**
   * MCP Client 可能遇到的错误类型及处理策略
   */
  static readonly ERROR_STRATEGIES = {
    // 连接错误：Server 不可达
    CONNECTION: {
      retryable: true,
      message: '无法连接到 Server，请检查 Server 是否运行',
    },
    // 超时错误：工具执行超时
    TIMEOUT: {
      retryable: true,
      message: '工具执行超时，可能是查询过于复杂',
      action: '建议简化查询或增加超时时间',
    },
    // 工具不存在
    TOOL_NOT_FOUND: {
      retryable: false,
      message: '请求的工具不存在',
      action: '请先调用 listTools 确认可用工具',
    },
    // 参数错误
    INVALID_PARAMS: {
      retryable: false,
      message: '工具参数不符合要求',
      action: '请检查参数的类型和格式',
    },
    // 权限错误
    PERMISSION_DENIED: {
      retryable: false,
      message: '权限不足',
      action: '请检查 API Key 或权限配置',
    },
    // 内部错误
    INTERNAL: {
      retryable: true,
      message: 'Server 内部错误',
      action: '请稍后重试或检查 Server 日志',
    },
  };

  static handleError(error: any): { message: string; action?: string; retryable: boolean } {
    // 解析错误码
    if (error.code) {
      switch (error.code) {
        case -32003: // PermissionDenied
          return this.ERROR_STRATEGIES.PERMISSION_DENIED;
        case -32001: // ToolNotFound
          return this.ERROR_STRATEGIES.TOOL_NOT_FOUND;
        case -32004: // Timeout
          return this.ERROR_STRATEGIES.TIMEOUT;
        case -32603: // InternalError
          return this.ERROR_STRATEGIES.INTERNAL;
        default:
          return this.ERROR_STRATEGIES.CONNECTION;
      }
    }

    // 网络错误
    if (error.message?.includes('connect') || error.message?.includes('ECONNREFUSED')) {
      return this.ERROR_STRATEGIES.CONNECTION;
    }

    return this.ERROR_STRATEGIES.INTERNAL;
  }
}

// 使用
try {
  const result = await client.callTool({ name: 'some_tool', arguments: {} });
} catch (error) {
  const { message, action, retryable } = ClientErrorHandler.handleError(error);
  console.error(`❌ ${message}`);
  if (action) console.error(`💡 建议: ${action}`);
  if (retryable) console.error('🔄 正在自动重试...');
}
```

### 4.2 带重试的 Client 调用

```typescript
class ResilientClient {
  private client: Client;
  private maxRetries = 3;

  async callToolWithRetry(
    request: { name: string; arguments: any },
    options?: { timeout?: number }
  ): Promise<any> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.client.callTool(request, options);
      } catch (error) {
        lastError = error;
        const strategy = ClientErrorHandler.handleError(error);

        if (!strategy.retryable) {
          throw error; // 不可重试的错误直接抛出
        }

        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.warn(`⚠️ 第 ${attempt} 次尝试失败，${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}
```

---

## 五、完整示例：AI 编码助手 Client

```typescript
// coding-assistant-client.ts — AI 编码助手示例
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

class CodingAssistantClient {
  private fileClient: Client;
  private dbClient: Client;
  private apiClient: Client;

  async initialize() {
    // 文件系统 Server
    this.fileClient = new Client({ name: 'file-client', version: '1.0.0' });
    await this.fileClient.connect(new StdioClientTransport({
      command: 'node', args: ['./filesystem-server.js'],
    }));

    // 数据库 Server
    this.dbClient = new Client({ name: 'db-client', version: '1.0.0' });
    await this.dbClient.connect(new StdioClientTransport({
      command: 'node', args: ['./database-server.js'],
    }));

    // API 集成 Server
    this.apiClient = new Client({ name: 'api-client', version: '1.0.0' });
    await this.apiClient.connect(new StdioClientTransport({
      command: 'node', args: ['./api-server.js'],
    }));
  }

  // 1. 读取项目代码
  async readProjectFiles(projectPath: string) {
    const { content } = await this.fileClient.callTool({
      name: 'list_directory',
      arguments: { dirPath: projectPath },
    });
    return JSON.parse(content[0].text);
  }

  // 2. 搜索相关代码
  async searchCode(pattern: string) {
    const { content } = await this.fileClient.callTool({
      name: 'search_files',
      arguments: { pattern },
    });
    return JSON.parse(content[0].text);
  }

  // 3. 查询数据库 Schema
  async getDatabaseSchema() {
    const { content } = await this.dbClient.callTool({
      name: 'get_table_info',
      arguments: {
        dbType: 'mysql',
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      },
    });
    return JSON.parse(content[0].text);
  }

  // 4. 调用外部 API 获取依赖信息
  async getPackageInfo(packageName: string) {
    const { content } = await this.apiClient.callTool({
      name: 'http_request',
      arguments: {
        url: `https://registry.npmjs.org/${packageName}`,
        method: 'GET',
      },
    });
    return JSON.parse(content[0].text);
  }

  async cleanup() {
    await Promise.all([
      this.fileClient.close(),
      this.dbClient.close(),
      this.apiClient.close(),
    ]);
  }
}

// 使用
async function main() {
  const assistant = new CodingAssistantClient();
  await assistant.initialize();

  const files = await assistant.readProjectFiles('./src');
  console.log(`项目包含 ${files.items.length} 个文件/目录`);

  await assistant.cleanup();
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Client 的 connect() 方法内部发生了什么？**

> A：connect() 内部完成三步协议握手：（1）发送 `initialize` 请求，包含 Client 的名称、版本和支持的能力；（2）Server 回复 `initialized`，返回 Server 的名称、版本和它支持的能力；（3）双方建立能力协商结果（比如 Client 支持进度报告，Server 也支持，那么后续就可以使用进度功能）。这个过程类似于 HTTP 的 TLS 握手——双方确认彼此的身份和能力后才能开始通信。

**Q2：多 Server 编排中，智能路由（smartCall）如何保证效率？**

> A：智能路由在连接时缓存了每个 Server 的工具列表（通过 listTools），调用时通过工具名称在缓存中查找。这是一个 O(n) 的查找操作（n 为已注册工具总数），效率很高。如果工具名称有冲突（多个 Server 提供了同名工具），有两种策略：（1）优先级排序——按 Server 优先级选择；（2）命名空间——自动添加前缀，如 `filesystem.read_file` 和 `database.read_file`。

**Q3：Client 端的重试策略应该注意什么？**

> A：三个关键点：（1）只对可重试的错误进行重试（连接失败、超时），不可重试的错误（参数错误、权限不足）应直接报错；（2）使用指数退避（Exponential Backoff）避免雪崩效应；（3）设置最大重试次数（通常 3-5 次），避免无限重试消耗资源。另外需要注意幂等性——确保同一个请求被多次执行不会产生副作用（比如多次扣款）。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Client `connect` 后未能正确发现 Server 的所有工具 | 未调用 `listTools()` 或工具注册在 Client 连接之后 | 在连接成功后主动调用 `listTools()` 刷新工具列表，并监听工具变更事件 |
| 多 Server 编排中工具名称冲突导致调用错误 | 不同 Server 注册了同名工具 | 在 `MultiServerManager` 中使用命名空间（如 `serverName.toolName`）隔离工具名称 |
| Pipeline 编排模式中下游未收到上游的完整输出 | 状态传递只传了指针而非深拷贝，后续被修改 | 在 Pipeline 各阶段之间使用结构化数据传递，确保每个阶段接收的是独立的快照 |
| Client 断开后未正确清理 Server 连接 | 未调用 `close()` 或 `disconnect()` 方法 | 在 Client 的 cleanup 或 finally 块中显式调用 `server.close()` 或 `client.disconnect()` |

---

## 📝 本章小结

- ✅ **Client 基础** — connect、listTools、callTool 三大核心方法
- ✅ **资源与提示管理** — readResource、getPrompt、订阅更新
- ✅ **多 Server 编排** — MultiServerManager、智能路由、连接池管理
- ✅ **编排模式** — Pipeline（管道）、Fan-Out（扇出）、Conditional Route（条件路由）
- ✅ **错误处理** — 错误分类策略、指数退避重试、优雅降级

## ➡️ 下一章预告

> [第7章：综合实战](./07-capstone-mcp.md) — 构建一个完整的 AI 开发助理平台，集成 3+ MCP Server，实现 Host 编排和 CLI 界面。
