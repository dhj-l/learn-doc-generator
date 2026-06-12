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

**生活类比：** 这个架构就像一家餐厅的运作方式。客户端层是「顾客」，API Gateway 是「前台接待」（认证身份、引路、限流），服务层是「厨房」（做菜），数据层是「仓库和冰箱」（存储原料）。

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
│  • 认证（JWT / API Key）• 限流（Rate Limiting）               │
│  • 路由（Route to services）• SSL 终止                        │
└───────┬─────────────┬─────────────┬──────────────────────────┘
        │             │             │
┌───────┴──────┐┌─────┴──────┐┌────┴──────────────────────────┐
│   Chat API   ││ Agent API  ││       RAG Service              │
│  (Serverless)││  (Worker)  ││   (检索 + 生成)                │
│ • 流式对话   ││ • 多步推理  ││ • 文档索引                     │
│ • 消息历史   ││ • 工具调用  ││ • 向量检索                     │
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

---

### 概念二：服务分层设计

**生活类比：** 服务分层就像一家医院的科室分工。API Gateway 是「挂号处」（分流病人），Chat API 是「门诊部」（看普通感冒），Agent API 是「手术室」（做大手术），RAG Service 是「检验科」（做化验）。每个科室有独立的医生和设备，互不干扰。如果门诊部病人太多，只需要增加门诊医生，不需要扩建手术室。

```typescript
// 每一层的职责
interface GatewayConfig {
  auth: { type: 'jwt' | 'api-key'; validate: (token: string) => Promise<User | null> };
  rateLimit: { windowMs: number; maxRequests: number };
  routes: Array<{ path: string; service: string; methods: string[] }>;
}

interface ChatService {
  sendMessage(userId: string, convId: string, msg: string): AsyncGenerator<string>;
}

interface AgentService {
  runTask(userId: string, task: string, config: AgentConfig): Promise<TaskResult>;
}

interface RAGService {
  indexDocument(doc: Document): Promise<void>;
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
}
```

**💡 为什么要分层？** 每一层可以独立扩展。如果 Chat API 流量暴增，只需要扩容 Chat API 服务，不需要扩容数据库。如果 RAG 检索变慢，只需优化 RAG Service。分层让每个组件可以独立演进、独立部署。

---

### 概念三：PostgreSQL + pgvector — 向量索引的理论基础

**生活类比：** 向量索引就像图书馆的图书分类系统。IVFFlat 是「按楼层分类」——你把书放到对应的楼层（聚类），找书时只去该楼层找，速度快但不精确（如果书放错了楼层就找不到）。HNSW 是「社交网络式分类」——每本书和附近的几本书"交朋友"，找书时通过朋友的朋友的朋友不断缩小范围，像六度分隔理论，速度快且精确，但建立"朋友圈"需要更多时间。

#### IVFFlat vs HNSW：两种索引的深入对比

根据 pgvector 官方文档的说明：

| 维度 | IVFFlat（倒排文件） | HNSW（分层可导航小世界） |
|------|-------------------|------------------------|
| **原理** | 将向量聚类为 N 个列表，查询时只搜索最近的列表 | 构建多层图结构，顶层粗筛、底层精搜 |
| **构建速度** | 🟢 快（只需一次聚类） | 🟡 中等（需要构建图） |
| **查询速度** | 🟡 中等 | 🟢 极快（O(log n)） |
| **召回率** | 🟡 取决于 probes 参数 | 🟢 高（通常 > 99%） |
| **内存占用** | 🟢 低 | 🟡 较高（需存储图结构） |
| **适合场景** | > 100 万条，构建时间敏感 | 通用场景，追求高召回率 |

```sql
-- IVFFlat 索引（适合 > 100 万条记录的场景）
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- HNSW 索引（推荐用于通用场景）
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);

-- 查询（两者使用相同的 SQL）
SELECT id, content, 1 - (embedding <=> '[0.1, 0.2, 0.3]'::vector) AS similarity
FROM documents
ORDER BY embedding <=> '[0.1, 0.2, 0.3]'::vector
LIMIT 5;
```

**💡 为什么 HNSW 是默认推荐？** 根据 pgvector 官方建议，HNSW 在召回率和查询速度的平衡上表现最佳，适合大多数 AI Agent 场景。IVFFlat 仅在数据集非常大（> 100 万条）且对构建时间有严格要求时才更合适。

```typescript
// pgvector + Node.js 完整实现
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 创建带向量列的表
await pool.query(`
  CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),         -- 1536 维嵌入
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- HNSW 索引（推荐）
  CREATE INDEX IF NOT EXISTS idx_docs_hnsw
    ON documents USING hnsw (embedding vector_cosine_ops);
