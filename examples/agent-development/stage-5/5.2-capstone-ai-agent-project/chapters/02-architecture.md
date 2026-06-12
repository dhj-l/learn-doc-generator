# 第2章：架构设计与技术选型

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **根据项目需求绘制完整的系统架构图** — 包含前端、API、Agent、数据层的所有组件
- **做出明智的技术选型决策** — 在多个框架和工具中选择最适合项目需求的组合
- **设计 Agent 与 MCP 工具的交互协议** — 定义工具调用的输入输出格式
- **为项目搭建可扩展的开发骨架** — 初始化项目结构，配置开发环境

## 📋 前置知识

> 建议先完成 [第1章：项目选择与需求分析](./01-project-overview.md)，明确你的项目类型和功能范围。
> 如果你还没选择项目，先花 20 分钟回去做选择，因为不同项目的架构差异很大。

---

## 💡 核心概念

### 概念一：分层架构设计模式

**生活类比：** 分层架构就像一座现代化的写字楼。大楼有 4 层（前端层、API 层、Agent 层、数据层），每层有独立的电梯（API 接口）连接上下层。保安（API Gateway）在入口处检查每个人的证件（认证）。如果你要修整某一层的水管（更新某个服务），只需要关闭那一层的水阀，不影响整栋楼的正常使用。

```typescript
// 分层架构的核心原则：每层只能与相邻层通信

// 前端层 → API 层（通过 HTTP）
// ❌ 错误：前端直接连接数据库
// fetch('postgresql://user:pass@db:5432/mydb')

// ✅ 正确：前端只通过 API 与后端交互
const response = await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ message: '你好' }),
});

// API 层 → Agent 层（通过函数调用）
// Agent 层 → 数据层（通过 ORM/查询）
// 每一层都不知道上层之外的存在
```

**通用架构图（所有项目共用）：**

```
┌──────────────────────────────────────────────────────────────┐
│                        前端层 (Vue 3 / React)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ 对话面板     │  │ 编辑器 /    │  │ 状态管理    │          │
│  │ (ChatPanel) │  │ 可视化组件  │  │ (Pinia/     │          │
│  │             │  │             │  │  Zustand)   │          │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘          │
└─────────┼────────────────┼───────────────────────────────────┘
          │                │
          ▼                ▼
┌──────────────────────────────────────────────────────────────┐
│                      API 层 (Hono / Express)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ 认证中间件   │  │ 限流中间件   │  │ 路由分发    │          │
│  │ (JWT/APIKey)│  │ (RateLimit) │  │ (/chat,     │          │
│  │             │  │             │  │  /agent...) │          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
└─────────┼────────────────┼────────────────┼──────────────────┘
          │                │                │
          ▼                ▼                ▼
┌──────────────────────────────────────────────────────────────┐
│                     Agent 层 (LangGraph)                       │
│  ┌─────────────────┐  ┌─────────────────┐                    │
│  │  ReAct Agent     │  │  MCP 工具注册表  │                    │
│  │ (推理 + 工具调用) │  │ (工具发现 + 调用) │                    │
│  └────────┬────────┘  └────────┬────────┘                    │
│           │                    │                              │
│           ▼                    ▼                              │
│  ┌─────────────────────────────────────────┐                 │
│  │        LLM 调用层 (Claude API)          │                 │
│  │  流式输出 + 工具响应解析 + 循环控制      │                 │
│  └─────────────────────────────────────────┘                 │
└──────────────────────────────────────────────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌──────────────────────────────────────────────────────────────┐
│                      数据层                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │PostgreSQL│  │向量数据库 │  │  Redis   │  │ 文件系统  │     │
│  │ (主数据)  │  │ (Chroma/ │  │ (缓存/   │  │ (代码/   │     │
│  │          │  │  Pinecone)│  │  队列)   │  │  文档)   │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
└──────────────────────────────────────────────────────────────┘
```

**💡 为什么分层架构适用于所有项目？** 无论你选择了哪个 Capstone 项目，这个四层结构都能复用。区别只在于每层的具体实现和组件名称。例如：
- 智能代码助手：前端层用 Monaco Editor + Vue 3，Agent 层增加代码分析工具
- 智能客服系统：前端层用聊天组件，数据层增加知识库向量存储
- 工作流平台：前端层用 ReactFlow，Agent 层增加 DAG 执行引擎

---

### 概念二：Agent 与工具的交互协议

