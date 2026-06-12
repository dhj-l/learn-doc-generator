# 第5章：断线重连与状态恢复

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **实现 SSE/WebSocket 的自动重连** — 在网络中断后自动恢复连接
- **在网络中断后恢复 Agent 的对话状态** — 用户无感知地恢复对话
- **处理重连时的数据一致性** — 避免消息丢失或重复

## 📋 前置知识

> 建议先完成：
> - [第1章：SSE（Server-Sent Events）](./01-sse.md) — 了解 SSE 的基础
> - [第2章：WebSocket 双向通信](./02-websocket.md) — 了解 WebSocket 连接管理

---

## 💡 核心概念

### 为什么需要断线重连？

**生活类比：** 想象你在打重要电话时信号断了。如果电话能自动重拨并继续通话，你几乎不会注意到信号中断。但如果电话断了就永远断了，你得重新拨号、重新解释一遍——这体验就很糟糕。Agent 对话也是这样——网络的暂时波动不应该让用户丢失对话上下文。

### 指数退避重连策略

```typescript
class ReconnectingSSE {
  private url: string
  private eventSource: EventSource | null = null
  private reconnectAttempts = 0
  private maxRetries = 10
  private baseDelay = 1000    // 初始延迟 1 秒
  private maxDelay = 30000    // 最大延迟 30 秒

  connect() {
    this.eventSource = new EventSource(this.url)

    this.eventSource.onopen = () => {
      console.log('✅ SSE 已连接')
      this.reconnectAttempts = 0  // 连接成功时重置重试计数
    }

    this.eventSource.onmessage = (event) => {
      // 处理消息...
    }

    this.eventSource.onerror = () => {
      this.eventSource?.close()

      if (this.reconnectAttempts < this.maxRetries) {
        // 指数退避计算
        const delay = Math.min(
          this.baseDelay * Math.pow(2, this.reconnectAttempts),
          this.maxDelay
        )
        // 加入随机抖动，防止多个客户端同时重连
        const jitter = delay * (0.5 + Math.random() * 0.5)

        console.log(`⏳ ${jitter}ms 后重试 (${this.reconnectAttempts + 1}/${this.maxRetries})`)

        setTimeout(() => {
          this.reconnectAttempts++
          this.connect()
        }, jitter)
      } else {
        console.error('❌ 重连次数已达上限')
      }
    }
  }
}
```

> **💡 为什么需要指数退避而不是固定间隔重试？** 如果是服务端故障（比如服务器重启），固定间隔的秒级重试会在服务器恢复前浪费几十次请求。而指数退避从 1 秒开始，如果还没恢复就等 2 秒、4 秒、8 秒……直到 30 秒——这样既能在短时故障后快速恢复，又不会在长时故障时产生大量请求。

**重连延迟表：**

| 重试次数 | 基础延迟 | 随机抖动后 |
|---------|---------|-----------|
| 1 | 1.0s | 0.5s - 1.0s |
| 2 | 2.0s | 1.0s - 2.0s |
| 3 | 4.0s | 2.0s - 4.0s |
| 4 | 8.0s | 4.0s - 8.0s |
| 5 | 16.0s | 8.0s - 16.0s |
| 6+ | 30.0s | 15.0s - 30.0s |

### 状态恢复

```typescript
// 断线后重新连接时恢复对话
interface SessionData {
  sessionId: string
  messages: Array<{ role: string; content: string }>
  agentStatus: string
  toolCalls: Array<{ name: string; status: string }>
  lastSeq: number
}

async function restoreSession(sessionId: string) {
  try {
    const response = await fetch(`/api/session/${sessionId}`)
    if (!response.ok) {
      throw new Error('Session 不存在或已过期')
    }
    const session: SessionData = await response.json()

    // 恢复消息历史和 Agent 状态
    messages.value = session.messages
    agentStatus.value = session.agentStatus
    toolCalls.value = session.toolCalls
    lastSeq.value = session.lastSeq

    console.log(`✅ 已恢复 Session ${sessionId} (${session.messages.length} 条消息)`)
  } catch (error) {
    console.warn('⚠️ Session 恢复失败，开始新的对话')
    messages.value = []
    agentStatus.value = 'idle'
  }
}
```

### 完整的重连管理器

