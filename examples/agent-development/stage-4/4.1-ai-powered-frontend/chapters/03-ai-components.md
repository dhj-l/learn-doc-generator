# 第3章：AI 组件设计 — 智能搜索、AI 表单与智能推荐

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **设计三种 AI-Native 组件** — 智能搜索框、AI 表单、个性化推荐组件
- **理解 AI 组件的状态模式** — 加载、流式、错误、空状态的处理
- **在 Vue/React 中实现 AI 组件** — 将 LLM 能力注入到常规 UI 组件中
- **处理 AI 组件的边界情况** — 速率限制、流式中断、结果不确定性

## 📋 前置知识

> 建议先完成：
> - [第1章：AI-Native UI 模式](./01-ai-native-ui.md) — 了解基本交互模式
> - [第2章：浏览器端 AI](./02-browser-ai.md) — 了解浏览器端推理

---

## 💡 核心概念

### 组件一：智能搜索框

**生活类比：** 普通搜索框像「图书馆的卡片目录」——只能按书名找书。智能搜索框像「图书馆管理员」——你说「帮我找几本关于如何学编程的书，适合零基础」，管理员能理解你的真实需求。

```vue
<!-- SmartSearch.vue — 智能搜索组件 -->
<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  apiEndpoint: string    // AI 搜索 API 地址
  placeholder?: string   // 搜索框占位文本
}>()

const query = ref('')
const suggestions = ref<string[]>([])
const isSearching = ref(false)
const error = ref('')
let debounceTimer: number | null = null

// 输入时获取 AI 建议
watch(query, (newQuery) => {
  // 防抖：用户停止输入 300ms 后才发起搜索
  if (debounceTimer) clearTimeout(debounceTimer)
  if (newQuery.length < 2) {
    suggestions.value = []
    return
  }

  debounceTimer = window.setTimeout(async () => {
    await fetchSuggestions(newQuery)
  }, 300)
})

// AI 语义搜索
async function fetchSuggestions(searchTerm: string) {
  isSearching.value = true
  error.value = ''

  try {
    // 调用 AI 搜索 API（后端代理）
    const response = await fetch(props.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: searchTerm,
        max_results: 5,
        // 请求语义搜索，而非关键词匹配
        mode: 'semantic',
      }),
    })

    if (!response.ok) throw new Error(`搜索失败 (${response.status})`)

    const data = await response.json()

    // AI 可能会返回建议和相关问题
    suggestions.value = [
      ...data.results.map((r: any) => r.title),
      ...(data.relatedQuestions || []).map((q: string) => `💡 ${q}`),
    ]
  } catch (err) {
    error.value = (err as Error).message
    suggestions.value = []
  } finally {
    isSearching.value = false
  }
}

// 选择建议
function selectSuggestion(suggestion: string) {
  query.value = suggestion.replace(/^💡\s*/, '')
  suggestions.value = []
  // 触发搜索
  emit('search', query.value)
}

const emit = defineEmits<{
  search: [query: string]
}>()
</script>

<template>
  <div class="smart-search">
    <div class="search-input-wrapper">
      <input
        v-model="query"
        :placeholder="placeholder || '用自然语言描述你要找的内容...'"
        class="search-input"
      />
      <span v-if="isSearching" class="search-indicator">🤔</span>
    </div>

    <!-- AI 建议列表 -->
    <ul v-if="suggestions.length > 0" class="suggestions">
      <li
        v-for="suggestion in suggestions"
        :key="suggestion"
        @click="selectSuggestion(suggestion)"
        class="suggestion-item"
      >
        {{ suggestion }}
      </li>
    </ul>

    <!-- 错误提示 -->
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>
```

**💡 为什么搜索建议要区分「结果」和「相关问题」？** 用户搜索时可能自己都不确定要找什么。直接给结果是「你问什么我答什么」，给相关问题则是「我在引导你发现更多」。比如用户搜「Vue 3」，AI 可以建议「你知道 Vue 3 的 Composition API 和 Options API 有什么区别吗？」——这比直接给文档链接更有价值。

### 组件二：AI 增强表单

