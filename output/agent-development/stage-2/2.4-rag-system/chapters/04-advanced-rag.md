# 第4章：高级 RAG 技术 — 超越基础 RAG

> 预计学习时间：90-120 分钟

## 🎯 本章目标

掌握 Self-RAG、Corrective-RAG（CRAG）和多跳 RAG 等高级技术，理解 RAG 系统的智能检索决策机制，能够设计具备自我反思和纠错能力的 RAG 系统。

## 📋 前置知识

- 掌握基础 RAG 三阶段架构（第1章）
- 理解文档分块和向量检索（第2-3章）
- 了解 LLM 的 Prompt Engineering 基础

## 💡 核心概念

### 从基础 RAG 到高级 RAG

基础 RAG 是"检索 → 生成"的线性流程，存在以下局限：

| 局限 | 后果 | 高级 RAG 解决方案 |
|------|------|------------------|
| 每次必检索 | 即使 LLM 已知答案，也浪费 Token 和延迟 | Self-RAG 的判断机制 |
| 检索质量无反馈 | 低质量检索→错误回答，无法自我纠正 | CRAG 的质量评估+回退 |
| 单次检索 | 复杂问题需要多步推理时信息不足 | 多跳检索 (Multi-hop) |
| 查询单一 | 用户提问方式与文档内容不匹配 | Query 改写与扩展 |

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

**Self-RAG**（Asai et al. 2023, *"Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection"*）引入了一个关键创新：**让 LLM 自主判断是否需要检索，以及检索结果的质量**。

Self-RAG 的训练引入了特殊的 `[Retrieve]` 和 `[Critique]` token，LLM 在生成过程中可以：
1. **决定是否检索**：生成 `[Retrieve]` token → 触发检索；不生成 → 直接回答
2. **评估检索结果**：生成 `[Relevant]` 或 `[Irrelevant]` token 判断相关性
3. **自我验证**：生成 `[Supported]` 或 `[Not supported]` token 判断回答是否被检索结果支持

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

**Corrective-RAG**（Yan et al. 2024, *"Corrective Retrieval Augmented Generation"*）在 Self-RAG 的基础上引入了**检索质量评估与纠错机制**。当检索质量低时，系统不是简单放弃，而是触发纠错动作。

CRAG 的核心流程：
1. **检索评估**：用一个轻量级评估器判断检索文档与查询的相关性
2. **三级决策**：
   - **高质量 (Confident)**：直接使用检索结果生成
   - **中等 (Ambiguous)**：混合检索结果和 Web 搜索
   - **低质量 (Not Confident)**：完全回退到 Web 搜索或知识图谱
3. **知识精炼**：对检索结果进行去噪和重新格式化

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

### 多跳检索 (Multi-hop RAG)

多跳 RAG 解决的是**需要多步推理才能回答的复杂问题**。例如："2024 年诺贝尔物理学奖得主曾获得过哪些其他奖项？"

```
跳1: 检索 "2024 年诺贝尔物理学奖得主" → 得到 "John Hopfield, Geoffrey Hinton"
跳2: 检索 "Geoffrey Hinton 获得的奖项" → 得到 "Turing Award 2018..."
跳3: 检索 "John Hopfield 获得的奖项" ...
最终: 综合所有结果生成答案
```

多跳检索的关键技术：
- **迭代推理**：每一步检索的结果作为下一步查询的上下文
- **查询分解**：用 LLM 将复杂问题分解为多个子查询
- **记忆机制**：保存中间检索结果，避免重复检索

```typescript
// 多跳检索实现
async function multiHopRetrieve(question: string, maxHops: number = 3): Promise<string[]> {
  const allDocs: string[] = [];
  let currentQuery = question;

  for (let hop = 0; hop < maxHops; hop++) {
    // 检索当前查询
    const docs = await retrieve(currentQuery);
    allDocs.push(...docs);

    // 判断是否还有未回答的子问题
    const nextQuery = await generateNextHop(currentQuery, docs, question);
    if (!nextQuery) break; // 所有子问题已回答完毕

    currentQuery = nextQuery;
  }

  return [...new Set(allDocs)];
}
```

### HyDE（Hypothetical Document Embeddings，假设性文档嵌入）

**HyDE** 由 Gao et al. 在 2022 年的论文 *"Precise Zero-Shot Dense Retrieval without Relevance Labels"* 中提出，解决了一个核心问题：**用户的查询表述方式往往与知识库中文档的表述方式存在巨大差异**（即查询-文档分布偏移）。