`);

// 向量相似度搜索
async function vectorSearch(queryEmbedding: number[], topK = 5) {
  const result = await pool.query(`
    SELECT id, title, content,
           1 - (embedding <=> $1::vector) AS similarity
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
```

---

### 概念四：部署方案对比

**生活类比：** 选择部署方案就像选择出行方式。Serverless 是「打车」（随叫随到、按里程付费、不用自己保养车），Docker + K8s 是「私家车」（完全掌控、但需要驾照和保养），Vercel/Edge 是「共享单车」（短途方便、但去不了远地方）。

| 方案 | 适用场景 | 优点 | 缺点 |
|------|----------|------|------|
| **Serverless** | Chat API、短请求 | 零运维、按量付费、自动扩展 | 冷启动、超时限制 |
| **Docker + K8s** | Agent API、长任务 | 完全控制、支持长连接 | 运维成本高 |
| **Vercel/Edge** | 前端 + API Route | 一键部署、CDN | 功能限制 |

---

### 概念五：Docker 多阶段构建 — 镜像优化的理论基础

**生活类比：** Docker 多阶段构建就像「中央厨房 + 分店配送」模式。第一阶段是中央厨房：采购所有食材（安装构建工具和依赖）、完成所有烹饪预处理（构建代码）。第二阶段是分店厨房：只接收已经做好的半成品（构建产物），不需要采购部门（构建工具）和仓储空间（源代码），因此分店厨房非常精简高效。

#### Docker 镜像 Layer 缓存原理

根据 Docker 官方文档，每个 Dockerfile 指令生成一个只读层（Layer），层叠构成最终镜像：

```dockerfile
# 多阶段构建 — 生产级 Dockerfile
# 阶段 1：构建（包含所有构建工具和依赖）
FROM node:20-alpine AS builder
WORKDIR /app
# Layer 缓存：先复制依赖文件（变化频率低）
COPY package*.json ./      # Layer 1：仅当 package.json 变化时重建
RUN npm ci                 # Layer 2：仅当 package.json 变化时重建
# 后复制源代码（变化频率高）
COPY . .                   # Layer 3：代码变更时重建
RUN npm run build          # Layer 4：代码变更时重建

# 阶段 2：运行（极简镜像，不包含构建工具）
FROM node:20-alpine AS runner
WORKDIR /app
# 安全：使用非 root 用户运行
RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app
USER app

# 只复制构建产物和必要文件
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

**💡 为什么多阶段构建这么重要？** 未优化前的 Node.js 镜像可能包含 TypeScript 编译器、devDependencies、源代码等，轻松超过 1GB。多阶段构建将最终镜像缩减到仅包含运行时所需的产物，通常可缩小到 150-300MB。更小的镜像意味着更快的拉取速度、更少的存储成本、更短的回滚时间。

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
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

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

```
架构设计：
1. 前端：Next.js 部署在 Vercel（免费）
2. API Route：Vercel Serverless（免费额度足够）
3. 数据库：Supabase PostgreSQL + pgvector（免费额度）
4. 缓存：Upstash Redis（按请求计费）
5. Agent Worker：Vercel Functions（支持流式）

成本估算：
- Vercel: $0（免费额度） / Supabase: $0 / Upstash: ~$10/月
- LLM API: ~$200/月（每天 500 次对话）
- 预算紧张：使用 DeepSeek + Prompt Caching → ~$200/月
```
</details>

---

## ⚡ 进阶技巧

### 技巧一：API Gateway 聚合模式
将多个服务的数据聚合到一个端点，减少客户端请求次数。

### 技巧二：数据库读写分离
读操作走从库，写操作走主库，提升并发性能。

### 技巧三：自动扩缩容（Kubernetes HPA）
基于 CPU/内存/自定义指标自动调整副本数。

---

## 🧠 知识检查点

<details>
<summary>🧠 Q1：生产级 Agent 系统架构通常分为哪几层？</summary>
四层：客户端层、API Gateway 层、服务层（Chat/Agent/RAG）、数据层（PostgreSQL/Redis/向量数据库）。
</details>
<details>
<summary>🧠 Q2：Serverless、Docker+K8s、Vercel/Edge 分别适用于什么场景？</summary>
Serverless：短请求突发流量；Docker+K8s：长连接有状态服务；Vercel/Edge：前端+轻API。
</details>
<details>
<summary>🧠 Q3：pgvector 的 HNSW 和 IVFFlat 索引有什么区别？</summary>
HNSW：图结构，O(log n) 查询，高召回率，推荐通用场景。IVFFlat：聚类索引，构建快，适合 > 100 万条记录。
</details>
<details>
<summary>🧠 Q4：Docker 多阶段构建为什么能减小镜像体积？</summary>
第一阶段使用完整环境构建，第二阶段只复制产物，不包含构建工具、源代码、devDependencies。
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 所有逻辑写在一个函数中导致超时 | 未分离短请求和长任务 | Chat 放 Serverless，Agent 放 Worker |
| 数据库连接数耗尽 | 每个实例创建独立连接池 | 使用 PgBouncer 或限制并发 |
| 成本远超预算 | 未设置用量限制 | 模型路由 + 每日预算上限 |
| 向量搜索返回错误结果 | 未对文档做分块和清洗 | 实现预处理流水线 |

---

## 📝 本章小结

- ✅ **架构分层** — Gateway → 服务层 → 数据层
- ✅ **部署方案** — Serverless（Chat API）、Docker（Agent API）
- ✅ **向量索引理论** — HNSW 适合通用场景，IVFFlat 适合超大规模
- ✅ **Docker 优化** — 多阶段构建可将镜像从 1GB 减至 150MB
- ✅ **成本控制** — 选择合适的模型和缓存策略

## ➡️ 下一章预告

> [第2章：Serverless 部署](./02-serverless.md) — Vercel Functions 和 AWS Lambda 实战。
