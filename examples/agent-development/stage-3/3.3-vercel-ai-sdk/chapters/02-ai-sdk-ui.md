# 第2章：AI SDK UI — 前端 Hooks 集成

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 useChat 构建对话界面** — 消息管理、流式渲染、状态追踪
- **使用 useCompletion 实现文本补全** — 自动补全、文本生成场景
- **自定义 Chat Transport** — 修改 API 路径、添加认证头
- **在 Vue 中集成 AI SDK** — 使用框架无关的方式适配 Vue

## 📋 前置知识

> 建议先完成：[第1章：AI SDK Core](./01-ai-sdk-core.md)

---

## 💡 核心概念

### 概念一：useChat — 一行代码构建聊天界面

**生活类比：** 如果说 `streamText` 是后端厨房做菜（处理数据），那 `useChat` 就是前端服务员（展示菜品和接单）。你不需要手动管理消息列表、处理流式数据、维护加载状态——`useChat` 全部帮你搞定。

```
手动实现聊天界面要处理的事情：

  1. 管理消息列表 state              → useChat: 自动
  2. 处理用户输入和表单提交             → useChat: 自动
  3. 发送 POST 请求到后端             → useChat: 自动
  4. 解析 SSE 流式响应                → useChat: 自动
  5. 逐字渲染 AI 回复                 → useChat: 自动
  6. 处理加载状态、错误状态             → useChat: 自动
  7. 支持消息重试/重新生成              → useChat: 自动

有了 useChat：
  const { messages, sendMessage, status } = useChat();
  // 就这些，所有逻辑都在里面了
```

### 概念二：useChat 基础用法

```tsx
// app/page.tsx — Next.js 客户端组件
'use client';

import { useChat } from '@ai-sdk/react';

export default function ChatPage() {
  const { messages, sendMessage, status } = useChat();

  return (
    <div className="flex flex-col max-w-2xl mx-auto p-4">
      {/* 消息列表 */}
      <div className="flex-1 space-y-4 mb-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`p-3 rounded-lg ${
              message.role === 'user'
                ? 'bg-blue-100 ml-auto max-w-[80%]'
                : 'bg-gray-100 max-w-[80%]'
            }`}
          >
            <div className="text-sm text-gray-500 mb-1">
              {message.role === 'user' ? '👤 你' : '🤖 AI'}
            </div>
            {/* 使用 parts 渲染消息内容 */}
            {message.parts.map((part, i) => {
              if (part.type === 'text') {
                return <p key={i} className="whitespace-pre-wrap">{part.text}</p>;
              }
              return null;
            })}
          </div>
        ))}
      </div>

      {/* 输入表单 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem('message') as HTMLInputElement;
          if (input.value.trim()) {
            sendMessage({ text: input.value });
            input.value = '';
          }
        }}
        className="flex gap-2"
      >
        <input
          name="message"
          placeholder="输入消息..."
          className="flex-1 p-2 border rounded"
          disabled={status === 'streaming'}
        />
        <button
          type="submit"
          disabled={status === 'streaming'}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          {status === 'streaming' ? '生成中...' : '发送'}
        </button>
      </form>
    </div>
  );
}
```

### 概念三：后端 API Route

useChat 默认向 `/api/chat` 发送 POST 请求。你需要在后端提供对应的 API：

```typescript
// app/api/chat/route.ts — Next.js App Router
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: '你是一个友好的编程助手。用中文回答，简洁明了。',
    messages,
  });

  // toDataStreamResponse() 将流式输出转为 Data Stream 协议
  // useChat 自动解析这个协议
  return result.toDataStreamResponse();
}
```

> **💡 toDataStreamResponse vs toTextStreamResponse**
>
> `toDataStreamResponse()` 使用 AI SDK 的 Data Stream 协议，支持文本、工具调用、错误等多类型消息。`toTextStreamResponse()` 只传输纯文本。**推荐使用 `toDataStreamResponse()`**，它和 `useChat` 配合最好。

### 概念四：useChat 的核心返回值

```tsx
const {
  messages,          // 消息列表
  sendMessage,       // 发送消息函数
  status,            // 状态: 'submitted' | 'streaming' | 'ready' | 'error'
  error,             // 错误对象
  stop,              // 停止生成
  setMessages,       // 手动设置消息（清空、编辑等）
  reload,            // 重新生成上一条 AI 回复
  input,             // 受控输入值（可选的受控模式）
  handleInputChange, // 受控输入的 onChange（可选的受控模式）
  handleSubmit,      // 受控表单的 onSubmit（可选的受控模式）
} = useChat(options);
```

