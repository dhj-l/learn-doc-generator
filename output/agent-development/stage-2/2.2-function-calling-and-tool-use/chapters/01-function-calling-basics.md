# 第1章：Function Calling 基础 — 工具调用的原理

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Function Calling 的工作原理** — LLM 如何决定调用哪个工具，以及模型是如何被训练来实现这一能力的
- **掌握工具定义的基本格式** — 用 JSON Schema 精确描述工具的名称、描述和参数
- **实现基础的 Function Calling 流程** — 定义工具 → LLM 决策 → 执行 → 反馈 → 最终回答的完整闭环
- **区分 ReAct 与原生 Function Calling 的差异** — 理解两种让 LLM 使用工具的范式
- **理解 "forced" 与 "autonomous" 两种调用模式** — 何时让模型自由选择，何时强制调用

## 💡 核心概念

### 概念一：Function Calling —— LLM 使用工具的能力

**生活类比：** 你是一个项目经理（LLM），手下有一群工程师（工具）。你说「帮我查一下数据库里有多少用户」，工程师去查了，把结果报告给你。

```
传统 LLM：
  用户: "北京今天多少度？"
  LLM:  "我无法获取实时天气信息"  ← 只能靠训练数据回答

有 Function Calling 的 LLM：
  用户: "北京今天多少度？"
  LLM:  → 决定调用 get_weather(city="北京")
  系统:  → 执行工具，返回 "25°C，晴"
  LLM:  "北京今天 25 度，天气晴朗。"  ← 基于实时数据回答
```

#### 模型如何学会调用工具？

Function Calling 并非 LLM 的「魔法」，而是通过**专门的数据训练和监督微调（SFT）**实现的：

1. **训练数据构造**：在模型的训练阶段，研究人员构造了大量包含「用户请求 → 工具调用 → 工具结果 → 最终回复」的多轮对话样本。模型通过模仿这些样本，学会在何时、调用哪个工具、传递什么参数。

2. **格式化输出训练**：模型被训练输出特定格式的 JSON（如 OpenAI 的 `tool_calls` 或 Anthropic 的 `tool_use` 内容块）。这相当于在模型的语言空间中「雕刻」出一个结构化的输出通道。

3. **推理时行为**：在推理（inference）时，模型根据用户的输入，在 token 生成过程中预测下一个最可能输出的 token——当需要调用工具时，模型会生成工具调用的结构化 token 序列，而不是自然语言文本。

> **引用参考：** OpenAI 的 Function Calling 文档指出，模型通过「使用专门的数据集进行微调，学习何时以及如何调用函数」。详见 [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling)。Anthropic 的 Tool Use 文档也强调，工具使用能力是「通过包含工具定义和工具调用示例的训练数据学习到的」。详见 [Anthropic Tool Use Docs](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)。

### 概念二：工具定义（Tool Definition）

```typescript
// 工具用 JSON Schema 描述
const weatherTool = {
  name: 'get_weather',                              // 工具名称
  description: '获取指定城市的当前天气信息',           // 工具描述（LLM 靠这个决定何时调用）
  input_schema: {                                    // 参数 Schema
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: '城市名称，如 "北京"、"上海"',
      },
      unit: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: '温度单位',
        default: 'celsius',
      },
    },
    required: ['city'],                              // 必填参数
  },
};
```

工具定义本质上是一个**元数据契约**——它不包含实现逻辑，只告诉 LLM：「存在这样一个工具，当你认为用户请求需要它时，按这个 Schema 构造调用参数」。实现逻辑在你的代码中，这构成了 LLM 与外部世界的安全边界。

### 概念三：完整调用流程

