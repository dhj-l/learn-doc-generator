# 第6章：综合实战 — 多工具智能助手

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **构建一个具备 5+ 工具的智能助手** — 综合运用前 5 章的所有知识
- **设计完整的 Agent 循环架构** — 工具定义 → 执行器 → 路由循环 → 结果聚合
- **理解 System Prompt 对工具选择的影响** — 如何编写引导 LLM 正确使用工具的提示词
- **实现生产级的错误处理和重试机制** — 最大迭代次数、部分失败、异常恢复
- **掌握多工具助手的设计模式和架构权衡** — 单 Agent vs 多 Agent、扁平 vs 分层工具结构

## 📋 前置知识

- [第1章：Function Calling 基础](./01-function-calling-basics.md) — 理解工具调用的核心流程
- [第2章：Claude Tool Use](./02-claude-tool-use.md) — Claude API 的 Tool Use 深入使用
- [第3章：工具设计最佳实践](./03-tool-design.md) — 工具描述、参数设计、错误反馈
- [第4章：常见工具类型](./04-common-tool-types.md) — 四大类工具的设计和安全实现
- [第5章：并行与顺序工具调用](./05-parallel-tool-calls.md) — 批量执行和依赖管理

## 💡 核心概念

### 架构概览：多工具智能助手的组成

一个完整的多工具智能助手由以下层次组成：

```
┌────────────────────────────────────────────────────────┐
│                   用户界面层                             │
│  (CLI / Web / Slack / API 入口)                        │
└─────────────────────┬──────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────────────┐
│                   Agent 循环层                           │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐    │
│  │ 消息管理  │→ │ LLM 调度  │→│ 工具结果聚合与反馈  │    │
│  └──────────┘  └──────────┘  └───────────────────┘    │
│                      ↕                                  │
│              ┌──────────────┐                           │
│              │ 最大迭代检查  │                           │
│              └──────────────┘                           │
└─────────────────────┬──────────────────────────────────┘
                      ↓
┌────────────────────────────────────────────────────────┐
│                   工具执行层                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ 搜索工具  │  │ 计算工具  │  │ 天气工具  │  │ 翻译工具│ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
│  ┌──────────┐  ┌──────────────────────────┐            │
│  │ 提醒工具  │  │ 错误处理 / 重试 / 日志   │            │
│  └──────────┘  └──────────────────────────┘            │
└────────────────────────────────────────────────────────┘
```

**三大层次各司其职：**
- **Agent 循环层** — 管理对话历史、调用 LLM、判断是否需要继续调用工具
- **工具执行层** — 实际执行工具逻辑、处理错误、返回结构化结果
- **用户界面层** — 与用户的交互界面，可以是 CLI、Web、Slack 等

### System Prompt 对工具选择的影响

System Prompt 在工具调用中扮演着「决策者」的角色——它告诉 LLM 如何选择和使用工具：

```typescript
// 好的 System Prompt 影响工具选择行为
const systemPrompt = `你是一个全能助手，可以帮助用户查询信息、计算、翻译和设置提醒。
根据用户的需求选择合适的工具。如果不需要工具，直接回答。
使用中文回复。`;

// 更好的 System Prompt（提供更明确的引导）
const betterSystemPrompt = `你是一个全能助手，拥有以下能力：
1. 🌐 web_search — 搜索最新信息（当用户询问新闻、实时信息、未知内容时使用）
2. 🔢 calculate — 数学计算（当用户需要计算、数据分析时使用）
3. 🌤️  get_weather — 天气查询（当用户询问天气时使用）
4. 🌍 translate — 翻译（当用户需要翻译文本时使用）
5. ⏰ create_reminder — 提醒（当用户需要设置提醒或定时任务时使用）

工作流程：
1. 分析用户请求，判断是否需要调用工具
2. 如果需要，选择合适的工具并传递正确的参数
3. 多个独立需求可以同时调用多个工具
4. 根据工具结果生成完整的回答
5. 如果不需要工具，直接回复用户
```

> **引用参考：** Anthropic 官方建议在 System Prompt 中「列出可用的工具及其用途，帮助模型快速理解工具集」。详见 [Anthropic System Prompt Guide](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts)。

---

## 🔨 完整实现

```typescript
// src/tool-assistant.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// ====== 工具定义 ======

