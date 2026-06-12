# 第3章：TypeScript SDK 深入 — 认证、错误处理与进度报告

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 MCP TypeScript SDK 的高级特性** — 在基础 Server 之上添加认证、错误处理和进度报告
- **实现安全的工具权限控制** — 使用 OAuth 和 API Key 保护 MCP Server
- **构建生产级别的错误处理体系** — 区分可恢复错误和致命错误，提供有意义的错误信息
- **实现进度报告** — 让长时间运行的操作向客户端报告进度

## 📋 前置知识

> 建议先完成：
> - [第2章：MCP Server 开发](./02-mcp-server.md) — 需要掌握基本的 Server 构建
> - 了解 TypeScript 装饰器和异步编程

---

## 💡 核心概念

### 为什么需要高级 SDK 特性？

**生活类比：** 你开了一家餐厅（你的 MCP Server），基础版本的餐厅只需要能点菜和上菜（基本的 Tools 和 Resources）。但当餐厅要规模化运营时，你需要：
- 🛂 **门禁系统（认证）** — 确保只有真正的顾客进店
- 🚑 **应急预案（错误处理）** — 厨房着火时知道如何应对
- 📊 **进度显示屏（进度报告）** — 让顾客知道他们的菜还要等多久

### 认证与授权

MCP Server 在默认情况下是"完全开放"的——任何能连接到它的 Client 都可以调用所有工具。在生产环境中，这显然是不可接受的。

```typescript
// 认证中间件的基础结构
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface AuthContext {
  userId: string;
  permissions: string[];
}

// 自定义认证函数
async function authenticateRequest(token: string): Promise<AuthContext> {
  // 验证 JWT Token
  const decoded = verifyJwt(token);
  if (!decoded) {
    throw new Error('认证失败：无效的 Token');
  }

  // 从数据库获取用户权限
  const userPermissions = await getUserPermissions(decoded.userId);
  return {
    userId: decoded.userId,
    permissions: userPermissions,
  };
}
```

**为什么需要显式的认证？** LLM 调用工具时，工具本身无法区分「合法的用户请求」和「注入攻击」。通过认证中间件，我们可以在每个工具调用前验证身份。

### 三种认证方案对比

| 方案 | 复杂度 | 安全等级 | 适用场景 |
|------|--------|----------|----------|
| **API Key** | 低 | ⭐⭐⭐ | 内部工具、开发环境 |
| **JWT Token** | 中 | ⭐⭐⭐⭐ | B2B 集成、多用户 |
| **OAuth 2.0** | 高 | ⭐⭐⭐⭐⭐ | 公开服务、第三方集成 |

```typescript
// 方案 1：API Key 认证（最简单）
const API_KEYS = new Map([
  ['sk-prod-xxx', { client: 'alice', rate: 100 }],
  ['sk-prod-yyy', { client: 'bob', rate: 50 }],
]);

server.tool(
  'sensitive_query',
  '执行敏感查询（需要 API Key）',
  {
    apiKey: z.string().describe('API Key'),
    query: z.string().describe('查询语句'),
  },
  async ({ apiKey, query }) => {
    const client = API_KEYS.get(apiKey);
    if (!client) {
      return { content: [{ type: 'text', text: '错误：无效的 API Key' }], isError: true };
    }
    // 执行查询...
  }
);
```

**💡 为什么不直接推荐 OAuth？** 对于大多数 Agent 工具场景，MCP Server 是「工具而非用户系统」——API Key 或 JWT 认证足够保护工具访问，OAuth 的复杂度往往超过收益。

### 错误处理体系

MCP SDK 提供了结构化的错误处理机制。理解不同类型错误的处理方式，是构建可靠 Server 的关键。

```typescript
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// 错误类型分类
class AppError extends McpError {
  constructor(
    code: ErrorCode,
    message: string,
    public readonly isRetryable: boolean,
    public readonly details?: Record<string, unknown>
  ) {
    super(code, message);
  }
}

// 1. 输入验证错误 — 告诉 LLM 参数不对，让它重新生成
const ValidationError = (field: string, reason: string) =>
  new AppError(ErrorCode.InvalidParams, `参数 ${field} 无效: ${reason}`, false);

// 2. 内部错误 — 可能是临时性的，让 LLM 重试
const InternalError = (message: string) =>
  new AppError(ErrorCode.InternalError, message, true);

// 3. 资源不存在 — 告诉 LLM 换一个资源
const NotFoundError = (resource: string) =>
  new AppError(ErrorCode.ResourceNotFound, `找不到资源: ${resource}`, false);

// 4. 速率限制 — 让 LLM 等待后重试
const RateLimitError = (retryAfter: number) =>
  new AppError(
    ErrorCode.RequestRateLimited,
    `请求过于频繁，请在 ${retryAfter} 秒后重试`,
    true,
    { retryAfter }
  );
```