**生活类比：** Agent 与工具的关系就像你请了一个私人助理。你（Agent）有一个目标（例如"帮我查找资料并整理报告"），助理手上有三件工具：搜索引擎（search_tool）、笔记软件（note_tool）、邮件系统（email_tool）。你需要明确告诉助理：什么时候用哪个工具、工具返回的结果怎么处理、如果工具出错了怎么办。

```typescript
// 定义 Agent 与工具的交互协议

// 1. 工具注册 — 告诉 Agent 有哪些工具可用
const toolRegistry = {
  search_knowledge_base: {
    description: '搜索知识库中的文档',
    parameters: {
      query: { type: 'string', description: '搜索关键词' },
      topK: { type: 'number', default: 5, description: '返回结果数量' },
    },
    execute: async (params: { query: string; topK: number }) => {
      return await vectorSearch(params.query, params.topK);
    },
  },
  read_file: {
    description: '读取项目中的文件',
    parameters: {
      path: { type: 'string', description: '文件路径' },
    },
    execute: async (params: { path: string }) => {
      return await fs.readFile(params.path, 'utf-8');
    },
  },
};

// 2. Agent 调用工具的流程
type ToolCall = {
  name: string;       // 工具名称
  arguments: Record<string, unknown>;  // 参数
};

type ToolResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

async function executeToolCall(call: ToolCall): Promise<ToolResult> {
  const tool = toolRegistry[call.name as keyof typeof toolRegistry];
  if (!tool) {
    return { success: false, error: `未知工具: ${call.name}` };
  }

  try {
    const result = await tool.execute(call.arguments);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '工具执行失败',
    };
  }
}

// 3. Agent 循环中的工具执行
async function agentLoop(state: AgentState) {
  // 步骤 1: LLM 生成回复（可能包含工具调用请求）
  const response = await model.invoke(state.messages);

  // 步骤 2: 检查是否有工具调用
  const toolCalls = response.tool_calls;
  if (!toolCalls || toolCalls.length === 0) {
    return { messages: [response] }; // 没有工具调用，直接返回
  }

  // 步骤 3: 并行执行所有工具调用
  const results = await Promise.all(
    toolCalls.map((call: ToolCall) => executeToolCall(call))
  );

  // 步骤 4: 将结果注入回消息列表
  return {
    messages: [
      response,
      ...results.map((result, i) => ({
        role: 'tool',
        tool_call_id: toolCalls[i].id,
        content: JSON.stringify(result.data),
      })),
    ],
  };
}
```

**💡 为什么需要明确的交互协议？** Agent 的错误通常来自两个地方：工具调用格式错误（参数传错了）或工具返回了意外格式的结果。定义清晰的 TypeScript 接口可以在编译时捕获大部分格式错误。`ToolResult` 的统一 `{ success, data, error }` 格式让 Agent 可以优雅地处理失败——即使某个工具返回了错误，Agent 也能继续执行其他工具。

---

### 概念三：状态管理与数据流

```typescript
// 统一的状态管理设计（适用于所有项目）

// 全局状态接口
interface AppState {
  // 对话状态
  messages: Message[];
  isStreaming: boolean;

  // 文件状态（代码助手/工作流平台）
  currentFile: string | null;
  fileTree: FileNode[];

  // Agent 状态
  agentStatus: 'idle' | 'thinking' | 'using_tools' | 'error';
  currentToolCall: ToolCall | null;

  // 用户状态
  user: User | null;
  preferences: UserPreferences;
}

// 数据流方向
// 用户操作 → Store Action → API 调用 → Agent 执行 → Store 更新 → UI 渲染
//         → 认证中间件 → 限流检查 → 输入验证

// Vue 3 + Pinia 实现
export const useAppStore = defineStore('app', () => {
  const messages = ref<Message[]>([]);
  const agentStatus = ref<AppState['agentStatus']>('idle');

  const sendMessage = async (content: string) => {
    agentStatus.value = 'thinking';

    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: content }),
    });

    const reader = response.body!.getReader();
    agentStatus.value = 'using_tools';
    // ...流式处理
  };

  return { messages, agentStatus, sendMessage };
});
```

---

### 概念四：技术选型对照表

