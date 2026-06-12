# 第5章：高级检索策略 — 超越简单的相似度搜索

> 预计学习时间：90-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **实现混合检索** — 结合语义搜索和关键词搜索的优势
- **使用重排序提升精度** — 对初始检索结果进行二次排序
- **设计高效的分块策略** — 将长文档切分为合适的片段
- **实现 Multi-hop 检索** — 多步检索复杂问题

## 📋 前置知识

> 建议先完成：[第3章：ChromaDB](./03-chromadb.md)

---

## 💡 核心概念

### 概念一：为什么简单的语义搜索不够？

```
场景：用户搜索 "React 18 的 useDeferredValue 钩子"

纯语义搜索可能返回：
1. "React 钩子的使用方法" (0.85) ← 相关但太笼统
2. "Vue 的 Composition API" (0.72) ← 语义相似但不对
3. "React 18 并发渲染特性" (0.80) ← 相关但没提到具体钩子

问题：语义搜索擅长理解「意思」，但不擅长精确匹配关键词
```

### 概念二：混合检索（Hybrid Search）

```
混合检索 = 语义搜索（向量）+ 关键词搜索（BM25）

语义搜索擅长：理解意图、同义词、跨语言
关键词搜索擅长：精确匹配、专有名词、缩写

两者结合 = 互补优势
```

```typescript
// src/hybrid-search.ts
import { ChromaClient } from 'chromadb';

// BM25 关键词搜索（简化实现）
class BM25Search {
  private documents: Array<{ id: string; text: string }> = [];

  addDocuments(docs: Array<{ id: string; text: string }>) {
    this.documents.push(...docs);
  }

  search(query: string, topK: number = 5): Array<{ id: string; score: number }> {
    const queryTerms = query.toLowerCase().split(/\s+/);

    const scores = this.documents.map(doc => {
      const docLower = doc.text.toLowerCase();
      let score = 0;

      for (const term of queryTerms) {
        // TF（词频）
        const tf = (docLower.match(new RegExp(term, 'g')) || []).length;
        // 简化的 BM25 分数
        score += tf / (tf + 1);
      }

      return { id: doc.id, score };
    });

    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

// 混合搜索
async function hybridSearch(
  query: string,
  vectorResults: Array<{ id: string; score: number }>,
  keywordResults: Array<{ id: string; score: number }>,
  alpha: number = 0.7  // 语义搜索权重
): Promise<Array<{ id: string; score: number }>> {
  // 归一化分数
  const normalize = (scores: number[]) => {
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    return scores.map(s => max === min ? 1 : (s - min) / (max - min));
  };

  const vecScores = normalize(vectorResults.map(r => r.score));
  const kwScores = normalize(keywordResults.map(r => r.score));

  // 融合分数
  const allIds = new Set([...vectorResults.map(r => r.id), ...keywordResults.map(r => r.id)]);
  const merged = Array.from(allIds).map(id => {
    const vecIdx = vectorResults.findIndex(r => r.id === id);
    const kwIdx = keywordResults.findIndex(r => r.id === id);
    const vecScore = vecIdx >= 0 ? vecScores[vecIdx] : 0;
    const kwScore = kwIdx >= 0 ? kwScores[kwIdx] : 0;

    return {
      id,
      score: alpha * vecScore + (1 - alpha) * kwScore,
    };
  });

  return merged.sort((a, b) => b.score - a.score);
}
```

### 概念三：重排序（Reranking）

```
原始检索（Top-20）→ 重排序模型 → 精排结果（Top-5）

重排序模型（如 Cohere Rerank、BGE-Reranker）会对每个文档
与查询的相关性进行更精细的打分，比初始向量检索更准确。
```

```typescript
// src/reranker.ts
import OpenAI from 'openai';

// 使用 Cohere Rerank API
async function rerank(
  query: string,
  documents: string[],
  topK: number = 5
) {
  const response = await fetch('https://api.cohere.ai/v1/rerank', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.COHERE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'rerank-multilingual-v3.0',
      query,
      documents,
      top_n: topK,
    }),
  });

  const data = await response.json();
  return data.results.map((r: any) => ({
    index: r.index,
    document: documents[r.index],
    score: r.relevance_score,
  }));
}

// 使用：先粗排再精排
async function searchWithRerank(query: string) {
  // 1. 粗排：向量检索 Top-20
  const roughResults = await vectorSearch(query, 20);

  // 2. 精排：重排序取 Top-5
  const reranked = await rerank(
    query,
    roughResults.map(r => r.text),
    5
  );

  return reranked;
}
```

