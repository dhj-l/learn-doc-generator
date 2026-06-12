# 第5章：综合实战 — Agent 控制台

> 预计学习时间：100-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **综合运用第1-4章的知识** — 交互模式、状态展示、工具可视化、人机协作
- **构建一个完整的 Agent 控制台** — 从设计到实现的完整流程
- **实现 Agent 的生命周期管理** — 状态机、工具调用、用户交互

## 📋 前置知识

> 建议先完成本章之前的所有章节：
> - [第1章：Agent 交互模式设计](./01-interaction-patterns.md)
> - [第2章：Agent 状态展示](./02-status-display.md)
> - [第3章：工具调用可视化](./03-tool-visualization.md)
> - [第4章：人机协作界面](./04-human-in-loop-ui.md)

---

## 💡 需求分析与项目设计

### 需求概述

构建一个 **Agent 控制台**——这是一个可复用的前端 UI 框架，用于与 AI Agent 进行交互。用户可以通过它向 Agent 下达指令、实时查看 Agent 的思考过程和工具调用、在关键步骤进行人工审批。

### 功能需求

```
用户故事 1（开发者）：
「我是后端开发者，我想在前端看到一个清晰的 Agent 运行面板，知道 Agent 在想什么、调了什么工具、卡在了哪里。」

用户故事 2（产品经理）：
「我需要 Agent 在执行删除/发送操作前先让我确认，不能直接执行。」

用户故事 3（测试人员）：
「我想查看 Agent 的完整执行日志，包括每个步骤的耗时和结果。」
```

### 功能列表

| 模块 | 功能 | 对应前章 |
|------|------|---------|
| 对话面板 | 用户发送消息，AI 回复 | 第1章 |
| 状态栏 | 实时显示 Agent 当前状态 | 第2章 |
| 工具调用面板 | 展示工具名称、参数、结果、耗时 | 第3章 |
| 审批面板 | 需要用户确认的操作展示 | 第4章 |
| 执行日志 | 完整的 Agent 执行时间线 | 第2章 |

---

## 技术选型与架构设计

### 技术栈

| 技术 | 用途 |
|------|------|
| Vue 3 + TypeScript | 前端框架 |
| Pinia | 状态管理 |
| WebSocket | 实时通信 |
| Vite | 构建工具 |

### 项目结构

```
agent-console/
├── components/
│   ├── AgentStatus.vue      # Agent 状态展示（第2章）
│   ├── ToolCallCard.vue     # 工具调用卡片（第3章）
│   ├── HumanInLoop.vue      # 人机协作审批面板（第4章）
│   └── ChatPanel.vue        # 对话面板（第1章）
├── stores/
│   └── agent-store.ts       # Agent 统一状态管理
├── types/
│   └── agent.ts             # TypeScript 类型定义
├── utils/
│   └── websocket.ts         # WebSocket 连接管理
├── App.vue
└── main.ts
```

### 核心 Store 设计

```typescript
// stores/agent-store.ts — Agent 状态管理中心
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'awaiting_input' | 'completed' | 'error'

export interface ToolCall {
  id: string
  name: string
  args: Record<string, any>
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: any
  error?: string
  duration?: number
}

export interface ApprovalRequest {
  id: string
  action: string
  description: string
  preview: string
  riskLevel: 'low' | 'medium' | 'high'
}

export const useAgentStore = defineStore('agent', () => {
  const status = ref<AgentStatus>('idle')
  const messages = ref<Array<{ role: string; content: string }>>([])
  const toolCalls = ref<ToolCall[]>([])
  const approvalRequest = ref<ApprovalRequest | null>(null)

  // 计算属性
  const isProcessing = computed(() =>
    status.value === 'thinking' || status.value === 'executing'
  )
  const hasError = computed(() => status.value === 'error')
  const needsApproval = computed(() => status.value === 'awaiting_input')

  // Agent 核心处理逻辑
  async function processUserInput(input: string) {
    status.value = 'thinking'
    messages.value.push({ role: 'user', content: input })

    try {
      // 通过 WebSocket 发送给后端 Agent
      ws.send(JSON.stringify({ type: 'user_message', payload: input }))
      // 后续状态更新通过 WebSocket 事件驱动
    } catch (error) {
      status.value = 'error'
      messages.value.push({ role: 'assistant', content: `❌ 错误: ${error}` })
    }
  }

  // WebSocket 事件处理
  function handleAgentEvent(event: any) {
    switch (event.type) {
      case 'status_change':
        status.value = event.payload
        break
      case 'tool_call':
        toolCalls.value.push(event.payload)
        break
      case 'tool_result':
        updateToolResult(event.payload)
        break
      case 'approval_required':
        status.value = 'awaiting_input'
        approvalRequest.value = event.payload
        break
      case 'streaming_token':
        appendToLastMessage(event.payload)
        break
      case 'completed':
        status.value = 'completed'
        break
      case 'error':
        status.value = 'error'
        break
    }
  }

  function updateToolResult(payload: { id: string; result?: any; error?: string }) {
    const tool = toolCalls.value.find(t => t.id === payload.id)
    if (tool) {
      tool.status = payload.error ? 'failed' : 'completed'
      tool.result = payload.result
      tool.error = payload.error
      tool.duration = Date.now() - (tool as any).startTime
    }
  }

  function approveAction(decision: 'approve' | 'reject' | 'modify', modification?: string) {
    ws.send(JSON.stringify({ type: 'user_decision', payload: { decision, modification } }))
    approvalRequest.value = null
    status.value = 'executing'
  }

  function reset() {
    status.value = 'idle'
    toolCalls.value = []
    approvalRequest.value = null
  }

  return {
    status, messages, toolCalls, approvalRequest,
    isProcessing, hasError, needsApproval,
    processUserInput, handleAgentEvent, approveAction, reset,
  }
})
```

