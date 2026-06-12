# 第2章：Serverless 部署 — Vercel Functions 与 AWS Lambda

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **在 Vercel Functions 上部署流式 AI API** — 使用 Next.js App Router 构建流式对话端点
- **使用 AWS Lambda 部署 Agent Worker** — 处理长时间运行的异步 Agent 任务
- **理解 Serverless 执行环境的底层原理** — 冷启动、执行生命周期、并发模型
- **设置限流、认证和监控** — 生产级 Serverless 应用的必备设施

## 📋 前置知识

> 建议先完成 [第1章：架构设计](./01-architecture.md)，了解生产架构的分层设计原则。
> 特别是以下知识点：
> - API Gateway 的作用和认证方式
> - 服务分层（Chat API / Agent API / RAG Service）
> - Docker 和 Serverless 的适用场景对比

---

## 💡 核心概念

### 概念一：Vercel Functions — Serverless 执行模型

**生活类比：** Vercel Functions 就像一家「快闪餐厅」——你不需要租店铺（管理服务器），只需要准备好菜品（代码），平台会在客人下单时临时开设档口。每个档口从开张到打烊遵循清晰的流程：布置摊位（初始化运行时）→ 接单做菜（执行请求）→ 收拾关张（清理资源）。如果客人太多，它会自动开更多档口——这就是 Serverless 的弹性伸缩。

#### 服务器模型详解

Vercel Functions 基于 Serverless 架构，其核心执行模型包含三个关键维度：

**1. 执行环境（Execution Environment）**

每个 Function 在独立的容器中运行，Vercel 使用 Fluid Compute 技术优化 AI 工作负载。函数配置支持以下参数：

```typescript
// Vercel ServerlessFunctionConfig 核心参数
interface ServerlessFunctionConfig {
  handler: string;           // 入口文件路径
  runtime: string;           // 运行时（如 nodejs20.x）
  memory?: number;           // 内存分配（MB），影响 CPU 分配
  maxDuration?: number;      // 最大执行时间（秒）
  regions?: string[];        // 部署区域
  supportsResponseStreaming?: boolean;  // 是否支持流式响应
}
```

**2. 并发模型**

Vercel Functions 的并发处理机制：

```
每个实例 → 同时处理 1 个请求
并发请求数 = 活跃实例数

流量突发时：
  请求 A → 实例 1（冷启动 ~500ms）
  请求 B → 实例 2（冷启动 ~500ms）
  请求 C → 实例 3（冷启动 ~500ms）
  
冷启动后：
  请求 D → 实例 1（热启动 ~10ms）✅
  请求 E → 实例 2（热启动 ~10ms）✅
```

**3. 响应流式传输（Response Streaming）**

```typescript
// 启用流式响应 — 关键配置
export const maxDuration = 60;
// supportsResponseStreaming 在 Vercel 中默认启用

export async function POST(req: NextRequest) {
  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    messages: await req.json(),
  });

  // toDataStreamResponse() 自动处理流式传输
  // 使用 chunked transfer encoding
  return result.toDataStreamResponse();
}
```

> **💡 为什么 Vercel Functions 能支持流式？** Vercel 在基础设施层面支持 `Transfer-Encoding: chunked`，允许函数在响应过程中持续推送数据。传统的 Serverless 函数要求完整响应后一次性返回，而流式支持让 AI 应用可以在生成过程中实时推送 token，大幅提升用户体验。

```typescript
// 生产级的流式 API 实现（完整版）
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const maxDuration = 60;   // Vercel Pro 最大 300s
export const runtime = 'nodejs'; // Node.js 运行时支持流式

export async function POST(req: NextRequest) {
  // 1. 认证检查
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. 限流检查（使用 Upstash Redis）
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, '1 m'),
  });
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return new Response('Rate limit exceeded', { status: 429 });
  }

  // 3. 流式调用 LLM
  const { messages } = await req.json();
  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: '你是一个专业的 AI 助手。请用中文回答，保持简洁专业。',
    messages,
    maxSteps: 5,
    onError: (error) => {
      console.error('Stream error:', error);
    },
  });

  return result.toDataStreamResponse();
}
```

**预期输出：** 用 curl 测试流式响应：

```bash
curl -X POST https://your-app.vercel.app/api/chat \
  -H "Authorization: Bearer sk-xxx" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}]}'

# 流式响应（逐块到达）
data: {"content":"你好！"}
data: {"content":"你好！我是 AI 助手"}
data: {"content":"你好！我是 AI 助手，有什么可以帮你的？"}
```

---

### 概念二：AWS Lambda — 执行环境生命周期

