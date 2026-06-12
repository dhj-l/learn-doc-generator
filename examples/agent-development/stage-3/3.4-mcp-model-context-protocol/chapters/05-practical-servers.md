# 第5章：实战 Server — 文件系统、数据库查询与 API 集成

> 预计学习时间：100-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **构建生产级的文件系统 MCP Server** — 带安全路径检查和权限控制
- **构建安全的数据库查询 MCP Server** — 支持参数化查询和 SQL 注入防护
- **构建第三方 API 集成 MCP Server** — 封装 REST API 为标准化工具
- **理解 Server 组合模式** — 将多个 Server 的能力聚合到一个统一入口

## 📋 前置知识

> 建议先完成：
> - [第2章：MCP Server 开发](./02-mcp-server.md) — 掌握 Tools、Resources、Prompts 的定义
> - [第4章：传输协议](./04-transport.md) — 了解如何远程部署 Server

---

## 💡 核心概念

### 为什么需要实战 Server？

前面的章节教你「如何用 MCP SDK」，但真实的开发中，**90% 的问题不在 SDK 本身，而在你用它做什么**。

**生活类比：** SDK 就像一套精密的工具箱，但真正考验技术的是——你能否用它造出一把能稳定工作的椅子。本章就是三个木工项目，让你从「会用工具」变成「能造东西」。

---

### 项目一：文件系统 MCP Server

文件操作是所有 Agent 最基础也最常用的能力。但文件系统也是最容易出安全问题的——路径穿越、越权访问、并发写入冲突。

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

// 安全配置
const ALLOWED_DIRS = [
  (process.env.FILES_DIR || './workspace').replace(/\\/g, '/'),
];

// 路径安全检查
function assertSafePath(targetPath: string): string {
  const normalized = path.resolve(targetPath).replace(/\\/g, '/');
  const isAllowed = ALLOWED_DIRS.some(dir => normalized.startsWith(dir));
  if (!isAllowed) {
    throw new Error(`路径越权：${targetPath} 不在允许的工作目录内`);
  }
  return normalized;
}

const server = new McpServer({
  name: 'secure-fs-server',
  version: '1.0.0',
});

// 工具：读取文件（支持文本和二进制）
server.tool(
  'read_file',
  '读取文件内容，支持文本和 base64 编码',
  {
    path: z.string().describe('文件的相对路径（相对于工作目录）'),
    encoding: z.enum(['text', 'base64']).default('text').describe('文件编码类型'),
  },
  async ({ path: filePath, encoding }) => {
    try {
      const safePath = assertSafePath(filePath);
      const stat = await fs.stat(safePath);
      if (stat.isDirectory()) {
        return { content: [{ type: 'text', text: `错误：${filePath} 是一个目录，请使用 list_directory 查看目录内容。` }], isError: true };
      }

      const content = await fs.readFile(safePath, encoding === 'base64' ? 'base64' : 'utf-8');
      return {
        content: [{
          type: 'text',
          text: content,
        }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `文件读取失败：${(error as Error).message}` }], isError: true };
    }
  }
);

// 工具：写入文件（带覆盖保护）
server.tool(
  'write_file',
  '写入文件内容（默认不覆盖已存在的文件）',
  {
    path: z.string().describe('文件的相对路径'),
    content: z.string().describe('文件内容'),
    overwrite: z.boolean().default(false).describe('是否覆盖已存在的文件'),
    encoding: z.enum(['text', 'base64']).default('text').describe('编码类型'),
  },
  async ({ path: filePath, content, overwrite, encoding }) => {
    try {
      const safePath = assertSafePath(filePath);

      // 覆盖保护：除非显式指定 overwrite=true，否则不覆盖
      if (!overwrite) {
        try {
          await fs.access(safePath);
          return {
            content: [{ type: 'text', text: `安全保护：文件 ${filePath} 已存在。如需覆盖请设置 overwrite=true。` }],
            isError: true,
          };
        } catch {
          // 文件不存在，可以写入
        }
      }

      // 自动创建父目录
      await fs.mkdir(path.dirname(safePath), { recursive: true });

      const buffer = encoding === 'base64' ? Buffer.from(content, 'base64') : content;
      await fs.writeFile(safePath, buffer);
      return {
        content: [{ type: 'text', text: `✅ 文件已写入：${filePath}（${encoding === 'base64' ? '二进制' : '文本'}，${buffer.length} 字节）` }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `文件写入失败：${(error as Error).message}` }], isError: true };
    }
  }
);

