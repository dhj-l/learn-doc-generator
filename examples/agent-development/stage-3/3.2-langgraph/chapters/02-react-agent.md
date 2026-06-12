# 第2章：内置 ReAct Agent — 快速构建推理+行动 Agent

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 `createReactAgent` 快速构建 Agent** — 一行代码创建 ReAct Agent
- **理解 ReAct 模式的内部执行流程** — Thought → Action → Observation 循环
- **自定义工具和系统提示** — 让 Agent 具备特定领域能力
- **处理 Agent 的异常情况** — 循环保护、工具错误处理

## 📋 前置知识

> 建议先完成：
> - [第1章：LangGraph 核心概念](./01-core-concepts.md)
> - [2.2 Function Calling 与 Tool Use](../../stage-2/2.2-function-calling-and-tool-use/README.md)

---

## 💡 核心概念

### 概念一：ReAct 模式回顾

**生活类比：** 想象一个侦探在办案——观察现场（Thought）→ 采集证据（Action）→ 分析证据（Observation）→ 继续调查或结案。ReAct Agent 就是这个侦探。

```
ReAct 执行流程：

用户: "帮我查一下明天北京到上海最便宜的机票"

Agent 第 1 轮：
  Thought: 用户需要查询机票，我需要调用航班查询工具
  Action:  search_flights(from="北京", to="上海", date="明天")
  Observation: 找到 5 个航班，最便宜的是 MU5101，¥560

Agent 第 2 轮：
  Thought: 我已经找到了最便宜的航班，可以回答用户了
  Answer: 明天北京到上海最便宜的航班是 MU5101，¥560，起飞时间 08:30
```

### 概念二：createReactAgent 一行代码创建

```typescript
// src/01-react-agent.ts
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatAnthropic } from '@langchain/anthropic';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

// 定义工具
const searchTool = tool(
  async ({ query }) => {
    // 模拟搜索
    const results: Record<string, string> = {
      'vue3': 'Vue 3 使用 Composition API，通过 setup() 函数组织逻辑。',
      'react': 'React 使用 Hooks 管理状态，useState 和 useEffect 最常用。',
      'typescript': 'TypeScript 是 JavaScript 的超集，添加了静态类型系统。',
    };
    const key = Object.keys(results).find(k => query.toLowerCase().includes(k));
    return key ? results[key] : `未找到关于"${query}"的结果`;
  },
  {
    name: 'search',
    description: '搜索技术文档',
    schema: z.object({
      query: z.string().describe('搜索关键词'),
    }),
  }
);

const calculatorTool = tool(
  async ({ expression }) => {
    try {
      // 注意：生产中不应使用 eval
      const result = Function(`"use strict"; return (${expression})`)();
      return `${expression} = ${result}`;
    } catch {
      return `计算错误：${expression} 不是有效的表达式`;
    }
  },
  {
    name: 'calculator',
    description: '数学计算器，输入数学表达式返回结果',
    schema: z.object({
      expression: z.string().describe('数学表达式，如 2+3*4'),
    }),
  }
);

// 创建 ReAct Agent
const agent = createReactAgent({
  llm: model,
  tools: [searchTool, calculatorTool],
  // 可选：自定义系统提示
  messageModifier: `你是一个技术助手，可以搜索文档和进行计算。
回答要简洁准确，使用中文。`,
});

// 使用 Agent
const result = await agent.invoke({
  messages: [{ role: 'user', content: 'Vue 3 的 Composition API 是什么？' }],
});

// 查看完整对话过程
for (const msg of result.messages) {
  console.log(`[${msg.role}] ${typeof msg.content === 'string' ? msg.content.slice(0, 200) : '[工具调用]'}`);
}
```

```
预期输出：
[user] Vue 3 的 Composition API 是什么？
[assistant] [工具调用: search("vue3 composition api")]
[tool] Vue 3 使用 Composition API，通过 setup() 函数组织逻辑。
[assistant] Vue 3 的 Composition API 是一种全新的组件逻辑组织方式，通过 setup() 函数作为入口，允许使用 ref()、computed()、watch() 等函数式 API 来组织组件逻辑。
```

