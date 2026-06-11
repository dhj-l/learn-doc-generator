# 第2章：Claude Tool Use — Claude 的工具调用深入

> 预计学习时间：70-90 分钟

## 🎯 本章目标

深入掌握 Claude API 的 Tool Use 特性。

## 💡 核心概念

### Claude Tool Use 的独特特性

```typescript
// Claude 的工具调用与 OpenAI 的差异

// 1. 工具选择策略
const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 1024,
  tools,
  tool_choice: { type: 'auto' },  // auto（默认）| any | tool
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
    content: '错误: 数据库连接超时',  // 错误信息也作为 tool_result 返回
    is_error: true,  // 标记为错误结果
  }],
});
// Claude 会理解这是错误，尝试其他方法或给出解释
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
    console.log(`   ID: ${event.content_block.id}`);
  }
  if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
    process.stdout.write(event.delta.partial_json); // 逐字输出工具参数
  }
}
```

### Tool Choice 控制

```typescript
// 场景 1：让 Claude 自行决定（默认）
tool_choice: { type: 'auto' }

// 场景 2：强制使用某个工具（即使 Claude 认为不需要）
tool_choice: { type: 'any' }

// 场景 3：强制使用指定工具
tool_choice: { type: 'tool', name: 'get_weather' }
```

---

## 📝 本章小结

- ✅ **Claude Tool Use** — 原生支持的工具调用 API
- ✅ **并行调用** — 一次响应可请求多个工具
- ✅ **错误处理** — is_error 标记让 Claude 理解工具失败
- ✅ **Tool Choice** — auto/any/tool 三种模式控制调用行为

## ➡️ 下一章预告

> [第3章：工具设计最佳实践](./03-tool-design.md)
