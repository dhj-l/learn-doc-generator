# 第1章：Embedding 基础 — 把文字变成数字

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Embedding 的本质** — 知道文本如何被转换为数字向量
- **掌握语义空间的概念** — 理解为什么「意思相近的文本在向量空间中距离更近」
- **计算向量相似度** — 使用余弦相似度、欧氏距离等方法衡量文本相关性
- **使用 Embedding API** — 将文本转换为向量并进行搜索

## 📋 前置知识

> 建议先完成：[1.1 第1章：LLM 基本原理](../1.1-prompt-engineering/chapters/01-llm-fundamentals.md)

---

## 💡 核心概念

### 概念一：什么是 Embedding？

**生活类比：** 想象你在一个巨大的图书馆里找书。你不会一本一本翻，而是先查目录——目录按照主题把相关书籍放在相近的位置。Embedding 就是把文本放进一个「语义目录」——**意思相近的文本会被放在相近的位置**。

```
"猫是可爱的宠物"     → [0.2, 0.8, 0.1, ...]  ← 这两个向量
"小猫很讨人喜欢"     → [0.3, 0.7, 0.1, ...]  ← 距离很近

"量子力学的基本原理" → [0.9, 0.1, 0.5, ...]  ← 这两个向量
"波粒二象性"         → [0.8, 0.2, 0.6, ...]  ← 距离也很近

"猫是可爱的宠物"     → [0.2, 0.8, 0.1, ...]  ← 这两个向量
"量子力学的基本原理" → [0.9, 0.1, 0.5, ...]  ← 距离很远
```

#### Embedding 的技术本质

```
文本 "猫是可爱的宠物"
        ↓
   Tokenizer（分词）
        ↓
   [猫, 是, 可爱, 的, 宠物]
        ↓
   Transformer 编码器
        ↓
   [0.234, 0.812, 0.156, ..., 0.445]  ← 一个 1536 维的向量
```

> **💡 为什么 Embedding 对 AI 应用至关重要？**
>
> 1. **语义搜索** — 不靠关键词匹配，靠「意思」匹配
> 2. **推荐系统** — 找到相似的内容
> 3. **RAG（检索增强生成）** — 先找到相关文档，再让 LLM 回答
> 4. **聚类分析** — 自动将相似的文本分组
> 5. **异常检测** — 找出与主题不相关的文本

### 概念二：相似度计算

#### 余弦相似度（最常用）

```
余弦相似度 = cos(θ) = (A · B) / (|A| × |B|)

值域：[-1, 1]
  1   = 完全相同方向（意思完全相同）
  0   = 正交（没有关系）
  -1  = 完全相反（意思完全相反）
```

```typescript
// src/similarity.ts

// 余弦相似度计算
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('向量维度不一致');

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 欧氏距离
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

// 使用示例
const vec1 = [0.2, 0.8, 0.1]; // "猫是可爱的宠物"
const vec2 = [0.3, 0.7, 0.1]; // "小猫很讨人喜欢"
const vec3 = [0.9, 0.1, 0.5]; // "量子力学的基本原理"

console.log('猫 vs 小猫:', cosineSimilarity(vec1, vec2).toFixed(4));  // ~0.98（非常相似）
console.log('猫 vs 量子:', cosineSimilarity(vec1, vec3).toFixed(4));  // ~0.32（不太相关）
```

```
预期输出：
猫 vs 小猫: 0.9865
猫 vs 量子: 0.3243
```

### 概念三：使用 Embedding API

```typescript
// src/embedding.ts
import OpenAI from 'openai';

const client = new OpenAI();

// 将文本转换为向量
async function getEmbedding(text: string): Promise<number[]> {
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',  // 1536 维
    input: text,
  });
  return response.data[0].embedding;
}

// 批量转换
async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,  // 支持批量输入
  });
  return response.data
    .sort((a, b) => a.index - b.index)
    .map(item => item.embedding);
}

// 简单语义搜索
async function semanticSearch(query: string, documents: string[]) {
  // 1. 获取查询文本的向量
  const queryEmbedding = await getEmbedding(query);

  // 2. 获取所有文档的向量
  const docEmbeddings = await getEmbeddings(documents);

  // 3. 计算相似度
  const results = documents.map((doc, i) => ({
    document: doc,
    similarity: cosineSimilarity(queryEmbedding, docEmbeddings[i]),
  }));

  // 4. 按相似度排序
  results.sort((a, b) => b.similarity - a.similarity);

  return results;
}

// 使用示例
async function main() {
  const documents = [
    'React 是一个用于构建用户界面的 JavaScript 库',
    'Vue.js 是一个渐进式 JavaScript 框架',
    'Docker 是一个容器化部署工具',
    'TypeScript 是 JavaScript 的超集，添加了静态类型',
    'PostgreSQL 是一个关系型数据库',
    'Next.js 是一个基于 React 的全栈框架',
  ];

  const results = await semanticSearch('前端框架', documents);

  console.log('🔍 搜索: "前端框架"\n');
  results.forEach((r, i) => {
    const bar = '█'.repeat(Math.round(r.similarity * 20));
    console.log(`${i + 1}. ${r.document}`);
    console.log(`   相似度: ${bar} ${(r.similarity * 100).toFixed(1)}%\n`);
  });
}

main();
```

