# 第1章：SSE（Server-Sent Events）— AI 流式输出的标准方案

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 SSE 的工作原理** — 单向服务端推送的 Web 标准
- **实现 AI 流式输出的后端** — Node.js + SSE 转发 LLM 流
- **在前端消费 SSE 流** — 实时渲染 AI 输出
- **处理 SSE 的断线重连** — 保证流式体验的健壮性

## 📋 前置知识

> 建议先完成：[1.2 Claude API 第3章：流式输出](../../stage-1/1.2-claude-api/chapters/03-streaming.md)

---

## 💡 核心概念

### 概念一：为什么 AI 应用需要 SSE？

**生活类比：** 想象你在看直播（SSE）vs 等别人录好视频再发给你（非流式）。直播让你实时看到内容，不用等全部录完。

```
HTTP 请求/响应（非流式）：
  客户端 → 发送请求 → [等待 5 秒] → 收到完整响应 → 显示

SSE（流式）：
  客户端 → 发送请求 → [0.1秒] → 收到第1个字 → [0.1秒] → 第2个字 → ...
  用户立刻开始看到内容，即使生成还需要几秒
```

| 特性 | SSE | WebSocket |
|------|-----|-----------|
| 方向 | 服务端 → 客户端（单向） | 双向 |
| 协议 | HTTP | 独立协议 |
| 复杂度 | 低 | 高 |
| 自动重连 | ✅ 内置 | ❌ 需手动 |
| 适用场景 | AI 流式输出 | 聊天室、游戏 |

### 概念二：后端 SSE 实现

```typescript
// src/server-sse.ts
import express from 'express';
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const app = express();
app.use(express.json());

// SSE 端点
app.post('/api/chat/stream', async (req, res) => {
  const { messages } = req.body;

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx 不缓冲

  // 处理客户端断开
  req.on('close', () => {
    console.log('客户端断开连接');
  });

  try {
    const result = streamText({
      model: anthropic('claude-sonnet-4-5-20241022'),
      system: '你是一个编程助手。',
      messages,
    });

    // 逐块发送到客户端
    for await (const chunk of result.textStream) {
      res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
    }

    // 发送完成信号
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: (error as Error).message })}\n\n`);
    res.end();
  }
});

app.listen(3000, () => console.log('服务运行在 http://localhost:3000'));
```

### 概念三：前端 SSE 消费

```typescript
// src/client-sse.ts

// 方式 1：使用 EventSource（GET 请求）
const es = new EventSource('/api/chat/stream?q=hello');
es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'done') {
    es.close();
  } else if (data.type === 'text') {
    appendToUI(data.content);
  }
};
es.onerror = () => {
  console.error('SSE 连接错误');
  es.close();
};

// 方式 2：使用 fetch（POST 请求，更灵活）
async function streamChat(messages: any[]) {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // 按行解析 SSE 数据
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';  // 保留不完整的行

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'text') {
          appendToUI(data.content);
        } else if (data.type === 'done') {
          return;
        }
      }
    }
  }
}
```

### 概念四：Vue 3 组件实现

```vue
<!-- StreamChat.vue -->
<template>
  <div class="stream-chat">
    <!-- 消息列表 -->
    <div class="messages">
      <div v-for="msg in messages" :key="msg.id" :class="msg.role">
        <div class="avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
        <div class="content" v-html="renderMarkdown(msg.content)" />
      </div>
    </div>

    <!-- 输入框 -->
    <form @submit.prevent="sendMessage" class="input-form">
      <input v-model="input" placeholder="输入消息..." :disabled="isLoading" />
      <button type="submit" :disabled="isLoading || !input.trim()">
        {{ isLoading ? '生成中...' : '发送' }}
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const messages = ref<Message[]>([]);
const input = ref('');
const isLoading = ref(false);

async function sendMessage() {
  const userMsg: Message = {
    id: Date.now().toString(),
    role: 'user',
    content: input.value.trim(),
  };
  messages.value.push(userMsg);
  input.value = '';
  isLoading.value = true;

  // 创建 AI 消息占位
  const aiMsg: Message = {
    id: (Date.now() + 1).toString(),
    role: 'assistant',
    content: '',
  };
  messages.value.push(aiMsg);

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.value.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'text') {
            aiMsg.content += data.content;  // 逐字追加
          }
        }
      }
    }
  } catch (error) {
    aiMsg.content = `\n\n❌ 错误: ${(error as Error).message}`;
  } finally {
    isLoading.value = false;
  }
}

