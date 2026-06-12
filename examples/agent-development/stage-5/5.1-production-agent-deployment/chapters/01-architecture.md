# 第1章：架构设计 — 前后端分离的 Agent 服务架构

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **设计生产级的 Agent 系统架构** — 前后端分离、服务分层
- **选择合适的部署方案** — Serverless vs 容器化 vs 长连接服务
- **规划数据库和缓存策略** — PostgreSQL + pgvector + Redis

## 📋 前置知识

> 建议先完成阶段 1-4 的所有内容，了解 Agent 的核心工作原理。

---

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

**生活类比：** 这个架构就像一家餐厅的运作方式。客户端层是「顾客」，API Gateway 是「前台接待」（认证身份、引路、限流），服务层是「厨房」（做菜），数据层是「仓库和冰箱」（存储原料）。

### 概念二：服务分层设计

**生活类比：** 服务分层就像一家医院的科室分工。API Gateway 是「挂号处」（分流病人），Chat API 是「门诊部」（看普通感冒），Agent API 是「手术室」（做大手术），RAG Service 是「检验科」（做化验）。每个科室有独立的医生和设备，互不干扰。如果门诊部病人太多，只需要增加门诊医生，不需要扩建手术室。

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

**💡 为什么要分层？** 每一层可以独立扩展。如果 Chat API 流量暴增，只需要扩容 Chat API 服务，不需要扩容数据库。如果 RAG 检索变慢，只需优化 RAG Service。分层让每个组件可以独立演进、独立部署。

### 概念三：数据库选型

**生活类比：** 数据库选型就像装修房子时选择合适的储物方案。PostgreSQL 是「定制衣柜」（能装各种东西、可定制结构），Redis 是「门口玄关柜」（随手放常用物品、拿取快），向量数据库是「专门的鞋柜」（专为特定物品设计、查找方便）。一个家通常需要多种储物方案组合使用，就像一个 Agent 系统通常需要多种数据库配合。

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
  await redis.setex(cacheKey, 3600, result);
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

**生活类比：** 选择部署方案就像选择出行方式。Serverless 是「打车」（随叫随到、按里程付费、不用自己保养车），Docker + K8s 是「自驾」（完全掌控路线和车辆、但需要驾照和保养），Vercel/Edge 是「共享单车」（短途最方便、但去不了太远的地方）。去机场（高流量场景）和去楼下便利店（低流量场景）需要不同的出行方式。

| 方案 | 适用场景 | 优点 | 缺点 |
|------|----------|------|------|
| **Serverless** | Chat API、短请求 | 零运维、按量付费、自动扩展 | 冷启动、超时限制 |
| **Docker + K8s** | Agent API、长任务 | 完全控制、支持长连接 | 运维成本高 |
| **Vercel/Edge** | 前端 + API Route | 一键部署、CDN | 功能限制 |

### 概念五：Docker 部署

**生活类比：** Docker 就像餐厅里的「标准餐盒」。不管你做什么菜（用什么编程语言），只要装进统一规格的餐盒（Docker 镜像），就可以用同样的配送流程（Docker 引擎）送到任何地方。多阶段构建就像「中央厨房做好半成品 → 配送到各分店再最后加热上桌」——既保证了菜品一致性，又减少了配送体积。

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

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  agent-api:
    build: .
    ports: ["3000:3000"]
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/agent_db
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: agent_db
      POSTGRES_PASSWORD: password
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

volumes:
  pgdata:
```

---

## 🔨 实战演练

**场景描述：** 你是一家初创 AI 公司的技术负责人。你们正在开发一个 AI 编程助手产品，预计发布后第一周就有 1000+ 并发用户使用。你的 CTO 要求你设计一个满足以下条件的生产架构：

1. 支持流式对话（用户输入后实时看到 AI 回复）
2. 月预算控制在 ¥500 以内
3. 有认证和限流机制，防止滥用
4. 能处理高峰期突发流量（10 倍于平时）

**你的任务：**

1. 画出架构图（客户端 → Gateway → 服务层 → 数据层）
2. 选择合适的部署方案（哪些用 Serverless？哪些用 Docker？）
3. 估算每月成本，列出各组件费用
4. 如果预算紧张，给出降级方案

<details>
<summary>🧑‍💻 先自己尝试设计，再展开看参考答案</summary>

### 参考答案

```
架构设计：
1. 前端：Next.js 部署在 Vercel（免费）
2. API Route：Vercel Serverless（免费额度足够）
3. 数据库：Supabase PostgreSQL + pgvector（免费额度）
4. 缓存：Upstash Redis（按请求计费）
5. Agent Worker：Vercel Functions（支持流式）

成本估算：
- Vercel: $0（免费额度）
- Supabase: $0（免费额度 500MB）
- Upstash: ~$10/月
- LLM API: ~$200/月（每天 500 次对话）
- 总计: ~$210/月 ≈ ¥1500/月

预算紧张方案：
- 使用 DeepSeek 替代 Claude（便宜 10 倍）
- 添加 Prompt Caching（节省 90% 系统提示成本）
- 总计可降到 ~$30/月 ≈ ¥200/月
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：API Gateway 聚合模式

当客户端需要同时从多个服务获取数据时，在 Gateway 层做聚合可以减少客户端请求次数：

