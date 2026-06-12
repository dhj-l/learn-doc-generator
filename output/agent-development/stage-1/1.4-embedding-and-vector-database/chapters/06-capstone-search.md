# 第6章：综合实战 — 构建语义搜索系统

> 预计学习时间：120-150 分钟

## 🎯 本章目标

综合运用前五章知识，构建一个完整的语义搜索系统。

---

## 🔨 项目实现

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

### 运行效果

```
🔍 搜索: "前端框架的新特性"

1. [0.892] React 18 引入了并发渲染特性，包括 useDeferredValue、useTransition...
   来源: React 官方博客

2. [0.856] Vue 3 引入了 Composition API，提供了 ref、reactive、computed...
   来源: Vue.js 文档

3. [0.321] Docker 是一个开源的容器化平台...
   来源: Docker 文档

❓ 问题: React 18 有什么新特性？

💡 回答: React 18 引入了并发渲染特性，主要新增了 useDeferredValue 和 useTransition 等 API。这些特性允许 React 中断和恢复渲染任务，从而保持用户界面的响应性 [来源 1]。

📚 参考来源:
  - React 官方博客
```

---

## 📝 本章小结

- ✅ **完整搜索系统** — 文档摄入 → 分块 → 存储 → 检索 → RAG 问答
- ✅ **混合检索** — 语义搜索 + 元数据过滤
- ✅ **RAG 问答** — 检索 + 生成的完整管线

## ➡️ 下一步

查看附录：[速查表](../appendix/cheatsheet.md) | [排错指南](../appendix/troubleshooting.md)

然后进入 [阶段 2：Agent 核心技术](../../stage-2/README.md)
