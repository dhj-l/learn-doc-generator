# 第2章：Claude Tool Use — Claude 的工具调用深入

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **深入掌握 Claude API 的 Tool Use 特性** — 与 OpenAI 的工具调用差异
- **理解 Tool Choice 三种模式** — auto、any、tool 的区别和用法
- **实现流式 Tool Use** — 在流式响应中处理工具调用

## 📋 前置知识

> 建议先完成：[第1章：Function Calling 基础](./01-function-calling-basics.md)

---

## 💡 核心概念

### Claude Tool Use 的独特特性

Claude 的工具调用和 OpenAI 的最大区别是：**Claude 通过消息内容中的 `tool_use` block 表达工具调用意图**，而非独立的函数调用字段。

```typescript
// Claude 的工具调用与 OpenAI 的差异

// 1. 工具选择策略
const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 1024,
  tools,
  tool_choice: { type: 'auto' },
  // auto: Claude 自行决定是否调用工具
  // any: 强制 Claude 调用某个工具
  // tool: 强制调用指定的工具
  messages,
});

// 2. 多工具并行调用
// Claude 可以在一次响应中请求调用多个工具
// 例如同时查天气和计算

// 3. Tool Result 的错误处理
messages.push({
  role: 'user',
  content: [{
    type: 'tool_result',
    tool_use_id: toolUseBlock.id,
    content: '错误: 数据库连接超时',
    is_error: true,  // 标记为错误
  }],
});
```

### 流式 Tool Use

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
  }
  if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
    process.stdout.write(event.delta.partial_json); // 逐字输出参数
  }
}
```

### Tool Choice 控制

| 模式 | 代码 | 行为 | 适用场景 |
|------|------|------|----------|
| auto | `{type:'auto'}` | Claude 自行决定 | 默认，大部分场景 |
| any | `{type:'any'}` | 强制调用一个工具 | 必须使用工具的任务 |
| tool | `{type:'tool', name:'xxx'}` | 强制使用指定工具 | 指定工具的场景 |

---

## 🔨 实战演练

**场景描述：**
你正在构建一个多语言客服助手，需要处理用户的查询并根据情况决定是否查数据库、翻译内容或发送通知。你需要利用 Claude 的 Tool Choice 机制精确控制行为。

**你的任务：**
1. 使用 `tool_choice: { type: 'tool', name: 'query_knowledge_base' }` 实现一个必须查知识库才能回答的工作流
2. 在同一个对话中，第二步让 Claude 自由决定是否需要调用 `translate_message` 工具
3. 实现流式输出，在控制台实时展示 Claude 的思考过程和工具调用

<details>
<summary>🧑‍💻 先自己实现，再展开看参考答案</summary>

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const tools: Anthropic.Tool[] = [
  {
    name: 'query_knowledge_base',
    description: '查询客服知识库获取标准答案',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '用户问题关键词' },
      },
      required: ['query'],
    },
  },
  {
    name: 'translate_message',
    description: '将消息翻译成目标语言',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        target_lang: { type: 'string', enum: ['en', 'ja', 'ko', 'fr'] },
      },
      required: ['text', 'target_lang'],
    },
  },
];

async function customerSupport(userMessage: string, lang: string) {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  // 第一步：强制查询知识库
  const step1 = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1024,
    tools,
    tool_choice: { type: 'tool', name: 'query_knowledge_base' },
    messages,
  });

  // 处理工具结果...
  const toolResult = executeTool(/* ... */);
  messages.push({ role: 'assistant', content: step1.content });
  messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'xxx', content: toolResult }] });

  // 第二步：让 Claude 自由决定是否需要翻译
  const step2 = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1024,
    tools,
    tool_choice: { type: 'auto' },
    messages,
  });

  return step2.content;
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：使用 `is_error` 让 Claude 从错误中学习
当工具执行失败时，设置 `is_error: true` 可以帮助 Claude 理解错误并尝试替代方案：

```typescript
// 模拟数据库查询失败后自动切换策略
const result = await queryDatabase(sql);
if (!result.success) {
  messages.push({
    role: 'user',
    content: [{
      type: 'tool_result',
      tool_use_id: block.id,
      content: `查询失败: ${result.error}。可尝试的替代方案：
1. 检查表名是否存在
2. 使用更简单的查询条件
3. 如果连接超时，稍后重试`,
      is_error: true,
    }],
  });
  continue; // 让 Claude 决定下一步
}
```

### 技巧二：混合使用流式文本和工具调用
Claude 可以在流式响应中先输出一段思考文本，再调用工具。前端可以实时展示推理过程：

```typescript
const stream = client.messages.stream({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 2048,
  tools,
  messages: [{ role: 'user', content: '分析这个数据并生成报表' }],
});

