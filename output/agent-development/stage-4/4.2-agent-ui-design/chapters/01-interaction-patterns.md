# 第1章：Agent 交互模式设计

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **掌握四种 Agent 交互模式** — 对话式、任务面板、工作流可视化、混合模式
- **选择适合场景的交互模式** — 根据任务复杂度和用户需求选型
- **设计清晰的 Agent 状态展示** — 让用户知道 Agent 在做什么

## 💡 核心概念

### 概念一：四种 Agent 交互模式

#### 模式 1：对话式界面（Chat UI）

最基础也是最通用的 Agent 交互方式。

```vue
<!-- ChatMessage.vue -->
<template>
  <div class="message" :class="message.role">
    <!-- 头像 -->
    <div class="avatar">
      {{ message.role === 'user' ? '👤' : '🤖' }}
    </div>

    <!-- 内容区 -->
    <div class="content">
      <!-- 思考过程（可折叠） -->
      <details v-if="message.thinking" class="thinking-block">
        <summary>🧠 思考过程</summary>
        <div class="thinking-content">{{ message.thinking }}</div>
      </details>

      <!-- 主要回复 -->
      <div class="text" v-html="renderMarkdown(message.content)" />

      <!-- 工具调用卡片 -->
      <div v-if="message.toolCalls?.length" class="tool-calls">
        <ToolCallCard
          v-for="tool in message.toolCalls"
          :key="tool.id"
          :tool="tool"
        />
      </div>
    </div>
  </div>
</template>
```

```
优点：直观、用户学习成本低、适合通用任务
缺点：不适合复杂的多步任务展示
适用：通用问答、代码生成、文档查询
```

#### 模式 2：任务面板（Task Panel）

展示 Agent 的任务分解和执行进度。

```
┌──────────────────────────────────────────┐
│  📋 任务：分析用户反馈数据                  │
├──────────────────────────────────────────┤
│  ✅ 步骤 1：读取数据文件 (2.3s)            │
│  ✅ 步骤 2：数据清洗和预处理 (5.1s)        │
│  🔄 步骤 3：情感分析... [████░░] 67%     │
│  ⏳ 步骤 4：生成报告                      │
│  ⏳ 步骤 5：发送邮件通知                   │
├──────────────────────────────────────────┤
│  ⏱️ 已用时: 12.4s | 预计剩余: 8.2s       │
│  [暂停] [取消]                            │
└──────────────────────────────────────────┘
```

```vue
<!-- TaskPanel.vue -->
<template>
  <div class="task-panel">
    <h3>📋 {{ task.title }}</h3>
    <div class="steps">
      <div
        v-for="step in task.steps"
        :key="step.id"
        class="step"
        :class="step.status"
      >
        <span class="step-icon">
          {{ step.status === 'completed' ? '✅' :
             step.status === 'running' ? '🔄' :
             step.status === 'failed' ? '❌' : '⏳' }}
        </span>
        <span class="step-name">{{ step.name }}</span>
        <span v-if="step.status === 'running'" class="step-progress">
          {{ step.progress }}%
        </span>
        <span v-if="step.duration" class="step-duration">
          ({{ step.duration }}s)
        </span>
      </div>
    </div>
  </div>
</template>
```

```
优点：任务进度清晰、适合多步任务
缺点：实现复杂度较高
适用：数据分析、报告生成、批量处理
```

#### 模式 3：工作流可视化（Workflow Visualization）

展示 Agent 的推理和执行流程。

```vue
<!-- WorkflowVisualization.vue -->
<template>
  <div class="workflow">
    <!-- 节点 -->
    <div v-for="node in workflow.nodes" :key="node.id" class="node" :class="node.status">
      <div class="node-icon">{{ getNodeIcon(node.type) }}</div>
      <div class="node-label">{{ node.label }}</div>
    </div>

    <!-- 连接线 -->
    <svg class="connections">
      <line v-for="edge in workflow.edges" :key="edge.id"
        :x1="edge.from.x" :y1="edge.from.y"
        :x2="edge.to.x" :y2="edge.to.y"
        :class="{ active: edge.active }"
      />
    </svg>
  </div>
</template>
```

