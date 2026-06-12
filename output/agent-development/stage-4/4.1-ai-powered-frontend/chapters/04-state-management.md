# 第4章：AI 状态管理 — 管理 AI 与 UI 的交互状态

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 AI 应用的四种核心状态** — 加载、流式、错误、空闲
- **使用状态机管理 AI 交互** — 避免不一致的状态组合
- **在 Pinia/Zustand 中管理 AI 状态** — 将 AI 状态与 UI 状态解耦
- **实现流式输出的状态同步** — 实时更新 UI 而不丢失中间状态

## 📋 前置知识

> 建议先完成：
> - [第3章：AI 组件设计](./03-ai-components.md) — 了解 AI 组件的交互模式

---

## 💡 核心概念

### AI 应用的四种核心状态

**生活类比：** 你在餐厅点餐：
- 🟢 **空闲** — 还没点餐，服务员等着你
- 🔵 **加载中** — 厨师正在做菜，你在等待
- 🟡 **流式输出** — 菜一道道上来了，一边吃一边等后面的菜
- 🔴 **错误** — 菜做糊了，需要重新做

#### 为什么 AI 状态不能用「几个布尔变量」搞定？

很多初学 AI 状态管理的人会这么写：

```typescript
// ❌ 直觉但危险的做法
const isLoading = ref(false)
const isStreaming = ref(false)
const hasError = ref(false)
const isIdle = ref(true)
```

然后问题就来了：如果 `isLoading` 和 `isStreaming` 同时为 `true`，UI 怎么展示？是显示加载动画还是流式文字？这就是「状态爆炸」——当你有 N 个布尔变量时，可能的组合数是 2^N，其中大部分组合是**不应该出现**的无效状态。

AI 状态管理的核心思路是：**不是用多个变量描述状态，而是用一个变量描述状态。**

这就引出了**有限状态机（FSM）**——一个非常古老的计算机科学概念，但你不用把它想得太复杂。我理解 FSM 其实就是三样东西：

1. **当前在哪个状态**（比如：空闲中 / 加载中 / 流式输出中 / 出错）
2. **什么事件能让它切换状态**（比如：用户点击发送 / 收到第一个字节 / 出错）
3. **从哪个状态能切换到哪个状态**（比如：空闲→加载 没问题，但出错→流式 就不可行）

用大白话来说，FSM 就是一个「**如果...那么...**」的规则表：

```
当前状态     | 发生什么事       | 进入什么状态
─────────────┼─────────────────┼─────────────
空闲         | 用户发送消息     | → 加载中
加载中       | 收到第一个字节   | → 流式输出
加载中       | 请求超时         | → 出错
流式输出     | AI 回复完成      | → 空闲
流式输出     | 连接断开         | → 出错
出错         | 用户点击重试     | → 加载中
出错         | 用户取消         | → 空闲
任何状态     | 用户取消         | → 空闲
```

看出来了吗？这其实就是一张**交通规则表**——它告诉程序「什么情况下该怎么走」。

**为什么非要用这种形式化的方式？** 两个理由：

1. **避免矛盾状态** — 有了规则表，就不可能 `isLoading && isStreaming` 同时为真。你不可能既在「加载中」又在「流式输出中」
2. **不会漏掉情况** — 规则表穷举了所有「当前状态 × 事件」的组合，不会出现「用户点击取消但程序不知道该怎么处理」的尴尬

我特别喜欢这个比喻：**没有 FSM 的状态管理，就像没有交通信号灯的路口——可能走得通，但随时可能撞车。**

```typescript
// AI 交互的四种核心状态
type AiState = 
  | { status: 'idle' }                           // 空闲
  | { status: 'loading'; message?: string }      // 加载中
  | { status: 'streaming'; content: string }     // 流式输出
  | { status: 'error'; error: string }           // 错误

// 合法的状态转换
const stateTransitions: Record<string, string[]> = {
  'idle': ['loading'],
  'loading': ['streaming', 'error', 'idle'],  // 加载完开始流式/出错/取消
  'streaming': ['idle', 'error'],             // 流式结束/出错
  'error': ['loading', 'idle'],               // 重试/取消
}
```

**💡 为什么需要状态机？** 没有状态机约束，你可能会写出 `isLoading && isStreaming` 这种矛盾状态。状态机确保：加载完成后才能开始流式，流式进行中不能重新加载——UI 永远不会出现「同时显示加载动画和流式文字」的混乱状态。

### 使用 Pinia 管理 AI 状态