const tools: Anthropic.Tool[] = [
  {
    name: 'search_web',
    description: '搜索互联网获取最新信息',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: '搜索关键词' } },
      required: ['query'],
    },
  },
  {
    name: 'calculate',
    description: '执行数学计算',
    input_schema: {
      type: 'object',
      properties: { expression: { type: 'string', description: '数学表达式' } },
      required: ['expression'],
    },
  },
  {
    name: 'get_weather',
    description: '获取城市天气',
    input_schema: {
      type: 'object',
      properties: { city: { type: 'string', description: '城市名' } },
      required: ['city'],
    },
  },
  {
    name: 'translate',
    description: '翻译文本',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        from: { type: 'string', description: '源语言' },
        to: { type: 'string', description: '目标语言' },
      },
      required: ['text', 'to'],
    },
  },
  {
    name: 'create_reminder',
    description: '创建提醒事项',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        time: { type: 'string', description: '时间（ISO 格式或自然语言）' },
      },
      required: ['title', 'time'],
    },
  },
];

// ====== 工具执行器 ======

function executeTool(name: string, input: any): string {
  switch (name) {
    case 'search_web':
      return `[搜索结果] 关于 "${input.query}" 的最新信息：模拟搜索结果...`;
    case 'calculate':
      try { return String(Function('"use strict";return (' + input.expression + ')')()); }
      catch { return '计算错误'; }
    case 'get_weather':
      return `${input.city}: 25°C，晴，湿度 45%`;
    case 'translate':
      return `[${input.from || '自动检测'} → ${input.to}] ${input.text} 的翻译结果`;
    case 'create_reminder':
      return `✅ 提醒已创建: "${input.title}" @ ${input.time}`;
    default:
      return `未知工具: ${name}`;
  }
}

// ====== Agent 循环 ======

