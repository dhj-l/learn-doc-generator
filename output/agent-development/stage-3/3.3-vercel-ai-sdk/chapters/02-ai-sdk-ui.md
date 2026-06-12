# 第2章：AI SDK UI — 前端 Hooks 集成

> 预计学习时间：80-100 分钟

## 🎯 本章目标

完成本章学习后，你将能够：

- ✅ **使用** `useChat` hook 构建对话式 AI 聊天界面
- ✅ **使用** `useCompletion` hook 实现文本自动补全功能
- ✅ **搭建** Next.js API Route 作为 AI 后端
- ✅ **处理** 流式响应的消息渲染和加载状态
- ✅ **实现** 错误处理和重试机制

## 📋 前置知识

- 熟悉 React 函数组件和 Hooks（useState、useEffect）
- 了解 Next.js App Router 的基础用法
- 掌握基本的 TypeScript 类型定义

## 💡 核心概念

### Vercel AI SDK 的设计哲学

Vercel AI SDK 解决了 AI 应用开发中一个核心痛点：**前端如何优雅地消费 LLM 的流式输出**。传统的 API 调用需要等 LLM 生成完整响应后才能返回，用户体验极差（想象一下发送消息后盯着空白屏幕等 10 秒）。AI SDK 通过 Web Streams API 实现了真正的流式渲染——Token 生成一个就渲染一个，用户能看到文字逐字出现，体验大幅提升。

SDK 提供了一组 React Hooks，封装了所有与流式 AI 通信的复杂性，让开发者只需关注 UI 呈现。

### useChat Hook — 对话式交互

`useChat` 是 AI SDK 中最核心的 Hook，它管理了整个对话的状态机：

- **messages**：完整的消息历史数组，每条消息包含 id、role、content 字段
- **input**：当前输入框的值
- **handleInputChange**：输入变化事件处理器
- **handleSubmit**：提交消息事件处理器
- **isLoading**：是否正在等待 AI 响应
- **error**：错误状态
- **reload**：重新生成上一条 AI 消息
- **stop**：停止正在生成的 AI 响应

```tsx
// React 组件中使用 useChat
'use client';
import { useChat } from 'ai/react';

export function ChatComponent() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error, reload, stop } = useChat({
    api: '/api/chat',  // 后端 API 路由
  });

  return (
    <div className="chat-container">
      <div className="message-list">
        {messages.map(m => (
          <div key={m.id} className={`message message-${m.role}`}>
            <strong>{m.role === 'user' ? '你' : 'AI'}:</strong>
            {m.content}
          </div>
        ))}
      </div>
      {error && (
        <div className="error-banner">
          出错了：{error.message}
          <button onClick={reload}>重试</button>
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="输入消息..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          {isLoading ? '生成中...' : '发送'}
        </button>
        {isLoading && <button onClick={stop}>停止</button>}
      </form>
    </div>
  );
}
```

### 后端 API 路由

前端 useChat 需要配合一个后端 API 路由使用。这个路由接收前端传来的消息，调用 LLM 后以流式响应返回。

```typescript
// app/api/chat/route.ts (Next.js App Router)
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: '你是一个友好的助手，请用中文回答。',
    messages,
  });

  return result.toDataStreamResponse();
}
```

### useCompletion Hook — 文本补全

与 useChat 不同，useCompletion 适用于「单轮补全」场景，如代码自动补全、邮件撰写、文章续写等。它不维护对话历史，只处理最后一次输入和生成的完成文本。

```tsx
// 自动补全场景
import { useCompletion } from 'ai/react';

export function AutoComplete() {
  const { completion, input, handleChange, handleSubmit, isLoading } = useCompletion({
    api: '/api/completion',
  });

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        value={input}
        onChange={handleChange}
        placeholder="开始输入..."
        rows={5}
      />
      <button onClick={handleSubmit} disabled={isLoading}>
        {isLoading ? '生成中...' : '补全'}
      </button>
      {completion && (
        <div className="completion-preview">
          <h4>AI 建议：</h4>
          <p>{completion}</p>
        </div>
      )}
    </div>
  );
}
```

### 消息渲染进阶

实际应用中，消息内容可能包含 Markdown 格式。我们可以使用 `react-markdown` 库来渲染富文本：

```tsx
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

function MessageContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          return !inline && match ? (
            <SyntaxHighlighter language={match[1]}>
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code className={className} {...props}>{children}</code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

### 错误处理策略

```tsx
export function ChatWithRetry() {
  const { messages, input, handleInputChange, handleSubmit, error, reload } = useChat({
    api: '/api/chat',
    onError: (error) => {
      console.error('Chat error:', error);
      // 可以在这里发送错误日志到监控服务
    },
  });

  return (
    <div>
      {messages.map(m => <p key={m.id}>{m.content}</p>)}
      {error && (
        <div className="error-card">
          <p>⚠️ 请求失败：{error.message}</p>
          <button onClick={reload}>🔄 重新生成</button>
        </div>
      )}
      <form onSubmit={handleSubmit}>...</form>
    </div>
  );
}
```

## ⚡ 进阶技巧

1. **自定义请求头**：在 useChat 的 `headers` 参数中添加认证信息
2. **body 扩展**：通过 `body` 参数向后端传递额外数据（如用户 ID、会话 ID）
3. **onFinish 回调**：在 AI 完成响应后执行后续操作（如保存聊天记录）
4. **多模态支持**：结合 `attachments` 参数实现图片上传和文件分析
5. **乐观更新**：在用户发送消息后立即在 UI 中显示，不需要等后端确认

## 🧠 知识检查点

1. useChat 和 useCompletion 的核心区别是什么？各自适合什么场景？
2. 为什么 AI SDK 使用流式响应而不是一次性返回完整内容？
3. 如何处理用户在 AI 生成过程中发送新消息的情况？
4. 如何在聊天界面中实现「重新生成」和「编辑已发送消息」的功能？

## 🐛 常见错误

- ❌ **忘记添加 'use client'**：AI SDK 的 Hooks 只能在客户端组件中使用
- ❌ **API 路由路径不匹配**：useChat 的 api 参数必须与后端路由路径一致
- ❌ **未处理 loading 状态**：用户可能在 AI 回复过程中重复提交
- ❌ **缺少错误边界**：网络错误或 LLM 超时未捕获，导致 UI 卡死
- ❌ **忽略流式中断**：用户点击停止后，未清理未完成的响应流

## 📝 本章小结

- ✅ **useChat** — 对话式交互的 React Hook，管理完整消息生命周期
- ✅ **useCompletion** — 文本补全的 React Hook，适用于单轮生成场景
- ✅ **后端集成** — Next.js API Route + streamText 实现流式响应
- ✅ **消息渲染** — 结合 react-markdown 实现富文本展示
- ✅ **错误处理** — 通过 onError 和 reload 实现优雅的错误恢复

Vercel AI SDK 将复杂的 AI 流式通信封装为简洁的 React Hooks，让前端开发者能够以最少的代码量构建出流畅的 AI 交互界面。

## ➡️ 下一章预告

> [第3章：多模型支持](./03-multi-model.md) — 学习如何集成多种 LLM 提供商（OpenAI、Anthropic、Google、Mistral），实现模型切换和 fallback 策略