for await (const event of stream) {
  switch (event.type) {
    case 'content_block_start':
      if (event.content_block.type === 'text') {
        process.stdout.write('🤔 思考中...\n');
      } else if (event.content_block.type === 'tool_use') {
        process.stdout.write(`\n🔧 调用工具: ${event.content_block.name}\n`);
      }
      break;
    case 'content_block_delta':
      if (event.delta.type === 'text_delta') {
        process.stdout.write(event.delta.text);
      } else if (event.delta.type === 'input_json_delta') {
        process.stdout.write(event.delta.partial_json);
      }
      break;
  }
}
```

### 技巧三：Tool Choice 动态切换策略
根据对话的不同阶段动态调整 tool_choice，可以更精准地控制 Claude 行为：

```typescript
// 第一阶段：强制使用搜索工具查找信息
const searchResponse = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 1024,
  tools: [searchTool],
  tool_choice: { type: 'tool', name: 'web_search' }, // 强制搜索
  messages,
});

// 第二阶段：让 Claude 自由决定是否调用其他工具
const finalResponse = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 1024,
  tools: [searchTool, summarizeTool, translateTool],
  tool_choice: { type: 'auto' }, // 自由选择
  messages,
});
```

---

## 🧠 知识检查点

### Q1: Claude 的 `tool_choice: { type: 'any' }` 和 `{ type: 'auto' }` 有什么区别？

<details>
<summary>点击展开答案</summary>

- `auto`：Claude 自行判断是否需要调用工具，可以调用也可以不调用。适合大部分场景。
- `any`：强制 Claude 必须调用**某个**工具（但不指定具体哪个）。适用于必须使用工具的场景，如数据检索类的任务。注意 `any` 不保证调用指定的某一个工具，Claude 会选择它认为最合适的。

</details>

### Q2: 如何在流式响应中检测工具调用的开始？

<details>
<summary>点击展开答案</summary>

在流式事件中监听 `content_block_start` 事件，检查 `event.content_block.type === 'tool_use'`。当首次检测到时，可以读取 `event.content_block.name` 获取工具名称和 `event.content_block.id` 获取调用 ID。后续的 `input_json_delta` 事件会携带逐步生成的工具参数 JSON。

</details>

### Q3: 如果工具执行失败，如何让 Claude 理解并做出合理的补救？

<details>
<summary>点击展开答案</summary>

在返回 tool_result 时设置 `is_error: true`，并在 `content` 中提供详细的错误信息和可行的替代方案。例如：「查询失败：数据库连接超时。建议：1. 简化查询条件 2. 稍后重试 3. 使用缓存数据」。Claude 会阅读这个反馈并决定下一步行动，比如重试或使用备用方案。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 流式处理中遗漏部分 tool_use block | 以为并行调用只在单次非流式响应中出现，忽略了流式中的多个 content_block_start | 在流式事件循环中跟踪所有 `content_block_start` 事件，将 tool_use block 收集到数组中统一处理 |
| 错误使用 `tool_choice: { type: 'any' }` 导致不可预测的调用 | `any` 模式只保证调用某个工具，但不保证调用的是哪个工具 | 若需指定具体工具，使用 `{ type: 'tool', name: 'xxx' }`；若只是想允许工具调用，用 `auto` |
| 未处理 Claude 同时返回文本和 tool_use | Claude 可以在同一响应中既输出文本思考过程，又调用工具 | 遍历 `response.content` 时分别处理 `text` block 和 `tool_use` block，不要假设一次只返回一种类型 |

---

## 📝 本章小结

- ✅ **Claude Tool Use** — 原生支持的工具调用 API
- ✅ **并行调用** — 一次响应可请求多个工具
- ✅ **错误处理** — is_error 标记让 Claude 理解工具失败
- ✅ **Tool Choice** — auto/any/tool 三种模式控制调用行为

## ➡️ 下一章预告

> [第3章：工具设计最佳实践](./03-tool-design.md)
