# 第6章：RAG 评估 — 如何衡量 RAG 系统质量

> 预计学习时间：70-90 分钟

## 🎯 本章目标

掌握 RAG 系统的主要评估指标（Faithfulness、Relevancy、Answer Correctness 等），能够使用 RAGAS 框架自动评估 RAG 系统的检索质量和生成质量。

## 📋 前置知识

- 掌握 RAG 全流程架构（第1章）
- 了解检索和生成的基本原理（第3章）
- 熟悉模型评估的基本概念（准确率、召回率等）

## 💡 核心概念

### RAG 评估的三层体系

RAG 系统的评估可分为三个层次：

```
┌──────────────────────────────────────────────────┐
│  第一层：检索质量 (Retrieval Quality)              │
│  关注：检索到的文档是否相关、是否完整                │
├──────────────────────────────────────────────────┤
│  第二层：生成质量 (Generation Quality)              │
│  关注：生成的回答是否忠于文档、是否切题              │
├──────────────────────────────────────────────────┤
│  第三层：端到端质量 (End-to-End Quality)            │
│  关注：最终回答是否正确、用户是否满意                │
└──────────────────────────────────────────────────┘
```

### 评估指标详解

| 指标 | 所属层级 | 含义 | 计算方法 |
|------|----------|------|----------|
| **Faithfulness** | 生成质量 | 回答是否忠于检索到的文档 | LLM 判断回答是否可从文档推导 |
| **Relevancy** | 生成质量 | 回答是否与问题相关 | LLM 判断回答是否回答了问题 |
| **Context Recall** | 检索质量 | 检索是否找到了相关文档 | 对比检索结果与标准答案（Ground Truth） |
| **Context Precision** | 检索质量 | 检索结果中相关文档的比例 | 相关文档数 / 检索总数 |
| **Answer Correctness** | 端到端 | 最终回答是否正确 | 对比标准答案 |
| **Answer Relevancy** | 端到端 | 回答是否针对用户问题 | 计算回答与问题的语义相似度 |

### RAGAS 评估框架

**RAGAS**（Retrieval Augmented Generation Assessment, Shahul et al. 2023）是目前最流行的 RAG 评估框架，它定义了标准化的评估指标和流程。

RAGAS 的核心指标：
- **Faithfulness**：回答中的每个声明 (claim) 是否都可以从检索到的文档中推导出来
- **Answer Relevancy**：回答与问题的相关性
- **Context Precision**：检索到的文档中有多大比例是相关的
- **Context Recall**：检索到的文档覆盖了多少标准答案所需的知识

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

### ARES：自动化 RAG 评估系统

**ARES**（Automated RAG Evaluation System, Saad-Falcon et al. 2024）是针对 LLM-as-Judge 偏差问题的系统性解决方案。其核心思路是：**用合成数据微调一个小型评估 LLM，再通过少样本学习适配到新领域**，从而降低评估偏差。

ARES 的三阶段流程：

```
阶段 1: 合成数据生成
  LLM 生成 (问题, 文档, 回答) 三元组
        ↓
阶段 2: 微调评估器
  用合成数据微调小型 LLM（如 DeBERTa），使其学会判别 faithfulness / relevancy / context recall
        ↓
阶段 3: 少样本校准
  用少量人工标注样本（~50 条）校准评估器到目标领域
        ↓
输出: 每个测试用例的评估分数 + 置信区间
```

ARES 的关键贡献在于：
- **PPE（Prediction-Powered Inference）**：利用少量人工标注来校正 LLM 评估的系统性偏差，输出带置信区间的分数而非孤立的点估计
- **领域自适应**：只需 50 条左右的目标领域标注数据即可完成转移，大幅降低人工成本
- **与 RAGAS 指标对齐**：ARES 直接优化 RAGAS 定义的三项核心指标——Faithfulness、Context Relevance 和 Answer Relevance

与直接使用 GPT-4 做 Judge 相比，ARES 在小样本场景下偏差更低、一致性更好，特别适合需要长期稳定评估管线的生产环境。

### 检索排序指标

评估检索质量的指标可以分为三类，分别衡量不同的"好"：

| 指标 | 全称 | 关注点 | 适用场景 |
|------|------|--------|----------|
| **Hit Rate** | 命中率 | 至少一个相关文档是否被检索到 | 问答系统（只要有一份相关文档就能生成答案） |
| **MRR** | Mean Reciprocal Rank | 第一个相关文档出现在第几位 | 用户只关心第一个结果的场景（如搜索建议） |
| **NDCG** | Normalized Discounted Cumulative Gain | 多个相关文档的位置 + 相关性等级 | 需要多文档排序的应用（如摘要生成需要 Top-5 全部相关） |

