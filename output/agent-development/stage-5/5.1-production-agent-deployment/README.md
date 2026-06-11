# 第1章：架构设计 — 前后端分离的 Agent 服务架构

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **设计生产级的 Agent 系统架构** — 前后端分离、服务分层
- **选择合适的部署方案** — Serverless vs 容器化 vs 长连接服务
- **规划数据库和缓存策略** — PostgreSQL + pgvector + Redis

## 💡 核心概念

### 概念一：生产架构全景

```
┌───────────────────────────────────────────────────────────────┐
│                        客户端层                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ Web App  │  │ Mobile   │  │ API 客户端│                   │
│  │(Next.js) │  │ (React   │  │ (第三方)  │                   │
│  │          │  │  Native) │  │          │                   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                   │
└───────┼─────────────┼─────────────┼──────────────────────────┘
        │             │             │
┌───────┴─────────────┴─────────────┴──────────────────────────┐
│                     API Gateway 层                            │
│  ┌──────────────────────────────────────────────────┐       │
│  │ Nginx / Kong / AWS API Gateway                   │       │
│  │ • 认证（JWT / API Key）                          │       │
│  │ • 限流（Rate Limiting）                          │       │
│  │ • 路由（Route to different services）             │       │
│  │ • SSL 终止                                       │       │
│  └──────────────────────────────────────────────────┘       │
└───────┬─────────────┬─────────────┬──────────────────────────┘
        │             │             │
┌───────┴──────┐┌─────┴──────┐┌────┴──────────────────────────┐
│   Chat API   ││ Agent API  ││       RAG Service              │
│  (Serverless)││ (Worker)   ││   (检索 + 生成)                │
│              ││            ││                                │
│ • 流式对话   ││ • 多步推理  ││ • 文档索引                     │
│ • 消息历史   ││ • 工具调用  ││ • 向量检索                     │
│ • 身份验证   ││ • 状态管理  ││ • 重排序                       │
└──────┬───────┘└─────┬──────┘└────┬──────────────────────────┘
       │              │            │
┌──────┴──────────────┴────────────┴──────────────────────────┐
│                     数据层                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │PostgreSQL│  │  Redis   │  │ 向量数据库 │  │ 对象存储  │    │
│  │ +pgvector│  │ (缓存+   │  │(Pinecone/ │  │ (S3/OSS) │    │
│  │ (主数据库)│  │  队列)   │  │ Milvus)   │  │          │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 概念二：服务分层设计

```typescript
// 每一层的职责

// 1. API Gateway 层 — 认证、限流、路由
interface GatewayConfig {
  auth: {
    type: 'jwt' | 'api-key';
    validate: (token: string) => Promise<User | null>;
  };
  rateLimit: {
    windowMs: number;     // 时间窗口
    maxRequests: number;  // 最大请求数
  };
  routes: Array<{
    path: string;
    service: string;
    methods: string[];
  }>;
}

// 2. Chat API — 处理对话请求
// 适合 Serverless（请求短、无状态）
interface ChatService {
  sendMessage(userId: string, conversationId: string, message: string): AsyncGenerator<string>;
}

// 3. Agent API — 处理复杂 Agent 任务
// 适合长连接 Worker（任务长、有状态）
interface AgentService {
  runTask(userId: string, task: string, config: AgentConfig): Promise<TaskResult>;
  getTaskStatus(taskId: string): Promise<TaskStatus>;
}

// 4. RAG Service — 检索增强生成
// 适合独立服务（CPU 密集、可独立扩展）
interface RAGService {
  indexDocument(doc: Document): Promise<void>;
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
}
```

### 概念三：数据库选型

```typescript
// PostgreSQL + pgvector — 主数据库 + 向量存储
// 一个数据库搞定关系数据和向量检索

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 创建表（包含向量列）
await pool.query(`
  CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),  -- pgvector 扩展
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- 向量索引
  CREATE INDEX IF NOT EXISTS idx_documents_embedding
    ON documents USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
`);

// 向量相似度查询
async function vectorSearch(queryEmbedding: number[], topK: number = 5) {
  const result = await pool.query(`
    SELECT id, title, content,
           1 - (embedding <=> $1::vector) as similarity
    FROM documents
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `, [JSON.stringify(queryEmbedding), topK]);

  return result.rows;
}
```

```typescript
// Redis — 缓存和消息队列
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// 缓存频繁查询结果
async function cachedSearch(query: string): Promise<string | null> {
  const cacheKey = `search:${query}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const result = await performSearch(query);
  await redis.setex(cacheKey, 3600, result); // 缓存 1 小时
  return result;
}

// 消息队列（Agent 异步任务）
async function enqueueTask(task: AgentTask) {
  await redis.lpush('agent:tasks', JSON.stringify(task));
}

async function dequeueTask(): Promise<AgentTask | null> {
  const task = await redis.brpop('agent:tasks', 30);
  return task ? JSON.parse(task[1]) : null;
}
```

### 概念四：部署方案对比

| 方案 | 适用场景 | 优点 | 缺点 |
|------|----------|------|------|
| **Serverless** | Chat API、短请求 | 零运维、按量付费、自动扩展 | 冷启动、超时限制 |
| **Docker + K8s** | Agent API、长任务 | 完全控制、支持长连接 | 运维成本高 |
| **Vercel/Edge** | 前端 + API Route | 一键部署、CDN | 功能限制 |

### 概念五：Serverless 部署（Vercel）

```typescript
// app/api/chat/route.ts — Next.js App Router

import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { NextRequest } from 'next/server';

// 配置最大执行时间（Vercel Pro 支持 300s）
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  // 认证
  const apiKey = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!apiKey) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages } = await req.json();

  // 流式响应
  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: '你是一个 AI 助手。',
    messages,
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
```

### 概念六：Docker 部署

```dockerfile
# 多阶段构建 — 生产级 Dockerfile
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
COPY --from=builder /app/package.json ./

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

```yaml
# docker-compose.yml — 完整的本地开发环境
version: '3.8'

services:
  agent-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/agent_db
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: agent_db
      POSTGRES_PASSWORD: password
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

---

## 🔨 实战演练

### 练习：设计一个聊天应用的后端架构

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```
需求：
- 支持 1000+ 并发用户
- 流式对话响应
- 对话历史持久化
- Agent 工具调用
- 月预算 500 元

架构设计：

1. 前端：Next.js 部署在 Vercel（免费）
2. API Route：Vercel Serverless（免费额度足够）
3. 数据库：Supabase PostgreSQL + pgvector（免费额度）
4. 缓存：Upstash Redis（按请求计费，便宜）
5. Agent Worker：使用 Vercel Functions（支持流式）

成本估算：
- Vercel: $0（免费额度）
- Supabase: $0（免费额度 500MB）
- Upstash: ~$10/月
- LLM API: ~$200/月（假设每天 500 次对话）
- 总计: ~$210/月 ≈ ¥1500/月

如果预算紧张：
- 使用 DeepSeek 替代 Claude（便宜 10 倍）
- 添加 Prompt Caching（节省 90% 系统提示成本）
- 总计可降到 ~$30/月 ≈ ¥200/月
```

</details>

---

## 📝 本章小结

- ✅ **架构分层** — Gateway → 服务层 → 数据层
- ✅ **部署方案** — Serverless（Chat API）、Docker（Agent API）
- ✅ **数据库** — PostgreSQL + pgvector（主库+向量）、Redis（缓存+队列）
- ✅ **成本控制** — 选择合适的模型和缓存策略

## ➡️ 下一章预告

> [第2章：Serverless 部署](./02-serverless.md) — Vercel Functions 和 AWS Lambda 实战。