```vue
<!-- AIForm.vue — AI 辅助表单组件 -->
<script setup lang="ts">
import { ref } from 'vue'

interface FormField {
  name: string
  label: string
  type: 'text' | 'textarea' | 'select'
  value: string
  placeholder?: string
  aiAssist?: boolean  // 是否启用 AI 辅助
  options?: string[]  // 用于 select 类型
}

const props = defineProps<{
  fields: FormField[]
  aiEndpoint: string
}>()

const isAiLoading = ref(false)
const aiSuggestions = ref<Record<string, string>>({})

// AI 辅助：自动填充某个字段
async function aiAssist(field: FormField) {
  if (!field.aiAssist) return

  isAiLoading.value = true
  try {
    const response = await fetch(props.aiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'suggest_field',
        field: field.name,
        fieldLabel: field.label,
        // 传入已填写的其他字段作为上下文
        context: props.fields.reduce((acc, f) => {
          acc[f.name] = f.value
          return acc
        }, {} as Record<string, string>),
      }),
    })

    const data = await response.json()
    aiSuggestions.value[field.name] = data.suggestion
    field.value = data.suggestion
  } catch (err) {
    console.error('AI 辅助失败:', err)
  } finally {
    isAiLoading.value = false
  }
}

// AI 验证：在提交前检查表单内容
async function aiValidate(): Promise<string[]> {
  const issues: string[] = []

  const response = await fetch(props.aiEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'validate',
      fields: props.fields.map(f => ({ name: f.name, label: f.label, value: f.value })),
    }),
  })

  const data = await response.json()
  return data.issues || []
}
</script>

<template>
  <form class="ai-form">
    <div v-for="field in fields" :key="field.name" class="form-field">
      <label>{{ field.label }}</label>

      <div class="input-with-ai">
        <input
          v-if="field.type === 'text'"
          v-model="field.value"
          :placeholder="field.placeholder"
        />
        <textarea
          v-else-if="field.type === 'textarea'"
          v-model="field.value"
          :placeholder="field.placeholder"
        />
        <select v-else-if="field.type === 'select'" v-model="field.value">
          <option value="">请选择...</option>
          <option v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</option>
        </select>

        <!-- AI 辅助按钮 -->
        <button
          v-if="field.aiAssist"
          @click.prevent="aiAssist(field)"
          :disabled="isAiLoading"
          class="ai-button"
          title="AI 自动填充"
        >
          ✨
        </button>
      </div>

      <!-- AI 建议提示 -->
      <p v-if="aiSuggestions[field.name]" class="ai-hint">
        💡 AI 建议：{{ aiSuggestions[field.name] }}
      </p>
    </div>
  </form>
</template>
```

### 组件三：个性化推荐

```vue
<!-- SmartRecommend.vue — AI 个性化推荐 -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface Item {
  id: string
  title: string
  description: string
  reason?: string  // AI 解释为什么推荐
}

const props = defineProps<{
  userId: string
  context?: string  // 当前页面上下文
  apiEndpoint: string
}>()

const recommendations = ref<Item[]>([])
const isLoading = ref(true)
const userFeedback = ref<string[]>([])

onMounted(async () => {
  await fetchRecommendations()
})

async function fetchRecommendations() {
  isLoading.value = true
  try {
    const response = await fetch(`${props.apiEndpoint}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: props.userId,
        context: props.context,
        // 传入用户历史反馈，帮助 AI 优化推荐
        excludeIds: userFeedback.value.filter(id => id.startsWith('dislike-')),
      }),
    })

    const data = await response.json()

    // AI 不仅返回推荐项，还返回推荐理由
    recommendations.value = data.items.map((item: any) => ({
      ...item,
      reason: item.reason || '基于你的浏览历史推荐',
    }))
  } catch (err) {
    console.error('推荐加载失败:', err)
  } finally {
    isLoading.value = false
  }
}

