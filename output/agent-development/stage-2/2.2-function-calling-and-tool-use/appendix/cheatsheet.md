# Function Calling 速查表

---

## 🔧 Claude Tool Use

```typescript
// 定义工具
const tools = [{
  name: 'tool_name',
  description: '工具描述（LLM 靠这个决定何时调用）',
  input_schema: { type: 'object', properties: {...}, required: [...] },
}];

// 调用
const response = await client.messages.create({ model, tools, messages });

// 检查是否调用了工具
if (response.stop_reason === 'tool_use') {
  // 提取工具调用
  const toolUse = response.content.find(b => b.type === 'tool_use');
  // 执行工具
  const result = executeTool(toolUse.name, toolUse.input);
  // 反馈结果
  messages.push({ role: 'assistant', content: response.content });
  messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: result }] });
}
```

## 📏 工具设计原则

| 原则 | ✅ 做 | ❌ 不做 |
|------|-------|--------|
| 粒度 | 单一职责 | 太粗或太细 |
| 描述 | 说明何时用/不用 | 简短模糊 |
| 参数 | enum 约束、default | 必填参数过多 |
| 错误 | 说明原因和建议 | 只返回 "失败" |

## 🔄 Tool Choice

| 模式 | 说明 |
|------|------|
| `auto` | Claude 自行决定（默认） |
| `any` | 强制调用某个工具 |
| `tool` | 强制调用指定工具 |