**生活类比：** Lambda 的执行环境就像一间「酒店房间」。客人入住（调用）时，酒店需要先打扫房间、铺好床单（初始化运行时和依赖），然后客人才能入住（执行代码）。如果客人连续入住（频繁调用），房间保持 ready 状态，新客人可以立即入住（热启动）。但如果房间空置太久，酒店会回收房间（销毁环境）。这就是为什么冷启动只在长时间未调用后发生。

#### 执行环境的三阶段生命周期

根据 AWS 官方文档，Lambda 执行环境遵循严格的创建→使用→回收的生命周期：

```
阶段 1: INIT（初始化）
  ├── 下载代码包（从 S3 拉到执行环境）
  ├── 解压并加载运行时（Node.js 引擎）
  ├── 运行全局初始化代码（handler 外部的代码）
  └── 耗时：100ms ~ 3s（取决于包大小）

阶段 2: INVOKE（调用）
  ├── 执行 handler 函数
  ├── 复用已初始化的全局资源（连接池、客户端）
  └── 耗时：取决于业务逻辑

阶段 3: SHUTDOWN（回收）
  ├── 环境空闲约 5-15 分钟后触发
  ├── 运行时被完全销毁
  └── 下次调用重新从 INIT 阶段开始
```

```json
// Lambda 平台日志 — 显示冷启动耗时
{
  "time": "2024-08-20T12:31:32.123Z",
  "type": "platform.report",
  "record": {
    "requestId": "6f7f0961f83442118a7af6fe80b88d56",
    "metrics": {
      "durationMs": 101.51,       // 实际执行时间
      "billedDurationMs": 300,    // 计费时间（向上取整到 100ms）
      "memorySizeMB": 512,        // 配置的内存
      "maxMemoryUsedMB": 33,      // 实际使用内存
      "initDurationMs": 116.67    // 冷启动初始化时间 ⚠️
    }
  }
}
```

**💡 为什么冷启动在 Agent 场景中更严重？** Agent 任务通常需要多次 LLM 调用和工具执行，总时长可能达到 2-5 分钟。如果 Lambda 在任务执行中途被回收（因为达到了空闲超时），整个 Agent 状态会丢失。因此对于长时间 Agent 任务，需要配合 Provisioned Concurrency 使用。

#### 冷启动优化策略

```typescript
// 方案一：延迟加载 — 将非关键依赖放到运行时加载
let heavyClient: HeavyClient;

async function getHeavyClient(): Promise<HeavyClient> {
  if (!heavyClient) {
    // 只在第一次调用时加载，后续复用
    const { HeavyClient } = await import('heavy-lib');
    heavyClient = new HeavyClient();
  }
  return heavyClient;
}

// 方案二：连接池复用 — handler 外部初始化
let cachedDb: Pool;

function getDb(): Pool {
  if (!cachedDb) {
    cachedDb = new Pool({
      connectionString: process.env.DATABASE_URL!,
      max: 1, // Lambda 每个实例只处理 1 个请求
    });
  }
  return cachedDb;
}

// 方案三：缩减包体积 — 使用 esbuild 打包
// package.json 中添加构建脚本
// "build": "esbuild lambda/index.ts --bundle --platform=node --outfile=dist/lambda.js --minify"

export const handler: Handler = async (event) => {
  const db = getDb();     // 冷调用时初始化
  const client = await getHeavyClient(); // 延迟加载
  // ... 执行业务逻辑
};
```

**预期优化效果：**
```
优化前冷启动：~3.2 秒（包含所有依赖加载）
优化后冷启动：~0.8 秒（延迟加载 + 连接池复用）
提升幅度：75%
```

---

### 概念三：Provisioned Concurrency — 消除冷启动的终极方案

**生活类比：** Provisioned Concurrency 就像机场的「VIP 快速通道」。普通旅客（标准 Lambda）每次过安检都要排队等待（冷启动），而 VIP 通道（预置并发）始终有工作人员 standby，旅客到了就能直接通过。当然，保留这条 VIP 通道需要付费——即使没有旅客通过，staff 的工资也要照付。

```bash
# 配置 Provisioned Concurrency
# AWS CLI 或控制台设置
aws lambda put-provisioned-concurrency-config \
  --function-name agent-worker \
  --qualifier prod \
  --provisioned-concurrent-executions 5

# 成本说明：
# 标准 Lambda：每 100ms 计费
# Provisioned：额外收取预置实例的闲置费用
# 适用于：对延迟敏感的生产工作负载
```

```typescript
// 检测是否发生了冷启动（从日志判断）
export const handler: Handler = async (event) => {
  const startTime = Date.now();

  // 如果这是新实例，getDb() 会花较长时间
  const db = getDb();

  const initTime = Date.now() - startTime;
  console.log('Init duration:', initTime > 100 ? 'COLD START' : 'WARM START', initTime + 'ms');

  // ... 业务逻辑
};
```

