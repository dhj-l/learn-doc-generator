# 第3章：核心功能实现 — 完整编码指南

> 预计学习时间：240-300 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **从零搭建 Agent 核心 — 实现完整的 ReAct 推理循环**
- **实现工具的注册、发现和调用机制**
- **构建前端交互界面 — 流式输出、状态展示、错误提示**
- **将前端、API、Agent、MCP 工具连接为端到端可用的产品**

## 📋 前置知识

> 建议先完成：
> - [第1章：项目选择与需求分析](./01-project-overview.md) — 明确你要实现什么
> - [第2章：架构设计与技术选型](./02-architecture.md) — 了解各层的职责和交互方式
>
> 本章以"智能代码助手"项目为例展示完整编码流程。如果你选择了其他项目，原理相同，只需替换具体的工具和 UI 组件。

---

## 💡 核心概念

### 概念一：项目初始化与配置

**生活类比：** 项目初始化就像建房子前的准备工作——你需要先打好地基（安装依赖）、拉好水电（配置环境变量）、搭建脚手架（配置编译工具）。虽然这些工作不会产生用户可见的功能，但缺少它们，后面的所有开发都无法进行。

```bash
# 1. 创建前端项目（Vue 3 + Vite + TypeScript）
npm create vite@latest code-assistant -- --template vue-ts
cd code-assistant

# 2. 安装前端依赖
npm install naive-ui                  # UI 组件库
npm install pinia                     # 状态管理
npm install monaco-editor             # 代码编辑器
npm install @anthropic-ai/sdk         # LLM SDK
npm install ai @ai-sdk/anthropic      # Vercel AI SDK（流式输出）

# 3. 创建后端项目
mkdir api && cd api
npm init -y
npm install hono                      # API 框架
npm install @anthropic-ai/sdk         # LLM SDK
npm install @langchain/langgraph      # Agent 框架
npm install zod                       # 输入验证
npm install typescript @types/node    # 开发依赖
npx tsc --init                        # 初始化 TS 配置

# 4. 配置环境变量
cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-xxx
DATABASE_URL=postgresql://localhost:5432/code_assistant
LOG_LEVEL=debug
EOF
```

**💡 为什么这样组织项目结构？** 前端和后端分离的目录结构让两个项目可以独立开发、独立构建、独立部署。前端部署到 Vercel，后端可以部署到 Docker 或 AWS Lambda，互不干扰。`shared/` 目录下的类型定义确保前后端的接口契约一致。

---

### 概念二：Agent 核心 — 实现 ReAct 推理循环

**生活类比：** ReAct 循环就像你解决一个复杂问题的思维方式：
1. **思考（Think）**：理解问题，决定下一步做什么
2. **行动（Act）**：执行一个具体操作（查资料、算数据）
3. **观察（Observe）**：看操作结果是否解决了问题
4. **重复**：如果没解决，回到步骤 1

Agent 的 ReAct 循环是一样的：LLM 思考 → 决定调用某个工具 → 执行工具 → 观察结果 → 决定下一步。

```typescript
// api/src/agent/graph.ts — 完整 Agent 图定义
import { StateGraph, Annotation } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { ToolRegistry } from './tools';

// 1. 定义 Agent 的状态
const AgentState = Annotation.Root({
  messages: Annotation<any[]>({
    // reducer 定义了如何合并状态更新
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  iterations: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),
  currentFile: Annotation<string | null>({
    reducer: (current, update) => update ?? current,
    default: () => null,
  }),
});

// 2. 初始化 LLM 模型
const model = new ChatAnthropic({
  model: 'claude-sonnet-4-5-20241022',
  temperature: 0,
  maxTokens: 4096,
});

// 3. 创建工具注册表
const tools = new ToolRegistry();

// 4. Agent 节点 — LLM 推理
async function agentNode(state: typeof AgentState.State) {
  // 将工具描述注入系统提示
  const systemPrompt = {
    role: 'system',
    content: `你是一个智能代码助手。你可以使用以下工具来帮助用户：

