# 第2章：WebSocket 双向通信 — 实时 Agent 交互

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 WebSocket 实现 Agent 和客户端的双向通信**
- **处理 Agent 的实时状态推送** — 思考过程、工具调用、流式输出
- **实现用户中断控制** — 取消正在进行的 Agent 操作

## 📋 前置知识

> 建议先完成：
> - [第1章：SSE（Server-Sent Events）](./01-sse.md) — 理解单向流式通信的基础

---

## 💡 核心概念

### 为什么需要 WebSocket？

**生活类比：** SSE 就像广播电台——你只能听，不能跟主持人对话。WebSocket 就像电话——你和对方都可以随时说话。Agent 交互不是单向的「听广播」——用户需要发送消息、确认操作、取消任务，Agent 也需要随时推送状态更新。

#### WebSocket 协议原理

WebSocket 协议（RFC 6455）是 HTML5 规范中定义的**全双工通信协议**，它在单个 TCP 连接上提供双向通信能力。

**与 HTTP 的关系：** WebSocket 连接始于一次 HTTP 握手：

```
客户端 → 服务端（握手请求）：
  GET /chat HTTP/1.1
  Host: server.example.com
  Upgrade: websocket          ← 请求协议升级
  Connection: Upgrade
  Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==  ← 安全校验
  Sec-WebSocket-Version: 13

服务端 → 客户端（握手响应）：
  HTTP/1.1 101 Switching Protocols
  Upgrade: websocket
  Connection: Upgrade
  Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=  ← 校验确认
```

握手成功后，连接从 HTTP 协议升级为 WebSocket 协议，此时通信不再受 HTTP 请求-响应模型的约束——两端可以随时发送数据。

#### WebSocket 的数据是怎么传输的？

你可能以为 WebSocket 就是「直接发文本」，其实它用的是一种**二进制帧**格式——每个消息外面包了一个「信封」：

```
 0        1        2        3
|────────|────────|────────|────────|
|FIN|RSV| OPCODE  |MASK| PAYLOAD  |
|   |   | (4 bit) | 1  | LEN(7)   |
|────────|────────|────────|────────|
|   扩展长度（如果有的话）          |
|   掩码密钥（如果有的话）           |
|   实际数据...                     |
```

你不用记住这个图的每个字段，但需要知道几个最关键的：

1. **Opcode（操作码）**— 告诉接收方「这是什么类型的数据」：`0x1` 是文本、`0x2` 是二进制（文件）、`0x8` 是关闭连接、`0x9` 是 Ping（心跳检测）、`0xA` 是 Pong（心跳回复）

2. **FIN** — 大消息分成多个帧时，最后一个帧的 FIN=1。就像快递分多个包裹，最后一个包裹上贴个「此单完结」标签

3. **Masking** — 浏览器发往服务器的消息必须加密掩码（防一种叫「缓存污染」的安全攻击），服务器发往浏览器的消息不需要

你可能想问：**为什么 WebSocket 不直接用 SSE 那样的纯文本格式？**

原因很简单：WebSocket 的定位比 SSE 重很多——它要支持发二进制数据（图片、文件）、大消息分片传输、以及心跳检测。如果纯文本一行行传输，你怎么在一段文字里嵌入一张图片？没法做。所以 WebSocket 选择了更通用的二进制帧结构。

但在实际写代码时，你完全不用关心这些底层细节——`ws.send('你好')` 发出去，框架自动打包成帧，对方 `ws.onmessage` 收到时已经解包好了。

你只需要自己加一个**心跳保活机制**：

```typescript
// 每隔 30 秒检查连接是否还活着
const heartbeat = setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }))
  } else {
    reconnect()
  }
}, 30000)
```

为什么要心跳？因为网络不是可靠的——WiFi 断了、路由器重启了、中间防火墙把死连接清了，这些都不会通知浏览器。如果不做心跳，你跟一个已经断开的连接互发消息，永远等不到回复，页面就像卡住了一样。

#### SSE vs WebSocket 选型指南

| 特性 | SSE (EventSource) | WebSocket |
|------|-------------------|-----------|
| 通信方向 | 服务端 → 客户端（单向） | 双向 |
| 协议 | HTTP | 独立协议（ws://） |
| 自动重连 | ✅ 内置 | ❌ 需手动实现 |
| 消息格式 | 纯文本（特定格式） | 文本或二进制 |
| 并发连接限制 | 浏览器限制（通常 6 个/域名） | 无限制 |
| 适用场景 | AI 流式输出 | 聊天室、Agent 实时交互 |