```
┌─────────────────────────────────────────────────────┐
│ Step 1: 用户发送消息 + 工具定义                        │
│   messages: [{ role: "user", content: "北京天气？" }]  │
│   tools: [get_weather, ...]                          │
└───────────────────────┬─────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ Step 2: LLM 分析并决策                                │
│   LLM 判断需要调用 get_weather                         │
│   返回: tool_use block { name: "get_weather",        │
│           input: { city: "北京" } }                   │
└───────────────────────┬─────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ Step 3: 你的代码执行工具                               │
│   const result = get_weather("北京")                  │
│   result = "25°C，晴"                                │
└───────────────────────┬─────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ Step 4: 将结果发回 LLM                                │
│   messages: [...,                                     │
│     { role: "assistant", content: [tool_use block] },│
│     { role: "user", content: [tool_result] }         │
│   ]                                                  │
└───────────────────────┬─────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ Step 5: LLM 生成最终回答                              │
│   "北京今天 25 度，天气晴朗。"                         │
└─────────────────────────────────────────────────────┘
```

### 概念四：ReAct vs 原生 Function Calling

在 LLM 使用工具的能力演进中，存在两种主要范式：

| 维度 | ReAct 风格（文本动作） | 原生 Function Calling（结构化输出） |
|------|----------------------|-----------------------------------|
| **输出格式** | 模型在自然语言文本中输出 `Thought → Action → Observation` 步骤 | 模型直接输出结构化的 JSON tool_call / tool_use block |
| **解析方式** | 需要正则表达式或字符串解析提取动作和参数 | API 直接返回结构化对象，无需解析 |
| **调用次数** | 每次生成一个动作，多步需多轮 | 支持一次返回多个并行工具调用 |
| **典型代表** | LangChain ReAct Agent（早期）、AutoGPT | OpenAI Function Calling、Anthropic Tool Use |
| **实现复杂度** | 较高（需要写 prompt 模板 + 解析器） | 较低（API 原生支持） |
| **灵活性** | 更灵活，可自定义任何动作格式 | 受限于工具定义 Schema |
| **可靠性** | 容易因输出格式变化而解析失败 | 输出格式由模型保证，更稳定 |

**关键洞见：** ReAct 是一种 **prompt engineering 方法**——通过提示词引导模型输出特定格式的文本。而原生 Function Calling 是一种 **模型训练方法**——模型在训练阶段就学会了输出结构化的工具调用 token。后者更可靠，但前者在需要高度自定义动作格式时仍有价值。

### 概念五：Forced vs Autonomous 调用模式

| 模式 | 描述 | 适用场景 |
|------|------|---------|
| **Autonomous（自主）** | 模型自行决定是否调用工具、调用哪个工具 | 通用对话助手、不确定是否需要工具的请求 |
| **Forced / Any（强制任意）** | 强制模型必须调用某个工具（不能跳过） | 工具链处理、确保路由到特定处理管道 |
| **Forced / Specific（强制指定）** | 强制模型使用某个特定工具 | 分类任务、数据提取、翻译管道 |

```typescript
// 三种模式示例（Claude API）
tool_choice: { type: 'auto' }                    // Autonomous：Claude 自行决定
tool_choice: { type: 'any' }                      // Forced Any：必须调用一个工具
tool_choice: { type: 'tool', name: 'classify' }  // Forced Specific：强制使用分类工具
```

