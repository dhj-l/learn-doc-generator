# 第2章：Serverless 部署 — Vercel Functions 与 AWS Lambda

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **在 Vercel Functions 上部署流式 AI API** — 使用 Next.js App Router 构建流式对话端点
- **使用 AWS Lambda 部署 Agent Worker** — 处理长时间运行的异步 Agent 任务
- **设置限流、认证和监控** — 生产级 Serverless 应用的必备设施
- **优化冷启动和成本** — 让 Serverless 架构既快又省钱

## 📋 前置知识

> 建议先完成 [第1章：架构设计](./01-architecture.md)，了解生产架构的分层设计原则。
> 特别是以下知识点：
> - API Gateway 的作用和认证方式
> - 服务分层（Chat API / Agent API / RAG Service）
> - Docker 和 Serverless 的适用场景对比

---

## 💡 核心概念

### 概念一：Vercel Functions — 边缘 Serverless 平台

**生活类比：** Vercel Functions 就像一家「快闪餐厅」——你不需要租店铺（管理服务器），只需要准备好菜品（代码），平台会在客人下单时临时开设档口。如果客人太多，它会自动开更多档口。档口只在有客人时才会开张，没人的时候就关闭，所以你不会为空置的档口付房租。

想象你经营一家连锁餐饮品牌（云餐厅），在多个城市（全球边缘节点）都有客户。与其在每个城市租固定店面（传统服务器），不如和商场（Vercel）签约：有客人点单时，商场立刻为你准备好摊位（冷启动），客人走后摊位自动撤掉。如果某天某区域突然爆单，商场会自动给你开 100 个摊位同时出餐（自动扩容）。

```typescript
// app/api/chat/route.ts — 流式对话 API
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { NextRequest } from 'next/server';

// ⚠️ Vercel Hobby 最大 10s，Pro 最大 300s
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // 1. 认证检查
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }
  const apiKey = authHeader.slice(7);
  if (apiKey !== process.env.API_KEY) {
    return new Response('Invalid API Key', { status: 403 });
  }

  // 2. 限流检查（使用 Upstash Redis）
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const { success } = await rateLimit(ip);
  if (!success) {
    return new Response('Rate limit exceeded', { status: 429 });
  }

  // 3. 解析输入并校验
  const { messages } = await req.json();
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('Invalid messages', { status: 400 });
  }

  // 4. 流式调用 LLM
  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: `你是一个专业的 AI 助手。
    请用中文回答，保持简洁专业。
    如果你需要更多信息才能回答，请主动询问用户。`,
    messages,
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
```

**💡 为什么这样设计？** Vercel Functions 的本质是「请求-响应」模型：函数启动 → 执行 → 返回 → 销毁。流式响应（Streaming）利用了 Vercel 对 `Transfer-Encoding: chunked` 的支持，在函数销毁前持续推送数据到客户端。把认证、限流、校验放在函数入口处而不是业务逻辑中，可以让每一层职责清晰，也方便后续切换到其他平台。

**预期输出：** 当你用 curl 测试时：

```bash
# 测试正常请求
curl -X POST https://your-app.vercel.app/api/chat \
  -H "Authorization: Bearer sk-xxx" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}]}'

# 预期响应（流式）
data: {"content":"你好！"}
data: {"content":"你好！我是 AI 助手"}
data: {"content":"你好！我是 AI 助手，有什么可以帮你的？"}
```

---

### 概念二：AWS Lambda — 企业级 Serverless 计算

**生活类比：** AWS Lambda 就像一家「委托加工工厂」——你把任务需求和原材料（事件数据）送到工厂门口，工厂会安排工人（Lambda 实例）按你的配方（函数代码）加工产品。工厂的优势在于：它可以同时处理成千上万个不同客户的订单（自动扩容），而且你只需要为实际加工的时间付费。但每次换新订单时，工人可能需要先阅读操作手册（冷启动），这会耽误几分钟。

这与 Vercel Functions 的关键区别在于：Lambda 更像工厂，适合处理复杂、耗时的任务（如 Agent 多步推理），而 Vercel Functions 更像便利店，适合处理简单快速的请求（如聊天对话）。