${tools.getDescriptions()}

请按以下步骤工作：
1. 分析用户的需求
2. 如果需要使用工具，明确说明你要做什么
3. 使用工具获取信息
4. 基于工具结果给出完整答案

规则：
- 每个工具调用之间要思考结果
- 如果工具返回了错误，尝试其他方式解决
- 最多调用 10 次工具，之后必须给出最终答案`,
  };

  const response = await model.invoke([systemPrompt, ...state.messages]);
  return { messages: [response], iterations: 1 };
}

// 5. 工具节点 — 执行工具调用
async function toolNode(state: typeof AgentState.State) {
  const lastMessage = state.messages[state.messages.length - 1];

  if (!lastMessage?.tool_calls?.length) {
    return { messages: [] };
  }

  // 并行执行所有工具调用
  const results = await Promise.all(
    lastMessage.tool_calls.map(async (call: any) => {
      console.log(`Executing tool: ${call.name}`, call.args);
      try {
        const result = await tools.execute(call.name, call.args);
        return {
          role: 'tool',
          tool_call_id: call.id,
          content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        };
      } catch (error) {
        return {
          role: 'tool',
          tool_call_id: call.id,
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    })
  );

  return { messages: results };
}

// 6. 路由函数 — 决定下一步
function router(state: typeof AgentState.State): string {
  const lastMessage = state.messages[state.messages.length - 1];

  // 超过最大迭代次数，强制结束
  if (state.iterations >= 10) {
    return 'end';
  }

  // 如果最后一条消息包含工具调用，去执行工具
  if (lastMessage?.tool_calls?.length) {
    return 'tools';
  }

  // 否则，返回最终结果
  return 'end';
}

// 7. 构建图
const workflow = new StateGraph(AgentState)
  .addNode('agent', agentNode)
  .addNode('tools', toolNode)
  .addEdge('__start__', 'agent')
  .addConditionalEdges('agent', router, {
    tools: 'tools',
    end: '__end__',
  })
  .addEdge('tools', 'agent'); // 工具执行完后回到 Agent 继续推理

// 编译为可运行的 Agent
export const agentApp = workflow.compile();

// 8. 使用示例
async function runAgent(userMessage: string, fileContext?: string) {
  const initialState = {
    messages: [
      {
        role: 'user',
        content: fileContext
          ? `当前文件内容：\n\`\`\`\n${fileContext}\n\`\`\`\n\n用户问题：${userMessage}`
          : userMessage,
      },
    ],
    iterations: 0,
    currentFile: null,
  };

  const finalState = await agentApp.invoke(initialState);
  return finalState.messages;
}
```

**💡 为什么这样设计 Agent？**
1. **状态显式化** — 通过 `Annotation.Root` 定义清晰的状态结构，每一步都清楚当前状态
2. **并行工具调用** — Agent 可能一次请求调用多个工具，使用 `Promise.all` 并行执行
3. **迭代限制** — `iterations >= 10` 防止无限循环，这是生产环境必不可少的保护机制
4. **统一的错误处理** — 工具调用失败时返回 `Error:` 消息，Agent 可以根据错误信息尝试其他方案

---

### 概念三：工具注册与 MCP 集成

**生活类比：** 工具注册表就像你工具箱中的标签系统。每个工具上贴了标签（工具描述），写明了"这是什么工具"（name）、"什么时候用它"（description）、"怎么用"（parameters）。Agent（工匠）看到标签就知道拿起哪个工具来做当前的工作。

```typescript
// api/src/agent/tools.ts — 工具注册表