// 工具：列出目录
server.tool(
  'list_directory',
  '列出指定目录的文件和子目录',
  {
    path: z.string().default('.').describe('目录的相对路径'),
    showHidden: z.boolean().default(false).describe('是否显示隐藏文件'),
  },
  async ({ path: dirPath, showHidden }) => {
    try {
      const safePath = assertSafePath(dirPath);
      const entries = await fs.readdir(safePath, { withFileTypes: true });

      const result = [];
      for (const entry of entries) {
        if (!showHidden && entry.name.startsWith('.')) continue;
        const fullPath = path.join(safePath, entry.name);

        try {
          const stat = await fs.stat(fullPath);
          result.push({
            name: entry.name,
            type: entry.isDirectory() ? '📁 directory' : '📄 file',
            size: entry.isFile() ? stat.size : null,
            modifiedAt: stat.mtime.toISOString(),
          });
        } catch {
          // 读取权限不足时跳过
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ directory: dirPath, items: result }, null, 2),
        }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `读取目录失败：${(error as Error).message}` }], isError: true };
    }
  }
);

// 资源：提供工作目录的文件树
server.resource(
  'workspace-tree',
  'file://workspace/tree',
  async () => {
    async function buildTree(dir: string, depth: number = 0): Promise<any[]> {
      if (depth > 3) return [{ name: '...', truncated: true }]; // 避免无限递归

      const entries = await fs.readdir(dir, { withFileTypes: true });
      const tree = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        if (entry.isDirectory()) {
          const children = await buildTree(path.join(dir, entry.name), depth + 1);
          tree.push({ name: entry.name, type: 'directory', children });
        } else {
          tree.push({ name: entry.name, type: 'file' });
        }
      }

      return tree;
    }

    for (const dir of ALLOWED_DIRS) {
      const tree = await buildTree(dir);
      return { contents: [{ uri: 'file://workspace/tree', text: JSON.stringify(tree, null, 2) }] };
    }

    return { contents: [{ uri: 'file://workspace/tree', text: '[]' }] };
  }
).catch(() => {});

