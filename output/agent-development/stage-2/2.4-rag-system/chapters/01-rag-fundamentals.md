# 第1章：RAG 基础架构 — 检索增强生成

> 预计学习时间：70-90 分钟

## 🎯 本章目标

理解 RAG 的核心架构和工作流程，掌握从检索到生成的完整管线。

## 💡 核心概念

### 什么是 RAG？

**RAG（Retrieval-Augmented Generation）** 由 Lewis et al. 在 2020 年的论文 *"Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"* 中首次提出。其核心思想是：**不依赖 LLM 内部参数化记忆，而是通过检索外部知识库来增强生成质量**。

**生活类比：** 你是一个学生在考试。RAG 就像开卷考试——你不完全依赖记忆（LLM 的训练数据），而是可以翻阅教材（检索到的文档）来回答问题。

```
传统 LLM：  问题 → LLM → 回答（可能过时或不准确）

RAG：       问题 → 检索相关文档 → 问题 + 文档 → LLM → 回答（基于最新信息）
```

RAG 的核心优势：
- **知识更新**：仅需更新知识库，无需重新训练模型
- **可溯源**：回答附有引用来源，便于验证
- **减少幻觉**：LLM 基于检索到的真实文本生成，而非全凭记忆
- **领域适应**：快速适配垂直领域知识

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

#### 索引阶段 (Indexing)
将原始文档转换为可检索的向量表示：
1. **文档加载**：从多种源（PDF、网页、数据库）加载文档
2. **分块 (Chunking)**：将长文本切割为语义完整的块（如 512 Token）
3. **嵌入 (Embedding)**：用嵌入模型（如 `text-embedding-3-small`）将文本块转为向量
4. **存储**：将向量存入向量数据库（如 Chroma、Pinecone、Weaviate）

#### 检索阶段 (Retrieval)
用户提问后实时检索最相关的知识：
1. **查询编码**：将用户问题转为同样的向量空间
2. **向量相似搜索**：在向量数据库中执行近似最近邻 (ANN) 搜索
3. **Top-K 返回**：返回最相似的 K 个文档块

#### 生成阶段 (Generation)
将检索到的文档与原始问题拼接，送入 LLM 生成回答：
1. **Prompt 组装**：将检索结果作为上下文注入 Prompt
2. **约束生成**：要求 LLM 仅基于检索到的文档回答
3. **引用标注**：在回答中标注信息来源

### 检索-生成权衡 (Retrieval-Generation Tradeoff)

RAG 系统面临一个核心矛盾：**检索更多文档可以提高召回率，但也会引入噪声**。

- **K 值过小**（如 K=1）：可能遗漏关键信息，回答不完整
- **K 值过大**（如 K=10）：相关文档被淹没在噪声中，LLM 容易"迷失在中间"

**"Lost in the Middle"**（Liu et al. 2023）的研究发现：**当相关信息出现在长上下文的中段时，LLM 的利用率显著下降**。模型倾向于使用开头和结尾的信息，而忽略中间部分。这意味着 RAG 系统的文档排序策略至关重要——最相关的文档应放在 Prompt 的开头或结尾。

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

### RAG 与 Fine-tuning 的对比与选择

RAG 和 Fine-tuning（微调）是增强 LLM 能力的两种互补范式，理解二者的区别对于系统设计至关重要。

| 维度 | RAG | Fine-tuning |
|------|-----|-------------|
| **知识更新** | 仅需更新知识库文档，**无需重新训练** | 需重新训练模型，周期长、成本高 |
| **可溯源** | 回答可引用具体文档，**天然可验证** | 模型是"黑箱"，无法追溯信息来源 |
| **幻觉控制** | 基于检索到的真实文本生成，幻觉率低 | 模型依赖参数化记忆，仍有幻觉风险 |
| **风格/格式教学** | 差 — 难以通过 Prompt 教会复杂输出格式 | **强** — 可学会特定写作风格、术语体系 |
| **长尾知识** | **强** — 可以索引海量低频知识 | 弱 — 低频知识难以通过训练记住 |
| **推理能力** | 弱 — 不改变 LLM 的推理能力 | **强** — 可增强特定任务的推理能力 |
| **延迟** | 增加检索步骤的延迟（50-200ms） | 零额外推理延迟 |
| **成本** | 持续支付检索 + 生成成本 | 一次性训练成本，推理成本不变 |

