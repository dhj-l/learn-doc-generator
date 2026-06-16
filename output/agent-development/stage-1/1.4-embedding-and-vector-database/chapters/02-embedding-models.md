# 第2章：Embedding 模型 — 选对模型很重要

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **对比主流 Embedding 模型** — 了解各模型的特点、维度和性能
- **选择适合场景的模型** — 根据语言、成本、精度要求选型
- **使用本地 Embedding 模型** — 在不调 API 的情况下生成向量

## 📋 前置知识

> 建议先完成：[第1章：Embedding 基础](./01-embedding-basics.md)

---

## 💡 核心概念

### 概念一：模型选型矩阵

| 模型 | 提供商 | 维度 | 多语言 | 价格 | 适用场景 |
|------|--------|------|--------|------|----------|
| text-embedding-3-small | OpenAI | 1536 | ✅ | $0.02/M | 通用，性价比首选 |
| text-embedding-3-large | OpenAI | 3072 | ✅ | $0.13/M | 高精度检索 |
| Cohere embed-v3 | Cohere | 1024 | ✅ 100+语言 | $0.1/M | 多语言场景 |
| BGE-M3 | BAAI | 1024 | ✅ 100+语言 | 免费 | 本地部署、中文优化 |
| BGE-large-zh | BAAI | 1024 | 中文 | 免费 | 纯中文场景 |
| nomic-embed-text | Nomic | 768 | ✅ | 免费 | 轻量本地模型 |
| Gecko | Google | 768 | ✅ | 按量 | Google 生态 |

### 概念二：OpenAI Embedding API 详解

```typescript
// src/openai-embedding.ts
import OpenAI from 'openai';

const client = new OpenAI();

// 1. 基础调用
async function basicEmbedding() {
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: '深度学习模型是如何工作的',
  });
  console.log('维度:', response.data[0].embedding.length); // 1536
  console.log('前5维:', response.data[0].embedding.slice(0, 5));
}

// 2. 批量处理（高效！）
async function batchEmbedding(texts: string[]) {
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,  // 一次请求处理多条文本
  });
  return response.data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding);
}

// 3. 维度缩减（text-embedding-3 系列特有功能）
async function reducedDimension() {
  const response = await client.embeddings.create({
    model: 'text-embedding-3-large',
    dimensions: 256,  // 从 3072 缩减到 256 维
    input: '机器学习中的文本分类任务',
  });
  console.log('原始维度: 3072, 缩减后:', response.data[0].embedding.length); // 256
  // 缩减后仍保持大部分语义信息，但存储和计算成本大幅降低
}
```

### 概念三：本地 Embedding 模型

**生活类比：** 本地 Embedding 模型就像你家里的工具箱——你不需要每次用螺丝刀都去租借（调用 API），自己备一套工具随时可用。虽然工具种类可能没有五金店（云端 API）丰富，但**免费、无延迟、无网络依赖**就是最大的优势。

```typescript
// src/local-embedding.ts
// 使用 @xenova/transformers 在 Node.js 中运行本地模型
// npm install @xenova/transformers

import { pipeline } from '@xenova/transformers';

async function localEmbedding() {
  // 首次运行会自动下载模型（约 500MB）
  const extractor = await pipeline('feature-extraction', 'Xenova/bge-base-zh-v1.5');

  const texts = [
    'React 是前端框架',
    'Vue 是前端框架',
    'Python 是编程语言',
  ];

  const embeddings: number[][] = [];
  for (const text of texts) {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(output.data));
  }

  // 计算相似度
  function cosine(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  console.log('React vs Vue:', cosine(embeddings[0], embeddings[1]).toFixed(3));
  console.log('React vs Python:', cosine(embeddings[0], embeddings[2]).toFixed(3));
}

localEmbedding();
```

```
预期输出：
React vs Vue: 0.912
React vs Python: 0.634
```

### 概念四：Embedding 质量评估

