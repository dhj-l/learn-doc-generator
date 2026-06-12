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

#### SSE 到底是怎么把数据「流」到前端的？

你可能觉得「SSE 就是服务器往浏览器推数据嘛」，但问题在于——**HTTP 原本不是这么设计的**。

##### HTTP 的原始设计：一问一答

HTTP 从诞生那天起就是「请求-响应」模型：浏览器问一句，服务器答一句，答完就挂了。就像对讲机——你按着说话，对方听完再回你，不能同时说。

这对普通网页浏览完全够用——你点个链接，服务器返回页面，完事。但对于 AI 流式输出就有问题了：AI 生成一段文字需要 5-10 秒，如果按传统 HTTP，用户得等 10 秒页面才刷新——这体验太差了。

##### SSE 的解法：答完了别挂电话

SSE 的思路特别朴素：**服务器回答完了别断开连接，继续往同一个通道里写数据就行了。**

这不是什么魔法，它靠的是 HTTP/1.1 的一个隐藏功能——**分块传输编码（Chunked Transfer Encoding）**。

你平时请求网页时，服务器是知道网页多大了（`Content-Length: 4096`），一次性把整个页面发给你。但 SSE 的场景是：AI 在生成了第一个字之后，**不知道**后面还要生成多少个字——可能 100 个，也可能 1000 个。

分块传输编码就是用来解决这个问题的：服务器告诉浏览器「我不知道总大小，但我会一块一块发给你，你收到一块就展示一块，直到我发一个『空块』告诉你结束了」。

```
传统方式（没有分块传输）：
  浏览器：给我内容
  服务器：[_等一下，我在等 AI 生成完...10 秒后...]_ 给你！（一次性发完）
  用户：⏳⏳⏳⏳⏳⏳⏳ 等 10 秒才看到内容

SSE 方式（用分块传输）：
  浏览器：给我内容
  服务器：好，我先发第一个字 → 再发第二个 → 再发第三个 → ...
  用户：😊 实时看到内容出现
```

##### SSE 的文本协议：其实就是一个文本格式约定

前面说了底层数据传输的原理。但光能传数据还不够——传过来的是一堆 `data: 你好\n\n` 这种文本，浏览器怎么知道什么时候是一条完整的消息？

SSE 协议定义了一个**极其简单**的文本格式：

```
# 普通的文本消息
data: 这是消息内容\n\n

# 跨多行的消息
data: 这是第一行\n
data: 这是第二行\n\n

# 带类型的事件（前端可以用 addEventListener 区分）
event: token\n
data: {"text": "你好"}\n\n

# 告诉浏览器下次重连间隔
retry: 3000\n\n

# 给消息编号，断线重连时告诉服务端从哪里继续
id: 42\n
data: 消息内容\n\n
```

规则只有三条：
1. 每行以 `data:`、`event:`、`id:` 或 `retry:` 开头
2. 两条换行符 `\n\n` 表示一条消息结束
3. 浏览器收到后自动解析这些字段，开发者只需监听 `onmessage` 事件

你可能会问：**为什么 SSE 不直接用 JSON？** 因为在浏览器原生 API（`EventSource`）设计时（2010 年左右），SSE 的定位是简单文本推送，不用 JSON 也能工作。实际上 AI 场景中传输的数据还是 JSON 字符串，只不过外面包了一层 SSE 的 `data:` 壳。

##### 为什么 SSE 比 WebSocket 轻量？

这个问题的本质区别在于**是否需要额外握手**。

SSE 走的是 HTTP 协议 80/443 端口，跟普通网页请求走的是同一条路。浏览器只需要 `new EventSource(url)` 就搞定了——跟发一个普通 HTTP GET 请求几乎一样。

WebSocket 则不同：它要从 HTTP「升级」到 WebSocket 协议（101 Switching Protocols）。好比两台设备本来用 USB 线传数据，现在想改用 HDMI——需要拔下来、协商好新协议、再插上。这个额外握手虽然只耗时几十毫秒，但意味着更复杂的服务器配置和网络兼容性考虑。

所以我的选择建议很简单：**只需要服务器推数据给客户端 → SSE；需要双向实时通信（客户端也要随时发数据给服务器）→ WebSocket。** 别为了「技术时髦」选 WebSocket。

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

## ⚡ 进阶技巧

### 技巧一：EventSource 命名事件

```typescript
// 服务端使用 event: 字段区分不同类型的事件
res.write(`event: token\ndata: ${JSON.stringify({ text: 'hello' })}\n\n`)
res.write(`event: done\ndata: {}\n\n`)
res.write(`event: error\ndata: ${JSON.stringify({ message: 'timeout' })}\n\n`)

// 前端监听不同类型
const es = new EventSource('/api/stream')
es.addEventListener('token', (e) => appendText(JSON.parse(e.data).text))
es.addEventListener('done', () => es.close())
es.addEventListener('error', (e) => showError(JSON.parse(e.data).message))
```

### 技巧二：自定义重连延迟

```typescript
// 服务端通过 retry: 字段告诉客户端重连间隔
res.write(`retry: 3000\n`) // 告诉客户端 3 秒后重连
// 客户端自动使用此值，无需手动设置 setTimeout
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：SSE 和 WebSocket 在连接开销上有什么不同？**

> A：SSE 基于 HTTP，复用已有连接，无需额外握手。WebSocket 需要从 HTTP 升级到 WebSocket 协议（一次额外握手）。对于简单的流式输出场景，SSE 的连接开销更小、更轻量。

**Q2：EventSource 默认支持断线重连，为什么还要手动实现？**

> A：EventSource 的自动重连是简单的「断开后立刻重连」，没有指数退避和最大重试限制。在服务端故障场景下，这会导致大量客户端同时重连，可能再次压垮服务端。手动实现指数退避重连更健壮。

**Q3：fetch + ReadableStream 相比 EventSource 有什么优势？**

> A：EventSource 只支持 GET 请求，无法自定义请求头。fetch 方式支持 POST 方法、自定义 Content-Type、携带请求体。对于 AI 对话场景（需要 POST 发送用户消息），fetch 方式更灵活。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| SSE 数据被 Nginx 缓冲 | Nginx 默认缓冲 HTTP 响应 | 设置 `X-Accel-Buffering: no` 响应头 |
| EventSource 连接数超限 | 同一域名最多 6 个 SSE 连接 | 使用 HTTP/2 复用连接，或用单一 SSE 通道分发事件 |
| 响应头漏设导致不触发 onmessage | 未设置 `Content-Type: text/event-stream` | 确保在写入任何数据前设置响应头 |
| 断线后重连导致消息重复 | 服务端从断点重放消息 | 使用 Last-Event-ID 字段告知服务端最后收到的消息 ID |

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
