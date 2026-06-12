# 第3章：工具调用可视化 — 让工具执行过程透明

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **将 Agent 的工具调用过程可视化** — 让用户看到 AI 在执行哪个工具
- **显示每个工具的输入/输出/状态/耗时** — 实现完整的工具调用卡片
- **处理工具调用错误和超时** — 给用户清晰的错误反馈

## 📋 前置知识

> 建议先完成：
> - [第2章：Agent 状态展示](./02-status-display.md) — 了解 Agent 状态和实时反馈设计

---

## 💡 核心概念

### 什么是工具调用可视化？

**生活类比：** 假设你让一个维修师傅来修水管。你不会希望他闷声不响地在厨房干活——你希望看到他拿出了什么工具（扳手还是电钻）、在修哪个部位（冷水管还是热水管）、修到什么程度了（还在拆还是已经装好了）。工具调用可视化就是让 Agent 的「维修过程」对用户透明。

当 AI Agent 调用工具时（搜索、读文件、执行代码、调用 API），用户应该清楚地看到：
- **调用了什么工具** — 工具名称和用途
- **传入了什么参数** — 输入数据
- **执行状态** — 进行中/成功/失败
- **返回了什么结果** — 输出数据
- **耗时** — 执行了多久

### 工具调用卡片设计

```vue
<template>
  <div class="tool-call-card" :class="{ error: isError }">
    <div class="tool-header">
      <span class="tool-icon">{{ getIcon(toolName) }}</span>
      <span class="tool-name">{{ toolName }}</span>
      <span class="tool-duration">{{ duration }}ms</span>
      <span class="tool-status" :class="status">{{ statusLabel }}</span>
    </div>
    <div class="tool-detail">
      <div class="input-section">
        <h4>输入参数</h4>
        <pre>{{ JSON.stringify(args, null, 2) }}</pre>
      </div>
      <div class="output-section">
        <h4>返回结果</h4>
        <pre>{{ truncateOutput(result) }}</pre>
      </div>
    </div>
  </div>
</template>
```

### 工具调用的五种状态

```typescript
type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timed_out'

interface ToolCall {
  id: string
  name: string            // 工具名称
  args: Record<string, any> // 输入参数
  status: ToolCallStatus
  result?: any            // 返回结果
  error?: string          // 错误信息
  startTime: number       // 开始时间
  endTime?: number        // 结束时间
  duration?: number       // 耗时(ms)
}

// 每种状态对应的视觉设计
const toolStatusDesign = {
  pending:    { icon: '⏳', color: '#999', label: '等待中' },
  running:    { icon: '🔄', color: '#e67e22', label: '执行中', animation: 'spin' },
  completed:  { icon: '✅', color: '#27ae60', label: '已完成' },
  failed:     { icon: '❌', color: '#e74c3c', label: '失败' },
  timed_out:  { icon: '⏰', color: '#f39c12', label: '超时' },
}
```

> **💡 为什么展示工具参数和结果？** 让用户看到「Agent 调了什么工具、传了什么参数、得到了什么结果」——这是建立透明信任的关键。如果 Agent 出错，用户能直接从工具调用记录中看出是哪一步出了问题。

### 工具分组与折叠

当 Agent 在同一阶段调用多个工具时，将它们分组展示：

```vue
<!-- 工具调用分组 -->
<details v-for="group in toolGroups" :key="group.phase" class="tool-group">
  <summary>
    <span class="phase-name">{{ group.phase }}</span>
    <span class="phase-summary">
      {{ group.completed }} / {{ group.total }} 完成
    </span>
  </summary>

  <ToolCallCard
    v-for="tool in group.tools"
    :key="tool.id"
    :tool="tool"
  />
</details>
```

---

## 🔨 实战演练

### 练习：构建一个文件分析 Agent 的工具调用面板

**场景描述：** 你的 Agent 需要分析用户上传的文件——读取文件、分析内容、提取关键信息、生成摘要。用户希望实时看到 Agent 每一步在做什么工具、处理了什么数据。

