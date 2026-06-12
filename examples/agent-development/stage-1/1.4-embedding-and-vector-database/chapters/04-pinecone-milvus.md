# 第4章：Pinecone 与 Milvus — 生产级向量数据库

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 Pinecone 搭建云向量数据库** — 零运维的生产级方案
- **使用 Milvus 部署高性能向量数据库** — 自托管的大规模方案
- **对比不同向量数据库的选型** — 根据场景选择最合适的方案

## 📋 前置知识

> 建议先完成：[第3章：ChromaDB 实战](./03-chromadb.md)

---

## 💡 核心概念

### 概念一：向量数据库选型对比

| 特性 | ChromaDB | Pinecone | Milvus |
|------|----------|----------|--------|
| 部署方式 | 本地/嵌入式 | 云托管 | 自托管/云 |
| 数据规模 | 小-中 | 中-大 | 大-超大 |
| 运维成本 | 零 | 零 | 中-高 |
| 查询性能 | 快 | 快 | 非常快 |
| 价格 | 免费 | 按量付费 | 免费(自托管) |
| 适用场景 | 原型/小型 | 生产/中型 | 生产/大型 |

### 概念二：Pinecone

```bash
npm install @pinecone-database/pinecone
```

```typescript
// src/pinecone-demo.ts
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const openai = new OpenAI();

async function pineconeDemo() {
  // 1. 创建索引（Index，类似 ChromaDB 的 Collection）
  const indexName = 'tech-docs';
  const existingIndexes = await pinecone.listIndexes();
  const indexExists = existingIndexes.indexes?.some(idx => idx.name === indexName);

  if (!indexExists) {
    await pinecone.createIndex({
      name: indexName,
      dimension: 1536,  // text-embedding-3-small 的维度
      metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
    });
    // 等待索引就绪
    await new Promise(resolve => setTimeout(resolve, 60000));
  }

  const index = pinecone.index(indexName);

  // 2. 生成 Embedding 并上传
  const documents = [
    { id: 'doc-1', text: 'React 18 并发渲染', category: 'frontend' },
    { id: 'doc-2', text: 'Docker 容器化部署', category: 'devops' },
    { id: 'doc-3', text: 'Vue 3 Composition API', category: 'frontend' },
  ];

  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: documents.map(d => d.text),
  });

  await index.upsert(
    documents.map((doc, i) => ({
      id: doc.id,
      values: embeddingResponse.data[i].embedding,
      metadata: { text: doc.text, category: doc.category },
    }))
  );

  // 3. 查询
  const queryEmbedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: '前端框架',
  });

  const results = await index.query({
    vector: queryEmbedding.data[0].embedding,
    topK: 3,
    includeMetadata: true,
    filter: { category: { $eq: 'frontend' } },
  });

  results.matches?.forEach((match, i) => {
    console.log(`${i + 1}. ${match.metadata?.text} (score: ${match.score?.toFixed(3)})`);
  });
}

pineconeDemo();
```

### 概念三：Milvus

```bash
# Docker 启动 Milvus
# docker-compose up -d

npm install @zilliz/milvus2-sdk-node
```

```typescript
// src/milvus-demo.ts
import { MilvusClient } from '@zilliz/milvus2-sdk-node';

async function milvusDemo() {
  const client = new MilvusClient({
    address: 'localhost:19530',
  });

  // 1. 创建 Collection
  const collectionName = 'tech_docs';
  await client.createCollection({
    collection_name: collectionName,
    fields: [
      { name: 'id', data_type: 'VarChar', is_primary_key: true, max_length: 64 },
      { name: 'embedding', data_type: 'FloatVector', dim: 1536 },
      { name: 'text', data_type: 'VarChar', max_length: 2048 },
      { name: 'category', data_type: 'VarChar', max_length: 64 },
    ],
  });

  // 2. 创建索引
  await client.createIndex({
    collection_name: collectionName,
    field_name: 'embedding',
    index_type: 'IVF_FLAT',
    metric_type: 'COSINE',
    params: { nlist: 1024 },
  });

  // 3. 插入数据
  await client.insert({
    collection_name: collectionName,
    data: [
      { id: '1', embedding: [...], text: 'React 框架', category: 'frontend' },
      { id: '2', embedding: [...], text: 'Docker 容器', category: 'devops' },
    ],
  });

  // 4. 搜索
  const results = await client.search({
    collection_name: collectionName,
    vectors: [queryVector],
    limit: 3,
    output_fields: ['text', 'category'],
  });
}
```

---

## 🔨 实战演练

### 练习：构建跨数据库的统一检索接口

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// 统一向量数据库接口
interface VectorDB {
  upsert(documents: Array<{ id: string; embedding: number[]; metadata: any }>): Promise<void>;
  search(queryEmbedding: number[], topK: number, filter?: any): Promise<Array<{ id: string; score: number; metadata: any }>>;
  delete(ids: string[]): Promise<void>;
  count(): Promise<number>;
}

// ChromaDB 适配器
class ChromaDBAdapter implements VectorDB {
  private collection: any;
  
  constructor(collection: any) { this.collection = collection; }

  async upsert(documents: Array<{ id: string; embedding: number[]; metadata: any }>) {
    await this.collection.upsert({
      ids: documents.map(d => d.id),
      embeddings: documents.map(d => d.embedding),
      metadatas: documents.map(d => d.metadata),
    });
  }

  async search(queryEmbedding: number[], topK: number, filter?: any) {
    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      where: filter,
    });
    return results.ids[0].map((id: string, i: number) => ({
      id,
      score: 1 - (results.distances?.[0][i] || 0),
      metadata: results.metadatas?.[0][i],
    }));
  }

  async delete(ids: string[]) { await this.collection.delete({ ids }); }
  async count() { return this.collection.count(); }
}

// 使用统一接口，不关心底层是哪个数据库
async function universalSearch(db: VectorDB, query: string) {
  const embedding = await getEmbedding(query);
  return db.search(embedding, 5);
}
```

</details>

---

## 📝 本章小结

- ✅ **Pinecone** — 云托管向量数据库，零运维，适合中型生产环境
- ✅ **Milvus** — 高性能自托管方案，适合大规模场景
- ✅ **选型建议** — 小型用 ChromaDB，中型用 Pinecone，大型用 Milvus
- ✅ **统一接口** — 设计适配器模式兼容多种向量数据库

## ➡️ 下一章预告

> [第5章：高级检索策略](./05-advanced-search.md) — 混合检索、重排序、分块策略。