import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// 工具的模式定义
const toolSchemas = {
  read_file: {
    name: 'read_file',
    description: '读取项目中的文件内容。用于查看用户当前正在编辑的代码文件。',
    schema: z.object({
      path: z.string().describe('文件路径，相对于项目根目录'),
    }),
  },
  search_code: {
    name: 'search_code',
    description: '在项目中搜索代码。支持按文件名、函数名或代码内容搜索。',
    schema: z.object({
      query: z.string().describe('搜索关键词'),
      filePattern: z.string().optional().describe('文件过滤模式，如 "*.ts"'),
      maxResults: z.number().optional().default(10).describe('最大返回结果数'),
    }),
  },
  analyze_code: {
    name: 'analyze_code',
    description: '分析代码文件，检测潜在问题。支持语法错误、安全漏洞、代码复杂度分析。',
    schema: z.object({
      filePath: z.string().describe('要分析的文件路径'),
      analysisType: z.enum(['lint', 'security', 'complexity']).describe('分析类型'),
    }),
  },
  suggest_fix: {
    name: 'suggest_fix',
    description: '根据分析结果给出代码修复建议。',
    schema: z.object({
      issue: z.string().describe('要修复的问题描述'),
      code: z.string().describe('有问题的代码片段'),
      filePath: z.string().describe('文件路径'),
    }),
  },
};

type ToolName = keyof typeof toolSchemas;

// 工具执行器
const toolExecutors: Record<ToolName, (args: any) => Promise<any>> = {
  read_file: async ({ path: filePath }) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        content,
        size: content.length,
        language: path.extname(filePath).slice(1),
      };
    } catch (error) {
      throw new Error(`无法读取文件 ${filePath}: ${error}`);
    }
  },

  search_code: async ({ query, filePattern, maxResults }) => {
    // 使用 ripgrep 进行快速搜索
    const { execSync } = require('child_process');
    try {
      const pattern = filePattern ? `--glob '${filePattern}'` : '';
      const output = execSync(
        `rg --line-number --context 2 -i "${query}" ${pattern} | head -${maxResults || 10}`,
        { encoding: 'utf-8', maxBuffer: 1024 * 1024 }
      );
      return {
        results: output.split('\n').filter(Boolean).map((line: string) => ({
          snippet: line,
        })),
      };
    } catch {
      return { results: [] };
    }
  },

  analyze_code: async ({ filePath, analysisType }) => {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const issues = [];

    if (analysisType === 'lint' || analysisType === 'all') {
      // 基础静态分析
      if (content.includes('any')) {
        issues.push({
          severity: 'warning',
          line: content.split('\n').findIndex(l => l.includes('any')) + 1,
          message: '使用了 any 类型，建议替换为更具体的类型',
          rule: 'no-explicit-any',
        });
      }
    }

    if (analysisType === 'security' || analysisType === 'all') {
      // 安全检查
      if (content.includes('eval(')) {
        issues.push({
          severity: 'error',
          line: content.split('\n').findIndex(l => l.includes('eval(')) + 1,
          message: '使用了 eval()，存在严重安全风险',
          rule: 'no-eval',
        });
      }
    }

    return {
      issues,
      metrics: {
        lines: lines.length,
        complexity: content.split(/if|for|while|switch|catch/g).length - 1,
        dependencies: [],
      },
    };
  },

  suggest_fix: async ({ issue, code, filePath }) => {
    // 返回分析结果给 LLM，由 LLM 生成具体修复建议
    return {
      issue,
      code,
      filePath,
      status: 'pending_llm_review',
      message: '已记录问题，等待 LLM 生成修复方案',
    };
  },
};

// 工具注册表类
export class ToolRegistry {
  private tools = toolSchemas;
  private executors = toolExecutors;

  getDescriptions(): string {
    return Object.values(this.tools)
      .map(t => {
        const shape = t.schema.shape;
        const params = Object.entries(shape)
          .map(([key, val]: [string, any]) => {
            const isOptional = val.description?.includes('可选') || val._def?.typeName === 'ZodOptional';
            return `  - ${key}${isOptional ? '?' : ''}: ${val._def?.typeName || 'string'} ${val.description || ''}`;
          })
          .join('\n');
        return `## ${t.name}\n${t.description}\n参数：\n${params}`;
      })
      .join('\n\n');
  }