| 组件 | 推荐方案 | 备选方案 | 适用项目 |
|------|----------|----------|----------|
| **前端框架** | Vue 3 + Vite | React + Next.js | 全部 |
| **UI 组件** | Naive UI / Ant Design Vue | shadcn-vue | 全部 |
| **状态管理** | Pinia | Zustand / Jotai | 全部 |
| **编辑器** | Monaco Editor | CodeMirror | A |
| **流程图** | ReactFlow | vue-flow | D |
| **API 层** | Hono | Express / Fastify | 全部 |
| **Agent 框架** | LangGraph | Vercel AI SDK | 全部 |
| **LLM SDK** | `@anthropic-ai/sdk` | `openai` | 全部 |
| **向量数据库** | ChromaDB (轻量) | Supabase pgvector | B, C |
| **搜索** | `@modelcontextprotocol/server-web-search` | 自定义搜索 | B |
| **部署** | Vercel (前端) + Docker (后端) | Railway / Fly.io | 全部 |

**💡 为什么推荐这些选型？** 这些方案都满足三个标准：
1. **TypeScript 优先** — 类型安全，减少运行时错误
2. **Vercel 兼容** — 可以直接部署到 Serverless 平台
3. **社区活跃** — 遇到问题 Google 一下就有答案

---

## 🔨 实战演练

<details>
<summary>🧑‍💻 先自己完成架构设计，再展开看参考答案</summary>

**场景描述：** 假设你选择了"智能代码助手"项目。你需要在编码之前完成详细的架构设计。

**你的任务：**

1. 画出架构图（用 ASCII 或文字描述），包含所有 4 层
2. 定义至少 3 个 MCP 工具的输入/输出接口
3. 确定 Agent 的状态流转（流程图）
4. 列出你选择的完整技术栈（从前端到部署）
5. 为项目创建初始目录结构（在本地或文档中）

<details>
<summary>📖 参考答案：智能代码助手架构设计</summary>

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                   前端 (Vue 3 + Vite)                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Monaco Editor  │  Chat Panel  │  File Tree     │   │
│  │  (代码编辑)      │  (AI 对话)    │  (文件浏览)    │   │
│  └─────────────────────────────────────────────────┘   │
│  Pinia Store: codeStore (currentFile, content, cursor)  │
│               chatStore (messages, isStreaming)         │
└──────────────────────────┬──────────────────────────────┘
                           │ POST /api/chat (streaming)
                           ▼
┌─────────────────────────────────────────────────────────┐
│               API 层 (Hono + Node.js)                     │
│  认证: API Key Header → 限流: Upstash → 路由: /chat     │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│            Agent 层 (LangGraph ReAct)                    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Agent State: { messages, files, iterations }    │    │
│  │                                                  │    │
│  │  [Agent Node] → 推理 + 工具调用决策                │    │
│  │       ↓                                          │    │
│  │  [Tool Node] → 并行执行工具                        │    │
│  │       ↓                                          │    │
│  │  [Route] → 还有工具要调？→ 回到 Agent Node         │    │
│  │            → 完成 → 生成最终回复                    │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  工具注册表:                                              │
│  ├── read_file(path) → string                           │
│  ├── search_code(query) → SearchResult[]                 │
│  ├── analyze_code(filePath) → AnalysisResult             │
│  └── suggest_fix(issue) → FixSuggestion                  │
└──────────────────────────┬──────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────┐
│  数据层                                                   │
│  文件系统: 读取/写入项目文件                               │
│  临时缓存: 内存中缓存文件 AST                              │
│  向量存储: ChromaDB (代码嵌入搜索)                        │
└─────────────────────────────────────────────────────────┘
```

### 工具接口定义

```typescript
// 工具 1: 读取文件
interface ReadFileInput {
  path: string;        // 文件路径（相对于项目根目录）
  encoding?: string;   // 文件编码，默认 utf-8
}
interface ReadFileOutput {
  content: string;
  size: number;
  language: string;    // 根据扩展名推断
}

// 工具 2: 代码搜索
interface SearchCodeInput {
  query: string;       // 搜索内容（支持语义搜索）
  filePattern?: string; // 文件过滤，如 "*.ts"
  maxResults?: number;  // 最大结果数
}
interface SearchCodeOutput {
  results: Array<{
    file: string;
    line: number;
    snippet: string;
    score: number;      // 相关度分数
  }>;
}

