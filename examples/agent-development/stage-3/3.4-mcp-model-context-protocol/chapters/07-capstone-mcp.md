# 第7章：综合实战 — 构建生产级 MCP Agent 系统

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **综合运用 MCP 全栈能力** — 将 Server、Client、Host、LLM 集成到完整系统
- **构建生产级的 Agent 工具平台** — 支持动态工具发现、安全认证、日志追踪
- **实现端到端的 MCP 工具调用链路** — 从用户输入 → LLM 决策 → 工具执行 → 结果返回
- **为生产部署做好准备** — 添加监控、错误恢复、性能优化

## 📋 前置知识

> 建议先完成本章之前的所有 MCP 章节：
> - [第1章 MCP 概述](./01-mcp-overview.md)
> - [第2章 MCP Server 开发](./02-mcp-server.md)
> - [第3章 TypeScript SDK 深入](./03-typescript-sdk.md)
> - [第4章 传输协议](./04-transport.md)
> - [第5章 实战 Server](./05-practical-servers.md)
> - [第6章 MCP Client 集成](./06-mcp-client.md)

---

## 💡 项目概述

### 项目：AI 开发助手平台

我们将构建一个**AI 开发助手平台**，让 LLM Agent 通过 MCP 协议连接到一系列开发工具：

```
┌─────────────────────────────────────────────────────┐
│                 AI 开发助手平台                      │
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│  │ 用户界面  │    │  LLM     │    │ MCP Host │     │
│  │ (CLI/Web)│───►│ (Claude) │───►│ (管理器)  │     │
│  └──────────┘    └──────────┘    └─────┬────┘     │
│                                        │           │
└────────────────────────────────────────┼───────────┘
                                         │
              ┌──────────────────────────┼──────────────────────┐
              │          MCP Servers     │                      │
              │                          │                      │
        ┌─────┴─────┐  ┌───────┴──────┐  ┌───────┴──────┐     │
        │  文件系统   │  │   代码分析    │  │   包管理     │     │
        │  Server    │  │   Server     │  │   Server    │     │
        └───────────┘  └──────────────┘  └─────────────┘     │
              │              │               │               │
        读写文件      分析代码结构       安装/查询包         │
              └──────────────────────────────────────────────┘
```

---

## 🔨 实战：分步构建

### 步骤 1：构建文件系统 Server

```typescript
// servers/fs-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

const ALLOWED_BASE = process.cwd();

function safePath(target: string): string {
  const resolved = path.resolve(ALLOWED_BASE, target);
  if (!resolved.startsWith(ALLOWED_BASE)) {
    throw new Error('路径越权');
  }
  return resolved;
}

const server = new McpServer({
  name: 'dev-fs-server',
  version: '1.0.0',
});

server.tool(
  'read_file',
  '读取文件内容',
  { filePath: z.string() },
  async ({ filePath }) => {
    const fullPath = safePath(filePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const stat = await fs.stat(fullPath);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          name: path.basename(filePath),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          content,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'write_file',
  '写入文件',
  { filePath: z.string(), content: z.string() },
  async ({ filePath, content }) => {
    const fullPath = safePath(filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    return { content: [{ type: 'text', text: `✅ 已写入: ${filePath}` }] };
  }
);

server.tool(
  'list_files',
  '列出目录内容',
  { dir: z.string().default('.'), showHidden: z.boolean().default(false) },
  async ({ dir, showHidden }) => {
    const fullPath = safePath(dir);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      if (!showHidden && entry.name.startsWith('.')) continue;
      const stat = await fs.stat(path.join(fullPath, entry.name));
      items.push({
        name: entry.name,
        type: entry.isDirectory() ? 'dir' : 'file',
        size: entry.isFile() ? stat.size : null,
        mode: stat.mode.toString(8),
      });
    }
    return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
  }
);

server.tool(
  'get_file_info',
  '获取文件/目录的详细信息',
  { targetPath: z.string() },
  async ({ targetPath }) => {
    const fullPath = safePath(targetPath);
    const stat = await fs.stat(fullPath);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          name: path.basename(targetPath),
          type: stat.isDirectory() ? 'directory' : 'file',
          size: stat.size,
          created: stat.birthtime.toISOString(),
          modified: stat.mtime.toISOString(),
          permissions: stat.mode.toString(8),
        }, null, 2),
      }],
    };
  }
);

// 资源：项目结构概览
server.resource(
  'project-structure',
  'project://structure',
  async () => {
    async function walk(dir: string, depth = 0): Promise<any[]> {
      if (depth > 3) return [{ name: '...', truncated: true }];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const result = [];
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        if (entry.isDirectory()) {
          const children = await walk(path.join(dir, entry.name), depth + 1);
          result.push({ name: entry.name, type: 'dir', children });
        } else {
          result.push({ name: entry.name, type: 'file' });
        }
      }
      return result;
    }
    const tree = await walk(ALLOWED_BASE);
    return { contents: [{ uri: 'project://structure', text: JSON.stringify(tree, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 步骤 2：构建代码分析 Server

```typescript
// servers/code-analysis-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';

const server = new McpServer({
  name: 'code-analysis',
  version: '1.0.0',
});

