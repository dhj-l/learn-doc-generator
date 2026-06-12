# 第2章：浏览器端 AI — 在浏览器中运行机器学习模型

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 Transformers.js 在浏览器中运行模型** — 无需后端，直接在用户浏览器中执行 AI 推理
- **理解浏览器端 AI 的取舍** — 知道什么时候该用浏览器端、什么时候该用云端
- **实现情感分析、文本分类等常见任务** — 在浏览器中实时处理文本数据
- **优化模型加载和运行性能** — 使用缓存、量化、WASM 等技术提升体验

## 📋 前置知识

> 建议先完成：
> - [第1章：AI-Native UI 模式](./01-ai-native-ui.md) — 了解 AI 交互模式

---

## 💡 核心概念

### 为什么要在浏览器中运行 AI？

**生活类比：** 想象你要买一个计算器。方案 A 是「每次算数都打电话让朋友帮你算」（云端 AI），方案 B 是「自己买个计算器放口袋里」（浏览器端 AI）。

浏览器端 AI 的优势：
- 🚀 **零延迟** — 不需要网络请求，结果即时返回
- 🔒 **数据隐私** — 用户数据不出浏览器
- 💰 **零 API 成本** — 不需要付费调用云端模型
- 📱 **离线可用** — 没网络也能工作

但浏览器端 AI 也有局限：
- 模型大小受限（通常 <200MB）
- 只能运行轻量级模型
- 消耗用户设备的 CPU/GPU

### Transformers.js 入门

Transformers.js 是 Hugging Face 的 Transformers 库的浏览器版本，让你在浏览器中加载和运行预训练模型。

```bash
npm install @xenova/transformers
```

```typescript
// 基础使用：情感分析
import { pipeline } from '@xenova/transformers';

// 初始化情感分析管线
// ⚠️ 首次调用时会下载模型（约 30MB），之后会缓存到 IndexedDB
const classifier = await pipeline('sentiment-analysis');

// 执行推理
const result = await classifier('I love this product!');
console.log(result);
// [{ label: 'POSITIVE', score: 0.999 }]

const result2 = await classifier('This is terrible, I hate it.');
console.log(result2);
// [{ label: 'NEGATIVE', score: 0.998 }]
```

**💡 为什么 pipeline API 是这样设计的？** Hugging Face 的 pipeline 模式遵循「一次初始化，多次调用」的原则。第一次调用 `pipeline()` 时下载模型并加载到内存（这步较慢），之后的调用直接复用已加载的模型，推理速度极快。所以应该在应用初始化时提前加载模型，而不是每次调用时加载。

### 支持的 NLP 任务

```typescript
// 文本分类（多标签）
const classifier = await pipeline('text-classification');
const result = await classifier('This movie was amazing!', {
    topk: 3,  // 返回前 3 个分类
});
// [{ label: 'POSITIVE', score: 0.99 }, { label: 'NEUTRAL', score: 0.01 }, ...]

// 特征提取（生成 Embedding）
const extractor = await pipeline('feature-extraction');
const embedding = await extractor('Hello world', {
    pooling: 'mean',
    normalize: true,
});
// embedding.shape: [1, 384] — 384 维向量

// 问答系统
const qa = await pipeline('question-answering');
const answer = await qa({
    question: '什么是 Transformers.js？',
    context: 'Transformers.js 是一个在浏览器中运行 ML 模型的 JavaScript 库。',
});
// { answer: '浏览器中运行 ML 模型的 JavaScript 库', score: 0.95 }

// 文本生成
const generator = await pipeline('text-generation');
const story = await generator('从前有一个程序员', {
    max_new_tokens: 50,
    temperature: 0.7,
});
console.log(story[0].generated_text);
```

### 在 Vue 3 中集成 Transformers.js

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { pipeline } from '@xenova/transformers'

// 状态
const text = ref('')
const sentiment = ref<{ label: string; score: number } | null>(null)
const isLoading = ref(true)
const isAnalyzing = ref(false)

// 模型引用
let classifier: any = null

