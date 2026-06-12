# 🔧 生产部署排错指南

> AI Agent 部署与运维中常见问题及解决方案（18 个常见错误）

---

## 1. Vercel Functions 超时

**错误信息：**
```
Error: Function timed out after 30 seconds
```

**原因分析：**
Vercel Hobby 计划的 Serverless Function 默认超时时间为 10 秒，Pro 计划为 60 秒（可提升到 300 秒）。Agent 的多步推理和 LLM 调用通常需要更长时间。

**解决方案：**

```typescript
// 1. 在路由文件中设置最大超时时间
export const maxDuration = 300; // Vercel Pro 最大支持 300 秒

// 2. 将长时间运行的任务拆分为异步
export async function POST(req: Request) {
  const { taskId } = await req.json();
  // 立即返回任务 ID，后台处理
  await enqueueTask(taskId);
  return Response.json({ taskId, status: 'processing' });
}
```

> **💡 为什么这样做？** Serverless Functions 设计为处理短请求，长任务应使用异步队列模式（如 BullMQ + Redis）避免超时。

---

## 2. AWS Lambda 冷启动慢

**错误信息：**
```
Task timed out after 3.00 seconds
```
（实际原因是冷启动耗时过长，而非代码逻辑问题）

**原因分析：**
Lambda 在长时间未调用后，需要重新加载运行时环境和代码包。Node.js 的 `require` 加载大量依赖、包体积过大（> 50MB）会显著增加冷启动时间。

**解决方案：**

```bash
# 1. 使用 esbuild 打包减少 Lambda 包体积
npm install esbuild
npx esbuild lambda/index.ts --bundle --platform=node --outfile=dist/lambda.js --minify

# 2. 配置 Provisioned Concurrency（预留并发）
# AWS 控制台 → Lambda → 配置 → 预留并发 → 设置 1-5 个实例

# 3. 使用 Keep-alive 定时触发
# CloudWatch Events → 每 5 分钟调用一次 Lambda
```

---

## 3. pgvector 向量查询性能差

**错误信息：**
```
Query returned: 10000 rows — Seq Scan on documents (cost=0.00..1000.00 rows=10000 width=16)
```

**原因分析：**
未创建向量索引或索引类型选择不当。PostgreSQL 会进行全表扫描而非近似最近邻搜索。

**解决方案：**

```sql
-- 1. 创建 IVFFlat 索引（适合大部分场景）
CREATE INDEX idx_docs_embedding ON documents
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 2. 或者使用 HNSW 索引（更精确，但构建和内存消耗更大）
CREATE INDEX idx_docs_hnsw ON documents
  USING hnsw (embedding vector_cosine_ops);

-- 3. 查看查询计划确认已使用索引
EXPLAIN ANALYZE
SELECT id, 1 - (embedding <=> $1::vector) AS similarity
FROM documents ORDER BY embedding <=> $1::vector LIMIT 10;
```

---

## 4. Docker 内存不足

**错误信息：**
```
WARNING: Memory limit exceeded — OOMKilled
```

**原因分析：**
Agent API 服务在并发处理多个 LLM 请求时，内存使用量激增。每个 LLM 调用会缓存 token 序列，多个并发请求叠加导致内存溢出。

**解决方案：**

```yaml
# docker-compose.yml — 设置内存限制
services:
  agent-api:
    build: .
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
    environment:
      - MAX_CONCURRENT_REQUESTS=5  # 限制并发数
```

```typescript
// 代码级限制并发数
import { Semaphore } from 'async-mutex';
const semaphore = new Semaphore(5);
async function runAgent(task: AgentTask) {
  const [_, release] = await semaphore.acquire();
  try {
    return await agent.invoke(task);
  } finally {
    release();
  }
}
```

---

## 5. Redis 连接池耗尽

**错误信息：**
```
Redis connection lost: Error: connect ETIMEDOUT
ioredis: Unhandled error event: Error: connect ETIMEDOUT
```

**原因分析：**
并发请求过高时，Redis 连接池中的连接被耗尽，新连接创建后未正确关闭导致连接泄漏。

**解决方案：**

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 200, 2000); // 指数退避
  },
  enableReadyCheck: true,
  lazyConnect: true,       // 延迟连接
  maxRetriesPerRequest: 5,
});

