# 第5章：Retriever 检索器 — 从千万文档中找到最相关的那一段

> 预计学习时间：90-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解检索器在 RAG 中的核心作用** — 为什么需要检索
- **掌握文本分割技术** — 将长文档切分为可检索的片段
- **构建向量存储** — 使用 MemoryVectorStore 存储文档嵌入
- **实现多种检索策略** — 相似度搜索、MMR、带分数检索
- **构建完整的 RAG 链** — 检索 + 生成的全流程

## 📋 前置知识

> 建议先完成：
> - [第1章：LangChain.js 概述](./01-introduction.md) — Model、Prompt、Chain 基础
> - [第2章：LCEL 链式调用](./02-lcel.md) — Runnable 管道操作
> - [第4章：文档加载器](./04-document-loaders.md) — 文档加载技能

---

## 💡 核心概念

### 概念一：为什么需要检索器？

**生活类比：** 想象你要在图书馆里找一本关于"量子计算"的书。你有两个选择：
1. **不检索** — 把图书馆里 10 万本书全部抱回家，一本本翻找。这相当于把整个知识库塞进 LLM 提示词（Token 爆炸）。
2. **检索** — 先查图书目录系统，找到相关书架，挑出最相关的 3-5 本书。这相当于 Retriever 的工作。

**为什么这样做？** LLM 的上下文窗口有限（通常 8K-200K tokens），无法处理整个知识库。检索器从海量文档中筛选出最相关的片段，既节省 Token 费用，又提高回答质量（减少无关信息的干扰）。

```
传统方案（无检索）：
  全部文档 → 塞进提示词 → LLM 回答
  ❌ Token 超限、成本高、噪音多

RAG 方案（带检索）：
  用户问题 → 检索器（找相关文档）→ 文档片段 → 提示词 → LLM 回答
  ✅ 成本低、精度高、可扩展
```

### 概念二：文本分割 — 让检索更精确

**生活类比：** 你把一本《百科全书》拆成一张张卡片，每张卡片只讲一个概念。拆得好，找相关信息又快又准；拆得不好，要么一张卡片上信息太多（找不到具体内容），要么信息被切断了（上下文不完整）。

```typescript
// src/01-text-splitting.ts
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

// 基础知识：分割器配置
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,         // 每段最大字符数
  chunkOverlap: 200,       // 段落重叠字符数
  separators: ['\n\n', '\n', '。', '.', ' ', ''],  // 分割优先级
});

// 分割文档
const text = `
💡 微服务架构是一种将应用程序构建为独立可部署服务集合的方法。

微服务的核心优势：
1. 独立部署 — 每个服务可以独立发布和更新
2. 技术多样性 — 不同服务可以使用不同的技术栈
3. 故障隔离 — 一个服务的故障不会影响其他服务

## 微服务的挑战

尽管优势明显，微服务也带来挑战：
- 运维复杂度增加
- 分布式系统的一致性问题
- 服务间通信的延迟和可靠性
`.trim();

const docs = await splitter.createDocuments([text]);

console.log(`分割成 ${docs.length} 段:`);
docs.forEach((doc, i) => {
  console.log(`\n--- 段落 ${i + 1} (${doc.pageContent.length} 字符) ---`);
  console.log(doc.pageContent);
});
```

```
预期输出：
分割成 2 段:

--- 段落 1 (630 字符) ---
💡 微服务架构是一种将应用程序构建为独立可部署服务集合的方法。

微服务的核心优势：
1. 独立部署 — 每个服务可以独立发布和更新
2. 技术多样性 — 不同服务可以使用不同的技术栈
3. 故障隔离 — 一个服务的故障不会影响其他服务

--- 段落 2 (485 字符) ---
## 微服务的挑战

尽管优势明显，微服务也带来挑战：
- 运维复杂度增加
- 分布式系统的一致性问题
- 服务间通信的延迟和可靠性
```

**为什么 `RecursiveCharacterTextSplitter` 是最常用的？** 因为它"聪明"地选择分割点：优先在段落边界（`\n\n`）分割，如果没有长段落，退而求其次在句子边界（`。`）分割，最后才在字符边界强制分割。这样最大程度保持了语义完整性。