---

## 🔨 分步骤编码实现

### 第 1 步：类型定义

```typescript
// types/agent.ts
export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'awaiting_input' | 'completed' | 'error'

export interface ToolCall {
  id: string
  name: string
  args: Record<string, any>
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: any
  error?: string
  duration?: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface ApprovalRequest {
  id: string
  action: string
  description: string
  preview: string
  riskLevel: 'low' | 'medium' | 'high'
  options: ('approve' | 'reject' | 'modify')[]
}

export interface AgentEvent {
  type: 'status_change' | 'tool_call' | 'tool_result' | 'approval_required' | 'streaming_token' | 'completed' | 'error'
  payload: any
}
```

### 第 2 步：WebSocket 连接管理

```typescript
// utils/websocket.ts
import { useAgentStore } from '../stores/agent-store'

class AgentWebSocket {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxRetries = 5
  private url: string

  constructor(url: string) {
    this.url = url
  }

  connect() {
    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      console.log('✅ Agent WebSocket 已连接')
      this.reconnectAttempts = 0
    }

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      const store = useAgentStore()
      store.handleAgentEvent(data)
    }

    this.ws.onclose = () => {
      console.log('🔌 Agent WebSocket 已断开')
      this.attemptReconnect()
    }

    this.ws.onerror = (error) => {
      console.error('❌ WebSocket 错误:', error)
    }
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    } else {
      console.warn('WebSocket 未连接，消息缓存待发送')
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxRetries) return

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    const jitter = delay * (0.5 + Math.random() * 0.5)

    this.reconnectAttempts++
    setTimeout(() => this.connect(), jitter)
  }

  disconnect() {
    this.ws?.close()
    this.ws = null
  }
}

export const agentWs = new AgentWebSocket('ws://localhost:8080/agent')
```

### 第 3 步：主应用组件

```vue
<!-- App.vue — Agent 控制台主组件 -->
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useAgentStore } from './stores/agent-store'
import { agentWs } from './utils/websocket'
import ChatPanel from './components/ChatPanel.vue'
import AgentStatus from './components/AgentStatus.vue'
import ToolCallCard from './components/ToolCallCard.vue'
import HumanInLoop from './components/HumanInLoop.vue'

const store = useAgentStore()

onMounted(() => {
  agentWs.connect()
})

onUnmounted(() => {
  agentWs.disconnect()
})
</script>

<template>
  <div class="agent-console">
    <!-- 顶部：Agent 状态栏 -->
    <AgentStatus />

    <div class="main-content">
      <!-- 左侧：对话面板 -->
      <ChatPanel />

      <!-- 右侧：监控面板 -->
      <div class="monitor-panel">
        <!-- 工具调用卡片列表 -->
        <div class="tools-section">
          <h3>🔧 工具调用</h3>
          <ToolCallCard
            v-for="tool in store.toolCalls"
            :key="tool.id"
            :tool="tool"
          />
          <p v-if="!store.toolCalls.length" class="empty-state">
            暂无工具调用记录
          </p>
        </div>

        <!-- 审批面板（需要确认时显示） -->
        <HumanInLoop
          v-if="store.needsApproval && store.approvalRequest"
          :request="store.approvalRequest"
          @approve="store.approveAction('approve')"
          @reject="store.approveAction('reject')"
          @modify="store.approveAction('modify')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-console {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f5f5;
}
.main-content {
  display: flex;
  flex: 1;
  gap: 16px;
  padding: 16px;
  overflow: hidden;
}
.monitor-panel {
  width: 400px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}
.tools-section {
  background: white;
  border-radius: 8px;
  padding: 16px;
}
.empty-state {
  color: #999;
  text-align: center;
  padding: 24px;
}
</style>
```

### 第 4 步：各子组件