// 始终使用连接池而非创建新连接
// 在应用关闭时优雅退出
process.on('SIGTERM', async () => {
  await redis.quit();
});
```

---

## 6. API 认证失败

**错误信息：**
```
401 Unauthorized: Invalid or expired token
```

**原因分析：**
JWT token 过期、签名密钥不匹配、或者前端将 API Key 暴露到了浏览器端。

**解决方案：**

```typescript
// 1. 验证 JWT Token
import jwt from 'jsonwebtoken';
export function verifyToken(token: string) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new Error('Token 已过期，请重新登录');
    }
    throw new Error('无效的 Token');
  }
}

// 2. 确保 API Key 仅存在于服务端
// ❌ 错误：环境变量泄露到前端
// NEXT_PUBLIC_ANTHROPIC_API_KEY=sk-xxx
// ✅ 正确：仅服务端可访问
// ANTHROPIC_API_KEY=sk-xxx
```

---

## 7. 流式响应中断

**错误信息：**
```
TypeError: Cannot read properties of undefined (reading 'pipe')
FetchError: The user aborted a request.
```

**原因分析：**
客户端在网络不稳定时断开连接，但服务端仍然在继续生成 LLM 响应，导致资源浪费。或者 Serverless Function 超时导致流式传输被截断。

**解决方案：**

```typescript
// 服务端 — 监听客户端断开
export async function POST(req: NextRequest) {
  const abortController = new AbortController();
  req.signal.addEventListener('abort', () => {
    console.log('Client disconnected, aborting generation');
    abortController.abort();
  });
  
  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    messages,
    abortSignal: abortController.signal, // 传递取消信号
  });
  return result.toDataStreamResponse();
}
```

---

## 8. LLM API 限流（Rate Limit）

**错误信息：**
```
429 Too Many Requests
{
  "error": {
    "type": "rate_limit_error",
    "message": "You have exceeded your rate limit for this model."
  }
}
```

**原因分析：**
同一时间段内发送的请求超过了 API 提供商（如 Anthropic、OpenAI）的速率限制。

**解决方案：**

```typescript
import Bottleneck from 'bottleneck';

const limiter = new Bottleneck({
  maxConcurrent: 5,       // 最大并发
  minTime: 200,           // 每 200ms 最多一个请求
  reservoir: 80,          // 每分钟最多 80 个
  reservoirRefreshAmount: 80,
  reservoirRefreshInterval: 60 * 1000,
});

// 包装 API 调用
const rateLimitedInvoke = limiter.wrap(
  async (params: any) => await model.invoke(params)
);
```

---

## 9. Docker 容器健康检查失败

**错误信息：**
```
Container agent-api is unhealthy
```

**原因分析：**
Healthcheck 命令配置错误、应用实际端口与暴露端口不匹配、或者应用启动时间过长。

**解决方案：**

```dockerfile
# 使用 curl 替代 wget（更可靠）
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

```typescript
// 健康检查端点
app.get('/health', async (req, res) => {
  const dbOk = await checkDatabaseConnection();
  const redisOk = await checkRedisConnection();
  res.status(dbOk && redisOk ? 200 : 503).json({
    status: dbOk && redisOk ? 'healthy' : 'unhealthy',
    database: dbOk ? 'ok' : 'down',
    redis: redisOk ? 'ok' : 'down',
    uptime: process.uptime(),
  });
});
```

---

## 10. 数据库连接泄漏

**错误信息：**
```
Error: Connection pool exhausted — Cannot acquire a connection
```

**原因分析：**
数据库查询后未正确释放连接，导致连接池被消耗殆尽。常见于未使用 `try/finally` 或忘记调用 `pool.end()`。

**解决方案：**

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 20,                // 最大连接数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// 始终使用 async/await + try/finally
async function queryDatabase(sql: string, params: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release(); // 确保释放连接
  }
}
```

---

## 11. Agent 循环无终止

**错误信息：**
```
Error: Agent exceeded maximum recursion depth
```

**原因分析：**
Agent 在 ReAct 循环中反复调用工具，进入无限循环。可能是工具返回了无效结果或 Agent 无法做出决策。

**解决方案：**

```typescript
const workflow = new StateGraph<AgentState>({ channels: ['messages'] })
  .addNode('agent', agentNode)
  .addNode('tools', toolNode)
  .addEdge('__start__', 'agent');

// 设置最大迭代次数
workflow.addConditionalEdges('agent', (state) => {
  if (state.iterations >= 10) {
    return '__end__';  // 超过 10 次强制结束
  }
  return state.next || '__end__';
});
```

---

## 12. Vercel 环境变量部署失败

**错误信息：**
```
Error: The environment variable ANTHROPIC_API_KEY is not defined
```

**原因分析：**
代码在本地开发时使用 `.env.local` 文件，但部署到 Vercel 时未在 Vercel Dashboard 中设置环境变量。

**解决方案：**

```bash
# 1. 通过 CLI 设置
vercel env add ANTHROPIC_API_KEY

