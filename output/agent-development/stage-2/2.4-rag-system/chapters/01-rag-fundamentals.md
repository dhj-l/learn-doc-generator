# 第1章：RAG 基础架构 — 检索增强生成

> 预计学习时间：70-90 分钟

## 🎯 本章目标

理解 RAG 的核心架构和工作流程。

## 💡 核心概念

### 什么是 RAG？

**生活类比：** 你是一个学生在考试。RAG 就像开卷考试——你不完全依赖记忆（LLM 的训练数据），而是可以翻阅教材（检索到的文档）来回答问题。

```
传统 LLM：  问题 → LLM → 回答（可能过时或不准确）

RAG：       问题 → 检索相关文档 → 问题 + 文档 → LLM → 回答（基于最新信息）
```

### RAG 三阶段架构

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Indexing   │ →  │  Retrieval  │ →  │  Generation  │
│   索引阶段    │     │   检索阶段   │     │   生成阶段    │
├─────────────┤     ├─────────────┤     ├─────────────┤
│ 加载文档     │     │ 用户提问     │     │ 构建 Prompt  │
│ 分块         │ →  │ 问题转向量   │ →  │ 问题 + 检索  │
│ 生成 Embedding│     │ 向量相似搜索 │     │ 结果 → LLM  │
│ 存入向量数据库│     │ 返回 Top-K   │     │ 生成回答     │
└─────────────┘     └─────────────┘     └─────────────┘
```

### 完整 RAG 实现

```typescript
// src/basic-rag.ts
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ChromaClient } from 'chromadb';

const anthropic = new Anthropic();
const openai = new OpenAI();
const chroma = new ChromaClient();

class BasicRAG {
  private collection: any;

  async init(collectionName: string = 'rag-docs') {
    this.collection = await chroma.getOrCreateCollection({ name: collectionName });
  }

  // ====== 索引阶段 ======

  async ingest(documents: Array<{ id: string; content: string; metadata?: any }>) {
    for (const doc of documents) {
      // 分块
      const chunks = this.chunkText(doc.content, 500, 50);
      const ids = chunks.map((_, i) => `${doc.id}_chunk_${i}`);
      const metadatas = chunks.map((_, i) => ({
        ...doc.metadata,
        parentId: doc.id,
        chunkIndex: i,
      }));

      await this.collection.add({
        ids,
        documents: chunks,
        metadatas,
      });
    }
    console.log(`✅ 已索引 ${documents.length} 个文档`);
  }

  // ====== 检索阶段 ======

  async retrieve(query: string, topK: number = 3) {
    const results = await this.collection.query({
      queryTexts: [query],
      nResults: topK,
    });

    return (results.documents?.[0] || []).map((doc: string, i: number) => ({
      content: doc,
      metadata: results.metadatas?.[0]?.[i],
      score: 1 - (results.distances?.[0]?.[i] || 0),
    }));
  }

  // ====== 生成阶段 ======

  async query(question: string): Promise<{ answer: string; sources: any[] }> {
    // 1. 检索
    const sources = await this.retrieve(question, 3);

    // 2. 构建 Prompt
    const context = sources.map((s, i) => `[${i + 1}] ${s.content}`).join('\n\n');

    // 3. 生成
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 1000,
      system: `你是一个知识库问答助手。基于以下参考文档回答问题。
如果文档中没有相关信息，如实说明。引用时使用 [1][2][3] 标记。

参考文档：
${context}`,
      messages: [{ role: 'user', content: question }],
    });

    return {
      answer: response.content[0].type === 'text' ? response.content[0].text : '',
      sources,
    };
  }

  private chunkText(text: string, size: number, overlap: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += size - overlap) {
      chunks.push(text.slice(i, i + size));
    }
    return chunks;
  }
}
```

---

## 📝 本章小结

- ✅ **RAG 定义** — 检索增强生成，让 LLM 基于外部知识回答
- ✅ **三阶段** — Indexing（索引）→ Retrieval（检索）→ Generation（生成）
- ✅ **核心价值** — 解决 LLM 知识过时、幻觉、领域知识不足的问题

## ➡️ 下一章预告

> [第2章：文档处理管线](./02-document-processing.md)
