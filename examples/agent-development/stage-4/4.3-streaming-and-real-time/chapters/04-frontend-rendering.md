# 第4章：前端流式渲染 — 实时展示 AI 输出

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **在前端高效渲染流式 AI 输出** — 实时展示逐字到达的 AI 回复
- **处理 Markdown 和代码块的增量渲染** — 不完整代码块不渲染
- **优化渲染性能** — 避免高频重渲染导致的卡顿

## 📋 前置知识

> 建议先完成：
> - [第1章：SSE（Server-Sent Events）](./01-sse.md) — 了解流式数据如何从前端接收
> - [第3章：流式 JSON 解析](./03-streaming-json.md) — 了解流式数据的解析方法

---

## 💡 核心概念

### 流式渲染的核心挑战

**生活类比：** 想象你在看一场足球比赛的文字直播。如果每收到一个字就刷新整个页面，你的眼睛会受不了。如果每 5 秒刷新一次，你会错过关键信息。好的直播是：收到更新后立即增量添加到页面，但不重新渲染整个页面——这就是流式渲染的平衡。

流式渲染需要解决三个问题：
1. **渲染频率** — 每收到一个字就渲染？还是攒一批再渲染？
2. **Markdown 渲染** — 不完整的 Markdown（如一半的代码块）怎么处理？
3. **性能** — 长时间流式输出时怎么避免内存泄漏？

### 基础实现：打字机效果

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'

const streamContent = ref('')
const displayedText = ref('')

// 打字机效果：逐字显示
watch(streamContent, (newContent) => {
  // 直接更新显示内容（简单场景）
  displayedText.value = newContent
})
</script>

<template>
  <div class="stream-text">
    {{ displayedText }}<span v-if="isStreaming" class="cursor">|</span>
  </div>
</template>
```

### 性能优化：requestAnimationFrame 节流

```vue
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { marked } from 'marked'

const streamContent = ref('')
const renderedHtml = ref('')
const isCodeBlock = ref(false)
let frameId = 0

