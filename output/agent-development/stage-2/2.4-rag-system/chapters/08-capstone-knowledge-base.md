# 第8章：综合实战 — 企业知识库问答系统

> 预计学习时间：120-150 分钟

## 🔨 完整实现

```typescript
// src/enterprise-rag.ts
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ChromaClient } from 'chromadb';

const anthropic = new Anthropic();
const openai = new OpenAI();
const chroma = new ChromaClient();

class EnterpriseKnowledgeBase {
  private collection: any;

  async init() {
    this.collection = await chroma.getOrCreateCollection({ name: 'enterprise-kb' });
  }

  // 文档摄入
  async ingestDocuments(docs: Array<{ id: string; content: string; category: string }>) {
    for (const doc of docs) {
      const chunks = this.chunk(doc.content, 500, 50);
      await this.collection.add({
        ids: chunks.map((_, i) => `${doc.id}-${i}`),
        documents: chunks,
        metadatas: chunks.map(() => ({ category: doc.category, source: doc.id })),
      });
    }
  }

  // 检索
  async retrieve(query: string, category?: string) {
    return this.collection.query({
      queryTexts: [query],
      nResults: 5,
      where: category ? { category } : undefined,
    });
  }

  // 问答
  async ask(question: string): Promise<string> {
    // 1. Query 改写
    const expandedQueries = await this.expandQuery(question);

    // 2. 多查询检索
    const allResults = [];
    for (const q of [question, ...expandedQueries]) {
      const results = await this.retrieve(q);
      allResults.push(...(results.documents?.[0] || []));
    }
    const uniqueDocs = [...new Set(allResults)].slice(0, 5);

    // 3. 生成回答
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 2000,
      system: `你是公司内部知识库助手。基于以下文档回答员工问题。
如果文档中没有相关信息，请如实说明，并建议联系相关部门。

知识库文档：
${uniqueDocs.map((d, i) => `[${i + 1}] ${d}`).join('\n\n')}`,
      messages: [{ role: 'user', content: question }],
    });

    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  private async expandQuery(query: string): Promise<string[]> {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: `将以下查询改写为 2 个不同的搜索版本：${query}\n输出 JSON: {"q": ["...","..."]}` }],
    });
    try { return JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '{"q":[]}').q; }
    catch { return []; }
  }

  private chunk(text: string, size: number, overlap: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += size - overlap) chunks.push(text.slice(i, i + size));
    return chunks;
  }
}
```

---

## 📝 本章小结

- ✅ **企业知识库** — 完整的 RAG 系统实现
- ✅ **Query 扩展** — 多查询检索提高召回率
- ✅ **分类过滤** — 按部门/类别过滤检索结果
- ✅ **兜底策略** — 找不到答案时建议联系相关部门

## ➡️ 下一步

查看附录，然后进入 [2.5 Prompt 注入与安全](../../2.5-prompt-injection-and-safety/README.md)