**核心思想**：不用查询本身去检索，而是先用 LLM **生成一个"假设性文档"**（即如果存在完美答案，它应该长什么样），再用这个假设文档的嵌入去检索。

```
传统方式:    "How to treat lung cancer?"  →  嵌入 → 检索文档
                                             ↑
                                        查询与文档表述不一致，可能匹配不准确

HyDE:       "How to treat lung cancer?"  →  LLM → "Lung cancer treatment
              includes chemotherapy, radiation therapy, targeted therapy..."
              → 嵌入 → 检索文档
                        ↑
              假设文档的风格与真实文档一致，匹配更准确
```

**两步流程**：
1. **生成假设文档**：用 LLM（如 Claude）基于查询生成一个"示范答案"，不要求真实准确，只要求格式和风格像真实文档
2. **嵌入检索**：用这个假设文档的嵌入向量在向量数据库中执行相似度搜索

**为什么有效**：
- 查询和文档通常不在同一语义空间（查询简短、口语化；文档正式、详实）
- 假设文档"桥接"了查询空间和文档空间——它由查询生成，但风格像文档
- 嵌入模型对"文档-文档"相似度比对"查询-文档"相似度更敏感

**实验发现**（Gao et al. 2022）：
- 在零样本设置下，HyDE 在 BEIR 基准上提升稠密检索 **10-20%** 的 Recall@100
- 但微调后的检索器（如领域微调的 DPR）仍然优于 HyDE

**适用场景**：
- 无法对检索器进行领域微调（零样本场景）
- 查询表述与文档风格差异极大（如用户是口语化提问，文档是学术论文）

**局限**：
- 假设文档可能包含幻觉（但幻觉不影响嵌入质量——嵌入关注的是语义风格而非事实准确性）
- 增加一次 LLM 调用的延迟

### GraphRAG（基于知识图谱的 RAG）

**GraphRAG** 由 Microsoft 在 2024 年提出（论文 *"From Local to Global: A Graph-Based Approach for Automated Knowledge Base Construction and Query"*），它将知识图谱（Knowledge Graph）引入 RAG，以增强**多跳推理**和**全局性理解**能力。

#### 核心架构

```
                      ┌──────────────────┐
                      │    用户查询       │
                      └────────┬─────────┘
                               ↓
               ┌───────────────┴───────────────┐
               ↓                               ↓
        ┌──────────────┐              ┌──────────────────┐
        │  实体识别     │              │  查询意图分类     │
        │  (提取查询中  │              │  (局部/全局/桥接)  │
        │   的关键实体)  │              └──────────────────┘
        └───────┬───────┘
               ↓
        ┌──────────────┐
        │  图遍历(Traversal)              │
        │  实体→关系→实体→...            │
        └───────┬───────┘
               ↓
        ┌──────────────┐
        │  子图提取    │
        │  (获取相关子图)  │
        └───────┬───────┘
               ↓
        ┌──────────────┐
        │  文本化 & 生成  │
        │  (子图→文本→LLM)│
        └──────────────────┘
```

**优势**：
- **多跳关系查询**："A 公司的 CEO 曾在 B 公司担任什么职位？"——图结构天然支持这种路径查询
- **全局理解**：不局限于单个文档块，能跨文档聚合信息
- **可解释性**：检索路径可视（实体A→关系R→实体B），推理过程透明

#### 与标准 RAG 的对比

| 特性 | 标准 RAG（向量搜索） | GraphRAG（图搜索） |
|------|---------------------|-------------------|
| **知识表示** | 文档块 → 向量 | 实体 → 节点 + 关系 → 边 |
| **检索方式** | 向量相似度搜索 | 图遍历 + 子图匹配 |
| **多跳推理** | 弱（需要多次检索） | **强**（一次遍历可达多跳） |
| **全局查询** | 差（无法聚合跨文档信息） | **强**（图结构天然支持聚合） |
| **可解释性** | 返回文档块 | **返回推理路径** |
| **构建成本** | 低（只需分块+嵌入） | **高**（需实体抽取+关系构建） |

**适用场景**：需要连接多个实体和关系的复杂问答（医疗诊断、法律推理、金融分析）、需要全局性总结的查询（"报告的主要趋势是什么？"）。

**局限性**：图构建成本高（需要 NLP 流水线抽取实体和关系），不适合简单的事实性查询（向量搜索更快）。

### Agentic RAG（基于智能代理的 RAG）