```typescript
// ReconnectionManager.ts
class ReconnectionManager {
  private sessionId: string
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxRetries = 10
  private isConnecting = false
  private messageQueue: any[] = []  // 断线期间累积的消息

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  async connect() {
    if (this.isConnecting) return
    this.isConnecting = true

    try {
      // 尝试恢复 session
      await this.restoreSession()

      // 建立 WebSocket 连接
      this.ws = new WebSocket(`ws://localhost:8080/agent?sessionId=${this.sessionId}`)

      this.ws.onopen = () => {
        console.log('✅ 已连接')
        this.reconnectAttempts = 0
        this.isConnecting = false

        // 发送断线期间累积的消息
        for (const msg of this.messageQueue) {
          this.ws!.send(JSON.stringify(msg))
        }
        this.messageQueue = []
      }

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        // 检查序列号，避免重复处理
        if (data.seq && data.seq <= lastSeq.value) return
        if (data.seq) lastSeq.value = data.seq
        // 处理消息...
      }

      this.ws.onclose = () => {
        this.scheduleReconnect()
      }

    } catch (error) {
      console.error('连接失败:', error)
      this.scheduleReconnect()
    }
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    } else {
      // 缓存消息，待重连后发送
      this.messageQueue.push(data)
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxRetries) {
      console.error('重连次数已达上限')
      return
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    const jitter = delay * (0.5 + Math.random() * 0.5)
    this.reconnectAttempts++
    setTimeout(() => this.connect(), jitter)
  }

  private async restoreSession() {
    const response = await fetch(`/api/session/${this.sessionId}`)
    if (response.ok) {
      const session = await response.json()
      // 恢复状态...
    }
  }

  disconnect() {
    this.ws?.close()
    this.ws = null
    this.messageQueue = []
  }
}
```

---

## 🔨 实战演练

### 练习：构建一个带自动重连的 SSE 聊天组件

**场景描述：** 你的 AI 聊天应用需要支持断线自动重连，并且重连后能恢复之前的对话状态，用户无感知。

**你的任务：**
1. 实现 SSE 的指数退避自动重连
2. 断线时缓存用户消息，重连后自动发送
3. 使用 sessionId 恢复对话状态
4. 在 UI 中显示连接状态

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```vue
<!-- AutoReconnectChat.vue -->
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const sessionId = ref(crypto.randomUUID())
const messages = ref<Message[]>([])
const inputText = ref('')
const connectionStatus = ref<'connected' | 'disconnected' | 'reconnecting' | 'error'>('disconnected')
const pendingMessages = reactive<string[]>([])

let eventSource: EventSource | null = null
let reconnectAttempts = 0
const MAX_RETRIES = 10

onMounted(() => {
  connectSSE()
})

onUnmounted(() => {
  eventSource?.close()
})

function connectSSE() {
  connectionStatus.value = 'reconnecting'
  eventSource?.close()

  eventSource = new EventSource(`/api/chat/stream?sessionId=${sessionId.value}`)

  eventSource.onopen = () => {
    connectionStatus.value = 'connected'
    reconnectAttempts = 0

    // 恢复消息历史
    restoreMessages()
  }

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data)

    if (data.type === 'token') {
      // 追加到最后一条 AI 消息
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg?.role === 'assistant') {
        lastMsg.content += data.content
      }
    } else if (data.type === 'done') {
      // AI 回复完成
    } else if (data.type === 'restored') {
      // 服务端返回了恢复的消息历史
      messages.value = data.messages
    }
  }

  eventSource.onerror = () => {
    connectionStatus.value = 'disconnected'
    eventSource?.close()

    if (reconnectAttempts < MAX_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
      const jitter = delay * (0.5 + Math.random() * 0.5)
      reconnectAttempts++
      setTimeout(connectSSE, jitter)
    } else {
      connectionStatus.value = 'error'
    }
  }
}

function sendMessage() {
  if (!inputText.value.trim()) return

  messages.value.push({ role: 'user', content: inputText.value })
  const text = inputText.value
  inputText.value = ''

  fetch('/api/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: sessionId.value,
      message: text,
    }),
  }).catch(() => {
    // 发送失败，缓存消息
    pendingMessages.push(text)
  })
}

async function restoreMessages() {
  if (pendingMessages.length === 0) return

  // 重连后发送缓存的消息
  const toSend = [...pendingMessages]
  pendingMessages.length = 0

  for (const msg of toSend) {
    messages.value.push({ role: 'user', content: msg })
  }

  // 批量发送到服务端
  try {
    await fetch('/api/chat/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId.value,
        messages: toSend,
      }),
    })
  } catch (error) {
    console.error('批量发送失败:', error)
  }
}

function getStatusText() {
  switch (connectionStatus.value) {
    case 'connected': return '🟢 已连接'
    case 'disconnected': return '🔴 已断开'
    case 'reconnecting': return '🟡 重连中...'
    case 'error': return '🔴 连接失败'
  }
}
</script>

<template>
  <div class="auto-reconnect-chat">
    <div class="status-bar" :class="connectionStatus">
      {{ getStatusText() }}
      <span v-if="pendingMessages.length" class="pending">
        ({{ pendingMessages.length }} 条消息等待发送)
      </span>
    </div>

    <div class="header">
      <h3>💬 AI 聊天 (Session: {{ sessionId.slice(0, 8) }}...)</h3>
      <button v-if="connectionStatus === 'error'" @click="connectSSE" class="retry-btn">
        重新连接
      </button>
    </div>

    <div class="messages">
      <div v-for="msg in messages" :key="msg.content" :class="msg.role">
        <strong>{{ msg.role === 'user' ? '👤' : '🤖' }}</strong>
        <span>{{ msg.content }}</span>
      </div>
    </div>

    <div class="input-area">
      <input
        v-model="inputText"
        @keyup.enter="sendMessage"
        :disabled="connectionStatus === 'disconnected' || connectionStatus === 'error'"
        :placeholder="connectionStatus === 'connected' ? '输入消息...' : '等待连接...'"
      />
      <button @click="sendMessage" :disabled="!inputText.trim()">发送</button>
    </div>
  </div>