### 概念三：流式观察 Agent 执行过程

```typescript
// src/02-stream-agent.ts

// 使用 .stream() 观察每一步
const stream = await agent.stream({
  messages: [{ role: 'user', content: '123 * 456 + 789 等于多少？' }],
});

for await (const event of stream) {
  for (const [nodeName, nodeOutput] of Object.entries(event)) {
    if (nodeName === 'agent') {
      // Agent 的推理输出
      const lastMsg = nodeOutput.messages?.[nodeOutput.messages.length - 1];
      if (lastMsg?.tool_calls?.length) {
        console.log(`🧠 思考: 调用工具 ${lastMsg.tool_calls[0].name}`);
        console.log(`   参数: ${JSON.stringify(lastMsg.tool_calls[0].args)}`);
      } else if (lastMsg?.content) {
        console.log(`💬 回答: ${lastMsg.content}`);
      }
    } else if (nodeName === 'tools') {
      // 工具执行结果
      const lastMsg = nodeOutput.messages?.[nodeOutput.messages.length - 1];
      console.log(`🔧 工具结果: ${lastMsg?.content}`);
    }
  }
}
```

```
预期输出：
🧠 思考: 调用工具 calculator
   参数: {"expression":"123 * 456"}
🔧 工具结果: 123 * 456 = 56088
🧠 思考: 调用工具 calculator
   参数: {"expression":"56088 + 789"}
🔧 工具结果: 56088 + 789 = 56877
💬 回答: 123 × 456 + 789 = 56877
```

### 概念四：自定义 ReAct Agent 图

当 `createReactAgent` 的默认行为不能满足需求时，可以手动构建图。

```typescript
// src/03-custom-react.ts
import { StateGraph, START, END, Annotation, MessagesAnnotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatAnthropic } from '@langchain/anthropic';
import { BaseMessage, AIMessage } from '@langchain/core/messages';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });
const tools = [searchTool, calculatorTool];
const toolNode = new ToolNode(tools);

// 绑定工具到模型
const modelWithTools = model.bindTools(tools);

// 自定义状态
const CustomState = Annotation.Root({
  messages: MessagesAnnotation.spec.reducer,
  stepCount: Annotation<number>({
    reducer: (prev, curr) => prev + curr,
    default: () => 0,
  }),
});

// Agent 推理节点
async function agentNode(state: typeof CustomState.State) {
  const response = await modelWithTools.invoke(state.messages);
  return {
    messages: [response],
    stepCount: 1,
  };
}

// 路由逻辑
function shouldContinue(state: typeof CustomState.State) {
  const lastMsg = state.messages[state.messages.length - 1] as AIMessage;

  // 如果有工具调用，继续执行工具
  if (lastMsg.tool_calls?.length) return 'tools';

  // 如果步骤过多，强制结束
  if (state.stepCount >= 10) return END;

  // 否则结束
  return END;
}

// 构建自定义图
const graph = new StateGraph(CustomState)
  .addNode('agent', agentNode)
  .addNode('tools', toolNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', shouldContinue, {
    tools: 'tools',
    [END]: END,
  })
  .addEdge('tools', 'agent')  // 工具执行后回到 Agent
  .compile();

// 使用
const result = await graph.invoke({
  messages: [{ role: 'user', content: 'React 和 Vue 的学习难度对比？' }],
});
```

---

## 🔨 实战演练

### 练习：构建一个文件管理 Agent

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatAnthropic } from '@langchain/anthropic';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

// 工具 1：列出目录
const listFilesTool = tool(
  async ({ dirPath = '.' }) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n');
    } catch (e: any) {
      return `错误: ${e.message}`;
    }
  },
  {
    name: 'list_files',
    description: '列出目录中的文件和文件夹',
    schema: z.object({ dirPath: z.string().optional().describe('目录路径') }),
  }
);

// 工具 2：读取文件
const readFileTool = tool(
  async ({ filePath }) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content.length > 2000 ? content.slice(0, 2000) + '\n...(截断)' : content;
    } catch (e: any) {
      return `错误: ${e.message}`;
    }
  },
  {
    name: 'read_file',
    description: '读取文件内容',
    schema: z.object({ filePath: z.string().describe('文件路径') }),
  }
);