**何时选择 RAG？**
- 知识需要频繁更新（新闻、产品手册、政策法规）
- 需要引用来源验证答案
- 领域知识范围广、更新快
- 无法承担微调的计算成本

**何时选择 Fine-tuning？**
- 需要模型学习特定的输出格式或风格（如 JSON 输出、法律文书格式）
- 需要提升模型在特定任务上的推理能力
- 知识基本稳定，不需要频繁更新
- 延迟敏感的实时应用

**最佳实践：RAG + Fine-tuning 结合**。用微调教会模型输出格式和推理逻辑，用 RAG 提供最新知识。例如：微调模型学会"以医生口吻回答"，RAG 提供最新的医学文献。

### FiD (Fusion-in-Decoder)

**FiD（Fusion-in-Decoder）** 由 Izacard & Grave 在 2020 年的论文 *"Leveraging Passage Retrieval with Generative Models for Open Domain Question Answering"* 中提出。它是一种对标准 RAG 生成阶段的架构优化。

**核心思想**：每个检索到的文档与问题独立编码，然后在解码器（Decoder）层融合。

```
标准 RAG:   [问题 + 文档1 + 文档2 + 文档3] → 编码器 → 解码器 → 输出
                                         ↑
                                   所有文档拼接后编码（相互干扰）

FiD:         [问题 + 文档1] → 编码器1 → \
             [问题 + 文档2] → 编码器2 →  融合 → 解码器 → 输出
             [问题 + 文档3] → 编码器3 → /
                                         ↑
                                   文档独立编码，仅在解码器融合
```

**优势**：
- **避免文档间相互干扰**：每个文档独立编码，不会因为长上下文中的"Lost in the Middle"效应而丢失信息
- **可扩展性**：理论上可支持任意数量的检索文档（实践中通常 5-20 个）
- **并行计算**：各文档编码可并行执行

**代价**：K 个文档需要 K 次编码器前向传播，计算量随 K 线性增长。但编码器通常比解码器轻量，总体成本可控。

### REPLUG (Retrieve-then-Play)

**REPLUG** 由 Shi et al. 在 2023 年的论文 *"REPLUG: Retrieval-Augmented Black-Box Language Models"* 中提出，其核心创新是**让检索器根据生成器的反馈来学习**，形成检索-生成的闭环优化。

**核心流程**：

```
1. 检索阶段：   查询 → 检索器 → Top-K 文档
2. 生成阶段：   查询 + 文档 → LLM（固定/黑盒）→ 生成结果
3. 评分阶段：   LLM 为每个检索文档计算生成概率 p(y|x,d)
4. 反馈阶段：   用生成概率作为奖励信号，更新检索器
5. 循环：       回到步骤 1，使用更新后的检索器
```

**关键特性**：
- **黑盒兼容**：LLM 不需要开放权重或梯度，API 调用即可（因此称为"Black-Box"）
- **检索器持续改进**：通过 LM 的反馈（文档对生成的贡献度）来优化检索排序
- **离线/在线两用**：可离线批量更新检索器，也可在线实时调整

REPLUG 揭示了 RAG 系统中的一个重要洞察：**检索器和生成器不应该独立优化，它们之间存在协同效应**——好的检索结果让生成质量更高，而生成反馈可以指导检索器学习什么算是"好"的结果。

### RAG 的形式化问题定义

从概率建模的角度，RAG 可以形式化为一个**边际化（Marginalization）**过程。给定用户查询 $x$，RAG 系统通过检索文档集 $D$ 来生成答案 $y$：

$$p(y|x) = \sum_{d \in D} p_{\text{retriever}}(d|x) \times p_{\text{generator}}(y|x, d)$$

其中：

