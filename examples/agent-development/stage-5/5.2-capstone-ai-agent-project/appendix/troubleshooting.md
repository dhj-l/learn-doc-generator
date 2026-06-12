# 🔧 综合实战项目排错指南

> 构建 AI Agent 产品过程中常见问题及解决方案（18 个常见错误）

---

## 1. LangGraph 图编译错误

**错误信息：**
```
GraphSyntaxError: Channel 'messages' not found
ValueError: Expected an edge from __start__ to agent, but got agent → tools
```

**原因分析：**
在定义 StateGraph 时，声明的 channels 与实际使用的状态键不匹配，或者边的连接顺序/节点名称有误。

**解决方案：**

```typescript
import { StateGraph, Annotation } from '@langchain/langgraph';

// ✅ 正确：使用 Annotation 定义状态
const AgentState = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (x, y) => x.concat(y),
  }),
  next: Annotation<string>({
    reducer: (x, y) => y ?? x,
  }),
});

const workflow = new StateGraph(AgentState)
  .addNode('agent', agentNode)
  .addNode('tools', toolNode)
  .addEdge('__start__', 'agent')      // 起点 → agent
  .addConditionalEdges('agent', router) // agent → 条件路由
  .addEdge('tools', 'agent');          // tools → agent（循环）

// ❌ 错误：通道名拼写错误
// new StateGraph({ channels: ['message'] }) // 应该是 'messages'
```

> **💡 为什么这样做？** LangGraph 的图结构在编译时验证所有通道和边的合法性。使用 `Annotation.Root` 可以获得更好的类型推断和运行时检查。

---

## 2. Stream 响应在浏览器中乱码

**错误信息：**
```
� 乱码字符出现在 AI 回复中
TypeError: Failed to execute 'decode' on 'TextDecoder'
```

**原因分析：**
Streaming 响应的编码格式不匹配。服务端发送的是 UTF-8 编码的字节流，但客户端使用了错误的解码方式，或者服务端未正确设置 `Content-Type`。

**解决方案：**

```typescript
// 服务端 — 确保正确的响应头
export async function POST(req: Request) {
  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    messages,
  });

  return new Response(result.toDataStreamResponse().body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// 客户端 — 正确解码
const decoder = new TextDecoder('utf-8');
const reader = response.body!.getReader();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  // 更新 UI
}
```

---

## 3. Agent 工具调用返回格式错误

**错误信息：**
```
Tool 'search_knowledge_base' received invalid arguments.
Error: Expected 'query' to be a string, got undefined
```

**原因分析：**
Agent 生成的工具调用参数 JSON 格式不正确，或者工具的 parameters schema 与 Agent 框架的预期格式不匹配。

**解决方案：**

```typescript
// ✅ 正确：使用框架提供的工具定义方式
import { z } from 'zod';
import { tool } from '@langchain/core/tools';

const searchTool = tool(
  async ({ query, limit }: { query: string; limit: number }) => {
    return await performSearch(query, limit);
  },
  {
    name: 'search_knowledge_base',
    description: '搜索知识库中的文档内容',
    schema: z.object({
      query: z.string().describe('搜索关键词'),
      limit: z.number().default(5).describe('返回结果数量'),
    }),
  }
);

// ❌ 错误：schema 定义不完整
// { name: 'search', parameters: { query: 'string' } }
```

---

## 4. Vite 构建时内存溢出

**错误信息：**
```
JavaScript heap out of memory
Allocation failed - JavaScript heap out of memory
```

**原因分析：**
项目中的 TypeScript 类型定义复杂、`node_modules` 过大、或代码拆分不当导致 Vite 构建时内存不足。

**解决方案：**

```bash
# 1. 增加 Node.js 内存限制
NODE_OPTIONS="--max-old-space-size=4096" npm run build

# 2. 配置 Vite 的内存优化
```

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'pinia'],
          agent: ['@langchain/langgraph', '@langchain/anthropic'],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['@langchain/langgraph'], // 对大的依赖做排除
  },
});
```

---

## 5. Prisma 数据库迁移冲突

**错误信息：**
```
Error: P3014 — Migration `20240101000000_init` failed: relation "users" already exists
```

**原因分析：**
多个开发者同时修改了 Prisma schema，或者迁移文件被手动修改/删除了。

**解决方案：**

```bash
# 1. 重置迁移历史
npx prisma migrate reset --force

# 2. 重新创建初始迁移（生产环境慎用）
npx prisma migrate dev --name init

# 3. 使用 db push 快速同步（开发环境）
npx prisma db push

# 4. 处理合并冲突
# 编辑 schema.prisma → 重新生成
npx prisma generate
npx prisma migrate dev
```

---

## 6. Docker Compose 服务间无法通信

**错误信息：**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
getaddrinfo ENOTFOUND postgres
```

**原因分析：**
在 Docker Compose 网络中，服务应通过 service 名称（而非 `localhost`）访问其他容器。同时需要确保依赖服务的健康检查和启动顺序。

**解决方案：**

