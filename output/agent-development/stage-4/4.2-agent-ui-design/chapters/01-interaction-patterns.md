# 第1章：Agent 交互模式设计

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **掌握四种 Agent 交互模式** — 对话式、任务面板、工作流可视化、混合模式
- **选择适合场景的交互模式** — 根据任务复杂度和用户需求选型
- **设计清晰的 Agent 状态展示** — 让用户知道 Agent 在做什么

## 📋 前置知识

> 建议先完成：
> - [阶段 4 第 4.1 主题：AI 驱动的前端](../../4.1-ai-powered-frontend/README.md) — 了解 AI-Native UI 三种基础模式

---

## 💡 核心概念

### 概念一：四种 Agent 交互模式

**生活类比：** 你在餐厅吃饭，可以有不同的服务方式。对话式就像找个服务员点菜——你说「推荐一道招牌菜」，服务员直接回答你。任务面板就像看菜单上的套餐列表——每道菜都列清楚了，进度一目了然。工作流可视化就像看开放式厨房——你能看到厨师怎么切菜、怎么烹饪。混合模式就是上面三种的组合——服务员推荐菜、你看着菜单选、偶尔看看厨房进度。

#### 模式 1：对话式界面（Chat UI）

最基础也是最通用的 Agent 交互方式——通过自然语言对话与 AI 交流。

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

展示 Agent 的任务分解和执行进度，让用户看清楚「AI 正在做什么」「做到了哪一步」。

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

展示 Agent 的推理和执行流程，像流程图一样展示每一步的输入、输出、状态。

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

结合多种模式的优势，根据任务阶段自动切换。

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

**生活类比：** 就像红绿灯有「红黄绿」三种状态，Agent 也需要清晰的状态标识。你在网上购物时，订单状态会显示「已下单→已付款→发货中→已签收」——每个状态都有明确含义和预期行为。Agent 的状态设计同样如此。

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

> **💡 为什么要有 8 种状态而不是简单的「加载中/已完成/出错」？** Agent 的生命周期比传统 API 调用复杂得多。传统 API 只有「等待→成功/失败」两个状态，但 Agent 可能正在思考（需要等待 LLM）、正在调用工具（需要展示进度）、正在等待用户确认（需要用户介入）。每种状态对应不同的 UI 表现和用户操作，缺少任何一种都会让用户感到困惑。

### 概念三：实时反馈设计

**生活类比：** 你用导航 App 开车时，导航会实时告诉你「前方 500 米右转」「当前路段拥堵，预计延迟 5 分钟」「已重新规划路线」。你不会希望它沉默 10 秒然后突然说「到了」。Agent 的实时反馈也是同样——用户需要持续知道「AI 在想什么、在做什么、还要多久」。

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

## 🔨 实战演练

### 练习：构建一个「代码分析 Agent」交互界面

**场景描述：** 你的团队需要一个代码分析 Agent——用户粘贴一段代码，Agent 自动分析代码质量、安全漏洞、性能问题，并以任务面板的方式展示分析进度和结果。