server.tool(
  'analyze_dependencies',
  '分析项目的依赖关系',
  { projectPath: z.string().default('.') },
  async ({ projectPath }) => {
    try {
      const pkgPath = path.resolve(projectPath, 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            name: pkg.name,
            version: pkg.version,
            dependencies: Object.entries(pkg.dependencies || {}).map(([name, ver]) => ({
              name, version: ver, type: 'production',
            })),
            devDependencies: Object.entries(pkg.devDependencies || {}).map(([name, ver]) => ({
              name, version: ver, type: 'development',
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `分析失败: ${(error as Error).message}` }], isError: true };
    }
  }
);

server.tool(
  'count_lines',
  '统计代码行数',
  {
    dir: z.string().default('.'),
    extensions: z.array(z.string()).default(['.ts', '.tsx', '.js', '.jsx', '.md']),
  },
  async ({ dir, extensions }) => {
    const result: Record<string, { files: number; lines: number }> = {};
    let totalFiles = 0;
    let totalLines = 0;

    async function* walk(dir: string): AsyncGenerator<string> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(fullPath);
        else yield fullPath;
      }
    }

    for await (const filePath of walk(path.resolve(dir))) {
      const ext = path.extname(filePath);
      if (!extensions.includes(ext)) continue;

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').length;

      if (!result[ext]) result[ext] = { files: 0, lines: 0 };
      result[ext].files++;
      result[ext].lines += lines;
      totalFiles++;
      totalLines += lines;
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ byExtension: result, totalFiles, totalLines }, null, 2),
      }],
    };
  }
);

server.tool(
  'find_in_files',
  '在文件中搜索内容',
  {
    pattern: z.string(),
    dir: z.string().default('.'),
    ext: z.string().optional(),
  },
  async ({ pattern, dir, ext }) => {
    const results: Array<{ file: string; line: number; content: string }> = [];
    const searchDir = path.resolve(dir);

    async function* walk(dir: string): AsyncGenerator<string> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(fullPath);
        else if (!ext || fullPath.endsWith(ext)) yield fullPath;
      }
    }

    for await (const filePath of walk(searchDir)) {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(pattern)) {
          results.push({
            file: path.relative(searchDir, filePath),
            line: i + 1,
            content: lines[i].trim(),
          });
        }
      }
    }

    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 步骤 3：构建 MCP Host — 连接所有 Server

```typescript
// mcp-host.ts — 核心编排器
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import Anthropic from '@anthropic-ai/sdk';
import * as readline from 'readline';

interface ServerConfig {
  name: string;
  command: string;
  args: string[];
}

interface McpToolInfo {
  serverName: string;
  originalName: string;
  fullName: string;
  description: string;
  inputSchema: any;
}

class DevAssistantHost {
  private clients = new Map<string, Client>();
  private tools: McpToolInfo[] = [];
  private anthropic: Anthropic;

  constructor(apiKey?: string) {
    this.anthropic = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
  }

  async addServer(config: ServerConfig): Promise<void> {
    const client = new Client(
      { name: 'dev-assistant', version: '1.0.0' },
      { capabilities: {} }
    );

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, MCP_SERVER_NAME: config.name },
    });

    await client.connect(transport);
    this.clients.set(config.name, client);

    const { tools } = await client.listTools();
    for (const tool of tools) {
      this.tools.push({
        serverName: config.name,
        originalName: tool.name,
        fullName: `${config.name}__${tool.name}`,
        description: `[${config.name}] ${tool.description || ''}`,
        inputSchema: tool.inputSchema,
      });
    }

    console.error(`✅ Server: ${config.name} — ${tools.length} 个工具`);
  }

  getToolsForLLM() {
    return this.tools.map(t => ({
      name: t.fullName,
      description: t.description.substring(0, 200),
      input_schema: t.inputSchema,
    }));
  }

  async handleToolCall(fullName: string, args: Record<string, unknown>): Promise<string> {
    // 解析 serverName 和 originalName
    const sepIdx = fullName.indexOf('__');
    const serverName = fullName.substring(0, sepIdx);
    const toolName = fullName.substring(sepIdx + 2);

    const client = this.clients.get(serverName);
    if (!client) throw new Error(`Server 未连接: ${serverName}`);

    console.error(`🔧 调用工具: ${serverName}.${toolName}`, JSON.stringify(args));

    const result = await client.callTool({ name: toolName, arguments: args });

    const content = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

    // 限制返回长度，防止 Token 爆炸
    return content.length > 50000 ? content.substring(0, 50000) + '\n...(截断)' : content;
  }

  async chat(userMessage: string): Promise<string> {
    const tools = this.getToolsForLLM();
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `你是一个 AI 开发助手，可以通过 MCP 工具访问开发环境。

可用工具：
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

