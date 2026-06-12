# 第5章：实战 Servers — 文件系统、数据库与 API 集成

> 预计学习时间：90-110 分钟

## 💡 本章概览

**生活类比：** 前面几章我们学会了 MCP 的「语法」（SDK 用法）和「修辞」（协议选择），但真正的作家需要写什么？**写小说、写新闻、写代码。** 本章就是实战写作——我们用 MCP 构建三个真实世界中最常用的 Server：

1. **文件系统 Server** — 像 Windows 资源管理器，让 LLM 能读写、搜索文件
2. **数据库查询 Server** — 像 Navicat/DBeaver，让 LLM 能查询、分析数据库
3. **API 集成 Server** — 像 Zapier，让 LLM 能调用外部 API

每一个 Server 都将经过「需求分析 → 安全防护 → 代码实现 → 测试验证」的完整流程。

## 📋 前置知识

> 建议先完成：[第2章：MCP Server 开发](./02-mcp-server.md)、[第3章：TypeScript SDK 深入](./03-typescript-sdk.md)

---

## 一、文件系统 Server（FileSystem Server）

### 1.1 需求分析

**场景：** LLM 需要读写本地文件、搜索代码、管理项目结构。就像给 AI 配了一个「文件管理器」。

**功能列表：**
| 功能 | 说明 | 安全要求 |
|------|------|---------|
| read_file | 读取文件内容 | 路径安全检查，禁止读取系统文件 |
| write_file | 写入文件内容 | 限制写入目录，禁止覆盖系统文件 |
| list_directory | 列出目录内容 | 禁止列出系统目录 |
| search_files | 按模式搜索文件 | 限制搜索范围 |
| file_info | 获取文件元信息 | 无 |

### 1.2 安全第一：路径遍历防护

```typescript
// path-security.ts — 路径安全工具函数
import { resolve, normalize, relative } from 'path';

class PathSecurity {
  private allowedBasePaths: string[];

  constructor(basePaths: string[]) {
    this.allowedBasePaths = basePaths.map(p => resolve(normalize(p)));
  }

  /**
   * 验证路径是否在允许范围内
   * 防止路径遍历攻击（Path Traversal Attack）
   *
   * ❌ 攻击示例：../../etc/passwd
   * ✅ 安全示例：./projects/my-app/src/index.ts
   */
  validatePath(inputPath: string): { safe: boolean; resolvedPath?: string; error?: string } {
    // 1. 标准化路径
    const resolved = resolve(normalize(inputPath));

    // 2. 检查是否在允许的基路径内
    const isAllowed = this.allowedBasePaths.some(basePath => {
      const relativePath = relative(basePath, resolved);
      return !relativePath.startsWith('..') && !relative.isAbsolute(relativePath);
    });

    if (!isAllowed) {
      return {
        safe: false,
        error: `⛔ 路径访问被拒绝: ${inputPath}\n   允许的基路径: ${this.allowedBasePaths.join(', ')}`,
      };
    }

    // 3. 检查是否在已排除的敏感路径中
    const excludedPatterns = [
      /\/etc\//, /\/sys\//, /\/proc\//, /\/dev\//,
      /\/\.git\//, /node_modules\//, /\/\.env$/,
    ];

    for (const pattern of excludedPatterns) {
      if (pattern.test(resolved)) {
        return {
          safe: false,
          error: `⛔ 访问被拒绝: ${inputPath} 位于排除列表中`,
        };
      }
    }

    return { safe: true, resolvedPath: resolved };
  }

  /**
   * 获取允许的文件列表（用于目录浏览时的过滤）
   */
  isAllowedFile(filePath: string): boolean {
    const result = this.validatePath(filePath);
    return result.safe;
  }
}
```

### 1.3 完整的文件系统 Server