**你的任务：**
1. 实现一个混合交互模式——左侧对话区、右侧任务面板
2. 用户粘贴代码后，Agent 逐步执行分析任务（语法检查 → 安全扫描 → 性能分析 → 生成报告）
3. 任务面板实时更新每个步骤的状态
4. 分析完成后在对话区生成总结报告

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```vue
<!-- CodeAnalysisAgent.vue -->
<script setup lang="ts">
import { ref, reactive } from 'vue'

interface AnalysisStep {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  duration?: string
}

const code = ref('')
const messages = ref<Array<{ role: string; content: string }>>([])
const steps = ref<AnalysisStep[]>([
  { id: 'syntax', name: '语法检查', status: 'pending', progress: 0 },
  { id: 'security', name: '安全扫描', status: 'pending', progress: 0 },
  { id: 'performance', name: '性能分析', status: 'pending', progress: 0 },
  { id: 'report', name: '生成报告', status: 'pending', progress: 0 },
])
const isAnalyzing = ref(false)

async function startAnalysis() {
  if (!code.value.trim()) return
  isAnalyzing.value = true
  messages.value.push({ role: 'user', content: '请分析这段代码：\n```\n' + code.value + '\n```' })

  // 按顺序执行每个分析步骤
  for (const step of steps.value) {
    step.status = 'running'

    // 模拟逐步执行
    for (let p = 0; p <= 100; p += 20) {
      step.progress = p
      await new Promise(r => setTimeout(r, 300))
    }

    step.status = 'completed'
    step.duration = `${Math.floor(Math.random() * 3 + 1)}s`
  }

  messages.value.push({
    role: 'assistant',
    content: '✅ 分析完成！发现 2 个安全建议、1 个性能优化点。详细信息查看右侧面板。',
  })
  isAnalyzing.value = false
}

function getStatusIcon(status: string) {
  if (status === 'completed') return '✅'
  if (status === 'running') return '🔄'
  if (status === 'failed') return '❌'
  return '⏳'
}
</script>

<template>
  <div class="code-analysis">
    <div class="chat-panel">
      <h3>💬 对话区</h3>
      <div class="messages">
        <div v-for="msg in messages" :key="msg.content" :class="msg.role">
          <strong>{{ msg.role === 'user' ? '👤 你' : '🤖 Agent' }}:</strong>
          <pre>{{ msg.content }}</pre>
        </div>
      </div>
      <textarea v-model="code" placeholder="粘贴代码..." rows="5" />
      <button @click="startAnalysis" :disabled="isAnalyzing || !code.trim()">
        {{ isAnalyzing ? '⏳ 分析中...' : '🚀 开始分析' }}
      </button>
    </div>

    <div class="task-panel">
      <h3>📋 分析任务</h3>
      <div v-for="step in steps" :key="step.id" class="step" :class="step.status">
        <span class="icon">{{ getStatusIcon(step.status) }}</span>
        <span class="name">{{ step.name }}</span>
        <div v-if="step.status === 'running'" class="progress-bar">
          <div class="progress-fill" :style="{ width: step.progress + '%' }" />
        </div>
        <span v-if="step.duration" class="duration">({{ step.duration }})</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.code-analysis { display: flex; gap: 16px; }
.chat-panel { flex: 2; }
.task-panel { flex: 1; border-left: 1px solid #ddd; padding-left: 16px; }
.step { padding: 8px; margin: 4px 0; border-radius: 4px; }
.step.running { background: #f0f8ff; }
.step.completed { background: #f0fff0; }
.progress-bar { height: 6px; background: #e0e0e0; border-radius: 3px; margin: 4px 0; }
.progress-fill { height: 100%; background: #4caf50; border-radius: 3px; transition: width 0.3s; }
</style>
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：自适应模式切换

根据任务复杂度自动选择合适的交互模式：

```typescript
function selectInteractionMode(taskComplexity: number, taskType: string): string {
  // 简单任务 → 对话式
  if (taskComplexity < 0.3) return 'chat'

  // 多步骤任务 → 任务面板
  if (taskType === 'multi_step') return 'task_panel'

  // 需要调试的工作流 → 工作流可视化
  if (taskType === 'workflow') return 'workflow'

  // 综合任务 → 混合模式
  return 'hybrid'
}
```

### 技巧二：状态转换动画

```css
/* 状态切换时的平滑过渡动画 */
.agent-status-bar {
  transition: background-color 0.3s ease, transform 0.2s ease;
}
.thinking { animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```

### 技巧三：响应式布局策略

```typescript
// 根据屏幕宽度自动调整布局
function getLayout(width: number): 'single' | 'side_by_side' | 'split' {
  if (width < 600) return 'single'         // 手机：只显示当前活跃面板
  if (width < 1024) return 'side_by_side'  // 平板：对话 + 任务面板
  return 'split'                           // 桌面：三栏显示
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：什么时候应该用任务面板而不是对话式界面？**

> A：当 AI 需要执行多步操作（数据清洗→分析→生成报告）时，任务面板能让用户清晰看到每步的进度。对话式界面只适合一问一答的简单场景。一个判断标准是：如果任务超过 3 步且每一步耗时超过 2 秒，就应该用任务面板。

**Q2：Agent 的 8 种状态之间有哪些合法转换？**

> A：核心规则：idle → thinking → calling_tool → streaming → completed。任何时候都可能进入 error 状态。waiting_approval 通常在 calling_tool 之后或关键操作之前。用户随时可以取消（cancelled）。

**Q3：混合模式如何避免界面过于复杂？**

> A：将屏幕按功能分区，每个模式占据一个区域。默认只显示对话区，任务面板和工作流可视化根据任务状态自动展开/收起。用户也可以手动折叠不需要的区域。

**Q4：实时反馈设计中，为什么需要「取消」按钮？**

> A：AI 推理可能耗时较长（30 秒+），如果用户发现自己的问题不够准确或已经得到答案，需要能中断正在进行的推理。没有取消按钮，用户只能刷新页面或等待，体验很差。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 所有任务都用对话式界面 | 未根据任务复杂度选择合适的交互模式 | 超过 3 步或耗时 > 5 秒的任务使用任务面板 |
| Agent 状态只有「加载中」和「已完成」 | 缺少详细的 Agent 生命周期设计 | 设计完整的状态机，至少包含 6-8 种 Agent 状态 |
| 实时反馈不及时 | 前端未使用流式连接（SSE/WebSocket） | 使用 SSE 或 WebSocket 替代 HTTP 轮询 |
| 混合模式布局在手机上显示不全 | 未适配移动端响应式布局 | 移动端使用抽屉式，一次只显示一个面板 |
| 状态切换时 UI 闪烁 | 未做状态过渡动画 | 使用 CSS transition 实现平滑状态切换 |
| 取消按钮无效 | 前端发送取消后后端未中止操作 | 使用 AbortController + WebSocket 取消消息双重保障 |
| 用户看不到 Agent 在想什么 | 缺少思考过程的可视化 | 展示流式思考文本，让用户「看到」Agent 的推理过程 |

---

## 📝 本章小结

- ✅ **对话式** — 最通用，适合简单交互，用户学习成本低
- ✅ **任务面板** — 展示多步任务进度，让执行过程透明化
- ✅ **工作流可视化** — 展示推理和执行流程，适合调试场景
- ✅ **混合模式** — 结合多种模式的优势，根据场景自动切换
- ✅ **状态设计** — 8 种 Agent 状态及对应的视觉设计，确保用户始终知道 Agent 的状态
- ✅ **实时反馈** — 通过流式连接实现低延迟的状态更新

## ➡️ 下一章预告

> 本章学习了四种 Agent 交互模式和状态设计。在下一章中，我们将深入 Agent 状态的可视化实现——为每种状态设计对应的 UI 组件和动画效果。
> [第2章：Agent 状态展示](./02-status-display.md)
