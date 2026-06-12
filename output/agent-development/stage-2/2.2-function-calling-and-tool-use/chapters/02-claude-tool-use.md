# 第2章：Claude Tool Use — Claude 的工具调用深入

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **深入掌握 Claude API 的 Tool Use 特性** — 理解 Claude 工具调用的完整 API 设计
- **对比 OpenAI Function Calling 与 Claude Tool Use 的差异** — 掌握两种主流格式的优缺点和迁移技巧
- **熟练运用 tool_choice 的三种模式** — auto / any / tool 的适用场景
- **实现流式 Tool Use** — 实时接收工具调用和参数
- **正确处理工具错误** — 使用 is_error 标记让 Claude 理解失败并自主修复

## 📋 前置知识

- [第1章：Function Calling 基础](./01-function-calling-basics.md) — 理解 Function Calling 的基本概念、调用流程和工具定义格式

## 💡 核心概念

### 概念一：OpenAI Function Calling vs Claude Tool Use

两大主流模型提供商都支持原生 Function Calling，但在 API 设计上有显著差异：

| 维度 | OpenAI Function Calling | Claude Tool Use |
|------|------------------------|-----------------|
| **接口路径** | `chat/completions` 的 `tools` 参数 | `messages` 的 `tools` 参数 |
| **工具定义字段** | `type: "function"`, `function: { name, description, parameters }` | 直接 `{ name, description, input_schema }` |
| **调用输出格式** | `assistant_message.tool_calls` 数组，每个有 `id`, `type: "function"`, `function: { name, arguments }` | `response.content` 中的 `tool_use` block，每个有 `id`, `name`, `input` |
| **结果反馈格式** | `tool` role 消息：`{ role: "tool", tool_call_id, content }` | `user` role 中的 `tool_result` block：`{ type: "tool_result", tool_use_id, content }` |
| **并行调用** | 支持（一次返回多个 tool_calls） | 支持（一次返回多个 tool_use blocks） |
| **错误标记** | 无原生支持（需通过 content 字符串传递） | 原生 `is_error: true` 字段 |
| **流式支持** | 通过多个 delta 分块传输 | 通过 `input_json_delta` 流式输出 |
| **强制调用** | `tool_choice: "required"` 或 `{ type: "function", function: { name } }` | `tool_choice: { type: "any" }` 或 `{ type: "tool", name }` |

#### 格式对比示例

```typescript
// ===== OpenAI 格式 =====
// 工具定义
const openaiTools = [{
  type: 'function',
  function: {
    name: 'get_weather',
    description: '获取天气',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    },
  },
}];

// 模型返回的工具调用
// response.choices[0].message.tool_calls = [{
//   id: 'call_abc123',
//   type: 'function',
//   function: { name: 'get_weather', arguments: '{"city":"北京"}' },
// }];

// 工具结果反馈
// { role: 'tool', tool_call_id: 'call_abc123', content: '25°C' }


// ===== Claude 格式 =====
// 工具定义
const claudeTools = [{
  name: 'get_weather',
  description: '获取天气',
  input_schema: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
}];

// 模型返回的工具调用
// response.content = [{ type: 'tool_use', id: 'toolu_xyz', name: 'get_weather', input: { city: '北京' } }];

// 工具结果反馈
// { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_xyz', content: '25°C' }] }
```

**关键差异总结：**
- OpenAI 将工具调用放在 `message.tool_calls` 中，参数是 **JSON 字符串**（需要 `JSON.parse`）
- Claude 将工具调用放在 `content` 数组中，参数是**已经解析好的对象**（可直接使用）
- Claude 原生支持 `is_error` 标记错误结果；OpenAI 需要自己在 content 字符串中描述错误

### 概念二：Tool Choice 控制

```typescript
// 场景 1：让 Claude 自行决定（默认）
tool_choice: { type: 'auto' }

// 场景 2：强制使用某个工具（即使 Claude 认为不需要）
tool_choice: { type: 'any' }

// 场景 3：强制使用指定工具
tool_choice: { type: 'tool', name: 'get_weather' }
```

#### 深度解析三种模式