```typescript
// stores/ai-assistant.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

type AiStatus = 'idle' | 'loading' | 'streaming' | 'error'

export const useAiAssistantStore = defineStore('ai-assistant', () => {
  // ===== 状态 =====
  const status = ref<AiStatus>('idle')
  const messages = ref<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const currentStreamContent = ref('')
  const errorMessage = ref('')
  const tokenUsage = ref({ prompt: 0, completion: 0, total: 0 })

  // ===== 计算属性 =====
  const isLoading = computed(() => status.value === 'loading')
  const isStreaming = computed(() => status.value === 'streaming')
  const hasError = computed(() => status.value === 'error')
  const displayContent = computed(() => 
    status.value === 'streaming' ? currentStreamContent.value : ''
  )

  // ===== 动作 =====
  async function sendMessage(content: string) {
    // 1. 添加用户消息
    messages.value.push({ role: 'user', content })
    status.value = 'loading'
    errorMessage.value = ''

    try {
      // 2. 发起流式请求
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: messages.value.slice(-10), // 只发最近 10 条
          stream: true,
        }),
      })

      if (!response.ok) throw new Error(`请求失败 (${response.status})`)

      // 3. 处理流式响应
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      status.value = 'streaming'
      currentStreamContent.value = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          const data = JSON.parse(line.slice(6)) // 去掉 'data: ' 前缀
          
          if (data.type === 'token') {
            assistantContent += data.token
            currentStreamContent.value = assistantContent
          } else if (data.type === 'usage') {
            tokenUsage.value = data.usage
          }
        }
      }

      // 4. 流式完成
      messages.value.push({ role: 'assistant', content: assistantContent })
      currentStreamContent.value = ''
      status.value = 'idle'

    } catch (error) {
      status.value = 'error'
      errorMessage.value = (error as Error).message
    }
  }

  function retry() {
    if (status.value === 'error' && messages.value.length >= 2) {
      // 重试：移除最后一次 assistant 回复（如果有），重新发送 user 消息
      const lastUserMsg = messages.value[messages.value.length - 1]
      if (lastUserMsg.role === 'user') {
        sendMessage(lastUserMsg.content)
      }
    }
  }

  function reset() {
    status.value = 'idle'
    messages.value = []
    currentStreamContent.value = ''
    errorMessage.value = ''
    tokenUsage.value = { prompt: 0, completion: 0, total: 0 }
  }

  return {
    status, messages, currentStreamContent, errorMessage, tokenUsage,
    isLoading, isStreaming, hasError, displayContent,
    sendMessage, retry, reset,
  }
})
```

### 在组件中使用 AI Store

```vue
<script setup lang="ts">
import { useAiAssistantStore } from '@/stores/ai-assistant'

const aiStore = useAiAssistantStore()
const inputText = ref('')

async function handleSend() {
  if (!inputText.value.trim() || aiStore.isLoading) return
  const text = inputText.value
  inputText.value = ''
  await aiStore.sendMessage(text)
}
</script>

<template>
  <div class="chat-container">
    <!-- 消息列表 -->
    <div class="messages">
      <div v-for="(msg, i) in aiStore.messages" :key="i" :class="msg.role">
        <strong>{{ msg.role === 'user' ? '👤 你' : '🤖 AI' }}：</strong>
        <p>{{ msg.content }}</p>
      </div>

      <!-- 流式输出区域 -->
      <div v-if="aiStore.isStreaming" class="assistant streaming">
        <strong>🤖 AI：</strong>
        <p>{{ aiStore.displayContent }}<span class="cursor">▌</span></p>
      </div>

      <!-- 加载状态 -->
      <div v-if="aiStore.isLoading" class="loading-indicator">
        🤔 AI 思考中...
      </div>

      <!-- 错误状态 -->
      <div v-if="aiStore.hasError" class="error">
        ❌ {{ aiStore.errorMessage }}
        <button @click="aiStore.retry()">🔄 重试</button>
      </div>
    </div>

    <!-- 输入框 -->
    <div class="input-area">
      <textarea
        v-model="inputText"
        :disabled="aiStore.isLoading"
        placeholder="输入消息..."
        @keydown.enter.prevent="handleSend"
      />
      <button @click="handleSend" :disabled="aiStore.isLoading || !inputText.trim()">
        发送
      </button>
    </div>
  </div>
</template>
```

**💡 为什么 store 不允许在 loading 状态发送新消息？** 状态机确保了这一点——`loading` 状态只能转换为 `streaming` 或 `error`。这防止了用户在 AI 正在思考时发出新请求导致的混乱：两个请求同时处理，消息顺序错乱，Token 计数不对。

---

## 🔨 实战演练

