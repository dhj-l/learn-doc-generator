# 第3章：检索策略 — 四种检索方式对比

> 预计学习时间：90-120 分钟

## 💡 四种检索策略

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

---

## 📝 本章小结

- ✅ **语义检索** — 理解意思，适合自然语言查询
- ✅ **关键词检索** — 精确匹配，适合专有名词
- ✅ **混合检索** — 两者融合，效果最佳
- ✅ **重排序** — 粗排+精排，提升精度

## ➡️ 下一章预告

> [第4章：高级 RAG](./04-advanced-rag.md) — Self-RAG、Corrective-RAG 等高级技术。