- **$p_{\text{retriever}}(d|x)$** — 检索器给出的文档 $d$ 与查询 $x$ 的相关性概率（通常基于向量相似度的 softmax 归一化）
- **$p_{\text{generator}}(y|x, d)$** — 生成器在给定查询 $x$ 和检索文档 $d$ 条件下输出答案 $y$ 的概率
- **求和遍历所有文档 $d \in D$** — 理论上需要对整个知识库求和，实践中通过 Top-K 截断

**三种变体**：

| 变体 | 公式 | 特点 |
|------|------|------|
| **RAG-Token** | $p(y|x) = \prod_t \sum_{d \in D} p(d|x) \times p(y_t|x, d, y_{<t})$ | 每个 token 重新 marginalize，细粒度但计算量大 |
| **RAG-Sequence** | $p(y|x) = \sum_{d \in D} p(d|x) \times p(y|x, d)$ | 整个序列使用同一个文档，效率高 |
| **FiD** | $p(y|x) \propto \prod_{d \in D} p(y|x, d)^{1/K}$ | 独立编码后解码器融合，近似 marginalize |

这个形式化定义揭示了 RAG 的本质：**它不是一个"检索然后生成"的两阶段流程，而是一个概率边际化过程，检索器和生成器共同定义了答案的分布**。

## 🔨 实战演练

### 场景描述

你正在为一家电商公司构建一个客服知识库 RAG 系统。公司有大量的产品手册、退换货政策和 FAQ 文档。你需要实现一个基础 RAG 系统，让客服人员能快速查询产品信息和政策条款。

### 你的任务

1. 基于上面的 `BasicRAG` 类，添加一个 `batchIngest` 方法，支持批量文档摄入（每次最多 10 个文档）
2. 添加 `filterByMetadata` 参数到 `retrieve` 方法，支持按文档类别过滤（如只搜索"退货政策"类别的文档）
3. 在生成阶段添加一个 `confidence` 分数：当检索结果的平均相似度低于 0.6 时，回答应附加"建议咨询人工客服"的兜底提示

<details>
<summary>💡 参考实现</summary>

```typescript
async batchIngest(documents: Array<{ id: string; content: string; metadata?: any }>, batchSize: number = 10) {
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    await Promise.all(batch.map(doc => this.ingest([doc])));
    console.log(`📦 已处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)}`);
  }
}

async retrieve(query: string, topK: number = 3, filter?: Record<string, any>) {
  const results = await this.collection.query({
    queryTexts: [query],
    nResults: topK,
    where: filter, // 按元数据过滤
  });
  // ...
}

async query(question: string): Promise<{ answer: string; sources: any[] }> {
  const sources = await this.retrieve(question, 3);
  const avgScore = sources.reduce((sum, s) => sum + s.score, 0) / sources.length;

  if (avgScore < 0.6) {
    return {
      answer: "我找到了一些可能相关的信息，但不太确定是否准确。建议您咨询人工客服获取更可靠的答案。",
      sources,
    };
  }
  // ... 正常生成流程
}
```

</details>

## ⚡ 进阶技巧

### 1. 使用 MMR（最大边际相关性）增加多样性

```typescript
// MMR 避免返回过于相似的结果
async function retrieveWithMMR(query: string, topK: number = 5, lambda: number = 0.5) {
  const candidateResults = await collection.query({ queryTexts: [query], nResults: topK * 2 });
  const candidates = candidateResults.documents?.[0] || [];
  const queryEmbedding = await getEmbedding(query);

  const selected: string[] = [];
  const candidateEmbeddings = await Promise.all(candidates.map(c => getEmbedding(c)));

  while (selected.length < topK && candidates.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const simToQuery = cosineSimilarity(queryEmbedding, candidateEmbeddings[i]);
      const maxSimToSelected = selected.length > 0
        ? Math.max(...selected.map(s => cosineSimilarity(candidateEmbeddings[i], getEmbeddingSync(s))))
        : 0;
      const mmrScore = lambda * simToQuery - (1 - lambda) * maxSimToSelected;
      if (mmrScore > bestScore) { bestScore = mmrScore; bestIdx = i; }
    }

    selected.push(candidates[bestIdx]);
    candidates.splice(bestIdx, 1);
    candidateEmbeddings.splice(bestIdx, 1);
  }
  return selected;
}
```