#### 受控模式 vs 非受控模式

```tsx
// 非受控模式（推荐简单场景）— 用 sendMessage
const { messages, sendMessage, status } = useChat();
// 表单提交时: sendMessage({ text: '用户输入' })

// 受控模式（需要自定义输入逻辑）— 用 input + handleSubmit
const { messages, input, handleInputChange, handleSubmit, status } = useChat();
// <input value={input} onChange={handleInputChange} />
// <form onSubmit={handleSubmit}>...</form>
```

### 概念五：useCompletion — 文本补全

用于非对话式的文本生成场景，比如代码补全、文本续写。

```tsx
// app/page.tsx
'use client';

import { useCompletion } from '@ai-sdk/react';

export function EmailWriter() {
  const { completion, input, setInput, handleSubmit, isLoading, stop } = useCompletion({
    api: '/api/completion',
  });

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h2>📧 AI 邮件助手</h2>

      <form onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="描述你想写的邮件内容..."
          className="w-full p-3 border rounded h-24"
        />
        <div className="flex gap-2 mt-2">
          <button type="submit" disabled={isLoading}
            className="px-4 py-2 bg-green-500 text-white rounded">
            {isLoading ? '生成中...' : '生成邮件'}
          </button>
          {isLoading && (
            <button onClick={stop} className="px-4 py-2 bg-red-500 text-white rounded">
              停止
            </button>
          )}
        </div>
      </form>

      {completion && (
        <div className="mt-4 p-4 bg-gray-50 rounded">
          <h3>生成的邮件：</h3>
          <p className="whitespace-pre-wrap">{completion}</p>
        </div>
      )}
    </div>
  );
}
```

```typescript
// app/api/completion/route.ts
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: '你是一个邮件写作助手。根据用户描述，生成一封专业的邮件。只输出邮件正文。',
    prompt,
  });

  return result.toTextStreamResponse();  // useCompletion 使用纯文本流
}
```

### 概念六：自定义 Chat Transport

当你的 API 路径不是默认的 `/api/chat`，或者需要添加认证头时：

```tsx
// 自定义 API 路径和请求头
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/v2/assistant',  // 自定义 API 路径
    headers: {
      'Authorization': 'Bearer my-token',  // 添加认证
      'X-Custom-Header': 'value',
    },
    body: {
      model: 'claude-sonnet',  // 每次请求都附带的额外参数
    },
  }),
});
```

### 概念七：在 Vue 中使用

Vercel AI SDK 的 UI hooks 是 React 特有的，但 Core 函数（`streamText` 等）是框架无关的。在 Vue 中，你可以用 Core 函数 + EventSource 手动实现：

```vue
<!-- components/ChatBox.vue -->
<template>
  <div class="chat-container">
    <div v-for="msg in messages" :key="msg.id" :class="msg.role">
      <strong>{{ msg.role === 'user' ? '👤' : '🤖' }}</strong>
      <span>{{ msg.content }}</span>
    </div>

    <form @submit.prevent="sendMessage">
      <input v-model="input" placeholder="输入消息..." :disabled="loading" />
      <button type="submit" :disabled="loading">
        {{ loading ? '生成中...' : '发送' }}
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface Message { id: string; role: string; content: string; }

const messages = ref<Message[]>([]);
const input = ref('');
const loading = ref(false);

async function sendMessage() {
  if (!input.value.trim()) return;

  // 添加用户消息
  const userMsg: Message = {
    id: Date.now().toString(),
    role: 'user',
    content: input.value,
  };
  messages.value.push(userMsg);
  const userText = input.value;
  input.value = '';
  loading.value = true;

  // 添加 AI 占位消息
  const aiMsg: Message = {
    id: (Date.now() + 1).toString(),
    role: 'assistant',
    content: '',
  };
  messages.value.push(aiMsg);

  // 调用后端 SSE 接口
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: messages.value.slice(0, -1) }), // 不含占位消息
  });

  // 读取 SSE 流
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    // 解析 AI SDK 的 Data Stream 协议
    const lines = text.split('\n').filter(l => l.startsWith('0:'));
    for (const line of lines) {
      const content = line.slice(2); // 去掉 "0:" 前缀
      try {
        aiMsg.content += JSON.parse(content);
      } catch {
        aiMsg.content += content;
      }
    }
  }

  loading.value = false;
}
</script>
```

---

## 🔨 实战演练

### 练习：构建一个带 Markdown 渲染的聊天界面

