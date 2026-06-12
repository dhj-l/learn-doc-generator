# 第5章：Retriever 检索器 — 从海量文档中找到答案

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Retriever 的核心作用** — 从大量文档中检索最相关的内容
- **构建向量检索系统** — 文本分块 → Embedding → 向量存储 → 相似度检索
- **掌握多种检索策略** — 相似度检索、MMR、多查询检索
- **将 Retriever 集成到 RAG 链** — 用 LCEL 构建完整的问答管线

## 📋 前置知识

> 建议先完成：
> - [第4章：文档加载器](./04-document-loaders.md) — Document 对象和加载器
> - [1.4 Embedding 与向量数据库](../../stage-1/1.4-embedding-and-vector-database/README.md) — Embedding 基础

---

## 💡 核心概念

### 概念一：Retriever 解决什么问题？

**生活类比：** 你有一个图书馆，里面有 10,000 本书。用户问「Vue 3 的 Composition API 怎么用？」。你不会把 10,000 本书都搬给用户，而是快速找到最相关的 3-5 本。Retriever 就是这个「图书管理员」。

```
没有 Retriever 的问题：

用户问: "Vue 3 的 Composition API 怎么用？"

方案 1: 把所有文档塞进 Prompt
  → Token 超限 ❌
  → 成本巨大 ❌

方案 2: 用关键词搜索
  → "Composition API" 可能匹配不到 "setup() 函数" ❌
  → 语义相似但用词不同的内容搜不到 ❌

方案 3: 用向量检索（Retriever）
  → 先把文档切成小块，转为向量
  → 用户问题也转为向量
  → 找到语义最相似的文档块 ✅
```

### 概念二：文本分块 — TextSplitter

在检索之前，需要把长文档切成小块。为什么？因为：
1. LLM 的上下文窗口有限，不能塞入整本书
2. 检索粒度越小，匹配越精确

```typescript
// src/01-text-splitter.ts
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

// 最常用的文本分割器：递归字符分割
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,        // 每块最大 500 字符
  chunkOverlap: 50,      // 相邻块重叠 50 字符（避免切断语义）
  separators: ['\n\n', '\n', '。', '，', ' ', ''],  // 分割优先级
});

const text = `
Vue 3 的 Composition API 是一种全新的组件逻辑组织方式。它允许你使用函数来组织组件逻辑，
而不是像 Options API 那样按照 data、methods、computed 等选项分类。

使用 Composition API 的核心是 setup() 函数。它在组件创建之前执行，
是 Composition API 的入口点。在 setup() 中，你可以使用 ref() 创建响应式数据，
使用 computed() 创建计算属性，使用 watch() 监听数据变化。

ref() 接受一个值并返回一个响应式引用对象。通过 .value 属性访问和修改值。
在模板中使用时会自动解包，不需要 .value。
`;

const chunks = await splitter.splitText(text);
console.log(`分成 ${chunks.length} 块:`);
chunks.forEach((chunk, i) => {
  console.log(`\n--- 块 ${i + 1} ---`);
  console.log(chunk);
});
```

```
预期输出：
分成 2 块:

--- 块 1 ---
Vue 3 的 Composition API 是一种全新的组件逻辑组织方式。它允许你使用函数来组织组件逻辑，
而不是像 Options API 那样按照 data、methods、computed 等选项分类。

使用 Composition API 的核心是 setup() 函数。它在组件创建之前执行...

--- 块 2 ---
...是 Composition API 的入口点。在 setup() 中，你可以使用 ref() 创建响应式数据，
使用 computed() 创建计算属性，使用 watch() 监听数据变化。

ref() 接受一个值并返回一个响应式引用对象...
```

```typescript
// 从 Document 对象分割（保留元数据）
import { Document } from '@langchain/core/documents';

const docs = [new Document({ pageContent: text, metadata: { source: 'vue-guide.md' } })];
const splitDocs = await splitter.splitDocuments(docs);

// 分割后每个块都保留了原始元数据
console.log(splitDocs[0].metadata);
// { source: 'vue-guide.md' }  ← 元数据被继承
```

