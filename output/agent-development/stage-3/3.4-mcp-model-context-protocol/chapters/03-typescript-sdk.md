# 第3章：TypeScript SDK 深入 — 高级配置与生产级特性

> 预计学习时间：90-110 分钟

## 💡 本章概览

如果说第2章是让我们学会「驾驶 MCP Server 这辆车」，那么本章就是 **改装车间**——我们要给这辆车装上防弹装甲（安全认证）、仪表盘（进度报告）、急救箱（错误处理）和导航系统（高级工具模式）。

**生活类比：** 第2章的 Server 像一家刚开张的小餐馆——老板就是厨师，菜单简单，客人来了直接点菜。本章我们将其升级为五星级餐厅——有了专门的迎宾（认证机制）、标准化的厨房流程（工具 Schema 模式）、完善的投诉处理（McpError），以及给客人实时显示上菜进度（Progress Reporting）。

## 📋 前置知识

> 建议先完成：[第2章：MCP Server 开发](./02-mcp-server.md)

---

## 一、McpServer 高级配置

### 1.1 完整的 Server 配置

基础的 `McpServer` 初始化只需要 `name` 和 `version`，但在生产环境中，我们需要更精细的控制：

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const server = new McpServer({
  name: 'production-mcp-server',
  version: '2.0.0',

  // 可选：详细的 capability 声明
  capabilities: {
    tools: {},       // 支持工具调用
    resources: {},   // 支持资源获取
    prompts: {},     // 支持提示模板
    logging: {},     // 支持日志输出 —— 新增！
  },

  // 可选：自定义指令处理器
  instructions: `
    本 Server 提供文件系统和数据库操作能力。
    所有写操作都需要管理员权限。
    数据库查询仅支持 SELECT 语句。
  `,
}, {
  // 高级选项
  maxRequestSize: 1024 * 1024,  // 最大请求体：1MB
  errorHandler: customErrorHandler,
});
```

> **类比理解：** Capabilities 就像是餐厅门口挂的招牌——"本店支持：堂食、外卖、宴会预订"。客户端看到招牌就知道你能做什么。有了明确的 capability 声明，LLM 才能正确地选择和使用你的工具。

### 1.2 条件性 Capability

某些场景下，Server 的能力会动态变化（比如数据库连接失败时，数据库相关工具暂时不可用）：

```typescript
class AdaptiveMcpServer {
  private server: McpServer;
  private dbConnected = false;
  private fsAvailable = true;

  constructor() {
    this.server = new McpServer({
      name: 'adaptive-server',
      version: '1.0.0',
      capabilities: {
        tools: {},
        resources: {},
      },
    });
  }

  // 根据数据库状态动态注册/注销工具
  async checkDatabaseConnection() {
    try {
      await db.ping();
      this.dbConnected = true;
      this.registerDatabaseTools();
    } catch {
      this.dbConnected = false;
      console.warn('⚠️ 数据库不可用，数据库工具已禁用');
    }
  }