// 工具 3: 代码分析
interface AnalyzeCodeInput {
  filePath: string;
  analysisType: 'lint' | 'security' | 'complexity' | 'all';
}
interface AnalyzeCodeOutput {
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    line: number;
    column: number;
    message: string;
    rule: string;
    suggestion?: string;
  }>;
  metrics: {
    lines: number;
    complexity: number;
    dependencies: string[];
  };
}
```

### Agent 状态流转

```
                  ┌──────────┐
                  │  IDLE     │ ← 等待用户输入
                  └────┬─────┘
                       │ 用户发送消息
                       ▼
                  ┌──────────┐
                  │ THINKING │ ← LLM 生成回复
                  └────┬─────┘
                       │
                 ┌─────┴──────┐
                 ▼             ▼
          ┌──────────┐  ┌──────────┐
          │ TOOL_CALL│  │ RESPONSE │ ← 直接回复（无工具调用）
          └────┬─────┘  └────┬─────┘
               │ 执行工具     │
               ▼             │
          ┌──────────┐       │
          │ EXECUTING│ ← 并行执行工具
          └────┬─────┘       │
               │ 完成        │
               ▼             │
          ┌──────────┐       │
          │ EVALUATE │ ← 评估结果 → 需要更多工具？→ THINKING
          └────┬─────┘       │
               │ 完成        │
               ▼             ▼
                  ┌──────────┐
                  │ COMPLETE │ ← 流式返回结果
                  └──────────┘
```

### 技术栈清单

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 前端框架 | Vue 3 | 3.4+ | UI 框架 |
| 构建工具 | Vite | 5.x | 构建 |
| UI 组件 | Naive UI | 2.x | 界面组件 |
| 状态管理 | Pinia | 2.x | 状态管理 |
| 代码编辑器 | Monaco Editor | 0.45+ | 代码编辑 |
| API 框架 | Hono | 4.x | 后端 API |
| Agent 框架 | LangGraph | 0.1+ | Agent 编排 |
| LLM SDK | @anthropic-ai/sdk | 0.27+ | LLM 调用 |
| 向量数据库 | ChromaDB | 0.5+ | 代码嵌入搜索 |
| 部署 | Vercel + Docker | — | 部署 |

### 目录结构

```
code-assistant/
├── frontend/                    # 前端项目
│   ├── src/
│   │   ├── components/
│   │   │   ├── Editor.vue       # Monaco 编辑器
│   │   │   ├── ChatPanel.vue    # AI 对话
│   │   │   ├── FileTree.vue     # 文件树
│   │   │   └── StatusBar.vue    # Agent 状态
│   │   ├── stores/
│   │   │   ├── codeStore.ts     # 代码状态
│   │   │   └── chatStore.ts     # 对话状态
│   │   ├── api/
│   │   │   └── chat.ts          # API 调用
│   │   └── types/
│   │       └── index.ts         # 类型定义
│   ├── package.json
│   └── vite.config.ts
├── api/                         # 后端 API
│   ├── src/
│   │   ├── index.ts             # 入口
│   │   ├── routes/
│   │   │   └── chat.ts          # 对话路由
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   └── rateLimit.ts
│   │   └── agent/
│   │       ├── graph.ts         # LangGraph 图定义
│   │       ├── tools.ts         # 工具注册
│   │       └── mcp-servers/     # 自定义 MCP
│   ├── package.json
│   └── tsconfig.json
├── docker-compose.yml
├── .env.example
└── README.md
```

</details>
</details>

---

## ⚡ 进阶技巧

### 技巧一：API 版本管理

从一开始就设计 API 版本化，避免前端后端耦合过紧：

```typescript
import { Hono } from 'hono';

const app = new Hono();

// v1 API — 稳定版本
const v1 = new Hono();
v1.post('/chat', handleChatV1);
v1.get('/history/:id', handleHistoryV1);
app.route('/api/v1', v1);

