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
    input: 'Hello world',
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
    input: 'Hello world',
  });
  console.log('原始维度: 3072, 缩减后:', response.data[0].embedding.length); // 256
  // 缩减后仍保持大部分语义信息，但存储和计算成本大幅降低
}
```

### 概念三：本地 Embedding 模型

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

---

## 🔨 实战演练

### 练习：Embedding 模型性能对比测试

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

## 📝 本章小结

- ✅ **模型选型** — 根据语言、精度、成本选择合适的 Embedding 模型
- ✅ **OpenAI 模型** — text-embedding-3-small 性价比高，支持维度缩减
- ✅ **本地模型** — BGE、nomic 等开源模型可以免费本地运行
- ✅ **质量评估** — 用检索准确率等指标评估模型效果

## ➡️ 下一章预告

> [第3章：ChromaDB 实战](./03-chromadb.md) — 使用轻量级本地向量数据库存储和检索向量。