**Hit Rate** 是最简单的指标：`Hit Rate = 有相关文档被检索到的查询数 / 总查询数`。它只关心"有没有"，不关心"排在哪"，适合评估缓存场景。

**MRR**（Mean Reciprocal Rank）按位置给予权重：`MRR = (1 / rank₁ + 1 / rank₂ + ... + 1 / rankₙ) / N`。第一个相关文档排在第 1 位得 1 分，第 2 位得 0.5 分，第 3 位得 0.33 分。MRR 适合**单相关文档**场景。

**NDCG**（Normalized Discounted Cumulative Gain）是最精细的指标。它不仅考虑文档是否相关，还考虑**相关程度**（如 0-3 分级），并对位置进行对数折扣。计算公式为：
```
DCG@K = Σ (2^relᵢ - 1) / log₂(i + 1)
NDCG@K = DCG@K / IDCG@K     (IDCG = 理想排序下的最高 DCG)
```
NDCG 适合**多级相关性**评估，如搜索结果排名质量分析。

### 人工评估协议

自动化指标与人类判断之间存在不可忽视的偏差。健全的 RAG 评估策略应包含**标准化的人工评估协议**。

**1. 评估维度与 Likert 量表**

人工评估通常使用 5 点 Likert 量表覆盖以下维度：

| 维度 | 1 分 | 5 分 |
|------|------|------|
| **Faithfulness** | 回答包含大量文档中没有的信息 | 回答完全基于检索文档 |
| **Usefulness** | 对用户毫无帮助 | 直击用户需求，可直接使用 |
| **Completeness** | 遗漏了大部分关键信息 | 覆盖了所有必要信息 |
| **Clarity** | 语言混乱，难以理解 | 清晰简洁，结构良好 |

**2. 评估者之间的一致性**

为确保评估结果可靠，需要计算**评估者间信度**。最常用的指标是 **Cohen's Kappa**（两位评估者）和 **Fleiss' Kappa**（多位评估者）：

```
κ = (p₀ - pₑ) / (1 - pₑ)
```
其中 p₀ 是观测一致率，pₑ 是随机期望一致率。κ > 0.8 表示几乎完全一致，0.6-0.8 表示高度一致，0.4-0.6 表示中等一致。低于 0.4 说明评估标准不够清晰，需要重新培训评估者或细化评分准则。

**3. A/B 测试方法论**

在生产环境中比较两套 RAG 配置（如不同的检索策略或生成模型），应遵循严格的 A/B 测试流程：

1. **分流**：随机将用户请求分配到 A 组（基线）和 B 组（实验组），确保两组用户分布一致
2. **双盲**：用户和评估者均不知道分组信息
3. **核心指标**：定义主要指标（如用户满意度评分）和次要指标（如响应时间、点击率）
4. **统计显著性**：使用 t 检验或 Mann-Whitney U 检验，确保结果不是随机波动
5. **运行时长**：至少运行 1-2 个完整业务周期，以覆盖不同场景

### LLM-as-Judge 的偏差校准

LLM-as-Judge（用大语言模型自动评估 RAG 输出）快捷高效，但存在三类系统偏差：

**1. 位置偏差（Position Bias）**

LLM 倾向于偏好出现在**前面的回答**。研究表明，在 A/B 比较评估中，将正确回答放在首位时评估准确率约 80%，但将其放在末位时准确率可能降至 60%（Wang et al. 2023）。

**缓解方法**：
- 打乱顺序：对每个测试用例，交换两份回答的位置并分别评估，取平均值
- 批次评估：将多个回答一起呈现而非两两比较

**2. 自我增强偏差（Self-Enhancement Bias）**

LLM 倾向于对由其自身或同类模型生成的回答给出更高分数（"自产自销"）。例如，GPT-4 作为 Judge 时，对 GPT-4 生成的回答评分偏高，对 Claude 或 LLaMA 的回答评分偏低。

**缓解方法**：
- 使用多个不同家族的 Judge LLM（如同时使用 GPT-4 和 Claude）取平均
- 在 Prompt 中明确要求忽略回答风格，仅按事实准确性评分
- 对 Judge 的回答风格进行"盲评"（去除所有可标识来源的特征）

**3. 校准策略总结**