// 工具 3：写入文件
const writeFileTool = tool(
  async ({ filePath, content }) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8');
      return `已写入 ${filePath}`;
    } catch (e: any) {
      return `错误: ${e.message}`;
    }
  },
  {
    name: 'write_file',
    description: '写入文件内容',
    schema: z.object({
      filePath: z.string().describe('文件路径'),
      content: z.string().describe('要写入的内容'),
    }),
  }
);

// 创建 Agent
const fileAgent = createReactAgent({
  llm: model,
  tools: [listFilesTool, readFileTool, writeFileTool],
  messageModifier: `你是一个文件管理助手。帮助用户浏览、读取和创建文件。
使用中文回答。`,
});

// 使用
const result = await fileAgent.invoke({
  messages: [{ role: 'user', content: '帮我在当前目录创建一个 hello.txt，内容是"Hello World"' }],
});
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：工具执行的错误恢复

```typescript
import { ToolNode } from '@langchain/langgraph/prebuilt';

// 创建带错误处理的 ToolNode
const safeToolNode = new ToolNode(tools);

// 或在工具内部处理错误
const safeSearchTool = tool(
  async ({ query }) => {
    try {
      return await searchAPI(query);
    } catch (error) {
      return `搜索失败: ${error.message}。请尝试不同的关键词。`;
    }
  },
  { name: 'search', description: '搜索', schema: z.object({ query: z.string() }) }
);
```

### 技巧二：限制最大步骤数

```typescript
const agent = createReactAgent({
  llm: model,
  tools,
  // 通过 recursionLimit 限制最大步骤
});

const result = await agent.invoke(
  { messages: [{ role: 'user', content: '...' }] },
  { recursionLimit: 15 }  // 最多 15 步
);
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：`createReactAgent` 和手动构建图有什么区别？**

> A：`createReactAgent` 是 LangGraph 提供的快捷方式，内部封装了标准的 Agent → Tool → Agent 循环。手动构建图则提供了更大的灵活性，可以自定义路由逻辑、添加额外节点、修改状态结构。

**Q2：如何防止 Agent 陷入无限工具调用循环？**

> A：可以通过 `recursionLimit` 限制最大执行步数，也可以在自定义路由逻辑中添加迭代次数检查。另外在工具内部做好错误处理，避免工具返回空结果导致 Agent 认为需要继续调用。

**Q3：`messageModifier` 和 `systemMessage` 参数有何不同？**

> A：`messageModifier` 是更灵活的版本，它允许修改或插入任意消息，而不仅仅是系统消息。`systemMessage` 是快捷参数，等价于在 `messageModifier` 中插入一条系统消息。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Agent 持续调用同一个工具 | 工具返回结果未被正确传递给 LLM，导致 Agent 认为工具未执行 | 确保工具返回有意义的字符串结果，而不是空对象 |
| `recursionLimit` 超出但仍然未结束 | 循环条件中缺少终止逻辑，Agent 始终认为需要继续调用工具 | 在路由函数中添加最大迭代次数检查，或提高 `recursionLimit` 值 |
| `messageModifier` 不生效 | `messageModifier` 和 `systemMessage` 同时使用时有冲突 | 只使用 `messageModifier`，在里面手动构建完整消息列表 |
| 工具触发 Schema 验证错误 | Zod schema 定义的参数与 LLM 实际调用参数不匹配 | 使用 `z.optional()` 标记可选参数，或在 schema 描述中更清楚地说明参数格式 |

---

## 📝 本章小结

- ✅ **createReactAgent** — 一行代码创建 ReAct Agent
- ✅ **流式执行** — `.stream()` 观察每一步推理和工具调用
- ✅ **自定义图** — 手动构建更灵活的 Agent 图
- ✅ **ToolNode** — LangGraph 内置的工具执行节点
- ✅ **错误处理** — 工具内部容错 + 步骤数限制

## ➡️ 下一章预告

> [第3章：Plan-and-Execute Agent](./03-plan-execute-agent.md) — 先规划再执行的 Agent 模式。