  async execute(name: string, args: Record<string, unknown>): Promise<any> {
    const schema = this.tools[name as ToolName];
    if (!schema) {
      throw new Error(`未知工具: ${name}。可用工具: ${Object.keys(this.tools).join(', ')}`);
    }

    // 参数校验
    const validated = schema.schema.parse(args);

    // 执行
    return await this.executors[name as ToolName](validated);
  }

  listTools() {
    return Object.entries(this.tools).map(([name, def]) => ({
      name,
      description: def.description,
      parameters: def.schema,
    }));
  }
}
```

**💡 为什么使用 Zod 做参数校验？** 工具调用失败最常见的原因是参数格式错误。LLM 有时会生成不正确的参数（比如把数字传成了字符串）。Zod 在运行时验证参数类型和结构，让错误在工具执行前就被捕获，Agent 收到错误后可以重新生成正确的调用。

---

### 概念四：前端流式交互实现

```vue
<!-- frontend/src/components/ChatPanel.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { NButton, NInput, NSpin, NScrollbar } from 'naive-ui'

const messages = ref<Array<{
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  status?: 'streaming' | 'complete' | 'error'
}>>([])

const input = ref('')
const isStreaming = ref(false)
const streamingContent = ref('')
const messageId = ref(0)

async function sendMessage() {
  if (!input.value.trim() || isStreaming.value) return

  const userMsg = input.value
  input.value = ''

  // 添加用户消息
  messages.value.push({
    id: messageId.value++,
    role: 'user',
    content: userMsg,
    status: 'complete',
  })

  // 开始流式请求
  isStreaming.value = true
  streamingContent.value = ''

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('apiKey')}`,
      },
      body: JSON.stringify({
        message: userMsg,
        history: messages.value
          .filter(m => m.role !== 'system')
          .map(m => ({ role: m.role, content: m.content })),
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    // 添加占位消息
    const assistantMsgId = messageId.value++
    messages.value.push({
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      status: 'streaming',
    })

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value, { stream: true })
      streamingContent.value += text

      // 更新消息内容
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.id === assistantMsgId) {
        lastMsg.content = streamingContent.value
      }
    }

    // 标记为完成
    const completedMsg = messages.value.find(m => m.id === assistantMsgId)
    if (completedMsg) {
      completedMsg.status = 'complete'
    }
  } catch (error) {
    // 错误处理
    messages.value.push({
      id: messageId.value++,
      role: 'system',
      content: `⚠️ 请求失败: ${error instanceof Error ? error.message : '未知错误'}`,
      status: 'error',
    })
  } finally {
    isStreaming.value = false
    streamingContent.value = ''
  }
}
</script>

<template>
  <div class="chat-panel">
    <NScrollbar class="message-list">
      <div
        v-for="msg in messages"
        :key="msg.id"
        :class="['message', `message--${msg.role}`, `message--${msg.status}`]"
      >
        <div class="message__role">
          {{ msg.role === 'user' ? '🧑 你' : msg.role === 'assistant' ? '🤖 AI' : 'ℹ️ 系统' }}
        </div>
        <div class="message__content">{{ msg.content }}</div>
        <div v-if="msg.status === 'streaming'" class="message__cursor">▊</div>
      </div>
      <div v-if="messages.length === 0" class="empty-state">
        <p>💡 在下方输入框中输入你的代码问题</p>
        <p>例如："分析这个文件有没有 bug" 或 "帮我优化这段代码"</p>
      </div>
    </NScrollbar>

    <div class="input-area">
      <NInput
        v-model:value="input"
        type="textarea"
        :disabled="isStreaming"
        placeholder="输入你的代码问题..."
        :autosize="{ minRows: 2, maxRows: 6 }"
        @keydown.enter.prevent="sendMessage"
      />
      <NButton
        type="primary"
        :loading="isStreaming"
        :disabled="!input.trim()"
        @click="sendMessage"
      >
        {{ isStreaming ? 'AI 思考中...' : '发送' }}
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.chat-panel { height: 100%; display: flex; flex-direction: column; }
.message-list { flex: 1; padding: 16px; }
.message { margin-bottom: 16px; padding: 12px; border-radius: 8px; }
.message--user { background: #e8f5e9; }
.message--assistant { background: #e3f2fd; }
.message--system { background: #fff3e0; }
.message--error { background: #ffebee; border-left: 3px solid #f44336; }
.message__role { font-size: 12px; font-weight: 600; margin-bottom: 4px; opacity: 0.7; }
.message__cursor { display: inline-block; animation: blink 0.8s infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.empty-state { text-align: center; padding: 40px; color: #999; }
.input-area { padding: 16px; border-top: 1px solid #eee; display: flex; gap: 8px; }
</style>
```

