# RAG 系统速查表

> 涵盖 RAG 管道的索引（Indexing）、检索（Retrieval）、生成（Generation）三阶段，以及分块、检索策略、评估等核心主题。

---

## 🏗️ RAG 三阶段总览

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Indexing      │ →  │    Retrieval     │ →  │   Generation    │
│  索引阶段        │    │   检索阶段        │    │   生成阶段       │
├─────────────────┤    ├──────────────────┤    ├─────────────────┤
│ 文档加载         │    │ Query 编码       │    │ 注入上下文       │
│ 分块 (Chunking)  │    │ 向量检索          │    │ Prompt 组装     │
│ Embedding 生成   │    │ 混合检索          │    │ LLM 生成回答    │
│ 向量入库          │    │ 重排序            │    │ 输出校验        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📦 分块策略详解

```typescript
// LangChain 分块示例
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,
  chunkOverlap: 50,
  separators: ['\n\n', '\n', '。', '.', ' ', ''],
});

const chunks = await splitter.splitDocuments(documents);
// chunkSize: 每个块的目标长度
// chunkOverlap: 块间重叠字符数（保持上下文连贯）
// separators: 按优先级顺序的切割分隔符
```

| 分块策略 | chunkSize | chunkOverlap | 适用场景 | 优点 | 缺点 |
|----------|-----------|-------------|----------|------|------|
| 固定长度 | 200-500 | 0-20 | 简单文档 | 实现简单 | 可能切碎语义 |
| 递归分块 | 500-1000 | 50-200 | 通用场景（推荐） | 保留文档结构 | 参数需调优 |
| 语义分块 | 自适应 | 自适应 | 高精度需求 | 保持语义完整 | 成本高、速度慢 |
| 段落分块 | 按段落 | 0 | 结构化文档 | 自然边界 | 长度差异大 |
| 句子分块 | 按句子 | 1-2 句 | 问答场景 | 粒度细 | 上下文不足 |

## 🔍 检索策略对比

| 方法 | 原理 | 优点 | 缺点 | 适用场景 |
|------|------|------|------|----------|
| 语义搜索 | 向量 + 余弦相似度 | 理解语义、容忍同义词 | 精确匹配差 | 开放域问答 |
| BM25 关键词 | 词频 + 逆文档频率 | 精确匹配、速度快 | 不处理语义 | 代码搜索、专有名词 |
| 混合检索（Hybrid） | 语义 + BM25 加权融合 | 兼顾语义和精确匹配 | 复杂度高 | 通用生产系统 |
| 重排序（Rerank） | 对初筛结果排序 | 精度最高 | 延迟 + 成本 | 对精度要求高的场景 |

```typescript
// 混合检索实现
async function hybridSearch(
  query: string,
  vectorStore: VectorStore,
  bm25Index: BM25Index,
  topK: number = 10
): Promise<Document[]> {
  // 1. 语义搜索
  const semanticResults = await vectorStore.similaritySearch(query, topK * 2);
  
  // 2. BM25 关键词搜索
  const bm25Results = bm25Index.search(query, topK * 2);
  
  // 3. 加权融合（Reciprocal Rank Fusion）
  const scores = new Map<string, number>();
  
  semanticResults.forEach((doc, i) => {
    scores.set(doc.id, (scores.get(doc.id) || 0) + 1 / (i + 1 + 60));
  });
  bm25Results.forEach((doc, i) => {
    scores.set(doc.id, (scores.get(doc.id) || 0) + 1 / (i + 1 + 60));
  });
  
  // 4. 按分数排序取 topK
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id]) => /* 获取文档 */);
}

// 重排序示例（使用 Cohere Rerank API）
async function rerankResults(
  query: string,
  documents: Document[],
  topK: number = 5
): Promise<Document[]> {
  const response = await cohere.rerank({
    model: 'rerank-english-v3.0',
    query,
    documents: documents.map(d => d.pageContent),
    topN: topK,
  });
  return response.results.map(r => documents[r.index]);
}
```

## 📥 索引管道代码