  private registerDatabaseTools() {
    this.server.tool(
      'query_database',
      '执行 SQL 查询（仅 SELECT）',
      { sql: z.string() },
      async ({ sql }) => {
        if (!this.dbConnected) {
          return {
            content: [{ type: 'text', text: '数据库未连接' }],
            isError: true,
          };
        }
        // ... 执行查询
      }
    );
  }
}
```

---

## 二、认证与授权（Authentication & Authorization）

### 2.1 为什么需要认证？

**生活类比：** MCP Server 就像一栋办公楼。没有认证时，任何人都能自由进出。有了认证，前台会检查你的工牌（API Key）或者刷脸（OAuth），确认你是员工才放行。

在生产环境中，MCP Server 通常需要接入认证机制，原因有三：

| 原因 | 说明 | 后果（如果没有） |
|------|------|------------------|
| 安全隔离 | 防止未授权访问 | 任何人都能调用你的工具 |
| 审计追踪 | 记录谁做了什么 | 无法追溯安全事件 |
| 资源控制 | 按用户限制调用频率 | 恶意调用耗尽资源 |

### 2.2 API Key 认证

API Key 是最简单、最常用的认证方式。MCP SDK 提供了 `authenticated` 中间件模式：

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// API Key 验证函数
function validateApiKey(token: string): boolean {
  const validKeys = [
    'sk-prod-abc123',
    'sk-staging-def456',
  ];

  // 实际项目中，应从环境变量或密钥管理服务读取
  if (!validKeys.includes(token)) {
    return false;
  }

  // 可选：检查 Key 的权限范围
  const permissions = token.startsWith('sk-prod-')
    ? ['read', 'write', 'admin']
    : ['read'];

  return true;
}

// 创建一个带认证的 Server
const server = new McpServer({
  name: 'authenticated-server',
  version: '1.0.0',
  capabilities: {
    tools: {},
  },
});

// 定义一个需要认证的工具
server.tool(
  'admin_operation',
  '需要管理员权限的高级操作',
  {
    apiKey: z.string().describe('管理员 API Key'),
    operation: z.string().describe('操作名称'),
    data: z.any().optional().describe('操作数据'),
  },
  async ({ apiKey, operation, data }) => {
    // 第一步：验证身份
    if (!validateApiKey(apiKey)) {
      return {
        content: [{
          type: 'text',
          text: '认证失败：无效的 API Key',
        }],
        isError: true,
      };
    }

    // 第二步：检查权限（基于 Key 前缀）
    if (!apiKey.startsWith('sk-prod-')) {
      return {
        content: [{
          type: 'text',
          text: '权限不足：此操作需要生产环境 Key',
        }],
        isError: true,
      };
    }

    // 第三步：执行操作
    return {
      content: [{
        type: 'text',
        text: `✅ 操作 "${operation}" 执行成功`,
      }],
    };
  }
);
```

### 2.3 OAuth 2.0 认证模式

对于需要集成第三方服务的 MCP Server，OAuth 2.0 是标准方案。MCP 协议支持 OAuth 的授权码流程：