**chunkOverlap 的作用是什么？** 重叠是为了避免"信息被切断"——如果一个关键概念恰好在分割点上，前后两段都包含它的一部分。重叠让两段都保留这个概念的相关上下文。

### 概念三：嵌入（Embedding）— 将文字变成向量

**生活类比：** 嵌入就像给每个词句拍一张"语义身份证"。相似意思的词句（"汽车"和"轿车"）的身份证号码相近，而意思不同的（"汽车"和"苹果"）的身份证号码相差很远。

```typescript
// src/02-embeddings.ts
import { OpenAIEmbeddings } from '@langchain/openai';

// 初始化嵌入模型
const embeddings = new OpenAIEmbeddings({
  modelName: 'text-embedding-3-small',  // OpenAI 的嵌入模型
  // 或者使用 Anthropic 的嵌入（通过第三方提供商）
});

// 将文本转为向量
const vector1 = await embeddings.embedQuery('微服务架构的优势');
const vector2 = await embeddings.embedQuery('微服务的优点');
const vector3 = await embeddings.embedQuery('今天天气真好');

console.log(`向量维度: ${vector1.length}`);  // 通常是 1536 维

// 计算余弦相似度
function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (normA * normB);
}

const sim12 = cosineSimilarity(vector1, vector2);  // 语义相似 → 高分数 (>0.9)
const sim13 = cosineSimilarity(vector1, vector3);  // 语义不同 → 低分数 (<0.5)

console.log(`"微服务架构的优势" vs "微服务的优点": ${sim12.toFixed(4)}`);
console.log(`"微服务架构的优势" vs "今天天气真好":  ${sim13.toFixed(4)}`);
```

```
预期输出：
向量维度: 1536
"微服务架构的优势" vs "微服务的优点": 0.9234
"微服务架构的优势" vs "今天天气真好":  0.2145
```

> **💡 嵌入模型的选择**
>
> - **OpenAI `text-embedding-3-small`** — 性价比高，1536 维，适合大部分场景
> - **OpenAI `text-embedding-3-large`** — 更高精度，3072 维，适合对精度要求高的场景
> - **HuggingFace 嵌入** — 通过 `@langchain/community` 集成，可离线使用

### 概念四：MemoryVectorStore — 内存级向量存储

**生活类比：** MemoryVectorStore 就像你书桌上的备忘录盒子。你把所有文档卡片（向量）放进去，然后在盒盖上标了索引标签（索引）。当你问"微服务是什么"时，你很快就能在盒子里找出最相关的几张卡片。

```typescript
// src/03-vector-store.ts
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';

// 准备文档
const docs = [
  new Document({
    pageContent: '微服务架构将应用程序构建为独立部署的服务集合。',
    metadata: { topic: 'architecture', source: 'doc1' },
  }),
  new Document({
    pageContent: 'Monorepo 是一种将多个项目放在同一个代码仓库中的策略。',
    metadata: { topic: 'devops', source: 'doc2' },
  }),
  new Document({
    pageContent: '微服务的优势包括独立部署、技术多样性和故障隔离。',
    metadata: { topic: 'architecture', source: 'doc3' },
  }),
];

// 创建向量存储（自动生成嵌入）
const vectorStore = await MemoryVectorStore.fromDocuments(
  docs,
  new OpenAIEmbeddings()
);

console.log('✅ 向量存储创建成功');

// 相似度搜索
const query = '微服务有什么好处？';
const results = await vectorStore.similaritySearch(query, 2);

console.log(`\n🔍 查询: "${query}"`);
console.log(`找到 ${results.length} 个相关文档:`);
results.forEach((doc, i) => {
  console.log(`\n结果 ${i + 1} (相似度排行 ${i + 1}):`);
  console.log(`  内容: ${doc.pageContent}`);
  console.log(`  主题: ${doc.metadata.topic}`);
});
```

