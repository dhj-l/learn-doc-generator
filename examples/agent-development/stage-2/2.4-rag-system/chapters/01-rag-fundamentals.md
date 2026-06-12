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

```
✅ 已索引 3 个文档
```

## 🔨 实战演练

**场景描述：**
你正在为公司构建一个内部知识库问答机器人。公司有产品文档（Markdown 格式）、技术规范（PDF）和会议纪要（纯文本）三种文档类型。你需要实现一个基础的 RAG 系统，让员工可以用自然语言查询这些文档。

**你的任务：**
1. 设计一个统一的文档加载器，支持三种文档格式
2. 实现一个递归分块策略，对不同文档类型采用不同 chunk_size
3. 使用 ChromaDB 存储并实现向量检索
4. 编写一个完整的 `query(question)` 函数，返回答案和引用来源

<details>
<summary>💡 参考实现要点</summary>

```typescript
// 提示：你的实现应包含以下结构
interface Document { content: string; metadata: { source: string; type: string } }

class CompanyRAG {
  async loadDocuments(files: string[]): Promise<Document[]> { /* 不同格式用不同加载器 */ }
  async ingest(docs: Document[]) { /* 分块 → Embedding → 存入 ChromaDB */ }
  async query(question: string) { /* 检索 → 构建 Prompt → LLM 生成 → 返回带引用的答案 */ }
}
```

**检验标准：**
- 对产品相关的问题，能准确返回对应的文档段落
- 对知识库中没有的问题，能如实告知而非编造
- 每个答案都标注了引用来源（文档名称 + 段落位置）
</details>

---

## ⚡ 进阶技巧

### 1. 动态 chunk_size 调整

根据文档类型动态选择分块大小，而不是一刀切：

```typescript
function getOptimalChunkSize(docType: string): number {
  const config = {
    'code': 300,      // 代码文档，小块保留上下文
    'prose': 1000,    // 散文/文章，大块保留语义
    'conversation': 200, // 对话记录，小块更好
  };
  return config[docType] || 500;
}
```

### 2. 元数据过滤提升检索精度

在向量检索时利用元数据过滤，大幅减少无关结果：

```typescript
async function filteredRetrieve(query: string, filters: Record<string, any>) {
  return await collection.query({
    queryTexts: [query],
    nResults: 5,
    where: filters,  // e.g. { category: "技术文档", date: { $gte: "2024-01-01" } }
  });
}
```

### 3. Prompt 中嵌入检索来源

在生成阶段让 LLM 明确引用来源，增强可信度：

```typescript
const systemPrompt = `你是一个基于知识库的问答助手。
请根据以下参考文档回答问题，并在每句话末尾用 [来源: 文档标题] 标注出处。
如果文档中没有相关信息，请说"知识库中未找到相关信息"。

参考文档：
${context}`;
```

## 🧠 知识检查点

1. **RAG 的三个核心阶段是什么？**

<details>
<summary>点击展开答案</summary>

**索引阶段（Indexing）** — 加载文档、分块、生成 Embedding、存入向量数据库
**检索阶段（Retrieval）** — 用户问题转向量、向量相似度搜索、返回 Top-K 结果
**生成阶段（Generation）** — 构建 Prompt（问题 + 检索结果）、LLM 生成回答
</details>

2. **RAG 解决了传统 LLM 的哪些问题？**

<details>
<summary>点击展开答案</summary>

1. **知识过时** — LLM 的训练数据有截止日期，RAG 可以检索最新文档
2. **幻觉** — 基于检索到的真实文档生成回答，减少编造
3. **领域知识不足** — 将企业内部文档/私有知识作为检索源，无需微调模型
</details>

3. **什么是 Top-K 检索，K 值如何影响结果？**

<details>
<summary>点击展开答案</summary>

Top-K 检索是指从向量数据库中返回与查询最相似的 K 个文档片段。K 值过小可能漏掉相关信息（降低召回率），K 值过大则可能引入噪声（降低精确率）。实践中 K=3~5 通常效果最佳，但需要根据文档分块大小和任务类型调整。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 检索结果与问题无关 | Embedding 模型不适合中文/领域 | 使用领域专用的 Embedding 模型（如 BGE、m3e），或对检索结果做重排序 |
| LLM 忽略检索结果 | Prompt 没有强调必须基于文档回答 | 在 System Prompt 中明确指示"只能基于以下文档回答"，并设置拒绝回答的兜底策略 |
| 回答内容过长/截断 | 检索结果拼接后超出 LLM 上下文窗口 | 限制 Top-K 数量（3-5 个），对检索结果做摘要压缩，或使用支持更长上下文的模型 |


## 📝 本章小结

- ✅ **RAG 定义** — 检索增强生成，让 LLM 基于外部知识回答
- ✅ **三阶段** — Indexing（索引）→ Retrieval（检索）→ Generation（生成）
- ✅ **核心价值** — 解决 LLM 知识过时、幻觉、领域知识不足的问题

## ➡️ 下一章预告

> [第2章：文档处理管线](./02-document-processing.md)