**场景描述：** 在上面的 useChat 基础上，添加 Markdown 渲染、代码高亮、复制按钮。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```tsx
// app/page.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export default function ChatPage() {
  const { messages, sendMessage, status, stop } = useChat();

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto">
      {/* 消息区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-lg ${
              message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100'
            }`}>
              {message.parts.map((part, i) => {
                if (part.type !== 'text') return null;
                return message.role === 'user' ? (
                  <p key={i}>{part.text}</p>
                ) : (
                  <ReactMarkdown
                    key={i}
                    components={{
                      code({ node, className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        return match ? (
                          <SyntaxHighlighter style={oneDark} language={match[1]}>
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...props}>{children}</code>
                        );
                      },
                    }}
                  >
                    {part.text}
                  </ReactMarkdown>
                );
              })}
            </div>
          </div>
        ))}

        {status === 'streaming' && (
          <button onClick={stop} className="text-sm text-red-500">⏹ 停止生成</button>
        )}
      </div>

      {/* 输入区 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem('msg') as HTMLInputElement;
          if (input.value.trim()) { sendMessage({ text: input.value }); input.value = ''; }
        }}
        className="p-4 border-t flex gap-2"
      >
        <input name="msg" className="flex-1 p-2 border rounded" placeholder="输入消息..." />
        <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded">发送</button>
      </form>
    </div>
  );
}
```

```bash
# 安装依赖
npm install react-markdown react-syntax-highlighter
npm install -D @types/react-syntax-highlighter
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：消息持久化

```tsx
// 使用 onFinish 回调保存消息
const { messages, sendMessage } = useChat({
  onFinish: (message) => {
    // 每条 AI 回复完成时触发
    localStorage.setItem('chat-messages', JSON.stringify([...messages, message]));
  },
  initialMessages: typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('chat-messages') || '[]')
    : [],
});

// 清空聊天
function clearChat() {
  setMessages([]);
  localStorage.removeItem('chat-messages');
}
```

### 技巧二：错误处理

```tsx
const { messages, sendMessage, error, status } = useChat({
  onError: (error) => {
    console.error('Chat error:', error);
    // 可以发送到错误追踪服务
  },
});

// UI 中显示错误
{error && (
  <div className="bg-red-50 text-red-700 p-3 rounded">
    ⚠️ {error.message}
    <button onClick={() => reload()}>重试</button>
  </div>
)}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：useChat 的 messages 中，每条消息的 `parts` 字段是什么？**

> A：`parts` 是一个数组，包含消息的不同组成部分。最常见的是 `{ type: 'text', text: '...' }` 文本部分，还可能包含工具调用等其他类型。使用 `parts` 而非 `content` 是为了支持更丰富的消息格式。

**Q2：useCompletion 和 useChat 有什么区别？**

> A：`useChat` 是多轮对话式交互，管理完整的消息列表（用户+AI 交替）。`useCompletion` 是单次文本补全，只有输入和输出，没有对话历史。用 `useChat` 做聊天机器人，用 `useCompletion` 做文本续写、代码补全。

**Q3：在 Vue 项目中怎么用 AI SDK 的 UI 功能？**

> A：AI SDK 的 UI hooks（useChat、useCompletion）是 React 专用的。在 Vue 中，你可以直接使用 Core 函数（`streamText` 等）在后端生成流式响应，然后在前端用 `fetch` + `ReadableStream` 或 EventSource 接收。参见本章的概念七。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| useChat 消息不更新 | 未正确传入 setState 回调 | 使用 EventSource 或 useChat 的 onFinish 回调更新状态 |
| 流式输出在移动端卡顿 | 频繁的 React 重渲染 | 使用 React 18 的自动批处理，或用 debounce 控制更新频率 |
| useChat 的 onError 未触发 | 错误被 fetch 的 catch 捕获 | 在 API Route 中返回正确的 HTTP 状态码，而非抛出异常 |
| 自定义 UI 组件不显示 Markdown | 未安装 Markdown 渲染库 | 安装 react-markdown 并配置代码高亮 |

---

## 📝 本章小结

- ✅ **useChat** — React 对话界面的终极解决方案
- ✅ **useCompletion** — 非对话式的文本补全场景
- ✅ **后端 API Route** — `streamText` + `toDataStreamResponse()`
- ✅ **自定义 Transport** — 修改 API 路径、添加认证头
- ✅ **Vue 集成** — Core 函数 + 手动 SSE 接收

## ➡️ 下一章预告

> [第3章：多模型支持](./03-multi-model.md) — 在同一应用中无缝切换 Claude、GPT、Gemini。
