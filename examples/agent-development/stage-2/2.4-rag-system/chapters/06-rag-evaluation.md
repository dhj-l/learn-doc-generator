# 第6章：RAG 评估 — 衡量检索质量

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 RAG 评估的核心指标** — 检索质量、生成质量、端到端质量
- **实现自动化评估流水线** — 用测试集衡量 RAG 系统表现
- **识别 RAG 系统的薄弱环节** — 是检索不好还是生成不好？

## 📋 前置知识

> 建议先完成：[第3章：检索策略](./03-retrieval-strategies.md) 和 [第4章：高级 RAG](./04-advanced-rag.md)

---

## 💡 核心概念

### 三大评估维度

| 维度 | 指标 | 说明 |
|------|------|------|
| **检索质量** | Recall@K、Precision@K、MRR | 检索到的文档是否相关 |
| **生成质量** | Faithfulness、Relevance | 生成内容是否基于文档 |
| **端到端** | Answer Correctness | 最终答案是否正确 |

### 检索评估

```typescript
// Recall@K: 前 K 个结果中包含相关文档的比例
function recallAtK(retrieved: string[], relevant: string[], K: number): number {
  const retrievedK = retrieved.slice(0, K);
  const found = relevant.filter(r => retrievedK.includes(r)).length;
  return found / relevant.length;
}

// Faithfulness: 生成内容是否忠实于检索文档
async function checkFaithfulness(answer: string, documents: string[]): Promise<number> {
  const response = await anthropic.messages.create({
    model: 'claude-3-haiku',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: `回答中的每句话是否都能在参考文档中找到依据？评分 1-10。
回答: ${answer}
文档: ${documents.join('\n')}`
    }],
  });
  return extractScore(response.content[0].text);
}
```

## 🔨 实战演练

**场景描述：**
你已经构建了一个基础 RAG 系统，现在需要通过评估来验证它的效果。你决定从三个维度（检索质量、生成质量、端到端质量）进行全面评估，并找到系统的薄弱环节。

**你的任务：**
1. 构建一个包含 20 个测试用例的测试集（覆盖简单/中等/困难问题）
2. 实现 Recall@3 和 Precision@3 的评估函数
3. 用 LLM-as-Judge 评估 Faithfulness（忠实度）和 Relevance（相关性）
4. 分析薄弱环节：如果 Recall 低 → 改进检索策略；如果 Faithfulness 低 → 改进生成 Prompt

<details>
<summary>💡 参考实现要点</summary>

```typescript
interface EvalResult {
  question: string;
  recall: number;
  precision: number;
  faithfulness: number;
  relevance: number;
  latency: number;
}

async function evaluateRAG(testCases: Array<{ question: string; relevantDocs: string[] }>) {
  const results: EvalResult[] = [];

  for (const { question, relevantDocs } of testCases) {
    const start = Date.now();
    const { answer, sources } = await ragSystem.query(question);

    results.push({
      question,
      recall: recallAtK(sources.map(s => s.content), relevantDocs, 3),
      precision: precisionAtK(sources.map(s => s.content), relevantDocs, 3),
      faithfulness: await checkFaithfulness(answer, sources.map(s => s.content)),
      relevance: await checkRelevance(answer, question),
      latency: Date.now() - start,
    });
  }

  // 输出汇总
  const avg = (key: keyof EvalResult) =>
    results.reduce((sum, r) => sum + (r[key] as number), 0) / results.length;

  console.log(`Average Recall@3: ${avg('recall')}`);
  console.log(`Average Precision@3: ${avg('precision')}`);
  console.log(`Average Faithfulness: ${avg('faithfulness')}`);
  console.log(`Average Latency: ${avg('latency')}ms`);

  return results;
}
```

**检验标准：**
- 能输出每个测试用例的 Recall、Precision、Faithfulness 分数
- 能根据评估结果定位问题（检索 vs 生成）
- 对比改进前后的指标变化，量化优化效果
</details>

## ⚡ 进阶技巧

### 1. 构建黄金测试集（Gold Dataset）

用 LLM 自动生成带标注的测试集，避免人工标注的高成本：

```typescript
async function generateTestSet(documents: string[], numQuestions = 50) {
  const testCases: Array<{ question: string; relevantDocs: string[]; expectedAnswer: string }> = [];

  for (const doc of documents) {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `基于以下文档，生成 3 个问答对。每个问答对包含：
