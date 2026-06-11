# 第7章：RAG 优化 — 性能与成本

> 预计学习时间：80-100 分钟

## 💡 优化策略

### 性能优化

```typescript
// 1. 缓存频繁查询的结果
const queryCache = new Map<string, string>();

async function cachedQuery(question: string) {
  if (queryCache.has(question)) return queryCache.get(question)!;
  const answer = await ragQuery(question);
  queryCache.set(question, answer);
  return answer;
}

// 2. Embedding 批量处理
async function batchEmbed(texts: string[], batchSize = 100) {
  const results = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    });
    results.push(...response.data);
  }
  return results;
}

// 3. 异步索引新文档
async function asyncIndex(document: string) {
  // 不阻塞主流程，在后台索引
  setImmediate(async () => {
    await ingestDocument(document);
    console.log('文档索引完成');
  });
}
```

### 成本优化

```typescript
// 1. 使用更便宜的 Embedding 模型（本地模型免费）
// 2. 重排序时用小模型（Haiku）
async function cheapRerank(query: string, docs: string[]) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001', // 便宜模型
    max_tokens: 500,
    messages: [{ role: 'user', content: `排序以下文档与查询的相关性：\n查询：${query}\n文档：${docs.join('\n---\n')}` }],
  });
  return response;
}

// 3. Prompt Caching for RAG system prompt
const system = [{
  type: 'text' as const,
  text: `你是一个知识库问答助手。...（很长的系统提示）`,
  cache_control: { type: 'ephemeral' as const },
}];
```

---

## 📝 本章小结

- ✅ **缓存** — 频繁查询结果缓存
- ✅ **批量处理** — Embedding 批量生成
- ✅ **模型分层** — 简单任务用便宜模型
- ✅ **Prompt Caching** — 缓存固定的系统提示