```
预期输出：
✅ 向量存储创建成功

🔍 查询: "微服务有什么好处？"
找到 2 个相关文档:

结果 1 (相似度排行 1):
  内容: 微服务的优势包括独立部署、技术多样性和故障隔离。
  主题: architecture

结果 2 (相似度排行 2):
  内容: 微服务架构将应用程序构建为独立部署的服务集合。
  主题: architecture
```

### 概念五：Retriever 接口 — 检索的标准方式

**生活类比：** Retriever 接口就像一个通用的查询窗口。不管窗口后面是向量数据库、传统搜索引擎还是图数据库，用户都通过同样的方式查询：`retriever.invoke("问题")`。

```typescript
// src/04-retriever-basics.ts
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';

// 创建向量存储（假设已经有文档）
const vectorStore = await MemoryVectorStore.fromDocuments(
  documents,
  new OpenAIEmbeddings()
);

// 方式 1：最基础的检索器
const retriever = vectorStore.asRetriever();
const results = await retriever.invoke('微服务架构');
// results: Document[]

// 方式 2：带参数的检索器
const retrieverWithK = vectorStore.asRetriever({
  k: 5,                       // 返回 top-5 结果
  searchType: 'similarity',   // 搜索方式：similarity（默认）或 mmr
});

// 方式 3：使用搜索过滤器
const filteredRetriever = vectorStore.asRetriever({
  k: 3,
  filter: { topic: 'architecture' },  // 只搜索 architecture 主题
});

// 方式 4：带分数的检索（了解相似度得分）
const resultsWithScores = await vectorStore.similaritySearchWithScore(
  '微服务架构',
  3
);

resultsWithScores.forEach(([doc, score]) => {
  console.log(`📄 ${doc.pageContent.slice(0, 50)}...`);
  console.log(`📊 相似度分数: ${score.toFixed(4)}`);
  // score 是余弦距离（0 = 最相似，越接近 0 越相关）
  console.log('---');
});
```

```
预期输出：
📄 微服务架构将应用程序构建为独立部署的服务集合...
📊 相似度分数: 0.1234
---
📄 微服务的优势包括独立部署、技术多样性和故障隔离...
📊 相似度分数: 0.1876
---
📄 Monorepo 是一种将多个项目放在同一个代码仓库中的策略...
📊 相似度分数: 0.5231
```

> **💡 关于相似度分数**
>
> `similaritySearchWithScore` 返回的是余弦距离（cosine distance），**越低表示越相似**。分数在 0（完全相同）到 2（完全相反）之间。实际应用中，通常认为分数 < 0.3 为高度相关，0.3-0.5 为可能相关，> 0.5 为不相关。

### 概念六：MMR 搜索 — 多样性优先的检索策略

**生活类比：** MMR（最大边际相关性）就像请朋友推荐电影。普通检索会给你 5 部"最佳科幻片"（可能全是《星球大战》系列的）。MMR 会给你 1 部《星球大战》、1 部《银河系漫游指南》、1 部《黑客帝国》——虽然单部相关度稍低，但覆盖了科幻片的不同子类型。

```typescript
// src/05-mmr-search.ts
import { MemoryVectorStore } from 'langchain/vectorstores/memory';

// 使用 MMR 检索
const mmrRetriever = vectorStore.asRetriever({
  k: 4,                     // 返回 4 个结果
  searchType: 'mmr',        // 使用 MMR 算法
  lambda: 0.5,              // 多样性参数（0=只关心相似度，1=只关心多样性）
  fetchK: 20,               // 先取 top-20，再从中选择多样化的 4 个
});

const mmrResults = await mmrRetriever.invoke('编程语言');

// 对比：普通相似度搜索
const similarityRetriever = vectorStore.asRetriever({
  k: 4,
  searchType: 'similarity',
});

const simResults = await similarityRetriever.invoke('编程语言');

console.log('🔍 普通相似度搜索（可能都是 JavaScript 相关）:');
simResults.forEach((d, i) => console.log(`  ${i + 1}. ${d.pageContent.slice(0, 60)}`));

console.log('\n🎯 MMR 搜索（覆盖不同维度）:');
mmrResults.forEach((d, i) => console.log(`  ${i + 1}. ${d.pageContent.slice(0, 60)}`));
```