### 2. 动态 K 值选择

```typescript
// 根据问题复杂度动态调整检索数量
async function dynamicTopK(question: string): Promise<number> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 50,
    messages: [{ role: 'user', content: `判断这个问题需要多少篇参考文档（1-10）："${question}"\n只需输出数字。` }],
  });
  const k = parseInt(response.content[0].type === 'text' ? response.content[0].text : '3');
  return Math.max(1, Math.min(10, k));
}
```

### 3. 使用 Prompt Caching 优化长上下文

```typescript
// 将固定系统提示缓存，减少 Token 消耗
const systemPrompt = [{
  type: 'text' as const,
  text: `你是一个基于知识库的问答助手。规则：
1. 仅基于提供的参考文档回答
2. 如果文档中没有相关信息，请明确说明
3. 使用 [1][2][3] 格式标注引用来源
4. 不要编造信息`,
  cache_control: { type: 'ephemeral' as const },
}];
```

## 🧠 知识检查点

### Q1: RAG 的三阶段架构是什么？每个阶段的核心任务是什么？

<details>
<summary>查看答案</summary>

**答案：** 三阶段架构为 **Indexing（索引）→ Retrieval（检索）→ Generation（生成）**：

- **索引阶段**：加载文档 → 分块 → 生成 Embedding → 存入向量数据库
- **检索阶段**：用户提问 → 问题转向量 → 向量相似搜索 → 返回 Top-K 文档
- **生成阶段**：构建 Prompt（问题 + 检索结果）→ LLM 生成回答 → 输出带引用的答案

</details>

### Q2: "Lost in the Middle" 现象对 RAG 系统的文档排序有什么启示？

<details>
<summary>查看答案</summary>

**答案：** Liu et al. 2023 的研究发现，当相关信息出现在长上下文的中段时，LLM 的利用率显著下降。模型倾向于使用开头和结尾的信息，忽略中间部分。**启示**：应将最相关的文档放在 Prompt 的开头或结尾位置，并在文档超过 4-5 篇时考虑重排序策略。

</details>

### Q3: RAG 相比传统 LLM 微调（Fine-tuning）有哪些优势？

<details>
<summary>查看答案</summary>

**答案：**
1. **知识更新成本低**：RAG 只需更新知识库文档，微调需要重新训练模型
2. **可溯源**：RAG 的回答可引用具体文档，微调模型无法提供信息来源
3. **减少幻觉**：RAG 基于检索到的真实文本生成，微调模型仍会产生幻觉
4. **领域适配快**：RAG 可快速适应新领域，只需添加领域文档

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| ❌ 回答包含文档中没有的信息 | 生成阶段未约束 LLM 仅使用检索内容 | 在 System Prompt 中明确要求"仅基于提供的文档回答"；设置 `temperature=0` |
| ❌ 检索结果不相关 | 查询嵌入与文档嵌入分布不一致 | 确保查询和文档使用**同一个嵌入模型**；考虑使用混合检索（Hybrid Search） |
| ❌ K 值固定导致质量波动 | 不同复杂度的问题需要不同数量的文档 | 实施动态 K 值选择或基于检索置信度动态截断 |

## 📝 本章小结

- ✅ **RAG 定义** — 检索增强生成，让 LLM 基于外部知识回答，由 Lewis et al. 2020 提出
- ✅ **三阶段** — Indexing（索引）→ Retrieval（检索）→ Generation（生成）
- ✅ **核心价值** — 解决 LLM 知识过时、幻觉、领域知识不足的问题
- ✅ **检索-生成权衡** — K 值过小漏信息，过大引入噪声；"Lost in the Middle" 要求合理排序
- ✅ **DPR 基础** — 双编码器架构：查询编码器 + 文档编码器，将检索转化为向量空间中的最近邻搜索

## ➡️ 下一章预告

> [第2章：文档处理管线](./02-document-processing.md) — 学习如何将原始文档转换为高质量的可检索知识，掌握分块策略与归一化技术。
