# 第3章：流式 JSON 解析 — 处理结构化流式数据

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **解析流式 JSON** — 处理分块到达的 JSON 数据
- **实现增量解析** — 在数据不完整时仍能提取有用信息
- **处理嵌套 JSON 对象的流式解析** — 括号深度追踪算法

## 📋 前置知识

> 建议先完成：
> - [第1章：SSE（Server-Sent Events）](./01-sse.md) — 了解流式数据的基础

---

## 💡 核心概念

### 为什么需要流式 JSON 解析？

**生活类比：** 想象你在收一封很长的信。如果你必须等整封信到了才能读，那就失去了平信和快递的区别。流式 JSON 解析就像一边收信一边看——信封刚拆开你就看到了开头的内容，不用等整封信读完。

当 AI 流式输出 JSON 时，数据是分块到达的：

```
Chunk 1: {"name": "Alice", "a
Chunk 2: ge": 30, "skills": [
Chunk 3: "TypeScript", "Python"
Chunk 4: ]}
```

**不能**等到全部到达再解析（那就失去了流式的意义）。

#### 流式 JSON 解析的难点在哪？

看这个问题：下面这段 JSON 如果是分块到达的，你怎么处理？

```
块 1: {"name": "Alice", "a
块 2: ge": 30, "skills": [
块 3: "TypeScript", "Python"
块 4: ]}
```

最直觉的做法是「攒够了再解析」——把收到的所有数据拼成一个字符串，等传输完了再丢给 `JSON.parse()`。但这就失去了流式的意义——AI 输出 JSON 的目的就是为了让你**边收边用**，不等全部生成完。

所以你需要一个能**边收边解析**的方法。

##### 第一种思路：try-catch 大法

最直接的想法：每次收到新数据块，把整个 buffer 拼起来，`try { JSON.parse(buffer) } catch { /* 还没完整，再等等 */ }`。

这个方法的问题是**性能太差了**——如果数据分了 100 个块到达，你就对同一段不断增长的数据执行了 100 次 `JSON.parse` 尝试。而且每次失败抛出的异常也有开销。

##### 第二种思路：括号深度追踪（更好）

仔细想一下：JSON 本质上就像一个套娃——`{}` 可以嵌套无数层。一个 JSON 对象什么时候才算完整？**当所有括号都闭合的时候。**

所以核心算法是：**数括号**。

```
输入: { "a": { "b": [1, 2] }, "c": 3 }
       ↑                          ↑
       深度 1 → 2 → 3 → 3 → 2 → 1 → 0
                                    ↑ 深度回到 0，说明完整了！
```

每次收到新数据，更新当前深度：

```typescript
let depth = 0
let buffer = ''

function feed(chunk) {
  buffer += chunk
  for (const c of chunk) {
    if (c === '{' || c === '[') depth++
    if (c === '}' || c === ']') depth--
  }
  if (depth === 0 && buffer.trim().startsWith('{')) {
    // ✅ 完整了！可以解析了
    const obj = JSON.parse(buffer)
    buffer = ''
    return obj
  }
  return null // 还没完整
}
```

这个方法比 try-catch 快很多——你只是遍历每个字符做加减法，不涉及字符串解析。

##### 有一个坑：字符串里的大括号

看这个 JSON：

```json
{"code": "if (x > 0) { return x; }"}
```

如果按上面的简单算法，遇到 `{` 深度 +1，遇到 `}` 深度 -1，你会发现在字符串内部的 `{ return x; }` 也被计数了——结果你就永远等不到「深度归零」的时刻。

怎么解决？**解析器要能识别「当前是否在字符串内」**——进入字符串（遇到 `"`）后，停止计数括号，直到退出字符串（遇到下一个 `"`）：

```
"code": "if (x > 0) { return x; }"
        ↑                           ↑
        进字符串                     出字符串
        中间的 { 和 } 都不计数！
```

