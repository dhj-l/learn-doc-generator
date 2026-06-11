# 第2章：AI SDK UI — 前端 Hooks 集成

> 预计学习时间：80-100 分钟

## 💡 核心概念

### useChat Hook

```tsx
// React 组件中使用 useChat
'use client';
import { useChat } from 'ai/react';

export function ChatComponent() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',  // 后端 API 路由
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          <strong>{m.role}:</strong> {m.content}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit" disabled={isLoading}>发送</button>
      </form>
    </div>
  );
}
```

### 后端 API 路由

```typescript
// app/api/chat/route.ts (Next.js App Router)
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: '你是一个友好的助手',
    messages,
  });

  return result.toDataStreamResponse();
}
```

### useCompletion Hook

```tsx
// 自动补全场景
import { useCompletion } from 'ai/react';

export function AutoComplete() {
  const { completion, input, handleChange, handleSubmit } = useCompletion({
    api: '/api/completion',
  });

  return (
    <div>
      <textarea value={input} onChange={handleChange} />
      <button onClick={handleSubmit}>生成</button>
      <div>{completion}</div>
    </div>
  );
}
```

---

## 📝 本章小结

- ✅ **useChat** — 对话式交互的 React Hook
- ✅ **useCompletion** — 文本补全的 React Hook
- ✅ **后端集成** — Next.js API Route + streamText

## ➡️ 下一章预告

> [第3章：多模型支持](./03-multi-model.md)