</template>

<style scoped>
.auto-reconnect-chat { border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
.status-bar { padding: 4px 8px; font-size: 12px; border-radius: 4px; margin-bottom: 8px; }
.status-bar.connected { background: #e8f5e9; }
.status-bar.disconnected, .status-bar.error { background: #ffebee; }
.status-bar.reconnecting { background: #fff8e1; }
.pending { margin-left: 8px; color: #f39c12; }
.header { display: flex; justify-content: space-between; align-items: center; }
.retry-btn { padding: 4px 12px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; }
.messages { height: 250px; overflow-y: auto; margin: 12px 0; padding: 8px; background: #fafafa; border-radius: 4px; }
.input-area { display: flex; gap: 8px; }
input { flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
button { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; }
</style>
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：服务端 Session 自动清理

```typescript
// 服务端定期清理过期的 Session
class SessionManager {
  private sessions = new Map<string, { data: SessionData; lastActive: number }>()
  private TTL = 30 * 60 * 1000 // 30 分钟无活动自动清理

  constructor() {
    // 每 5 分钟清理一次
    setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  private cleanup() {
    const now = Date.now()
    for (const [id, session] of this.sessions) {
      if (now - session.lastActive > this.TTL) {
        this.sessions.delete(id)
        console.log(`🧹 清理过期 Session: ${id}`)
      }
    }
  }
}
```

### 技巧二：乐观更新

```typescript
// 用户发送消息时立即显示，不等服务端确认
function sendMessageOptimistic(text: string) {
  // 立即在 UI 中显示用户消息
  messages.value.push({ role: 'user', content: text, status: 'sending' })

  // 异步发送到服务端
  fetch('/api/chat/send', { method: 'POST', body: JSON.stringify({ text }) })
    .then(() => {
      // 更新消息状态为已发送
      updateMessageStatus('sent')
    })
    .catch(() => {
      // 发送失败，标记为失败
      updateMessageStatus('failed')
    })
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：指数退避重连的「随机抖动」为什么重要？**

> A：假设服务端发生故障后恢复，如果没有随机抖动，所有客户端都会在完全相同的时刻重连——这可能导致「惊群效应」：服务端瞬间收到大量连接请求，可能再次宕机。随机抖动（0.5x-1.5x 的基础延迟）让每个客户端的重连时间错开，负载均匀分配到几秒内。

**Q2：如何避免断线重连后消息重复？**

> A：使用消息序列号（seq）去重。每条消息附带一个递增的序列号，前端收到消息时检查序列号是否已经处理过。如果序列号小于等于已处理的最大序列号，直接丢弃。

**Q3：Session 恢复的合理超时时间是多少？**

> A：建议 30 分钟。太短（如 5 分钟）会导致用户离开一会回来就丢失上下文。太长（如 24 小时）会占用过多服务端存储。30 分钟是大多数对话场景的合理平衡——聊天平均持续 8-15 分钟，30 分钟足够覆盖绝大多数场景。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 断线后消息丢失 | 未实现消息缓存和重发机制 | 离线时缓存消息，重连后自动重发 |
| 重连后消息重复 | 服务端和客户端各自重发，导致消息翻倍 | 消息序列号去重，或在消息中包含客户端 ID |
| 重连次数无限 | 没有设置最大重试次数 | 设置上限（10-20 次），超限后提示用户手动刷新 |
| Session 永不过期 | 服务端不清理 Session，内存持续增长 | 设置 TTL，定期清理过期的 Session |
| 重连时 UI 闪烁 | 重连导致的 DOM 更新影响了用户操作 | 重连过程对用户透明，不改变当前 UI 状态 |

---

## 📝 本章小结

- ✅ **指数退避重连** — 1s → 2s → 4s → ... → 30s max
- ✅ **随机抖动** — 防止惊群效应
- ✅ **消息缓存** — 断线期间缓存消息，重连后自动发送
- ✅ **Session 恢复** — 使用 sessionId 恢复对话上下文
- ✅ **序列号去重** — 避免消息重复
- ✅ **Session TTL** — 30 分钟过期自动清理

## ➡️ 下一步

> 完成 4.3 流式传输与实时通信的学习后，进入 [4.4 Agent 评估与可观测性](../4.4-agent-evaluation-and-observability/README.md) — 了解如何评估 Agent 质量、使用可观测性工具。
> [4.4 Agent 评估与可观测性](../4.4-agent-evaluation-and-observability/README.md)