```typescript
// filesystem-server.ts — 完整的文件系统 MCP Server
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';

const pathSecurity = new PathSecurity([
  process.cwd(),                    // 当前工作目录
  process.env.ALLOWED_DIR || './',  // 额外允许的目录
]);

const server = new McpServer({
  name: 'filesystem-server',
  version: '1.0.0',
  description: '安全的文件系统操作 Server，支持读写文件和目录浏览',
});

// ========== 工具 1：读取文件 ==========
server.tool(
  'read_file',
  '读取指定文件的文本内容',
  {
    filePath: z.string().describe('文件路径（相对于允许的工作目录）'),
    encoding: z.enum(['utf-8', 'base64']).default('utf-8').describe('文件编码'),
  },
  async ({ filePath, encoding }) => {
    // 安全检查
    const validation = pathSecurity.validatePath(filePath);
    if (!validation.safe) {
      return { content: [{ type: 'text', text: validation.error! }], isError: true };
    }

    try {
      const content = encoding === 'base64'
        ? (await fs.readFile(validation.resolvedPath!)).toString('base64')
        : await fs.readFile(validation.resolvedPath!, 'utf-8');

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
          text: `读取文件失败: ${(error as Error).message}`,
        }],
        isError: true,
      };
    }
  }
);

// ========== 工具 2：写入文件 ==========
server.tool(
  'write_file',
  '写入内容到指定文件（会创建父目录）',
  {
    filePath: z.string().describe('文件路径'),
    content: z.string().describe('文件内容'),
    overwrite: z.boolean().default(false).describe('是否覆盖已存在的文件'),
  },
  async ({ filePath, content, overwrite }) => {
    // 安全检查
    const validation = pathSecurity.validatePath(filePath);
    if (!validation.safe) {
      return { content: [{ type: 'text', text: validation.error! }], isError: true };
    }

    try {
      // 检查文件是否已存在
      try {
        await fs.access(validation.resolvedPath!);
        if (!overwrite) {
          return {
            content: [{ type: 'text', text: `⛔ 文件已存在: ${filePath}\n设置 overwrite=true 覆盖` }],
            isError: true,
          };
        }
      } catch {
        // 文件不存在，可以创建
      }

      // 确保父目录存在
      await fs.mkdir(path.dirname(validation.resolvedPath!), { recursive: true });
      // 写入文件
      await fs.writeFile(validation.resolvedPath!, content, 'utf-8');

      return {
        content: [{
          type: 'text',
          text: `✅ 文件写入成功: ${filePath} (${content.length} 字符)`,
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `写入文件失败: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ========== 工具 3：列出目录 ==========
server.tool(
  'list_directory',
  '列出指定目录下的文件和子目录',
  {
    dirPath: z.string().default('.').describe('目录路径'),
    showHidden: z.boolean().default(false).describe('是否显示隐藏文件'),
    maxItems: z.number().int().min(1).max(1000).default(100).describe('最大返回条目数'),
  },
  async ({ dirPath, showHidden, maxItems }) => {
    const validation = pathSecurity.validatePath(dirPath);
    if (!validation.safe) {
      return { content: [{ type: 'text', text: validation.error! }], isError: true };
    }

    try {
      const entries = await fs.readdir(validation.resolvedPath!, { withFileTypes: true });

      const items = entries
        .filter(entry => showHidden || !entry.name.startsWith('.'))
        .slice(0, maxItems)
        .map(entry => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entry.isFile() ? '未知' : '-',
        }));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ path: dirPath, items, total: items.length }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `列出目录失败: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ========== 工具 4：搜索文件 ==========
server.tool(
  'search_files',
  '根据模式搜索文件（支持 glob 通配符）',
  {
    pattern: z.string().describe('搜索模式，如 "**/*.ts"、"*.md"'),
    baseDir: z.string().default('.').describe('搜索的基目录'),
    maxResults: z.number().int().min(1).max(200).default(50).describe('最大结果数'),
  },
  async ({ pattern, baseDir, maxResults }) => {
    const validation = pathSecurity.validatePath(baseDir);
    if (!validation.safe) {
      return { content: [{ type: 'text', text: validation.error! }], isError: true };
    }

    try {
      const files = await glob(pattern, {
        cwd: validation.resolvedPath!,
        absolute: true,
        nodir: true,
      });

      const results = files
        .filter(f => pathSecurity.isAllowedFile(f))
        .slice(0, maxResults);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            pattern,
            totalFound: files.length,
            returned: results.length,
            files: results,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `搜索文件失败: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ========== 工具 5：文件信息 ==========
