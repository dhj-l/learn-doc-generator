# Function Calling & Tool Use 速查表

> 涵盖 Claude Tool Use / Function Calling 的核心概念、API 用法、设计模式和最佳实践。

---

## 📦 工具定义基础

```typescript
// Claude API 工具定义格式
const weatherTool = {
  name: 'get_weather',
  description: '获取指定城市的实时天气信息。传入城市名称（中文或英文皆可），返回当前温度、湿度、风速、天气状况等数据。',
  input_schema: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: '城市名称，例如 "北京"、"Tokyo"、"New York"',
      },
      unit: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: '温度单位，默认为 celsius',
      },
    },
    required: ['city'],
  },
};
```

## 🚀 工具调用流程

| 步骤 | 操作 | 代码示例 |
|------|------|----------|
| 1. 定义工具 | 声明工具的 name、description、input_schema | `const tools = [searchTool, calcTool]` |
| 2. 发送请求 | 将 tools 传入 Messages API | `client.messages.create({ model, tools, messages })` |
| 3. 检查响应 | 判断 `stop_reason === 'tool_use'` | `response.stop_reason` |
| 4. 提取调用 | 从 content 中提取 tool_use block | `content.find(b => b.type === 'tool_use')` |
| 5. 执行工具 | 调用本地函数执行实际逻辑 | `executeTool(toolUse.name, toolUse.input)` |
| 6. 返回结果 | 以 tool_result 格式追加到 messages | `{ role: 'user', content: [{ type: 'tool_result', ... }] }` |

## 🔄 完整调用循环

```typescript
async function toolLoop(client: Anthropic, config: ToolLoopConfig) {
  let { model, system, messages, tools, maxIterations = 10 } = config;
  let iteration = 0;

  while (iteration < maxIterations) {
    const response = await client.messages.create({
      model,
      system,
      messages,
      tools,
      max_tokens: 4096,
    });

    // 判断是否结束
    if (response.stop_reason === 'end_turn') break;

    // 收集工具调用的结果
    const toolResults: ContentBlock[] = [];
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        const result = await executeTool(block.name, block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
    iteration++;
  }

  return messages[messages.length - 1];
}
```

## ⚙️ Tool Choice 模式

| 模式 | 配置方式 | 行为说明 | 适用场景 |
|------|----------|----------|----------|
| `auto` | `tool_choice: { type: 'auto' }` | Claude 自主判断是否调用 | 通用场景（默认） |
| `any` | `tool_choice: { type: 'any' }` | 每次响应必须调用至少一个工具 | 需要持续工具交互 |
| `tool` | `tool_choice: { type: 'tool', name: 'xxx' }` | 强制调用指定名称的工具 | 明确指定工具时 |
| `none` | 新版支持 | 禁止调用任何工具 | 纯文本回复场景 |

## 🧩 并行工具调用

```typescript
// Claude 支持一次返回多个 tool_use block（并行调用）
// 处理时需要为每个 tool_use 收集对应的 tool_result

const toolUseBlocks = response.content.filter(
  (b): b is ToolUseBlock => b.type === 'tool_use'
);

// 并行执行所有工具
const results = await Promise.all(
  toolUseBlocks.map(async (block) => {
    const result = await executeTool(block.name, block.input);
    return {
      type: 'tool_result' as const,
      tool_use_id: block.id,
      content: JSON.stringify(result),
    };
  })
);

messages.push({ role: 'user', content: results });
```

## 📏 工具设计最佳实践

| 原则 | 推荐做法 | 反模式 |
|------|----------|--------|
| 单一职责 | 一个工具只做一件事 | 一个工具做查询+更新+删除 |
| 描述清晰 | 说明何时用/何时不用此工具 | 描述只有一两个词 |
| 参数约束 | 多用 enum、pattern 约束 | 全部 string 无限制 |
| 必填最小化 | 只标记真正必要的参数 | 5+ 个必填参数 |
| 错误信息 | 返回可读的错误原因 + 建议 | 只返回 "error" 或 "failed" |
| 返回结构 | 返回结构化 JSON 数据 | 返回长篇叙述文本 |

## 🔁 工具链编排模式

```typescript
// 顺序链：工具 A → 工具 B（A 的输出作为 B 的输入）
// 适用于：搜索 → 分析 → 总结

// 条件路由：根据工具结果决定下一步
async function executeWithRouting(toolName: string, args: any) {
  const result = await executeTool(toolName, args);
  if (result.needsMoreInfo) {
    // 返回一个"需要补充信息"的特殊结果
    return { status: 'needs_input', question: result.question };
  }
  return { status: 'done', data: result };
}
```

## ⚠️ 错误处理模式

| 错误场景 | 处理方式 |
|----------|----------|
| 工具调用超时 | 设置超时兜底，返回 `{ error: 'timeout', partial: ... }` |
| 工具抛出异常 | 捕获后返回 readable 错误消息 |
| 参数验证失败 | 返回具体哪个参数不合法 |
| API 限流 | 实现指数退避重试 |
| 无效的 tool_use_id | 确保每次 tool_result 的 id 与收到的 tool_use 的 id 一致 |

## 🔑 关键 API 速查

| API | 说明 | 示例 |
|-----|------|------|
| `client.messages.create()` | 发送消息（含 tools） | `{ model, tools, messages, system }` |
| `stop_reason === 'tool_use'` | 识别工具调用 | `response.stop_reason` |
| `block.type === 'tool_use'` | 提取 tool_use block | `content.find(b => b.type === 'tool_use')` |
| `tool_choice: { type: 'any' }` | 强制调用工具 | `tool_choice: { type: 'any' }` |
| `tool_choice: { type: 'tool', name: 'x' }` | 指定具体工具 | `tool_choice: { type: 'tool', name: 'get_weather' }` |
| `{ type: 'tool_result', tool_use_id, content }` | 返回执行结果 | 追加到 user message |
| `max_tokens` | 限制响应长度 | `max_tokens: 4096` |
| `stream: true` | 流式返回工具调用 | 逐块处理 content blocks |