// 初始化：在组件挂载时加载模型
onMounted(async () => {
  try {
    // 显示加载进度
    classifier = await pipeline('sentiment-analysis', undefined, {
      progress_callback: (progress: any) => {
        if (progress.status === 'progress') {
          console.log(`下载模型: ${Math.round(progress.progress * 100)}%`)
        }
      },
    })
    isLoading.value = false
  } catch (error) {
    console.error('模型加载失败:', error)
    isLoading.value = false
  }
})

// 分析情感
async function analyze() {
  if (!classifier || !text.value.trim()) return

  isAnalyzing.value = true
  try {
    const result = await classifier(text.value)
    sentiment.value = result[0]
  } catch (error) {
    console.error('分析失败:', error)
  } finally {
    isAnalyzing.value = false
  }
}
</script>

<template>
  <div class="sentiment-analyzer">
    <p v-if="isLoading">⏳ 正在加载 AI 模型（首次需下载约 30MB）...</p>

    <template v-else>
      <textarea
        v-model="text"
        placeholder="输入你想分析的文本..."
        @input="analyze"
      />

      <div v-if="sentiment" class="result" :class="sentiment.label.toLowerCase()">
        <p>情感：{{ sentiment.label === 'POSITIVE' ? '😊 正面' : '😞 负面' }}</p>
        <p>置信度：{{ (sentiment.score * 100).toFixed(1) }}%</p>
      </div>
    </template>
  </div>
</template>
```

**💡 为什么在 onMounted 中加载模型而不是在组件初始化时？** 模型加载是异步操作且体积较大。在 onMounted 中加载确保：
1. DOM 已经渲染，可以显示加载状态
2. 不阻塞页面初次渲染
3. 组件卸载时可以释放模型内存

---

## 🔨 实战演练

### 练习：构建浏览器端智能搜索组件

**场景描述：** 你的文档站点需要离线语义搜索功能——用户输入搜索词，即使在没网络的情况下也能根据语义找到相关内容。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// smart-search.ts
import { pipeline } from '@xenova/transformers';

interface SearchDocument {
  id: string;
  title: string;
  content: string;
  embedding?: number[];
}

class OfflineSemanticSearch {
  private extractor: any = null;
  private documents: SearchDocument[] = [];
  private isReady = false;

  async initialize(docs: SearchDocument[]): Promise<void> {
    // 1. 加载特征提取模型
    this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true, // 使用量化版本，体积更小
    });

    // 2. 为所有文档生成 Embedding
    this.documents = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        embedding: await this.getEmbedding(doc.title + ' ' + doc.content),
      }))
    );

    this.isReady = true;
    console.log(`✅ 索引完成：${docs.length} 篇文档`);
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const result = await this.extractor(text, {
      pooling: 'mean',
      normalize: true,
    });
    return Array.from(result.data);
  }

  // 余弦相似度
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    return dotProduct; // 向量已归一化，点积 = 余弦相似度
  }

  async search(query: string, topK: number = 5): Promise<SearchDocument[]> {
    if (!this.isReady) {
      throw new Error('搜索索引未就绪');
    }

    const queryEmbedding = await this.getEmbedding(query);

    // 计算所有文档的相似度，排序后返回 topK
    const scored = this.documents.map((doc) => ({
      doc,
      score: this.cosineSimilarity(queryEmbedding, doc.embedding!),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map((s) => s.doc);
  }
}

// 使用
const searchEngine = new OfflineSemanticSearch();

// 初始化文档库
await searchEngine.initialize([
  { id: '1', title: 'Transformers.js 入门', content: '在浏览器中运行机器学习模型的 JavaScript 库...' },
  { id: '2', title: 'Vue 3 组合式 API', content: 'Vue 3 引入了一套全新的组合式 API...' },
  { id: '3', title: 'MCP 协议概述', content: 'Model Context Protocol 是 AI Agent 的标准化工具协议...' },
]);

// 搜索
const results = await searchEngine.search('如何在浏览器中使用 AI');
console.log('搜索结果:', results.map(r => r.title));
// 输出: ['Transformers.js 入门', 'Vue 3 组合式 API', ...]
```

</details>