1. 一个自然语言问题
2. 文档中与问题相关的文本片段
3. 基于文档的正确答案

文档：${doc}
输出 JSON 格式。`
      }],
    });
    // 解析并添加到 testCases
  }
  return testCases;
}
```

### 2. A/B 测试框架

对比不同策略的在线效果：

```typescript
async function abTestRAG(question: string) {
  const strategies = [
    { name: 'basic', fn: () => basicRAG(question) },
    { name: 'hybrid', fn: () => hybridRAG(question) },
    { name: 'rerank', fn: () => rerankRAG(question) },
  ];

  const results = await Promise.all(
    strategies.map(async ({ name, fn }) => {
      const start = Date.now();
      const answer = await fn();
      return { name, answer, latency: Date.now() - start };
    })
  );
  return results;
}
```

### 3. 评估结果的可视化

使用混淆矩阵和 PR 曲线分析评估结果：

```typescript
function confusionMatrix(results: Array<{ actual: boolean; predicted: boolean }>) {
  const matrix = { TP: 0, FP: 0, FN: 0, TN: 0 };
  results.forEach(r => {
    if (r.actual && r.predicted) matrix.TP++;
    else if (!r.actual && r.predicted) matrix.FP++;
    else if (r.actual && !r.predicted) matrix.FN++;
    else matrix.TN++;
  });
  const precision = matrix.TP / (matrix.TP + matrix.FP) || 0;
  const recall = matrix.TP / (matrix.TP + matrix.FN) || 0;
  const f1 = 2 * precision * recall / (precision + recall) || 0;
  return { ...matrix, precision, recall, f1 };
}
```

## 🧠 知识检查点

1. **Recall@K 和 Precision@K 有什么区别？**

<details>
<summary>点击展开答案</summary>

- **Recall@K（召回率）**：前 K 个结果中相关文档数 ÷ 总相关文档数。衡量"是否把所有相关文档都找到了"。
- **Precision@K（精确率）**：前 K 个结果中相关文档数 ÷ K。衡量"找出来的结果有多少是相关的"。
两者通常是矛盾的——提高 K 值增加 Recall 但降低 Precision。
</details>

2. **什么是 LLM-as-Judge 评估方法？它有什么优缺点？**

<details>
<summary>点击展开答案</summary>

LLM-as-Judge 是用一个 LLM（如 GPT-4、Claude）来评估 RAG 系统的输出质量。**优点**：无需人工标注，可自动化评估各种维度（忠实度、相关性、有用性）。**缺点**：评估 LLM 本身有偏见（偏好自身输出、偏好更长答案）、评估标准需要精心设计 Prompt、成本较高。
</details>

3. **为什么 Faithfulness（忠实度）比 Answer Correctness（答案正确性）更适合作为 RAG 的核心评估指标？**

<details>
<summary>点击展开答案</summary>

RAG 的核心是"基于检索到的文档生成回答"，所以系统首先应该忠实于检索到的文档。Answer Correctness 依赖于预先定义的"正确答案"，但 RAG 的知识库可能只有部分信息，LLM 可能用自己的知识补全了正确的回答——这反而掩盖了文档检索的不足。Faithfulness 只衡量回答是否与检索文档一致，更能反映 RAG 系统的真实表现。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 评估指标只看 Answer Correctness | 认为"答案对就是系统好"，忽略了检索质量问题 | 拆分为检索质量（Recall/Precision）和生成质量（Faithfulness）分别评估 |
| 测试集太小或太简单 | 只有 5-10 个测试用例，或全是简单问题 | 构建至少 50-100 个覆盖不同难度和类型的测试用例 |
| 用同一个模型做评估和生成 | LLM-as-Judge 对自身输出有偏好，评估结果有偏差 | 用不同的模型进行评估（如用 GPT-4 评估 Claude 的输出），或用专门的评估模型 |

## 📝 本章小结

- ✅ **检索质量** — Recall@K、Precision@K 衡量检索效果
- ✅ **Faithfulness** — 生成内容是否忠实于文档
- ✅ **自动化评估** — 用 LLM-as-Judge 评估回答质量

## ➡️ 下一章预告

> [第7章：RAG 优化](./07-rag-optimization.md) — 基于评估结果进行针对性的性能优化

---