**💡 为什么错误要有 retryable 标记？** LLM 需要知道一个错误是「重试可能成功」还是「重试也没用」。比如「数据库连接超时」重试可能解决，但「无效参数」重试一万次也解决不了。

### 使用错误处理的完整工具

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'robust-server',
  version: '2.0.0',
});

server.tool(
  'fetch_user_data',
  '获取指定用户的数据（包含完整错误处理）',
  {
    userId: z.string().min(1, '用户 ID 不能为空'),
    includePrivate: z.boolean().default(false),
  },
  async ({ userId, includePrivate }) => {
    try {
      // 步骤 1：参数校验
      if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
        return {
          content: [{ type: 'text', text: `参数错误：用户 ID "${userId}" 包含非法字符，只允许字母、数字、下划线和连字符。` }],
          isError: true,
        };
      }

      // 步骤 2：数据加载
      const user = await db.users.findById(userId);
      if (!user) {
        return {
          content: [{
            type: 'text',
            text: `未找到用户：用户 ID "${userId}" 不存在。请先确认用户已注册。`,
          }],
          isError: true,
        };
      }

      // 步骤 3：权限检查
      if (includePrivate && !user.hasPermission('view_private')) {
        return {
          content: [{ type: 'text', text: '权限不足：当前用户无权查看私人信息。' }],
          isError: true,
        };
      }

      // 步骤 4：返回成功结果
      const result = includePrivate ? user : { id: user.id, name: user.name, email: user.email };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };

    } catch (error) {
      // 步骤 5：捕获非预期错误
      return {
        content: [{
          type: 'text',
          text: `内部错误：获取用户数据时遇到意外错误。请稍后重试。\n错误详情: ${(error as Error).message}`,
        }],
        isError: true,
      };
    }
  }
);
```

### 进度报告

当工具执行长时间运行的操作时（如文件上传、批量处理、AI 推理），让客户端知道进度是很重要的。

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const server = new McpServer({
  name: 'progress-server',
  version: '1.0.0',
});

server.tool(
  'batch_process',
  '批量处理文件并报告进度',
  {
    filePaths: z.array(z.string()).min(1).max(50).describe('要处理的文件路径列表'),
    operation: z.enum(['compress', 'analyze', 'convert']).describe('处理操作'),
  },
  async ({ filePaths, operation }, extra) => {
    // extra.request 包含进度报告能力
    const total = filePaths.length;
    const results: Array<{ file: string; status: string }> = [];

    for (let i = 0; i < total; i++) {
      const filePath = filePaths[i];

      try {
        // 处理单个文件
        await processFile(filePath, operation);
        results.push({ file: filePath, status: '✅ 成功' });
      } catch (error) {
        results.push({ file: filePath, status: `❌ 失败: ${(error as Error).message}` });
      }

      // 报告进度
      const progress = Math.round(((i + 1) / total) * 100);
      await extra.request.notification({
        method: 'notifications/progress',
        params: {
          progress,       // 当前进度 (0-100)
          total,          // 总数
          message: `正在处理第 ${i + 1}/${total} 个文件: ${filePath}`,
        },
      });
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }
);

async function processFile(filePath: string, operation: string): Promise<void> {
  // 模拟文件处理
  await new Promise(resolve => setTimeout(resolve, 500));

  if (operation === 'compress') {
    // 执行压缩逻辑
  } else if (operation === 'analyze') {
    // 执行分析逻辑
  } else if (operation === 'convert') {
    // 执行转换逻辑
  }
}
```

**💡 为什么要实现进度报告？** Agent 在长时间等待工具响应时，如果没有进度反馈，用户会困惑——"Agent 是不是卡住了？" 有了进度报告，Agent 可以实时告诉用户「正在处理第3/10个文件」，大幅提升体验。

---

## 🔨 实战演练

### 练习：构建一个带认证的 API 聚合 MCP Server

