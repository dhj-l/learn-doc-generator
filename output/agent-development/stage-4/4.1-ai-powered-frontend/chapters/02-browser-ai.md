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

#### 🤔 Transformer 到底是怎么工作的？（用大白话讲清楚）

要理解 Transformers.js，先得搞清楚它跑的那个「Transformer 模型」到底是什么东西。别说那些学术术语，咱们从实际问题出发。

**一个问题：计算机怎么理解「它」指的是谁？**

看这句话：「那只猫追到了老鼠，它很开心」。

人一看就知道「它」是猫——因为猫才会开心。但计算机看到的只是一串字符：`那` `只` `猫` `追` `到` `了` `老` `鼠` `它` `很` `开` `心`。每个字就是一个编号（token），计算机不知道「它」和「猫」有什么关系。

在 Transformer 出现之前，传统的做法是**逐词扫描**——像读文章一样从左到右看，每看到一个新词只看它前面的词。但这样有个致命问题：前面隔了太远的词就「忘」了。比如「那只猫...（中间隔了 200 字）...它很开心」，传统模型早就忘了前面说的什么。

**Transformer 的解法：让每个词同时「看」所有词**

这就是**自注意力机制（Self-Attention）**——它不按顺序读，而是一次性看到整个句子，自己判断哪些词之间有联系。

我理解自注意力最直观的方式是这样的：

想象你在开一个全员大会，你需要决定「谁的话最值得我听」。你会：
1. **每个人都发言**（每个 token 表达自己）
2. **你评估每个人和你的关联度**（计算注意力权重）——老板说的你要仔细听，同事闲聊你可以放空
3. **根据关联度加权吸收信息**（加权求和）

Transformer 就是这么干的。具体来说，每个词会产生三个「角色」：

- **Query（查询）** —「我在找什么相关信息？」好比你在会上想「现在在讨论预算，谁在说预算相关的事？」
- **Key（键）** —「我有什么信息可以提供？」好比每个发言人举了个牌子，上面写着自己的话题
- **Value（值）** —「我的实际内容是什么」好比发言人实际说的话

计算过程也很直觉：拿你的 Query 去和所有人的 Key 做匹配，匹配度高的（点积大），就多听那个人的 Value。这就是公式 `Attention = softmax(Q × K^T) × V` 在做的——没有玄学，就是一个「找关联 → 加权汇总」的过程。

有人可能会问：**为什么叫「自」注意力？** 因为是在一句话内部自己和自己做注意力——「猫」看「老鼠」、「猫」看「它」，而不是看句子外面的东西。如果是「交叉注意力」，那就是看两个不同句子之间的关系了（比如翻译时看原文）。

**多头注意力：一个脑袋不够用**

一个问题——「那只猫追到了老鼠，它很开心」里，「它」和「猫」的关联是「指代关系」。但如果换成「那只猫追到了老鼠，它跑得飞快」，这里的「它」可能指老鼠（老鼠跑得快）。同一个词在不同语境下关联的对象不同。

一个注意力头只能学一种关联模式。所以 Transformer 用了**多头注意力（Multi-Head Attention）**——并行跑 8 个、12 个甚至更多注意力头，每个头关注不同维度的关系：

- 头 1：关注「指代关系」——「它」指谁？
- 头 2：关注「语法关系」——谁是主语、谁是宾语？
- 头 3：关注「修饰关系」——「黑色的」修饰「猫」
- 头 4：关注「逻辑关系」——「因为...所以...」
- ……

最后把所有这些头的结果拼在一起，每个词就得到了一个「全方位上下文感知」的表示——它不仅知道自己是什么词，还知道这个词在整个句子中的角色和关联。

**残差连接：为什么 Transformer 可以堆 100 层？**

你可能会想：「那我把更多注意力层堆在一起，是不是就更强了？」对，但有个工程问题：信息在层与层之间传递时会「衰减」。

残差连接解决这个问题的思路特别巧妙——**不直接学「输出」，而是学「输出和输入的差值」**。打个比方：

```
不残差：第 3 层的输出 = 第 3 层自己算出来的结果
残差：  第 3 层的输出 = 第 2 层的输出 + 第 3 层新学到的信息
```

就像你写文章修改稿——不是每次都重写全文，而是在上一版基础上只改需要改的地方。这样即使堆了 100 层，底层的原始信息也能通过「残差通道」直达顶层，不会在中间层「迷路」。

