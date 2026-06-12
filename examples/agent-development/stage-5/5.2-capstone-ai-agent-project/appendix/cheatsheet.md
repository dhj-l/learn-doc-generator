# 🎯 AI Agent 综合实战项目速查表

> 从零构建完整 AI Agent 产品的核心知识点速查

---

## 📋 项目选项对比

| 维度 | 智能代码助手 | AI 研究助手 | 智能客服系统 | 工作流自动化平台 |
|------|-------------|-------------|-------------|----------------|
| **前端** | Vue 3 + Monaco Editor | React + TypeScript | Vue 3 + TypeScript | React + ReactFlow |
| **后端** | Node.js + Express | Next.js App Router | Node.js + Express | Node.js + BullMQ |
| **Agent** | LangGraph ReAct | LangGraph Multi-Agent | Vercel AI SDK | LangGraph |
| **MCP 工具** | 文件系统、代码分析 | Web 搜索、论文检索 | 知识库、工单系统 | 自定义连接器 |
| **数据库** | PostgreSQL | ChromaDB | PostgreSQL + Pinecone | PostgreSQL |
| **部署** | Vercel + Docker | Vercel | Docker + Railway | Docker Compose |
| **难度** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |

---

## 🏗️ 通用架构模板

```
┌─────────┐     ┌──────────┐     ┌───────────┐     ┌──────────┐
│  前端 UI ├────►│ API 层   ├────►│  Agent 层  ├────►│ MCP 工具  │
│ Vue/React │    │ Hono/Express│   │ LangGraph │     │ Server   │
└─────────┘     └────┬─────┘     └─────┬─────┘     └──────────┘
                     │                  │
                     ▼                  ▼
                ┌──────────┐     ┌──────────┐
                │ 数据库/   │     │ LLM API  │
                │ 向量存储   │     │ Claude   │
                └──────────┘     └──────────┘
```

---

## 🚀 项目初始化

```bash
# 前端
npm create vite@latest agent-ui -- --template vue-ts
# 或
npx create-next-app@latest agent-ui --typescript

# 后端
mkdir agent-api && cd agent-api
npm init -y
npm install hono @anthropic-ai/sdk zod

# Agent 框架（LangGraph）
npm install @langchain/langgraph @langchain/anthropic @langchain/core

# Vercel AI SDK
npm install ai @ai-sdk/anthropic
```

---

## 🤖 Agent 核心代码

### ReAct Agent

```typescript
import { StateGraph } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { Tool } from '@langchain/core/tools';

interface AgentState {
  messages: any[];
  iterations: number;
}

const model = new ChatAnthropic({
  model: 'claude-sonnet-4-20250514',
  temperature: 0,
});

const agentNode = async (state: AgentState) => {
  const response = await model.invoke(state.messages);
  return { messages: [response], iterations: state.iterations + 1 };
};

const workflow = new StateGraph<AgentState>({ channels: ['messages', 'iterations'] })
  .addNode('agent', agentNode)
  .addEdge('__start__', 'agent');
```

### 工具绑定

```typescript
const tools: Tool[] = [
  {
    name: 'search_knowledge_base',
    description: '搜索知识库内容',
    func: async ({ query }: { query: string }) => {
      return await vectorSearch(query);
    },
  },
  {
    name: 'create_ticket',
    description: '创建工单',
    func: async ({ title, description }: { title: string; description: string }) => {
      return await db.query('INSERT INTO tickets (title, description) VALUES ($1, $2)', [title, description]);
    },
  },
];

const agentWithTools = model.bindTools(tools);
```

---

## 🔄 流式输出

```typescript
// 前端（Vue 3）
async function sendMessage() {
  const response = await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message: input.value }),
  });
  
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    messages.value[messages.value.length - 1].content += decoder.decode(value);
  }
}
```

---

## 🛠️ MCP 工具集成

```json
// .mcp.json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

```typescript
// 在 Agent 中集成 MCP 工具
const mcpTools = [
  {
    name: 'read_file',
    description: '读取文件内容',
    parameters: { type: 'object', properties: { path: { type: 'string' } } },
  },
  {
    name: 'search_code',
    description: '搜索代码库',
    parameters: { type: 'object', properties: { query: { type: 'string' } } },
  },
];
```

---

## ✅ 项目验收清单

| 维度 | 检查项 | 权重 |
|------|--------|------|
| **功能完整性** | 核心功能全部实现，用户流程完整 | 30% |
| **代码质量** | TypeScript 严格模式、单元测试覆盖 > 60% | 20% |
| **Agent 设计** | 合理的架构、至少 3 个工具、完善的错误处理 | 20% |
| **用户体验** | 流畅的流式输出、加载状态、错误提示 | 15% |
| **安全性** | 输入验证（Zod）、权限控制、API Key 保护 | 15% |

---

## 📁 推荐目录结构

```
agent-project/
├── frontend/          # 前端应用
│   ├── src/
│   │   ├── components/
│   │   ├── views/
│   │   ├── stores/    # Pinia/Zustand
│   │   └── utils/
│   └── package.json
├── api/               # 后端 API
│   ├── routes/
│   ├── agent/         # Agent 逻辑
│   ├── tools/         # MCP 工具
│   └── middleware/
├── shared/            # 共享类型
│   └── types.ts
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🚦 部署命令速查

```bash
# Vercel
vercel --prod
vercel env add ANTHROPIC_API_KEY

# Docker
docker compose up -d
docker compose logs -f
docker compose down

# 数据库迁移
npx prisma migrate deploy
npx prisma db seed
```

---

## 🧪 测试配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: { statements: 60, branches: 50, functions: 60, lines: 60 },
    },
  },
});
```