```typescript
// 使用 Hono 实现 API Gateway
import { Hono } from 'hono';

const app = new Hono();

// 聚合端点：一次请求聚合 Chat + Agent + RAG 状态
app.get('/api/status', async (c) => {
  const [chatHealth, agentHealth, ragHealth] = await Promise.all([
    fetch('http://chat-service/health').then(r => r.json()).catch(() => ({ status: 'down' })),
    fetch('http://agent-service/health').then(r => r.json()).catch(() => ({ status: 'down' })),
    fetch('http://rag-service/health').then(r => r.json()).catch(() => ({ status: 'down' })),
  ]);

  return c.json({
    chat: chatHealth,
    agent: agentHealth,
    rag: ragHealth,
    timestamp: Date.now(),
  });
});
```

> **为什么用聚合模式？** 在前端 + Agent 应用中，一个用户操作可能触发多个后端服务调用。聚合模式可以将 N 次请求合并为 1 次，减少客户端网络开销和页面加载时间。

### 技巧二：数据库读写分离

将读操作和写操作分离到不同的数据库实例，提升并发性能：

```typescript
// read-write splitting
const writePool = new Pool({ connectionString: process.env.DATABASE_URL_PRIMARY! });
const readPool = new Pool({ connectionString: process.env.DATABASE_URL_REPLICA! });

async function query(sql: string, params: any[], isRead: boolean = false) {
  const pool = isRead ? readPool : writePool;
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// 写操作 → 主库
await query('INSERT INTO conversations (id, messages) VALUES ($1, $2)', [id, messages]);

// 读操作 → 从库
const result = await query('SELECT * FROM documents WHERE id = $1', [id], true);
```

### 技巧三：自动扩缩容策略

```yaml
# Kubernetes HPA — 基于自定义指标自动扩缩
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: agent-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: agent-api
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
    - type: Pods
      pods:
        metric:
          name: llm_request_queue_depth
        target:
          type: AverageValue
          averageValue: 10
```

---

## 🧠 知识检查点

<details>
<summary>🧠 Q1：生产级 Agent 系统架构通常分为哪几层？每层的职责是什么？</summary>

四层架构：
1. **客户端层** — 用户界面（Web/Mobile/API）
2. **API Gateway 层** — 认证、限流、路由、SSL 终止
3. **服务层** — 业务逻辑（Chat API / Agent API / RAG Service）
4. **数据层** — 持久化（PostgreSQL / Redis / 向量数据库 / 对象存储）

各层独立部署、独立扩展，某一层出问题不会导致整个系统崩溃。
</details>

<details>
<summary>🧠 Q2：在选择部署方案时，Serverless、Docker+K8s、Vercel/Edge 分别适用于什么场景？</summary>

- **Serverless** — 适用于短请求、突发流量场景（如 Chat API），优点：零运维、自动扩展；缺点：冷启动、超时限制
- **Docker + K8s** — 适用于长连接、有状态服务（如 Agent Worker），优点：完全控制、任意时长；缺点：运维成本高
- **Vercel/Edge** — 适用于前端 + API Route，优点：一键部署、全球 CDN；缺点：功能受限、平台锁定
</details>

<details>
<summary>🧠 Q3：PostgreSQL + pgvector 相比独立向量数据库（如 Pinecone）有什么优势和劣势？</summary>

优势：
- 一个数据库管理关系数据 + 向量数据，减少运维复杂度
- 不需要同步数据到外部服务（降低延迟和一致性风险）
- 免费（自托管），没有按量的向量存储费用

劣势：
- 向量检索性能不如专用向量数据库（特别是 > 100 万条记录时）
- 索引构建和维护需要手动管理
- 扩展性有限（垂直扩展为主）
</details>

<details>
<summary>🧠 Q4：在架构设计中，"服务分层"带来了哪些具体好处？</summary>

1. **独立扩展** — Chat API 流量暴增时只需扩容该服务，不影响数据库
2. **独立部署** — RAG Service 更新后只需重启该服务，不影响 Agent API
3. **技术栈灵活** — 不同服务可以使用不同的语言或框架
4. **故障隔离** — Redis 宕机不影响 PostgreSQL 的读写
5. **安全隔离** — API Gateway 层统一处理认证，内部服务无需重复实现
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 所有逻辑写在一个函数中导致超时 | 未将 Chat（短请求）和 Agent（长任务）分离到不同的服务 | 将 Chat API 放在 Serverless（短超时）、Agent API 放在 Worker（长超时） |
| 数据库连接数被耗尽 | 每个 Serverless 实例都创建了自己的连接池，总连接数超标 | 使用连接池中间件（如 PgBouncer）或限制最大并发连接 |
| 成本远超预算 | 部署时使用了最贵的模型（如 Claude Opus）且未设置用量限制 | 使用模型路由策略（简单请求用 Haiku，复杂请求用 Sonnet） |
| API 层和业务层耦合 | 认证、限流逻辑直接写在业务代码中 | 在 API Gateway 层统一处理横切关注点 |
| 忽略了冷启动对用户体验的影响 | 首次请求延迟 > 3 秒，用户流失 | 使用 Keep-alive ping、Edge Runtime 或 Provisioned Concurrency |
| 向量搜索引擎不回正确结果 | 未对文档做分块和清洗，直接喂入原始文本 | 实现文档预处理流水线（分块 → 清洗 → 嵌入 → 索引） |

---

## 📝 本章小结

- ✅ **架构分层** — Gateway → 服务层 → 数据层
- ✅ **部署方案** — Serverless（Chat API）、Docker（Agent API）
- ✅ **数据库** — PostgreSQL + pgvector（主库+向量）、Redis（缓存+队列）
- ✅ **成本控制** — 选择合适的模型和缓存策略

## ➡️ 下一章预告

> [第2章：Serverless 部署](./02-serverless.md) — Vercel Functions 和 AWS Lambda 实战。
