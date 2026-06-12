# RAG 系统速查表

---

## 🏗️ RAG 核心流程

```
文档 → 分块 → Embedding → 向量数据库 → 检索 → LLM 生成
        ↓         ↓            ↓          ↓        ↓
    chunkText  embedding    collection  query   chat.completions
```

## 📦 分块策略

| 策略 | chunkSize | overlap | 代码实现 | 适用场景 |
|------|-----------|---------|----------|----------|
| 固定长度 | 500-1000 | 50-100 | `text.slice(i, i + chunkSize)` | 通用文本 |
| 递归分块 | 根据段落 | 20% | `recursiveCharacterSplit(text, separators)` | 推荐默认 |
| 语义分块 | 自适应 | 0 | `splitAtSentenceBoundaries(text)` | 高精度场景 |

```typescript
// 固定长度分块
function chunkText(text: string, size = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size - overlap) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}
```

## 🔍 检索策略对比

| 方法 | 优点 | 缺点 | 示例 |
|------|------|------|------|
| 语义搜索 | 理解同义词、近义表达 | 可能漏精确匹配 | `collection.query({ queryTexts: [query] })` |
| BM25 | 精确匹配关键词 | 不理解同义词 | `bm25.search(query, { topK: 5 })` |
| 混合检索 | 语义+关键词互补 | 实现复杂度较高 | `hybridSearch(query, { semantic, keyword })` |
| 重排序 | 精度最高 | 增加延迟和成本 | `reranker.rerank(query, candidates)` |

## 📊 评估指标

| 指标 | 含义 | 衡量方式 |
|------|------|----------|
| Faithfulness | 回答是否忠于文档 | `answer.contains(fact) ? 1 : 0` |
| Relevancy | 回答是否切题 | `llm.evaluate(`回答是否针对问题：${qa}`)` |
| Context Recall | 是否找到所有相关文档 | `relevantFound / totalRelevant` |
| Context Precision | 检索结果中相关文档占比 | `relevantRetrieved / totalRetrieved` |

## 🚀 完整管线示例

```typescript
import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';

const chroma = new ChromaClient();
const openai = new OpenAI();

// 1. 索引
async function indexDocument(id: string, content: string) {
  const chunks = chunkText(content, 500, 50);
  const collection = await chroma.getOrCreateCollection({ name: 'docs' });
  await collection.add({
    ids: chunks.map((_, i) => `${id}_${i}`),
    documents: chunks,
    metadatas: chunks.map(() => ({ source: id })),
  });
}

// 2. 检索
async function retrieve(query: string, topK = 3) {
  const collection = await chroma.getCollection({ name: 'docs' });
  return await collection.query({ queryTexts: [query], nResults: topK });
}

// 3. 生成
async function generate(query: string, context: string) {
  return await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: `基于以下资料回答：\n${context}` },
      { role: 'user', content: query },
    ],
  });
}
```

## 💡 优化技巧

| 技巧 | 效果 | 实现 |
|------|------|------|
| 分块重叠 | 减少边界信息丢失 | `overlap = chunkSize * 0.1` |
| 元数据过滤 | 缩小检索范围 | `where: { category: 'tech' }` |
| 混合检索 | 兼顾语义+精确 | `RRF([semanticResults, keywordResults])` |
| 重排序 | 提升 Top-K 质量 | `crossEncoder.rerank(query, candidates)` |
| 查询扩展 | 改善检索覆盖 | `expandQuery(query) // 同义词扩展` |

## ⚠️ 常见陷阱

- 分块太大 → 每个 chunk 包含多个话题，检索不精准
- 分块太小 → 每个 chunk 语义不完整
- 不设 overlap → 边界处的信息被截断
- 只用语义检索 → 精确术语（如 API 名）匹配差
- 检索 topK 太小 → 可能漏掉关键文档