```typescript
// lambda/agent-worker.ts — 生产级 Agent Worker
import { Handler } from 'aws-lambda';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // 超时设置：Agent 可能运行较长时间
  maxRetries: 3,
  timeout: 120000, // 2 分钟
});

interface AgentEvent {
  taskId: string;
  task: string;
  context: {
    userId: string;
    sessionId: string;
    previousMessages: Array<{ role: string; content: string }>;
  };
}

export const handler: Handler = async (event: AgentEvent) => {
  console.log('Agent task started:', {
    taskId: event.taskId,
    userId: event.context.userId,
    timestamp: new Date().toISOString(),
  });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `请执行以下任务：${event.task}\n\n上下文信息：\n${JSON.stringify(event.context)}`,
        },
      ],
      system: '你是一个专业的 Agent 执行器。请确保输出完整、准确。',
    });

    console.log('Agent task completed:', {
      taskId: event.taskId,
      tokensUsed: response.usage?.input_tokens! + response.usage?.output_tokens!,
      duration: response.usage?.output_tokens,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        taskId: event.taskId,
        result: response.content[0],
        usage: response.usage,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('Agent task failed:', {
      taskId: event.taskId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        taskId: event.taskId,
        error: error instanceof Error ? error.message : 'Internal error',
        status: 'failed',
      }),
    };
  }
};
```

**💡 为什么用 Lambda 而不是 Vercel 做 Agent Worker？** 两个主要原因：第一，Lambda 支持最长 15 分钟的执行时间（Vercel Hobby 仅 10 秒），Agent 的多步推理 + 工具调用可能需要几分钟。第二，Lambda 支持 Provisioned Concurrency（预留并发），可以提前初始化好实例，避免关键任务的冷启动延迟。

**预期输出：**

```json
{
  "taskId": "task_abc123",
  "result": {
    "type": "text",
    "text": "根据你的任务要求，我已经完成了以下分析：..."
  },
  "usage": {
    "input_tokens": 1500,
    "output_tokens": 850
  },
  "timestamp": "2026-06-11T10:30:00.000Z"
}
```

---

### 概念三：冷启动优化策略

**生活类比：** 冷启动就像冬天的汽车发动机——停了一晚上后，第一次点火需要多转几下才能启动。Serverless 函数在长时间未调用后，平台会回收资源，下次调用需要重新加载运行时、初始化依赖、执行全局代码。

```typescript
// 方案一：减少包体积
// 使用 esbuild 打包，减小 Lambda 部署包

// 方案二：延迟加载非关键依赖
// 不推荐：import { heavyLib } from 'heavy-lib';

// 推荐：按需加载
let heavyClient: HeavyClient;
async function getHeavyClient(): Promise<HeavyClient> {
  if (!heavyClient) {
    const { HeavyClient } = await import('heavy-lib');
    heavyClient = new HeavyClient();
  }
  return heavyClient;
}

// 方案三：利用 Lambda 执行上下文复用
let cachedDb: Pool;

function getDb(): Pool {
  if (!cachedDb) {
    cachedDb = new Pool({
      connectionString: process.env.DATABASE_URL!,
      max: 1,
    });
  }
  return cachedDb;
}

export const handler: Handler = async (event) => {
  const db = getDb(); // 冷调用时初始化，后续调用复用
  // ...
};
```

**💡 为什么这些优化有效？** Serverless 平台会保持实例 warm 一段时间（通常 5-15 分钟），在此期间全局变量和连接池可以被复用。将连接池和客户端声明在 handler 外部，利用 JavaScript 的模块缓存机制，可以避免每次调用都重复初始化。减少包体积则直接缩短了冷启动时的代码加载时间。

**预期输出：** 优化前后对比：

```
优化前冷启动时间：~3.2 秒
优化后冷启动时间：~0.8 秒
提升幅度：75%
```

---

### 概念四：限流与成本控制

**生活类比：** 限流就像游乐园的「快速通行证」系统——如果所有人都同时涌入一个热门项目，会导致排队混乱甚至安全事故。限流就是给每个游客发一个时间段的票，确保整体流量在可控范围内。