**什么时候用 MMR？** 当你的文档库中有大量相似内容时（比如几十篇都讲"微服务"的文章），MMR 能防止检索结果被同一主题淹没，提供更全面的信息覆盖。

### 概念七：完整 RAG 链 — 检索增强生成

**生活类比：** RAG 链就像一个"带着资料来面试的专家"。你问一个问题（面试题），专家先在资料库里查找相关信息（检索），然后结合找到的资料来回答你（生成）。这样专家的回答既有深度又有依据。

```typescript
// src/06-rag-chain.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';

// 1. 准备检索器
const vectorStore = await MemoryVectorStore.fromDocuments(
  documents,  // 从 ch4 加载的文档
  new OpenAIEmbeddings()
);
const retriever = vectorStore.asRetriever({ k: 3 });

// 2. 创建 RAG 提示模板
const ragPrompt = ChatPromptTemplate.fromMessages([
  ['system', `你是一个智能知识库助手。请基于以下参考资料回答问题。

如果参考资料足够，请给出详细的回答并引用来源。
如果参考资料不足，请如实说明"我找不到相关信息"。

参考资料：
{context}

注意：回答时请用中文。`],
  ['user', '{question}'],
]);

// 3. 构建 RAG 链
const model = new ChatAnthropic({
  modelName: 'claude-sonnet-4-5-20241022',
  maxTokens: 1024,
});

const parser = new StringOutputParser();

const ragChain = RunnableSequence.from([
  // 步骤 1：检索文档并格式化上下文
  {
    context: async (input: { question: string }) => {
      const docs = await retriever.invoke(input.question);
      return docs
        .map((doc, i) => `[来源 ${i + 1}] ${doc.pageContent}`)
        .join('\n\n');
    },
    question: new RunnablePassthrough(),
  },
  // 步骤 2-4：提示词 → 模型 → 解析器
  ragPrompt,
  model,
  parser,
]);

// 4. 执行 RAG 查询
const answer = await ragChain.invoke({
  question: '微服务架构的优势是什么？',
});

console.log(`❓ 问题: 微服务架构的优势是什么？\n`);
console.log(`💬 回答: ${answer}`);
```

```
预期输出：
❓ 问题: 微服务架构的优势是什么？

💬 回答: 基于参考资料，微服务架构的主要优势包括：

1. **独立部署** — 每个服务可以独立发布和更新，不影响其他服务
2. **技术多样性** — 不同服务可以使用不同的技术栈和编程语言
3. **故障隔离** — 一个服务的故障不会影响其他服务，提高了系统的整体稳定性

[来源 1] 微服务的优势包括独立部署、技术多样性和故障隔离。
[来源 3] 微服务架构将应用程序构建为独立部署的服务集合。
```

> **💡 RAG 链的精妙之处**
>
> RAG 链把"检索"和"生成"两个步骤无缝集成在一个 LCEL 管线中。`context` 字段的异步函数会在每次调用时自动执行检索，而 `RunnablePassthrough` 则把原始问题原封不动传给模板。这一切都是**惰性求值**的——只有当你 `invoke` 链的时候，检索才会真正发生。

---

## 🔨 实战演练

### 练习：构建一个带有评分和多样性控制的知识库检索系统

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/07-advanced-retriever.ts
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

// 步骤 1：准备长文档并分割
const longText = `
# TypeScript 高级类型

## 泛型
泛型是 TypeScript 最强大的特性之一。它允许函数、类和接口与多种类型一起工作。

## 类型守卫
类型守卫是运行时检查，确保一个值在特定作用域内是特定类型。

## 条件类型
条件类型根据条件选择不同的类型。例如 T extends string ? 'yes' : 'no'。

## Mapped Types
Mapped Types 允许你基于现有类型创建新类型。例如 Partial<T> 将所有属性变为可选。

## 模板字面量类型
TypeScript 4.1 引入的模板字面量类型允许在类型级别操作字符串。

## 总结
TypeScript 的高级类型系统让代码更加类型安全且富有表现力。
`.trim();

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 200,
  chunkOverlap: 30,
});

