# 第4章：高级 RAG 技术 — 超越基础 RAG

> 预计学习时间：90-120 分钟

## 💡 高级 RAG 技术

### Query 改写与扩展

```typescript
// 用 LLM 改写用户的查询，使其更适合检索
async function rewriteQuery(originalQuery: string): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 500,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: `将以下查询改写为 3 个不同的搜索查询，使它们更适合检索：

原始查询：${originalQuery}

输出 JSON：
{"queries": ["改写1", "改写2", "改写3"]}`
    }],
  });

  return JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '{"queries":[]}').queries;
}
```

### Self-RAG

```typescript
// Self-RAG：让 LLM 自己判断是否需要检索，以及检索结果是否有用
async function selfRAG(question: string) {
  // 1. 判断是否需要检索
  const needRetrieve = await judgeNeedRetrieve(question);
  if (!needRetrieve) {
    return await directAnswer(question);
  }

  // 2. 检索
  const docs = await retrieve(question);

  // 3. 判断检索结果是否相关
  const relevantDocs = await judgeRelevance(question, docs);

  // 4. 生成回答
  const answer = await generateAnswer(question, relevantDocs);

  // 5. 自我验证
  const isSupported = await verifyAnswer(answer, relevantDocs);

  return { answer, isSupported };
}
```

### Corrective-RAG (CRAG)

```typescript
// CRAG：检查检索结果质量，必要时回退到 Web 搜索
async function correctiveRAG(question: string) {
  const docs = await retrieve(question);
  const quality = await assessRetrievalQuality(question, docs);

  if (quality === 'high') {
    return await generateWithDocs(question, docs);
  } else if (quality === 'low') {
    // 回退到 Web 搜索
    const webResults = await webSearch(question);
    return await generateWithDocs(question, webResults);
  } else {
    // 混合使用
    const webResults = await webSearch(question);
    return await generateWithDocs(question, [...docs, ...webResults]);
  }
}
```

---

## 📝 本章小结

- ✅ **Query 改写** — 用 LLM 将用户问题转化为更适合检索的形式
- ✅ **Self-RAG** — 让 LLM 自主判断是否需要检索、结果是否相关
- ✅ **Corrective-RAG** — 检索质量低时自动回退到 Web 搜索