### 概念四：文档分块策略

```
分块是 RAG 系统中最关键的预处理步骤之一。
块太大 → 检索不精确，噪音多
块太小 → 上下文丢失，信息碎片化
```

```typescript
// src/chunking.ts

// 策略 1：固定长度分块
function fixedSizeChunk(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize - overlap) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

// 策略 2：按段落分块
function paragraphChunk(text: string, maxChunkSize: number = 1000): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += '\n\n' + para;
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
}

// 策略 3：递归分块（LangChain 推荐）
function recursiveChunk(
  text: string,
  chunkSize: number = 500,
  overlap: number = 50,
  separators: string[] = ['\n\n', '\n', '。', '. ', ' ']
): string[] {
  if (text.length <= chunkSize) return [text];

  // 找到能容纳的最大分隔符
  for (const sep of separators) {
    const parts = text.split(sep);
    if (parts.length > 1) {
      const chunks: string[] = [];
      let currentChunk = '';

      for (const part of parts) {
        if (currentChunk.length + part.length > chunkSize && currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          // 保留重叠部分
          currentChunk = currentChunk.slice(-overlap) + sep + part;
        } else {
          currentChunk += (currentChunk ? sep : '') + part;
        }
      }
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      return chunks;
    }
  }

  return fixedSizeChunk(text, chunkSize, overlap);
}
```

---

## 🔨 实战演练

### 练习：构建完整的检索管线

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/retrieval-pipeline.ts
import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';

const openai = new OpenAI();
const chroma = new ChromaClient();

class RetrievalPipeline {
  private collection: any;

  async init(collectionName: string) {
    this.collection = await chroma.getOrCreateCollection({ name: collectionName });
  }

  // 1. 文档预处理：分块 + Embedding + 存储
  async ingestDocument(doc: { id: string; content: string; metadata: any }) {
    const chunks = recursiveChunk(doc.content, 500, 50);
    const ids = chunks.map((_, i) => `${doc.id}-chunk-${i}`);
    const metadatas = chunks.map((_, i) => ({
      ...doc.metadata,
      chunkIndex: i,
      totalChunks: chunks.length,
      parentId: doc.id,
    }));

    await this.collection.add({ ids, documents: chunks, metadatas });
    return ids.length;
  }

  // 2. 检索管线：粗排 → 重排
  async retrieve(query: string, topK: number = 5) {
    // 粗排：向量检索 Top-20
    const roughResults = await this.collection.query({
      queryTexts: [query],
      nResults: 20,
    });

    // 精排：让 LLM 判断相关性
    const docs = roughResults.documents[0];
    const rerankResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `对以下文档按与查询的相关性打分（1-10），输出 JSON：
{"rankings": [{"index": 0, "score": 8}, ...]}`,
        },
        {
          role: 'user',
          content: `查询: ${query}\n\n文档:\n${docs.map((d: string, i: number) => `[${i}] ${d}`).join('\n\n')}`,
        },
      ],
    });

    const rankings = JSON.parse(rerankResponse.choices[0].message.content || '{"rankings":[]}');
    return rankings.rankings
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, topK)
      .map((r: any) => ({
        content: docs[r.index],
        score: r.score,
        metadata: roughResults.metadatas?.[0][r.index],
      }));
  }
}
```

</details>

---

## 📝 本章小结

- ✅ **混合检索** — 语义搜索 + 关键词搜索互补
- ✅ **重排序** — 粗排 + 精排两级管线
- ✅ **分块策略** — 固定长度、按段落、递归分块
- ✅ **检索管线** — 文档预处理 → 分块 → 粗排 → 精排

## ➡️ 下一章预告

> [第6章：综合实战 — 语义搜索系统](./06-capstone-search.md)