```typescript
// oauth-server.ts — 完整的 OAuth 集成示例
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import express from 'express';
import axios from 'axios';

interface OAuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

class OAuthMcpServer {
  private server: McpServer;
  private tokens: Map<string, OAuthToken> = new Map();

  constructor() {
    this.server = new McpServer({
      name: 'oauth-mcp-server',
      version: '1.0.0',
      capabilities: {
        tools: {},
      },
    });

    this.registerTools();
  }

  private registerTools() {
    // 工具：使用 OAuth 令牌访问受保护的 API
    this.server.tool(
      'call_protected_api',
      '调用受 OAuth 保护的第三方 API',
      {
        userId: z.string().describe('用户 ID（用于获取令牌）'),
        endpoint: z.string().describe('API 端点路径'),
        method: z.enum(['GET', 'POST']).default('GET').describe('HTTP 方法'),
        body: z.string().optional().describe('请求体（JSON 字符串）'),
      },
      async ({ userId, endpoint, method, body }) => {
        // 1. 获取用户的 OAuth 令牌
        const token = this.tokens.get(userId);
        if (!token) {
          return {
            content: [{
              type: 'text',
              text: `错误：用户 ${userId} 未授权，请先完成 OAuth 授权流程`,
            }],
            isError: true,
          };
        }

        // 2. 检查令牌是否过期，过期则刷新
        if (Date.now() > token.expiresAt) {
          try {
            await this.refreshToken(userId, token.refreshToken);
          } catch (error) {
            return {
              content: [{
                type: 'text',
                text: `令牌刷新失败：${(error as Error).message}`,
              }],
              isError: true,
            };
          }
        }

        // 3. 使用令牌调用 API
        try {
          const response = await axios({
            method: method as 'GET' | 'POST',
            url: `https://api.example.com/${endpoint}`,
            headers: {
              Authorization: `Bearer ${this.tokens.get(userId)!.accessToken}`,
              'Content-Type': 'application/json',
            },
            data: body ? JSON.parse(body) : undefined,
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: `API 调用失败：${(error as Error).message}`,
            }],
            isError: true,
          };
        }
      }
    );

    // 工具：发起 OAuth 授权流程
    this.server.tool(
      'initiate_oauth',
      '发起 OAuth 授权流程',
      {
        userId: z.string().describe('用户 ID'),
        redirectUri: z.string().describe('回调地址'),
      },
      async ({ userId, redirectUri }) => {
        // 构造授权 URL
        const authUrl = `https://auth.example.com/oauth/authorize?` +
          `client_id=${process.env.OAUTH_CLIENT_ID}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&response_type=code` +
          `&state=${userId}`;

        return {
          content: [{
            type: 'text',
            text: `请访问以下 URL 完成授权：\n${authUrl}`,
          }],
        };
      }
    );
  }

  // 处理 OAuth 回调（由外部 Express 路由触发）
  async handleOAuthCallback(code: string, userId: string) {
    // 用授权码交换访问令牌
    const response = await axios.post('https://auth.example.com/oauth/token', {
      client_id: process.env.OAUTH_CLIENT_ID,
      client_secret: process.env.OAUTH_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    });

    this.tokens.set(userId, {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
    });
  }

  private async refreshToken(userId: string, refreshToken: string) {
    const response = await axios.post('https://auth.example.com/oauth/token', {
      client_id: process.env.OAUTH_CLIENT_ID,
      client_secret: process.env.OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    this.tokens.set(userId, {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
    });
  }
}
```

---

## 三、错误处理与 McpError

### 3.1 错误处理的三层模型

**生活类比：** 一家优秀的餐厅，对错误要有三层处理机制：
- **第一层（预防）：** 菜单上标注过敏原信息 —— 对应参数验证
- **第二层（处理）：** 上错了菜，立刻换一份并道歉 —— 对应业务错误处理
- **第三层（兜底）：** 厨房着火了，启动消防系统 —— 对应全局异常处理

在 MCP 中，错误处理同样分三个层次：

```typescript
// ┌──────────────────────────────────────┐
// │  第一层：Zod Schema 自动验证         │
// │  参数类型错误、缺失必填字段时自动返回  │
// └──────────────────────────────────────┘
//
// ┌──────────────────────────────────────┐
// │  第二层：McpError 显式抛出           │
// │  业务逻辑错误、权限不足等             │
// └──────────────────────────────────────┘
//
// ┌──────────────────────────────────────┐
// │  第三层：全局 errorHandler           │
// │  未捕获异常、系统级错误              │
// └──────────────────────────────────────┘
```

### 3.2 使用 McpError

`McpError` 是 MCP SDK 提供的标准错误类，它比简单的 `isError: true` 返回更加规范：

```typescript
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// 标准错误码列表
console.log(ErrorCode);
// {
//   ParseError: -32700,
//   InvalidRequest: -32600,
//   MethodNotFound: -32601,
//   InvalidParams: -32602,
//   InternalError: -32603,
//   // 以下为 MCP 扩展错误码
//   ResourceNotFound: -32000,
//   ToolNotFound: -32001,
//   ToolExecutionError: -32002,
//   PermissionDenied: -32003,
//   Timeout: -32004,
//   RateLimit: -32005,
// }

// 示例：完整的错误处理工具
server.tool(
  'sensitive_operation',
  '需要严格错误处理的敏感操作',
  {
    resourceId: z.string().min(1).describe('资源 ID'),
    action: z.enum(['read', 'write', 'delete']).describe('操作类型'),
  },
  async ({ resourceId, action }) => {
    try {
      // 1. 权限检查
      if (action === 'delete' && !hasAdminAccess()) {
        throw new McpError(
          ErrorCode.PermissionDenied,
          '删除操作需要管理员权限'
        );
      }

      // 2. 资源存在性检查
      const resource = await findResource(resourceId);
      if (!resource) {
        throw new McpError(
          ErrorCode.ResourceNotFound,
          `资源 ${resourceId} 不存在`
        );
      }

      // 3. 执行操作
      const result = await executeAction(resource, action);

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };

    } catch (error) {
      // 如果是 McpError，直接传递
      if (error instanceof McpError) {
        return {
          content: [{ type: 'text', text: error.message }],
          isError: true,
        };
      }

      // 如果是其他错误，包装为 InternalError
      return {
        content: [{
          type: 'text',
          text: `服务器内部错误：${(error as Error).message}`,
        }],
        isError: true,
      };
    }
  }
);
```

### 3.3 自定义全局错误处理器

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const server = new McpServer({
  name: 'robust-server',
  version: '1.0.0',
}, {
  // 全局错误处理器
  errorHandler: (error: Error, context?: any) => {
    console.error(`[${new Date().toISOString()}] 异常:`, {
      error: error.message,
      stack: error.stack,
      context,
    });

    // 给客户端返回友好的错误信息
    return {
      content: [{
        type: 'text',
        text: '服务器遇到意外错误，请稍后重试。如果问题持续，请联系管理员。',
      }],
      isError: true,
    };
  },
});
```

---

## 四、进度报告（Progress Reporting）