```typescript
// src/evaluate-embedding.ts

// 评估 Embedding 模型质量的三种方法

// 方法 1：检索准确率（Precision@K）
function precisionAtK(
  queryEmbedding: number[],
  documentEmbeddings: Array<{ embedding: number[]; label: string }>,
  relevantLabels: string[],
  k: number
): number {
  // 计算相似度并排序
  const results = documentEmbeddings
    .map(doc => ({
      label: doc.label,
      score: cosineSimilarity(queryEmbedding, doc.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  // 前 K 个结果中有多少是相关的
  const relevantCount = results.filter(r => relevantLabels.includes(r.label)).length;
  return relevantCount / k;
}

// 方法 2：聚类质量（Silhouette Score）
// 方法 3：分类准确率（用 Embedding 作为特征训练简单分类器）
```

> **💡 为什么需要评估 Embedding 质量？** 不同的 Embedding 模型在不同任务上的表现差异很大。text-embedding-3-large 在英文检索上准确率更高，但 BGE-M3 在中文场景中表现更好。通过 Precision@K、召回率等指标量化评估，可以帮助你做出客观的选型决策，而不是凭感觉猜测。

---

## 🔨 实战演练

### 场景：为电商平台选择最佳的 Embedding 模型

**场景描述：**
你正在为一个电商平台构建商品搜索功能。平台主要面向中文用户，商品数据包含标题、描述和类别标签。你需要对比多个 Embedding 模型，找出在「检索准确性」和「响应速度」之间最佳平衡的方案。

**你的任务：**
1. 准备一组中文商品数据作为测试集
2. 分别使用 OpenAI text-embedding-3-small、text-embedding-3-large 和本地 BGE 模型生成向量
3. 对比各模型的检索准确率（Precision@K）
4. 对比各模型的响应时间和成本
5. 给出最终的模型选型建议

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import OpenAI from 'openai';

const client = new OpenAI();

async function benchmarkEmbeddingModels(testCases: Array<{
  query: string;
  documents: string[];
  expectedTopResult: number; // 期望排第一的文档索引
}>) {
  const models = ['text-embedding-3-small', 'text-embedding-3-large'];

  for (const model of models) {
    let correct = 0;
    const startTime = Date.now();

    for (const testCase of testCases) {
      // 获取所有文本的 Embedding
      const allTexts = [testCase.query, ...testCase.documents];
      const response = await client.embeddings.create({
        model,
        input: allTexts,
      });

      const queryEmb = response.data[0].embedding;
      const docEmbs = response.data.slice(1).map(d => d.embedding);

      // 找到最相似的文档
      let bestIdx = 0, bestScore = -Infinity;
      docEmbs.forEach((emb, i) => {
        const score = cosineSimilarity(queryEmb, emb);
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      });

      if (bestIdx === testCase.expectedTopResult) correct++;
    }

    const elapsed = Date.now() - startTime;
    const accuracy = (correct / testCases.length * 100).toFixed(1);
    console.log(`${model}: 准确率 ${accuracy}%, 耗时 ${elapsed}ms`);
  }
}

await benchmarkEmbeddingModels([
  { query: '前端框架', documents: ['React 框架', 'Python 数据分析', 'Node.js 服务端'], expectedTopResult: 0 },
  { query: '数据库', documents: ['MongoDB 文档数据库', 'CSS 样式表', 'Redis 缓存'], expectedTopResult: 0 },
]);
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：模型集成（Ensemble）

将多个 Embedding 模型的向量拼接或加权平均，可以获得比单个模型更优的检索效果：

```typescript
// 向量拼接：结合不同模型的优势
async function ensembleEmbedding(text: string) {
  const [openAIEmb, bgeEmb] = await Promise.all([
    getOpenAIEmbedding(text),    // 1536 维，语义丰富
    getBGEEmbedding(text),       // 1024 维，中文优化
  ]);
  
  // 拼接为 2560 维向量
  return [...openAIEmb, ...bgeEmb];
}
```

