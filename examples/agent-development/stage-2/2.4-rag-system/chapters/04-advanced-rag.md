# 第4章：高级 RAG 技术 — 超越基础 RAG

> 预计学习时间：90-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **掌握 Query 改写与扩展** — 用 LLM 将用户问题转化为更易检索的形式
- **理解 Self-RAG 架构** — 让 LLM 自主判断是否需要检索及结果是否相关
- **实现 Corrective-RAG** — 检测检索质量并自动回退到 Web 搜索
- **了解其他高级 RAG 技术** — HyDE、Agentic RAG 等前沿方法

## 📋 前置知识

> 建议先完成：[第3章：检索策略](./03-retrieval-strategies.md)

## 💡 核心概念

### 概念一：高级 RAG 技术

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


## 🔨 实战演练

**场景描述：**
你正在构建一个客服知识库 RAG 系统。客服遇到的用户问题多种多样：有的可以直接回答（如"营业时间"），有的需要检索内部文档（如"退货政策"），有的需要查最新信息（如某商品是否有货）。你需要实现一个自适应 RAG 系统。

**你的任务：**
1. 实现一个问题复杂度评估函数（根据长度、关键词、是否含时间敏感词等）
2. 简单问题（如问候、营业时间）→ 直接 LLM 回答
3. 中等问题（如政策查询）→ 基础 RAG + 知识库检索
4. 复杂问题（如商品库存、价格对比）→ 多查询 + Web 回退

<details>
<summary>💡 参考实现要点</summary>

```typescript
function estimateComplexity(question: string): number {
  const simpleKeywords = ['你好', '营业时间', '地址', '电话'];
  const timeSensitive = ['价格', '库存', '促销', '最新'];
  const multiIntent = question.includes('并且') || question.includes('和');

  let score = 0;
  if (simpleKeywords.some(k => question.includes(k))) score -= 2;
  if (timeSensitive.some(k => question.includes(k))) score += 3;
  if (multiIntent) score += 2;
  if (question.length > 50) score += 1;
  return Math.max(0, Math.min(10, score));
}
```

**检验标准：**
- 80% 以上的简单问题不触发检索（节省 Token 和延迟）
- 所有时间敏感问题都走了 Web 搜索路径
- 复杂问题的答案来源包含多个文档引用
</details>

---

## ⚡ 进阶技巧

### 1. HyDE（假设文档嵌入）

HyDE 先用 LLM 根据问题生成一个"假设的完美文档"，再用这个文档的向量去检索真实文档：

```typescript
async function hydeRetrieve(question: string, topK = 3) {
  // 1. 让 LLM 生成一个假设文档
  const hypotheticalDoc = await anthropic.messages.create({
    model: 'claude-3-haiku',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `请根据以下问题，写出一个包含答案的假设文档：\n${question}`
    }],
  });
  const hypoText = hypotheticalDoc.content[0].type === 'text' ? hypotheticalDoc.content[0].text : '';

  // 2. 用假设文档的向量去检索真实文档
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: hypoText,
  });
  return await vectorSearch(embedding.data[0].embedding, topK);
}
```

### 2. Agentic RAG — 让 Agent 决定检索策略

将检索决策交给 Agent，支持多轮检索和工具调用：

```typescript
async function agenticRAG(question: string) {
  const tools = [
    { name: 'search_kb', description: '搜索知识库', parameters: { query: 'string', category: 'string' } },
    { name: 'search_web', description: '搜索互联网', parameters: { query: 'string' } },
    { name: 'calculate', description: '数学计算', parameters: { expression: 'string' } },
  ];

  // Agent 自行决定调用哪些工具、调用顺序
  const agentResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    tools,
    messages: [{ role: 'user', content: question }],
  });
  return agentResponse;
}
```

### 3. 自适应 RAG — 根据问题复杂度选择检索策略

简单问题直接回答，复杂问题才检索：

```typescript
async function adaptiveRAG(question: string) {
  const complexity = await evaluateComplexity(question); // 0-10
  if (complexity < 3) return await directLLM(question);       // 简单：直接用 LLM
  if (complexity < 7) return await basicRAG(question);        // 中等：基础 RAG
  return await multiStepRAG(question);                        // 复杂：多步 RAG
}
```

## 🧠 知识检查点

1. **Self-RAG 和 Corrective-RAG 的核心区别是什么？**

<details>
<summary>点击展开答案</summary>

- **Self-RAG**：在检索前和检索后都加入 LLM 判断——是否需要检索？检索结果是否相关？生成的回答是否被支持？
- **Corrective-RAG（CRAG）**：专注于检索结果的质量评估，当检索质量低时自动回退到 Web 搜索或生成替代查询。CRAG 更侧重于"检索错了怎么办"。
</details>

2. **什么是 Query 改写？为什么能提升 RAG 效果？**

<details>
<summary>点击展开答案</summary>

Query 改写是用 LLM 将用户的原始查询转化为更适合向量检索的格式。例如用户问"那个框架比较好？"可以改写为"前端框架对比分析"或"React vs Vue 优缺点"。改写后的问题与文档库中的表述更接近，相似度计算更准确，召回率更高。
</details>

3. **HyDE 的工作原理是什么？它有什么局限？**

<details>
<summary>点击展开答案</summary>

HyDE（假设文档嵌入）先让 LLM 根据问题生成一个"假设的完美文档"，然后用这个文档的嵌入向量去检索真实文档。原理是假设文档与真实文档在向量空间中更接近。局限是：如果 LLM 生成的假设文档质量不高（不准确或过于泛化），检索效果反而会变差。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Query 改写后反而丢失了细节 | 改写过于宽泛，丢失了原始问题中的专有名词 | 改写时保留原始查询中的关键词，改写版和原版一起检索 |
| Self-RAG 的"判断"环节过于保守 | 判断阈值设置不当，大部分问题都走"不需要检索"分支 | 调整判断 Prompt，添加"不确定时请检索"的兜底指令 |
| CRAG 的 Web 回退引入新噪声 | Web 搜索结果质量参差不齐，反而降低了回答质量 | 对 Web 结果也做相关性筛选，或限制只搜索高可信域名 |

## 📝 本章小结

- ✅ **Query 改写** — 用 LLM 将用户问题转化为更适合检索的形式
- ✅ **Self-RAG** — 让 LLM 自主判断是否需要检索、结果是否相关
- ✅ **Corrective-RAG** — 检索质量低时自动回退到 Web 搜索

## ➡️ 下一章预告

> [第5章：多模态 RAG](./05-multi-modal-rag.md) — 处理图片、表格和 PDF 中的非结构化数据