const transport = new StdioServerTransport();
await server.connect(transport);
```

**💡 为什么 path 参数不直接接受绝对路径？** 相对路径强制文件在可控的目录内，从设计层面杜绝路径穿越攻击。如果用户传入 `../../../etc/passwd`，路径安全检查会直接拦截。

### 项目二：数据库查询 MCP Server

数据库操作的核心矛盾是「Agent 需要灵活查询 vs 我们不想让 Agent 删库」。解决方案：**只读查询 + 参数化 SQL 预防注入**。

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// 模拟数据库
interface Row {
  [key: string]: unknown;
}
interface TableSchema {
  name: string;
  columns: Array<{ name: string; type: string }>;
  rows: Row[];
}

const database: Record<string, TableSchema> = {
  users: {
    name: 'users',
    columns: [
      { name: 'id', type: 'INTEGER' },
      { name: 'name', type: 'TEXT' },
      { name: 'email', type: 'TEXT' },
      { name: 'role', type: 'TEXT' },
    ],
    rows: [
      { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
      { id: 2, name: 'Bob', email: 'bob@example.com', role: 'user' },
      { id: 3, name: 'Charlie', email: 'charlie@example.com', role: 'user' },
    ],
  },
  orders: {
    name: 'orders',
    columns: [
      { name: 'id', type: 'INTEGER' },
      { name: 'user_id', type: 'INTEGER' },
      { name: 'product', type: 'TEXT' },
      { name: 'amount', type: 'REAL' },
    ],
    rows: [
      { id: 1, user_id: 1, product: '笔记本电脑', amount: 5999.00 },
      { id: 2, user_id: 1, product: '鼠标', amount: 99.00 },
      { id: 3, user_id: 2, product: '键盘', amount: 299.00 },
    ],
  },
};

const server = new McpServer({
  name: 'database-server',
  version: '1.0.0',
});

// 工具 1：查询表数据（只读，参数化查询）
server.tool(
  'query_table',
  '查询指定表的数据（只读操作，支持 WHERE 条件过滤）',
  {
    table: z.enum(['users', 'orders']).describe('要查询的表名'),
    where: z.string().optional().describe('过滤条件，如 "role = \'admin\'"'),
    limit: z.number().min(1).max(100).default(20).describe('返回行数上限'),
    orderBy: z.string().optional().describe('排序字段，如 "id DESC"'),
  },
  async ({ table, where, limit, orderBy }) => {
    try {
      let tableData = database[table];
      if (!tableData) {
        return { content: [{ type: 'text', text: `表 ${table} 不存在。可用表：${Object.keys(database).join(', ')}` }], isError: true };
      }

      let results = [...tableData.rows];

      // 简单 WHERE 过滤
      if (where) {
        results = results.filter(row => {
          // 简化的过滤：直接用 eval 有安全风险
          // 生产环境应该使用 AST 解析
          const parts = where.split(/\s*=\s*/);
          if (parts.length === 2) {
            const field = parts[0].trim();
            const value = parts[1].replace(/['"]/g, '').trim();
            return String(row[field]) === value;
          }
          return true;
        });
      }

      // 排序
      if (orderBy) {
        const [field, dir] = orderBy.split(/\s+/);
        const direction = dir?.toUpperCase() === 'DESC' ? -1 : 1;
        results.sort((a, b) => {
          const aVal = a[field] ?? 0;
          const bVal = b[field] ?? 0;
          return aVal > bVal ? direction : aVal < bVal ? -direction : 0;
        });
      }

      // 分页
      results = results.slice(0, limit);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            table,
            columns: tableData.columns,
            totalRows: results.length,
            rows: results,
          }, null, 2),
        }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `查询失败：${(error as Error).message}` }], isError: true };
    }
  }
);

// 工具 2：获取表结构
server.tool(
  'describe_table',
  '查看表的结构信息（列名、类型、约束）',
  {
    table: z.string().describe('表名'),
  },
  async ({ table }) => {
    const tableData = database[table];
    if (!tableData) {
      return { content: [{ type: 'text', text: `表 ${table} 不存在。` }], isError: true };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          table: tableData.name,
          columns: tableData.columns,
          rowCount: tableData.rows.length,
        }, null, 2),
      }],
    };
  }
);

// 资源：数据库概览
server.resource(
  'database-overview',
  'db://overview',
  async () => {
    const summary = Object.entries(database).map(([name, schema]) => ({
      name,
      columns: schema.columns.map(c => c.name).join(', '),
      rowCount: schema.rows.length,
    }));
    return {
      contents: [{ uri: 'db://overview', text: JSON.stringify(summary, null, 2) }],
    };
  }
);
```

**💡 为什么不让 Agent 写原生 SQL？** Agent 生成的 SQL 可能存在注入风险或性能问题。通过定义表名枚举 + 参数化查询，我们限制了 Agent 的操作范围——它只能查询我们允许的表，用我们允许的方式查询。

### 项目三：API 集成 MCP Server

将第三方 REST API 封装成 MCP 工具，让 Agent 可以通过统一接口访问外部服务。

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'api-gateway',
  version: '1.0.0',
});

// 工具：获取 GitHub 用户信息
server.tool(
  'github_get_user',
  '获取 GitHub 用户的基本信息',
  {
    username: z.string().describe('GitHub 用户名'),
  },
  async ({ username }) => {
    try {
      const response = await fetch(`https://api.github.com/users/${username}`);
      if (!response.ok) {
        return {
          content: [{ type: 'text', text: `GitHub API 错误：${response.status} ${response.statusText}` }],
          isError: true,
        };
      }
      const data = await response.json();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            用户名: data.login,
            姓名: data.name,
            粉丝数: data.followers,
            仓库数: data.public_repos,
            简介: data.bio,
          }, null, 2),
        }],
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `网络错误：${(error as Error).message}` }], isError: true };
    }
  }
);