> **💡 什么场景该用 Provisioned Concurrency？** 只有交互式工作负载（如 Web API、聊天机器人）才需要。异步数据处理（如批量文档处理）对秒级的冷启动不敏感，不需要额外付费。

---

### 概念四：限流与成本控制

**生活类比：** 限流就像游乐园的「快速通行证」系统——如果所有人都同时涌入一个热门项目，会导致排队混乱甚至安全事故。限流就是给每个游客发一个时间段的票，确保整体流量在可控范围内。在 Serverless 架构中，限流不仅防止服务过载，更重要的是防止 LLM API 费用失控。

```typescript
// 分布式限流 — Upstash Redis + Sliding Window
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// 基于 IP 的用户限流
const userLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 每分钟 10 次
  prefix: '@upstash/ratelimit/user',
});

// 基于 API Key 的应用限流
const appLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 每分钟 100 次
  prefix: '@upstash/ratelimit/app',
});

// 成本控制 — 每日/月预算
async function costControl(userId: string): Promise<boolean> {
  const dailyKey = `usage:daily:${userId}:${new Date().toISOString().slice(0, 10)}`;
  const daily = parseInt(await redis.get(dailyKey) || '0');
  if (daily >= 500) return false; // 超过每日限额

  await redis.incr(dailyKey);
  await redis.expire(dailyKey, 86400);
  return true;
}
```

> **💡 为什么限流是 Serverless 架构的必备品？** 在传统服务器中，流量激增最多导致服务器宕机。但在 Serverless + LLM 架构中，流量激增意味着平台自动扩展实例 + 每次调用都调用付费 API——双重费用叠加可能导致成本在几分钟内飙升到数千元。限流是在费用产生之前就拒绝请求的最后一道防线。

---

### 概念五：监控与可观测性

**生活类比：** 监控就像汽车的仪表盘——你不需要知道发动机内部每个零件的运转细节，但你需要知道车速（请求数）、油温（错误率）、油量（剩余预算）。好的监控不是告诉你"发动机出问题了"，而是告诉你"发动机温度 120°C，预计 5 分钟后过热，建议减速"。

```typescript
// 生产级结构化日志 — 基于 AWS Lambda Powertools
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({
  serviceName: 'agent-worker',
  logLevel: process.env.LOG_LEVEL || 'INFO',
});

export const handler: Handler = async (event) => {
  // 自动附加请求上下文
  logger.appendKeys({
    taskId: event.taskId,
    environment: process.env.NODE_ENV,
  });

  logger.info('Task started', {
    taskSize: event.task.length,
    model: event.model || 'default',
  });

  try {
    const result = await processTask(event);

    logger.info('Task completed', {
      duration: result.duration,
      tokenUsage: result.usage?.total_tokens,
    });

    return result;
  } catch (error) {
    logger.error('Task failed', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      } : error,
    });
    throw error;
  }
};
```

> **💡 为什么结构化日志比 console.log 更适合 Serverless？** 在 Serverless 环境中，没有 SSH 可登录查看日志文件。所有日志都输出到 stdout/stderr，由平台（CloudWatch、Vercel Logs）收集。结构化 JSON 日志可以被日志分析工具直接解析，支持复杂查询，如 `filter @message.taskId = "task_abc"` 追踪单个任务的完整生命周期。

---

## 🔨 实战演练

<details>
<summary>🧑‍💻 先自己动手试试，写完再展开看参考答案</summary>

**场景描述：** 你正在为一家教育科技公司构建 AI 作业批改助手。系统需要：
1. 学生提交作业后，触发 LLM 批改（耗时 1-3 分钟）
2. 批改结果通过 WebSocket 推送给学生
3. 每天高峰时段（19:00-21:00）有 500+ 学生同时提交
4. 每个学生每分钟最多提交 1 次（防止滥用）
5. 成本控制在 ¥300/月以内

**你的任务：**
1. 设计 Serverless 架构方案（选择 Vercel 还是 Lambda？哪些部分用哪个？）
2. 实现限流代码，确保学生不会滥用
3. 实现批改任务处理函数（模拟 LLM 调用即可）
4. 为生产环境配置日志和告警

<details>
<summary>📖 参考答案：完整实现</summary>

### 架构设计
- **Vercel Functions**：处理作业提交（< 1s），设置认证和限流
- **AWS Lambda**：处理实际批改（1-3 min），利用长超时支持
- **Upstash Redis**：作为消息队列解耦前后端