**Agent 交互中 WebSocket 的典型消息流：**

```
客户端 → 服务端：{"type":"user_message", "payload":"分析这个数据"}
服务端 → 客户端：{"type":"status", "payload":"thinking"}
服务端 → 客户端：{"type":"token", "payload":"正在..."}
服务端 → 客户端：{"type":"tool_call", "payload":{"name":"search","status":"running"}}
服务端 → 客户端：{"type":"tool_result", "payload":{"id":"1","result":"..."}}
服务端 → 客户端：{"type":"status", "payload":"completed"}
客户端 → 服务端：{"type":"cancel"}
```

### WebSocket Agent Server 实现

```typescript
import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

// 管理所有客户端连接
const clients = new Map<string, WebSocket>();

wss.on('connection', (ws) => {
  const clientId = crypto.randomUUID();
  clients.set(clientId, ws)
  console.log(`客户端 ${clientId} 已连接 (在线: ${clients.size})`)

  ws.on('message', async (data) => {
    const { type, payload } = JSON.parse(data.toString())

    switch (type) {
      case 'user_message':
        await handleUserMessage(ws, payload)
        break
      case 'cancel':
        handleCancel(clientId)
        break
      case 'user_decision':
        handleUserDecision(clientId, payload)
        break
    }
  })

  ws.on('close', () => {
    clients.delete(clientId)
    console.log(`客户端 ${clientId} 已断开 (在线: ${clients.size})`)
  })
})

// 处理用户消息
async function handleUserMessage(ws: WebSocket, message: string) {
  // 1. 通知客户端 Agent 开始思考
  ws.send(JSON.stringify({ type: 'status', payload: 'thinking' }))

  // 2. 流式输出 AI 响应
  const response = await processAgentMessage(message)
  for await (const chunk of response) {
    ws.send(JSON.stringify({ type: 'token', payload: chunk }))
  }

  // 3. 通知工具调用
  ws.send(JSON.stringify({
    type: 'tool_call',
    payload: { name: 'search', status: 'running' },
  }))

  // 4. 发送工具结果
  ws.send(JSON.stringify({
    type: 'tool_result',
    payload: { name: 'search', result: '...', duration: '1.2s' },
  }))

  // 5. 通知完成
  ws.send(JSON.stringify({ type: 'status', payload: 'completed' }))
}

// 处理用户中断
function handleCancel(clientId: string) {
  currentAbortController?.abort()
  const ws = clients.get(clientId)
  ws?.send(JSON.stringify({ type: 'status', payload: 'cancelled' }))
}
```

> **💡 为什么 Agent 需要多种消息类型而不仅是「文本」？** Agent 交互包含多种语义：状态变更（thinking/completed）、文本内容（token）、工具调用信息（tool_call）、需要用户确认（approval）。如果只用一种消息类型，前端无法区分「收到的是 AI 回复文字还是状态更新」。多种消息类型让前端能精确处理每种事件。

### 前端 WebSocket 客户端

```typescript
// websocket-client.ts
class AgentWebSocketClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, (payload: any) => void>()
  private url: string

  constructor(url: string) {
    this.url = url
  }

  connect() {
    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => console.log('✅ WebSocket 已连接')
    this.ws.onmessage = (event) => {
      const { type, payload } = JSON.parse(event.data)
      const handler = this.handlers.get(type)
      if (handler) handler(payload)
    }
    this.ws.onclose = () => console.log('🔌 WebSocket 已断开')
    this.ws.onerror = (err) => console.error('❌ WebSocket 错误:', err)
  }

  // 注册事件处理器
  on(type: string, handler: (payload: any) => void) {
    this.handlers.set(type, handler)
  }

  // 发送消息
  send(type: string, payload: any) {
    this.ws?.send(JSON.stringify({ type, payload }))
  }

  disconnect() {
    this.ws?.close()
    this.ws = null
  }
}

// 使用示例
const agent = new AgentWebSocketClient('ws://localhost:8080/agent')

agent.on('status', (status) => {
  agentStatus.value = status
})
agent.on('token', (text) => {
  streamContent.value += text
})
agent.on('tool_call', (tool) => {
  toolCalls.value.push(tool)
})
agent.on('tool_result', (result) => {
  updateToolResult(result)
})

// 发送用户消息
agent.send('user_message', '分析这个数据集')
```