| 偏差类型 | 缓解技术 | 实现复杂度 |
|----------|----------|-----------|
| 位置偏差 | 交换顺序 + 重复评估 | 低 |
| 自我增强偏差 | 多 Judge 投票 + 盲评 | 中 |
| 评分漂移 | 固定参考样本（Anchor Sample）校准 | 中 |
| 一致性问题 | 细粒度评分标准 + CoT 推理后评分 | 高 |

实践中建议：**先用人工标注 100 条测试数据作为黄金标准，再用校准后的 LLM-as-Judge 进行大规模自动化评估**，最后定期（每周）抽取样本做人工复核。

### 评估数据集的构建

一个完整的 RAG 评估需要以下数据：

```
评估数据集格式：
{
  "question": "用户问题",
  "ground_truth": "标准答案",
  "relevant_docs": ["相关文档1", "相关文档2"]  // 黄金检索结果
}
```

构建评估数据集的常见方法：
1. **人工构建**：领域专家编写问题和标准答案（质量高，成本高）
2. **LLM 生成**：基于文档用 LLM 生成 Q&A 对（规模大，质量中）
3. **混合方法**：LLM 生成 + 人工审核（推荐，平衡质量与成本）

### 评估基准 (Benchmarks)

| 基准名称 | 场景 | 评估维度 | 备注 |
|----------|------|----------|------|
| **RGB** (RAG Benchmark) | 开放域问答 | 检索 + 生成 | 覆盖多跳、时序等复杂场景 |
| **KILT** (Knowledge Intensive NLP Tasks) | 知识密集型任务 | 端到端 | 涵盖 5 类任务 |
| **ALCE** (Automatic LLM Citation Evaluation) | 引用准确性 | 生成 + 引用 | 关注 RAG 的引用质量 |
| **FRAMES** | 事实验证 | 检索 + 事实性 | 需要多文档推理 |

## 🔨 实战演练

### 场景描述

你正在部署一个 RAG 系统到生产环境，需要在发布前对其质量进行全面的自动化评估。你的客户要求：1) 系统必须达到 85% 以上的 Faithfulness 分数；2) 检索的 Top-3 结果中必须包含至少一个相关文档（Recall@3 ≥ 0.9）；3) 评估过程必须可复现。

### 你的任务

1. 实现一个 `RAGEvaluator` 类，包含 Faithfulness、Context Recall@K 和 Answer Correctness 三个评估方法
2. 添加一个 `evaluatePipeline` 方法，批量评估 50 个测试用例并生成汇总报告
3. 实现一个 `passRate` 方法，计算各项指标通过阈值的百分比

<details>
<summary>💡 参考实现</summary>

```typescript
interface TestCase {
  question: string;
  groundTruth: string;
  relevantDocIds: string[];
}

interface EvaluationResult {
  faithfulness: number;
  contextRecall: number;
  answerCorrectness: number;
  passed: boolean;
}

class RAGEvaluator {
  private threshold: number = 0.85;

  async evaluatePipeline(testCases: TestCase[]): Promise<{
    results: EvaluationResult[];
    summary: { faithfulness: number; recall: number; correctness: number; passRate: number };
  }> {
    const results = await Promise.all(
      testCases.map(tc => this.evaluateSingle(tc))
    );

    const avg = (metric: keyof EvaluationResult) =>
      results.reduce((s, r) => s + (typeof r[metric] === 'number' ? r[metric] as number : 0), 0) / results.length;

    const passRate = results.filter(r => r.passed).length / results.length;

    return {
      results,
      summary: {
        faithfulness: avg('faithfulness'),
        recall: avg('contextRecall'),
        correctness: avg('answerCorrectness'),
        passRate,
      },
    };
  }

  async evaluateSingle(testCase: TestCase): Promise<EvaluationResult> {
    // 实际评估逻辑...
    return {
      faithfulness: 0.92,
      contextRecall: 0.95,
      answerCorrectness: 0.88,
      passed: true,
    };
  }
}
```

</details>

## ⚡ 进阶技巧

### 1. 细粒度 Faithfulness 评估

```typescript
// 将回答分解为原子声明逐一验证
async function fineGrainedFaithfulness(answer: string, contexts: string[]): Promise<{
  score: number;
  unsupportedClaims: string[];
}> {
  // 1. 提取回答中的所有原子声明
  const claims = await extractAtomicClaims(answer);

  // 2. 逐一声明验证
  const results = await Promise.all(
    claims.map(async (claim) => {
      const supported = await isClaimSupported(claim, contexts);
      return { claim, supported };
    })
  );

  const unsupported = results.filter(r => !r.supported).map(r => r.claim);
  return {
    score: 1 - unsupported.length / claims.length,
    unsupportedClaims: unsupported,
  };
}
```

