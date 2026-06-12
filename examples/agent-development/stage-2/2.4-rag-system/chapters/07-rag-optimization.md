# 第7章：RAG 优化 — 提升检索和生成质量

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **实现优化策略** — 混合检索、查询重写、重排序
- **降低检索延迟** — 缓存、索引优化、向量量化
- **提升生成质量** — Prompt 优化、上下文压缩

## 📋 前置知识

> 建议先完成：[第6章：RAG 评估](./06-rag-evaluation.md) — 理解评估指标后，才能有针对性地优化

---

## 💡 核心概念

### 概念一：核心优化策略

### 策略 1：混合检索

结合关键词搜索和语义搜索，互相弥补不足：

```typescript
async function hybridSearch(query: string, topK: number = 5) {
  // 1. 关键词搜索（精确匹配）
  const keywordResults = await keywordSearch(query);

  // 2. 语义搜索（相似度匹配）
  const embedding = await getEmbedding(query);
  const semanticResults = await vectorSearch(embedding);

  // 3. 合并和重排
  const combined = mergeResults(keywordResults, semanticResults);
  return combined.slice(0, topK);
}
```

**💡 为什么需要混合检索？** 语义搜索擅长「含义匹配」（找到意思相近但用词不同的内容），关键词搜索擅长「精确匹配」（找到包含特定术语的内容）。两者结合，覆盖更多场景。

### 策略 2：查询重写

用户在 RAG 中的查询往往不够精确，让 LLM 先重写查询：

```typescript
async function rewriteQuery(originalQuery: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-3-haiku',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `将以下搜索查询改写得更精确，适合文档检索：
原查询: ${originalQuery}
改写后:`
    }],
  });
  return response.content[0].text;
}
```

### 策略 3：重排序

```typescript
// 先用轻量方法检索更多文档，再用重排序精排
async function retrieveAndRerank(query: string) {
  // 1. 检索更多文档（topK=20）
  const candidates = await vectorSearch(query, 20);

  // 2. 用交叉编码器重排序
  const scored = await Promise.all(
    candidates.map(async (doc) => ({
      doc,
      score: await crossEncoderScore(query, doc.content),
    }))
  );

  // 3. 取前 5 个
  return scored.sort((a, b) => b.score - a.score).slice(0, 5);
}
```

## 🔨 实战演练

**场景描述：**
你有一个线上 RAG 系统，用户反馈"回答太慢"和"有时候检索结果不对"。你需要从延迟和质量两个维度进行优化。

**你的任务：**
1. 实现混合检索（语义 + BM25 + RRF 融合）替代纯语义检索
2. 为高频查询实现语义缓存
3. 实现上下文压缩，减少传入 LLM 的 Token 数
4. 对比优化前后的延迟、Recall@3 和 Token 消耗

<details>
<summary>💡 参考实现要点</summary>

```typescript
class OptimizedRAG {
  private cache = new SemanticCache();

  async query(question: string): Promise<{ answer: string; latency: number }> {
    const start = Date.now();

    // 1. 检查缓存
    const cached = await this.cache.get(question);
    if (cached) return { answer: cached, latency: Date.now() - start };

    // 2. 混合检索
    const rawResults = await this.hybridRetrieve(question);

    // 3. 上下文压缩
    const compressed = await compressContext(rawResults.map(r => r.content), question);

    // 4. 生成
    const answer = await this.generate(question, compressed);

    // 5. 写入缓存
    await this.cache.set(question, answer);

    return { answer, latency: Date.now() - start };
  }
}
```

**检验标准：**
- 优化后 P50 延迟降低 40% 以上
- Recall@3 不低于原始版本或有所提升
- 高频查询（相同或相似问题）P99 延迟显著降低
</details>

## ⚡ 进阶技巧

### 1. 上下文压缩（Context Compression）

检索结果过多时，用 LLM 压缩每个文档片段再输入给生成模型：