用户消息: ${userMessage}`,
      },
    ];

    // 最多 5 轮工具调用
    for (let round = 0; round < 5; round++) {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        tools,
        messages,
      });

      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      if (toolUseBlocks.length === 0) {
        // LLM 决定不调用工具，返回最终回答
        const textBlock = response.content.find(b => b.type === 'text');
        return textBlock?.text || '（无回答）';
      }

      messages.push({ role: 'assistant', content: response.content });

      for (const block of toolUseBlocks) {
        const result = await this.handleToolCall(
          block.name,
          block.input as Record<string, unknown>
        );
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          }],
        });
      }
    }

    return '已达到最大工具调用轮数。请简化你的请求。';
  }

  async disconnectAll(): Promise<void> {
    for (const [name, client] of this.clients) {
      await client.close();
      console.error(`❌ 断开: ${name}`);
    }
  }
}

// 启动
async function main() {
  const host = new DevAssistantHost();

  await host.addServer({
    name: 'filesystem',
    command: 'node',
    args: ['./servers/fs-server.js'],
  });

  await host.addServer({
    name: 'code-analysis',
    command: 'node',
    args: ['./servers/code-analysis-server.js'],
  });

  console.error('\n🚀 AI 开发助手已启动！输入你的问题（输入 "exit" 退出）:\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = () => {
    rl.question('> ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        await host.disconnectAll();
        rl.close();
        return;
      }

      console.error('🤔 正在思考...');
      const answer = await host.chat(input);
      console.log('\n' + answer + '\n');
      ask();
    });
  };

  ask();
}

main().catch(console.error);
```

### 步骤 4：运行和使用

```bash
# 安装依赖
npm install @modelcontextprotocol/sdk @anthropic-ai/sdk zod

# 编译 TypeScript
npx tsc servers/*.ts mcp-host.ts --moduleResolution node --target es2022 --module esnext

# 设置 API Key
export ANTHROPIC_API_KEY=sk-ant-xxxxxxxx

# 启动
node mcp-host.js
```

**💡 为什么 Server 和 Host 要分开部署？** 关注点分离——Server 只关心「提供工具」，Host 只关心「编排工具」。这样任何一个 Server 崩溃都不会影响其他 Server，Host 可以自动重启故障 Server。

---

## ⚡ 生产化增强

```typescript
// 生产化配置：日志、监控、限流
class ProductionHost extends DevAssistantHost {
  private metrics = {
    toolCalls: 0,
    errors: 0,
    totalTokens: 0,
    startTime: Date.now(),
  };

  async handleToolCall(fullName: string, args: Record<string, unknown>): Promise<string> {
    const startTime = Date.now();
    this.metrics.toolCalls++;

    try {
      const result = await super.handleToolCall(fullName, args);
      console.error(`📊 指标: ${fullName} — ${Date.now() - startTime}ms`);
      return result;
    } catch (error) {
      this.metrics.errors++;
      console.error(`❌ 错误: ${fullName} — ${(error as Error).message}`);
      return `工具调用失败: ${(error as Error).message}`;
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      uptime: Math.round((Date.now() - this.metrics.startTime) / 1000) + 's',
    };
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么 MCP Server 使用 stdio 传输但可以通过网络访问？**

> A：stdio 本身是本地传输。如果需要网络访问，可以在 Server 外面套一层 HTTP 适配器（如 express + SSE），或者使用 Streamable HTTP 传输。Host 端只需要更换传输层实现（SSEClientTransport），不需要修改业务逻辑。

**Q2：如何处理工具调用的幂等性问题？**

> A：对于可能产生副作用的工具（如 write_file），在工具中添加幂等性检查——比如先检查文件是否已存在、内容是否已相同。或者使用请求 ID 去重：每次工具调用附带唯一请求 ID，Server 缓存结果。

**Q3：多轮对话中 MCP 工具如何保持状态？**

> A：MCP 工具本身是无状态的，每次调用都是独立的。状态管理在 LLM 的消息历史中：之前的工具调用结果作为历史消息传给 LLM，LLM 根据历史决定下一步调用。这就是 ReAct 模式的核心。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 工具调用结果过长导致 Token 超限 | LLM 上下文塞满了工具返回值 | 设置内容截断（如 50000 字符）、使用摘要 |
| Server 进程崩溃不自动重启 | 未实现进程管理 | 使用 pm2 或 supervisor 管理 Server 进程 |
| 并发调用导致数据竞争 | 多个 Agent 共享一个 Server | 每个 Session 使用独立的 Server 实例 |
| 工具调用超时无反馈 | 没有设置合理的超时 | 为 callTool 添加 AbortController 超时控制 |

---

## 📝 本章小结

- ✅ **全栈 MCP 系统** — 从 Server 层 → Host 层 → LLM 层的完整链路
- ✅ **MCP Host 模式** — 统一管理多 Server 连接、工具发现、错误处理
- ✅ **生产化考量** — 日志、监控、限流、进程管理
- ✅ **动手实践** — 构建了一个可运行的 AI 开发助手平台

## ➡️ 下一步

> 恭喜你完成了 MCP 协议的全部学习！你现在已经掌握了从 Server 构建到 Client 集成的全栈能力。
>
> 接下来，你可以探索 [CrewAI 与多 Agent](./stage-3/3.5-crewai-and-multi-agent/README.html) 学习多 Agent 协作模式，或进入 [阶段 4：前端 + Agent 融合](../stage-4/README.md) 学习如何将 Agent 能力融入前端应用。
