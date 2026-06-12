# Claude API 速查表

---

## 🚀 快速开始

```typescript
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();

const message = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: '你好' }],
});
```

---

## 📋 模型选择

| 模型 ID | 速度 | 能力 | 成本 | 适用场景 |
|---------|------|------|------|----------|
| `claude-haiku-4-5-20251001` | ⚡⚡⚡ | ★★★ | 💰 | 分类、提取、简单对话 |
| `claude-sonnet-4-5-20241022` | ⚡⚡ | ★★★★ | 💰💰 | 通用首选 |
| `claude-opus-4-20250514` | ⚡ | ★★★★★ | 💰💰💰 | 复杂推理、创意 |

---

## 🔧 常用参数

```typescript
{
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 1024,           // 输出 Token 上限
  temperature: 0.7,           // 0-2，越高越随机
  system: '系统指令',          // System Prompt
  stop_sequences: ['\n\n'],   // 停止序列
  top_p: 0.9,                 // 核采样
  messages: [...],             // 消息数组
}
```

---

## 📝 消息格式

```typescript
// 文本消息
{ role: 'user', content: '文本内容' }
{ role: 'assistant', content: '回复内容' }

// 图片消息
{ role: 'user', content: [
  { type: 'image', source: { type: 'base64', media_type: 'image/png', data: '...' } },
  { type: 'text', text: '描述图片' },
]}

// System Prompt（带缓存）
system: [{ type: 'text', text: '...', cache_control: { type: 'ephemeral' } }]
```

---

## 🌊 流式输出

```typescript
const stream = client.messages.stream({ ... });
for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta')
    process.stdout.write(event.delta.text);
}
```

---

## 💰 成本优化

| 技术 | 节省 | 适用场景 |
|------|------|----------|
| Prompt Caching | 90%（缓存部分） | 长 System Prompt |
| Batch API | 50% | 非实时批量任务 |
| 选择小模型 | 70-90% | 简单任务用 Haiku |
| 精简 Prompt | 30-50% | 所有场景 |

---

## ⚠️ 错误类型

| 错误类 | HTTP | 处理 |
|--------|------|------|
| `AuthenticationError` | 401 | 检查 API Key |
| `RateLimitError` | 429 | 指数退避重试 |
| `BadRequestError` | 400 | 检查参数 |
| `APIError` | 500+ | 重试 |

---

## 🔄 重试策略

```typescript
const client = new Anthropic({ maxRetries: 3 });
```