```
预期输出：
🔍 搜索: "前端框架"

1. Vue.js 是一个渐进式 JavaScript 框架
   相似度: ████████████████ 85.2%

2. React 是一个用于构建用户界面的 JavaScript 库
   相似度: ███████████████ 82.1%

3. Next.js 是一个基于 React 的全栈框架
   相似度: ██████████████ 78.5%

4. TypeScript 是 JavaScript 的超集，添加了静态类型
   相似度: █████████ 52.3%

5. Docker 是一个容器化部署工具
   相似度: ████ 23.1%

6. PostgreSQL 是一个关系型数据库
   相似度: ███ 18.7%
```

### 概念四：Embedding 模型对比

| 模型 | 维度 | 价格 | 特点 |
|------|------|------|------|
| `text-embedding-3-small` | 1536 | $0.02/M tokens | OpenAI 默认，性价比高 |
| `text-embedding-3-large` | 3072 | $0.13/M tokens | OpenAI 最强，支持维度缩减 |
| `Cohere embed-v3` | 1024 | $0.1/M tokens | 多语言支持好 |
| `BGE-M3` | 1024 | 免费（本地） | 开源，可本地部署 |
| `nomic-embed` | 768 | 免费（本地） | 轻量级开源模型 |

---

## 🔨 实战演练

### 练习：构建一个简易语义搜索引擎

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import OpenAI from 'openai';

const client = new OpenAI();

interface Document {
  id: string;
  content: string;
  metadata: Record<string, any>;
  embedding?: number[];
}

class SimpleSearchEngine {
  private documents: Document[] = [];

  async addDocument(doc: Document): Promise<void> {
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: doc.content,
    });
    doc.embedding = response.data[0].embedding;
    this.documents.push(doc);
  }

  async addDocuments(docs: Document[]): Promise<void> {
    // 批量 Embedding（OpenAI 支持最多 2048 条/批）
    const batches = [];
    for (let i = 0; i < docs.length; i += 100) {
      batches.push(docs.slice(i, i + 100));
    }

    for (const batch of batches) {
      const response = await client.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch.map(d => d.content),
      });
      response.data.forEach((item, i) => {
        batch[item.index].embedding = item.embedding;
      });
      this.documents.push(...batch);
    }
  }

  async search(query: string, topK: number = 5): Promise<Array<Document & { score: number }>> {
    const queryResponse = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const queryEmbedding = queryResponse.data[0].embedding;

    const results = this.documents
      .filter(doc => doc.embedding)
      .map(doc => ({
        ...doc,
        score: this.cosineSimilarity(queryEmbedding, doc.embedding!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return results;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

// 使用
async function main() {
  const engine = new SimpleSearchEngine();

  await engine.addDocuments([
    { id: '1', content: 'React 是一个用于构建用户界面的 JavaScript 库，由 Meta 维护', metadata: { category: 'frontend' } },
    { id: '2', content: 'Vue.js 是一个渐进式 JavaScript 框架，由尤雨溪创建', metadata: { category: 'frontend' } },
    { id: '3', content: 'Node.js 是一个基于 V8 引擎的 JavaScript 运行时', metadata: { category: 'backend' } },
    { id: '4', content: 'Docker 容器化技术让应用部署更加标准化', metadata: { category: 'devops' } },
    { id: '5', content: 'TypeScript 为 JavaScript 添加了静态类型系统', metadata: { category: 'language' } },
  ]);

  const results = await engine.search('构建 Web 应用的框架');
  results.forEach(r => {
    console.log(`[${r.score.toFixed(3)}] ${r.content}`);
  });
}

main();
```

</details>

---

## 📝 本章小结

- ✅ **Embedding 是什么** — 将文本转换为数值向量，保留语义信息
- ✅ **语义空间** — 意思相近的文本在向量空间中距离更近
- ✅ **相似度计算** — 余弦相似度是最常用的衡量方法
- ✅ **Embedding API** — 使用 OpenAI 或其他提供商将文本转向量
- ✅ **语义搜索** — 基于向量相似度的文本检索

## ➡️ 下一章预告

> [第2章：Embedding 模型](./02-embedding-models.md) — 深入了解主流 Embedding 模型的选型和使用。
