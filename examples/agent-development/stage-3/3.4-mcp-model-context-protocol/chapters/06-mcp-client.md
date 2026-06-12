# 第6章：MCP Client 集成 — 在 Agent 中连接 MCP Server

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **构建 MCP Client** — 从 Agent 应用中发现和连接 MCP Server
- **实现工具发现和动态调用** — 自动获取 Server 的工具列表并调用
- **处理多 Server 连接** — 同时管理多个 MCP Server 的连接和工具注册
- **构建完整的 MCP Host** — Agent 通过 MCP Host 统一管理工具调用

## 📋 前置知识

> 建议先完成：
> - [第2章：MCP Server 开发](./02-mcp-server.md) — 了解 Server 端能力
> - [第4章：传输协议](./04-transport.md) — 了解连接方式

---

## 💡 核心概念

### 为什么需要 MCP Client？

**生活类比：** 你的 Agent 就像一个「万能遥控器」。MCP Server 就是各种家电——电视、空调、音响。MCP Client 就是遥控器上的「学习功能按钮」——它自动扫描周围有哪些设备，然后把所有遥控功能集中到一个遥控器上。

没有 MCP Client，Agent 需要为每个工具写死调用代码：
```typescript
// ❌ 写死调用——每加一个新工具都要改代码
if (toolName === 'get_weather') await callWeatherAPI(args);
if (toolName === 'read_file') await callFileSystem(args);
if (toolName === 'query_db') await callDatabase(args);
// 又加了一个？再改代码...
```

有了 MCP Client，工具调用是动态的：
```typescript
// ✅ 动态发现——不用改代码，自动获取新工具
const tools = await client.listTools(); // 自动获取所有工具
const result = await client.callTool({ name: 'new_tool', arguments: args }); // 动态调用
```

### MCP Client 基础

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const client = new Client({
  name: 'my-agent',        // 你的 Agent 名称
  version: '1.0.0',        // 版本号
}, {
  capabilities: {          // 声明 Client 的能力（可选）
    sampling: {},          // 是否支持 LLM 采样
    roots: {               // 是否支持文件根目录
      listChanged: true,
    },
  },
});
```

**💡 为什么需要声明 capabilities？** MCP 是双向协议。Client 告诉 Server「我能做什么」，Server 可以根据 Client 的能力调整行为。例如，如果 Client 支持 `sampling`，Server 可以请求 Client 代为调用 LLM。

### 连接 Server 并发现工具

```typescript
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// 1. 创建传输层
const transport = new StdioClientTransport({
  command: 'node',
  args: ['./weather-server.js'],
});

// 2. 连接
await client.connect(transport);

// 3. 发现工具
const { tools } = await client.listTools();
console.log('可用工具:', tools.map(t => ({
  name: t.name,
  description: t.description,
  parameters: t.inputSchema,
})));

// 输出：
// 可用工具: [
//   { name: 'get_weather', description: '获取天气', parameters: { ... } },
//   { name: 'get_forecast', description: '获取天气预报', parameters: { ... } },
// ]
```

### 将 MCP 工具注入 LLM

MCP Client 发现工具后，关键步骤是**将工具定义格式化为 LLM 可接受的格式**（如 OpenAI/Anthropic 的工具格式）：

```typescript
// 将 MCP 工具转换为 Anthropic 工具格式
function toAnthropicTools(mcpTools: any[]): any[] {
  return mcpTools.map(tool => ({
    name: tool.name,
    description: tool.description || '',
    input_schema: {
      type: tool.inputSchema.type || 'object',
      properties: tool.inputSchema.properties || {},
      required: tool.inputSchema.required || [],
    },
  }));
}