### 4.1 为什么需要进度报告？

**生活类比：** 当你点了一份复杂的套餐（比如烤全羊），如果厨师只是说「等着」，你会很焦虑。但如果厨师说「正在腌制（30%）→ 正在烤制（60%）→ 准备装盘（90%）」，你就能安心等待。

对于耗时较长的 MCP 工具调用（如大数据分析、文件批量处理、AI 模型推理），进度报告至关重要：

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'progress-server',
  version: '1.0.0',
});

// 工具：批量数据处理（带进度报告）
server.tool(
  'batch_process',
  '批量处理数据文件，支持进度报告',
  {
    filePaths: z.array(z.string()).min(1).max(100).describe('要处理的文件路径列表'),
    operation: z.enum(['analyze', 'transform', 'compress']).describe('处理操作'),
  },
  async ({ filePaths, operation }, extra) => {
    // extra 包含了进度报告所需的上下文信息
    const total = filePaths.length;
    const results: string[] = [];

    for (let i = 0; i < total; i++) {
      const filePath = filePaths[i];
      const progress = Math.round(((i + 1) / total) * 100);

      // 发送进度信息（通过 server.sendProgress 或 extra 中的方法）
      if (extra?.sendProgress) {
        await extra.sendProgress({
          progress,          // 0-100 的进度百分比
          total,            // 总任务数（可选）
          current: i + 1,   // 当前完成数（可选）
          message: `正在处理 ${filePath} (${i + 1}/${total})`,
        });
      }

      // 模拟实际处理
      const result = await processFile(filePath, operation);
      results.push(result);
    }

    return {
      content: [{
        type: 'text',
        text: `✅ 批量处理完成：\n${results.join('\n')}`,
      }],
    };
  }
);
```

### 4.2 客户端处理进度

MCP 客户端可以通过订阅进度通知来获取实时状态：

```typescript
// 客户端监听进度更新
client.onProgress = (notification) => {
  const { progress, total, current, message } = notification;

  // 在 UI 上显示进度条
  updateProgressBar(progress);

  // 显示当前状态
  statusDisplay.textContent = message ||
    `进度: ${current || progress}/${total || 100}`;
};

// 或者使用 Promise-based 的进度订阅
const result = await client.callTool(
  { name: 'batch_process', arguments: { filePaths, operation } },
  {
    onProgress: (progress) => {
      console.log(`进度: ${progress.progress}% — ${progress.message}`);
    },
    timeout: 300_000, // 5 分钟超时
  }
);
```

---

## 五、工具 Schema 高级模式

### 5.1 嵌套 Schema

当工具参数结构复杂时，可以使用 Zod 的嵌套对象：

```typescript
import { z } from 'zod';

// 定义复杂的参数 Schema
const FilterSchema = z.object({
  field: z.string().describe('过滤字段名'),
  operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'])
    .describe('比较操作符'),
  value: z.union([z.string(), z.number(), z.array(z.string())])
    .describe('比较值'),
});

const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1).describe('页码'),
  pageSize: z.number().int().min(1).max(100).default(20).describe('每页条目数'),
  sortBy: z.string().optional().describe('排序字段'),
  sortOrder: z.enum(['asc', 'desc']).default('asc').describe('排序方向'),
});

server.tool(
  'query_data',
  '高级数据查询（支持过滤、分页、排序）',
  {
    collection: z.string().describe('数据集合名称'),
    filters: z.array(FilterSchema).max(10).default([]).describe('过滤条件列表'),
    pagination: PaginationSchema.default({}).describe('分页参数'),
    fields: z.array(z.string()).optional().describe('要返回的字段（默认全部）'),
  },
  async ({ collection, filters, pagination, fields }) => {
    // 构建查询
    const query = buildQuery(collection, filters, pagination, fields);
    const results = await executeQuery(query);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          data: results,
          pagination: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            total: results.length,
          },
        }, null, 2),
      }],
    };
  }
);
```

### 5.2 工具组模式

当多个工具共享相同的依赖或配置时，可以使用工具组模式：

```typescript
class DatabaseToolGroup {
  private db: Database;
  private server: McpServer;

  constructor(server: McpServer, connectionString: string) {
    this.server = server;
    this.db = new Database(connectionString);
    this.registerAll();
  }