```vue
<!-- components/ChatPanel.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useAgentStore } from '../stores/agent-store'

const store = useAgentStore()
const input = ref('')

function send() {
  if (!input.value.trim()) return
  store.processUserInput(input.value)
  input.value = ''
}
</script>

<template>
  <div class="chat-panel">
    <div class="messages">
      <div v-for="msg in store.messages" :key="msg.timestamp" :class="msg.role">
        <strong>{{ msg.role === 'user' ? '👤' : '🤖' }}</strong>
        <div class="content">{{ msg.content }}</div>
      </div>
    </div>
    <form @submit.prevent="send" class="input-area">
      <input v-model="input" placeholder="输入指令..." :disabled="store.isProcessing" />
      <button type="submit" :disabled="store.isProcessing || !input.trim()">
        发送
      </button>
    </form>
  </div>
</template>
```

```vue
<!-- components/AgentStatus.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useAgentStore } from '../stores/agent-store'

const store = useAgentStore()

const config = computed(() => ({
  idle:     { icon: '💤', color: '#666', label: '等待指令' },
  thinking: { icon: '🧠', color: '#4a90d9', label: '思考中' },
  executing:{ icon: '🔧', color: '#e67e22', label: '执行中' },
  awaiting_input: { icon: '⚠️', color: '#f39c12', label: '需要确认' },
  completed:{ icon: '✅', color: '#27ae60', label: '已完成' },
  error:    { icon: '❌', color: '#e74c3c', label: '出错了' },
}[store.status]))
</script>

<template>
  <div class="status-bar" :style="{ background: config.color + '15', borderBottom: `3px solid ${config.color}` }">
    <span class="indicator" :style="{ color: config.color }">
      {{ config.icon }} {{ config.label }}
    </span>
  </div>
</template>
```

---

## ⚡ 进阶技巧

### 技巧一：插件化组件注册

```typescript
// 支持第三方组件注册到 Agent 控制台
class AgentConsolePlugin {
  private components = new Map<string, any>()

  register(name: string, component: any) {
    this.components.set(name, component)
  }

  getPanel(name: string) {
    return this.components.get(name)
  }
}
// 开发者可以编写自定义面板，通过插件机制集成
```

### 技巧二：会话录制与回放

```typescript
class SessionRecorder {
  private events: Array<{ type: string; payload: any; timestamp: number }> = []

  record(type: string, payload: any) {
    this.events.push({ type, payload, timestamp: Date.now() })
  }

  replay(speed: number = 1) {
    // 按照原始时间间隔回放所有事件
    for (let i = 0; i < this.events.length - 1; i++) {
      const delay = (this.events[i + 1].timestamp - this.events[i].timestamp) / speed
      setTimeout(() => this.dispatch(this.events[i]), delay)
    }
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Agent 控制台的核心设计模式是什么？**

> A：事件驱动 + 状态管理。后端通过 WebSocket 推送事件（status_change、tool_call、approval_required），前端 Pinia store 统一处理事件更新状态，各组件根据状态自动渲染。这是一种「单向数据流」架构——状态是唯一的事实来源，UI 只是状态的投影。

**Q2：为什么 Capstone 项目使用 Pinia 而不是组件内本地状态？**

> A：因为多个组件（ChatPanel、StatusBar、ToolCallCard、ApprovalPanel）需要共享同一份 Agent 状态。如果每个组件管理自己的状态，会出现「状态栏显示 thinking、工具面板显示 completed」的不一致问题。Pinia store 保证所有组件看到的状态是一致的。

**Q3：如何扩展 Agent 控制台支持更多工具类型？**

> A：定义 ToolCall 接口，新增工具类型只需要实现对应的渲染组件。在 ToolCallCard 中添加 type 分发逻辑，根据工具类型渲染不同的 UI。插件化注册机制允许第三方工具无缝接入。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| WebSocket 断线后状态丢失 | 未实现状态持久化和 Session 恢复 | 在 localStorage 中缓存最新状态，重连后恢复 |
| 多个 Agent 实例状态冲突 | 全局 store 被多个实例共享 | 使用 sessionId 隔离，每个实例有独立的 store |
| 工具调用列表无限增长 | 未限制 toolCalls 数组大小 | 设置最大 50 条，超出时丢弃最旧的记录 |
| Capstone 项目缺少错误边界 | 单个组件崩溃导致整个控制台白屏 | 使用 Vue 的 errorCaptured 钩子包裹各面板组件 |

---

## 📝 本章小结

- ✅ **Agent 控制台** — 完整的 Agent 前端交互框架
- ✅ **状态管理** — Pinia store 统一管理 Agent 生命周期
- ✅ **WebSocket 通信** — 实时双向通信 + 指数退避重连
- ✅ **组件化设计** — ChatPanel、StatusBar、ToolCallCard、ApprovalPanel 各司其职
- ✅ **状态驱动 UI** — 每种 Agent 状态对应不同的 UI 表现
- ✅ **可扩展架构** — 事件驱动的消息处理机制，易于扩展

## ➡️ 下一步

> 完成 4.2 Agent UI 设计的学习后，进入 [4.3 流式传输与实时通信](../4.3-streaming-and-real-time/README.md) — 深入了解 SSE、WebSocket 和前端流式渲染。
> [4.3 流式传输与实时通信](../4.3-streaming-and-real-time/README.md)
