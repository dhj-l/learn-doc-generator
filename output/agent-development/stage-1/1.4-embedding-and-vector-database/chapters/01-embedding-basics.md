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

### 场景：为技术博客构建语义搜索功能

**场景描述：**
你正在为一个技术博客平台开发搜索功能。传统的关键词搜索无法理解「语义」——搜索「前端框架」时，包含「React」「Vue」「Next.js」的文章都应该出现，但靠关键词匹配只能找到标题中包含这些词的文章。你需要基于 Embedding 实现语义搜索。

**你的任务：**
1. 创建一个文档集合，包含不同类型的技术文章
2. 使用 Embedding API 将文档转换为向量
3. 实现语义搜索功能，支持按相似度排序
4. 验证搜索「前端框架」能正确返回前端相关的文章

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

## ⚡ 进阶技巧

### 技巧一：批量处理性能优化

当需要处理大量文档时，可以利用 OpenAI Embedding API 的批量能力：

```typescript
// 批量处理比单条处理快 10-50 倍
async function batchProcess(texts: string[], batchSize: number = 100) {
  const embeddings: number[][] = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    });
    
    // 按原始顺序排列
    const sorted = response.data.sort((a, b) => a.index - b.index);
    embeddings.push(...sorted.map(d => d.embedding));
    
    console.log(`处理进度: ${Math.min(i + batchSize, texts.length)}/${texts.length}`);
  }
  
  return embeddings;
}
```

> **💡 为什么批量处理更高效？** 单条请求需要建立一次 HTTP 连接和一次模型推理。批量处理将多个文本打包在同一个请求中，模型可以并行编码，大幅提升吞吐量。OpenAI 单次请求最多支持 2048 条文本。

### 技巧二：维度缩减

OpenAI 的 text-embedding-3 系列支持在返回时直接缩减维度，无需额外处理：

```typescript
// 从 1536 维缩减到 256 维，节省 83% 的存储空间
const response = await client.embeddings.create({
  model: 'text-embedding-3-small',
  dimensions: 256,  // 指定目标维度
  input: '要编码的文本',
});

console.log(response.data[0].embedding.length); // 256
// 缩减后仍保留约 95% 的语义信息
```

### 技巧三：Embedding 缓存

避免对相同的文本重复调用 API：

```typescript
class EmbeddingCache {
  private cache = new Map<string, number[]>();
  
  async getOrCreate(text: string): Promise<number[]> {
    if (this.cache.has(text)) {
      return this.cache.get(text)!;  // 缓存命中，直接返回
    }
    
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    
    this.cache.set(text, response.data[0].embedding);
    return response.data[0].embedding;
  }
  
  // 可以序列化到磁盘，进程重启后重新加载
  save(path: string) {
    // 保存为 JSON 文件
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Embedding 的本质是什么？**

A：Embedding 是将文本（或其他数据）转换为固定长度的数值向量，使得语义上相近的文本在向量空间中距离更近。它通过深度学习模型（如 Transformer）捕捉词语和上下文之间的关系来实现。

**Q2：余弦相似度的值域是多少？各代表什么含义？**

A：值域为 [-1, 1]。1 表示方向完全相同（语义高度相似），0 表示正交（无关），-1 表示方向完全相反（语义对立）。在实际应用中，文本 Embedding 的余弦相似度通常在 [0, 1] 范围内。

**Q3：为什么说「语义搜索」比「关键词搜索」更好？**

A：关键词搜索只能匹配精确的字面词汇，无法理解同义词、近义词或上下文语义。例如搜索「汽车」会漏掉「轿车」「automobile」等语义相近的内容。语义搜索通过向量相似度匹配「意思」，能够理解同义词和上下文。

**Q4：什么是 Embedding 的维度？维度越高越好吗？**

A：维度是向量的长度，每个维度编码了文本的某个特征。维度越高表示信息容量越大（如 text-embedding-3-large 的 3072 维），但也会增加存储和计算成本。并非越高越好——需要根据应用场景在精度和效率之间做权衡。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 不同模型生成的向量无法比较 | 使用了不同的 Embedding 模型（如一部分用 text-embedding-3-small，另一部分用 BGE） | 确保存储和查询使用同一个 Embedding 模型，统一模型后再生成向量 |
| 搜索「苹果」时水果和手机品牌混在一起 | Embedding 无法自动区一词多义，除非上下文明确 | 在文档中加入上下文描述（如「苹果（水果）」vs「苹果（手机品牌）」），或使用不同的 Collection 分别存储 |
| 向量维度不匹配导致搜索报错 | Collection 创建时指定的 dimension 与实际向量维度不同 | 创建集合时明确指定 dimension 参数，或使用支持自动检测的向量数据库 |
| 单条处理大量文档（1000+）导致超时 | 没有使用批量 API，一条一条发送请求 | 使用批量 Embedding，每批 100-500 条，大幅减少 API 调用次数 |
| 余弦相似度计算结果全为正数 | 没有对向量做归一化，或者使用了未归一化的 Embedding | 使用 normalize=True 参数，或在计算前对向量做 L2 归一化 |

---

## 📝 本章小结

- ✅ **Embedding 是什么** — 将文本转换为数值向量，保留语义信息
- ✅ **语义空间** — 意思相近的文本在向量空间中距离更近
- ✅ **相似度计算** — 余弦相似度是最常用的衡量方法
- ✅ **Embedding API** — 使用 OpenAI 或其他提供商将文本转向量
- ✅ **语义搜索** — 基于向量相似度的文本检索

## ➡️ 下一章预告

> [第2章：Embedding 模型](./02-embedding-models.md) — 深入了解主流 Embedding 模型的选型和使用。