### Vue 3 WebSocket 组合式函数

```typescript
// composables/useWebSocket.ts
import { ref, onUnmounted } from 'vue'

export function useAgentWebSocket(url: string) {
  const ws = ref<WebSocket | null>(null)
  const status = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const lastMessage = ref<any>(null)

  function connect() {
    status.value = 'connecting'
    ws.value = new WebSocket(url)

    ws.value.onopen = () => { status.value = 'connected' }
    ws.value.onmessage = (event) => {
      lastMessage.value = JSON.parse(event.data)
    }
    ws.value.onerror = () => { status.value = 'error' }
    ws.value.onclose = () => { status.value = 'disconnected' }
  }

  function send(type: string, payload: any) {
    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify({ type, payload }))
    }
  }

  onUnmounted(() => {
    ws.value?.close()
  })

  return { status, lastMessage, connect, send }
}
```

---

## 🔨 实战演练

### 练习：构建一个实时 Agent 对话应用

**场景描述：** 使用 WebSocket 连接实现一个 Agent 对话应用——用户可以发送消息，实时看到 Agent 的思考状态、流式输出、工具调用。

**你的任务：**
1. 实现 WebSocket 连接管理
2. 处理 Agent 的状态推送（thinking → executing → completed）
3. 实现流式文字的实时渲染
4. 支持用户取消正在进行的操作

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```vue
<!-- RealtimeAgentChat.vue -->
<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const messages = ref<ChatMessage[]>([])
const inputText = ref('')
const agentStatus = ref('idle')
const toolCalls = reactive<Array<{ name: string; status: string }>>([])

let ws: WebSocket | null = null

onMounted(() => {
  ws = new WebSocket('ws://localhost:8080/agent')

  ws.onmessage = (event) => {
    const { type, payload } = JSON.parse(event.data)

    switch (type) {
      case 'status':
        agentStatus.value = payload
        if (payload === 'thinking') {
          messages.value.push({ role: 'assistant', content: '' })
        }
        break
      case 'token':
        // 追加到最后一条助手消息
        const lastMsg = messages.value[messages.value.length - 1]
        if (lastMsg?.role === 'assistant') {
          lastMsg.content += payload
        }
        break
      case 'tool_call':
        toolCalls.push({ name: payload.name, status: payload.status })
        break
      case 'tool_result':
        const tool = toolCalls.find(t => t.name === payload.name)
        if (tool) tool.status = 'completed'
        break
      case 'error':
        agentStatus.value = 'error'
        messages.value.push({ role: 'assistant', content: `❌ ${payload}` })
        break
    }
  }
})

function sendMessage() {
  if (!inputText.value.trim() || !ws) return

  messages.value.push({ role: 'user', content: inputText.value })
  ws.send(JSON.stringify({
    type: 'user_message',
    payload: inputText.value,
  }))
  inputText.value = ''
}

function cancelTask() {
  ws?.send(JSON.stringify({ type: 'cancel' }))
  agentStatus.value = 'idle'
}
</script>

<template>
  <div class="realtime-chat">
    <!-- 状态栏 -->
    <div class="status" :class="agentStatus">
      🧠 Agent: {{ agentStatus === 'idle' ? '等待中' :
         agentStatus === 'thinking' ? '思考中...' :
         agentStatus === 'executing' ? '执行中...' :
         agentStatus === 'completed' ? '已完成' : '出错了' }}
    </div>

    <!-- 消息列表 -->
    <div class="messages">
      <div v-for="(msg, i) in messages" :key="i" :class="msg.role">
        <strong>{{ msg.role === 'user' ? '👤' : '🤖' }}</strong>
        <div>{{ msg.content }}<span v-if="i === messages.length - 1 && agentStatus === 'thinking'" class="cursor">|</span></div>
      </div>
    </div>

    <!-- 工具调用 -->
    <div v-if="toolCalls.length" class="tools">
      <div v-for="tool in toolCalls" :key="tool.name" class="tool-badge">
        🔧 {{ tool.name }}: {{ tool.status === 'completed' ? '✅' : '🔄' }}
      </div>
    </div>

    <!-- 输入区 -->
    <div class="input-area">
      <input v-model="inputText" @keyup.enter="sendMessage"
        :disabled="agentStatus === 'thinking' || agentStatus === 'executing'" />
      <button v-if="agentStatus === 'thinking' || agentStatus === 'executing'"
        @click="cancelTask" class="cancel">取消</button>
      <button v-else @click="sendMessage" :disabled="!inputText.trim()">发送</button>
    </div>
  </div>
</template>

<style scoped>
.realtime-chat { border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
.status { padding: 8px; border-radius: 4px; margin-bottom: 12px; font-size: 14px; }
.status.thinking { background: #e3f2fd; }
.status.executing { background: #fff3e0; }
.status.completed { background: #e8f5e9; }
.status.error { background: #ffebee; }
.messages { height: 300px; overflow-y: auto; margin-bottom: 12px; }
.cursor { animation: blink 0.8s infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
.tools { margin-bottom: 12px; }
.tool-badge { display: inline-block; padding: 4px 8px; background: #f5f5f5; border-radius: 4px; margin: 2px; font-size: 13px; }
.input-area { display: flex; gap: 8px; }
input { flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
button { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; }
.cancel { background: #e74c3c; color: white; }
</style>
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：消息序列号与顺序保证

```typescript
// 服务端为每条消息添加序列号
let seq = 0
function sendWithSeq(ws: WebSocket, type: string, payload: any) {
  ws.send(JSON.stringify({ type, payload, seq: seq++ }))
}
// 前端按序列号排序，确保消息顺序
let lastSeq = 0
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.seq < lastSeq) return // 丢弃旧消息
  lastSeq = msg.seq
}
```

### 技巧二：心跳保活

```typescript
// 每 30 秒发送心跳包
setInterval(() => {
  ws.send(JSON.stringify({ type: 'ping' }))
}, 30000)

