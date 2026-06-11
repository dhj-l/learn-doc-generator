# 第2章：MCP Server 开发 — TypeScript SDK 实战

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 TypeScript SDK 构建 MCP Server** — 从零创建标准化的工具服务
- **定义 Tools、Resources、Prompts 三大能力** — 暴露完整的 MCP 功能
- **实现参数验证和错误处理** — 构建生产级的 MCP Server

## 📋 前置知识

> 建议先完成：[第1章：MCP 概述](./01-mcp-overview.md)

---

## 💡 核心实现

### 安装

```bash
npm install @modelcontextprotocol/sdk zod
```

### MCP Server 基础结构

```typescript
// src/mcp-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// 创建 Server 实例
const server = new McpServer({
  name: 'my-mcp-server',
  version: '1.0.0',
  description: '一个示例 MCP Server',
});
```

### 定义 Tools（工具）

工具是 MCP 最核心的能力——让 LLM 能够执行操作。

```typescript
// 工具 1：读取文件
server.tool(
  'read_file',                          // 工具名称
  '读取指定路径的文件内容',                // 工具描述
  {                                     // 参数 Schema（Zod）
    path: z.string().describe('文件的绝对路径'),
    encoding: z.enum(['utf-8', 'base64']).default('utf-8').describe('文件编码'),
  },
  async ({ path, encoding }) => {       // 处理函数
    try {
      const content = await fs.readFile(path, encoding);
      return {
        content: [{
          type: 'text',
          text: content,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `错误: 无法读取文件 ${path} — ${(error as Error).message}`,
        }],
        isError: true,  // 标记为错误
      };
    }
  }
);

// 工具 2：查询数据库
server.tool(
  'query_database',
  '执行 SQL SELECT 查询（只读）',
  {
    sql: z.string().describe('SQL SELECT 查询语句'),
    database: z.string().default('main').describe('数据库名称'),
  },
  async ({ sql, database }) => {
    // 安全检查：只允许 SELECT
    if (!sql.trim().toUpperCase().startsWith('SELECT')) {
      return {
        content: [{ type: 'text', text: '安全错误: 只允许 SELECT 查询' }],
        isError: true,
      };
    }

    try {
      const results = await db.query(sql, database);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(results, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `查询错误: ${(error as Error).message}`,
        }],
        isError: true,
      };
    }
  }
);

// 工具 3：发送消息
server.tool(
  'send_message',
  '发送消息到指定渠道',
  {
    channel: z.enum(['slack', 'email', 'webhook']).describe('发送渠道'),
    recipient: z.string().describe('接收者'),
    message: z.string().describe('消息内容'),
  },
  async ({ channel, recipient, message }) => {
    // 实际实现中调用对应的 API
    return {
      content: [{
        type: 'text',
        text: `✅ 消息已通过 ${channel} 发送给 ${recipient}`,
      }],
    };
  }
);
```

### 定义 Resources（资源）

资源让 LLM 能够获取数据，类似于 REST API 的 GET 端点。

```typescript
// 资源 1：应用配置
server.resource(
  'app-config',                       // 资源名称
  'config://app/settings',            // URI（唯一标识）
  async () => ({
    contents: [{
      uri: 'config://app/settings',
      mimeType: 'application/json',
      text: JSON.stringify({
        version: '1.0.0',
        environment: process.env.NODE_ENV,
        features: ['chat', 'search', 'analysis'],
      }),
    }],
  })
);

// 资源 2：动态 URI（带参数）
server.resource(
  'user-profile',
  new ResourceTemplate('users://{userId}/profile', { list: undefined }),
  async (uri, { userId }) => ({
    contents: [{
      uri: uri.href,
      mimeType: 'application/json',
      text: JSON.stringify(await getUserProfile(userId)),
    }],
  })
);
```

### 定义 Prompts（提示模板）

Prompts 提供预定义的提示词模板，让 LLM 可以复用。

```typescript
// 提示模板 1：代码审查
server.prompt(
  'code-review',
  '审查代码并提供改进建议',
  {
    code: z.string().describe('要审查的代码'),
    language: z.string().describe('编程语言'),
  },
  ({ code, language }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `请审查以下 ${language} 代码，从安全性、性能、可维护性三个维度给出建议：

\`\`\`${language}
${code}
\`\`\`

输出格式：
- 🔴 严重问题
- 🟡 建议改进
- 🟢 代码亮点`,
      },
    }],
  })
);