```typescript
// 使用 Upstash 实现分布式限流
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// 基于 IP 的用户限流
const userRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 每分钟最多 10 次
  analytics: true,
  prefix: '@upstash/ratelimit/user',
});

// 基于 API Key 的应用限流（更细粒度）
const appRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'), // 每分钟最多 100 次
  analytics: true,
  prefix: '@upstash/ratelimit/app',
});

// 成本控制中间件
async function costControl(userId: string): Promise<boolean> {
  // 日用量检查
  const daily = await redis.get(`usage:daily:${userId}:${today()}`);
  if (parseInt(daily || '0') >= 500) {
    return false; // 超过每日使用上限
  }
  // 月预算检查
  const monthly = await redis.get(`usage:monthly:${userId}:${currentMonth()}`);
  if (parseInt(monthly || '0') >= 10000) {
    return false; // 超过月度预算
  }
  return true;
}
```

**💡 为什么限流放在 Serverless 层？** 在 Serverless 函数入口处做限流，可以在调用 LLM API（需要付费）之前就拒绝超额请求，避免不必要的费用。Upstash 的 Redis 是 Serverless 友好的，按请求计费，没有闲置费用，非常适合与 Vercel Functions 搭配。

---

### 概念五：监控与可观测性

```typescript
// 结构化日志 — Serverless 环境下的最佳实践
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({
  serviceName: 'agent-worker',
  logLevel: process.env.LOG_LEVEL || 'INFO',  // 生产环境只保留重要日志
});

export const handler: Handler = async (event) => {
  // 自动附加请求 ID 和时间戳
  logger.appendKeys({
    taskId: event.taskId,
    environment: process.env.NODE_ENV,
  });

  logger.info('Task started', { taskSize: event.task.length });

  try {
    const result = await processTask(event);

    logger.info('Task completed', {
      duration: result.duration,
      tokenUsage: result.tokens,
    });

    return result;
  } catch (error) {
    logger.error('Task failed', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'), // 只保留前 3 行
      } : error,
    });
    throw error;
  }
};
```

**💡 为什么结构化日志很重要？** 在 Serverless 环境中，日志是主要的调试手段（因为没有 SSH 可登录）。结构化 JSON 日志可以直接被 CloudWatch Logs Insights、Datadog 等工具解析和查询。例如，你可以用 `filter @message.taskId = "task_abc"` 追踪某个任务的完整生命周期。

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

> 提示：考虑将「短请求」（提交）和「长请求」（批改）分离到不同的 Serverless 平台。

<details>
<summary>📖 参考答案：完整实现</summary>

### 架构设计

```
学生端 (Vue 3) ──── POST /api/submit ────► Vercel Functions（提交接收）
     │                                              │
     │                                              ▼
     │                                    Upstash Redis（消息队列）
     │                                              │
     │                                              ▼
     │                                    AWS Lambda（批改 Worker）
     │                                              │
     └──────────── WebSocket / SSE ◄───────────────┘
```

- **Vercel Functions**：处理作业提交（< 1 秒），设置认证和限流
- **AWS Lambda**：处理实际批改（1-3 分钟），利用长超时支持
- **Upstash Redis**：作为消息队列解耦前后端

### 提交函数（Vercel）

```typescript
// app/api/submit/route.ts
import { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const maxDuration = 10;

const rateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(1, '1 m'), // 每分钟 1 次/学生
});

export async function POST(req: NextRequest) {
  const studentId = req.headers.get('x-student-id')!;
  
  // 限流检查
  const { success } = await rateLimit.limit(studentId);
  if (!success) {
    return Response.json({ error: '请等待当前批改完成' }, { status: 429 });
  }

  const { homework, subject } = await req.json();
  
  // 入队
  const task = { studentId, homework, subject, submittedAt: new Date().toISOString() };
  await Redis.fromEnv().lpush('grading:queue', JSON.stringify(task));
  
  return Response.json({ status: 'queued', estimatedWait: '2-3 分钟' });
}
```

### 批改 Worker（Lambda）

```typescript
// lambda/grading-worker.ts
export const handler: Handler = async () => {
  const redis = new Redis(process.env.UPSTASH_REDIS_URL!);
  
  while (true) {
    const task = await redis.brpop('grading:queue', 20);
    if (!task) break;
    
    const { studentId, homework, subject } = JSON.parse(task[1]);
    
    // 调用 LLM 批改（模拟）
    const result = await gradeHomework(homework, subject);
    
    // 将结果推送到 Redis Pub/Sub
    await redis.publish(`grading:result:${studentId}`, JSON.stringify(result));
  }
};
```