> **引用参考：** OpenAI 的 `tool_choice` 参数支持 `"auto"`、`"required"`、`{"type": "function", "function": {"name": "..."}}` 三种模式，详见 [OpenAI API Reference](https://platform.openai.com/docs/api-reference/chat/create#chat-create-tool_choice)。Anthropic 的 `tool_choice` 支持 `"auto"`、`"any"`、`{"type": "tool", "name": "..."}`，详见 [Anthropic Tool Choice Docs](https://docs.anthropic.com/en/docs/build-with-claude/tool-use#controlling-claudes-output)。

### 概念六：基础实现（Claude）

```typescript
// src/claude-tool-use.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// 1. 定义工具
const tools: Anthropic.Tool[] = [
  {
    name: 'get_weather',
    description: '获取指定城市的当前天气',
    input_schema: {
      type: 'object' as const,
      properties: {
        city: { type: 'string', description: '城市名称' },
      },
      required: ['city'],
    },
  },
  {
    name: 'calculate',
    description: '执行数学计算',
    input_schema: {
      type: 'object' as const,
      properties: {
        expression: { type: 'string', description: '数学表达式' },
      },
      required: ['expression'],
    },
  },
];

// 2. 工具执行器
function executeTool(name: string, input: any): string {
  switch (name) {
    case 'get_weather':
      return `${input.city}: 25°C，晴，湿度 45%`;
    case 'calculate':
      try { return String(Function('"use strict";return (' + input.expression + ')')()); }
      catch { return '计算错误'; }
    default:
      return `未知工具: ${name}`;
  }
}

// 3. 带工具调用的对话
async function chatWithTools(userMessage: string) {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 1024,
      tools,
      messages,
    });

    // 如果模型使用了工具
    if (response.stop_reason === 'tool_use') {
      const toolUseBlock = response.content.find(b => b.type === 'tool_use');
      if (toolUseBlock && toolUseBlock.type === 'tool_use') {
        console.log(`🔧 调用工具: ${toolUseBlock.name}(${JSON.stringify(toolUseBlock.input)})`);

        const result = executeTool(toolUseBlock.name, toolUseBlock.input);
        console.log(`📋 结果: ${result}`);

        // 将工具结果反馈给模型
        messages.push({ role: 'assistant', content: response.content });
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolUseBlock.id,
            content: result,
          }],
        });
        continue;
      }
    }

    // 模型生成了最终回复
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock && textBlock.type === 'text' ? textBlock.text : '';
  }
}

// 使用
const answer = await chatWithTools('北京今天多少度？另外算一下 23 × 47');
console.log('\n💬 回答:', answer);
```

```
预期输出：
🔧 调用工具: get_weather({"city":"北京"})
📋 结果: 北京: 25°C，晴，湿度 45%
🔧 调用工具: calculate({"expression":"23 * 47"})
📋 结果: 1081

💬 回答: 北京今天 25 度，天气晴朗，湿度 45%。另外 23 × 47 = 1081。
```

## 🔨 实战演练

**场景描述：** 你正在为公司的客服机器人实现一个「知识库查询 + 工单创建」助手。用户向机器人提问，机器人需要：
1. 先在知识库中搜索相关文章
2. 如果没有满意的答案，为用户创建一个工单转人工处理

**你的任务：** 基于上述场景，定义两个工具（`search_knowledge_base` 和 `create_ticket`），并实现完整的 Function Calling 循环。要求至少展示一次顺序调用（先搜索、必要时创建工单）。

<details>
<summary>💡 参考实现</summary>

```typescript
const kbTools: Anthropic.Tool[] = [
  {
    name: 'search_knowledge_base',
    description: '搜索知识库文章。当用户询问产品使用方法、故障排除或常见问题时使用。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', description: '返回结果数量', default: 3 },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_ticket',
    description: '创建客服工单。只有当用户明确要求转人工或知识库无法解决问题时使用。',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '工单标题' },
        description: { type: 'string', description: '问题描述' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
      },
      required: ['title', 'description'],
    },
  },
];

// 执行器示例
function executeKbTool(name: string, input: any): string {
  if (name === 'search_knowledge_base') {
    const results: Record<string, string> = {
      '如何重置密码': '请访问设置页面，点击"忘记密码"，按照邮件指引操作。',
      '退款政策': '购买后 30 天内可申请全额退款。',
    };
    const found = Object.entries(results)
      .filter(([k]) => k.includes(input.query) || input.query.includes(k))
      .map(([k, v]) => `【${k}】${v}`);
    return found.length > 0 ? found.join('\n') : '未找到相关文章。';
  }
  return `工单已创建，编号: TICKET-${Date.now()}`;
}
```

</details>

## ⚡ 进阶技巧

1. **`stop_reason` 的精确判断**：不要只依赖 `stop_reason === 'tool_use'` 来判断是否调用了工具。Claude 可能在 `stop_reason: 'end_turn'` 时依然包含 `tool_use` block（当在流式场景中已经处理完工具调用时）。更可靠的方式是检查 `response.content` 中是否包含 `type === 'tool_use'` 的 block。

2. **TypeScript 工具类型安全**：为 `executeTool` 函数使用精确的类型签名，避免 `any` 传播：

```typescript
type ToolInputs = {
  get_weather: { city: string; unit?: 'celsius' | 'fahrenheit' };
  calculate: { expression: string };
};

function executeTool<T extends keyof ToolInputs>(name: T, input: ToolInputs[T]): string {
  // TypeScript 会自动推断 input 的类型
}
```

3. **工具调用 ID 的唯一性**：每个 `tool_use` block 都有一个唯一 `id`（如 `"toolu_0123..."`）。在反馈 `tool_result` 时，**必须**使用正确的 `tool_use_id` 将结果关联到对应的调用。如果 ID 不匹配，API 会返回错误。在多工具并行调用中尤其要注意这一点。

## 🧠 知识检查点

**问题 1：** Function Calling 是如何被「教」给 LLM 的？它与 ReAct 方法有什么本质区别？

<details>
<summary>答案</summary>
Function Calling 通过在训练数据中构造「用户请求 → 工具调用 → 工具结果 → 最终回复」的多轮对话样本，经过监督微调（SFT）让模型学会输出结构化的 tool_call token。与 ReAct 不同，ReAct 是 prompt engineering 方法——通过提示词引导模型输出特定格式的文本然后解析；而 Function Calling 是模型训练层面的能力，输出格式更稳定可靠。
</details>

**问题 2：** 什么是 tool_choice `"auto"`、`"any"` 和 `"tool"` 三种模式的区别？

<details>
<summary>答案</summary>
- `auto`：模型自主决定是否调用工具以及调用哪个工具。适合通用对话场景。
- `any`：强制模型必须调用某个工具（不能跳过），但模型可以选择具体调用哪个。适合工具链处理。
- `tool`（指定名称）：强制模型调用指定的那个特定工具。适合分类、数据提取等固定任务。
</details>

**问题 3：** 在一个 Function Calling 流程中，如果 LLM 返回了 tool_use block，你的代码需要做什么？

<details>
<summary>答案</summary>
需要做三件事：1) 解析 tool_use block 获取 `name` 和 `input`；2) 调用对应的函数执行工具逻辑；3) 将结果以 `tool_result` 格式（包含正确的 `tool_use_id`）发送回 LLM，让 LLM 基于结果生成最终回答。如果一次响应中有多个 tool_use block，需要并行处理所有工具调用。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| 忘记将 `tool_use` block 加入消息历史 | 工具结果返回了，但没有保留原始的工具调用请求，LLM 无法关联上下文 | 在发送 `tool_result` 之前，先将 `assistant` 角色的完整 `response.content` 追加到消息历史 |
| `tool_choice` 设置为 `"auto"` 但期望强制调用 | 某些场景需要 LLM 必须调用工具（如提取数据），但 `auto` 允许 LLM 跳过 | 改用 `"any"` 或 `{"type": "tool", "name": "..."}` |
| 工具描述过于模糊 | LLM 无法判断何时使用该工具，导致调用率低或错误调用 | 在 `description` 中说明：工具功能、何时使用（示例场景）、何时不使用（排除场景） |

## 📝 本章小结

- ✅ **Function Calling 的原理** — LLM 通过专门训练学会输出结构化的工具调用 token，而非自然语言文本
- ✅ **ReAct vs 原生 FC** — ReAct 是文本动作+解析的 prompt 方法，原生 FC 是模型原生支持的 JSON 输出，更稳定可靠
- ✅ **Forced vs Autonomous 模式** — `auto`（自主决策）、`any`（强制任意）、`tool`（强制指定）三种模式对应不同场景
- ✅ **工具定义格式** — 用 JSON Schema 描述工具的名称、描述和参数，这是 LLM 与外部世界的契约
- ✅ **调用流程** — 用户消息 → LLM 决策 → 执行工具 → 反馈结果 → 最终回答的 5 步闭环
- ✅ **循环处理** — 一次请求可能触发多次工具调用，需要在循环中持续处理直到 LLM 生成最终回答

## ➡️ 下一章预告

> [第2章：Claude Tool Use](./02-claude-tool-use.md) — 深入 Claude API 的 Tool Use 特性，对比 OpenAI 格式差异，掌握流式处理和 tool_choice 的高级用法。
