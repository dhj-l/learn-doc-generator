# 向量数据库速查表

---

## 📊 选型速查

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| 原型开发 | ChromaDB | 零配置、嵌入式 |
| 小型生产 | ChromaDB + 云部署 | 简单够用 |
| 中型生产 | Pinecone | 云托管、零运维 |
| 大型生产 | Milvus | 高性能、可扩展 |
| 多语言 | Qdrant | 强过滤能力 |

## 🚀 ChromaDB 快速开始

```typescript
import { ChromaClient } from 'chromadb';
const client = new ChromaClient();
const collection = await client.getOrCreateCollection({ name: 'docs' });
await collection.add({ ids: [...], documents: [...], metadatas: [...] });
const results = await collection.query({ queryTexts: ['搜索词'], nResults: 5 });
```

## 📏 相似度计算

```typescript
// 余弦相似度（推荐）
cosine(a, b) = (a·b) / (|a|×|b|)
// 值域 [−1, 1]，1 = 最相似

// 欧氏距离
euclidean(a, b) = √(Σ(aᵢ − bᵢ)²)
// 值越小越相似
```

## 📦 分块策略

| 策略 | chunkSize | overlap | 适用 |
|------|-----------|---------|------|
| 固定长度 | 500-1000 | 50-100 | 通用 |
| 按段落 | 自然段落边界 | 上下句 | 结构化文档 |
| 递归 | 500-1000 | 50 | LangChain 推荐 |

## 🇨🇳 国产 Embedding 模型

| 模型 | 维度 | 特点 |
|------|------|------|
| BGE-M3 | 1024 | 多语言、免费 |
| BGE-large-zh | 1024 | 中文优化 |
| text2vec-large-chinese | 1024 | 中文通用 |