**场景描述：** 你是一个 SaaS 平台的开发者，需要为 AI Agent 提供一个统一的 API 聚合服务。这个 Server 需要接入 GitHub API 和 Slack API，并且只有持有有效 API Key 的 Agent 才能使用。

**你的任务：**
1. 创建一个 MCP Server，使用 API Key 认证
2. 实现两个工具：`get_github_repo` 和 `send_slack_message`
3. 添加完整的错误处理和速率限制
4. 为长时间运行的批量操作添加进度报告

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// 模拟 API Key 数据库
const API_KEYS = new Map<string, { client: string; tier: 'free' | 'pro' }>([
  ['sk-prod-001', { client: 'Team Alpha', tier: 'pro' }],
  ['sk-prod-002', { client: 'Team Beta', tier: 'free' }],
]);

// 速率限制追踪
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(apiKey: string, maxRequests: number): boolean {
  const now = Date.now();
  const record = rateLimits.get(apiKey);

  if (!record || now > record.resetAt) {
    rateLimits.set(apiKey, { count: 1, resetAt: now + 60_000 }); // 每分钟重置
    return true; // 未超限
  }

  if (record.count >= maxRequests) {
    return false; // 超限
  }

  record.count++;
  return true;
}

const server = new McpServer({
  name: 'api-aggregator',
  version: '1.0.0',
  description: '统一的 API 聚合服务 — GitHub + Slack',
});