// 提示模板 2：文档生成
server.prompt(
  'generate-docs',
  '为函数/类生成文档',
  {
    code: z.string(),
    style: z.enum(['jsdoc', 'tsdoc', 'markdown']).default('tsdoc'),
  },
  ({ code, style }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `为以下代码生成 ${style} 格式的文档：\n\n${code}`,
      },
    }],
  })
);
```

### 启动 Server

```typescript
// 使用 stdio 传输协议启动
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Server 已启动（stdio 模式）');
}

main().catch(console.error);
```

### 完整示例：天气 MCP Server

```typescript
// src/weather-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'weather-server',
  version: '1.0.0',
});

// 工具：获取天气
server.tool(
  'get_weather',
  '获取指定城市的当前天气信息',
  {
    city: z.string().describe('城市名称，如"北京"、"上海"'),
    unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  },
  async ({ city, unit }) => {
    // 实际项目中调用天气 API
    const temp = unit === 'celsius' ? '25°C' : '77°F';
    return {
      content: [{
        type: 'text',
        text: `${city}当前天气：${temp}，晴，湿度 45%，微风。`,
      }],
    };
  }
);

// 资源：支持的城市列表
server.resource(
  'supported-cities',
  'weather://cities',
  async () => ({
    contents: [{
      uri: 'weather://cities',
      text: JSON.stringify(['北京', '上海', '广州', '深圳', '杭州']),
    }],
  })
);

// 启动
const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 🔨 实战演练

### 练习：构建一个笔记 MCP Server

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

const NOTES_DIR = './notes';

const server = new McpServer({
  name: 'notes-server',
  version: '1.0.0',
});

// 创建笔记
server.tool(
  'create_note',
  '创建一条新笔记',
  {
    title: z.string().describe('笔记标题'),
    content: z.string().describe('笔记内容'),
    tags: z.array(z.string()).default([]).describe('标签列表'),
  },
  async ({ title, content, tags }) => {
    const id = Date.now().toString();
    const note = { id, title, content, tags, createdAt: new Date().toISOString() };
    await fs.mkdir(NOTES_DIR, { recursive: true });
    await fs.writeFile(path.join(NOTES_DIR, `${id}.json`), JSON.stringify(note, null, 2));
    return { content: [{ type: 'text', text: `✅ 笔记已创建: "${title}" (ID: ${id})` }] };
  }
);

// 搜索笔记
server.tool(
  'search_notes',
  '搜索笔记',
  {
    query: z.string().describe('搜索关键词'),
    tag: z.string().optional().describe('按标签过滤'),
  },
  async ({ query, tag }) => {
    const files = await fs.readdir(NOTES_DIR).catch(() => []);
    const notes = [];
    for (const file of files) {
      const note = JSON.parse(await fs.readFile(path.join(NOTES_DIR, file), 'utf-8'));
      const matchesQuery = note.title.includes(query) || note.content.includes(query);
      const matchesTag = !tag || note.tags.includes(tag);
      if (matchesQuery && matchesTag) notes.push(note);
    }
    return { content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }] };
  }
);

// 资源：所有笔记的摘要
server.resource(
  'notes-summary',
  'notes://summary',
  async () => {
    const files = await fs.readdir(NOTES_DIR).catch(() => []);
    const summary = [];
    for (const file of files) {
      const note = JSON.parse(await fs.readFile(path.join(NOTES_DIR, file), 'utf-8'));
      summary.push({ id: note.id, title: note.title, tags: note.tags });
    }
    return { contents: [{ uri: 'notes://summary', text: JSON.stringify(summary) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

</details>

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：MCP Server 的 Tools 和 Resources 有什么区别？**

> A：Tools 是「执行操作」— LLM 调用工具来执行某个动作（读写文件、查询数据库、发送消息）。Resources 是「获取数据」— LLM 获取某个资源的内容（配置信息、数据列表）。Tool 有副作用，Resource 是只读的。

**Q2：为什么工具的参数要用 Zod Schema 定义？**

> A：Zod Schema 提供了三重保障：（1）类型安全——TypeScript 编译时检查；（2）运行时验证——自动校验 LLM 传入的参数；（3）文档生成——Schema 的 description 自动成为工具的参数说明，帮助 LLM 理解如何调用。

</details>

---

## 📝 本章小结

- ✅ **McpServer** — MCP Server 的核心构建器
- ✅ **server.tool()** — 注册工具，支持参数验证和错误处理
- ✅ **server.resource()** — 注册资源，支持静态和动态 URI
- ✅ **server.prompt()** — 注册提示模板
- ✅ **传输协议** — StdioServerTransport 用于本地进程通信

## ➡️ 下一章预告

> [第3章：传输协议](./03-to-7-summary.md) — stdio、HTTP SSE、Streamable HTTP 三种传输方式。
