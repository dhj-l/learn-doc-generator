# 第2章：内置 ReAct Agent — 开箱即用的智能体

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 `createReactAgent` 快速构建 ReAct Agent** — LangGraph 内置工厂函数
- **配置工具集与系统消息** — 自定义 Agent 行为
- **理解 ReAct 循环（Thought→Action→Observation）** — Agent 推理-行动循环
- **掌握工具调用模式** — 并行工具调用、错误处理、结果聚合

---

## 💡 什么是 ReAct Agent？

### 概念一：ReAct 范式的本质

**生活类比：** ReAct 就像一位经验丰富的厨师。你告诉他"做一道川菜"，他不会直接动手炒菜，而是先**思考**（Thought）："做麻婆豆腐不错"→**行动**（Action）：查看冰箱有没有豆腐、豆瓣酱→**观察**（Observation）："豆腐有，但缺花椒"→**再思考**："那就做家常豆腐吧"→**行动**... 如此反复，直到完成指令。

这个 **Thought→Action→Observation** 的循环就是 ReAct（Reasoning + Acting）的核心。

```
传统的 LLM 调用：
  用户问题 → LLM 生成回答 → 结束（LLM 无法调用外部工具）

ReAct 循环：
  用户问题 → Thought（分析需要什么信息）
          → Action（调用工具获取信息）
          → Observation（工具返回结果）
          → Thought（分析结果、决定下一步）
          → Action（再次调用工具或生成最终答案）
          → ... 直到给出最终答案
```

### 概念二：LangGraph 中的 `createReactAgent`

LangGraph 提供了一个高层次的工厂函数 `createReactAgent`，它封装了完整的 ReAct 循环。

```typescript
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatAnthropic } from '@langchain/anthropic';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// 定义工具
const weatherTool = tool(
  async ({ city }: { city: string }) => {
    const weatherMap: Record<string, string> = {
      '北京': '25°C 晴', '上海': '28°C 多云', '广州': '32°C 阵雨',
    };
    return weatherMap[city] || `${city} 21°C 阴`;
  },
  {
    name: 'get_weather',
    description: '查询指定城市的实时天气',
    schema: z.object({ city: z.string().describe('城市名称') }),
  }
);

// 创建 Agent
const agent = createReactAgent({
  llm: new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' }),
  tools: [weatherTool],
});
```

> **💡 为什么使用 `createReactAgent`？**
>
> 手动构建 ReAct 循环需要定义 State、Node、Conditional Edge，还要处理工具调用的解析和结果注入。`createReactAgent` 将这些样板代码全部封装，一行代码即可获得完整的 ReAct Agent。它内部自动管理了消息队列、工具调用解析、循环终止条件等复杂性。

---

## 📦 深入理解 ReAct 循环

### 概念三：ReAct 循环的内部机制

当 Agent 被调用时，`createReactAgent` 内部执行以下流程：

```
                    ┌──────────────────────┐
                    │        START         │
                    └────────┬─────────────┘
                             │
                    ┌────────▼─────────────┐
                    │  agent (LLM 推理)     │
                    │  - 生成 Thought       │
                    │  - 决定调用工具/回答   │
                    └──────┬──────────┬─────┘
                     有工具调用    无工具调用
                          │            │
              ┌───────────▼────┐  ┌───▼───────────┐
              │ tools(工具执行) │  │ final_answer   │
              │ 解析参数→执行   │  │ 生成最终回答   │
              │ 返回Observation │  └───┬───────────┘
              └───────────┬────┘      │
                          │    ┌───────┘
                     ┌────▼────▼──────┐
                     │      END       │
                     └────────────────┘
```

```typescript
const result = await agent.invoke({
  messages: [{ role: 'user', content: '北京和上海今天哪个更热？' }],
});

for (const msg of result.messages) {
  console.log(`[${msg._getType()}]: ${msg.content.slice(0, 100)}`);
}
/**
 * [human]: 北京和上海今天哪个更热？
 * [ai]: Thought: 需要查询两个城市的天气...
 *       Action: get_weather(city="北京")
 * [tool]: 25°C 晴
 * [ai]: Action: get_weather(city="上海")
 * [tool]: 28°C 多云
 * [ai]: 上海（28°C）比北京（25°C）更热3°C
 */
```

### 概念四：流式输出