**Agentic RAG** 是将**智能代理（Agent）**的决策能力引入 RAG 系统的范式。与被动 RAG（"检索一次，生成一次"的线性流程）不同，Agentic RAG 中的代理可以**自主决定何时检索、检索什么、如何使用检索结果**。

#### 被动 RAG vs Agentic RAG

```
被动 RAG：
  用户提问 → 检索 → 生成 → 回答
            ↑                 ↑
         一次检索，          一次生成，
         没有反馈循环         没有自我反思

Agentic RAG（代理循环）：
  用户提问 → 代理评估
              │
              ├→ 是否需要检索？→ 是 → 检索 → 评估结果
              │                    │         │
              │                    ↓         ↓
              │                 高质量？→ 继续生成
              │                 低质量？→ 重写查询→ 重新检索
              │                 部分覆盖？→ 多跳检索
              │
              ├→ 需要工具？→ 调用外部 API/数据库
              │
              └→ 已足够？→ 生成最终回答（附引用）
```

**代理决策节点**：

| 决策点 | 问题 | 可选动作 |
|--------|------|---------|
| **检索必要性** | 这个问题需要外部知识吗？ | 检索 / 直接回答 / 询问澄清 |
| **检索策略** | 如何最好地找到信息？ | 向量搜索 / BM25 / SQL 查询 / Web 搜索 / API 调用 |
| **查询重写** | 检索结果不理想，需要调整吗？ | 重写查询 / 分解查询 / 扩展查询 |
| **结果评估** | 检索结果够用了吗？ | 已足够 → 生成回答 / 不够 → 重试或回退 |
| **多步规划** | 需要多步推理吗？ | 生成步骤计划 → 逐执行 |
| **最终验证** | 回答被检索结果支持吗？ | 确认通过 / 补充检索 / 承认不知道 |

#### 实现框架

```typescript
// Agentic RAG 的循环决策逻辑
async function agenticRAG(question: string) {
  const agent = {
    context: [] as string[],
    question,
    stepCount: 0,
    maxSteps: 5,
  };

  while (agent.stepCount < agent.maxSteps) {
    agent.stepCount++;

    // 1. 代理评估当前状态并决定下一步动作
    const action = await agentDecide(agent);

    switch (action.type) {
      case 'retrieve':
        const docs = await retrieve(action.query);
        agent.context.push(...docs);
        break;

      case 'rewrite_query':
        const newQuery = await rewriteQuery(agent.question, agent.context);
        action.query = newQuery;
        break;

      case 'web_search':
        const webResults = await webSearch(action.query);
        agent.context.push(...webResults);
        break;

      case 'answer':
        return await generateAnswer(agent.question, agent.context);

      case 'clarify':
        return "需要更多信息：" + action.clarification;
    }
  }

  return await generateAnswer(agent.question, agent.context);
}
```

**优势**：
- **灵活性**：同一系统可处理简单和复杂问题
- **容错性**：检索失败时可重试或切换策略
- **效率**：只在需要时检索，控制成本

**挑战**：
- **延迟**：多轮代理循环增加响应时间
- **成本**：每次代理决策调用 LLM，Token 消耗高
- **可靠性**：代理可能进入无限循环或做出错误决策

### FLARE（Active Retrieval Augmented Generation）

**FLARE**（Active Retrieval Augmented Generation）由 Jiang et al. 在 2023 年的论文 *"Active Retrieval Augmented Generation"* 中提出，其核心思想是：**不是在生成前一次性检索所有信息，而是在生成过程中动态判断何时需要检索**。

#### 核心机制

FLARE 的生成过程是逐句进行、边生成边检索的：

```
标准 RAG：  [检索全部文档] → [一次性生成完整回答]
                                    ↑
                              "检索一次，然后一口气生成"

FLARE：     [生成第1句] → [检查置信度] → 低？→ [检索] → [生成第2句]
                ↑                                              ↑
           "先生成，再检查；不确定就检索；检索完继续生成"
```

**具体流程**：

1. **先生成一个临时句子**：基于当前上下文，LLM 生成下一句暂定内容
2. **检查置信度**：分析生成 token 的概率分布——如果某些 token 的概率很低（即模型不确定），则标记为需要检索
3. **检索相关文档**：将低置信度的部分作为查询，检索知识库
4. **基于检索结果重新生成**：使用检索到的文档辅助生成该句
5. **重复**：回到步骤 1，直到生成完整回答