```yaml
version: '3.8'
services:
  agent-api:
    build: .
    ports: ['3000:3000']
    environment:
      # ✅ 使用服务名称而非 localhost
      - DATABASE_URL=postgresql://user:password@postgres:5432/agent_db
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy  # 等待健康检查通过
      redis:
        condition: service_started

  postgres:
    image: pgvector/pgvector:pg16
    healthcheck:  # 健康检查配置
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5
```

---

## 7. TypeScript 严格模式报错

**错误信息：**
```
Type 'undefined' is not assignable to type 'string'
Object is possibly 'undefined'
```

**原因分析：**
`tsconfig.json` 开启了 `strict: true`，但代码中未正确处理 null/undefined 值。

**解决方案：**

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
  }
}

// 代码中处理可选值
// ❌ 错误
const name = user.name; // undefined 可能

// ✅ 正确：使用可选链 + 空值合并
const name = user?.name ?? 'anonymous';

// ✅ 正确：使用类型守卫
if (!user?.name) throw new Error('User name is required');

// ✅ 正确：使用 Zod 验证
import { z } from 'zod';
const UserSchema = z.object({
  name: z.string().min(1, '用户名不能为空'),
  email: z.string().email(),
});
```

---

## 8. MCP Server 权限不足

**错误信息：**
```
Error: EACCES: permission denied, open '/var/log/app.log'
Error: ENOENT: no such file or directory, open '/root/.config/mcp/config.json'
```

**原因分析：**
MCP 文件系统 Server 没有目标路径的读写权限，或者路径配置使用了相对路径但工作目录不符合预期。

**解决方案：**

```json
// .mcp.json — 使用绝对路径
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/app/data"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  }
}

// 在 Docker 中挂载卷时注意权限
// docker-compose.yml
services:
  agent-api:
    volumes:
      - ./data:/app/data:rw  # 确保可读写
```

---

## 9. 前端热更新（HMR）失败

**错误信息：**
```
[vite] Hot Module Replacement failed: SyntaxError: Unexpected token 'export'
WebSocket connection to 'ws://localhost:5173/' failed
```

**原因分析：**
WebSocket 连接被安全策略阻止、文件变更检测异常、或者依赖包损坏。

**解决方案：**

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    watch: {
      usePolling: true,   // Docker 环境使用轮询
      interval: 100,
    },
    hmr: {
      overlay: true,      // 显示错误覆盖层
    },
  },
});

// 如果 HMR 持续失败，尝试：
// 1. 清空缓存
rm -rf node_modules/.vite
// 2. 重启 dev server
npm run dev -- --force
```

---

## 10. 流式输出 UI 卡顿

**错误信息：**
没有错误信息，但用户在输入时页面明显卡顿，AI 回复逐字输出时频繁闪烁。

**原因分析：**
每次流式更新都触发 Vue/React 的完整重渲染，导致性能瓶颈。未使用虚拟列表或防抖优化。

**解决方案：**

```vue
<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'

const messages = ref<Array<{ role: string; content: string }>>([])
const messageList = ref<HTMLElement | null>(null)

// 只在消息完整时滚动到底部（而不是每次流式更新都滚）
watch(() => messages.value.length, async () => {
  await nextTick()
  if (messageList.value) {
    messageList.value.scrollTop = messageList.value.scrollHeight
  }
})

// 流式消息使用独立的 ref 避免频繁 diff
const streamingContent = ref('')
const isStreaming = ref(false)

async function sendMessage() {
  isStreaming.value = true
  streamingContent.value = ''
  
  const response = await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message: input.value }),
  })
  
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      // 流结束后才 push 到消息列表
      messages.value.push({ role: 'assistant', content: streamingContent.value })
      streamingContent.value = ''
      isStreaming.value = false
      break
    }
    streamingContent.value += decoder.decode(value)
  }
}
</script>

<template>
  <div ref="messageList" class="message-list">
    <div v-for="(msg, i) in messages" :key="i">
      {{ msg.content }}
    </div>
    <!-- 流式消息独立渲染模板 -->
    <div v-if="isStreaming" class="streaming">
      {{ streamingContent }}<span class="cursor">▊</span>
    </div>
  </div>
</template>
```

---

## 11. API 路由 404（Vercel/Next.js）

**错误信息：**
```
404 — The page could not be found
API route not found: /api/agent/run
```

**原因分析：**
Next.js App Router 的 API 路由文件放置位置错误，或文件名不符合约定的命名规则。

**解决方案：**

```
# ✅ 正确目录结构
app/
├── api/
│   ├── chat/
│   │   └── route.ts      # → /api/chat
│   ├── agent/
│   │   └── route.ts      # → /api/agent
│   └── webhook/
│       └── route.ts      # → /api/webhook

# ❌ 错误结构
app/
├── api/
│   └── chat.ts           # × 必须是 route.ts
│   └── chat/
│       └── index.ts      # × 必须命名 route.ts
```

---

## 12. Pinia Store 在组件外访问失败

**错误信息：**
```
getActivePinia was called with no active Pinia
```

