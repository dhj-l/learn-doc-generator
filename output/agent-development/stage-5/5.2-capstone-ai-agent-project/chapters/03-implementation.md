# 第3章：核心功能实现 — 完整编码指南

> 预计学习时间：240-300 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **从零搭建 Agent 核心** — 实现完整的 ReAct 推理循环
- **实现工具注册和调用机制**
- **构建前端流式交互界面**

## 📋 前置知识

> 建议先完成 [第1章](./01-project-overview.md) 和 [第2章](./02-architecture.md)。

---

## 💡 核心概念

### 概念一：项目初始化

```bash
npm create vite@latest code-assistant -- --template vue-ts
cd code-assistant
npm install naive-ui pinia monaco-editor @anthropic-ai/sdk ai @ai-sdk/anthropic
mkdir api && cd api
npm init -y && npm install hono @anthropic-ai/sdk @langchain/langgraph zod
```

### 概念二：Agent 核心 — ReAct 推理循环

**生活类比：** ReAct 循环就像解决复杂问题：思考（Think）→ 行动（Act）→ 观察（Observe）→ 重复，直到问题解决。

```typescript
import { StateGraph, Annotation } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';

const AgentState = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  iterations: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),
});

const model = new ChatAnthropic({ model: 'claude-sonnet-4-5-20241022', temperature: 0 });

// Agent Node
async function agentNode(state: typeof AgentState.State) {
  const response = await model.invoke([
    { role: 'system', content: '你是一个智能代码助手。' },
    ...state.messages,
  ]);
  return { messages: [response], iterations: 1 };
}

// Tool Node — 并行执行所有工具调用
async function toolNode(state: typeof AgentState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage?.tool_calls?.length) return { messages: [] };

  const results = await Promise.all(
    lastMessage.tool_calls.map(async (call: any) => {
      try {
        const result = await tools.execute(call.name, call.args);
        return { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) };
      } catch (error) {
        return { role: 'tool', tool_call_id: call.id, content: `Error: ${error.message}` };
      }
    })
  );
  return { messages: results };
}

// 编译图
const workflow = new StateGraph(AgentState)
  .addNode('agent', agentNode)
  .addNode('tools', toolNode)
  .addEdge('__start__', 'agent')
  .addConditionalEdges('agent', (state) =>
    state.iterations >= 10 || !state.messages.at(-1)?.tool_calls?.length
      ? '__end__' : 'tools', { tools: 'tools', __end__: '__end__' })
  .addEdge('tools', 'agent')
  .compile();
```

### 概念三：工具注册表（基于 Zod 验证）

```typescript
import { z } from 'zod';
import fs from 'fs/promises';

const toolSchemas = {
  read_file: {
    name: 'read_file',
    description: '读取项目文件内容',
    schema: z.object({ path: z.string() }),
    execute: async ({ path }: { path: string }) => {
      const content = await fs.readFile(path, 'utf-8');
      return { content, size: content.length, language: path.split('.').pop() };
    },
  },
  search_code: {
    name: 'search_code',
    description: '在项目中搜索代码',
    schema: z.object({
      query: z.string(),
      maxResults: z.number().optional().default(10),
    }),
    execute: async ({ query, maxResults }) => {
      const { execSync } = require('child_process');
      const output = execSync(`rg -l "${query}" | head -${maxResults}`, { encoding: 'utf-8' });
      return { results: output.split('\n').filter(Boolean) };
    },
  },
};
```

### 概念四：前端流式交互

```vue
<script setup lang="ts">
import { ref } from 'vue'

const messages = ref<Array<{ role: string; content: string }>>([])
const input = ref('')
const isStreaming = ref(false)
const streamingContent = ref('')

async function sendMessage() {
  if (!input.value.trim() || isStreaming.value) return
  const userMsg = input.value
  input.value = ''
  messages.value.push({ role: 'user', content: userMsg })
  isStreaming.value = true
  streamingContent.value = ''

  const response = await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message: userMsg, history: messages.value }),
  })

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    streamingContent.value += decoder.decode(value, { stream: true })
  }

  messages.value.push({ role: 'assistant', content: streamingContent.value })
  isStreaming.value = false
  streamingContent.value = ''
}
</script>
```

---

## 🔨 实战演练

**场景描述：** 打通从"用户输入 → Agent 推理 → 工具调用 → 流式输出"的完整链路。

**你的任务：** 实现简化版 Agent → 实现 2 个工具 → 实现前端流式组件 → 连接前后端

<details>
<summary>📖 参考实现</summary>

后端入口 (api/src/index.ts)：
```typescript
app.post('/api/chat/stream', async (c) => {
  const { message } = await c.req.json();
  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: '智能代码助手。用中文回答，给出具体代码示例。',
    messages: [{ role: 'user', content: message }],
  });
  return result.toDataStreamResponse();
});
```
</details>

---

## ⚡ 进阶技巧

### 技巧一：缓存工具调用结果
```typescript
const toolCache = new Map<string, { result: any; timestamp: number }>();
```
### 技巧二：Worker 线程处理重型计算
### 技巧三：前端显示 Agent 思考过程

---

## 🧠 知识检查点

<details>
<summary>🧠 Q1：为什么限制最大迭代次数？</summary>
防止无限循环导致费用失控。
</details>
<details>
<summary>🧠 Q2：流式 vs 非流式的区别？</summary>
非流式等待完整回复；流式逐 token 推送，体验更好但实现复杂。
</details>
<details>
<summary>🧠 Q3：工具调用失败时 Agent 应该怎么做？</summary>
重试 → 降级 → 告知用户 → 记录日志。
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Agent 返回"我不知道" | 工具不完整或提示不明确 | 检查工具注册表和系统提示 |
| 流式响应未收到 | 响应头未设置 | 确认 `Content-Type` |
| 工具调用参数错误 | Zod schema 不清晰 | 为每个参数写详细 description |

---

## 📝 本章小结

- ✅ **Agent 核心** — StateGraph 实现完整 ReAct 循环
- ✅ **工具机制** — Zod 验证的统一注册表
- ✅ **前端交互** — ReadableStream 流式输出
- ✅ **错误处理** — LLM → 工具 → API 三层捕获

## ➡️ 下一章预告

> [第4章：部署与验收](./04-deployment.md)