```typescript
const stream = await agent.stream({
  messages: [{ role: 'user', content: '北京今天适合户外运动吗？' }],
});

for await (const event of stream) {
  for (const [nodeName, output] of Object.entries(event)) {
    console.log(`📍 [${nodeName}]: ${JSON.stringify(output).slice(0, 100)}`);
  }
}
```

> **💡 为什么需要流式输出？**
>
> Agent 的 ReAct 循环可能涉及多次工具调用，耗时较长。流式输出让用户能看到 Agent 的"思考过程"，而不是长时间等待后突然得到结果。

---

## 🛠 工具配置与自定义

### 概念五：工具注册与 Schema

```typescript
// 方式一：使用 tool 函数（推荐）
const searchTool = tool(
  async ({ query, limit }: { query: string; limit: number }) => {
    return `关于"${query}"的搜索结果...`;
  },
  {
    name: 'web_search',
    description: '搜索网络信息，获取最新的知识和数据',
    schema: z.object({
      query: z.string().describe('搜索关键词'),
      limit: z.number().default(5).describe('返回结果数量'),
    }),
  }
);

// 方式二：DynamicTool 兼容 LangChain 风格
import { DynamicTool } from '@langchain/core/tools';
const calculatorTool = new DynamicTool({
  name: 'calculator',
  description: '执行数学计算',
  func: async (input: string) => String(eval(input)),
});

const multiToolAgent = createReactAgent({
  llm: model,
  tools: [weatherTool, searchTool, calculatorTool],
});
```

### 概念六：系统消息修饰器

```typescript
// 定制 Agent 人格
const agentWithPersona = createReactAgent({
  llm: model,
  tools: [weatherTool],
  messageModifier: async (messages) => [
    {
      role: 'system',
      content: `你是一位友善的 AI 助手"小智"。行为准则：
1. 用中文回答，适当使用表情
2. 需要多次调用工具时，解释推理过程
3. 工具出错时尝试其他方法而非放弃
4. 引用工具返回的数据来源`,
    },
    ...messages,
  ],
});

// 或直接传入 system message
import { SystemMessage } from '@langchain/core/messages';
const agentWithSystem = createReactAgent({
  llm: model,
  tools: [weatherTool],
  systemMessage: new SystemMessage('你是一个专业的旅行规划助手。'),
});
```

> **💡 为什么需要系统消息修饰器？**
>
> 系统消息是控制 Agent 行为的核心手段。通过精心设计的系统提示，可以让 Agent 遵循特定的回答风格和安全规则。`messageModifier` 在每次推理前动态调整消息列表，实现更灵活的控制。

---

## 🔄 ReAct 循环的进阶控制

### 概念七：最大迭代次数

```typescript
const controlledAgent = createReactAgent({
  llm: model,
  tools: [weatherTool, searchTool],
  maxIterations: 10,   // 防止无限循环
  recursionLimit: 50,  // 内部 ReAct 循环的最大步数
});
```

### 概念八：并行工具调用

一次推理生成多个 Action，LangGraph 会并行执行：

```typescript
const result = await agent.invoke({
  messages: [{ role: 'user', content: '比较北京、上海、广州、深圳四个城市今天的天气' }],
});
// LLM 可能同时调用 get_weather 四次，并行执行
```

---

## 🔨 实战演练：多功能研究助手

```typescript
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatAnthropic } from '@langchain/anthropic';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { MemorySaver } from '@langchain/langgraph';
import { SystemMessage } from '@langchain/core/messages';

// 1. 定义工具
const searchTool = tool(
  async ({ query }: { query: string }) => {
    const data: Record<string, string> = {
      '量子计算': '量子计算利用量子比特运算，2024年Google实现量子纠错里程碑...',
      '人工智能': 'AI领域最新进展包括GPT-4o、Claude 3.5、Gemini 2.0等...',
    };
    return data[query] || `关于"${query}"的搜索结果：暂无缓存数据。`;
  },
  { name: 'knowledge_base', description: '查询内部知识库', schema: z.object({ query: z.string() }) }
);

const webSearchTool = tool(
  async ({ query }: { query: string }) => `[网络] ${query}: 最新信息...`,
  { name: 'web_search', description: '搜索最新网络信息', schema: z.object({ query: z.string() }) }
);

const summaryTool = tool(
  async ({ text }: { text: string }) => text.split(/[。！？]/).filter(Boolean).slice(0,3).join('。') + '。',
  { name: 'text_summarizer', description: '长文本摘要', schema: z.object({ text: z.string() }) }
);

// 2. 创建 Agent
const checkpointer = new MemorySaver();
const researchAgent = createReactAgent({
  llm: new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022', temperature: 0.2 }),
  tools: [searchTool, webSearchTool, summaryTool],
  systemMessage: new SystemMessage(
    `你是一个专业研究助手。工作流程：1. 先查知识库 2. 不足时搜索网络 3. 长文本摘要 4. 综合回答`
  ),
  maxIterations: 15,
});

// 3. 执行
const result = await researchAgent.invoke({
  messages: [{ role: 'user', content: '研究量子计算的最新进展' }],
}, { configurable: { thread_id: 'research-001' } });

console.log('===== 研究结果 =====');
for (const msg of result.messages) {
  console.log(`[${msg._getType()}]: ${(msg.content as string).slice(0, 200)}`);
}
```