> **💡 为什么 Ensemble 有效？** 不同模型在编码时侧重的特征不同——OpenAI 模型在通用语义上表现好，BGE 在中文专业术语上更精准。拼接后的向量保留了双方的优点，检索效果通常比单一模型提升 5-15%。

### 技巧二：动态维度选择

根据业务需求动态选择向量维度，在精度和性能之间做权衡：

```typescript
// 对于简单的分类任务，256 维就足够了
// 对于精细的语义检索，建议使用 768-1024 维
// 对于高精度搜索，使用 1536-3072 维

function selectDimensions(budget: 'low' | 'medium' | 'high'): number {
  switch (budget) {
    case 'low': return 256;    // 快速、省存储
    case 'medium': return 768; // 均衡
    case 'high': return 1536;  // 最佳精度
  }
}
```

### 技巧三：模型量化

将模型从 FP32 量化到 INT8，可以显著减少模型体积和推理时间：

```text
模型量化效果对比（以 BGE-M3 为例）：
- FP32（原始）: 1.3GB, 推理时间 120ms
- INT8（量化）: 350MB, 推理时间 45ms
- 精度损失: < 2%
对于生产环境部署，量化版本通常是更好的选择。
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：如何选择适合自己场景的 Embedding 模型？**

A：考虑四个维度：（1）语言——中文优先选 BGE 系列，多语言用 Cohere embed-v3；（2）成本——预算充足用 OpenAI，本地部署用开源模型；（3）精度要求——高精度用 text-embedding-3-large 或 BGE-M3，轻量级用 nomic-embed；（4）延迟——本地模型无网络延迟，云端模型需要网络传输时间。

**Q2：OpenAI 的 text-embedding-3 系列支持维度缩减，这有什么好处？**

A：维度缩减可以大幅降低存储成本和计算时间，同时保留大部分语义信息。例如从 3072 维缩减到 256 维可节省约 92% 的存储空间，精度损失仅 3-5%（取决于具体任务）。

**Q3：本地 Embedding 模型（如 BGE）相比云端 API 有什么优缺点？**

A：优点：免费、无网络延迟、数据不出域（隐私安全）、可离线运行。缺点：需要本地计算资源（GPU 推荐）、模型更新需要手动下载新版本、多语言能力通常不如商业 API。

**Q4：什么是 Embedding 质量评估中的 Precision@K？**

A：Precision@K 是指在前 K 个检索结果中，相关文档所占的比例。例如 Precision@5 = 0.8 表示前 5 个结果中有 4 个是相关的。这是衡量检索系统准确性的核心指标。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 中文文本 Embedding 效果差 | 使用了以英文为主的 Embedding 模型 | 切换到中文优化模型（如 BGE-large-zh、text2vec） |
| 本地模型加载速度慢 | 首次加载需要下载模型文件（500MB-1GB） | 提前下载并缓存模型文件，或使用更轻量的模型（如 nomic-embed-text v1.5，仅 137MB） |
| 向量维度太大导致内存溢出 | 没有对向量做维度缩减或降维 | 使用 text-embedding-3 系列的 dimensions 参数缩减维度，或使用 PCA 降维 |
| 不同批次的向量分布不一致 | 使用了不同的模型或模型版本 | 固定使用同一个模型版本，记录模型名称和版本号 |
| 本地模型在 CPU 上推理极慢 | 没有利用 GPU 加速 | 安装 CUDA 版本的 ONNX Runtime，或使用 WebGPU（浏览器端） |

---

## 📝 本章小结

- ✅ **模型选型** — 根据语言、精度、成本选择合适的 Embedding 模型
- ✅ **OpenAI 模型** — text-embedding-3-small 性价比高，支持维度缩减
- ✅ **本地模型** — BGE、nomic 等开源模型可以免费本地运行
- ✅ **质量评估** — 用检索准确率等指标评估模型效果

## ➡️ 下一章预告

> [第3章：ChromaDB 实战](./03-chromadb.md) — 使用轻量级本地向量数据库存储和检索向量。