// 将 MCP 工具转换为 OpenAI 工具格式
function toOpenAITools(mcpTools: any[]): any[] {
  return mcpTools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.inputSchema,
    },
  }));
}
```

### 完整的 Agent + MCP 调用循环

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

async function agentWithMcp(userMessage: string) {
  // 1. 连接 MCP Server
  const client = new Client({ name: 'agent', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['./weather-server.js'],
  });
  await client.connect(transport);

  // 2. 获取工具
  const { tools: mcpTools } = await client.listTools();
  const tools = toAnthropicTools(mcpTools);

  // 3. LLM 调用循环
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];

  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      tools,
      messages,
    });

    // 4. 检查是否有工具调用
    const toolUseBlock = response.content.find(b => b.type === 'tool_use');
    if (!toolUseBlock) {
      // 没有工具调用，返回最终回答
      return response.content[0].text;
    }

    // 5. 调用 MCP 工具
    const result = await client.callTool({
      name: toolUseBlock.name,
      arguments: toolUseBlock.input as Record<string, unknown>,
    });

    // 6. 将结果返回给 LLM
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUseBlock.id,
        content: result.content as string,
      }],
    });
  }
}
```

---

## 🔨 实战演练

### 练习：构建一个多 Server MCP Host

**场景描述：** 你的 Agent 需要同时连接三个 MCP Server——天气、文件、数据库。构建一个 MCP Host 来统一管理所有连接。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// mcp-host.ts — 多 Server 管理器
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import Anthropic from '@anthropic-ai/sdk';

interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
}

interface McpTool {
  serverName: string;
  name: string;
  description: string;
  inputSchema: any;
}

class McpHost {
  private clients: Map<string, Client> = new Map();
  private tools: McpTool[] = [];