**💡 为什么用 ReadableStream 而不是 WebSocket？** 对于文本生成的场景，SSE（Server-Sent Events）比 WebSocket 更简单高效。SSE 是标准的 HTTP 协议，不需要额外的连接管理，Vercel Functions 原生支持，且浏览器会自动处理重连。WebSocket 更适合双向实时通信（如协作编辑），对于"前端请求 → AI 流式回复"的单向流，SSE 是更简单且可靠的选择。

---

## 🔨 实战演练

<details>
<summary>🧑‍💻 先自己实现核心功能，再展开看完整代码</summary>

**场景描述：** 基于前两章的需求和架构设计，你的智能代码助手项目需要打通从"用户输入 → Agent 推理 → 工具调用 → 流式输出"的完整链路。

**你的任务：**

1. **实现一个简化版 Agent**（不需要完整 LangGraph，用 `while` 循环即可）
2. **实现至少 2 个工具**（读取文件和搜索代码）
3. **实现前端流式对话组件**（输入框 + 消息列表 + 流式显示）
4. **连接前后端**，验证端到端通信正常
5. **处理至少 2 种错误场景**（API 失败、工具调用失败）

<details>
<summary>📖 完整参考代码</summary>

### 后端入口（api/src/index.ts）

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { agentApp } from './agent/graph';

const app = new Hono();

// CORS
app.use('/*', cors({
  origin: ['http://localhost:5173', 'https://your-app.vercel.app'],
  allowMethods: ['POST', 'GET'],
}));

// 认证中间件
app.use('/api/*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ') || auth.slice(7) !== process.env.API_KEY) {
    return c.json({ success: false, error: { code: 'AUTH_FAILED', message: '认证失败' } }, 401);
  }
  await next();
});

// 聊天 API
app.post('/api/chat', async (c) => {
  const { message, history = [] } = await c.req.json();

  try {
    // 运行 Agent（在实际生产中使用流式）
    const result = await agentApp.invoke({
      messages: [...history, { role: 'user', content: message }],
      iterations: 0,
      currentFile: null,
    });

    const lastMessage = result.messages[result.messages.length - 1];

    return c.json({
      success: true,
      data: {
        content: lastMessage?.content || '',
        iterations: result.iterations,
      },
    });
  } catch (error) {
    console.error('Agent error:', error);
    return c.json({
      success: false,
      error: {
        code: 'AGENT_ERROR',
        message: 'Agent 执行失败，请稍后重试',
      },
    }, 500);
  }
});

// 流式聊天 API（推荐）
app.post('/api/chat/stream', async (c) => {
  const { message, history = [] } = await c.req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: '你是一个智能代码助手。用中文回答，给出具体的代码示例。',
    messages: [...history, { role: 'user', content: message }],
  });

  return result.toDataStreamResponse();
});

// 健康检查
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

export default app;
```

### 前端入口（frontend/src/App.vue）

```vue
<script setup lang="ts">
import { ref } from 'vue'
import ChatPanel from './components/ChatPanel.vue'
import EditorPanel from './components/EditorPanel.vue'