// 监听流式内容变化
watch(streamContent, async (newContent) => {
  // 检测代码块边界
  const codeBlockCount = (newContent.match(/```/g) || []).length
  isCodeBlock.value = codeBlockCount % 2 !== 0

  if (!isCodeBlock.value) {
    // 低频率更新 UI（使用 requestAnimationFrame 节流）
    cancelAnimationFrame(frameId)
    frameId = requestAnimationFrame(() => {
      renderedHtml.value = marked(newContent)
    })
  }
})
</script>

<template>
  <div class="stream-output" v-html="renderedHtml" />
</template>
```

> **💡 为什么代码块要等完整后再渲染？** 如果逐字渲染代码块，用户会看到「打了一半的代码」，而代码块未闭合还会导致后续内容被错误地渲染为代码块。检测到代码块开始时暂停渲染，等闭合后再渲染，用户体验更好。

### 打字机效果：逐字动画

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'

const streamContent = ref('')
const animatedText = ref('')
const isStreaming = ref(false)
let animationTimer: number | null = null

// 模拟打字机效果：30ms 显示一个字
watch(streamContent, (newContent) => {
  if (!isStreaming.value) return

  // 已经有动画在运行
  if (animationTimer) return

  let index = animatedText.value.length
  animationTimer = window.setInterval(() => {
    if (index < newContent.length) {
      animatedText.value += newContent[index++]
    } else {
      clearInterval(animationTimer!)
      animationTimer = null
    }
  }, 30) // 每 30ms 显示一个字
})
</script>
```

### 虚拟滚动：超长输出优化

对于非常长的 AI 输出（如生成整篇文章），只渲染可视区域：

```typescript
// 虚拟滚动核心逻辑
function useVirtualScroll(containerRef: Ref<HTMLElement | null>, items: Ref<string[]>) {
  const visibleItems = ref<string[]>([])
  const ITEM_HEIGHT = 20       // 每行高度
  const BUFFER_SIZE = 10       // 缓冲区行数

  function onScroll() {
    const container = containerRef.value
    if (!container) return

    const scrollTop = container.scrollTop
    const viewportHeight = container.clientHeight

    const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_SIZE)
    const endIndex = Math.min(
      items.value.length,
      Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + BUFFER_SIZE
    )

    visibleItems.value = items.value.slice(startIndex, endIndex)
  }

  return { visibleItems, onScroll }
}
```

---

## 🔨 实战演练

### 练习：构建一个带打字机效果的 Markdown 流式渲染器

**场景描述：** Agent 以流式输出 Markdown 格式的回复，需要在前端实现一个渲染器——既能逐字展示打字机效果，又能正确处理代码块、表格、列表。

**你的任务：**
1. 接收流式数据，实现打字机动画
2. 检测代码块边界，在代码块内暂停渲染
3. 使用 requestAnimationFrame 节流渲染频率
4. 支持常见的 Markdown 语法

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```vue
<!-- StreamMarkdownRenderer.vue -->
<script setup lang="ts">
import { ref, watch, computed } from 'vue'

const props = defineProps<{
  content: string       // 流式输入
  isStreaming: boolean
}>()

const displayBuffer = ref('')
const renderedHtml = ref('')
let isInsideCodeBlock = ref(false)
let frameId = 0

// 简单的 Markdown 渲染（不用第三方库）
function renderSimpleMarkdown(text: string): string {
  // 确保 text 存在
  if (!text) return ''

  let html = text
    // 代码块（完整）
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // 内联代码
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // 加粗
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // 斜体
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 换行
    .replace(/\n/g, '<br>')
  return html
}

// 监听流式内容
watch(() => props.content, (newContent) => {
  displayBuffer.value = newContent

  // 检测是否在代码块内
  const codeBlockMatches = (newContent.match(/```/g) || []).length
  isInsideCodeBlock.value = codeBlockMatches % 2 !== 0

  // 如果在代码块内，不渲染
  if (isInsideCodeBlock.value) return

  // 使用 requestAnimationFrame 节流
  cancelAnimationFrame(frameId)
  frameId = requestAnimationFrame(() => {
    renderedHtml.value = renderSimpleMarkdown(newContent)
  })
})

const showCursor = computed(() => {
  return props.isStreaming && !isInsideCodeBlock.value
})
</script>

<template>
  <div class="markdown-renderer">
    <div class="content" v-html="renderedHtml" />
    <span v-if="showCursor" class="cursor">|</span>
  </div>
</template>

<style scoped>
.markdown-renderer {
  padding: 12px;
  line-height: 1.7;
  font-size: 15px;
}
.content :deep(pre) {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
}
.content :deep(code) {
  background: #f0f0f0;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 14px;
}
.content :deep(strong) { font-weight: 600; }
.cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: #333;
  animation: blink 0.8s infinite;
  margin-left: 2px;
  vertical-align: text-bottom;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>
```

**Streaming Demo 用法：**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import StreamMarkdownRenderer from './StreamMarkdownRenderer.vue'

const streamContent = ref('')
const isStreaming = ref(false)
let index = 0

// 模拟 AI 流式输出
const fullText = `## 分析结果\n\n根据您的数据，我们发现了以下趋势：\n\n1. **营收增长** — Q3 同比增长 15%\n2. **用户活跃度** — DAU 提升 23%\n\`\`\`typescript\nconst trend = { revenue: 0.15, dau: 0.23 }\n\`\`\`\n\n> 建议重点关注移动端用户。`

function startStream() {
  isStreaming.value = true
  index = 0
  streamContent.value = ''
  const timer = setInterval(() => {
    if (index >= fullText.length) {
      clearInterval(timer)
      isStreaming.value = false
      return
    }
    streamContent.value += fullText[index++]
  }, 50)
}
</script>

<template>
  <div>
    <button @click="startStream" :disabled="isStreaming">
      {{ isStreaming ? '⏳ 流式输出中...' : '🚀 开始流式输出' }}
    </button>
    <StreamMarkdownRenderer :content="streamContent" :is-streaming="isStreaming" />
  </div>
</template>
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：差分渲染

```typescript
// 只渲染新增的部分，而不是每次渲染全部内容
let lastRenderedLength = 0

function renderDifferential(newContent: string) {
  const newPart = newContent.slice(lastRenderedLength)
  if (newPart) {
    // 只将新增部分追加到 DOM
    appendToDOM(renderSimpleMarkdown(newPart))
    lastRenderedLength = newContent.length
  }
}
```

### 技巧二：代码块语法高亮

```typescript
// 使用 highlight.js 或 Prism.js 在代码块完整时添加语法高亮
function highlightCodeBlock(codeBlock: HTMLElement) {
  // 检测代码块何时完整
  const observer = new MutationObserver(() => {
    const code = codeBlock.textContent || ''
    if (code.startsWith('```') && code.endsWith('```') && code.length > 6) {
      // 代码块完整，应用语法高亮
      hljs.highlightElement(codeBlock)
      observer.disconnect()
    }
  })
  observer.observe(codeBlock, { childList: true, characterData: true })
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：requestAnimationFrame 节流相比 setTimeout 有什么优势？**

> A：requestAnimationFrame 在浏览器准备下一帧绘制时执行，不会在后台标签页中执行（节省资源），帧率与显示器刷新率同步（60fps vs 随机间隔）。setTimeout(fn, 0) 可能在 4ms-100ms 之间波动，而且后台标签页也会执行。

**Q2：代码块在流式输出中如何处理好？**

> A：检测到开始标记（```）后暂停 Markdown 渲染，等检测到结束标记（```）后再一起渲染。如果用户在代码块结束前关闭了页面，丢弃不完整的代码块。在代码块内的文本直接作为纯文本显示，不应用 Markdown 格式。

**Q3：超长流式输出如何防止内存泄漏？**

> A：设置消息上限（如保留最近 100 条），超过上限时丢弃旧消息。或者在虚拟滚动模式下只保留渲染区域附近的数据。还需要在组件 `onUnmounted` 中清理定时器和 requestAnimationFrame。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 高频渲染导致页面卡顿 | 每次收到数据都触发 UI 更新 | 使用 requestAnimationFrame 节流，合并多次更新 |
| 代码块中间的文本被错误渲染 | 代码块未闭合时就开始渲染 | 检测代码块边界，在不完整时暂停渲染 |
| 打字机效果在代码块内逐字显示 | 对代码块也应用了打字机效果 | 代码块内容一次性显示，不打字机动画 |
| 组件卸载后仍在更新状态 | 未在 onUnmounted 中清理定时器 | 使用 onUnmounted 取消所有定时器和 animationFrame |
| 内存泄漏：消息不断累积 | 所有历史消息都存在内存中不清理 | 设置消息上限（如 200 条），超出时丢弃最旧的 |

---

## 📝 本章小结

- ✅ **requestAnimationFrame 节流** — 优化渲染频率，避免卡顿
- ✅ **代码块边界检测** — 不完整的代码块不渲染
- ✅ **打字机效果** — 每 30ms 显示一个字，模拟人类打字
- ✅ **差分渲染** — 只渲染新增内容，不重新渲染全部
- ✅ **虚拟滚动** — 超长输出只渲染可视区域

## ➡️ 下一章预告

> 本章学习了前端流式渲染。在下一章中，我们将学习断线重连与状态恢复——在网络中断后恢复 Agent 的对话状态。
> [第5章：断线重连与状态恢复](./05-reconnection.md)