加上一个 `inString` 标志位就能解决。这就是为什么真实的流式 JSON 解析器比看起来复杂一点点——它其实是一个**微型状态机**，跟踪自己当前在「对象内」「数组内」「字符串内」还是「键名内」。

> **💡 为什么 AI 会输出流式 JSON？** 很多 AI 应用需要结构化输出——Agent 的工具调用参数是 JSON、数据分析结果也是 JSON。如果必须等 AI 生成完整个 JSON 才能解析，前端就得白等几秒钟。流式 JSON 解析让前端能在数据到达时立即处理，例如：在 JSON 对象名称字段到达时就展示用户名称，不用等整个对象完整。

### 增量 JSON 解析器

```typescript
class IncrementalJsonParser {
  private buffer = ''
  private depth = 0
  private currentObject = ''

  feed(chunk: string): any[] {
    this.buffer += chunk
    const results: any[] = []

    for (const char of chunk) {
      if (char === '{') this.depth++
      if (char === '}') this.depth--
    }

    // 当 depth 归零时，说明一个完整 JSON 对象到达
    if (this.depth === 0 && this.buffer.trim().startsWith('{')) {
      try {
        results.push(JSON.parse(this.buffer))
        this.buffer = ''
      } catch {
        // 不完整，继续等待
      }
    }

    return results
  }
}
```

### 增强版：支持 JSON 数组中多个对象

```typescript
class StreamingJsonParser {
  private buffer = ''
  private braceDepth = 0
  private bracketDepth = 0
  private completed: any[] = []

  feed(chunk: string): any[] {
    this.buffer += chunk
    const newItems: any[] = []

    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] === '{') this.braceDepth++
      if (chunk[i] === '}') this.braceDepth--
      if (chunk[i] === '[') this.bracketDepth++
      if (chunk[i] === ']') this.bracketDepth--
    }

    // 尝试提取所有完整对象
    while (this.tryExtract()) {
      // 提取成功
    }

    return newItems
  }

  private tryExtract(): boolean {
    // 找到 buffer 中第一个完整的 JSON 对象
    const trimmed = this.buffer.trim()
    if (!trimmed.startsWith('{')) return false

    let d = 0
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === '{') d++
      if (trimmed[i] === '}') d--
      if (d === 0) {
        // 找到一个完整对象
        const objStr = trimmed.substring(0, i + 1)
        try {
          this.completed.push(JSON.parse(objStr))
          this.buffer = trimmed.substring(i + 1)
          return true
        } catch {
          return false
        }
      }
    }
    return false
  }

  getCompleted(): any[] {
    return this.completed
  }
}
```

### 带类型提示的流式 JSON

AI 还可以输出带类型标记的结构化流式数据，解析器可以根据类型提前处理：

```typescript
// 结构化流式输出格式
interface StreamEvent<T = any> {
  type: 'partial' | 'complete' | 'error'
  path: string     // JSON path, 如 "user.name"
  value?: T
  error?: string
}

// 使用示例
const parser = new StreamingJsonParser()
const chunks = [
  '{"type":"partial","path":"user.name","value":"Ali',
  'ce"},{"type":"complete","path":"user","value":{"name":"Alice"}}',
]

for (const chunk of chunks) {
  const events = parser.feed(chunk)
  for (const event of events) {
    if (event.type === 'partial') {
      // 前端可以提前渲染部分数据
      updateUI(event.path, event.value)
    }
  }
}
```

### 前端 Vue 3 集成

```vue
<script setup lang="ts">
import { ref } from 'vue'

const streamContent = ref('')
const parsedData = ref<any>(null)
const parser = new StreamingJsonParser()

function onChunkReceived(chunk: string) {
  streamContent.value += chunk
  const items = parser.feed(chunk)
  if (items.length > 0) {
    parsedData.value = items[items.length - 1]
  }
}
</script>

<template>
  <div class="stream-json">
    <h3>📄 原始流式数据</h3>
    <pre class="raw">{{ streamContent }}</pre>

    <h3>✅ 已解析对象</h3>
    <pre class="parsed">{{ JSON.stringify(parsedData, null, 2) }}</pre>
  </div>
</template>
```