function renderMarkdown(text: string): string {
  // 简单的 Markdown 渲染
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}
</script>
```

### 概念五：断线重连

```typescript
// src/reconnect-sse.ts

class ReconnectingSSE {
  private url: string;
  private maxRetries: number;
  private retryCount = 0;
  private retryDelay = 1000;

  constructor(url: string, maxRetries = 5) {
    this.url = url;
    this.maxRetries = maxRetries;
  }

  async connect(onMessage: (data: any) => void, onDone: () => void) {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this.retryCount = 0; // 重置重试计数

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          onDone();
          break;
        }

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          const data = JSON.parse(line.slice(6));
          onMessage(data);
        }
      }
    } catch (error) {
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = this.retryDelay * Math.pow(2, this.retryCount - 1); // 指数退避
        console.warn(`连接失败，${delay}ms 后重试 (${this.retryCount}/${this.maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        return this.connect(onMessage, onDone);
      }
      throw error;
    }
  }
}
```

---

## 🔨 实战演练

### 练习：实现带进度指示的流式输出

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```vue
<!-- StreamingWithProgress.vue -->
<template>
  <div class="streaming-container">
    <!-- 进度指示器 -->
    <div v-if="isLoading" class="progress-bar">
      <div class="progress-fill" :style="{ width: progress + '%' }" />
      <span class="progress-text">{{ statusText }}</span>
    </div>

    <!-- 输出内容（打字机效果） -->
    <div class="output" ref="outputRef">
      <span v-html="renderedContent" />
      <span v-if="isLoading" class="cursor">|</span>
    </div>

    <!-- 统计信息 -->
    <div v-if="stats" class="stats">
      <span>📊 {{ stats.tokens }} tokens</span>
      <span>⏱️ {{ stats.latency }}ms</span>
      <span>🚀 {{ stats.speed }} tokens/s</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';

const content = ref('');
const isLoading = ref(false);
const progress = ref(0);
const outputRef = ref<HTMLElement | null>(null);
const stats = ref<{ tokens: number; latency: number; speed: number } | null>(null);

const statusText = computed(() => {
  if (progress.value < 20) return '正在理解问题...';
  if (progress.value < 80) return '正在生成回答...';
  return '即将完成...';
});

const renderedContent = computed(() => {
  return content.value.replace(/`(.+?)`/g, '<code>$1</code>').replace(/\n/g, '<br>');
});

async function startStream(prompt: string) {
  content.value = '';
  isLoading.value = true;
  progress.value = 0;
  stats.value = null;

  const startTime = Date.now();
  let tokenCount = 0;

  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n').filter(l => l.startsWith('data: '));

    for (const line of lines) {
      const data = JSON.parse(line.slice(6));
      if (data.type === 'text') {
        content.value += data.content;
        tokenCount++;
        progress.value = Math.min(95, progress.value + 2);

        // 自动滚动到底部
        await nextTick();
        if (outputRef.value) {
          outputRef.value.scrollTop = outputRef.value.scrollHeight;
        }
      }
    }
  }

  const elapsed = Date.now() - startTime;
  isLoading.value = false;
  progress.value = 100;
  stats.value = {
    tokens: tokenCount,
    latency: elapsed,
    speed: Math.round(tokenCount / (elapsed / 1000)),
  };
}
</script>
```

</details>

---

## 📝 本章小结

- ✅ **SSE 原理** — 单向服务端推送，HTTP 协议，自动重连
- ✅ **后端实现** — Express + LLM 流式转发
- ✅ **前端消费** — fetch + ReadableStream 或 EventSource
- ✅ **Vue 组件** — 实时流式渲染 + 打字机效果
- ✅ **断线重连** — 指数退避 + 自动恢复
- ✅ **进度指示** — 让用户知道生成进度

## ➡️ 下一章预告

> [第2章：WebSocket 双向通信](./02-websocket.md) — 需要双向实时通信的场景。
