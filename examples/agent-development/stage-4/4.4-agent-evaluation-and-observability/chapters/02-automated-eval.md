# 第2章：自动化评估 — LLM-as-Judge

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 LLM-as-Judge 评估模式** — 用 LLM 来评估 LLM 的输出质量
- **设计评估 Prompt** — 编写有效的评估指令
- **构建自动化评估流水线** — 集成到 CI/CD

## 📋 前置知识

> 建议先完成：
> - [第1章：Agent 评估维度](./01-evaluation-dimensions.md) — 理解六大评估维度和基线概念

---

## 💡 核心概念

### LLM-as-Judge 模式

让一个 LLM（如 Claude）作为评审，评估另一个 Agent 的输出质量。

```typescript
interface JudgeConfig {
  criteria: string[];    // 评估维度
  scale: number;         // 评分范围（如 1-10）
  rubric?: string;       // 评分标准描述
}

async function judgeResponse(
  question: string,
  answer: string,
  expectedOutput: string,
  config: JudgeConfig
): Promise<{ score: number; feedback: string }> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `
你是一个 AI Agent 输出质量评审员。请严格评估以下回答。

评估维度：
${config.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

评分标准（1-${config.scale}）：
${config.rubric || '1-3: 较差  4-6: 一般  7-8: 良好  9-10: 优秀'}

问题：${question}
期望输出：${expectedOutput}
实际回答：${answer}

输出 JSON 格式：
{
  "score": <数字>,
  "feedback": "<具体的改进建议>"
}`,
    }],
  });
  return JSON.parse(response.content[0].text);
}
```

> **💡 为什么用 LLM 而不是人工评估？** 人工评估准确但昂贵、慢——评估 100 条用例可能需要 5 小时。LLM 评估虽然不如人工精确，但可以自动化运行、成本低、速度快。实践中可以用 LLM 做日常回归测试，定期人工抽检做校准。

---

## 🔨 实战演练

<details>
<summary>🧑‍💻 构建自动化评估流水线</summary>

```typescript
// auto-eval-pipeline.ts
import { promises as fs } from 'fs';

interface TestCase {
  name: string;
  input: string;
  expected: string;
  criteria: string[];
}

class AutoEvalPipeline {
  private testCases: TestCase[] = [];

  async loadTestCases(filePath: string) {
    this.testCases = JSON.parse(await fs.readFile(filePath, 'utf-8'));
  }

  async runAll(): Promise<{ passing: number; total: number; details: any[] }> {
    let passing = 0;
    const details: any[] = [];

    for (const testCase of this.testCases) {
      const result = await this.evaluateTestCase(testCase);
      details.push(result);
      if (result.passed) passing++;
    }

    return { passing, total: this.testCases.length, details };
  }

  private async evaluateTestCase(testCase: TestCase) {
    // 1. 让被测 Agent 处理
    const agentResponse = await agent.process(testCase.input);

    // 2. LLM 评估
    const judgeResult = await judgeResponse(
      testCase.input,
      agentResponse,
      testCase.expected,
      { criteria: testCase.criteria, scale: 10 }
    );

    return {
      name: testCase.name,
      score: judgeResult.score,
      passed: judgeResult.score >= 7, // 7/10 为通过
      feedback: judgeResult.feedback,
    };
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：多 Judge 投票

```typescript
// 用多个 LLM 做 Judge，取平均分
async function multiJudgeVote(testCase: TestCase): Promise<{ score: number; confidence: string }> {
  const judges = ['claude-sonnet-4', 'gpt-4o', 'gemini-1.5-pro']
  const results = await Promise.all(
    judges.map(model => judgeResponse(testCase.input, testCase.expected, { criteria: testCase.criteria, scale: 10 }))
  )
  const scores = results.map(r => r.score)
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  return {
    score: Math.round(avg * 10) / 10,
    confidence: Math.max(...scores) - Math.min(...scores) < 2 ? 'high' : 'low',
  }
}
// 评分差异小 → 高置信度；差异大 → 需人工复审
```

### 技巧二：评估结果可视化

```typescript
function generateEvalReport(results: Array<{ name: string; score: number }>) {
  const passing = results.filter(r => r.score >= 7).length
  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length
  return {
    summary: `${passing}/${results.length} 通过 (平均分 ${avgScore.toFixed(1)})`,
    distribution: {
      excellent: results.filter(r => r.score >= 9).length,
      good: results.filter(r => r.score >= 7 && r.score < 9).length,
      fair: results.filter(r => r.score >= 5 && r.score < 7).length,
      poor: results.filter(r => r.score < 5).length,
    },
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：LLM-as-Judge 的评分稳定吗？**

> A：设置 temperature=0 可以大幅提高稳定性，但仍有一定波动（因为 LLM 不是纯数学函数）。对于关键评估，建议用多 Judge 投票取均值，或设置 ±1 分的「灰色地带」——落在灰色地带的由人工判断。

**Q2：评估 Prompt 应该怎么写效果最好？**

> A：关键要素：(1) 具体的评分标准（rubric），例如「10 分：完美，包含所有必需信息」；(2) 输出格式为 JSON，便于程序解析；(3) 要求 LLM 给出具体反馈而非只有分数——反馈可以帮助定位问题。避免使用「你认为」这种模糊表述。

**Q3：测试集多大才够？**

> A：至少 50-100 条覆盖常见场景，20-30 条覆盖边界情况。太少则评估结果不可靠（方差大），太多则评估成本高（每次 CI 都要跑几百条 LLM 调用）。建议：日常 CI 跑核心 50 条，每晚全量跑 200 条。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 评估 Prompt 中使用了模糊表述 | 「你觉得」这种措辞让 LLM 评分不一致 | 用具体的评分标准（rubric），明确定义每个分数段 |
| 所有用例用一个评估维度 | 不同场景关注的维度不同 | 每条测试用例自定义 criteria |
| 评估结果没有版本管理 | 无法追踪 Agent 质量变化趋势 | 评估结果与 git commit 绑定，生成趋势图 |
| 评分阈值设定不合理 | 7/10 对某些场景太高，对某些场景太低 | 根据业务场景调整通过阈值 |

---

## 📝 本章小结

- ✅ **LLM-as-Judge** — 用 LLM 评估 LLM 输出，自动化和成本优势显著
- ✅ **评估 Prompt** — 清晰的维度和评分标准是准确评估的关键
- ✅ **CI/CD 集成** — 自动化流水线在每次提交时运行回归测试
- ✅ **多 Judge 投票** — 多个 LLM 评估取均值，提高评估置信度

## ➡️ 下一章预告

> [第3章：可观测性工具 — LangSmith 与 LangFuse](./03-observability-tools.md) — 追踪、调试、分析 Agent 行为。
