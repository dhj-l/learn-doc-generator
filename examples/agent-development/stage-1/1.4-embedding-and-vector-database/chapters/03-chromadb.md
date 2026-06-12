# 第3章：ChromaDB 实战 — 轻量级本地向量数据库

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 ChromaDB 存储和检索向量** — 快速搭建本地向量数据库
- **管理 Collection 和 Document** — 组织和管理向量数据
- **实现带元数据过滤的搜索** — 结合语义搜索和结构化过滤

## 📋 前置知识

> 建议先完成：[第1章：Embedding 基础](./01-embedding-basics.md)

---

## 💡 核心概念

### 概念一：为什么需要向量数据库？

**生活类比：** 如果 Embedding 是把书按照主题放在书架上的方法，那向量数据库就是**图书管理员**——它知道每本书放在哪里，能快速帮你找到最相关的书。

```
没有向量数据库：
  每次搜索 → 计算查询向量与所有文档的相似度 → O(n) 复杂度
  文档少时没问题，但如果有 100 万文档，每次搜索要算 100 万次

有向量数据库：
  建立索引 → 搜索时只检查一小部分候选 → O(log n) 复杂度
  100 万文档中毫秒级返回 Top-K 结果
```

### 概念二：ChromaDB 快速上手

```bash
# 安装 ChromaDB（Node.js 版本）
npm install chromadb
npm install chromadb-default-embed  # 默认 Embedding 函数
```

```typescript
// src/01-chroma-basics.ts
import { ChromaClient } from 'chromadb';

async function basicUsage() {
  // 1. 创建客户端（本地模式）
  const client = new ChromaClient();

  // 2. 创建/获取 Collection（类似数据库中的表）
  const collection = await client.getOrCreateCollection({
    name: 'my-documents',
    metadata: { description: '我的文档集合' },
  });

  // 3. 添加文档（ChromaDB 会自动生成 Embedding）
  await collection.add({
    ids: ['doc-1', 'doc-2', 'doc-3', 'doc-4'],
    documents: [
      'React 是一个用于构建用户界面的 JavaScript 库',
      'Vue.js 是一个渐进式 JavaScript 框架',
      'Docker 是一个容器化平台，用于打包和部署应用',
      'TypeScript 为 JavaScript 添加了静态类型系统',
    ],
    metadatas: [
      { category: 'frontend', year: 2013 },
      { category: 'frontend', year: 2014 },
      { category: 'devops', year: 2013 },
      { category: 'language', year: 2012 },
    ],
  });

  // 4. 语义搜索
  const results = await collection.query({
    queryTexts: ['前端开发框架'],
    nResults: 3,
  });

  console.log('🔍 搜索: "前端开发框架"\n');
  results.documents[0].forEach((doc, i) => {
    const distance = results.distances?.[0][i] || 0;
    console.log(`${i + 1}. ${doc}`);
    console.log(`   距离: ${distance.toFixed(4)}\n`);
  });
}

basicUsage();
```

```
预期输出：
🔍 搜索: "前端开发框架"

1. Vue.js 是一个渐进式 JavaScript 框架
   距离: 0.3421

2. React 是一个用于构建用户界面的 JavaScript 库
   距离: 0.3856

3. TypeScript 为 JavaScript 添加了静态类型系统
   距离: 0.8234
```

### 概念三：带过滤的搜索

```typescript
// src/02-filtered-search.ts
import { ChromaClient } from 'chromadb';

async function filteredSearch() {
  const client = new ChromaClient();
  const collection = await client.getOrCreateCollection({ name: 'tech-docs' });

  // 添加带元数据的文档
  await collection.add({
    ids: Array.from({ length: 6 }, (_, i) => `doc-${i}`),
    documents: [
      'React 18 引入了并发渲染特性',
      'Vue 3 使用 Composition API',
      'Docker Compose 用于多容器编排',
      'Next.js 14 支持 Server Components',
      'Nginx 作为反向代理服务器',
      'Nuxt 3 基于 Vue 的全栈框架',
    ],
    metadatas: [
      { category: 'frontend', difficulty: 'intermediate' },
      { category: 'frontend', difficulty: 'beginner' },
      { category: 'devops', difficulty: 'intermediate' },
      { category: 'frontend', difficulty: 'advanced' },
      { category: 'devops', difficulty: 'beginner' },
      { category: 'frontend', difficulty: 'intermediate' },
    ],
  });

  // 搜索 + 元数据过滤
  const results = await collection.query({
    queryTexts: ['构建 Web 应用'],
    nResults: 3,
    where: { category: 'frontend' },  // 只搜索前端相关的文档
  });

  console.log('🔍 "构建 Web 应用"（仅前端）:');
  results.documents[0].forEach((doc, i) => {
    console.log(`  ${i + 1}. ${doc}`);
  });

  // 复合过滤
  const advancedFrontend = await collection.query({
    queryTexts: ['框架和工具'],
    nResults: 2,
    where: {
      $and: [
        { category: 'frontend' },
        { difficulty: 'advanced' },
      ],
    },
  });

  console.log('\n🔍 "框架和工具"（前端 + 高级）:');
  advancedFrontend.documents[0].forEach((doc, i) => {
    console.log(`  ${i + 1}. ${doc}`);
  });
}

filteredSearch();
```