// 用户反馈：喜欢/不喜欢
function feedback(itemId: string, like: boolean) {
  const key = like ? `like-${itemId}` : `dislike-${itemId}`
  userFeedback.value.push(key)

  // 实时反馈给 AI，不需要等待
  fetch(`${props.apiEndpoint}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ itemId, like, userId: props.userId }),
  }).catch(() => {})
}
</script>

<template>
  <div class="recommendations">
    <h3>📌 你可能感兴趣的</h3>

    <div v-if="isLoading" class="loading">AI 正在分析你的兴趣...</div>

    <div v-else class="recommendation-grid">
      <div v-for="item in recommendations" :key="item.id" class="recommendation-card">
        <h4>{{ item.title }}</h4>
        <p>{{ item.description }}</p>
        <p class="reason">💡 {{ item.reason }}</p>
        <div class="feedback">
          <button @click="feedback(item.id, true)" title="推荐得好">👍</button>
          <button @click="feedback(item.id, false)" title="不感兴趣">👎</button>
        </div>
      </div>
    </div>
  </div>
</template>
```

---

## 🔨 实战演练

### 练习：将三个组件组合为一个 AI Dashboard

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```vue
<!-- AiDashboard.vue — AI 功能仪表盘 -->
<script setup lang="ts">
import SmartSearch from './SmartSearch.vue'
import AIForm from './AIForm.vue'
import SmartRecommend from './SmartRecommend.vue'

const apiBase = '/api/ai'

// 表单字段定义
const formFields = [
  { name: 'title', label: '文章标题', type: 'text' as const, aiAssist: true },
  { name: 'content', label: '内容摘要', type: 'textarea' as const, aiAssist: true, placeholder: '用自然语言描述你要写的文章...' },
  { name: 'category', label: '分类', type: 'select' as const, options: ['技术', '产品', '设计', '运营'], aiAssist: false },
]

function handleSearch(query: string) {
  console.log('执行搜索:', query)
  // 调用搜索 API
}
</script>

<template>
  <div class="ai-dashboard">
    <header>
      <h1>AI 内容助手</h1>
      <p>用 AI 提升你的内容创作效率</p>
    </header>

    <section class="search-section">
      <h2>🔍 智能搜索</h2>
      <SmartSearch
        :api-endpoint="`${apiBase}/search`"
        @search="handleSearch"
      />
    </section>

    <section class="form-section">
      <h2>📝 AI 辅助创作</h2>
      <AIForm
        :fields="formFields"
        :ai-endpoint="`${apiBase}/assist`"
      />
    </section>

    <section class="recommend-section">
      <SmartRecommend
        user-id="current-user"
        context="content-creation"
        :api-endpoint="apiBase"
      />
    </section>
  </div>
</template>
```

</details>

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：AI 组件的「流式输出」和「一次性输出」各有什么适用场景？**

> A：流式输出适用于「用户需要实时反馈」的场景——如 AI 逐字生成文章、搜索结果逐步展示。一次性输出适用于「结果需要完整才能处理」的场景——如表单验证、翻译全文。流式输出的用户体验更好（减少等待焦虑），但实现复杂度更高。

**Q2：智能搜索框中为什么需要防抖（debounce）？**

> A：每次输入都调用 AI API 会导致：1) 大量不必要的 API 请求，浪费 Token 和费用；2) 用户看到快速闪动的建议列表，体验差。300ms 防抖确保用户「停下来了」才发起搜索，兼顾实时性和成本。

**Q3：AI 组件的错误处理策略和普通组件有什么不同？**

> A：AI 组件面临普通组件没有的错误类型：LLM 幻觉（返回看似正确但实际错误的内容）、推理速度波动（有时快有时慢）、Token 限制（回答被截断）。策略是：永远显示「来源/置信度」（让用户知道 AI 也不是 100% 正确），提供「重新生成」按钮，设合理超时（AI 调用通常比普通 API 慢）。

</details>

---

## ⚡ 进阶技巧

### 技巧一：组件状态恢复

用户离开页面再返回时，恢复 AI 组件的状态（搜索内容、推荐结果）：

```typescript
function saveComponentState(key: string, state: any) {
  sessionStorage.setItem(`ai-component-${key}`, JSON.stringify(state))
}

function restoreComponentState(key: string) {
  const saved = sessionStorage.getItem(`ai-component-${key}`)
  return saved ? JSON.parse(saved) : null
}
// 在 onMounted 中恢复，在 watcher 中保存
```

### 技巧二：请求合并去重

当多个 AI 组件同时请求时，合并相同参数的请求：

```typescript
class RequestMerger {
  private pending = new Map<string, Promise<any>>()

  async request(key: string, fn: () => Promise<any>) {
    if (this.pending.has(key)) {
      return this.pending.get(key) // 复用正在进行的相同请求
    }
    const promise = fn().finally(() => this.pending.delete(key))
    this.pending.set(key, promise)
    return promise
  }
}
```

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| AI 建议在 UI 中闪烁变化 | 每次输入都触发 AI 调用，结果不一致 | 增加防抖 + 请求去重（同一 query 的请求合并） |
| 用户对 AI 填充的内容不满意 | AI 没有上下文，猜错了意图 | 显示 AI 建议的来源和置信度，提供「换一个」按钮 |
| 表单 AI 验证误报 | LLM 对业务规则理解不准确 | 混合使用 AI 验证 + 前端规则验证（双重验证） |
| 推荐结果一成不变 | 没有利用用户反馈优化 | 收集点赞/点踩，反馈给 AI，实现个性化迭代 |

---

## 📝 本章小结

- ✅ **智能搜索** — 语义理解 + 防抖 + 相关建议，让搜索理解意图而非关键词
- ✅ **AI 表单** — 字段级 AI 填充 + AI 校验，降低用户填写成本
- ✅ **智能推荐** — 个性化 + 推荐理由 + 反馈循环，让推荐越用越准
- ✅ **组合使用** — 将多个 AI 组件集成到统一的 AI Dashboard 中

## ➡️ 下一章预告

> 在下一章中，我们将探讨 AI 状态管理——如何管理 AI 模型的加载、推理、流式输出和错误状态，以及如何与 Vue/React 的状态管理库（Pinia/Zustand）集成。
> [第4章：AI 状态管理](./04-state-management.md)
