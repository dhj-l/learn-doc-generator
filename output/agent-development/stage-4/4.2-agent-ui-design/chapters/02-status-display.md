# 第2章：Agent 状态展示 — 让用户知道 Agent 在想什么

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **设计 Agent 状态的实时展示** — 思考中、执行中、等待中、完成
- **实现推理过程的可视化** — 展示 Agent 的思考步骤
- **处理状态的平滑过渡** — 避免 UI 闪烁

## 📋 前置知识

> 建议先完成：
> - [第1章：Agent 交互模式设计](./01-interaction-patterns.md) — 了解 8 种 Agent 状态和四种交互模式

---

## 💡 核心概念

### Agent 的四种核心视觉状态

**生活类比：** 想象你用手机点外卖。你会看到：
- 商家正在确认中（⏳思考中）
- 商家正在做菜（🔧执行中）
- 骑手正在配送中（📤流式输出）
- 已送达（✅完成）

每种状态都有对应的视觉表现——等待时显示旋转动画、配送时显示进度条、送达时显示确认图标。Agent 的状态展示也是同样的原理。

```vue
<template>
  <div class="agent-status">
    <!-- 思考中：波纹动画 + 思考内容 -->
    <div v-if="status === 'thinking'" class="thinking">
      <div class="pulse-dot" />
      <span class="thought-text">{{ currentThought }}</span>
    </div>

    <!-- 执行中：工具调用卡片 -->
    <div v-if="status === 'executing'" class="executing">
      <div class="tool-card" v-for="tool in toolCalls" :key="tool.id">
        <span class="tool-icon">🔧</span>
        <span>{{ tool.name }}</span>
        <span class="tool-status" :class="tool.status">{{ tool.status }}</span>
      </div>
    </div>

    <!-- 等待用户确认 -->
    <div v-if="status === 'awaiting_input'" class="awaiting">
      <p>🤔 Agent 需要你确认：{{ confirmationQuestion }}</p>
      <button @click="confirm">确认</button>
      <button @click="reject">修改</button>
    </div>

    <!-- 完成：结果展示 -->
    <div v-if="status === 'completed'" class="completed">
      <div class="result-content">{{ result }}</div>
    </div>
  </div>
</template>
```

**完整的 Agent 状态机定义：**

```typescript
// 状态转换规则
type AgentStatus = 'idle' | 'thinking' | 'executing' | 'awaiting_input' | 'completed' | 'error'

// 合法的状态转换
const validTransitions: Record<AgentStatus, AgentStatus[]> = {
  idle:           ['thinking'],
  thinking:       ['executing', 'error', 'idle'],
  executing:      ['awaiting_input', 'completed', 'error', 'idle'],
  awaiting_input: ['executing', 'idle', 'error'],
  completed:      ['idle'],
  error:          ['idle', 'thinking'],
}
```

> **💡 为什么要展示思考过程？** 用户信任建立在「可理解性」上。如果 Agent 直接给结果，用户不知道它「想了什么」。展示思考过程让用户能验证 Agent 的推理路径是否正确，增加对结果的信任。

### 思考过程的可视化设计

```typescript
// 思考过程的流式展示
interface ThinkingStep {
  step: string        // 当前思考步骤名称
  content: string     // 思考内容
  timestamp: number   // 时间戳
}

// 自动滚动展示思考步骤
function displayThinkingFlow(steps: ThinkingStep[]) {
  const container = document.querySelector('.thinking-flow')!
  for (const step of steps) {
    const el = document.createElement('div')
    el.className = 'thinking-step'
    el.innerHTML = `
      <span class="step-time">${new Date(step.timestamp).toLocaleTimeString()}</span>
      <span class="step-text">${step.content}</span>
    `
    container.appendChild(el)
    el.scrollIntoView({ behavior: 'smooth' })
  }
}
```

### 状态过渡动画实现

```css
/* 思考状态脉冲动画 */
@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.7; }
}

/* 执行状态旋转动画 */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 等待状态弹跳动画 */
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

/* 状态容器过渡 */
.agent-status {
  transition: all 0.3s ease-in-out;
}
```

---

## 🔨 实战演练

### 练习：构建一个完整的 Agent 状态展示组件

**场景描述：** 你的产品需要一个 Agent 状态展示条——它常驻在页面底部，实时显示 Agent 的当前状态、思考内容、执行进度，并支持用户的中断操作。