const activeFile = ref<string | null>(null)
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2>📁 文件</h2>
      </div>
      <div class="file-list">
        <!-- 文件树组件 -->
        <p style="padding: 16px; color: #999;">文件浏览区域</p>
      </div>
    </aside>

    <main class="main-content">
      <EditorPanel />
    </main>

    <aside class="chat-sidebar">
      <ChatPanel />
    </aside>
  </div>
</template>

<style>
.app-layout {
  display: grid;
  grid-template-columns: 200px 1fr 380px;
  height: 100vh;
  overflow: hidden;
}
.sidebar { border-right: 1px solid #eee; background: #fafafa; }
.main-content { overflow: auto; }
.chat-sidebar { border-left: 1px solid #eee; }
</style>
```

### 测试端到端连接

```bash
# 1. 启动后端
cd api && npx tsx src/index.ts

# 2. 测试 API
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "帮我写一个 TypeScript 函数，用来合并两个对象"}'

# 3. 启动前端
cd frontend && npm run dev

# 4. 打开 http://localhost:5173 测试
```

</details>
</details>

---

## ⚡ 进阶技巧

### 技巧一：缓存工具调用结果

重复的工具调用会浪费时间和 Token。实现一个简单的缓存层：

```typescript
const toolCache = new Map<string, { result: any; timestamp: number }>();
const CACHE_TTL = 60_000; // 1 分钟

async function executeWithCache(name: string, args: any): Promise<any> {
  const key = `${name}:${JSON.stringify(args)}`;
  const cached = toolCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Cache hit] ${key}`);
    return cached.result;
  }

  const result = await tools.execute(name, args);
  toolCache.set(key, { result, timestamp: Date.now() });
  return result;
}
```

### 技巧二：Agent 执行的流式状态推送

在前端展示 Agent 的"思考过程"，提升用户体验：

```typescript
// 使用 Server-Sent Events 推送 Agent 状态
app.get('/api/agent/status/:taskId', async (c) => {
  const taskId = c.req.param('taskId');

  return new Response(
    new ReadableStream({
      start(controller) {
        const interval = setInterval(() => {
          const status = getAgentStatus(taskId);
          controller.enqueue(`data: ${JSON.stringify(status)}\n\n`);
          if (status.status === 'complete' || status.status === 'error') {
            clearInterval(interval);
            controller.close();
          }
        }, 500);
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    }
  );
});
```

### 技巧三：使用 Worker 线程处理重型计算

代码分析（AST 解析）是 CPU 密集型操作，使用 Worker 线程避免阻塞事件循环：

```typescript
// tool-worker.ts
import { parentPort } from 'worker_threads';
import { analyzeTypeScript } from './analyzer';

parentPort?.on('message', async (task) => {
  const result = await analyzeTypeScript(task.code);
  parentPort?.postMessage(result);
});

// 主线程调用
import { Worker } from 'worker_threads';
const worker = new Worker('./tool-worker.ts');
worker.postMessage({ code: fileContent });
worker.on('message', (result) => {
  console.log('Analysis result:', result);
});
```

---

## 🧠 知识检查点

<details>
<summary>🧠 Q1：ReAct 循环中，为什么要限制最大迭代次数？</summary>

为了防止无限循环。Agent 可能陷入"调用工具 → 看结果 → 再调用工具"的循环中无法做出最终决策。限制次数后，Agent 会强制结束并给出当前可用的最佳答案。如果没有限制，一次请求可能运行数小时并消耗巨额费用。
</details>

<details>
<summary>🧠 Q2：流式输出（Streaming）和非流式输出在实现上有什么区别？</summary>

非流式输出：等待 LLM 生成完整回复后一次性返回。优点是实现简单；缺点是用户需要等待全部生成完成后才能看到内容。

流式输出：LLM 每生成一段 token 就立即推送给客户端。优点是用户体验好（即时看到内容）；缺点是需要处理 SSE/ReadableStream，实现复杂度更高。

对于 Agent 场景，推荐先实现非流式，核心功能跑通后再升级为流式。
</details>

<details>
<summary>🧠 Q3：工具调用失败时，Agent 应该怎么处理？</summary>

好的处理策略：
1. **重试** — 如果是临时错误（网络超时），自动重试 1-2 次
2. **降级** — 如果某个工具不可用，尝试用其他工具实现类似功能
3. **告知用户** — 如果所有尝试都失败，明确告诉用户"无法完成这个操作，原因是什么"
4. **记录日志** — 记录失败的工具调用信息，用于后续排查

不建议的做法：忽略错误继续执行，或返回模糊的"系统错误"消息。
</details>

<details>
<summary>🧠 Q4：如何确保前端在刷新页面后不会丢失对话？</summary>

实现三层持久化策略：
1. **内存** — Pinia Store（当前会话，刷新后丢失）
2. **localStorage** — 每次新消息都保存到 localStorage（刷新后恢复，同设备可用）
3. **后端数据库** — 用户登录后同步到数据库（跨设备可用）

```typescript
// localStorage 持久化
watch(messages, (newMessages) => {
  localStorage.setItem('chat_history', JSON.stringify(newMessages));
}, { deep: true });

// 页面加载时恢复
const saved = localStorage.getItem('chat_history');
if (saved) messages.value = JSON.parse(saved);
```
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Agent 返回"我不知道" | 没有给 Agent 配置足够的工具或系统提示不够明确 | 检查工具注册表是否完整，系统提示中明确说明能力范围 |
| 前端没有收到流式响应 | 未设置正确的响应头或使用了非流式的 API 调用 | 确认 `Content-Type: text/event-stream` 和前端 `response.body.getReader()` |
| 工具调用参数总是错误 | Zod schema 定义不清晰，LLM 无法正确理解参数含义 | 为每个参数写详细的 `description`，并给出示例值 |
| 前端渲染了大量空白 | 流式更新触发了不必要的 Vue 重渲染 | 使用 `streamingContent` 独立 ref 而非直接修改数组中的对象 |
| API 返回 504 Gateway Timeout | Serverless 函数超时，Agent 执行时间过长 | 缩短 `maxIterations` 或启用异步任务模式 |
| 类型错误 `any` 类型失控 | 未严格定义 API 和工具接口的类型 | 使用 Zod 验证所有输入输出，TypeScript 开启 `strict: true` |
| fetch 请求跨域失败 | 后端未配置 CORS，或配置的 origin 与前端地址不匹配 | 在 Hono/Express 中配置具体的 origin 而非 `*` |
| 部署后本地存储的数据丢失 | 浏览器清除了 localStorage（如隐私模式） | 增加 `try/catch` 包裹 localStorage 操作 |
| Agent 多次调用同一工具 | 工具返回的结果不足以让 Agent 做出决策 | 确保工具返回足够的信息，或在系统提示中要求"在调用工具前先思考是否需要" |
| 构建时 monaco-editor 报错 | Monaco Editor 的 web worker 配置不正确 | 使用 `monaco-editor` 的 ESM 版本或 `@guolao/vue-monaco-editor` |

---

## 📝 本章小结

- ✅ **Agent 核心** — 使用 LangGraph 的 StateGraph 实现了完整的 ReAct 推理循环
- ✅ **工具机制** — 基于 Zod 验证的统一工具注册表，确保工具调用的正确性
- ✅ **前端交互** — 基于 ReadableStream 的流式输出，用户体验流畅
- ✅ **错误处理** — 从 LLM 层到工具层到 API 层，都有完善的错误捕获机制
- ✅ **端到端** — 前端 → API → Agent → 工具的完整链路已打通

## ➡️ 下一章预告

> 核心功能已完成！现在将你的项目部署到生产环境，让全世界都可以使用：
> [第4章：部署与验收](./04-deployment.md) — 配置 CI/CD、部署上线、编写项目文档、通过验收清单自检。