> **💡 chunkSize 和 chunkOverlap 怎么选？**
>
> | 场景 | chunkSize | chunkOverlap | 原因 |
> |------|-----------|--------------|------|
> | 精确问答 | 200-500 | 50 | 小块匹配更精确 |
> | 长文分析 | 1000-2000 | 100-200 | 大块保留更多上下文 |
> | 代码文档 | 500-1000 | 100 | 代码需要足够上下文 |
> | 通用推荐 | 500 | 50 | 平衡精确度和上下文 |

### 概念三：向量存储 — MemoryVectorStore

将文本块转为向量并存储，以便后续检索。

```typescript
// src/02-vector-store.ts
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';

// 创建文档
const docs = [
  new Document({ pageContent: 'Vue 3 的 Composition API 使用 setup() 函数作为入口', metadata: { topic: 'vue' } }),
  new Document({ pageContent: 'ref() 用于创建响应式的基本类型数据', metadata: { topic: 'vue' } }),
  new Document({ pageContent: 'reactive() 用于创建响应式的对象类型数据', metadata: { topic: 'vue' } }),
  new Document({ pageContent: 'TypeScript 的泛型允许创建可复用的类型安全组件', metadata: { topic: 'typescript' } }),
  new Document({ pageContent: 'React 的 useState Hook 用于管理组件状态', metadata: { topic: 'react' } }),
];

// 创建向量存储（自动调用 Embedding API）
const embeddings = new OpenAIEmbeddings();
const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);

// 相似度搜索
const results = await vectorStore.similaritySearch('Vue 3 怎么创建响应式数据？', 3);

console.log('🔍 检索结果:');
results.forEach((doc, i) => {
  console.log(`\n[${i + 1}] 相关度排序`);
  console.log(`    内容: ${doc.pageContent}`);
  console.log(`    元数据: ${JSON.stringify(doc.metadata)}`);
});
```

```
预期输出：
🔍 检索结果:

[1] 相关度排序
    内容: ref() 用于创建响应式的基本类型数据
    元数据: {"topic":"vue"}

[2] 相关度排序
    内容: reactive() 用于创建响应式的对象类型数据
    元数据: {"topic":"vue"}

[3] 相关度排序
    内容: Vue 3 的 Composition API 使用 setup() 函数作为入口
    元数据: {"topic":"vue"}
```

> **💡 MemoryVectorStore vs 生产级向量数据库**
>
> `MemoryVectorStore` 存储在内存中，适合开发和测试。生产环境应该使用：
> - **Pinecone** — 全托管云服务，免运维
> - **Milvus** — 开源，适合私有部署
> - **ChromaDB** — 轻量级，适合原型
> - **PostgreSQL + pgvector** — 已有 PG 的项目直接扩展
>
> 所有向量数据库的 LangChain 接口相同，切换只需改一行代码。

### 概念四：Retriever 接口 — 统一的检索抽象

```typescript
// src/03-retriever.ts

// 从向量存储创建 Retriever
const retriever = vectorStore.asRetriever({
  k: 3,                  // 返回前 3 个结果
  searchType: 'similarity',  // 相似度检索
});

// Retriever 的统一接口
const docs = await retriever.invoke('Vue 3 响应式数据');
// 返回 Document[]  ← 和其他 Retriever 一样的格式
```

### 概念五：检索策略

```typescript
// src/04-search-strategies.ts

// 策略 1：相似度检索（默认）
// 返回与查询最相似的 k 个文档
const similarityRetriever = vectorStore.asRetriever({
  k: 3,
  searchType: 'similarity',
});

// 策略 2：MMR（最大边际相关性）
// 在相似度和多样性之间取平衡，避免返回过于相似的结果
const mmrRetriever = vectorStore.asRetriever({
  k: 3,
  searchType: 'mmr',
  searchKwargs: {
    fetchK: 10,           // 先取 10 个候选
    lambda: 0.5,           // 0=最多样，1=最相关
  },
});

// 策略 3：带过滤的检索
// 根据元数据过滤结果
const filteredRetriever = vectorStore.asRetriever({
  k: 3,
  filter: { topic: 'vue' },  // 只返回 topic 为 'vue' 的文档
});
```