// 工具 1：获取 GitHub 仓库信息
server.tool(
  'get_github_repo',
  '获取 GitHub 仓库的详细信息',
  {
    apiKey: z.string().describe('API Key（用于认证和计费）'),
    owner: z.string().describe('仓库所有者'),
    repo: z.string().describe('仓库名称'),
  },
  async ({ apiKey, owner, repo }, extra) => {
    // 1. 认证检查
    const client = API_KEYS.get(apiKey);
    if (!client) {
      return { content: [{ type: 'text', text: '认证失败：无效的 API Key。请检查你的 API Key 是否正确。' }], isError: true };
    }

    // 2. 速率限制（Pro 用户 60次/分钟，Free 用户 10次/分钟）
    const maxRequests = client.tier === 'pro' ? 60 : 10;
    if (!checkRateLimit(apiKey, maxRequests)) {
      return {
        content: [{ type: 'text', text: `速率限制：你的账户 (${client.tier}) 每分钟最多 ${maxRequests} 次请求，请稍后重试。` }],
        isError: true,
      };
    }

    // 3. 模拟进度报告
    await extra.request.notification({
      method: 'notifications/progress',
      params: { progress: 30, message: `正在查询 GitHub 仓库 ${owner}/${repo}...` },
    });

    try {
      // 模拟 API 调用
      const mockData = {
        owner,
        repo,
        stars: repo.length * 100 + owner.length * 50,
        language: 'TypeScript',
        description: `A sample repository for ${repo}`,
        topics: ['agent', 'mcp', 'ai'],
      };

      await extra.request.notification({
        method: 'notifications/progress',
        params: { progress: 80, message: '格式化数据中...' },
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(mockData, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `GitHub API 错误：${(error as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 工具 2：发送 Slack 消息
server.tool(
  'send_slack_message',
  '发送消息到 Slack 频道',
  {
    apiKey: z.string().describe('API Key'),
    channel: z.string().describe('Slack 频道名称（如 #general）'),
    message: z.string().min(1).max(4000).describe('消息内容（最多 4000 字符）'),
  },
  async ({ apiKey, channel, message }) => {
    const client = API_KEYS.get(apiKey);
    if (!client) {
      return { content: [{ type: 'text', text: '认证失败：无效的 API Key。' }], isError: true };
    }

    if (!channel.startsWith('#')) {
      return { content: [{ type: 'text', text: '参数错误：频道名称必须以 # 开头，如 #general' }], isError: true };
    }

    // 模拟发送
    return {
      content: [{
        type: 'text',
        text: `✅ 消息已成功发送到 ${channel}\n消息内容：${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`,
      }],
    };
  }
);

// 启动 Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('API 聚合 MCP Server 已启动');
}

main().catch(console.error);
```

**预期输出：**
```
$ 调用 get_github_repo
🔄 正在查询 GitHub 仓库 vercel/next.js...
🔄 格式化数据中...
{
  "owner": "vercel",
  "repo": "next.js",
  "stars": 1400,
  "language": "TypeScript",
  "description": "A sample repository for next.js",
  "topics": ["agent", "mcp", "ai"]
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧 1：使用中间件模式组织认证逻辑

```typescript
type ToolHandler<T> = (args: T, auth: AuthContext) => Promise<{ content: any[]; isError?: boolean }>;

function withAuth<T>(handler: ToolHandler<T>) {
  return async (args: T & { apiKey: string }, extra: any) => {
    const auth = await authenticateRequest(args.apiKey);
    if (!auth) {
      return { content: [{ type: 'text', text: '认证失败' }], isError: true };
    }
    return handler(args, auth);
  };
}

// 使用
server.tool('sensitive_action', schema, withAuth(async (args, auth) => {
  // 已经通过了认证
  if (!auth.permissions.includes('admin')) {
    return { content: [{ type: 'text', text: '需要管理员权限' }], isError: true };
  }
  // 执行操作...
}));
```

### 技巧 2：结构化日志记录

```typescript
interface LogEntry {
  timestamp: string;
  toolName: string;
  userId: string;
  args: Record<string, unknown>;
  result: 'success' | 'error';
  duration: number;
}

async function logToolCall(entry: LogEntry) {
  // 写入日志文件或发送到监控系统
  console.error(JSON.stringify(entry));
}

// 在工具处理函数中使用
const start = Date.now();
try {
  const result = await handler(args);
  await logToolCall({
    timestamp: new Date().toISOString(),
    toolName: 'read_file',
    userId: auth.userId,
    args: { path: args.path },
    result: 'success',
    duration: Date.now() - start,
  });
  return result;
} catch (error) {
  await logToolCall({
    timestamp: new Date().toISOString(),
    toolName: 'read_file',
    userId: auth.userId,
    args: { path: args.path },
    result: 'error',
    duration: Date.now() - start,
  });
  throw error;
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：MCP SDK 中 isError: true 和抛出 McpError 有什么区别？**

> A：`isError: true` 是「优雅的错误」——工具正常返回，但内容标记为错误，LLM 可以读取错误信息并决定下一步。抛出 `McpError` 是「协议级错误」——表示 Server 本身出了问题，Client 需要处理这个异常。对于 LLM 可以自行处理的业务错误（如「找不到用户」），应该用 isError。对于 Server 崩溃、协议解析失败，应该抛出 McpError。

**Q2：进度报告中的 progress 值为什么推荐使用整数？**

> A：MCP 协议中的 progress 字段是 `number` 类型，但使用 0-100 的整数更符合直觉，Client 端可以直接渲染为百分比进度条。浮点数（如 33.333%）在小数点精度上可能产生歧义，整数则无此问题。

**Q3：为什么 API Key 认证适合 MCP Server 而不是 OAuth？**

> A：MCP Server 是「工具层」而非「用户层」。大多数场景中，是 Agent（而非终端用户）在调用工具。API Key 只需要一个 header 或参数，实现简单且无重定向流程。OAuth 的授权码流程需要浏览器交互，这在纯 API 调用场景中无法工作。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 认证成功后仍然报权限错误 | 认证和授权混为一谈 | 分离两个阶段：认证（你是谁）→ 授权（你能做什么） |
| 工具重试导致多次写入 | LLM 在 isError 时重试了工具 | 在工具中添加幂等性检查（Idempotency Key） |
| 进度报告永远到不了 100% | 进度计算在错误时中断 | 在 finally 块中始终将进度设为 100% |
| SDK 版本不匹配导致传输错误 | @modelcontextprotocol/sdk 版本差异 | 统一 Server 和 Client 的 SDK 版本 |
| Token 在工具调用中泄露 | API Key 被写入了日志 | 使用 `[REDACTED]` 替换敏感参数后再记录日志 |

---

## 📝 本章小结

- ✅ **认证模式** — API Key（简单快速）、JWT（多用户场景）、OAuth（三方集成）
- ✅ **错误处理体系** — 区分可恢复错误（isError）和协议错误（McpError）
- ✅ **进度报告** — 通过 `extra.request.notification` 向客户端反馈长任务进度
- ✅ **中间件模式** — 用 `withAuth` 包装器复用认证逻辑
- ✅ **结构化日志** — 记录每个工具调用的完整审计轨迹

## ➡️ 下一章预告

> 在下一章中，我们将深入学习 MCP 的传输协议——stdio、HTTP SSE 和 Streamable HTTP 的区别与选择，为构建远程 MCP Server 打下基础。
> [第4章：传输协议](./04-transport.md)
