# 🚀 生产部署速查表

> AI Agent 生产部署核心知识点速查

---

## 📦 部署方案选择

| 方案 | 适用场景 | 命令/配置 |
|------|----------|-----------|
| **Vercel Functions** | 流式 Chat API、短请求 | `vercel --prod` / 设置 `maxDuration: 30` |
| **AWS Lambda** | 异步 Agent Worker | `serverless deploy` / 设置超时 `15min` |
| **Docker + K8s** | 长连接 Agent API | `docker compose up -d` / `kubectl apply -f deploy.yaml` |
| **Fly.io** | 轻量容器部署 | `fly launch` / `fly deploy` |

---

## 🏗️ 架构分层

```
客户端层 (Next.js/React Native)
    ↓
API Gateway (Nginx/Kong/AWS API Gateway) — 认证·限流·路由
    ↓
服务层: Chat API(Serverless) | Agent API(Worker) | RAG Service
    ↓
数据层: PostgreSQL+pgvector | Redis | 对象存储(S3/OSS)
```

### 认证方式

```typescript
// JWT 认证中间件
const authenticate = async (req: Request) => {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) throw new Error('Missing token');
  const payload = await jwt.verify(token, process.env.JWT_SECRET!);
  return payload;
};

// API Key 认证
const validateApiKey = async (key: string) => {
  const result = await db.query('SELECT * FROM api_keys WHERE key = $1', [key]);
  return result.rows.length > 0;
};
```

---

## 🗄️ 数据库

### PostgreSQL + pgvector

```sql
-- 创建文档表（含向量列）
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),        -- pgvector
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 向量索引（IVFFlat）
CREATE INDEX idx_docs_embedding ON documents
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 相似度查询
SELECT id, title, 1 - (embedding <=> $1::vector) AS similarity
FROM documents
ORDER BY embedding <=> $1::vector
LIMIT 5;
```

### Redis

```typescript
// 缓存模式
await redis.setex(`search:${query}`, 3600, JSON.stringify(result));

// 消息队列（Agent 异步任务）
await redis.lpush('agent:tasks', JSON.stringify(task));
const task = await redis.brpop('agent:tasks', 30);
```

---

## 🐳 Docker 多阶段构建

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
HEALTHCHECK --interval=30s --timeout=3s CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

---

## ☁️ Serverless 最佳实践

### Vercel Functions

```typescript
// app/api/chat/route.ts
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
export const maxDuration = 30; // Vercel Pro: 300s
export async function POST(req: NextRequest) {
  const { messages } = await req.json();
  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: '你是一个 AI 助手。',
    messages, maxSteps: 5,
  });
  return result.toDataStreamResponse();
}
```

### 冷启动优化

- **Keep-alive ping**：每 5 分钟发一次请求保持 warm
- **缩减包体积**：`npm prune --production`，使用 esbuild 打包
- **使用 Edge Runtime**（Vercel）：冷启动 < 50ms
- **Provisioned Concurrency**（AWS Lambda）：预留并发实例

---

## 📊 监控与日志

| 工具 | 用途 | 集成方式 |
|------|------|----------|
| **Sentry** | 错误追踪 | `npm install @sentry/node` + `Sentry.init()` |
| **OpenTelemetry** | 链路追踪 | `npm install @opentelemetry/sdk-node` |
| **Datadog** | 全栈监控 | `DD_API_KEY=xxx` + `datadog-agent` |
| **Winston** | 结构化日志 | `winston.createLogger({ level: 'info', format: winston.format.json() })` |

```typescript
// 结构化日志示例
import winston from 'winston';
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});
logger.info('Agent task started', { taskId, userId, model, duration: 0 });
```

---

## 💰 成本估算

| 组件 | 小型项目 | 中型项目 | 大型项目 |
|------|----------|----------|----------|
| Vercel | $0（免费） | $20/月（Pro） | $200/月（Enterprise） |
| Supabase | $0（免费） | $25/月 | $599/月 |
| Upstash Redis | $0（免费） | $10/月 | $50/月 |
| LLM API | $200/月 | $1,000/月 | $5,000+/月 |
| **合计** | **~$200/月** | **~$1,055/月** | **~$5,849+/月** |

### 省钱技巧

1. 使用 DeepSeek / Gemini 替代 Claude（便宜 5-10 倍）
2. 启用 Prompt Caching（节省 90% 系统提示成本）
3. 使用 Batch API（批量请求折扣 50%）
4. 设置用量上限和告警

---

## 🔐 安全最佳实践

```typescript
// 限流中间件
import { rateLimit } from '@upstash/ratelimit';
const limiter = new rateLimit({
  requests: 10,  // 每窗口 10 次
  window: '1m',   // 1 分钟
});

// 输入验证
import { z } from 'zod';
const ChatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })),
});

// API Key 保护 — 切勿在前端暴露
process.env.ANTHROPIC_API_KEY // 仅服务端使用
```

---

## 🚦 CI/CD 流水线

```yaml
# .github/workflows/deploy.yml
name: Deploy Agent API
on: push to main
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
  deploy:
    needs: test
    steps:
      - run: vercel --prod --token=${{ secrets.VERCEL_TOKEN }}
```