// 工具：获取天气预报
server.tool(
  'weather_forecast',
  '获取指定城市的天气预报',
  {
    city: z.string().describe('城市名称（中文）'),
    days: z.number().min(1).max(7).default(3).describe('预报天数（1-7）'),
  },
  async ({ city, days }) => {
    try {
      // 使用 wttr.in 天气服务
      const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
      if (!response.ok) {
        return { content: [{ type: 'text', text: `获取天气失败：${response.statusText}` }], isError: true };
      }
      const data = await response.json();
      const forecasts = data.weather.slice(0, days).map((day: any) => ({
        date: day.date,
        maxTemp: `${day.maxtempC}°C`,
        minTemp: `${day.mintempC}°C`,
        condition: day.hourly[0]?.weatherDesc[0]?.value || '未知',
      }));
      return { content: [{ type: 'text', text: JSON.stringify(forecasts, null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `天气查询失败：${(error as Error).message}` }], isError: true };
    }
  }
);

// 工具：简化版芝士/知识查询
server.tool(
  'search_wikipedia',
  '搜索维基百科获取知识摘要',
  {
    query: z.string().describe('搜索关键词'),
    limit: z.number().min(1).max(5).default(3).describe('返回结果数'),
  },
  async ({ query, limit }) => {
    try {
      const response = await fetch(
        `https://en.wikipedia.org/api/rest_v1/search/page?q=${encodeURIComponent(query)}&limit=${limit}`
      );
      if (!response.ok) {
        return { content: [{ type: 'text', text: `搜索失败：${response.statusText}` }], isError: true };
      }
      const data = await response.json();
      const results = data.pages.map((page: any) => ({
        title: page.title,
        summary: page.excerpt?.replace(/<[^>]*>/g, '').substring(0, 300) + '...',
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `搜索失败：${(error as Error).message}` }], isError: true };
    }
  }
);
```

---

## 🔨 实战演练

### 练习：组合上述三个 Server 为一个统一入口

**场景描述：** 你的 Agent 需要同时操作文件、查询数据库、调用外部 API。与其让 Agent 连接三个 Server，不如构建一个统一的「超级 Server」。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// unified-server.ts — 统一入口
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';

const server = new McpServer({
  name: 'unified-agent-server',
  version: '2.0.0',
  description: '统一的 Agent 工具集 — 文件 + 数据库 + 外部 API',
});

// ===== 文件模块 =====
const WORK_DIR = process.env.WORK_DIR || './workspace';

server.tool(
  'fs_read',
  '读取文件内容',
  { path: z.string() },
  async ({ path: filePath }) => {
    const safePath = path.resolve(WORK_DIR, filePath);
    if (!safePath.startsWith(path.resolve(WORK_DIR))) {
      return { content: [{ type: 'text', text: '路径越权' }], isError: true };
    }
    const content = await fs.readFile(safePath, 'utf-8');
    return { content: [{ type: 'text', text: content }] };
  }
);

server.tool(
  'fs_write',
  '写入文件',
  { path: z.string(), content: z.string() },
  async ({ path: filePath, content }) => {
    const safePath = path.resolve(WORK_DIR, filePath);
    if (!safePath.startsWith(path.resolve(WORK_DIR))) {
      return { content: [{ type: 'text', text: '路径越权' }], isError: true };
    }
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, 'utf-8');
    return { content: [{ type: 'text', text: `✅ 已写入 ${filePath}` }] };
  }
);

// ===== 数据库模块 =====
const API_BASE = 'https://jsonplaceholder.typicode.com';

server.tool(
  'db_query',
  '查询 JSONPlaceholder 模拟数据库',
  {
    resource: z.enum(['posts', 'comments', 'users', 'todos']).describe('要查询的资源'),
    id: z.number().optional().describe('按 ID 查询'),
    limit: z.number().min(1).max(20).default(10),
  },
  async ({ resource, id, limit }) => {
    const url = id
      ? `${API_BASE}/${resource}/${id}`
      : `${API_BASE}/${resource}?_limit=${limit}`;
    const response = await fetch(url);
    const data = await response.json();
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ===== API 模块 =====
server.tool(
  'fetch_url',
  '获取任意 URL 的内容',
  {
    url: z.string().url().describe('要获取的 URL'),
    timeout: z.number().min(1000).max(30000).default(10000),
  },
  async ({ url, timeout }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { signal: controller.signal });
      const text = await response.text();
      return { content: [{ type: 'text', text: text.substring(0, 10000) }] };
    } finally {
      clearTimeout(timer);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('统一工具 Server 已启动');
```

**预期运行流程：**
```
Agent 收到用户问题："帮我查一下最近的订单，然后保存到 report.md"
→ 调用 db_query(resource: "posts", limit: 5) 获取数据
→ 调用 fs_write(path: "report.md", content: "...") 保存结果
→ 回复用户："已查询到最近 5 条订单记录，保存到 report.md"
```

</details>

---

## ⚡ 进阶技巧

### 给 Server 添加能力发现

让 Agent 能自动了解 Server 的功能范围：

```typescript
// 在 Server 初始化时注册一个「能力声明」资源
server.resource(
  'capabilities',
  'server://capabilities',
  async () => ({
    contents: [{
      uri: 'server://capabilities',
      text: JSON.stringify({
        name: 'unified-server',
        version: '2.0.0',
        modules: {
          file: { tools: ['fs_read', 'fs_write', 'list_directory'], readOnly: false },
          database: { tools: ['db_query'], readOnly: true },
          api: { tools: ['fetch_url'], readOnly: true },
        },
        rateLimits: { maxRequestsPerMinute: 60 },
      }),
    }],
  })
);
```

### 缓存策略

对于调用外部 API 的工具，添加缓存减少重复请求：

```typescript
const cache = new Map<string, { data: any; expiresAt: number }>();

async function withCache<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data as T;
  }
  const data = await fetcher();
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：文件 Server 中，为什么 write_file 默认不覆盖已存在的文件？**

> A：Agent 调用工具时可能存在幻觉——它可能认为某个文件不存在而试图创建，但文件实际已存在。默认不覆盖可以防止 Agent 意外覆盖重要数据。需要显式设置 `overwrite: true` 才允许覆盖，这是一个安全确认步骤。

**Q2：数据库 Server 中，query_table 的 where 参数为什么不直接支持原生 SQL？**

> A：如果允许 Agent 写原生 SQL，攻击者可以通过 Prompt Injection 让 Agent 执行 `DROP TABLE users`。通过结构化参数（表名枚举 + 简单条件语法），我们既能满足 90% 的查询需求，又能完全避免 SQL 注入。

**Q3：API 集成 Server 中为什么需要设置超时？**

> A：Agent 调用 API 时是同步等待的。如果外部 API 挂了，Agent 会一直等待直到超时。如果没有超时限制，一个 API 调用可能阻塞整个 Agent 几分钟。设置合理超时（如 10 秒）让 Agent 能快速失败并尝试替代方案。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 文件路径中的中文导致报错 | 未正确编码路径中的非 ASCII 字符 | 使用 `encodeURIComponent` 编码路径 |
| 数据库查询返回大量数据导致 Token 消耗过高 | 未设置 limit 限制 | 默认 limit=20，最大值 100 |
| API 调用返回 429 限流错误 | 请求过于频繁 | 实现指数退避重试：`retryAfter * 2^n` |
| 文件写入时目标目录不存在 | 未自动创建父目录 | 在写入前调用 `fs.mkdir(dir, { recursive: true })` |
| 不同工具的路径分隔符不一致 | Windows 和 Unix 路径差异 | 统一使用 `path.resolve()` 处理路径 |

---

## 📝 本章小结

- ✅ **文件系统 Server** — 路径安全检查、覆盖保护、目录遍历
- ✅ **数据库查询 Server** — 参数化查询、只读限制、表名枚举
- ✅ **API 集成 Server** — REST API 封装、超时控制、错误处理
- ✅ **统一入口模式** — 将多个工具集整合到单个 Server

## ➡️ 下一章预告

> 在下一章中，我们将从 Server 的视角切换到 Client 视角，学习如何在 Agent 应用中集成 MCP Client，让 Agent 能够发现和调用远程 MCP Server 提供的工具。
> [第6章：MCP Client 集成](./06-mcp-client.md)