| 模式 | 行为 | 典型场景 | 风险 |
|------|------|---------|------|
| **`auto`** | Claude 自行决定是否调用工具和调用哪个工具 | 通用对话助手，不确定用户是否需要工具 | 模型可能高估或低估工具需求 |
| **`any`** | Claude **必须**调用至少一个工具，但可以选择具体工具 | 工具链路由、强制分类、必须经过特定处理管道 | 即使不需要也会调用，浪费 token |
| **`tool`** (指定名称) | Claude **必须**使用指定的工具，参数由模型填充 | 数据提取（如从文本中提取结构化信息）、分类任务 | 如果工具不合适，模型会「强行」使用 |

> **引用参考：** Anthropic 官方文档详细说明了 `tool_choice` 的工作方式：「当设置为 `any` 时，即使模型认为不需要，也会使用工具。当设置为 `auto` 时，模型自行决定是否调用。」详见 [Anthropic Tool Choice](https://docs.anthropic.com/en/docs/build-with-claude/tool-use#controlling-claudes-output)。

### 概念三：Tool Result 的错误处理

```typescript
// Claude 独特的 is_error 机制
messages.push({
  role: 'user',
  content: [{
    type: 'tool_result',
    tool_use_id: toolUseBlock.id,
    content: '错误: 数据库连接超时',  // 错误信息也作为 tool_result 返回
    is_error: true,  // 标记为错误结果
  }],
});
// Claude 会理解这是错误，尝试其他方法或给出解释
```

**为什么 is_error 重要？** 没有 `is_error` 标记时，Claude 会把错误文本当作正常的工具执行结果来解读——它可能会困惑为什么「数据库连接超时」这个「结果」看起来不像数据。有了 `is_error: true`，Claude 明确知道工具执行失败，从而：
- 尝试用其他参数重试
- 使用其他替代工具
- 向用户解释失败原因并请求指导

### 概念四：流式 Tool Use

```typescript
// 流式接收工具调用
const stream = client.messages.stream({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 1024,
  tools,
  messages,
});

for await (const event of stream) {
  if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
    console.log(`🔧 开始工具调用: ${event.content_block.name}`);
    console.log(`   ID: ${event.content_block.id}`);
  }
  if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
    process.stdout.write(event.delta.partial_json); // 逐字输出工具参数
  }
}
```

流式处理的优势在于**用户体验**——用户可以在工具参数还在生成时就看到进度，而不是等待完整的 JSON 构建完成。对于参数非常大的工具调用（如包含长文本的搜索查询），流式可以显著降低感知延迟。

## 🔨 实战演练

**场景描述：** 你需要将现有的 OpenAI Function Calling 代码迁移到 Claude Tool Use。原始代码使用 OpenAI SDK 调用 `get_weather` 和 `translate` 两个工具，现在需要改为使用 Anthropic SDK。

**你的任务：** 编写一个迁移适配层。给定一个 OpenAI 风格的工具定义数组和返回结果，将其转换为 Claude 风格的格式。具体步骤：
1. 将 OpenAI 的 `tools` 定义（`type: "function"` + `function.parameters`）转换为 Claude 的 `tools`（直接 `input_schema`）
2. 将 OpenAI 返回的 `tool_calls`（`function.arguments` 为 JSON 字符串）转换为 Claude 风格的 tool_use 对象
3. 将 OpenAI 的 `tool` role 结果消息转换为 Claude 的 `tool_result` block

<details>
<summary>💡 参考实现</summary>

```typescript
// OpenAI → Claude 工具定义转换器
function convertTools(openaiTools: any[]): Anthropic.Tool[] {
  return openaiTools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

// OpenAI tool_calls → Claude tool_use 格式
function convertToolCalls(openaiMsg: any) {
  return openaiMsg.tool_calls.map((tc: any) => ({
    type: 'tool_use' as const,
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments), // OpenAI 的 arguments 是字符串！
  }));
}

// 使用示例
const openaiTools = [{
  type: 'function',
  function: {
    name: 'translate',
    description: '翻译文本',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' }, lang: { type: 'string' } },
      required: ['text', 'lang'],
    },
  },
}];

const claudeTools = convertTools(openaiTools);
// → [{ name: 'translate', description: '翻译文本', input_schema: {...} }]
```

</details>

## ⚡ 进阶技巧

1. **避免 `any` 模式的误用**：`tool_choice: { type: 'any' }` 强制 Claude 调用工具，但如果没有任何工具适合用户请求，Claude 可能会「强行」调用一个不太相关的工具。在 `any` 模式下，建议至少提供一个通用的 `respond` 或 `fallback` 工具作为安全兜底。

2. **使用 TypeScript 的 `as const` 保证工具定义类型安全**：

```typescript
const tools = [
  {
    name: 'get_weather',
    description: '获取天气',
    input_schema: {
      type: 'object' as const,
      properties: { city: { type: 'string' as const, description: '城市' } },
      required: ['city'],
    },
  },
] as const;  // 让 TypeScript 精确推断字面量类型
```

3. **消息顺序的严格性**：在 Claude API 中，消息历史必须严格遵循 `user → assistant → user → assistant → ...` 的交替顺序。发送 `tool_result` 时，你必须**先**将 assistant 的响应（包含 tool_use block）推入消息数组，**然后**再推入包含 tool_result 的 user 消息。顺序错误会导致 API 返回 `invalid_message_order` 错误。

## 🧠 知识检查点

**问题 1：** OpenAI 和 Claude 在工具调用的结果反馈方式上有什么区别？

<details>
<summary>答案</summary>
OpenAI 使用独立的 `role: "tool"` 消息，通过 `tool_call_id` 关联到对应的工具调用。Claude 则使用 `role: "user"` 消息中的 `tool_result` 内容块，通过 `tool_use_id` 关联。此外，Claude 原生支持 `is_error: true` 字段标记错误结果，而 OpenAI 需要在 content 字符串中手动描述错误。
</details>

**问题 2：** 什么情况下应该使用 `tool_choice: { type: 'any' }` 而不是 `'auto'`？

<details>
<summary>答案</summary>
当你的应用需要**确保**每次用户请求都经过工具处理管道时，使用 `any`。例如：1) 分类系统需要每次请求都被归类；2) 路由系统需要确保请求被分发到对应的处理工具；3) 数据提取场景需要保证每次输入都被结构化提取。`auto` 适用于不需要每次都用工具的通用对话场景。
</details>