**位置编码：为什么顺序很重要？**

有个有趣的问题：自注意力是一次性看所有词的，那模型怎么知道「猫」在「老鼠」前面而不是后面？

答案是 Transformer 在输入里加了一个**位置编码（Positional Encoding）**——用不同频率的正弦和余弦波给每个位置打上一个「指纹」。比如位置 0 的编码是 `[sin(0), cos(0), sin(0/10000), cos(0/10000), ...]`，位置 1 的是 `[sin(1), cos(1), sin(1/10000), ...]`。模型可以通过这些编码的差异感知到词的顺序。

选择正弦/余弦而非简单的 1, 2, 3 编号，有一个很妙的原因：**模型可以学到「相对位置」**——正弦函数的和差公式让模型可以推断出「这个词在目标词前面 3 个位置」，而不是死记硬背绝对位置。

**所以一个 Transformer 层长这样：**

```
输入 → [位置编码] → [多头自注意力] → +（残差）→ [层归一化] → [前馈网络] → +（残差）→ [层归一化] → 输出
                                                                                                    ↓
                                                                                          下一个 Transformer 层
```

BERT base 把 12 个这样的层叠在一起，GPT-3 叠了 96 层（这就是为什么它需要那么大的算力）。每一层都在前一层的基础上提取更抽象的语义特征——底层学语法和词性，中层学语义角色，高层学逻辑关系和意图。

#### Transformers.js 怎么在浏览器里跑这些东西？

好，现在你理解了 Transformer 是什么，下一个问题是——这些模型动辄几亿个参数（BERT 有 1.1 亿，最小的版本也要几十 MB），怎么在浏览器里跑？

**第一步：把模型「翻译」成浏览器能懂的语言**

训练好的模型是 PyTorch 或 TensorFlow 格式的——浏览器不认识。Transformers.js 用 **ONNX（Open Neural Network Exchange）格式**做中间人：把模型从特定框架导出为一个**与框架无关**的中间表示。就像你把一篇 Word 文章导出为 PDF——别人不需要装 Word 也能看。

**第二步：选择「交通工具」来运行这个模型**

ONNX 模型要在浏览器里跑，需要有一个「引擎」来执行。Transformers.js 用 **ONNX Runtime Web**，它提供三种引擎（其实就是三种不同的硬件加速方案）：

| 后端 | 你可以理解为 | 车速 | 适用谁 |
|------|-------------|------|--------|
| **WASM（WebAssembly）** | 用 CPU 硬算，像一个人手动做算术题 | 🚲 普通 | 所有浏览器，默认方案 |
| **WebGL** | 借用显卡的算力，像用计算器算 | 🚗 较快 | 支持 WebGL 的浏览器 |
| **WebGPU** | 用新一代显卡 API，像用超级计算机 | 🚀 最快 | Chrome 113+/Edge 113+，实验性 |

简单选择建议：**用户量大、需要兼容性 → WASM；追求性能、面向现代用户 → WebGPU。**

**第三步：给模型「减肥」（量化）**

模型文件太大（30MB-200MB），下载太慢怎么办？**量化（Quantization）**——用更少的数字精度来表示模型的参数。

我这么理解量化：原始模型存的是 32 位浮点数（fp32），好比用精密天平称重，精度到 0.0000001 克。但实际使用中，你根本不需要这么高的精度——就像你去买菜，不需要知道青菜是 3.1415926 元一斤。

量化就是把 32 位压缩成 8 位甚至 4 位：

```typescript
// 原始 32 位浮点：[-1.2, 0.5, 2.3, -0.8]  →  每个数占 4 字节
// 量化到 8 位整数：[-88, 36, 168, -58]     →  每个数占 1 字节
// 体积缩小到 1/4，精度损失通常 <1%
```

Transformers.js 默认用量化版本——在浏览器场景下，下载快 4 倍的价值远大于那几乎察觉不到的精度损失。

**第四步：缓存到本地，下次秒开**

首次加载模型时，Transformers.js 会把模型文件存到浏览器的 **IndexedDB** 里——这就像浏览器的「本地仓库」，可以存几百 MB 的数据（通常是硬盘剩余空间的 50%）。下次再打开页面时不需要重新下载，直接从本地读就行。

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
