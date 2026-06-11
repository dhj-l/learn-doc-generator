# 第6章：RAG 评估 — 如何衡量 RAG 系统质量

> 预计学习时间：70-90 分钟

## 💡 评估指标

| 指标 | 含义 | 计算方法 |
|------|------|----------|
| **Faithfulness** | 回答是否忠于检索到的文档 | LLM 判断回答是否可从文档推导 |
| **Relevancy** | 回答是否与问题相关 | LLM 判断回答是否回答了问题 |
| **Context Recall** | 检索是否找到了相关文档 | 对比检索结果与标准答案 |
| **Context Precision** | 检索结果中相关文档的比例 | 相关文档数 / 检索总数 |
| **Answer Correctness** | 最终回答是否正确 | 对比标准答案 |

### RAGAS 评估框架

```typescript
// 使用 LLM-as-Judge 自动评估
async function evaluateRAG(question: string, answer: string, contexts: string[]) {
  // Faithfulness 评估
  const faithfulness = await judgeFaithfulness(answer, contexts);

  // Relevancy 评估
  const relevancy = await judgeRelevancy(question, answer);

  return { faithfulness, relevancy };
}

async function judgeFaithfulness(answer: string, contexts: string[]): Promise<number> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `判断以下回答是否完全基于给定的参考文档。
如果回答中有任何信息无法从文档中推导，则 faithfulness 低。

回答：${answer}
文档：${contexts.join('\n---\n')}

输出 1-10 的分数：`
    }],
  });

  const score = parseInt(response.content[0].type === 'text' ? response.content[0].text : '5');
  return score;
}
```

---

## 📝 本章小结

- ✅ **Faithfulness** — 回答是否忠于文档
- ✅ **Relevancy** — 回答是否切题
- ✅ **Context Recall/Precision** — 检索质量
- ✅ **LLM-as-Judge** — 用 AI 自动评估 AI 输出