---

## 🔨 实战演练

### 练习：实现一个流式 JSON 日志分析器

**场景描述：** Agent 正在分析日志文件，结果以 JSON 格式流式输出。你需要实现一个解析器，在数据到达时逐行展示已解析的结果。

**你的任务：**
1. 实现流式 JSON 解析器（支持嵌套对象）
2. 模拟 AI 分块输出 JSON 数据
3. 实时展示已解析的部分

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```vue
<!-- StreamingJsonViewer.vue -->
<script setup lang="ts">
import { ref, reactive } from 'vue'

const rawContent = ref('')
const parsedItems = reactive<any[]>([])
const parser = new StreamingJsonParser()
const isStreaming = ref(false)

function simulateStream() {
  isStreaming.value = true
  parsedItems.length = 0
  rawContent.value = ''

  // 模拟 AI 分块输出
  const chunks = [
    '{"level":"error","message":"连接超时","count":',
    '12,"service":"auth"},{"level":"warn","message":"',
    '重试次数过多","count":5,"service":"api"},{"level"',
    ':"info","message":"服务已恢复","count":1,"service":"db"}'
  ]

  let index = 0
  const timer = setInterval(() => {
    if (index >= chunks.length) {
      clearInterval(timer)
      isStreaming.value = false
      return
    }

    const chunk = chunks[index++]
    rawContent.value += chunk

    // 解析增量数据
    const items = parser.feed(chunk)
    for (const item of items) {
      parsedItems.push(item)
    }
  }, 500)
}

class StreamingJsonParser {
  private buffer = ''
  private braceDepth = 0

  feed(chunk: string): any[] {
    this.buffer += chunk
    const results: any[] = []

    for (const char of chunk) {
      if (char === '{') this.braceDepth++
      if (char === '}') this.braceDepth--
    }

    let found = true
    while (found) {
      found = this.tryExtract(results)
    }

    return results
  }

  private tryExtract(results: any[]): boolean {
    const trimmed = this.buffer.trim()
    if (!trimmed.startsWith('{')) return false

    let depth = 0
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === '{') depth++
      if (trimmed[i] === '}') depth--
      if (depth === 0) {
        try {
          results.push(JSON.parse(trimmed.substring(0, i + 1)))
          this.buffer = trimmed.substring(i + 1)
          return true
        } catch { return false }
      }
    }
    return false
  }
}
</script>

<template>
  <div class="stream-json-viewer">
    <div class="controls">
      <h3>📊 流式 JSON 日志分析</h3>
      <button @click="simulateStream" :disabled="isStreaming">
        {{ isStreaming ? '⏳ 流式传输中...' : '🚀 模拟流式输出' }}
      </button>
    </div>

    <div class="panels">
      <!-- 原始数据 -->
      <div class="panel raw-panel">
        <h4>原始分块数据</h4>
        <pre>{{ rawContent || '等待数据...' }}</pre>
      </div>

      <!-- 已解析结果 -->
      <div class="panel parsed-panel">
        <h4>✅ 已解析对象 ({{ parsedItems.length }})</h4>
        <div v-for="(item, i) in parsedItems" :key="i" class="parsed-item" :class="item.level">
          <span class="level-badge">{{ item.level }}</span>
          <span class="message">{{ item.message }}</span>
          <span class="meta">count: {{ item.count }} | service: {{ item.service }}</span>
        </div>
        <p v-if="!parsedItems.length" class="hint">解析后的对象将在此显示</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stream-json-viewer { border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
.controls { display: flex; justify-content: space-between; align-items: center; }
.panels { display: flex; gap: 16px; margin-top: 16px; }
.panel { flex: 1; }
.raw-panel pre {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 4px;
  min-height: 150px;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
}
.parsed-item {
  padding: 8px;
  margin: 4px 0;
  border-radius: 4px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.parsed-item.error { background: #fff0f0; }
.parsed-item.warn { background: #fff8e1; }
.parsed-item.info { background: #e8f5e9; }
.level-badge {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}
.error .level-badge { background: #e74c3c; color: white; }
.warn .level-badge { background: #f39c12; color: white; }
.info .level-badge { background: #27ae60; color: white; }
.message { flex: 1; font-size: 14px; }
.meta { color: #888; font-size: 12px; }
.hint { color: #999; text-align: center; padding: 24px; }
</style>
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：JSON Schema 验证

```typescript
// 在解析时检查字段是否存在
function validateField(path: string[]): boolean {
  // 例如 path = ['user', 'email']
  const schema = {
    user: { type: 'object', required: ['name', 'email'] },
    user_name: { type: 'string' },
    user_email: { type: 'string', pattern: '^[\\w.-]+@[\\w.-]+\\.\\w+$' },
  }
  const key = path.join('_')
  return !!schema[key as keyof typeof schema]
}
```

### 技巧二：关联数据合并

```typescript
// AI 流式输出可能先输出 ID，再输出详情
// 需要将关联数据合并
class DataMerger {
  private cache = new Map<string, any>()

