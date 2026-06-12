# 🚀 生产部署速查表

> AI Agent 生产部署核心知识点速查

## 📦 部署方案选择

| 方案 | 适用场景 | 命令/配置 |
|------|----------|-----------|
| **Vercel Functions** | 流式 Chat API | `vercel --prod` + `maxDuration: 30` |
| **AWS Lambda** | 异步 Agent Worker | `serverless deploy` + 超时 15min |
| **Docker + K8s** | 长连接 Agent API | `docker compose up -d` |
| **Fly.io** | 轻量容器部署 | `fly launch` / `fly deploy` |

## 🏗️ 架构分层
```
客户端层 → API Gateway（认证·限流·路由）→ 服务层（Chat/Agent/RAG）→ 数据层（PG+pgvector/Redis）
```

## 🗄️ 数据库速查

**pgvector HNSW 索引**（通用推荐）：
```sql
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);
```

**pgvector IVFFlat 索引**（> 100 万条）：
```sql
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

**Redis 缓存与队列**：
```typescript
await redis.setex(`cache:${key}`, 3600, result);  // 缓存
await redis.lpush('queue', task);                  // 队列
```

## 🐳 Docker 多阶段构建
```dockerfile
FROM node:20-alpine AS builder  # 阶段1：构建
COPY package*.json ./ && npm ci && COPY . . && npm run build
FROM node:20-alpine AS runner   # 阶段2：运行（仅产物）
COPY --from=builder /app/dist ./dist
```

## ☁️ Serverless 最佳实践
- **Vercel**: `export const maxDuration = 60;` 
- **冷启动优化**: 缩减包体积 + 全局变量复用
- **限流**: `Ratelimit.slidingWindow(10, '1 m')`

## 💰 成本估算
| 组件 | 小型 | 中型 |
|------|------|------|
| 部署平台 | $0 | $20-200 |
| LLM API | $200/月 | $1,000/月 |
| 省钱技巧 | DeepSeek + Prompt Caching 可降至 ~$30/月 |

## 🔐 安全
- API Key 不使用 `NEXT_PUBLIC_` 前缀
- 输入用 Zod 验证
- 使用 Upstash 分布式限流