### 概念四：文档的增删改查

```typescript
// src/03-crud.ts
import { ChromaClient } from 'chromadb';

async function documentCRUD() {
  const client = new ChromaClient();
  const collection = await client.getOrCreateCollection({ name: 'crud-demo' });

  // 添加
  await collection.add({
    ids: ['item-1', 'item-2'],
    documents: ['文档一', '文档二'],
    metadatas: [{ status: 'active' }, { status: 'active' }],
  });

  // 更新
  await collection.update({
    ids: ['item-1'],
    documents: ['文档一（已更新）'],
    metadatas: [{ status: 'updated' }],
  });

  // 获取
  const item = await collection.get({ ids: ['item-1'] });
  console.log('获取:', item.documents);

  // 删除
  await collection.delete({ ids: ['item-2'] });

  // 统计
  const count = await collection.count();
  console.log('文档数量:', count);
}
```

---

## 🔨 实战演练

### 练习：构建一个知识库问答系统

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';

const openai = new OpenAI();

class KnowledgeBase {
  private client: ChromaClient;
  private collection: any;

  async init(collectionName: string) {
    this.client = new ChromaClient();
    this.collection = await this.client.getOrCreateCollection({ name: collectionName });
  }

  // 添加知识文档
  async addKnowledge(documents: Array<{ id: string; content: string; source: string }>) {
    await this.collection.add({
      ids: documents.map(d => d.id),
      documents: documents.map(d => d.content),
      metadatas: documents.map(d => ({ source: d.source })),
    });
  }

  // 知识检索
  async retrieve(question: string, topK: number = 3) {
    const results = await this.collection.query({
      queryTexts: [question],
      nResults: topK,
    });

    return results.documents[0].map((doc: string, i: number) => ({
      content: doc,
      source: results.metadatas?.[0][i]?.source,
      distance: results.distances?.[0][i],
    }));
  }

  // 生成回答（RAG 模式）
  async ask(question: string): Promise<string> {
    // 1. 检索相关知识
    const relevantDocs = await this.retrieve(question, 3);

    // 2. 构建上下文
    const context = relevantDocs
      .map((doc, i) => `[${i + 1}] ${doc.content}（来源: ${doc.source}）`)
      .join('\n\n');

    // 3. 让 LLM 基于检索到的知识回答
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1000,
      messages: [
        {
          role: 'system',
          content: `你是一个技术问答助手。基于以下参考资料回答问题。
如果参考资料中没有相关信息，如实说明。
回答时引用来源编号 [1][2][3]。

参考资料：
${context}`,
        },
        { role: 'user', content: question },
      ],
    });

    return response.choices[0].message.content || '';
  }
}

// 使用
async function main() {
  const kb = new KnowledgeBase();
  await kb.init('tech-knowledge');

  await kb.addKnowledge([
    { id: '1', content: 'React 18 引入了并发渲染，允许中断和恢复渲染任务', source: 'React 官方文档' },
    { id: '2', content: 'Vue 3 的 Composition API 提供了更好的逻辑复用能力', source: 'Vue.js 官方文档' },
    { id: '3', content: 'Next.js App Router 使用 React Server Components 作为基础', source: 'Next.js 文档' },
  ]);

  const answer = await kb.ask('React 的并发渲染是什么？');
  console.log('❓ 问题: React 的并发渲染是什么？');
  console.log('💡 回答:', answer);
}

main();
```

</details>

---

## 📝 本章小结

- ✅ **ChromaDB** — 轻量级本地向量数据库，零配置即可使用
- ✅ **Collection** — 文档的集合，类似数据库的表
- ✅ **元数据过滤** — 结合语义搜索和结构化过滤
- ✅ **知识库问答** — 用 ChromaDB + LLM 实现 RAG

## ➡️ 下一章预告

> [第4章：Pinecone 与 Milvus](./04-pinecone-milvus.md) — 生产级向量数据库方案。
