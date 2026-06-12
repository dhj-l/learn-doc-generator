# 第8章：综合实战 — 企业知识库问答系统

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **构建完整的企业级 RAG 系统** — 从文档摄入到问答生成的端到端实现
- **实现多查询扩展** — 用 LLM 改写用户问题，提高召回率
- **支持分类过滤** — 按部门/类别对检索结果做精细过滤
- **整合所有前七章的技术** — 文档处理、检索策略、高级 RAG、多模态、评估与优化

## 📋 前置知识

> 建议先完成：[第1章 ~ 第7章](./01-rag-fundamentals.md) — 本章是综合实战，整合所有前序知识

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

## ⚡ 进阶技巧

### 1. 批量文档摄入与进度追踪

企业级系统中可能一次摄入数千个文档，需要进度反馈和错误隔离：

```typescript
async function bulkIngest(docs: Array<{ id: string; content: string; category: string }>, onProgress: (pct: number) => void) {
  const BATCH_SIZE = 10;
  let processed = 0;
  const errors: Array<{ doc: string; error: string }> = [];

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    try {
      await kb.ingestDocuments(batch);
    } catch (e) {
      batch.forEach(d => errors.push({ doc: d.id, error: String(e) }));
    }
    processed += batch.length;
    onProgress(Math.round((processed / docs.length) * 100));
  }
  return { total: docs.length, success: processed - errors.length, errors };
}
```

### 2. 权限感知检索

企业知识库中不同员工只能看到自己权限范围内的文档：

```typescript
async function retrieveWithPermissions(query: string, userRoles: string[], department: string) {
  // 构建元数据过滤条件
  const permissionFilter = {
    $or: [
      { visibility: 'public' },
      { department },
      { roles: { $in: userRoles } },
    ],
  };

  return await collection.query({
    queryTexts: [query],
    nResults: 5,
    where: permissionFilter,
  });
}
```

### 3. 日志审计与监控

记录每次问答的完整链路，便于排查问题和评估效果：

```typescript
async function askWithAudit(question: string, userId: string) {
  const start = Date.now();
  const answer = await kb.ask(question);

  // 写入审计日志
  await auditLog.create({
    userId,
    question,
    answer,
    latency: Date.now() - start,
    timestamp: new Date().toISOString(),
  });

  return answer;
}
```

## 🧠 知识检查点

1. **企业级 RAG 系统与基础 RAG 系统相比，多了哪些关键考量？**

<details>
<summary>点击展开答案</summary>

1. **权限控制** — 不同角色/部门的员工只能访问对应文档
2. **可观测性** — 日志审计、性能监控、告警机制
3. **批量处理** — 支持大规模文档摄入，有进度反馈和错误隔离
4. **高可用** — 向量数据库和 LLM API 的容错和降级策略
5. **安全性** — 防止 Prompt 注入，保护敏感文档不被越权访问
</details>

2. **多查询检索（Multi-Query Retrieval）如何提高召回率？**

<details>
<summary>点击展开答案</summary>

多查询检索将一个用户问题用 LLM 改写为多个不同角度的查询（如同义词替换、拆分子问题、补充上下文）。每个查询独立检索后合并去重。这种方式提高了检索的覆盖面——某一种表述方式漏掉的文档，可能被另一种表述方式覆盖到。实践中通常生成 2-3 个改写版本，与原查询一起检索。
</details>

3. **本章企业知识库的兜底策略是什么？为什么兜底很重要？**

<details>
<summary>点击展开答案</summary>

兜底策略是"如果文档中没有相关信息，如实说明，并建议联系相关部门"。兜底很重要是因为：（1）避免 LLM 编造答案（幻觉）；（2）给用户明确的下一步行动路径；（3）维护系统的可信度，用户知道系统不会随意编造。更完善的兜底还可以记录"未覆盖的问题"用于后续补充知识库。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 多查询检索引入了重复结果 | 多个改写查询检索到同一文档的不同片段 | 在合并结果时按文档来源去重（保留片段但合并引用） |
| 分类过滤导致检索结果为空 | 过滤条件过于严格，或分类与实际文档不匹配 | 添加宽松模式：分类过滤结果不足时，去除分类条件重试 |
| 系统上线后没有日志和监控 | 只关注了功能实现，忽略了可观测性 | 在关键环节（检索、生成、异常）添加结构化日志，设置延迟和错误率告警 |

## 📝 本章小结

- ✅ **企业知识库** — 完整的 RAG 系统实现
- ✅ **Query 扩展** — 多查询检索提高召回率
- ✅ **分类过滤** — 按部门/类别过滤检索结果
- ✅ **兜底策略** — 找不到答案时建议联系相关部门

## ➡️ 下一步

查看附录，然后进入 [2.5 Prompt 注入与安全](../../2.5-prompt-injection-and-safety/README.md)