  private registerAll() {
    // 查询工具
    this.server.tool(
      'db_query',
      '执行数据库查询',
      { sql: z.string() },
      async ({ sql }) => {
        return { content: [{ type: 'text', text: await this.db.query(sql) }] };
      }
    );

    // 表信息工具
    this.server.tool(
      'db_tables',
      '列出所有表',
      {},
      async () => {
        const tables = await this.db.listTables();
        return { content: [{ type: 'text', text: tables.join('\n') }] };
      }
    );

    // Schema 查看工具
    this.server.tool(
      'db_schema',
      '查看表结构',
      { table: z.string() },
      async ({ table }) => {
        const schema = await this.db.getSchema(table);
        return { content: [{ type: 'text', text: JSON.stringify(schema, null, 2) }] };
      }
    );
  }

  async close() {
    await this.db.close();
  }
}

// 使用
const dbToolGroup = new DatabaseToolGroup(server, 'postgres://localhost:5432/mydb');
```

### 5.3 动态工具注册

在运行时根据配置动态注册工具：

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  handler: (args: any) => Promise<any>;
}

function registerDynamicTools(server: McpServer, tools: ToolDefinition[]) {
  for (const tool of tools) {
    server.tool(
      tool.name,
      tool.description,
      {
        // 动态生成参数 Schema
        ...generateSchemaForTool(tool),
      },
      tool.handler
    );
  }

  console.log(`✅ 已注册 ${tools.length} 个动态工具`);
}

// 从配置文件加载工具定义
const toolConfigs = JSON.parse(
  await fs.readFile('./tools-config.json', 'utf-8')
);

registerDynamicTools(server, toolConfigs.map(parseToolConfig));
```

---

## 六、完整示例：带认证的 API 聚合 Server

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import axios from 'axios';
import * as fs from 'fs/promises';

// ========== 认证层 ==========
class AuthManager {
  private apiKeys: Map<string, { permissions: string[]; owner: string }>;

  constructor() {
    this.apiKeys = new Map();
    // 生产环境应从密钥管理服务加载
    this.apiKeys.set('sk-prod-admin', { permissions: ['read', 'write', 'admin'], owner: 'admin' });
    this.apiKeys.set('sk-prod-reader', { permissions: ['read'], owner: 'reader' });
  }

  validate(token: string): { isValid: boolean; permissions: string[]; owner: string } {
    const keyData = this.apiKeys.get(token);
    if (!keyData) {
      return { isValid: false, permissions: [], owner: '' };
    }
    return { isValid: true, ...keyData };
  }

  requirePermission(token: string, required: string): void {
    const auth = this.validate(token);
    if (!auth.isValid) {
      throw new McpError(ErrorCode.PermissionDenied, '无效的 API Key');
    }
    if (!auth.permissions.includes(required) && !auth.permissions.includes('admin')) {
      throw new McpError(ErrorCode.PermissionDenied, `需要 ${required} 权限`);
    }
  }
}

// ========== Server 初始化 ==========
const authManager = new AuthManager();

const server = new McpServer({
  name: 'api-aggregator',
  version: '2.0.0',
  capabilities: {
    tools: {},
    logging: {},
  },
  instructions: `
    本 Server 聚合多个外部 API 服务：
    - GitHub API：获取仓库信息
    - Weather API：查询天气
    - 文件系统：本地文件操作

    所有操作需要提供有效的 API Key。
    写操作需要 write 权限，管理操作需要 admin 权限。
  `,
});

