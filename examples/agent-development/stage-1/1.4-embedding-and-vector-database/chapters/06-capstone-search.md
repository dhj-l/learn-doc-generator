# 第6章：综合实战 — 构建语义搜索系统

> 预计学习时间：120-150 分钟

## 🎯 本章目标

综合运用前五章知识，构建一个完整的语义搜索系统，包含文档摄入、向量检索、RAG 问答的完整管线。

## 📋 前置知识

> 建议按顺序完成前五章内容：
> - [第1章：Embedding 基础](./01-embedding-basics.md) — 理解向量化原理
> - [第2章：Embedding 模型](./02-embedding-models.md) — 模型选型
> - [第3章：ChromaDB 实战](./03-chromadb.md) — 向量数据库操作
> - [第4章：Pinecone 与 Milvus](./04-pinecone-milvus.md) — 扩展知识
> - [第5章：高级检索策略](./05-advanced-search.md) — 检索优化

---

## 💡 核心概念

### 概念一：语义搜索系统的三阶段管线

**生活类比：** 语义搜索系统就像一个图书馆的自动化系统——第一步是「收书」（摄入文档），第二步是「编目上架」（向量化+存储），第三步是「查目录找书」（检索+回答）。

```
文档摄入 (Ingest) ──► 向量化存储 (Index) ──► 检索回答 (Search)
    │                       │                       │
    ├ 读取文档              ├ 分块                  ├ 语义检索
    ├ 格式解析              ├ 生成 Embedding        ├ 重排序
    └ 元数据提取            └ 存入向量数据库         └ RAG 问答
```

### 概念二：RAG 问答的「先检索再生成」模式

语义搜索的最终目的不是「显示相关文档」，而是「让 AI 基于这些文档回答问题」。这就是 RAG（检索增强生成）。

> **💡 为什么不是直接让 AI 回答？** 直接让 AI 回答靠的是模型训练时「记住」的知识（可能过时、不准确）。RAG 先把相关文档检索出来，再让 AI「阅读」文档后回答——答案有来源、可验证、及时更新。

---

## 🔨 实战演练

### 项目架构

```
semantic-search/
├── src/
│   ├── index.ts          # 入口 + API 接口
│   ├── ingester.ts       # 文档摄入管线
│   ├── searcher.ts       # 检索引擎
│   ├── chunker.ts        # 文档分块器
│   └── models.ts         # 数据模型
├── data/                 # 测试数据
└── package.json
```

### 核心实现

<details>
<summary>🧑‍💻 先自己实现语义搜索的核心逻辑，再展开看参考答案</summary>

```typescript
// src/searcher.ts
import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';

const openai = new OpenAI();
const chroma = new ChromaClient();

interface SearchResult {
  id: string;
  content: string;
  score: number;
  source: string;
  chunkIndex: number;
}

class SemanticSearchEngine {
  private collection: any;

  async init(collectionName: string = 'documents') {
    this.collection = await chroma.getOrCreateCollection({
      name: collectionName,
    });
  }

  // 文档摄入
  async ingest(documents: Array<{
    id: string;
    content: string;
    metadata?: Record<string, any>;
  }>) {
    for (const doc of documents) {
      const chunks = this.chunkText(doc.content, 500, 50);
      const ids = chunks.map((_, i) => `${doc.id}_chunk_${i}`);
      const metadatas = chunks.map((_, i) => ({
        ...doc.metadata,
        parentId: doc.id,
        source: doc.metadata?.source || doc.id,
        chunkIndex: i,
      }));

      await this.collection.add({
        ids,
        documents: chunks,
        metadatas,
      });
    }

    console.log(`✅ 已摄入 ${documents.length} 个文档`);
  }

  // 搜索
  async search(
    query: string,
    options: { topK?: number; filter?: any } = {}
  ): Promise<SearchResult[]> {
    const results = await this.collection.query({
      queryTexts: [query],
      nResults: options.topK || 5,
      where: options.filter,
    });

    return results.documents[0].map((doc: string, i: number) => ({
      id: results.ids[0][i],
      content: doc,
      score: 1 - (results.distances?.[0][i] || 0),
      source: results.metadatas?.[0][i]?.source || '',
      chunkIndex: results.metadatas?.[0][i]?.chunkIndex || 0,
    }));
  }

  // RAG 问答
  async ask(question: string, options: { topK?: number; model?: string } = {}): Promise<{
    answer: string;
    sources: SearchResult[];
  }> {
    // 1. 检索相关文档
    const sources = await this.search(question, { topK: options.topK || 3 });

    // 2. 构建上下文
    const context = sources
      .map((s, i) => `[来源 ${i + 1}] ${s.content}`)
      .join('\n\n');

    // 3. 生成回答
    const response = await openai.chat.completions.create({
      model: options.model || 'gpt-4o',
      max_tokens: 1000,
      messages: [
        {
          role: 'system',
          content: `基于以下参考资料回答问题。如果资料不足，如实说明。
引用时使用 [来源 N] 标记。