---

## ⚡ 进阶技巧

### 模型缓存管理

```typescript
// Transformers.js 自动将模型缓存到 IndexedDB
// 你可以手动管理缓存：

// 查看缓存
const cacheSize = await navigator.storage?.estimate();
console.log(`缓存使用: ${(cacheSize?.usage || 0) / 1024 / 1024}MB`);

// 预加载时带进度条
const classifier = await pipeline('sentiment-analysis', undefined, {
  progress_callback: (data: any) => {
    if (data.status === 'download') {
      const percent = (data.loaded / data.total * 100).toFixed(0);
      updateProgressBar(percent);
    }
  },
});
```

### 选择正确的模型

```typescript
// 🤗 Hugging Face 上有数千个模型，选择建议：

// 1. 情感分析（推荐）
const model1 = 'Xenova/distilbert-base-uncased-finetuned-sst-2-english'; // 85MB

// 2. 文本分类（轻量）
const model2 = 'Xenova/toxic-bert'; // 60MB，检测有害内容

// 3. 特征提取（通用 Embedding）
const model3 = 'Xenova/all-MiniLM-L6-v2'; // 23MB，最轻量推荐

// 4. 代码生成
// 浏览器端目前不适合运行代码生成模型（需要 >2GB 内存）
// 此类任务建议调用云端 API
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：浏览器端 AI 和云端 AI 各自的适用场景是什么？**

> A：浏览器端 AI 适合「实时性要求高、数据敏感、功能相对简单」的场景——如情感分析、文本分类、简单翻译。云端 AI 适合「需要大模型能力、功能复杂、数据可以出站」的场景——如代码生成、长文写作、复杂推理。最佳实践是两者结合——基础功能在浏览器端实时处理，复杂功能调用云端 API。

**Q2：Transformers.js 的 quantized（量化）参数有什么作用？**

> A：量化（quantized）将模型的权重从 32 位浮点数压缩为 8 位整数，模型体积缩小约 4 倍，推理速度提升 2-3 倍，精度损失通常 <1%。在浏览器环境中几乎总是应该使用量化版本，因为减少下载体积对用户体验的提升远大于微小的精度损失。

**Q3：为什么 IndexedDB 比 localStorage 更适合缓存模型？**

> A：localStorage 只有 5-10MB 的存储上限，而模型文件通常在 20-200MB 之间。IndexedDB 的存储上限通常是硬盘可用空间的 50%（数百 MB 到数 GB），而且支持二进制数据存储，是存储模型文件的唯一可行选择。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 首次加载模型时页面卡死 | 在主线程中下载和加载大模型 | 使用 Web Worker 加载模型，不阻塞 UI |
| 模型下载失败（CORS 错误） | Hugging Face 的 CDN 被某些网络屏蔽 | 自托管模型文件到自己的 CDN 或使用镜像源 |
| 移动端模型推理速度慢 | 移动设备的 GPU/CPU 性能有限 | 使用量化模型、减小模型规模、或回退到云端 API |
| IndexedDB 空间不足 | 缓存了太多模型 | 定期清理不用的模型，提示用户清理缓存 |
| 旧浏览器不支持 WebAssembly | Transformers.js 依赖 WASM | 检查 `typeof WebAssembly === 'object'` 并给出降级提示 |

---

## 📝 本章小结

- ✅ **Transformers.js** — 在浏览器中运行 Hugging Face 模型的 JavaScript 库
- ✅ **pipeline API** — 统一的推理接口，支持文本分类、特征提取、问答等任务
- ✅ **Vue 3 集成** — 在组件的 onMounted 生命周期中加载模型
- ✅ **离线语义搜索** — 用 Embedding + 余弦相似度实现离线搜索
- ✅ **性能优化** — 量化模型、WASM 加速、IndexedDB 缓存、Web Worker

## ➡️ 下一章预告

> 在下一章中，我们将学习如何设计 AI 驱动的智能前端组件——智能搜索框、AI 表单、个性化推荐等常见 AI-Native 组件的实现模式。
> [第3章：AI 组件设计](./03-ai-components.md)
