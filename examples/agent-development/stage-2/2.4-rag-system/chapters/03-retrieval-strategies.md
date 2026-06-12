# 第3章：检索策略 — 四种检索方式对比

> 预计学习时间：90-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解四种检索策略** — 语义检索、关键词检索、混合检索、重排序的原理和适用场景
- **实现混合检索** — 结合语义和关键词，使用 RRF 算法融合结果
- **掌握重排序技术** — 两阶段检索（粗排 → 精排）提升 Top-K 精度
- **根据业务场景选择合适的检索策略** — 平衡召回率、精确率和延迟

## 📋 前置知识

> 建议先完成：[第2章：文档处理管线](./02-document-processing.md)

## 💡 核心概念

### 概念一：四种检索策略

### 1. 语义检索（向量相似度）

```typescript
// 基于 Embedding 的语义搜索
const results = await collection.query({
  queryTexts: ['前端框架比较'],
  nResults: 5,
});
// 优点：理解语义，不依赖关键词
// 缺点：可能漏掉精确匹配
```

### 2. 关键词检索（BM25）

```typescript
// 基于关键词的传统搜索
// 使用 TF-IDF 算法
// 优点：精确匹配，速度快
// 缺点：不理解同义词和语义
```

### 3. 混合检索（Hybrid Search）

```typescript
// 语义 + 关键词的融合
async function hybridSearch(query: string, alpha = 0.7) {
  const semanticResults = await semanticSearch(query);  // 语义搜索
  const keywordResults = await keywordSearch(query);    // 关键词搜索

  // RRF（Reciprocal Rank Fusion）融合
  const fused = reciprocalRankFusion(semanticResults, keywordResults, alpha);
  return fused;
}

// RRF 融合算法
function reciprocalRankFusion(
  results1: Array<{ id: string; score: number }>,
  results2: Array<{ id: string; score: number }>,
  alpha: number = 0.7,
  k: number = 60
) {
  const scores = new Map<string, number>();

  results1.forEach((r, rank) => {
    scores.set(r.id, (scores.get(r.id) || 0) + alpha / (k + rank + 1));
  });
  results2.forEach((r, rank) => {
    scores.set(r.id, (scores.get(r.id) || 0) + (1 - alpha) / (k + rank + 1));
  });

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
```

### 4. 重排序（Reranking）

```typescript
// 粗排 → 精排两阶段检索
async function searchWithRerank(query: string) {
  // 粗排：向量检索 Top-20
  const roughResults = await vectorSearch(query, 20);

  // 精排：用 Cohere Rerank 模型重排
  const reranked = await rerankWithCohere(query, roughResults, 5);
  return reranked;
}
```


## 🔨 实战演练

**场景描述：**
你正在构建一个内部文档搜索系统。公司文档中包含大量技术术语（如 "Kubernetes"、"RBAC"）和日常办公问询（如"年假怎么申请"）。纯语义搜索对术语匹配不足，纯关键词搜索对语义理解不够。

**你的任务：**
1. 同时实现语义检索（向量相似度）和关键词检索（BM25）
2. 使用 RRF 算法融合两种结果
3. 在融合结果上再使用交叉编码器重排序
4. 对比三种方案的 Recall@5 和 Precision@5

<details>
<summary>💡 参考实现要点</summary>

```typescript
// BM25 简单实现（使用 term frequency）
function bm25(query: string, documents: string[], k1 = 1.5, b = 0.75): Array<{ id: string; score: number }> {
  const terms = query.toLowerCase().split(/\s+/);
  const avgDocLen = documents.reduce((sum, d) => sum + d.length, 0) / documents.length;

  return documents.map((doc, idx) => {
    const docLen = doc.length;
    let score = 0;
    for (const term of terms) {
      const tf = (doc.toLowerCase().match(new RegExp(term, 'g')) || []).length;
      if (tf === 0) continue;
      const idf = Math.log((documents.length + 1) / (1 + 1)); // 简化 IDF
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLen / avgDocLen)));
    }
    return { id: String(idx), score };
  }).sort((a, b) => b.score - a.score);
}
```

**检验标准：**
- 混合检索比单一检索 Recall@5 提升至少 15%
- 重排序后 Precision@5 有明显改善
- 对技术术语和自然语言查询都能有效检索
</details>

---

## ⚡ 进阶技巧

### 1. 多查询检索（Multi-Query Retrieval）