### 成本估算

| 组件 | 用量 | 费用 |
|------|------|------|
| Vercely Functions | 500 请求/天 × 30 天 | $0（免费额度） |
| AWS Lambda | 500 请求 × 3 分钟 | ~$5/月 |
| Upstash Redis | 1000 条/天 | ~$3/月 |
| LLM API（DeepSeek） | 15000 次调用 | ~$30/月 |
| **总计** | | **~¥280/月 ✅** |

</details>
</details>

---

## ⚡ 进阶技巧

### 技巧一：使用 Edge Runtime 消除冷启动

Vercel Edge Functions 基于 Cloudflare Workers 技术，冷启动 < 5ms，适合对延迟敏感的请求：

```typescript
// app/api/quick-chat/route.ts
export const runtime = 'edge'; // 开启 Edge Runtime

export async function POST(req: Request) {
  // Edge Functions 支持 Web API 标准
  const { prompt } = await req.json();
  
  // 注意：Edge Runtime 不支持 Node.js 内置模块（fs, path 等）
  // 也不支持 pg, ioredis 等需要原生绑定的 npm 包
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

### 技巧二：Lambda 层（Layers）共享依赖

多个 Lambda 函数共享同一套依赖（如 Anthropic SDK、Logger），使用 Lambda Layers 可以减小部署包体积并缩短冷启动：

```bash
# 创建 Layer
mkdir -p lambda-layer/nodejs/node_modules
cd lambda-layer/nodejs
npm install @anthropic-ai/sdk @aws-lambda-powertools/logger

# 压缩并上传到 AWS
cd ..
zip -r anthropic-layer.zip nodejs/

# 在函数中引用 Layer
# AWS 控制台 → Lambda → Layers → 创建层 → 上传 zip
# 函数配置 → Layers → 添加层
```

```typescript
// 函数代码中直接使用 Layer 中的依赖
// 无需在部署包中包含 @anthropic-ai/sdk
import Anthropic from '@anthropic-ai/sdk';
// 该依赖来自 Layer，不需要在 package.json 中声明
```

### 技巧三：混合部署策略

不要把所有鸡蛋放在一个篮子里。利用不同平台的优势：

```yaml
# vercel.json — Vercel 配置
{
  "functions": {
    "api/chat/*.ts": { "maxDuration": 30 },
    "api/quick/*.ts": { "runtime": "edge" }
  }
}
```

```yaml
# serverless.yml — AWS Lambda 配置
service: agent-backend
provider:
  name: aws
  runtime: nodejs20.x
  timeout: 300  # 5 分钟
  memorySize: 1024

functions:
  agent-worker:
    handler: lambda/agent-worker.handler
    events:
      - sqs: arn:aws:sqs:region:account:agent-queue