```
对比三种策略的结果：

查询: "Vue 3 响应式数据"

相似度检索:  [ref(), reactive(), setup()]     — 全是 Vue 响应式相关
MMR:        [ref(), useState(), reactive()]   — 包含 React 的 useState（多样性）
过滤检索:   [ref(), reactive(), setup()]     — 只看 topic=vue 的文档
```

### 概念六：完整 RAG 链 — Retriever + LLM

```typescript
// src/05-rag-chain.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });
const parser = new StringOutputParser();

// RAG 提示模板
const ragPrompt = ChatPromptTemplate.fromMessages([
  ['system', `你是一个技术文档问答助手。基于以下检索到的文档片段回答问题。
如果文档中没有相关信息，请如实说明不要编造。

检索到的文档：
{context}`],
  ['user', '{question}'],
]);

// 辅助函数：将文档列表格式化为文本
function formatDocs(docs: any[]): string {
  return docs.map((doc, i) => `[文档 ${i + 1}] ${doc.pageContent}`).join('\n\n');
}

// 构建 RAG 链
const ragChain = RunnableSequence.from([
  {
    context: retriever.pipe(formatDocs),    // 检索 + 格式化
    question: new RunnablePassthrough(),    // 传递原始问题
  },
  ragPrompt,
  model,
  parser,
]);

// 使用
const answer = await ragChain.invoke('Vue 3 中 ref 和 reactive 有什么区别？');
console.log(answer);
```

```
预期输出：
ref() 和 reactive() 都是 Vue 3 中创建响应式数据的 API，但它们有以下区别：

1. **ref()** — 用于创建响应式的基本类型数据（string、number、boolean 等）
   通过 .value 属性访问和修改值

2. **reactive()** — 用于创建响应式的对象类型数据
   直接访问和修改属性，不需要 .value

（以上回答基于检索到的文档片段）
```

---

## 🔨 实战演练

### 练习：构建一个文档问答系统

**场景描述：** 你有一组 Markdown 文档（技术博客），需要构建一个能回答技术问题的系统。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/doc-qa-system.ts
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';

class DocQASystem {
  private retriever: any;
  private chain: any;

  async init(docsPath: string) {
    // 1. 加载文档
    console.log('📂 加载文档...');
    const loader = new DirectoryLoader(docsPath, {
      '.md': (path) => new TextLoader(path),
    });
    const docs = await loader.load();
    console.log(`  加载了 ${docs.length} 个文件`);

    // 2. 分块
    console.log('✂️ 分块...');
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });
    const chunks = await splitter.splitDocuments(docs);
    console.log(`  分成 ${chunks.length} 个块`);

    // 3. 创建向量存储
    console.log('🔢 生成向量...');
    const embeddings = new OpenAIEmbeddings();
    const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);
    this.retriever = vectorStore.asRetriever({ k: 3 });

    // 4. 构建 RAG 链
    const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `基于以下文档回答问题。引用文档中的具体内容来支持你的回答。
如果文档中没有答案，说"文档中未找到相关信息"。

文档：
{context}`],
      ['user', '{question}'],
    ]);

    this.chain = RunnableSequence.from([
      {
        context: this.retriever.pipe((docs: any[]) =>
          docs.map((d, i) => `[${i + 1}] ${d.pageContent}`).join('\n\n')
        ),
        question: new RunnablePassthrough(),
      },
      prompt,
      model,
      new StringOutputParser(),
    ]);

    console.log('✅ 初始化完成！\n');
  }

  async ask(question: string): Promise<string> {
    return this.chain.invoke(question);
  }
}

// 使用
const qa = new DocQASystem();
await qa.init('./data/blogs');

const questions = [
  'Vue 3 的 Composition API 和 Options API 有什么区别？',
  '如何优化 React 应用的性能？',
  'TypeScript 泛型怎么用？',
];