---

## ⚠️ 常见陷阱与最佳实践

```typescript
// ❌ 错误：没有限制迭代次数
const badAgent = createReactAgent({ llm: model, tools: [tool1] });
// ✅ 正确：设置 maxIterations
const goodAgent = createReactAgent({ llm: model, tools: [tool1], maxIterations: 10 });

// ❌ 错误：工具描述模糊
const badTool = tool(async ({ q }: { q: string }) => q, {
  name: 'func1', description: '一个函数', schema: z.object({ q: z.string() }),
});
// ✅ 正确：清晰描述
const goodTool = tool(async ({ query }: { query: string }) => query, {
  name: 'web_search', description: '搜索互联网，输入关键词返回结果',
  schema: z.object({ query: z.string().describe('搜索关键词') }),
});

// ❌ 错误：工具抛出异常会中断 Agent
// ✅ 正确：捕获错误返回友好信息
const robustTool = tool(async ({ url }: { url: string }) => {
  try {
    const res = await fetch(url);
    return res.ok ? await res.text() : `HTTP ${res.status}`;
  } catch (e) {
    return `网络错误: ${e instanceof Error ? e.message : '未知'}`;
  }
}, { name: 'fetch', description: '获取网页内容', schema: z.object({ url: z.string() }) });
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：`createReactAgent` 和手动构建 StateGraph 有什么区别？**

> A：`createReactAgent` 封装了 ReAct Agent 的标准实现，适合标准场景。手动构建提供完全灵活性，适合需要自定义节点或非标准执行流程的复杂场景。

**Q2：ReAct 循环中，LLM 如何决定何时停止调用工具？**

> A：当 LLM 认为已有足够信息生成最终答案时，它会生成不带工具调用的文本回复。`createReactAgent` 内部检测到没有工具调用时结束循环。

**Q3：并行工具调用为什么能提升效率？**

> A：一次推理生成多个工具调用请求时，LangGraph 并行执行它们，显著减少整体响应时间，尤其涉及网络 I/O 时效果明显。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Agent 陷入无限 Thought-Action 循环 | 未设置 `maxIterations` 或设置过大 | 为 `createReactAgent` 传入 `maxIterations` 参数（如 10~20），超出后强制结束 |
| 工具函数抛出异常导致 Agent 崩溃 | 工具内部未做错误处理，异常一路向上抛出 | 在工具函数中使用 try-catch 捕获异常并返回友好的错误字符串 |
| 并行工具调用返回的数据错乱或丢失 | 多个工具操作同名状态字段相互覆盖 | 确保每个工具的返回字段在 State 中使用 `reduce` 合并而非直接覆盖 |
| `messageModifier` 修改消息后 Agent 行为异常 | 修改了关键的系统消息或删除了必要的上下文 | 只在 `messageModifier` 中追加内容或调整格式，不要删除已有的系统指令 |

---

## 📝 本章小结

- ✅ **`createReactAgent`** — 快速构建 ReAct Agent 的工厂函数
- ✅ **ReAct 循环** — Thought → Action → Observation
- ✅ **工具配置** — 使用 `tool()` + Zod Schema
- ✅ **系统消息修饰器** — 使用 `messageModifier` / `systemMessage`
- ✅ **流式执行** — `stream()` 实时观察思考过程
- ✅ **最大迭代次数** — 防止无限循环
- ✅ **并行工具调用** — 一次推理多次工具调用并行执行

## ➡️ 下一章预告

> [第3章：Plan-and-Execute Agent](./03-plan-execute-agent.md) — 从"思考→行动"升级到"规划→执行→再规划"。