```
输入："2024 年诺贝尔物理学奖得主是谁？"

Step 1: 生成临时句 → "2024 年诺贝尔物理学奖授予了..."
        检查 token 概率 → "授予了" 之后的 token 概率低（模型不确定谁）
        检测到不确定性 → 触发检索

Step 2: 检索 → "2024 Nobel Prize in Physics" → 得到 "John Hopfield, Geoffrey Hinton"

Step 3: 基于检索结果重新生成 → "2024 年诺贝尔物理学奖授予了 John Hopfield 和 Geoffrey Hinton"

Step 4: 继续生成下一句 → "他们因..." → 检查概率 → 确定 → 继续
        ... 循环直到回答完整
```

#### FLARE vs 标准 RAG

| 维度 | 标准 RAG | FLARE |
|------|---------|-------|
| **检索时机** | 生成前一次检索 | **生成过程中多次动态检索** |
| **检索粒度** | 整个问题 | **当前不确定的局部片段** |
| **Token 效率** | 所有检索结果都注入 Prompt | **只注入当前需要的片段** |
| **幻觉控制** | 被动依赖检索质量 | **主动探测不确定性并纠正** |
| **实现复杂度** | 低 | 高（需置信度评估和动态检索） |
| **适用场景** | 简单事实性问答 | **复杂推理、需要多步验证的任务** |

**实验发现**（Jiang et al. 2023）：
- 在知识密集型任务（如事实验证、开放域 QA）上，FLARE 显著优于标准 RAG
- FLARE 特别适合**答案需要多步推理**且**每一步都可能需要不同知识**的场景
- 主要开销在于多次 LLM 调用（每次生成+检查），延迟增加约 1.5-2 倍

## 🔨 实战演练

### 场景描述

你正在为一家**医疗研究机构**构建一个高级 RAG 系统。医生需要查询关于罕见病的诊断和治疗方案。这些查询通常非常复杂，需要多步推理（例如："一种表现为常染色体显性遗传的神经系统疾病，由 HTT 基因突变引起，目前有哪些基因治疗临床试验？"）。此外，医学领域对答案的准确性要求极高，任何幻觉都可能导致严重后果。

### 你的任务

1. 实现一个 `MedicalAdvancedRAG` 类，整合 Self-RAG 的判断机制和 CRAG 的纠错机制
2. 添加一个 `decomposeQuery` 方法，将复杂医学问题分解为多个子查询
3. 实现 `confidenceScoring`：对每个检索结果计算置信度分数，低于阈值时触发 Web 回退

<details>
<summary>💡 参考实现</summary>

```typescript
class MedicalAdvancedRAG {
  async query(question: string): Promise<{ answer: string; confidence: 'high' | 'medium' | 'low' }> {
    // 1. 分解复杂查询
    const subQueries = await this.decomposeQuery(question);

    // 2. 多跳检索
    const allDocs: string[] = [];
    for (const q of subQueries) {
      const docs = await this.retrieveWithConfidence(q);
      allDocs.push(...docs);
    }

    // 3. 评估检索质量
    const quality = await this.assessQuality(question, allDocs);

    if (quality === 'low') {
      // 回退到权威医学知识库
      const webDocs = await this.searchMedicalDatabase(question);
      return {
        answer: await this.generateWithDocs(question, webDocs),
        confidence: 'medium',
      };
    }

    // 4. 生成并验证
    const answer = await this.generateWithDocs(question, allDocs);
    const verified = await this.verifyWithCitations(answer, allDocs);

    return {
      answer: verified.text,
      confidence: verified.supported ? 'high' : 'low',
    };
  }

  private async decomposeQuery(question: string): Promise<string[]> {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `将以下医学问题分解为 2-3 个独立的子查询，每个子查询可以单独检索：\n${question}`,
      }],
    });
    // 解析子查询列表...
    return subQueries;
  }

  private async retrieveWithConfidence(query: string): Promise<string[]> {
    const results = await this.collection.query({ queryTexts: [query], nResults: 5 });
    const docs = results.documents?.[0] || [];
    const distances = results.distances?.[0] || [];
    // 只保留高置信度结果（距离 < 0.8）
    return docs.filter((_, i) => distances[i] < 0.8);
  }
}
```

</details>

## ⚡ 进阶技巧

### 1. 迭代检索的终止条件