**你的任务：**
1. 实现一个工具调用跟踪面板
2. 每个工具调用显示名称、参数、状态、耗时
3. 按执行阶段分组展示
4. 错误工具调用以红色高亮

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```vue
<!-- ToolCallTracker.vue -->
<script setup lang="ts">
import { ref, reactive } from 'vue'

interface ToolCall {
  id: string
  name: string
  args: string
  status: 'running' | 'completed' | 'failed'
  result?: string
  error?: string
  duration?: string
}

const toolCalls = reactive<ToolCall[]>([])
const isExecuting = ref(false)

// 模拟文件分析 Agent 的工具调用
async function runFileAnalysis() {
  isExecuting.value = true
  toolCalls.length = 0

  // 工具 1：读取文件
  const readFile: ToolCall = {
    id: '1', name: 'read_file',
    args: 'file: "report.pdf", format: "auto"',
    status: 'running',
  }
  toolCalls.push(readFile)
  await delay(1500)
  readFile.status = 'completed'
  readFile.result = '读取成功: 24 页, 约 5000 字'
  readFile.duration = '1.5s'

  // 工具 2：调用 LLM 分析
  const analyze: ToolCall = {
    id: '2', name: 'llm_analyze',
    args: 'task: "提取关键信息", max_tokens: 2000',
    status: 'running',
  }
  toolCalls.push(analyze)
  await delay(2500)
  analyze.status = 'completed'
  analyze.result = '提取到 8 个关键数据点：收入、成本、增长趋势...'
  analyze.duration = '2.5s'

  // 工具 3：生成摘要
  const summarize: ToolCall = {
    id: '3', name: 'generate_summary',
    args: 'format: "markdown", max_length: 500',
    status: 'running',
  }
  toolCalls.push(summarize)
  await delay(1000)
  summarize.status = 'completed'
  summarize.result = '## 摘要\n报告显示公司 Q3 营收同比增长 15%...'
  summarize.duration = '1.0s'

  isExecuting.value = false
}

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

function getStatusIcon(status: string) {
  if (status === 'running') return '🔄'
  if (status === 'completed') return '✅'
  if (status === 'failed') return '❌'
  return '⏳'
}
</script>

<template>
  <div class="tool-tracker">
    <div class="header">
      <h3>🔧 工具调用跟踪</h3>
      <button @click="runFileAnalysis" :disabled="isExecuting" class="run-btn">
        {{ isExecuting ? '⏳ 执行中...' : '🚀 运行文件分析' }}
      </button>
    </div>

    <div class="tool-list">
      <div v-for="tool in toolCalls" :key="tool.id"
        class="tool-item"
        :class="tool.status"
      >
        <div class="tool-header">
          <span class="status-icon">{{ getStatusIcon(tool.status) }}</span>
          <span class="name">{{ tool.name }}</span>
          <span v-if="tool.duration" class="duration">⏱️ {{ tool.duration }}</span>
        </div>

        <details>
          <summary>查看详情</summary>
          <div class="details">
            <div class="args">
              <strong>参数：</strong>
              <code>{{ tool.args }}</code>
            </div>
            <div v-if="tool.result" class="result">
              <strong>结果：</strong>
              <pre>{{ tool.result }}</pre>
            </div>
            <div v-if="tool.error" class="error">
              <strong>错误：</strong>
              <pre>{{ tool.error }}</pre>
            </div>
          </div>
        </details>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-tracker {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
}
.header { display: flex; justify-content: space-between; align-items: center; }
.run-btn {
  padding: 8px 16px;
  background: #4a90d9;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.tool-item {
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 12px;
  margin: 8px 0;
}
.tool-item.running { border-color: #e67e22; background: #fffaf0; }
.tool-item.completed { border-color: #27ae60; background: #f0fff0; }
.tool-item.failed { border-color: #e74c3c; background: #fff0f0; }
.tool-header { display: flex; align-items: center; gap: 8px; }
.name { font-weight: 600; }
.duration { margin-left: auto; color: #888; font-size: 12px; }
details summary { cursor: pointer; color: #4a90d9; margin-top: 8px; }
.details { margin-top: 8px; padding: 8px; background: #fafafa; border-radius: 4px; }
code, pre { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
pre { white-space: pre-wrap; }
</style>
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：工具调用链可视化

当工具之间存在依赖关系时（工具 B 的输入依赖工具 A 的输出），用连线图展示：

```typescript
interface ToolGraphNode {
  id: string
  name: string
  status: ToolCallStatus
  parentIds: string[]  // 前置工具的 ID
}

// 使用 dagre 布局算法自动排列
import dagre from 'dagre'
function layoutToolGraph(nodes: ToolGraphNode[]) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB' }) // 从上到下
  nodes.forEach(n => g.setNode(n.id, { width: 180, height: 60 }))
  nodes.forEach(n => n.parentIds.forEach(p => g.setEdge(p, n.id)))
  dagre.layout(g)
  // 读取布局坐标
}
```

### 技巧二：工具调用耗时排行榜

```typescript
function getTopSlowTools(toolCalls: ToolCall[]) {
  return [...toolCalls]
    .filter(t => t.duration != null)
    .sort((a, b) => (b.duration || 0) - (a.duration || 0))
    .slice(0, 3)
    .map(t => ({ name: t.name, duration: t.duration }))
}
// 帮助用户快速发现性能瓶颈
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：工具调用可视化和普通日志输出有什么不同？**

> A：普通日志是线性的文本流，适合开发者查看。工具调用可视化是结构化的 UI 组件——每个工具调用是一个独立卡片，状态一目了然（通过颜色/图标），支持展开/折叠查看详情，用户可以直观地看到工具的调用顺序、耗时、输入输出。

**Q2：什么时候应该折叠工具调用详情？**

> A：默认只显示工具名称、状态、耗时。输入参数和返回结果默认折叠——因为这些内容可能很长（如读取的文件内容）。只有在用户需要查看时才展开。

**Q3：如何处理工具调用超时？**

> A：设置每个工具的加载超时（如 30 秒），超时后将状态标记为 timed_out，显示「工具调用超时」错误。同时提供「重试」按钮让用户可以手动重试失败的调用。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 工具调用详情默认全部展开 | 未做折叠设计，用户被大量数据淹没 | 默认折叠详情，只在用户点击时展开 |
| 工具调用状态不更新 | 前端未监听 WebSocket 消息 | 使用事件驱动模式，后端推状态更新 |
| 错误工具调用不醒目 | 错误状态和正常状态视觉差异太小 | 错误状态使用红色边框 + 红色背景 |
| 超长的工具输出导致页面卡顿 | 未截断工具返回结果 | 长结果默认截断为 200 字符，提供「查看全部」按钮 |

---

## 📝 本章小结

- ✅ **工具调用卡片** — 展示工具名称、参数、状态、耗时、结果
- ✅ **五种工具状态** — pending / running / completed / failed / timed_out
- ✅ **工具分组** — 按执行阶段分组展示相关工具
- ✅ **错误状态醒目提示** — 红色高亮、错误信息、重试按钮
- ✅ **透明化 Agent 行为** — 让用户看到 Agent 的每一步操作，建立信任

## ➡️ 下一章预告

> 本章学习了工具调用可视化。在下一章中，我们将深入人机协作界面——在 Agent 流程中嵌入人工审批，实现 Human-in-the-Loop 交互模式。
> [第4章：人机协作界面](./04-human-in-loop-ui.md)