用 LLM 将用户问题扩展为多个不同角度的查询，分别检索后合并结果：

```typescript
async function multiQueryRetrieval(question: string, topK = 3) {
  const queries = await expandToQueries(question); // ["RAG 原理", "检索增强生成优缺点", "RAG vs fine-tuning"]
  const allResults = await Promise.all(
    queries.map(q => vectorSearch(q, topK))
  );
  // 去重后按出现次数重排
  const docCounts = new Map<string, { doc: any; count: number }>();
  allResults.flat().forEach(doc => {
    if (!docCounts.has(doc.id)) docCounts.set(doc.id, { doc, count: 0 });
    docCounts.get(doc.id)!.count++;
  });
  return [...docCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, topK)
    .map(x => x.doc);
}
```

### 2. 检索结果去重与多样性保证

MMR（Maximum Marginal Relevance）算法在相关性和多样性之间取得平衡：

```typescript
function mmrRerank(results: Array<{ id: string; content: string; score: number }>, queryEmbedding: number[], lambda = 0.7, topK = 5) {
  const selected: Array<{ id: string; content: string; score: number }> = [];
  const candidates = [...results];

  while (selected.length < topK && candidates.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    candidates.forEach((cand, i) => {
      const relScore = cand.score; // 与查询的相关性
      const maxSim = selected.length > 0
        ? Math.max(...selected.map(s => cosineSimilarity(s.content, cand.content)))
        : 0; // 与已选结果的最大相似度
      const mmrScore = lambda * relScore - (1 - lambda) * maxSim;
      if (mmrScore > bestScore) { bestScore = mmrScore; bestIdx = i; }
    });

    selected.push(candidates.splice(bestIdx, 1)[0]);
  }
  return selected;
}
```

### 3. 异步流式检索

在对话式 RAG 中边检索边返回初步结果，提升用户体验：

```typescript
async function* streamRetrieve(query: string) {
  yield { type: 'status', message: '🔍 正在检索知识库...' };
  const results = await vectorSearch(query, 5);
  yield { type: 'results', count: results.length };
  yield { type: 'status', message: '🤖 正在生成回答...' };
  // ...后续生成过程
}
```

## 🧠 知识检查点

1. **语义检索和关键词检索各自的优缺点是什么？**

<details>
<summary>点击展开答案</summary>

- **语义检索**：理解查询意图和同义词，适合自然语言问句；但对专有名词、缩写（如"CRM"）可能匹配不准确。
- **关键词检索（BM25）**：精确匹配术语，速度快；但不理解同义词和语义关联，对表述不同的相同问题可能漏检。
</details>

2. **什么是 RRF（Reciprocal Rank Fusion）？它如何融合不同检索结果？**

<details>
<summary>点击展开答案</summary>

RRF 是一种无监督的结果融合算法。它对每个文档在不同检索结果中的排名取倒数（1/(k + rank)），然后求和得到融合分数。排名越靠前（rank 越小），分数贡献越大。参数 k（通常取 60）用于平滑，防止排名 1 的结果分数过高。RRF 不需要训练，简单高效。
</details>

3. **为什么需要重排序（Reranking）？它解决了什么问题？**

<details>
<summary>点击展开答案</summary>

向量检索的相似度分数（余弦相似度）并不等同于"相关度"。重排序使用更强的模型（如交叉编码器 Cross-Encoder）对检索结果逐一评估相关性，能够修正向量检索的排序错误。典型做法是先粗检 Top-20，再精排取 Top-5，在精度和延迟之间取得平衡。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 只有语义检索，精确匹配差 | 纯向量检索对专有名词、编号、缩写不敏感 | 结合 BM25 关键词检索，使用混合检索策略 |
| Top-K 结果高度重复 | 多个检索结果来自同一文档的不同片段 | 实现 MMR 多样性重排，或在元数据层面按文档去重 |
| 检索延迟过高 | 每次查询都检索全部向量库，或重排序候选集过大 | 使用 IVF/量化索引加速，限制粗排候选集 ≤ 50 个 |

## 📝 本章小结

- ✅ **语义检索** — 理解意思，适合自然语言查询
- ✅ **关键词检索** — 精确匹配，适合专有名词
- ✅ **混合检索** — 两者融合，效果最佳
- ✅ **重排序** — 粗排+精排，提升精度

## ➡️ 下一章预告

> [第4章：高级 RAG](./04-advanced-rag.md) — Self-RAG、Corrective-RAG 等高级技术。