  async connectServer(config: McpServerConfig): Promise<void> {
    const client = new Client(
      { name: 'mcp-host', version: '1.0.0' },
      { capabilities: {} }
    );

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
    });

    await client.connect(transport);
    this.clients.set(config.name, client);

    // 发现工具并记录来源
    const { tools } = await client.listTools();
    for (const tool of tools) {
      this.tools.push({
        serverName: config.name,
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema,
      });
    }

    console.error(`✅ 已连接 Server: ${config.name}（${tools.length} 个工具）`);
  }

  getAllTools(): any[] {
    // 转换为 Anthropic 格式，在名称前加上 server 前缀避免冲突
    return this.tools.map(tool => ({
      name: `${tool.serverName}__${tool.name}`,
      description: `[${tool.serverName}] ${tool.description}`,
      input_schema: {
        type: tool.inputSchema.type || 'object',
        properties: tool.inputSchema.properties || {},
        required: tool.inputSchema.required || [],
      },
    }));
  }

  async callTool(fullName: string, args: Record<string, unknown>): Promise<string> {
    // 解析 serverName 和 toolName
    const separatorIndex = fullName.indexOf('__');
    if (separatorIndex === -1) {
      throw new Error(`无效的工具名称格式: ${fullName}`);
    }

    const serverName = fullName.substring(0, separatorIndex);
    const toolName = fullName.substring(separatorIndex + 2);

    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Server 未连接: ${serverName}`);
    }

    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });

    return typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);
  }

  async disconnectAll(): Promise<void> {
    for (const [name, client] of this.clients) {
      await client.close();
      console.error(`❌ 已断开: ${name}`);
    }
    this.clients.clear();
    this.tools = [];
  }
}

// 使用示例
async function main() {
  const host = new McpHost();

  // 连接多个 Server
  await host.connectServer({
    name: 'weather',
    command: 'node',
    args: ['./weather-server.js'],
  });

  await host.connectServer({
    name: 'filesystem',
    command: 'node',
    args: ['./fs-server.js'],
  });

  // 获取所有工具的 LLM 格式
  const tools = host.getAllTools();

  // 将 tools 注入到 Claude 中
  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    tools,
    messages: [{
      role: 'user',
      content: '北京今天天气怎么样？然后保存到 weather-report.md',
    }],
  });

  // 处理工具调用
  for (const block of response.content) {
    if (block.type === 'tool_use') {
      const result = await host.callTool(block.name, block.input as Record<string, unknown>);
      console.log(`工具 ${block.name} 返回:`, result);
    }
  }

  await host.disconnectAll();
}

main().catch(console.error);
```

**预期输出：**
```
✅ 已连接 Server: weather（2 个工具）
✅ 已连接 Server: filesystem（3 个工具）
工具 weather__get_weather 返回: 北京当前天气：25°C，晴
工具 filesystem__fs_write 返回: ✅ 已写入 weather-report.md
```

</details>

---

## ⚡ 进阶技巧

### 自动重连策略

```typescript
class ReconnectingClient {
  private client: Client;
  private transport: StdioClientTransport;
  private reconnectAttempts = 0;
  private maxRetries = 3;

  async connectWithRetry(): Promise<void> {
    while (this.reconnectAttempts < this.maxRetries) {
      try {
        await this.client.connect(this.transport);
        console.error('连接成功');
        return;
      } catch (error) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
        console.error(`连接失败，${delay}ms 后重试 (${this.reconnectAttempts}/${this.maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw new Error('连接失败，已达到最大重试次数');
  }
}
```

### 工具名称冲突解决

当多个 Server 提供同名工具时，用命名空间隔离：

```typescript
// Server A 提供工具 get_info
// Server B 也提供工具 get_info
// → 重命名为 serverA__get_info, serverB__get_info

const SEPARATOR = '__';

function namespaceToolName(serverName: string, toolName: string): string {
  return `${serverName}${SEPARATOR}${toolName}`;
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：MCP Client 的 listTools() 返回的工具格式为什么不能直接传给 LLM？**

> A：MCP 的 tool 格式和 LLM 厂商的工具格式不同——字段名和嵌套结构有差异。比如 MCP 用 `inputSchema`，Anthropic 用 `input_schema`，OpenAI 用 `parameters`。需要做一次格式转换。

**Q2：为什么不直接把所有 Server 合并到一个 Server 中？**

> A：合并在功能上可行，但会失去模块化优势——每个 Server 可以独立部署、独立扩展、独立安全策略。MCP Host 模式让 Agent 可以按需连接/断开 Server，更灵活。

**Q3：多个 Server 提供同名工具时如何处理？**

> A：通过 namespace 前缀消除歧义（如 `weather__get_info` 和 `db__get_info`），并在工具描述中说明来源。LLM 会根据描述选择正确的工具。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| listTools 返回空数组 | Server 未正确注册工具 | 检查 server.tool() 调用是否在 connect 前执行 |
| 调用工具时返回 "Tool not found" | 工具名不匹配（带 namespace 但没正确处理） | 调用时用原始工具名，不要加 namespace 前缀 |
| 连接 stdio Server 后立即退出 | Server 进程启动后直接退出了 | 确保 Server 端调用了 `await server.connect(transport)` |
| 多轮对话中工具状态丢失 | 每次都新建 Client 连接 | 复用同一个 Client 实例，或实现会话恢复 |
| transport already connected 错误 | 重复调用 connect | 检查 Client 状态，已连接时先 close() |

---

## 📝 本章小结

- ✅ **MCP Client** — 从 Agent 发现和连接 MCP Server 的标准方式
- ✅ **工具发现** — listTools() 自动获取 Server 的工具列表
- ✅ **格式转换** — MCP 工具格式 ↔ LLM 工具格式的互相转换
- ✅ **MCP Host** — 管理多个 Server 连接、工具去重和统一调用
- ✅ **工具调用循环** — 将 MCP 工具无缝集成到 LLM 的 ReAct 循环中

## ➡️ 下一章预告

> 在最后一章中，我们将综合运用前面所有 MCP 知识，构建一个包含多个 MCP Server 的生产级 Agent 系统，并完成一个端到端的综合实战项目。
> [第7章：综合实战 — MCP Agent 系统](./07-capstone-mcp.md)