async function assistant(userMessage: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  const systemPrompt = `你是一个全能助手，可以帮助用户查询信息、计算、翻译和设置提醒。
根据用户的需求选择合适的工具。如果不需要工具，直接回答。
使用中文回复。`;

  for (let i = 0; i < 10; i++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages,
    });

    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = executeTool(block.name, block.input);
          console.log(`🔧 ${block.name}: ${result}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock && textBlock.type === 'text' ? textBlock.text : '';
  }

  return '达到最大迭代次数';
}

// ====== 使用 ======
async function main() {
  console.log('💬:', await assistant('北京今天多少度？帮我把温度换算成华氏度'));
  console.log('\n💬:', await assistant('提醒我明天下午3点开会'));
}

main();
```

## ⚡ 进阶技巧

1. **结构化结果的统一返回格式**：生产级的工具执行器应该返回结构化的结果对象，而不是纯字符串。这便于 LLM 更精确地理解结果：

```typescript
interface ToolResult<T = any> {
  success: boolean;
  data: T | null;
  error?: string;
  metadata?: {
    cached?: boolean;
    latency_ms?: number;
    tool_name: string;
    timestamp: string;
  };
}

// 执行器返回结构化对象
function executeToolStructured(name: string, input: any): string {
  const start = performance.now();
  try {
    // ... 执行逻辑 ...
    return JSON.stringify({
      success: true,
      data: result,
      metadata: { tool_name: name, latency_ms: performance.now() - start, timestamp: new Date().toISOString() },
    });
  } catch (e) {
    return JSON.stringify({
      success: false,
      data: null,
      error: (e as Error).message,
      metadata: { tool_name: name, latency_ms: performance.now() - start, timestamp: new Date().toISOString() },
    });
  }
}
```

2. **使用 `AbortController` 实现工具超时**：防止某个工具执行时间过长阻塞整个 Agent 循环：

```typescript
async function executeToolWithTimeout(name: string, input: any, timeoutMs: number = 10000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const result = await Promise.race([
      executeToolAsync(name, input),
      new Promise<string>((_, reject) => 
        controller.signal.addEventListener('abort', () => reject(new Error('工具执行超时')))
      ),
    ]);
    clearTimeout(timeoutId);
    return result;
  } catch (e) {
    return `错误: 工具 "${name}" 执行超时或失败: ${(e as Error).message}`;
  }
}
```

3. **会话级别的工具状态管理**：为每个对话维护独立的工具状态（如提醒列表、搜索结果历史），而不是全局共享：

```typescript
class SessionState {
  private reminders: Array<{ title: string; time: string }> = [];
  private searchHistory: Array<{ query: string; result: string }> = [];
  
  addReminder(title: string, time: string) {
    this.reminders.push({ title, time });
    return `✅ 提醒已创建（当前共 ${this.reminders.length} 个提醒）`;
  }
  
  getReminders(): string {
    return this.reminders.length === 0 
      ? '暂无提醒' 
      : this.reminders.map((r, i) => `${i+1}. ${r.title} @ ${r.time}`).join('\n');
  }
}
```

## 🧠 知识检查点

**问题 1：** 在多工具智能助手中，为什么需要设置「最大迭代次数」？设置多少合适？

<details>
<summary>答案</summary>
最大迭代次数防止 Agent 陷入无限循环（例如工具反复返回错误，LLM 不断重试）。设置多少合适取决于场景：简单问答助手 5-8 次足够；复杂分析任务可能需要 15-20 次。一般建议设置 10-15 次，并在接近上限时发出警告。如果频繁达到上限，说明工具设计或 System Prompt 需要优化。
</details>

**问题 2：** System Prompt 在多工具助手中扮演什么角色？它如何影响工具选择？

<details>
<summary>答案</summary>
System Prompt 告诉 LLM 整体行为准则：何时使用工具、如何选择工具、优先级顺序等。好的 System Prompt 会列出每个工具的用途和典型场景（如「当用户需要实时信息时使用 search_web」），帮助 LLM 更快、更准确地选择工具。没有 System Prompt 或 Prompt 过于简单时，LLM 可能误调用工具或在不该用时跳过工具。
</details>

**问题 3：** 这个多工具助手的架构中，`messages` 数组在每次循环中是如何变化的？为什么需要同时保留 assistant 和 tool_result 消息？

<details>
<summary>答案</summary>
每轮循环中：1) 当 LLM 返回 tool_use 时，先将 assistant 的完整响应（含 tool_use block）推入 messages；2) 再将用户角色的 tool_result 推入 messages。这样 messages 的历史变为：user → assistant(含tool_use) → user(含tool_result) → ... 保留完整的 tool_use 请求和 tool_result 响应，LLM 才能理解「之前请求了什么工具→得到了什么结果→接下来应该做什么」。如果缺少 assistant 消息，LLM 不知道当前上下文中有哪些工具调用待处理。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| 没有设置最大迭代次数 | Agent 可能无限循环，消耗大量 token 和 API 费用 | 始终设置 `for` 循环最大次数（如 10-15 次），并在超限时返回友好提示 |
| System Prompt 与工具描述重复或冲突 | 既在 Prompt 中描述工具行为又在工具 description 中描述，可能信息不一致 | System Prompt 负责「何时用」，工具 description 负责「怎么用」，分工明确 |
| 工具执行器没有错误处理 | 工具执行中抛出的异常会导致整个 Agent 循环崩溃 | 每个工具执行都包裹在 try/catch 中，将异常转换为友好的错误字符串返回给 LLM |
| 忘记将 assistant 消息推入历史 | 只有 tool_result 没有 tool_use 上下文，LLM 无法关联 | 在推 tool_result 之前，先推 `{ role: 'assistant', content: response.content }` |

## 📝 本章小结

- ✅ **5 个工具** — 搜索、计算、天气、翻译、提醒，覆盖了数据查询、操作执行、计算推理、外部服务四大类
- ✅ **工具循环** — 自动处理多轮工具调用，每次响应最多支持 10 轮迭代
- ✅ **并行调用** — Claude 可能一次请求多个工具，执行器使用 Promise.allSettled 并行处理
- ✅ **System Prompt 设计** — 引导 LLM 正确选择和使用工具的指令层
- ✅ **生产级增强** — 缓存减少重复调用，超时控制防止阻塞，会话状态管理上下文
- ✅ **错误边界** — 最大迭代次数防止无限循环，try/catch 保证单工具失败不崩溃整体流程

## ➡️ 下一步

查看附录，然后进入 [2.3 记忆系统](../../2.3-memory-system/README.md) — 学习如何为 Agent 添加持久化记忆，让助手能记住用户偏好和跨会话信息。