```typescript
// 完整索引管道
async function indexingPipeline(
  documents: Document[],
  embeddingModel: EmbeddingModel,
  vectorStore: VectorStore
): Promise<void> {
  // Step 1: 文档分块
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });
  const chunks = await splitter.splitDocuments(documents);
  
  // Step 2: 生成 Embedding
  const embeddings = await embeddingModel.embedDocuments(
    chunks.map(c => c.pageContent)
  );
  
  // Step 3: 构建 metadata
  const metadatas = chunks.map(chunk => ({
    source: chunk.metadata.source,
    page: chunk.metadata.page,
    chunkIndex: chunk.metadata.loc.lines.from,
    chunkSize: chunk.pageContent.length,
  }));
  
  // Step 4: 存入向量数据库
  await vectorStore.addDocuments(
    chunks.map((chunk, i) => ({
      id: `${chunk.metadata.source}-${i}`,
      content: chunk.pageContent,
      embedding: embeddings[i],
      metadata: metadatas[i],
    }))
  );
}
```

## 📊 RAG 评估指标

| 指标 | 含义 | 评估方法 | 目标值 |
|------|------|----------|--------|
| Faithfulness | 回答是否忠于文档（不幻觉） | LLM 评分 | ≥ 0.9 |
| Relevancy | 回答是否切题、有用 | LLM 评分 | ≥ 0.8 |
| Context Recall | 是否找到了所有相关文档 | 人工 / LLM | ≥ 0.85 |
| Context Precision | 检索到的文档中相关占比 | 人工 / LLM | ≥ 0.7 |
| Answer Relevancy | 回答与问题的相关性 | 余弦相似度 | ≥ 0.7 |
| Hit Rate | 相关文档在前 K 个中的比例 | 统计 | ≥ 0.8 |

```typescript
// 使用 RAGAS 进行评估
import { evaluate, Faithfulness, AnswerRelevancy } from 'ragas';

const dataset = [
  {
    question: '什么是 RAG？',
    answer: 'RAG 是检索增强生成...',
    contexts: ['RAG 全称 Retrieval-Augmented Generation...'],
    ground_truth: 'RAG 是一种结合检索和生成的 NLP 技术...',
  },
];

const scores = await evaluate(dataset, [
  new Faithfulness(),
  new AnswerRelevancy(),
]);

console.log(scores);
// { faithfulness: 0.95, answer_relevancy: 0.88 }
```

## ⚡ 检索加速技术

| 技术 | 原理 | 加速效果 | 精度损失 |
|------|------|----------|----------|
| HNSW 索引 | 分层导航小世界图 | 10-100x | 极低（< 1%） |
| IVF 索引 | 倒排文件聚类 | 5-10x | 低（1-5%） |
| 量化（PQ） | 向量压缩 | 3-5x | 中（5-10%） |
| 缓存 | 缓存高频查询结果 | 取决于命中率 | 无 |
| 分片 | 多节点并行检索 | 线性扩展 | 无 |

## 🧩 高级 RAG 模式

| 模式 | 说明 | 复杂度 | 适用场景 |
|------|------|--------|----------|
| Multi-hop RAG | 多次检索，逐步推理 | 高 | 复杂推理问答 |
| Agentic RAG | Agent 决定何时检索、检索什么 | 高 | 自主知识工作 |
| Self-RAG | 检索后自我评估是否需要更多检索 | 中 | 需要高可靠性的场景 |
| Corrective RAG | 检索质量不佳时自动修正查询 | 中 | 初始查询不明确时 |
| Graph RAG | 结合知识图谱的 RAG | 高 | 多实体关系查询 |

## 🔑 关键 API 速查

| API / 库 | 用途 | 示例 |
|----------|------|------|
| `RecursiveCharacterTextSplitter` | 递归文本分块 | `new RecursiveCharacterTextSplitter({ chunkSize: 500 })` |
| `embedDocuments(texts)` | 批量生成向量 | `model.embedDocuments(docs)` |
| `vectorStore.similaritySearch(query, k)` | 向量检索 | `store.similaritySearch("RAG", 5)` |
| `vectorStore.addDocuments(docs)` | 文档入库 | `store.addDocuments(chunks)` |
| `cohere.rerank()` | 重排序结果 | `cohere.rerank({ query, documents, topN })` |
| `evaluate()` RAGAS | RAG 系统评估 | `evaluate(dataset, metrics)` |
| `BM25Okapi.index()` | 关键词索引 | `BM25Okapi(corpus)` |
| `Reciprocal Rank Fusion` | 混合检索融合 | `RRF(semantic, bm25)` |
| `langchain/document_loaders` | 多种文档格式加载 | `PDFLoader`、`CSVLoader` |
| `chromadb.Collection.query()` | 向量查询 | `collection.query({ queryEmbeddings })` |