server.tool(
  'file_info',
  '获取文件或目录的详细信息',
  {
    targetPath: z.string().describe('文件或目录路径'),
  },
  async ({ targetPath }) => {
    const validation = pathSecurity.validatePath(targetPath);
    if (!validation.safe) {
      return { content: [{ type: 'text', text: validation.error! }], isError: true };
    }

    try {
      const stats = await fs.stat(validation.resolvedPath!);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            path: targetPath,
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            permissions: stats.mode.toString(8).slice(-3),
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `获取文件信息失败: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 启动
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('📁 文件系统 MCP Server 已启动');
```

---

## 二、数据库查询 Server（Database Query Server）

### 2.1 需求分析

**场景：** LLM 需要查询数据库、分析数据、生成报表。就像给 AI 配了一个「数据库管理员」。

**安全原则：**
- 只允许 SELECT 查询（只读）
- 查询超时限制（防止慢查询）
- 结果行数限制（防止内存溢出）
- SQL 注入防护（使用参数化查询）
- 日志审计（记录所有查询）

### 2.2 数据库查询 Server 实现

```typescript
// database-server.ts — 数据库查询 MCP Server
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import mysql from 'mysql2/promise';
import pg from 'pg';

// 数据库连接池管理
class DatabaseManager {
  private connections: Map<string, any> = new Map();
  private auditLog: string[] = [];

  async getConnection(dbType: string, config: any) {
    const key = `${dbType}:${JSON.stringify(config)}`;
    if (this.connections.has(key)) {
      return this.connections.get(key);
    }

    let connection: any;
    if (dbType === 'mysql') {
      connection = await mysql.createConnection(config);
    } else if (dbType === 'postgres') {
      connection = new pg.Client(config);
      await connection.connect();
    }

    this.connections.set(key, connection);
    return connection;
  }

  async query(dbType: string, config: any, sql: string, maxRows: number) {
    // 审计日志
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      sql,
      config: { host: config.host, database: config.database },
    });

    const conn = await this.getConnection(dbType, config);

    // 执行查询（参数化查询防止注入）
    const [rows] = await conn.query(sql);
    const results = Array.isArray(rows) ? rows.slice(0, maxRows) : [];

    return results;
  }

  getAuditLog() {
    return this.auditLog;
  }
}

const dbManager = new DatabaseManager();

const server = new McpServer({
  name: 'database-query-server',
  version: '1.0.0',
  capabilities: { tools: {} },
});

// ========== 工具 1：执行 SQL 查询 ==========
server.tool(
  'execute_query',
  '执行 SQL SELECT 查询（只读操作）',
  {
    dbType: z.enum(['mysql', 'postgres']).describe('数据库类型'),
    host: z.string().describe('数据库主机地址'),
    port: z.number().int().optional().describe('端口号'),
    database: z.string().describe('数据库名称'),
    user: z.string().describe('用户名'),
    password: z.string().describe('密码'),
    sql: z.string().describe('SQL 查询语句（仅 SELECT）'),
    maxRows: z.number().int().min(1).max(1000).default(100).describe('最大返回行数'),
  },
  async ({ dbType, host, port, database, user, password, sql, maxRows }) => {
    // 安全检查：只允许 SELECT
    const trimmedSQL = sql.trim().toUpperCase();
    if (!trimmedSQL.startsWith('SELECT')) {
      throw new McpError(
        ErrorCode.PermissionDenied,
        '⛔ 安全限制：只允许执行 SELECT 查询。写入操作请联系数据库管理员。'
      );
    }

    // 安全检查：禁止危险操作
    const dangerousPatterns = [
      /INTO\s+OUTFILE/i, /INTO\s+DUMPFILE/i,
      /LOAD_FILE/i, /BENCHMARK/i, /SLEEP/i,
    ];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        throw new McpError(ErrorCode.PermissionDenied, '⛔ 查询包含禁止的操作');
      }
    }

    try {
      const config = {
        host,
        port: port || (dbType === 'mysql' ? 3306 : 5432),
        database,
        user,
        password,
      };

      const result = await dbManager.query(dbType, config, sql, maxRows);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            rowCount: result.length,
            columns: result.length > 0 ? Object.keys(result[0]) : [],
            data: result,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `查询执行失败: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ========== 工具 2：获取表信息 ==========
server.tool(
  'get_table_info',
  '获取数据库中所有表的列表及其结构',
  {
    dbType: z.enum(['mysql', 'postgres']),
    host: z.string(),
    database: z.string(),
    user: z.string(),
    password: z.string(),
  },
  async ({ dbType, host, database, user, password }) => {
    try {
      const config = { host, database, user, password };
      let sql: string;

      if (dbType === 'mysql') {
        sql = `SELECT TABLE_NAME AS table_name, TABLE_TYPE AS table_type,
                      TABLE_ROWS AS row_count, ENGINE
               FROM information_schema.TABLES
               WHERE TABLE_SCHEMA = '${database}'`;
      } else {
        sql = `SELECT tablename AS table_name,
                      'TABLE' AS table_type
               FROM pg_catalog.pg_tables
               WHERE schemaname = 'public'`;
      }

      const tables = await dbManager.query(dbType, config, sql, 200);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ database, tables }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `获取表信息失败: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 启动
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('🗄️ 数据库查询 MCP Server 已启动');
```

---

## 三、API 集成 Server（API Integration Server）

### 3.1 需求分析

**场景：** LLM 需要调用外部 REST API——Slack 发消息、GitHub 查仓库、发邮件、调用第三方服务等。

**生活类比：** API 集成 Server 就像是 AI 的「万能遥控器」。按一个按钮（调用工具），遥控器帮你完成背后的所有操作——翻墙、认证、解析、重试——AI 只需知道按哪个按钮即可。

### 3.2 API 集成 Server 实现

```typescript
// api-integration-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import axios, { AxiosError } from 'axios';
import { RateLimiter } from 'limiter';

// API 调用限流器
class APIRateLimiter {
  private limiters: Map<string, RateLimiter> = new Map();

  getLimiter(apiName: string, maxPerSecond: number = 10): RateLimiter {
    if (!this.limiters.has(apiName)) {
      this.limiters.set(apiName, new RateLimiter({ tokensPerInterval: maxPerSecond, interval: 'second' }));
    }
    return this.limiters.get(apiName)!;
  }

  async waitForToken(apiName: string): Promise<void> {
    const limiter = this.getLimiter(apiName);
    await limiter.removeTokens(1);
  }
}

const rateLimiter = new APIRateLimiter();

const server = new McpServer({
  name: 'api-integration-server',
  version: '1.0.0',
  capabilities: { tools: {} },
});

// ========== 工具 1：通用 HTTP 请求 ==========
server.tool(
  'http_request',
  '发送 HTTP 请求到外部 API',
  {
    url: z.string().url().describe('请求 URL'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET').describe('HTTP 方法'),
    headers: z.record(z.string()).optional().describe('请求头'),
    body: z.any().optional().describe('请求体（JSON）'),
    timeout: z.number().int().min(1000).max(60000).default(30000).describe('超时时间（毫秒）'),
  },
  async ({ url, method, headers, body, timeout }) => {
    try {
      // 限流检查（全局限流）
      await rateLimiter.waitForToken('global');

      const response = await axios({
        method: method.toLowerCase() as any,
        url,
        headers: {
          'User-Agent': 'MCP-APIServer/1.0',
          'Accept': 'application/json',
          ...headers,
        },
        data: body,
        timeout,
        // 只响应 JSON
        responseType: 'json',
        validateStatus: (status) => status < 500, // 接受 4xx 作为有效响应
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: response.data,
          }, null, 2),
        }],
      };
    } catch (error) {
      if (error instanceof AxiosError) {
        return {
          content: [{
            type: 'text',
            text: `HTTP 请求失败: ${error.message}\n${error.response ? JSON.stringify(error.response.data) : ''}`,
          }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: `请求异常: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ========== 工具 2：GitHub API（预配置）==========
server.tool(
  'github_api',
  '调用 GitHub REST API（需要 GITHUB_TOKEN 环境变量）',
  {
    endpoint: z.string().describe('API 端点，如 /repos/owner/repo, /users/username'),
    method: z.enum(['GET', 'POST']).default('GET').describe('HTTP 方法'),
    params: z.record(z.any()).optional().describe('查询参数'),
  },
  async ({ endpoint, method, params }) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return {
        content: [{ type: 'text', text: '⛔ 未配置 GITHUB_TOKEN 环境变量' }],
        isError: true,
      };
    }

    try {
      await rateLimiter.waitForToken('github');

      const response = await axios({
        method: method.toLowerCase() as any,
        url: `https://api.github.com${endpoint}`,
        headers: {
          Authorization: `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'MCP-GitHubServer/1.0',
        },
        params,
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response.data, null, 2),
        }],
      };
    } catch (error) {
      if (error instanceof AxiosError) {
        return {
          content: [{
            type: 'text',
            text: `GitHub API 错误 [${error.response?.status}]: ${error.response?.data?.message || error.message}`,
          }],
          isError: true,
        };
      }
      throw error;
    }
  }
);

// ========== 工具 3：Slack 消息发送（示例）==========
server.tool(
  'send_slack_message',
  '发送消息到 Slack 频道',
  {
    webhookUrl: z.string().url().describe('Slack Webhook URL'),
    channel: z.string().optional().describe('频道名称（如 #general）'),
    text: z.string().describe('消息内容'),
    username: z.string().default('MCP Bot').describe('发送者名称'),
  },
  async ({ webhookUrl, channel, text, username }) => {
    try {
      await rateLimiter.waitForToken('slack');

      const payload: any = { text, username };
      if (channel) payload.channel = channel;

      const response = await axios.post(webhookUrl, payload);

      return {
        content: [{
          type: 'text',
          text: `✅ Slack 消息已发送: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Slack 发送失败: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 启动
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('🔌 API 集成 MCP Server 已启动');
```

---

## 四、安全综合实践

### 4.1 输入验证的黄金法则

**生活类比：** 机场安检有四个步骤——证件检查（类型验证）、行李扫描（范围检查）、人身检查（注入检测）、问询（语义验证）。我们的输入验证也应该有类似的四层防护：

```typescript
class InputValidator {
  /**
   * 四层输入验证
   */
  static validate(options: {
    value: any;
    type: 'string' | 'number' | 'array';
    schema: z.ZodSchema;
    sanitize?: boolean;
    maxLength?: number;
    allowedValues?: string[];
    pattern?: RegExp;
  }): { valid: boolean; sanitized?: any; error?: string } {
    // 第一层：类型检查（Zod 自动处理）
    const parsed = options.schema.safeParse(options.value);
    if (!parsed.success) {
      return { valid: false, error: `类型验证失败: ${parsed.error.message}` };
    }

    // 第二层：长度/范围检查
    if (options.maxLength && typeof options.value === 'string' && options.value.length > options.maxLength) {
      return { valid: false, error: `输入过长: 最多 ${options.maxLength} 字符` };
    }

    // 第三层：允许值白名单
    if (options.allowedValues && !options.allowedValues.includes(options.value)) {
      return { valid: false, error: `不允许的值: ${options.value}` };
    }

    // 第四层：正则模式匹配
    if (options.pattern && !options.pattern.test(options.value)) {
      return { valid: false, error: `输入格式不正确` };
    }

    // 可选的清理操作
    let sanitized = options.value;
    if (options.sanitize && typeof options.value === 'string') {
      sanitized = options.value
        .replace(/[<>]/g, '')     // 移除 HTML 标签
        .replace(/['"]/g, '');    // 移除引号
    }

    return { valid: true, sanitized };
  }
}
```

### 4.2 Server 安全清单

| 检查项 | 说明 | 实现方式 |
|--------|------|---------|
| ✅ 路径遍历防护 | 防止 `../../etc/passwd` | 路径标准化 + 白名单基路径 |
| ✅ SQL 注入防护 | 防止恶意 SQL 注入 | 参数化查询 + 关键字黑名单 |
| ✅ 命令注入防护 | 防止 `; rm -rf /` | 禁止执行系统命令 |
| ✅ 限流保护 | 防止滥用 | Rate Limiter + 令牌桶 |
| ✅ 超时控制 | 防止慢查询阻塞 | 设置超时时间 |
| ✅ 输入大小限制 | 防止内存溢出 | maxRequestSize + 最大行数 |
| ✅ 日志审计 | 记录所有操作 | 结构化日志 + 可追溯 |

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么文件系统 Server 要使用路径白名单而不是黑名单？**

> A：白名单策略遵循「默认拒绝」的安全原则——只有明确允许的路径才能访问。黑名单需要列举所有危险路径，但总有遗漏（比如用户自定义的敏感目录）。白名单则简单明确：我只允许你访问 `./projects/` 目录，其他一概拒绝。这就像小区保安只放行有门禁卡的业主，而不是列一个「禁止入内人员名单」。

**Q2：数据库 Server 禁止非 SELECT 查询后，如何支持写入操作？**

> A：对于只读需求的数据分析场景，禁止非 SELECT 是完全正确的。但如果确实需要写入，有两种方案：（1）再创建一个专门的「数据库写入 Server」，使用不同的 API Key，只给管理员使用；（2）在同一个 Server 中增加带认证的写入工具，但要求用户提供管理员凭证。核心原则是：**默认只读，写入需明确授权**。

**Q3：API 集成 Server 如何防止被当作代理攻击第三方？**

> A：三个关键措施：（1）URL 白名单——只允许调用预设的 API 域名列表，禁止任意 URL；（2）限流——对每个 API 目标限流，防止批量攻击；（3）请求日志——记录所有 API 调用，便于事后审计。同时不应允许用户自定义 headers 中的 Host 字段，防止 Host 头攻击。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 文件系统 Server 允许用户访问白名单之外的路径 | 路径验证只做了前缀匹配，未考虑 `../` 目录遍历攻击 | 使用路径正规化（`path.resolve`）后再进行白名单检查，拒绝包含 `..` 的路径 |
| 数据库 Server 的 SELECT 语句存在 SQL 注入风险 | 直接拼接用户输入的查询条件 | 使用参数化查询（Prepared Statement），绝不直接拼接用户输入到 SQL 语句中 |
| API 集成 Server 未做限流导致被第三方滥用 | 未设置请求频率限制，被恶意批量调用 | 实施令牌桶或滑动窗口限流算法，对每个 API Key 或 IP 设置调用限额 |
| 错误信息包含敏感信息（如数据库密码） | 直接返回原始错误对象，泄露内部细节 | 在 Server 侧捕获错误后使用通用错误消息返回，详细错误写入 Server 日志 |

---

## 📝 本章小结

- ✅ **文件系统 Server** — 路径安全防护、文件读写、目录浏览、搜索
- ✅ **数据库查询 Server** — SELECT-only 策略、SQL 注入防护、连接池管理
- ✅ **API 集成 Server** — 通用 HTTP、GitHub API、Slack 集成、限流保护
- ✅ **安全实践** — 四层输入验证、安全清单、审计日志
- ✅ **错误处理** — 友好的错误信息、分类错误码

## ➡️ 下一章预告

> [第6章：MCP Client 集成](./06-mcp-client.md) — 如何开发 MCP Client，连接多个 Server，实现工具编排。
