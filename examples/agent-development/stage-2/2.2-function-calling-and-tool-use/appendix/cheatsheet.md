# Function Calling 速查表

---

## 🔧 Claude Tool Use — 完整流程

```typescript
// 1. 定义工具
const tools = [{
  name: 'get_weather',
  description: '获取指定城市的天气信息',
  input_schema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名（中文）' },
      unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
    },
    required: ['city'],
  },
}];

// 2. 发起调用
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  tools,
  messages: [{ role: 'user', content: '北京今天热吗？' }],
});

// 3. 处理工具调用
if (response.stop_reason === 'tool_use') {
  const toolUse = response.content.find(b => b.type === 'tool_use')!;
  const result = executeTool(toolUse.name, toolUse.input);
  // 4. 返回结果
  messages.push({ role: 'assistant', content: response.content });
  messages.push({
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: result }],
  });
}
```

## 📏 工具设计原则

| 原则 | ✅ 推荐 | ❌ 避免 | 示例 |
|------|--------|--------|------|
| 粒度 | 单一职责，一个工具只做一件事 | 多功能混合 | ✅ `search_docs()` ❌ `search_and_summarize()` |
| 描述 | 说明何时用/不用，附带示例 | "搜索工具" 太模糊 | ✅ "当用户问到技术文档时使用" |
| 参数 | enum约束、default值、清晰描述 | 必填参数超过3个 | ✅ `city: z.enum(['北京','上海']).default('北京')` |
| 错误处理 | 返回具体原因和建议 | "失败" 两个字 | ✅ "未找到城市" 而非 "错误" |

## 🔄 Tool Choice 模式

| 模式 | 写法 | 说明 | 适用场景 |
|------|------|------|----------|
| `auto` | `tool_choice: { type: 'auto' }` | Claude 自行决定 | 大多数通用场景 |
| `any` | `tool_choice: { type: 'any' }` | 强制调用任意工具 | 需要结构化输出时 |
| `tool` | `tool_choice: { type: 'tool', name: 'get_weather' }` | 强制调用指定工具 | 多轮对话中接续 |

## 💡 常见模式速查

```typescript
// 并行调用多个工具
const parallelResponse = await client.messages.create({ model, tools, messages });
// Claude 会自动决定一次调用几个工具

// 工具调用失败重试
try { await executeTool(toolUse.name, toolUse.input); }
catch (e) {
  messages.push({
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: `错误: ${e.message}`, is_error: true }],
  });
}

// 流式 + 工具调用
const stream = client.messages.stream({ model, tools, messages, stream: true });
for await (const event of stream) {
  if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
    console.log('工具调用开始:', event.content_block.name);
  }
}
```

## 🔗 OpenAI Function Calling

| 特性 | Claude Tool Use | OpenAI Function Calling |
|------|-----------------|------------------------|
| 定义方式 | `input_schema` | `parameters` |
| 并行调用 | 支持（自动） | 支持（需设置 `tool_choice`） |
| 停止标志 | `stop_reason: 'tool_use'` | `finish_reason: 'tool_calls'` |
| 结果反馈 | `tool_result` content block | `tool` role message |
| 流式支持 | SSE stream | stream: true |

## ⚠️ 调试技巧

```typescript
// 查看模型选择的工具和参数
console.log(JSON.stringify(toolUse, null, 2));
// 测试工具调用不经过 LLM（直接验证 Schema）
function validateArgs(args: any, schema: object): boolean {
  try { JSON.parse(JSON.stringify(args)); return true; } catch { return false; }
}
```