const splitDocs = await splitter.createDocuments([longText]);
console.log(`原始文档已分割为 ${splitDocs.length} 个片段`);

// 步骤 2：构建向量存储
const vectorStore = await MemoryVectorStore.fromDocuments(
  splitDocs,
  new OpenAIEmbeddings()
);

// 步骤 3：多策略检索器
class SmartRetriever {
  constructor(private store: MemoryVectorStore) {}

  // 策略 1：普通相似度搜索
  async similaritySearch(query: string, k: number = 3) {
    return this.store.similaritySearch(query, k);
  }

  // 策略 2：带分数过滤的搜索
  async thresholdSearch(query: string, threshold: number = 0.3) {
    const results = await this.store.similaritySearchWithScore(query, 10);
    return results.filter(([, score]) => score <= threshold);
  }

  // 策略 3：多样化的 MMR 搜索
  async diverseSearch(query: string, k: number = 3) {
    const retriever = this.store.asRetriever({
      k,
      searchType: 'mmr',
      lambda: 0.6,
      fetchK: 10,
    });
    return retriever.invoke(query);
  }

  // 策略 4：融合搜索（多次搜索合并结果去重）
  async hybridSearch(query: string, k: number = 3) {
    const [simResults, mmrResults] = await Promise.all([
      this.similaritySearch(query, k),
      this.diverseSearch(query, k),
    ]);

    const seen = new Set<string>();
    const combined = [...simResults, ...mmrResults];

    return combined.filter(doc => {
      const key = doc.pageContent.slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, k);
  }
}

// 步骤 4：测试不同策略
const smartRetriever = new SmartRetriever(vectorStore);
const query = 'TypeScript 条件类型';

console.log(`\n🔍 查询: "${query}"\n`);

console.log('📊 策略 1 — 相似度搜索:');
const sim = await smartRetriever.similaritySearch(query, 2);
sim.forEach((d, i) => console.log(`  ${i + 1}. ${d.pageContent.trim()}`));

console.log('\n📊 策略 2 — 阈值过滤 (threshold=0.3):');
const threshold = await smartRetriever.thresholdSearch(query, 0.3);
threshold.forEach(([d, score], i) =>
  console.log(`  ${i + 1}. [score=${score.toFixed(4)}] ${d.pageContent.trim()}`)
);

console.log('\n📊 策略 4 — 融合搜索:');
const hybrid = await smartRetriever.hybridSearch(query, 2);
hybrid.forEach((d, i) => console.log(`  ${i + 1}. ${d.pageContent.trim()}`));
```

**预期输出：**
```
原始文档已分割为 6 个片段

🔍 查询: "TypeScript 条件类型"

📊 策略 1 — 相似度搜索:
  1. 条件类型
     条件类型根据条件选择不同的类型。例如 T extends string ? 'yes' : 'no'。
  2. 泛型
     泛型是 TypeScript 最强大的特性之一。它允许函数、类和接口与多种类型一起工作。

📊 策略 2 — 阈值过滤 (threshold=0.3):
  1. [score=0.1123] 条件类型
     条件类型根据条件选择不同的类型。例如 T extends string ? 'yes' : 'no'。
  2. [score=0.2845] Mapped Types
     Mapped Types 允许你基于现有类型创建新类型。例如 Partial<T> 将所有属性变为可选。

📊 策略 4 — 融合搜索:
  1. 条件类型...
  2. Mapped Types...
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：检索器组合（Ensemble Retrieval）

```typescript
import { EnsembleRetriever } from 'langchain/retrievers/ensemble';

// 结合多个检索器的结果
const keywordRetriever = ...;   // 基于关键词的检索器
const vectorRetriever = ...;    // 基于向量的检索器

const ensembleRetriever = new EnsembleRetriever({
  retrievers: [keywordRetriever, vectorRetriever],
  weights: [0.3, 0.7],          // 关键词检索权重 30%，向量检索权重 70%
});

const results = await ensembleRetriever.invoke('微服务架构');
```

### 技巧二：用 ParentDocumentRetriever 保留上下文

```typescript
import { ParentDocumentRetriever } from 'langchain/retrievers/parent_document';

// 父文档检索器：检索小片段但返回完整的父文档
const retriever = new ParentDocumentRetriever({
  vectorstore: vectorStore,
  childSplitter: new RecursiveCharacterTextSplitter({ chunkSize: 200 }),
  parentSplitter: new RecursiveCharacterTextSplitter({ chunkSize: 2000 }),
  // 检索到子片段后，返回对应的父文档
});
```

### 技巧三：上下文压缩（压缩检索结果）

```typescript
import { ContextualCompressionRetriever } from 'langchain/retrievers/contextual_compression';
import { LLMChainExtractor } from 'langchain/retrievers/document_compressors';

const compressor = new LLMChainExtractor({
  llm: model,
});

const compressionRetriever = new ContextualCompressionRetriever({
  baseCompressor: compressor,
  baseRetriever: retriever,
});

// 只返回与问题最相关的那部分内容
const compressedDocs = await compressionRetriever.invoke('微服务的优势');
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：RecursiveCharacterTextSplitter 的 chunkOverlap 参数有什么作用？**

> A：chunkOverlap 让相邻段落之间有一定重叠。假设第一段包含"微服务的优势包括独立部"，第二段开头是"部署、技术多样性和故障隔离"——如果没有重叠，"独立部署"这个词就被切断了。重叠确保关键短语不会因为分割点而丢失上下文。

**Q2：相似度搜索和 MMR 搜索的区别是什么？**

> A：相似度搜索只关心"和查询最相似"，结果可能高度同质化（全是同一个主题）。MMR 在"和查询相似"和"结果之间不相似"之间取得平衡，保证检索结果覆盖不同方面。例如查"编程语言"，相似度搜索可能返回 5 个 JavaScript 相关的结果，MMR 会返回 JS、Python、Rust 各一个。

**Q3：RAG 链中 context 字段的异步函数什么时候执行？**

> A：只在 `chain.invoke()` 被调用时执行（惰性求值）。每次调用都会重新执行检索，保证使用最新的数据。如果检索数据不常变化，可以考虑缓存结果以提高性能。

**Q4：MemoryVectorStore 适合生产环境吗？**

> A：不适合。MemoryVectorStore 把所有向量存在内存中，进程重启后数据丢失。生产环境应使用持久化向量数据库如 Chroma（`@langchain/community/vectorstores/chroma`）、Pinecone（`@langchain/pinecone`）或 Weaviate。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `Embedding dimension mismatch` | 嵌入维度不一致 | 确保所有文档使用同一个嵌入模型 |
| `Cannot find module @langchain/openai` | 缺少嵌入模型包 | `npm install @langchain/openai` |
| `No documents retrieved` | 检索器返回空结果 | 检查文档是否已存入向量存储，或调整相似度阈值 |
| `Token limit exceeded` | 检索到的文档太长 | 减少 `k` 值或调整 `chunkSize` |
| `Memory usage too high` | 文档过多导致内存溢出 | 使用持久化向量数据库替代 MemoryVectorStore |

---

## 📝 本章小结

- ✅ **检索器的必要性** — 解决 LLM 上下文窗口限制和 Token 成本问题
- ✅ **文本分割** — `RecursiveCharacterTextSplitter` 智能分割文档
- ✅ **嵌入** — 将文本转为语义向量（`OpenAIEmbeddings`）
- ✅ **MemoryVectorStore** — 内存向量存储，快速构建检索原型
- ✅ **Retriever 接口** — 统一的检索方式（`asRetriever()`）
- ✅ **相似度搜索** — 基于向量距离的精确匹配
- ✅ **MMR 搜索** — 多样化的检索结果
- ✅ **RAG 链** — 检索 + 生成的完整 LCEL 管线
- ✅ **阈值过滤** — 只返回相似度超过阈值的文档

## ➡️ 下一章预告

> 在下一章中，我们将学习 Callbacks（回调）——如何监听和调试 LangChain 链的执行过程，包括 Token 统计、自定义事件处理、以及 LangSmith 的集成。
> [第6章：Callbacks 与调试](./06-callbacks.md)