for (const q of questions) {
  console.log(`❓ ${q}`);
  const answer = await qa.ask(q);
  console.log(`💡 ${answer}\n`);
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：多查询检索

```typescript
// 用 LLM 生成多个搜索查询，提高召回率
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';

const model = new ChatAnthropic({ modelName: 'claude-haiku-4-5-20251001' });

const multiQueryPrompt = ChatPromptTemplate.fromTemplate(
  `给定以下用户问题，生成 3 个不同角度的搜索查询来检索相关文档。
用换行分隔，不要编号。

用户问题：{question}

搜索查询：`
);

const queryChain = multiQueryPrompt.pipe(model).pipe(new StringOutputParser());

async function multiQueryRetrieve(question: string) {
  // 生成多个查询
  const queriesText = await queryChain.invoke({ question });
  const queries = queriesText.split('\n').filter(q => q.trim());

  console.log('🔍 生成的查询:');
  queries.forEach(q => console.log(`  - ${q}`));

  // 对每个查询执行检索
  const allResults = await Promise.all(
    queries.map(q => retriever.invoke(q))
  );

  // 去重合并
  const seen = new Set<string>();
  const uniqueDocs = allResults.flat().filter(doc => {
    const key = doc.pageContent.slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return uniqueDocs.slice(0, 5);  // 返回前 5 个
}
```

### 技巧二：持久化向量存储

```typescript
// 将向量存储保存到磁盘，避免每次启动都重新计算
import { MemoryVectorStore } from 'langchain/vectorstores/memory';

// 保存
const serialized = await vectorStore.serialize();  // 序列化为 JSON
fs.writeFileSync('./vector-store.json', JSON.stringify(serialized));

// 加载
const data = JSON.parse(fs.readFileSync('./vector-store.json', 'utf-8'));
const restoredStore = await MemoryVectorStore.deserialize(data, embeddings);
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Retriever 和单纯的向量搜索有什么区别？**

> A：Retriever 是一个更高层的抽象。它不仅支持向量相似度搜索（通过 VectorStore），还支持 MMR（最大边际相关性）增加结果多样性、多查询检索（生成多个角度的问题分别搜索）等高级策略。Retriever 封装了这些复杂性，对外提供统一的 `getRelevantDocuments()` 接口。

**Q2：文本分块（chunking）时如何选择 chunk_size 和 chunk_overlap？**

> A：chunk_size 取决于 LLM 的上下文窗口和检索精度要求。较小的块（200-500 字符）检索精度更高，但单个块可能缺少上下文。较大的块（1000-2000 字符）上下文更完整，但检索精度会下降。chunk_overlap 通常设为 chunk_size 的 10-20%，确保边界信息不会丢失。

**Q3：为什么需要多查询检索（Multi-Query Retrieval）？**

> A：用户的原始问题可能措辞不精确，导致向量搜索找不到相关文档。多查询检索利用 LLM 从不同角度生成多个相关问题，分别检索后合并结果，显著提高召回率。例如「怎么安装」可能扩展到「安装步骤」、「环境配置」、「依赖管理」等多个维度。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 检索结果不相关 | chunkSize 太大，混合了不同主题 | 减小 chunkSize 到 300-500 |
| 检索到重复内容 | chunkOverlap 太大 | 减小 overlap，或使用 MMR 检索 |
| Embedding 调用超时 | 文档太多，API 限流 | 分批处理，添加延迟 |
| 内存不足（MemoryVectorStore） | 文档量太大 | 改用持久化向量数据库（ChromaDB/Pinecone） |

---

## 📝 本章小结

- ✅ **TextSplitter** — 将长文档切成小块，`RecursiveCharacterTextSplitter` 最常用
- ✅ **向量存储** — MemoryVectorStore（开发） / Pinecone/ChromaDB（生产）
- ✅ **检索策略** — 相似度检索、MMR（多样性）、带过滤的检索
- ✅ **RAG 链** — Retriever + Prompt + LLM，用 LCEL 串联
- ✅ **多查询检索** — 用 LLM 生成多个搜索查询提高召回率

## ➡️ 下一章预告

> 在下一章中，我们将学习 LangChain 的 Callbacks 系统——如何监控链的执行过程、集成 LangSmith 进行调试。
> [第6章：Callbacks 与调试](./06-callbacks.md)