  merge(event: any) {
    if (event.type === 'partial') {
      this.cache.set(event.path, event.value)
    }
    if (event.type === 'complete') {
      const partial = this.cache.get(event.path) || {}
      return { ...partial, ...event.value }
    }
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：流式 JSON 解析和普通 JSON.parse 有什么不同？**

> A：JSON.parse 只能解析完整的 JSON 字符串，如果数据不完整就抛出异常。流式解析器跟踪括号深度，只提取完整的 JSON 对象，不完整的部分继续缓存等待更多数据。

**Q2：为什么不能用简单的字符串拼接后用 JSON.parse 解析？**

> A：如果 JSON 嵌套很深（如 `{"a":{"b":{"c":1}}}`），不完整时 `JSON.parse` 会直接报错。简单的字符串拼接后尝试 `try/catch` 可行但性能差——对每个字符都执行 `JSON.parse`。更好的方法是用括号深度追踪精确判断完整性。

**Q3：流式 JSON 解析在什么场景下会出问题？**

> A：当 JSON 值中包含大括号作为字符串时（如 `{"code":"if (x > 0) { return }"}`），简单的大括号计数会误判。解决方案是跳过字符串内的括号，只统计字符串外的括号。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 括号计数未跳过字符串内的 {} | JSON 值中包含大括号文字 | 解析时检测字符串引号，只统计引号外的括号 |
| 未处理转义字符导致解析失败 | JSON 中包含转义的引号或反斜杠 | 使用更完善的词法分析，正确处理转义 |
| 缓存不完整 JSON 导致内存泄漏 | 长时间未收到闭合括号，buffer 无限增长 | 设置 buffer 上限（如 1MB），超限时强制清空 |
| 未区分对象括号和数组括号 | 数组中的 `[]` 被误认为对象 | 分别跟踪 braceDepth 和 bracketDepth |
| 一次性收到过多数据导致 UI 卡顿 | 大量解析结果同时在 UI 中渲染 | 使用虚拟滚动或 requestAnimationFrame 分批渲染 |

---

## 📝 本章小结

- ✅ **流式 JSON 需要增量解析** — 不等完整就处理
- ✅ **括号深度追踪** — 判断 JSON 完整性的核心算法
- ✅ **跳过字符串内的括号** — 避免误判
- ✅ **buffer 上限保护** — 防止内存泄漏
- ✅ **关联数据合并** — 处理流式输出中的部分对象和完整对象

## ➡️ 下一章预告

> 本章学习了流式 JSON 解析。在下一章中，我们将学习如何在前端高效渲染流式 AI 输出——处理 Markdown、代码块，优化渲染性能。
> [第4章：前端流式渲染](./04-frontend-rendering.md)