# 2. 通过 Vercel Dashboard
# Settings → Environment Variables → 添加

# 3. 批量同步本地变量
vercel env pull
```

---

## 13. 部署后页面白屏

**错误信息：**
```
Uncaught SyntaxError: Unexpected token '<'
```

**原因分析：**
前端构建后静态资源路径错误，导致浏览器请求 HTML 而非 JS/CSS 文件。通常是因为 `basePath` 或 `assetPrefix` 配置不正确。

**解决方案：**

```typescript
// next.config.ts
const config: NextConfig = {
  assetPrefix: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
  images: {
    unoptimized: true,
  },
};

// Vite 项目 — 设置正确的 base
// vite.config.ts
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/' : '/',
});
```

---

## 14. MCP Server 连接失败

**错误信息：**
```
Error: MCP server 'filesystem' not found
Transport closed before connection was established
```

**原因分析：**
MCP Server 配置文件路径错误、服务未启动、或者 stdio 传输的启动命令不正确。

**解决方案：**

```json
// .mcp.json — 检查配置
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "env": {}
    }
  }
}
```

```bash
# 手动测试 MCP Server 是否可用
npx -y @modelcontextprotocol/server-filesystem .
# 如果提示 "Listening on stdio"，说明配置正确
```

---

## 15. LLM Token 限制

**错误信息：**
```
Error: This message exceeds the maximum context length (200k tokens)
```

**原因分析：**
Agent 在多次工具调用和对话交互中积累了过多历史消息，超过了模型的上下文窗口限制。

**解决方案：**

```typescript
// 实现滑动窗口 — 保留最近的 N 条消息
function trimMessages(messages: Message[], maxTokens: number = 100000) {
  let totalTokens = 0;
  const trimmed = [];
  
  // 从最新的消息开始保留
  for (const msg of [...messages].reverse()) {
    const tokens = estimateTokens(msg.content);
    if (totalTokens + tokens > maxTokens) break;
    trimmed.unshift(msg);
    totalTokens += tokens;
  }
  
  // 始终保留系统提示
  const systemPrompt = messages.find(m => m.role === 'system');
  if (systemPrompt) trimmed.unshift(systemPrompt);
  
  return trimmed;
}
```

---

## 16. API 跨域（CORS）错误

**错误信息：**
```
Access to fetch at 'https://api.example.com' from origin 'https://app.example.com' has been blocked by CORS policy
```

**原因分析：**
前端和后端部署在不同的域名下，后端未正确配置 CORS 头。

**解决方案：**

```typescript
// Hono 框架
import { cors } from 'hono/cors';
app.use('/*', cors({
  origin: ['https://app.example.com', 'http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
  credentials: true,
}));
```

---

## 17. 生产成本失控

**错误信息：**
```
Billing alert: Your project has exceeded $500 budget
```

**原因分析：**
没有设置费用上限和监控告警，用户量增长或 API 调用激增导致成本超支。

**解决方案：**

```typescript
// 1. 设置用户级别的用量限制
const USER_DAILY_LIMIT = 100; // 每天最多 100 次请求
async function checkUserQuota(userId: string) {
  const count = await redis.get(`quota:${userId}:${today()}`);
  if (parseInt(count || '0') >= USER_DAILY_LIMIT) {
    throw new Error('今日使用额度已用完');
  }
  await redis.incr(`quota:${userId}:${today()}`);
}

// 2. 使用更便宜的模型进行非关键请求
const CHEAP_MODEL = 'claude-haiku' // 便宜 10 倍
const POWERFUL_MODEL = 'claude-opus'

function selectModel(taskComplexity: 'simple' | 'complex') {
  return taskComplexity === 'simple' ? CHEAP_MODEL : POWERFUL_MODEL;
}
```

---

## 18. 日志丢失

**错误信息：**
```
No logs found for function invocation
```

**原因分析：**
Serverless 平台在执行完成后丢弃日志，或者在异步任务中未正确配置日志传输。

**解决方案：**

```typescript
import winston from 'winston';
import 'winston-cloudwatch'; // AWS CloudWatch

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.cli(),
    }),
    // 生产环境添加外部日志服务
    ...(process.env.NODE_ENV === 'production' ? [
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
      }),
    ] : []),
  ],
});

// 全局未捕获异常
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', { error: err.message, stack: err.stack });
  process.exit(1);
});
```