```

> **为什么混合部署？** Vercel 擅长前端 + 轻 API（零运维），AWS Lambda 擅长后端 + 长任务（灵活配置）。将两者结合，可以在保证性能的同时控制成本。

---

## 🧠 知识检查点

<details>
<summary>🧠 Q1：为什么 Serverless 函数不适合处理长连接 WebSocket？</summary>

因为 Serverless 函数是「请求-响应」模型，函数执行完毕后实例即被销毁。WebSocket 需要保持长连接（可能数小时），Serverless 平台（如 Vercel）对此类场景支持有限。解决方案：使用独立的 Node.js 服务器（如 Socket.io）或第三方的 WebSocket 服务（如 Pusher）。
</details>

<details>
<summary>🧠 Q2：冷启动是什么？给出 3 种优化方案。</summary>

冷启动指 Serverless 函数在长时间未调用后，平台需要重新加载运行时、初始化全局代码和依赖的过程。

3 种优化方案：
1. **缩减包体积** — 使用 esbuild 打包、按需加载依赖
2. **全局变量复用** — 将连接池、客户端实例放在 handler 外部
3. **Provisioned Concurrency（Lambda）** — 预留预热实例
</details>

<details>
<summary>🧠 Q3：Vercel Functions 和 AWS Lambda 在限流策略上有什么异同？</summary>

相同点：都依赖外部 Redis 做分布式限流（函数本身是无状态的）。

不同点：
- Vercel：推荐 Upstash Redis（Serverless Redis，按请求计费），限流代码通常写在 API Route 入口处
- Lambda：可以使用 ElastiCache Redis 或 API Gateway 的内置限流功能，限流可以分层（API Gateway 层 + 函数内部）
- Vercel 的免费额度更慷慨（适合小项目），Lambda 的付费模式更适合大流量
</details>

<details>
<summary>🧠 Q4：在生产环境中，如何确保 Serverless 架构的可观测性？</summary>

1. **结构化日志** — 使用 JSON 格式输出，包含 requestId、timestamp、duration 等字段
2. **链路追踪** — 使用 OpenTelemetry 或 AWS X-Ray 追踪跨服务调用链
3. **关键指标** — 监控冷启动率、执行时间、错误率、并发数
4. **告警设置** — 错误率 > 1% 时告警、p95 延迟超过阈值时告警、预算使用率 > 80% 时告警
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Vercel Function 运行 10s 后超时 | Hobby 计划默认最大超时 10s | 升级到 Pro 计划或设置 `maxDuration: 300` |
| Lambda 冷启动耗时 > 5s | 包体积过大（> 50MB）或依赖过多原生模块 | 使用 esbuild 打包、配置 Provisioned Concurrency |
| 流式响应在客户端出现乱码 | 未正确设置 `Content-Type: text/event-stream; charset=utf-8` 头 | 在响应头中明确指定 UTF-8 编码 |
| 限流误伤正常用户 | 仅基于 IP 限流，同一 NAT 下的多个用户共享同一 IP | 改用 API Key 或 User ID 进行限流 |
| 环境变量泄露到前端 | 使用了 `NEXT_PUBLIC_` 前缀的变量存储敏感信息 | API Keys 等敏感信息不使用 `NEXT_PUBLIC_` 前缀 |
| Serverless 日志丢失 | 函数执行完毕后日志缓冲区未被刷新 | 使用外部日志服务（Sentry、Datadog）或确保日志同步写入 |
| 跨域（CORS）请求被阻止 | Serverless 函数未配置 CORS 响应头 | 添加 `Access-Control-Allow-Origin` 响应头或使用中间件 |
| 正式环境与本地环境行为不一致 | 本地使用 `.env.local` 但生产环境未设置对应环境变量 | 使用 `vercel env pull` 同步或 CI/CD 中自动注入 |
| API Key 在代码仓库中泄露 | 将 `.env` 文件提交到了 Git 仓库 | 添加 `.env` 到 `.gitignore`，使用 GitGuardian 扫描历史 |
| 数据库连接泄露 | Lambda 中创建了连接但函数退出时未关闭 | 使用连接池并确保在 handler 外部初始化 |
| 成本突然飙升 | 未设置用量上限和预算告警 | 配置 LLM API 的 usage limits + 设置每日/月预算上限 |
| Agent 任务因 Lambda 超时被截断 | 未正确估算 Agent 执行时间 | 将超时设为 `max(预估时间的 2 倍, 900s)` |

---

## 📝 本章小结

- ✅ **Vercel Functions** — 适合流式对话 API，冷启动 < 500ms，与 Next.js 深度集成
- ✅ **AWS Lambda** — 适合长时间 Agent 任务（最长 15 分钟），支持 Provisioned Concurrency
- ✅ **冷启动优化** — 缩减包体积、复用全局变量、预留并发实例，可将冷启动从 3s 降至 < 1s
- ✅ **限流与成本控制** — 使用 Upstash 做分布式限流，设置每日/月预算上限
- ✅ **可观测性** — 结构化日志记录任务全生命周期，配合告警及时发现问题
- ✅ **混合部署** — Vercel 处理短请求 + Lambda 处理长任务，各取所长

## ➡️ 下一章预告

> 接下来进入 [5.2 综合实战项目](../5.2-capstone-ai-agent-project/chapters/01-project-overview.md) —— 将本章学到的部署知识应用到真实的 Capstone 项目中，从选择项目到部署上线全流程实战。