// v2 API — 实验版本（迭代中）
const v2 = new Hono();
v2.post('/chat', handleChatV2); // 可能增加了新参数
v2.post('/agent/run', handleAgentRun);
app.route('/api/v2', v2);
```

### 技巧二：错误标准化

所有 API 返回统一的错误格式，前端可以用通用逻辑处理：

```typescript
// 统一响应格式
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;         // 机器可读：'RATE_LIMIT' | 'AUTH_FAILED' | 'AGENT_ERROR'
    message: string;      // 人类可读：'请求过于频繁，请稍后再试'
    details?: unknown;    // 调试信息（生产环境可选）
  };
  meta?: {
    requestId: string;
    timestamp: number;
    duration: number;
  };
}
```

### 技巧三：使用 LangGraph Studio 调试

LangGraph 提供了可视化调试工具，可以在开发阶段实时查看 Agent 的执行过程：

```bash
npx @langchain/langgraph-cli dev
# 打开 http://localhost:2024 查看可视化界面
```

---

## 🧠 知识检查点

<details>
<summary>🧠 Q1：为什么架构设计要在编码之前完成？</summary>

1. **减少返工** — 架构决定了组件的通信方式，后期改架构成本极高
2. **便于分工** — 明确每层的职责后，可以并行开发不同层
3. **可测试性** — 好的架构让每层可以独立测试
4. **可扩展性** — 架构设计中预留接口，后续添加功能不影响现有结构
</details>

<details>
<summary>🧠 Q2：MCP 工具的自定义 Server 和直接写一个函数有什么区别？</summary>

MCP Server 的优势：
1. **标准化协议** — 任何 MCP 兼容的客户端都可以发现和调用
2. **独立部署** — MCP Server 可以作为一个独立服务运行，复用性更强
3. **工具发现** — Agent 可以动态发现可用的工具（通过 `tools/list` 端点）
4. **权限隔离** — MCP Server 可以在独立的进程中运行，有更强的安全边界

劣势：需要遵循 MCP 协议，开发成本略高于直接写函数。
</details>

<details>
<summary>🧠 Q3：你的项目需要什么数据库？如何选择？</summary>

- **需要持久化对话历史** → PostgreSQL（结构化数据）
- **需要语义搜索** → ChromaDB 或 pgvector（向量数据）
- **需要缓存和消息队列** → Redis（内存数据）
- **只是临时存储** → 内存中缓存即可，不需要数据库

对于 Capstone 项目，推荐从最简单的方案开始（内存存储），等核心功能完成后再加数据库。
</details>

<details>
<summary>🧠 Q4：什么是"关注点分离"？在架构设计中如何体现？</summary>

关注点分离（Separation of Concerns）是指将不同职责的代码分到不同的模块中。在架构中体现为：

- 前端只关心 UI 渲染和用户交互
- API 只关心请求路由和数据验证
- Agent 只关心推理和工具调用
- 数据层只关心数据存储和检索

每层的修改不应影响其他层。例如：把 PostgreSQL 换成 SQLite，前端和 Agent 层都不需要修改。
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 没有架构图直接开始编码 | 觉得"太简单不需要画图" | 至少画一个简单的 ASCII 架构图，理清组件关系 |
| 选择了不熟悉的技术栈 | 想"顺便学一下 Rust" | Capstone 使用你最熟悉的技术栈，学习新东西做侧面项目 |
| 工具定义得太抽象 | 工具描述不够具体，Agent 不知道怎么用 | 为每个工具写示例：`search_code({"query": "user auth"})` |
| 忽视错误处理 | 假设 LLM 和工具调用永远不会出错 | 在架构设计中预留错误处理层，每个工具调用都有 try/catch |
| 前后端耦合过紧 | API 直接返回 HTML 片段而非 JSON | 始终使用 JSON API，前端负责渲染 |
| 未考虑冷启动 | 项目部署到 Serverless 但 Agent 运行 > 10s | 将长任务放到异步队列中，前端轮询结果 |
| 数据库选型过重 | 选了 PostgreSQL + Redis + Pinecone 三件套 | 先用品内存/文件存储，MVP 后再加数据库 |
| Agent 状态管理混乱 | 多个地方同时修改 messages 导致冲突 | 使用 LangGraph 的 State 管理，不在外部修改 Agent 状态 |

---

## 📝 本章小结

- ✅ **四层架构** — 前端层 → API 层 → Agent 层 → 数据层，每层职责清晰
- ✅ **工具交互协议** — 统一的 `{ success, data, error }` 格式，让 Agent 优雅处理失败
- ✅ **技术选型** — Vue 3 + Hono + LangGraph + ChromaDB 作为默认推荐
- ✅ **关注点分离** — 各层独立开发、独立测试、独立部署
- ✅ **错误处理** — 在架构层面预留错误处理机制

## ➡️ 下一章预告

> 架构设计完成，技术选型已定。现在开始真正的编码：
> [第3章：核心功能实现](./03-implementation.md) — 实现 Agent 核心逻辑、前端交互、端到端功能验证。