// ========== 工具 1：GitHub 仓库信息 ==========
server.tool(
  'github_repo_info',
  '获取 GitHub 仓库的详细信息',
  {
    apiKey: z.string().describe('API Key（需要 read 权限）'),
    owner: z.string().describe('仓库所有者'),
    repo: z.string().describe('仓库名称'),
  },
  async ({ apiKey, owner, repo }) => {
    try {
      authManager.requirePermission(apiKey, 'read');

      const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}`);
      const data = response.data;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            name: data.full_name,
            description: data.description,
            stars: data.stargazers_count,
            forks: data.forks_count,
            language: data.language,
            topics: data.topics,
          }, null, 2),
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      return {
        content: [{ type: 'text', text: `GitHub API 错误: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ========== 工具 2：天气查询 ==========
server.tool(
  'get_weather',
  '查询指定城市的天气信息',
  {
    apiKey: z.string().describe('API Key（需要 read 权限）'),
    city: z.string().describe('城市名称'),
    days: z.number().int().min(1).max(7).default(3).describe('预报天数'),
  },
  async ({ apiKey, city, days }) => {
    try {
      authManager.requirePermission(apiKey, 'read');

      const forecasts = [];
      const conditions = ['☀️ 晴', '⛅ 多云', '🌧️ 小雨', '☁️ 阴'];
      for (let i = 0; i < days; i++) {
        forecasts.push({
          date: new Date(Date.now() + i * 86400000).toISOString().split('T')[0],
          condition: conditions[Math.floor(Math.random() * conditions.length)],
          temperature: `${20 + Math.floor(Math.random() * 10)}°C`,
          humidity: `${50 + Math.floor(Math.random() * 30)}%`,
        });
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ city, forecasts }, null, 2),
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      return {
        content: [{ type: 'text', text: `天气查询失败: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ========== 工具 3：文件操作（需要 write 权限）==========
server.tool(
  'write_file',
  '写入文件内容（需要 write 权限）',
  {
    apiKey: z.string().describe('API Key（需要 write 权限）'),
    path: z.string().describe('文件路径'),
    content: z.string().describe('文件内容'),
  },
  async ({ apiKey, path, content }) => {
    try {
      authManager.requirePermission(apiKey, 'write');

      await fs.writeFile(path, content, 'utf-8');

      return {
        content: [{
          type: 'text',
          text: `✅ 文件已写入: ${path} (${content.length} 字符)`,
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      return {
        content: [{ type: 'text', text: `文件写入失败: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ========== 启动 ==========
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🚀 API 聚合 MCP Server 已启动');
  console.error('技术支持: admin@example.com');
}

main().catch(console.error);
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：McpError 和普通的 isError: true 返回有什么区别？**

> A：McpError 提供了规范化的错误码体系（ErrorCode），让客户端能根据错误码做出不同的处理策略（如 401 重定向到登录、429 等待后重试）。而 isError: true 只是标记了错误状态，客户端无法区分错误类型。McpError 是「有分类的错误信息」，isError 是「简单的错误标记」。

**Q2：进度报告在什么场景下最为关键？**

> A：进度报告在三种场景下最为关键：（1）长时间运行的任务（>30秒），如批量文件处理；（2）多步骤流水线任务，如数据提取→转换→加载（ETL）；（3）用户感知的实时任务，如 AI 模型的推理过程。没有进度报告，客户端无法判断是「正在处理」还是「卡死了」。

**Q3：Capability 声明有什么实际作用？**

> A：Capability 声明的作用类似于 REST API 的 OpenAPI 文档——它让客户端（以及 LLM）在连接时就能知道 Server 提供哪些能力，而不需要逐个方法去尝试调用。这就像是餐厅门口的菜单展示板，客人不用进每个包厢才知道有没有座位。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| API Key 认证中密钥硬编码在代码中 | 将密钥直接写入源码，造成安全隐患 | 使用环境变量或安全的密钥管理服务，不要在源码中硬编码凭证 |
| McpError 错误码使用了非标准值 | 直接使用 HTTP 状态码而非 MCP 标准错误码 | 使用 MCP 定义的错误码（如 `ErrorCode.InvalidRequest`、`ErrorCode.InvalidParams`），不要自定义数字码 |
| 进度报告未正确处理客户端取消信号 | 长时间任务中客户端已断开但 Server 仍在执行 | 在进度报告中监听客户端的取消信号（`cancelled` 事件），及时中止任务 |
| 条件性能力声明与实际注册的工具/资源不一致 | Server 声明支持某能力但未注册对应的处理函数 | 确保 `server.setCapabilities()` 中的声明与实际 `server.tool()`、`server.resource()` 注册保持一致 |

---

## 📝 本章小结

- ✅ **McpServer 高级配置** — Capability 声明、条件性能力、自定义选项
- ✅ **API Key 认证** — 令牌验证、权限分级、安全审计
- ✅ **OAuth 2.0 集成** — 授权码流程、令牌刷新、第三方 API 访问
- ✅ **McpError 错误处理** — 三级错误模型、标准错误码、全局异常捕获
- ✅ **进度报告** — 实时进度推送、客户端订阅、长时间任务管理
- ✅ **工具 Schema 模式** — 嵌套 Schema、工具组模式、动态注册

## ➡️ 下一章预告

> [第4章：传输协议](./04-transport.md) — stdio、HTTP SSE、Streamable HTTP 三种传输方式的对比与选择。