**原因分析：**
在 Pinia 注册之前，或在不支持 Composition API 的上下文中使用了 useStore。

**解决方案：**

```typescript
// main.ts — 确保 Pinia 在应用之前注册
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())  // 必须在任何 useStore() 之前
app.mount('#app')

// 在路由守卫中使用
import { createRouter } from 'vue-router'
const router = createRouter({ ... })

router.beforeEach((to, from) => {
  // ✅ 正确：Pinia 已注册，可以直接使用
  const store = useAuthStore()
})
```

---

## 13. Agent 返回重复内容

**错误信息：**
```
AI 回复中反复出现相同的段落或工具调用结果
```

**原因分析：**
Agent 在 ReAct 循环中重复执行了相同步骤，或者工具调用返回了缓存结果被多次注入到上下文中。

**解决方案：**

```typescript
// 1. 去重最近的 N 条消息
function deduplicateMessages(messages: Message[]): Message[] {
  const seen = new Set<string>();
  return messages.filter(msg => {
    const key = `${msg.role}:${msg.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 2. 设置最大迭代次数防止无限循环
workflow.addConditionalEdges('agent', (state) => {
  if (state.iterations >= 10) {
    return 'summarize';  // 超过次数时总结并退出
  }
  return state.next;
});
```

---

## 14. GitHub Actions 部署失败

**错误信息：**
```
Run vercel --prod
Error: The token "undefined" is not valid
```

**原因分析：**
GitHub Actions 中缺少必要的 Secrets 配置，或 Secret 名称与代码中使用的不一致。

**解决方案：**

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - name: Deploy to Vercel
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}  # 在 GitHub Settings → Secrets 中设置
        run: npx vercel --prod --token=$VERCEL_TOKEN --yes
```

---

## 15. 向量检索结果不相关

**错误信息：**
```
搜索 "如何创建工单" 返回了 "数据库连接配置" 等不相关内容
```

**原因分析：**
Embedding 模型选择不当、未对文档做充分的预处理（分块、清洗）、或者检索策略过于简单。

**解决方案：**

```typescript
// 1. 改进文档分块策略
function chunkDocument(text: string, chunkSize = 500) {
  // 按段落分割，保持语义完整
  const paragraphs = text.split('\n\n');
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if ((currentChunk + para).length > chunkSize) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += '\n\n' + para;
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
}

// 2. 混合检索策略（关键词 + 向量）
async function hybridSearch(query: string) {
  const [vectorResults, keywordResults] = await Promise.all([
    vectorSearch(query),          // 语义相似度
    keywordSearch(query),         // BM25 关键词匹配
  ]);
  return mergeResults(vectorResults, keywordResults); // 融合排序
}
```

---

## 16. 部署后静态资源缺失

**错误信息：**
```
404 — favicon.ico not found
GET /assets/index-Cd9f5g1s.js net::ERR_ABORTED 404
```

**原因分析：**
构建后静态资源文件路径与 HTML 中引用的路径不匹配，或者资源文件名被 Hash 化后找不到。

**解决方案：**

```typescript
// vite.config.ts
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/' : '/',
  build: {
    assetsDir: 'assets',
    // 确保所有资源被正确处理
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
  publicDir: 'public',  // 静态资源放在 public/ 目录
});

// 确保 public/ 目录中有 favicon.ico 等必需文件
```

---

## 17. WebSocket 连接断开

**错误信息：**
```
WebSocket is closed before the connection is established.
WebSocket connection to 'wss://example.com/ws' failed
```

**原因分析：**
Serverless 平台（如 Vercel）不支持长连接 WebSocket。或者负载均衡器配置了空闲超时时间。

**解决方案：**

```typescript
// 方案 1：使用 SSE（Server-Sent Events）替代 WebSocket
export async function GET(req: Request) {
  const stream = new ReadableStream({
    start(controller) {
      // 定期发送事件
      const interval = setInterval(() => {
        controller.enqueue(`data: ${JSON.stringify({ time: Date.now() })}\n\n`);
      }, 1000);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}

// 方案 2：使用 WebSocket 服务（如 Socket.io + Node.js）
// 需要独立部署 WebSocket 服务器（不支持 Serverless）
```

---

## 18. 生产环境日志级别不当

**错误信息：**
没有具体错误，但日志量巨大导致成本飙升，或者关键错误被 DEBUG 日志淹没。

**原因分析：**
生产环境中未正确设置日志级别，或日志格式不适合日志聚合系统。

**解决方案：**

```typescript
// logger.ts
import winston from 'winston';

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()    // 生产环境 JSON 格式（方便日志聚合）
      : winston.format.cli()      // 开发环境可读格式
  ),
  transports: [new winston.transports.Console()],
});

// 使用示例
logger.info('Agent task completed', { taskId, duration: 1200 });    // ✅ 生产环境保留
logger.debug('Tool call arguments:', { args });                      // ❌ 生产环境不输出
logger.error('Agent failed', { taskId, error: err.message });       // ✅ 始终输出
```