**问题 3：** Claude 流式 Tool Use 中 `input_json_delta` 的作用是什么？

<details>
<summary>答案</summary>
`input_json_delta` 用于流式传输工具参数。与 OpenAI 不同，Claude 不是一次性返回完整的 JSON 参数，而是将参数 JSON 分成多个 `delta` 片段逐步输出。开发者可以实时拼接这些片段来构建完整的参数对象，从而实现工具调用的「打字机效果」，降低用户的感知等待时间。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| 忘记将 assistant 消息加入历史就发送 tool_result | Claude API 要求消息严格交替（user → assistant → user），跳过 assistant 会导致 `invalid_message_order` | 在发送 tool_result 之前，**先**执行 `messages.push({ role: 'assistant', content: response.content })` |
| 混淆 OpenAI 的 `function.arguments`（字符串）和 Claude 的 `input`（对象） | OpenAI 返回的参数是 JSON 字符串需 parse，Claude 直接返回对象 | OpenAI 侧：`JSON.parse(tc.function.arguments)`；Claude 侧：直接使用 `block.input` |
| 在 `any` 模式下没有兜底工具 | 当没有合适的工具可用时，Claude 被迫选择一个，可能导致奇怪的工具调用 | 添加一个通用 `respond` 工具作为 fallback：「直接回复用户，不使用其他工具」 |

## 📝 本章小结

- ✅ **OpenAI vs Claude 格式差异** — OpenAI 的 `tool_calls` + `tool` role vs Claude 的 `tool_use` block + `tool_result` content block；参数格式（字符串 vs 对象）和错误处理方式不同
- ✅ **Tool Choice 三模式** — `auto`（自主）、`any`（强制任意）、`tool`（强制指定），各自有适用场景和风险
- ✅ **is_error 机制** — Claude 原生支持的错误标记，让模型理解工具执行失败并自主修复
- ✅ **流式 Tool Use** — 通过 `input_json_delta` 实时传输工具参数，提升用户体验
- ✅ **消息顺序规范** — Claude API 要求严格交替的消息顺序，违反会导致错误

## ➡️ 下一章预告

> [第3章：工具设计最佳实践](./03-tool-design.md) — 学习如何设计粒度适中、描述清晰、参数合理的工具，让 LLM 能够准确理解和调用。