**你的任务：**
1. 实现一个全局的 Agent 状态栏组件（类似 VS Code 底部的状态栏）
2. 支持 6 种状态的自适应展示
3. 每种状态有对应的图标、颜色、动画
4. 加入平滑的状态过渡效果

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```vue
<!-- GlobalAgentStatusBar.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue'

type Status = 'idle' | 'thinking' | 'executing' | 'awaiting_input' | 'completed' | 'error'

const props = defineProps<{
  status: Status
  thinkingText?: string
  toolName?: string
  progress?: number
  errorMessage?: string
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
  retry: []
}>()

const statusConfig = {
  idle:           { icon: '💤', color: '#666', label: '等待指令' },
  thinking:       { icon: '🧠', color: '#4a90d9', label: '思考中' },
  executing:      { icon: '🔧', color: '#e67e22', label: '执行中' },
  awaiting_input: { icon: '⚠️', color: '#f39c12', label: '需要确认' },
  completed:      { icon: '✅', color: '#27ae60', label: '已完成' },
  error:          { icon: '❌', color: '#e74c3c', label: '出错了' },
}

const config = computed(() => statusConfig[props.status])
</script>

<template>
  <div class="status-bar" :style="{ borderLeft: `4px solid ${config.color}` }">
    <span class="icon" :style="{ color: config.color }">{{ config.icon }}</span>
    <span class="label">{{ config.label }}</span>

    <!-- 思考内容 -->
    <span v-if="status === 'thinking' && thinkingText" class="detail">
      {{ thinkingText }}
    </span>

    <!-- 执行进度 -->
    <div v-if="status === 'executing'" class="progress">
      <span>{{ toolName }}</span>
      <div class="bar">
        <div class="fill" :style="{ width: progress + '%' }" />
      </div>
      <span>{{ progress }}%</span>
    </div>

    <!-- 错误信息 -->
    <span v-if="status === 'error' && errorMessage" class="error-detail">
      {{ errorMessage }}
    </span>

    <!-- 操作按钮 -->
    <div class="actions">
      <button v-if="status === 'thinking' || status === 'executing'"
        @click="emit('cancel')" class="cancel">
        取消
      </button>
      <button v-if="status === 'awaiting_input'"
        @click="emit('confirm')" class="confirm">
        确认
      </button>
      <button v-if="status === 'error'"
        @click="emit('retry')" class="retry">
        重试
      </button>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.3s ease;
}
.icon { font-size: 18px; }
.label { font-weight: 600; }
.detail { color: #666; font-style: italic; }
.progress { display: flex; align-items: center; gap: 6px; margin-left: 12px; }
.progress .bar {
  width: 100px; height: 6px;
  background: #e0e0e0; border-radius: 3px;
  overflow: hidden;
}
.progress .fill {
  height: 100%;
  background: #e67e22;
  border-radius: 3px;
  transition: width 0.3s ease;
}
.actions { margin-left: auto; display: flex; gap: 6px; }
button {
  padding: 4px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.cancel { color: #e74c3c; }
.confirm { color: #27ae60; border-color: #27ae60; }
.retry { color: #4a90d9; border-color: #4a90d9; }
</style>
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：多 Agent 状态聚合

当页面中有多个 Agent 同时工作时，聚合展示所有状态：

```typescript
interface AgentState {
  id: string
  name: string
  status: AgentStatus
  message: string
}

function aggregateStates(agents: AgentState[]) {
  const summary = {
    total: agents.length,
    active: agents.filter(a => a.status === 'thinking' || a.status === 'executing').length,
    errors: agents.filter(a => a.status === 'error').length,
    completed: agents.filter(a => a.status === 'completed').length,
  }
  return summary
}
```

### 技巧二：状态历史回溯

```typescript
// 记录状态变更时间线，用于调试和用户查看
class StatusTimeline {
  private entries: Array<{ status: string; timestamp: Date; metadata?: any }> = []

  record(status: string, metadata?: any) {
    this.entries.push({ status, timestamp: new Date(), metadata })
  }

  getTimeline() {
    return this.entries.map(e => ({
      time: e.timestamp.toLocaleTimeString(),
      status: e.status,
      duration: this.getDurationSinceLast(e),
    }))
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么 Agent 状态展示不能只用「加载中」一个状态？**

> A：Agent 的工作流程远比传统 API 复杂。用户需要区分「AI 在思考」「AI 在调用工具」「AI 等待我确认」「AI 完成了」这些不同的状态。统一标为「加载中」会让用户完全不知道 Agent 的进展，降低信任感。

**Q2：状态过渡动画的最佳实践是什么？**

> A：使用 CSS transition 而非 JavaScript 动画，性能更好。动画时长控制在 200-400ms 之间——太快用户感知不到，太慢显得拖沓。只用 transform 和 opacity 做动画（GPU 加速），避免 animating width/height/top/left。

**Q3：如何处理 Agent 状态快速变化时的 UI 闪烁？**

> A：加入最小展示时间（minimum display duration）——每个状态的展示时间不少于 500ms，即使状态很快变化。如果 Agent 在 100ms 内从 thinking 变为 completed，UI 也应该至少展示 500ms 的 thinking 状态，再切换到 completed。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 状态快速切换导致 UI 闪烁 | 状态转换后立即渲染新 UI，中间态不可见 | 设置最小展示时间 500ms |
| 思考过程文字过多导致 UI 溢出 | 未限制思考内容的显示长度 | 截断超长思考文本，使用「展开」按钮 |
| 状态栏在移动端遮挡内容 | 固定底部定位未考虑小屏幕 | 移动端使用折叠式状态指示器 |
| 错误状态没有重试入口 | 只在正常操作成功时有交互 | 所有错误状态都提供重试或降级选项 |
| 多个状态同时激活 | 状态机未做互斥控制 | 使用联合类型保证同一时间只有一个状态 |

---

## 📝 本章小结

- ✅ Agent 状态分为：思考中、执行中、等待输入、完成、错误、空闲
- ✅ 每种状态有对应的视觉展示模式（图标、颜色、动画）
- ✅ 思考过程可视化增加用户信任
- ✅ 状态过渡使用 CSS transition 确保平滑
- ✅ 最小展示时间避免 UI 闪烁

## ➡️ 下一章预告

> 本章学习了 Agent 状态展示。在下一章中，我们将深入工具调用的可视化——展示 Agent 调用了什么工具、传了什么参数、得到了什么结果。
> [第3章：工具调用可视化](./03-tool-visualization.md)