参考资料：
${context}`,
        },
        { role: 'user', content: question },
      ],
    });

    return {
      answer: response.choices[0].message.content || '',
      sources,
    };
  }

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

// 使用示例
async function main() {
  const engine = new SemanticSearchEngine();
  await engine.init('tech-kb');

  // 摄入文档
  await engine.ingest([
    {
      id: 'react-18',
      content: 'React 18 引入了并发渲染特性，包括 useDeferredValue、useTransition 等新 API。并发渲染允许 React 中断和恢复渲染任务，从而保持用户界面的响应性。',
      metadata: { source: 'React 官方博客', category: 'frontend' },
    },
    {
      id: 'vue-3',
      content: 'Vue 3 引入了 Composition API，提供了 ref、reactive、computed 等函数式 API。相比 Options API，Composition API 提供了更好的逻辑复用能力。',
      metadata: { source: 'Vue.js 文档', category: 'frontend' },
    },
    {
      id: 'docker-intro',
      content: 'Docker 是一个开源的容器化平台，允许开发者将应用及其依赖打包到一个可移植的容器中。Dockerfile 定义了构建镜像的步骤。',
      metadata: { source: 'Docker 文档', category: 'devops' },
    },
  ]);

  // 语义搜索
  console.log('🔍 搜索: "前端框架的新特性"\n');
  const results = await engine.search('前端框架的新特性');
  results.forEach((r, i) => {
    console.log(`${i + 1}. [${r.score.toFixed(3)}] ${r.content.substring(0, 80)}...`);
    console.log(`   来源: ${r.source}\n`);
  });

  // RAG 问答
  console.log('❓ 问题: React 18 有什么新特性？\n');
  const answer = await engine.ask('React 18 有什么新特性？');
  console.log('💡 回答:', answer.answer);
  console.log('\n📚 参考来源:');
  answer.sources.forEach(s => console.log(`  - ${s.source}`));
}

main().catch(console.error);
```

**预期输出：**
```
🔍 搜索: "前端框架的新特性"

1. [0.892] React 18 引入了并发渲染特性，包括 useDeferredValue、useTransition...
   来源: React 官方博客

2. [0.856] Vue 3 引入了 Composition API，提供了 ref、reactive、computed...
   来源: Vue.js 文档

3. [0.321] Docker 是一个开源的容器化平台...
   来源: Docker 文档

❓ 问题: React 18 有什么新特性？

💡 回答: React 18 引入了并发渲染特性，主要新增了 useDeferredValue 和 useTransition 等 API...
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：添加混合检索（语义 + 关键词）

纯语义检索对专有名词（如"useDeferredValue"）的精确匹配不够好。混合检索结合关键词 BM25 和语义向量：

```typescript
async function hybridSearch(query: string, topK = 5) {
  // 1. 语义检索
  const semanticResults = await semanticSearch(query, topK * 2);
  // 2. 关键词检索（精确匹配）
  const keywordResults = await keywordSearch(query, topK * 2);
  // 3. 合并去重（RRF 策略）
  return reciprocalRankFusion([semanticResults, keywordResults], topK);
}
```

### 技巧二：文档更新时只重新索引变更部分

```typescript
class IncrementalIndexer {
  private indexedHashes = new Map<string, string>();

  async sync(documents: Document[]) {
    for (const doc of documents) {
      const hash = await this.contentHash(doc);
      if (this.indexedHashes.get(doc.id) === hash) continue; // 未变更，跳过
      await this.reindexDocument(doc); // 只重新索引变更的文档
      this.indexedHashes.set(doc.id, hash);
    }
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么语义搜索系统需要「分块」（chunking）步骤？**

> A：因为 LLM 和 Embedding 模型都有输入长度限制。一篇文档可能包含数万 Token，不能整体向量化。分块将长文档切分为「有意义的片段」，每个片段单独向量化，检索时以片段为单位匹配查询。

**Q2：RAG 问答中，检索和生成哪个步骤更容易出问题？**

> A：检索更关键——如果检索结果不相关，再好的生成模型也没法给出正确答案。80% 的 RAG 质量问题是检索环节造成的（选错了分块策略、Embedding 模型不匹配、topK 太小）。生成环节的问题（幻觉、回答不完整）通常可以通过优化 Prompt 解决。

**Q3：search() 方法中 score = 1 - distance 的含义是什么？**

> A：ChromaDB 返回的 distance 是「距离」——越小越相似。将其转换为 score（1 - distance）后，值越大表示越相关，符合直觉（0-1 之间，1 为完美匹配）。这在显示结果时比直接展示 "distance 0.108" 更容易理解。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 检索到不相关的结果 | Embedding 模型不适合当前语言/领域 | 中文场景用 BGE-M3 或 BGE-large-zh；尝试混合检索 |
| RAG 回答没有引用来源 | 生成的 Prompt 没有要求引用 | 在 System Prompt 中加入「请使用 [来源 N] 标记引用」 |
| 文档更新后搜索结果仍是旧的 | 向量数据库未与文档源同步 | 实现增量索引，文档变更时自动重新索引 |
| 检索结果中排名靠前的内容反而不相关 | 纯语义检索对精确匹配不够好 | 添加 BM25 关键词检索，与语义检索混合（RRF 合并） |
| 过大文档导致 Embedding API 超时 | 输入超过了模型的最大长度 | 在分块时确保每块不超过模型的最大 Token 限制（如 8192）|

---

## 📝 本章小结

- ✅ **完整搜索系统** — 文档摄入 → 分块 → 存储 → 检索 → RAG 问答
- ✅ **混合检索** — 语义搜索 + 关键词搜索互补
- ✅ **RAG 问答** — 检索 + 生成的完整管线
- ✅ **增量索引** — 只重新索引变更的文档，避免全量重建

## ➡️ 下一步

查看附录：[速查表](../appendix/cheatsheet.md) | [排错指南](../appendix/troubleshooting.md)

然后进入 [阶段 2：Agent 核心技术](../../stage-2/README.md)