```typescript
async function compressContext(documents: string[], query: string): Promise<string[]> {
  const compressed = await Promise.all(
    documents.map(async (doc) => {
      const response = await anthropic.messages.create({
        model: 'claude-3-haiku',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `针对问题"${query}"，压缩以下文档到最相关的 2-3 句话：\n\n${doc}`
        }],
      });
      return response.content[0].type === 'text' ? response.content[0].text : '';
    })
  );
  return compressed.filter(c => c.length > 0);
}
```

### 2. 缓存策略 — 避免重复检索

对高频查询使用语义缓存：

```typescript
class SemanticCache {
  private cache: Array<{ query: string; embedding: number[]; result: any }> = [];

  async get(query: string, threshold = 0.95): Promise<any | null> {
    const queryEmbedding = await getEmbedding(query);
    for (const entry of this.cache) {
      const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
      if (similarity >= threshold) return entry.result;
    }
    return null;
  }

  async set(query: string, result: any) {
    this.cache.push({
      query,
      embedding: await getEmbedding(query),
      result,
    });
  }
}
```

### 3. 自适应 Top-K

根据查询的置信度动态调整检索数量：

```typescript
async function adaptiveTopK(query: string, minK = 3, maxK = 10) {
  const queryEmbedding = await getEmbedding(query);
  const results = await vectorSearch(queryEmbedding, maxK);

  // 计算置信度：基于结果与查询的平均相似度
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

  // 置信度高 → 少检索；置信度低 → 多检索
  const k = avgScore > 0.8 ? minK : maxK;
  return results.slice(0, k);
}
```

## 🧠 知识检查点

1. **混合检索为什么比纯语义检索效果更好？**

<details>
<summary>点击展开答案</summary>

纯语义检索依赖于 Embedding 的语义理解能力，对同义词和概念匹配很好，但对精确的术语、编号、缩写匹配不足。混合检索结合关键词搜索（BM25）的精确匹配能力和语义检索的模糊匹配能力，两者互补。RRF 融合算法通过排名倒数加权，兼顾了两种结果的质量。
</details>

2. **查询重写的最佳实践是什么？**

<details>
<summary>点击展开答案</summary>

最佳实践包括：（1）保留原始查询中的专有名词和关键术语，不改写这些精确信息；（2）生成多个改写版本（3-5 个），覆盖不同表达角度；（3）改写后与原查询一起检索（多查询检索），而非替换原查询；（4）对改写结果做去重，避免同一文档被多次检索。
</details>

3. **什么是上下文压缩？为什么它能提升生成质量？**

<details>
<summary>点击展开答案</summary>

上下文压缩是对检索到的文档片段做摘要/精简，只保留与用户问题最相关的部分。它能提升生成质量是因为：（1）减少无关信息对 LLM 的干扰，降低幻觉率；（2）压缩后上下文更紧凑，LLM 更容易聚焦；（3）减少 Token 消耗，降低成本和延迟。但需要权衡——过度压缩可能丢失关键信息。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 缓存未命中率高，缓存形同虚设 | 语义相似度阈值设置太高（如 0.99），缓存命中条件过于严格 | 适当降低阈值（0.92-0.95），或对查询做归一化（去除停用词、统一格式） |
| 上下文压缩后信息丢失 | 压缩 Prompt 没有明确要求"保留所有关键事实和数字" | 在压缩 Prompt 中强调"保留所有具体数字、日期、名称"，并对压缩结果做信息完整性检查 |
| 重排序模型调用太慢 | 每次查询对 20+ 个候选文档完整调用交叉编码器 | 先用轻量方法（如余弦相似度）筛选 Top-10，再对剩余结果调用交叉编码器精排 |

## 📝 本章小结

- ✅ **混合检索** — 关键词 + 语义搜索互补
- ✅ **查询重写** — 优化用户查询，提升检索准确率
- ✅ **重排序** — 先粗检再精排，提升 Top-K 质量

## ➡️ 下一章预告

> [第8章：综合实战 — 企业知识库问答系统](./08-capstone-knowledge-base.md)

---