### 练习：构建带请求队列的 AI 状态管理器

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// stores/ai-queue.ts — 带请求队列的 AI 状态管理器
import { defineStore } from 'pinia'
import { ref } from 'vue'

interface QueueItem {
  id: string
  prompt: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  result?: string
  error?: string
  createdAt: Date
}

export const useAiQueueStore = defineStore('ai-queue', () => {
  const queue = ref<QueueItem[]>([])
  const maxConcurrent = 2
  const activeCount = ref(0)

  // 添加任务到队列
  function enqueue(prompt: string): string {
    const id = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    queue.value.push({
      id,
      prompt,
      status: 'pending',
      createdAt: new Date(),
    })
    processQueue()
    return id
  }

  // 处理队列
  async function processQueue() {
    while (activeCount.value < maxConcurrent) {
      const next = queue.value.find(item => item.status === 'pending')
      if (!next) break

      activeCount.value++
      next.status = 'processing'

      try {
        const response = await fetch('/api/ai', {
          method: 'POST',
          body: JSON.stringify({ prompt: next.prompt }),
        })
        next.result = await response.text()
        next.status = 'completed'
      } catch (err) {
        next.error = (err as Error).message
        next.status = 'failed'
      } finally {
        activeCount.value--
        processQueue() // 处理队列中的下一个
      }
    }
  }

  // 取消队列中的某个任务
  function cancel(id: string) {
    const item = queue.value.find(i => i.id === id)
    if (item && item.status === 'pending') {
      item.status = 'failed'
      item.error = '已取消'
    }
  }

  const pendingCount = ref(0) // 通过 computed 或手动更新

  return { queue, enqueue, cancel, activeCount, pendingCount }
})
```

</details>

---

## ⚡ 进阶技巧

### 持久化 AI 对话历史

```typescript
// 使用 Pinia 的插件系统持久化 AI 状态
import { createPinia } from 'pinia'
import { createPersistedState } from 'pinia-plugin-persistedstate'

const pinia = createPinia()
pinia.use(createPersistedState({
  key: 'ai-chat-history',
  storage: localStorage,
  // 只持久化 messages，不持久化状态机状态
  serializer: {
    serialize: (state) => JSON.stringify({
      messages: state.messages?.slice(-100), // 只保留最近 100 条
    }),
    deserialize: (str) => ({}),
  },
}))
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么 AI 应用中「状态」比「数据」更难管理？**

> A：普通应用的数据是「请求→响应」的简单模式，但 AI 应用涉及流式输出（边接收边显示）、长时间等待（用户可能离开又回来）、错误恢复（重试可能成功也可能失败）。状态机将所有这些可能性组织为可预测的转换路径，避免 UI 显示矛盾状态。

**Q2：流式输出中用户发了新消息怎么办？**

> A：有三种策略：1) 排队——等当前流式完成后处理新消息；2) 中断——取消当前流式，立即处理新消息；3) 并行——同时进行，但标记来源。推荐策略 2（中断），因为用户发新消息意味着旧的请求已经不重要了。

**Q3：Token 使用量信息应该放在哪里？**

> A：放在每个消息上（不是全局），因为每次对话消耗的 Token 不同。格式：`message.tokens = { prompt: 50, completion: 150 }`。这样用户可以了解每个 AI 回复的成本，也方便调试和优化。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 页面刷新后 AI 对话丢失 | AI 状态只存在内存中 | 使用 localStorage/pinia persistedstate 持久化 |
| 流式文字跳动/闪烁 | 每次收到 token 都触发组件重渲染 | 使用虚拟列表或 requestAnimationFrame 节流渲染 |
| 用户快速连发消息导致乱序 | 并发请求的顺序不确定 | 使用请求队列 + AbortController 中断前一个请求 |
| 长对话中 Token 逐渐超限 | 消息历史不断累积 | 使用滑动窗口保留最近 N 轮，超出部分用摘要替代 |

---

## 📝 本章小结

- ✅ **四种核心状态** — idle、loading、streaming、error 构成 AI 交互的基础状态机
- ✅ **Pinia 管理** — 使用 defineStore 将 AI 状态与 UI 状态解耦
- ✅ **流式输出** — `getReader() + TextDecoder` 逐块读取 AI 响应并实时更新 UI
- ✅ **请求队列** — 管理并发请求，防止顺序错乱
- ✅ **持久化** — 使用 Pinia 插件持久化对话历史

## ➡️ 下一章预告

> 在下一章中，我们将探讨边缘 AI——在边缘计算环境中部署 AI 推理，让 AI 更靠近用户，降低延迟。
> [第5章：边缘 AI](./05-edge-ai.md)