// 服务端回复 pong
ws.on('message', (data) => {
  const { type } = JSON.parse(data.toString())
  if (type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong' }))
  }
})
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：WebSocket 和 SSE 在 AI 流式输出场景中应该怎么选？**

> A：如果只需要「AI 输出文字→用户看」，SSE 就够了（更简单、内置重连）。如果需要「用户发送消息→AI 思考→AI 调用工具→AI 输出→用户取消→AI 响应取消」，就必须用 WebSocket。Agent 交互几乎总是需要 WebSocket。

**Q2：WebSocket 断线后怎么恢复对话状态？**

> A：服务端保存每个 session 的消息历史和 Agent 状态，断线时客户端用 sessionId 重连，服务端恢复状态。前端也需要保存消息列表的本地备份，重连后比较差异。

**Q3：为什么需要消息序列号？**

> A：WebSocket 虽然基于 TCP（有序），但在多线程服务器或多节点部署下，消息可能乱序到达。序列号让客户端能检测并纠正乱序。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| WebSocket 连接被防火墙拦截 | ws:// 协议在某些网络环境中被阻止 | 使用 wss://（加密）或回退到 SSE + HTTP POST |
| 消息格式不一致导致解析失败 | 前后端消息 type 字段命名不同 | 定义严格的消息协议规范，前后端共享类型定义 |
| 未处理连接断开导致消息丢失 | 断线后继续 send，但不检查连接状态 | send 前检查 readyState，断线时缓存消息 |
| 心跳超时误判为断线 | 心跳间隔设置过长，网络抖动导致超时 | 心跳间隔 30 秒，超时时间 10 秒，允许少量丢包 |
| 多个组件各自创建 WebSocket 连接 | 每个组件独立实例化，浪费连接资源 | 全局单例共享 WebSocket 连接 |

---

## 📝 本章小结

- ✅ **WebSocket 支持双向实时通信** — Agent 推送状态 + 用户发送指令/取消
- ✅ **多种消息类型** — status/token/tool_call/tool_result/approval
- ✅ **前端组合式函数** — useAgentWebSocket 封装连接管理
- ✅ **用户中断控制** — 通过 WebSocket 发送 cancel 消息
- ✅ **心跳保活** — 30 秒心跳检测连接健康状态

## ➡️ 下一章预告

> 本章学习了 WebSocket 双向通信。在下一章中，我们将学习如何处理 AI 流式输出中的结构化数据——流式 JSON 解析。
> [第3章：流式 JSON 解析](./03-streaming-json.md)