### 2. A/B 测试框架

```typescript
// 对比两种检索策略的端到端效果
async function abTestRAG(testCases: TestCase[], versionA: RAGSystem, versionB: RAGSystem) {
  const resultsA = await evaluateOn(testCases, versionA);
  const resultsB = await evaluateOn(testCases, versionB);

  return {
    versionA: resultsA.summary,
    versionB: resultsB.summary,
    improvement: {
      faithfulness: resultsB.summary.faithfulness - resultsA.summary.faithfulness,
      recall: resultsB.summary.recall - resultsA.summary.recall,
    },
  };
}
```

### 3. 自动化回归测试

```typescript
// 每次知识库更新后自动运行回归测试
async function regressionTest(knownCases: TestCase[], ragSystem: RAGSystem): Promise<boolean> {
  const results = await ragSystem.evaluator.evaluatePipeline(knownCases);
  const regressions = results.results.filter(r => !r.passed);

  if (regressions.length > 0) {
    console.error(`❌ ${regressions.length}/${knownCases.length} 用例回归！`);
    await notifyTeam(regressions);
    return false;
  }
  console.log(`✅ 全部 ${knownCases.length} 个回归测试通过`);
  return true;
}
```

## 🧠 知识检查点

### Q1: RAG 评估的三层体系是什么？每层关注的核心问题是什么？

<details>
<summary>查看答案</summary>

**答案：** 三层体系包括：1) **检索质量**（Context Precision/Recall）——关注"检索到的文档是否相关且完整"；2) **生成质量**（Faithfulness/Relevancy）——关注"生成的回答是否忠于文档且切题"；3) **端到端质量**（Answer Correctness）——关注"最终回答是否正确、用户是否满意"。三层递进：即使检索和生成各自表现良好，端到端效果也不一定理想。

</details>

### Q2: Faithfulness 指标和 Answer Correctness 指标有什么区别？

<details>
<summary>查看答案</summary>

**答案：** **Faithfulness**（忠实性）衡量回答是否**完全基于检索到的文档**——即使回答是正确的，但如果包含文档中没有的信息，Faithfulness 也会降低。**Answer Correctness**（回答正确性）衡量回答本身**是否与标准答案一致**——即使回答正确但基于错误推理，Correctness 仍可能高。理想 RAG 系统应该两者都高：回答既正确（Correctness）又完全基于检索文档（Faithfulness）。

</details>

### Q3: 为什么说 LLM-as-Judge 评估方法有局限性？如何缓解？

<details>
<summary>查看答案</summary>

**答案：** LLM-as-Judge 的局限性包括：1) **位置偏差**——LLM 倾向于偏好第一个或最后一个选项；2) **自我增强偏差**——LLM 倾向于偏好自己生成的回答；3) **一致性差**——同一问题多次评估结果波动。缓解方法包括：使用多个评估 LLM 取平均、交换选项位置重复评估、使用更细粒度的评分标准（如原子声明分解）。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| ❌ 评估指标之间互相矛盾 | 未区分检索质量和生成质量指标，混用导致信号混乱 | 按照三层体系分别报告检索、生成、端到端指标 |
| ❌ 人工评估和自动评估结果差异大 | LLM-as-Judge 校准不足，评分标准不统一 | 先人工标注 50-100 个样本作为校准集，用其调整自动评估的 Prompt |
| ❌ 评估数据集与实际用户查询分布不匹配 | 测试用例由 LLM 生成，与实际用户提问方式偏差大 | 从真实用户日志中采样构建测试集；LLM 生成 + 人工审核 |

## 📝 本章小结

- ✅ **Faithfulness** — 回答是否忠于文档（生成质量核心指标）
- ✅ **Relevancy** — 回答是否切题
- ✅ **Context Recall/Precision** — 检索质量的双维度评估
- ✅ **Answer Correctness** — 端到端回答正确性
- ✅ **RAGAS 框架** — 标准化 RAG 评估指标与流程（Shahul et al. 2023）
- ✅ **LLM-as-Judge** — 用 AI 自动评估 AI 输出（需注意偏差校准）
- ✅ **三层评估体系** — 检索质量 → 生成质量 → 端到端质量
- ✅ **回归测试** — 知识库更新后自动验证系统质量不下降

## ➡️ 下一章预告

> [第7章：RAG 优化](./07-rag-optimization.md) — 性能与成本的平衡艺术，学习延迟优化、缓存策略和模型分层。