```typescript
// Vercel — 提交函数
export async function POST(req: NextRequest) {
  const studentId = req.headers.get('x-student-id')!;
  const { success } = await rateLimit.limit(studentId);
  if (!success) return Response.json({ error: '请等待' }, { status: 429 });
  
  const { homework } = await req.json();
  await Redis.fromEnv().lpush('grading:queue', JSON.stringify({ studentId, homework }));
  return Response.json({ status: 'queued' });
}

// Lambda — 批改 Worker
export const handler: Handler = async () => {
  const task = await redis.brpop('grading:queue', 20);
  if (!task) return;
  const { studentId, homework } = JSON.parse(task[1]);
  const result = await gradeHomework(homework); // LLM 批改
  await redis.publish(`grading:result:${studentId}`, JSON.stringify(result));
};
```

### 成本估算
| 组件 | 月费 |
|------|------|
| Vercel Functions | $0（免费额度） |
| AWS Lambda | ~$5 |
| Upstash Redis | ~$3 |
| LLM API（DeepSeek） | ~$30 |
| **总计** | **~¥280 ✅** |
</details>
</details>

---

## ⚡ 进阶技巧

### 技巧一：使用 Edge Runtime 消除冷启动

Vercel Edge Functions 基于 Cloudflare Workers 技术，冷启动 < 5ms：

```typescript
export const runtime = 'edge'; // Edge Runtime

export async function POST(req: Request) {
  // Edge Runtime 不支持 Node.js 内置模块（fs, path 等）
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  return new Response(response.body, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
```

### 技巧二：Lambda Layers 共享依赖

```bash
# 创建 Layer
mkdir -p lambda-layer/nodejs/node_modules
cd lambda-layer/nodejs
npm install @anthropic-ai/sdk @aws-lambda-powertools/logger
zip -r anthropic-layer.zip nodejs/
```

### 技巧三：混合部署策略

```json
{
  "functions": {
    "api/chat/*.ts": { "maxDuration": 30 },
    "api/quick/*.ts": { "runtime": "edge" }
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>🧠 Q1：为什么 Serverless 函数不适合处理长连接 WebSocket？</summary>
Serverless 函数是「请求-响应」模型，函数执行完毕后实例即被销毁。WebSocket 需要保持长连接（可能数小时），Serverless 平台对此类场景支持有限。
</details>

<details>
<summary>🧠 Q2：冷启动的 INIT 阶段具体发生了什么？</summary>
INIT 阶段包含：①下载代码包（从 S3）②解压并加载 Node.js 运行时 ③执行 handler 外部的全局初始化代码。优化方向就是减少这三点的时间。
</details>

<details>
<summary>🧠 Q3：Vercel Functions 和 AWS Lambda 在限流策略上有什么异同？</summary>
相同点：都依赖外部 Redis 做分布式限流。不同点：Vercel 推荐 Upstash Redis（Serverless Redis），Lambda 可以使用 ElastiCache 或 API Gateway 的内置限流功能。
</details>

<details>
<summary>🧠 Q4：什么场景应该用 Provisioned Concurrency？</summary>
交互式工作负载（Web API、聊天机器人）对延迟敏感，适合使用。异步数据处理对冷启动不敏感，不需要额外付费。
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Vercel Function 运行 10s 后超时 | Hobby 计划默认最大超时 10s | 升级到 Pro 或设置 `maxDuration: 300` |
| Lambda 冷启动 > 5s | 包体积过大（> 50MB） | 使用 esbuild 打包 + Provisioned Concurrency |
| 流式响应乱码 | 未设置 UTF-8 编码头 | 添加 `Content-Type: text/event-stream; charset=utf-8` |
| 限流误伤正常用户 | 仅基于 IP 限流 | 改用 API Key 或 User ID 进行限流 |
| 环境变量泄露 | 使用 `NEXT_PUBLIC_` 前缀 | API Keys 不使用 `NEXT_PUBLIC_` 前缀 |
| 数据库连接泄露 | Lambda 中创建了连接但未关闭 | 在 handler 外部初始化连接池 |

---

## 📝 本章小结

- ✅ **Vercel Functions** — 适合流式对话 API，冷启动 < 500ms，与 Next.js 深度集成
- ✅ **AWS Lambda** — 适合长时间 Agent 任务（最长 15 分钟），支持 Provisioned Concurrency
- ✅ **Lambda 生命周期** — INIT（冷启动）→ INVOKE（执行）→ SHUTDOWN（回收），优化 INIT 是关键
- ✅ **冷启动优化** — 缩减包体积、复用全局变量、预留并发实例
- ✅ **限流与成本控制** — 分布式限流 + 每日/月预算上限，防止费用失控

## ➡️ 下一章预告

> 接下来进入 [5.2 综合实战项目](../5.2-capstone-ai-agent-project/chapters/01-project-overview.md) —— 将本章学到的 Serverless 部署知识应用到 Capstone 项目中。