```typescript
// 多跳检索中智能判断何时停止
async function shouldStopRetrieving(
  question: string,
  accumulatedDocs: string[],
  currentAnswer: string
): Promise<boolean> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: `基于已检索的文档，当前能否完整回答以下问题？
问题：${question}
当前回答：${currentAnswer}
返回 YES 或 NO。`,
    }],
  });
  return response.content[0].type === 'text' && response.content[0].text.includes('YES');
}
```

### 2. 检索结果的去重与去噪

```typescript
// 多跳检索后的结果精炼
function refineResults(docs: string[], maxDocs: number = 5): string[] {
  // 1. 去重（基于内容哈希）
  const seen = new Set<number>();
  const unique = docs.filter(d => {
    const hash = d.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    if (seen.has(hash)) return false;
    seen.add(hash);
    return true;
  });

  // 2. 去噪（剔除过短或无关文档）
  return unique
    .filter(d => d.length > 50)       // 排除过短片段
    .slice(0, maxDocs);
}
```

### 3. 自适应检索频率

```typescript
// 根据问题类型动态决定是否检索
async function adaptiveRetrieveDecision(question: string): Promise<boolean> {
  const fastPatterns = [
    /^(什么是|介绍|简述)/,       // 定义类问题：可能 LLM 已知
    /^(你好|嗨|谢谢)/,           // 问候类：无需检索
    /^\d+\s*[+\-*/]/            // 简单计算：无需检索
  ];

  // 快速模式匹配
  if (fastPatterns.some(p => p.test(question))) return false;

  // LLM 判断
  return true;
}
```

## 🧠 知识检查点

### Q1: Self-RAG 与基础 RAG 的核心区别是什么？

<details>
<summary>查看答案</summary>

**答案：** 基础 RAG 每次查询**必然执行检索**（"检索→生成"线性流程），而 Self-RAG 让 LLM **自主判断是否需要检索**（通过特殊的 `[Retrieve]` token）。当 LLM 对答案足够自信时，可以直接回答而不检索，从而节省 Token 并降低延迟。此外，Self-RAG 还引入自我验证机制，检查回答是否被检索结果支持。

</details>

### Q2: Corrective-RAG（CRAG）的"三级决策"是什么？每级对应什么处理策略？

<details>
<summary>查看答案</summary>

**答案：** CRAG 基于检索质量评估做出三级决策：1) **高质量 (Confident)** — 直接使用检索结果生成回答；2) **中等 (Ambiguous)** — 混合检索结果与 Web 搜索结果；3) **低质量 (Not Confident)** — 完全回退到 Web 搜索或知识图谱。这种纠错机制使得 RAG 系统在检索质量不佳时不会"带错回答"。

</details>

### Q3: 多跳 RAG 如何解决"需要多步推理"的复杂问题？它面临的主要挑战是什么？

<details>
<summary>查看答案</summary>

**答案：** 多跳 RAG 通过**迭代推理**解决复杂问题：每步检索的结果作为下一步查询的上下文，逐步构建完整的知识链。主要挑战包括：1) **错误传播**——上一步的检索错误会累积到下一步；2) **终止条件**——何时停止检索是最优的；3) **查询分解质量**——LLM 能否将复杂问题合理分解为独立的子查询。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| ❌ Self-RAG 始终判断"需要检索" | 判断阈值设置过低或 Prompt 未明确不检索的条件 | 在判断 Prompt 中加入"如果这是一个常识性问题，你可以直接回答"的引导 |
| ❌ 多跳检索导致 Token 爆炸 | 未限制最大跳数和每步返回结果数 | 设置 `maxHops=3`，每步最多返回 5 个文档；使用去重和去噪 |
| ❌ CRAG 回退触发过频繁 | 检索质量评估器过于严格 | 调整质量评估阈值；对低分文档使用部分回退而非完全替换 |

## 📝 本章小结

- ✅ **Query 改写** — 用 LLM 将用户问题转化为更适合检索的形式
- ✅ **Self-RAG** — 让 LLM 自主判断是否需要检索、结果是否相关（Asai et al. 2023）
- ✅ **Corrective-RAG** — 检索质量低时自动回退到 Web 搜索，避免"带错回答"
- ✅ **多跳检索** — 复杂问题分解为多步推理，逐步构建完整的知识链
- ✅ **迭代推理** — 每一步检索的结果作为下一步查询的上下文，支持递归推理
- ✅ **三级决策** — 高质量→直接生成；中质量→混合；低质量→回退

## ➡️ 下一章预告

> [第5章：多模态 RAG](./05-multi-modal-rag.md) — 处理图片、表格和 PDF，实现图文联合检索与生成。