```
优点：直观展示复杂流程、适合调试和审查
缺点：实现难度最高
适用：复杂 Agent 工作流、开发者工具
```

#### 模式 4：混合交互模式

结合多种模式的优势。

```
┌──────────────────────────────────────────┐
│  🤖 AI 助手                               │
├──────────────────────────────────────────┤
│  💬 对话区                   │ 📋 任务面板 │
│                              │            │
│  👤 分析这个数据集           │ ✅ 加载数据  │
│                              │ ✅ 清洗     │
│  🤖 [思考中...]              │ 🔄 分析...  │
│  📊 分析完成，发现 3 个趋势   │ ⏳ 生成报告  │
│                              │            │
│  ┌────────────────────────┐  │ ⏱️ 8.2s   │
│  │ 输入消息...             │  │            │
│  └────────────────────────┘  │            │
└──────────────────────────────────────────┘
```

### 概念二：Agent 状态设计

```typescript
// Agent 状态类型定义
type AgentStatus =
  | 'idle'              // 空闲 — 等待用户输入
  | 'thinking'          // 思考中 — LLM 推理
  | 'calling_tool'      // 调用工具 — 执行外部操作
  | 'waiting_approval'  // 等待确认 — 需要用户批准
  | 'streaming'         // 流式输出 — 正在生成回复
  | 'completed'         // 完成 — 任务已完成
  | 'error'             // 错误 — 出现异常
  | 'cancelled';        // 已取消 — 用户取消了任务

// 状态对应的设计
const statusDesign: Record<AgentStatus, {
  icon: string;
  color: string;
  animation: string;
  message: string;
}> = {
  idle: { icon: '💤', color: 'gray', animation: 'none', message: '等待你的指令...' },
  thinking: { icon: '🧠', color: 'blue', animation: 'pulse', message: '正在思考...' },
  calling_tool: { icon: '🔧', color: 'orange', animation: 'spin', message: '正在调用工具...' },
  waiting_approval: { icon: '⚠️', color: 'yellow', animation: 'bounce', message: '需要你的确认' },
  streaming: { icon: '✍️', color: 'green', animation: 'typing', message: '正在生成回复...' },
  completed: { icon: '✅', color: 'green', animation: 'none', message: '任务完成' },
  error: { icon: '❌', color: 'red', animation: 'shake', message: '出现错误' },
  cancelled: { icon: '🚫', color: 'gray', animation: 'none', message: '已取消' },
};
```

### 概念三：实时反馈设计

```vue
<!-- AgentStatusBar.vue -->
<template>
  <div class="agent-status-bar" :class="status">
    <!-- 状态指示器 -->
    <div class="status-indicator">
      <span class="icon" :class="statusDesign.animation">{{ statusDesign.icon }}</span>
      <span class="message">{{ statusDesign.message }}</span>
    </div>

    <!-- 流式文本展示（打字机效果） -->
    <div v-if="status === 'streaming'" class="streaming-text">
      <span>{{ displayedText }}</span>
      <span class="cursor">|</span>
    </div>

    <!-- 工具调用进度 -->
    <div v-if="status === 'calling_tool'" class="tool-progress">
      <ToolCallCard :tool="currentTool" />
    </div>

    <!-- 操作按钮 -->
    <div class="actions">
      <button v-if="status === 'thinking' || status === 'streaming'" @click="$emit('cancel')">
        取消
      </button>
      <button v-if="status === 'waiting_approval'" @click="$emit('approve')" class="primary">
        确认执行
      </button>
      <button v-if="status === 'error'" @click="$emit('retry')">
        重试
      </button>
    </div>
  </div>
</template>
```

---

## 📝 本章小结

- ✅ **对话式** — 最通用，适合简单交互
- ✅ **任务面板** — 展示多步任务进度
- ✅ **工作流可视化** — 展示推理和执行流程
- ✅ **混合模式** — 结合多种模式的优势
- ✅ **状态设计** — 8 种 Agent 状态及对应的视觉设计

## ➡️ 下一章预告

> [第2章：Agent 状态展示](./02-status-display.md) — 详细的状态可视化实现。
