# 第3章：检索策略 — 四种检索方式对比

> 预计学习时间：90-120 分钟

## 🎯 本章目标

深入理解稠密检索（Dense Retrieval）、稀疏检索（Sparse Retrieval/BM25）和混合检索的原理，掌握 DPR 双编码器架构，能够在实际场景中选择合适的检索策略。

## 📋 前置知识

- 理解 RAG 三阶段架构（第1章）
- 了解向量 Embedding 的基本概念（第2章）
- 熟悉余弦相似度等基础距离度量

## 💡 核心概念

### 检索策略全景

RAG 系统的检索策略可以按三个维度分类：

| 维度 | 范畴 | 代表方法 |
|------|------|----------|
| **表示方式** | 稠密向量 | DPR, Sentence-BERT, text-embedding-3 |
| **表示方式** | 稀疏向量 | BM25, TF-IDF, SPLADE |
| **融合方式** | 混合检索 | RRF 融合, 线性加权 |
| **精排方式** | 重排序 | Cohere Rerank, Cross-Encoder |

### 稠密检索（Dense Retrieval）与 DPR

**Dense Passage Retrieval (DPR)** 是 Karpukhin et al. 2020 提出的双编码器架构，是 RAG 系统中最核心的检索技术。

#### DPR 双编码器架构

```
                   余弦相似度
                  ╱         ╲
             查询向量       文档向量
               ↑              ↑
          查询编码器       文档编码器
          (BERT-Q)        (BERT-P)
               ↑              ↑
          用户查询         文档段落
```

DPR 使用**两个独立的 BERT 编码器**（但共享权重或独立训练）：
- **查询编码器 (Query Encoder)**：将用户问题编码为查询向量 `q`
- **文档编码器 (Passage Encoder)**：将文档段落编码为文档向量 `p`

训练时通过**对比学习 (Contrastive Learning)** 优化：
- **正样本**：与查询相关的文档段落
- **负样本**：与查询无关的文档段落（批次内负采样 + BM25 硬负例）

损失函数为 **Negative Log-Likelihood**：

```
L(q, p+, p1-, ..., pn-) = -log( e^sim(q,p+) / (e^sim(q,p+) + Σe^sim(q,pi-)) )
```

#### 稠密 vs 稀疏：核心差异

| 特性 | 稠密检索 (DPR) | 稀疏检索 (BM25) |
|------|----------------|-----------------|
| **表示方式** | 低维稠密向量 (768d) | 高维稀疏向量（词袋） |
| **语义理解** | ✅ 理解同义词和近义表达 | ❌ 仅精确关键词匹配 |
| **计算速度** | 依赖 ANN 索引，大规模略慢 | 倒排索引，极快 |
| **领域泛化** | 需要领域数据微调 | 零成本适配任意文本 |
| **存储开销** | 向量存储成本较高 | 仅存词频统计，极低 |
| **关键词匹配** | ❌ 可能漏掉精确匹配 | ✅ 专有名词精确匹配 |

### 四种检索策略详解

### 1. 语义检索（向量相似度）

```typescript
// 基于 Embedding 的语义搜索
const results = await collection.query({
  queryTexts: ['前端框架比较'],
  nResults: 5,
});
// 优点：理解语义，不依赖关键词
// 缺点：可能漏掉精确匹配
```

### 2. 关键词检索（BM25）

BM25（Best Matching 25）是 TF-IDF 的进阶版本，通过引入**文档长度归一化**和**词频饱和函数**来解决 TF-IDF 的偏差问题。

```
BM25(q, d) = Σ IDF(qi) × (tf(qi,d) × (k1 + 1)) / (tf(qi,d) + k1 × (1 - b + b × |d|/avgdl))
```

- `k1`：词频饱和参数（默认 1.2-2.0）
- `b`：长度归一化参数（默认 0.75）
- `avgdl`：文档平均长度

```typescript
// 基于关键词的传统搜索
// 使用 TF-IDF 算法
// 优点：精确匹配，速度快
// 缺点：不理解同义词和语义
```

### 3. 混合检索（Hybrid Search）

混合检索结合稠密和稀疏检索的优势，通过 **RRF（Reciprocal Rank Fusion）** 或线性加权融合排名。

```typescript
// 语义 + 关键词的融合
async function hybridSearch(query: string, alpha = 0.7) {
  const semanticResults = await semanticSearch(query);  // 语义搜索
  const keywordResults = await keywordSearch(query);    // 关键词搜索

  // RRF（Reciprocal Rank Fusion）融合
  const fused = reciprocalRankFusion(semanticResults, keywordResults, alpha);
  return fused;
}

// RRF 融合算法
function reciprocalRankFusion(
  results1: Array<{ id: string; score: number }>,
  results2: Array<{ id: string; score: number }>,
  alpha: number = 0.7,
  k: number = 60
) {
  const scores = new Map<string, number>();

  results1.forEach((r, rank) => {
    scores.set(r.id, (scores.get(r.id) || 0) + alpha / (k + rank + 1));
  });
  results2.forEach((r, rank) => {
    scores.set(r.id, (scores.get(r.id) || 0) + (1 - alpha) / (k + rank + 1));
  });

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
```

### 4. 重排序（Reranking）

粗排 → 精排两阶段检索策略：先用高效方法召回 Top-K（如 K=20），再用高精度交叉编码器重排取 Top-N（如 N=5）。

```typescript
// 粗排 → 精排两阶段检索
async function searchWithRerank(query: string) {
  // 粗排：向量检索 Top-20
  const roughResults = await vectorSearch(query, 20);

  // 精排：用 Cohere Rerank 模型重排
  const reranked = await rerankWithCohere(query, roughResults, 5);
  return reranked;
}
```

### 何时选择哪种策略？

| 场景 | 推荐策略 | 理由 |
|------|----------|------|
| 通用问答 | 稠密检索 | 语义理解好，覆盖大部分场景 |
| 专有名词/代码匹配 | 稀疏检索（BM25） | 精确匹配优势明显 |
| 高精度场景 | 混合检索 + 重排序 | 两阶段召回 + 精排，效果最佳 |
| 实时聊天 | 稀疏检索 | 延迟最低 |
| 学术/技术文档 | 混合检索 | 兼顾语义相似和术语精确匹配 |

### ANN 索引理论：IVF、HNSW 与 PQ

向量数据库的核心是**近似最近邻搜索（Approximate Nearest Neighbor, ANN）**，它牺牲少量精度来换取数量级的检索速度提升。有三种主流的 ANN 索引结构，各自在速度、召回率和内存消耗之间做出不同权衡：

#### IVF（Inverted File Index，倒排文件索引）

IVF 通过**聚类 + 倒排列表**来缩小搜索范围：

1. **索引构建**：用 K-Means 将全部向量划分为 $N$ 个聚类（如 1024 个），每个聚类有一个质心向量
2. **搜索过程**：查询向量先找到最近的 $k$ 个聚类（如 $k=10$），仅在这些聚类的文档中搜索
3. **候选集**：$N_{list}=1024$，$N_{probe}=10$ → 搜索范围从全库缩小到约 1% 的文档

```
IVF 索引：
┌─────────────────────────────────────┐
│     聚类1    │    聚类2   │  聚类3...│
│  质心: [0.1, │ 质心: [0.9,│         │
│  0.2, 0.3]   │ 0.8, 0.2] │         │
│  ┌──────┐    │  ┌──────┐ │         │
│  │文档A  │    │  │文档C  │ │         │
│  │文档B  │    │  │文档D  │ │         │
│  └──────┘    │  └──────┘ │         │
└──────────────┴────────────┴─────────┘
       ↑                   ↑
       └── 查询找到最近 2 个聚类，仅搜索这些桶
```

**参数**：`N_list`（聚类数）控制索引粒度，`N_probe`（搜索聚类数）控制召回-速度权衡。`N_probe` 越大召回越高、速度越慢。

#### HNSW（Hierarchical Navigable Small World，层级可导航小世界图）

HNSW 构建一个**多层级图结构**，上层是"高速公路"（稀疏连接），下层是"本地道路"（密集连接）：

```
HNSW 层级结构：
  层2（顶层）:   A ─── B ─── C     ← 长跳连接，快速定位区域
                  ╲   ╱
  层1:          A ─ B ─ C ─ D ─ E  ← 中层连接
                  │   │   │
  层0（底层）:    A-B-C-D-E-F-G-H   ← 密集连接，精确搜索
```

- **搜索过程**：从顶层开始（长距离跳跃），逐层下降（逐步细化），在底层（全连接）找到最近邻
- **优势**：**速度最快、召回率最高**的 ANN 算法之一，广泛用于 Milvus、Qdrant 等向量数据库
- **代价**：**内存占用高**（需存储多层图结构），索引构建慢（逐点插入）
- **典型配置**：`M=16`（每节点连接数），`ef_construction=200`（构建质量），`ef_search=50`（搜索质量）

#### PQ（Product Quantization，乘积量化）

PQ 通过**压缩向量维度**来大幅降低内存占用：

1. **分割**：将 768 维向量分割为 $M$ 个子向量（如 $M=8$，每段 96 维）
2. **量化**：对每个子向量空间独立做 K-Means（如 $K=256$，即每个子空间 256 个质心）
3. **编码**：每个子向量用最近的质心 ID（8 bit）表示 → 原向量压缩为 $M \times 8$ bits

```
原始向量 [0.1, 0.2, 0.3, ..., 0.9]  (768维 × 4字节 = 3072字节)
    ↓ 分割为 M=8 个子向量
[0.1,0.2...] [0.3,0.4...] ... [0.8,0.9...]  (各96维)
    ↓ 每个子向量量化为最近质心ID
[42] [157] ... [231]  (8 × 1字节 = 8字节)
```

**优势**：内存节省达 **96-99%**（3072 字节 → 8 字节），适合超大规模（百亿级）向量搜索。

**代价**：**精度损失**（量化误差），搜索时使用近似距离（查表而非精确计算）。

#### 三种索引对比

| 特性 | IVF | HNSW | PQ |
|------|-----|------|-----|
| **搜索速度** | 中等（$O(N_{probe} \times N/N_{list})$） | **最快**（$O(\log N)$） | 中等（查表开销） |
| **召回率@10** | 85-95% | **≥98%** | 80-90% |
| **内存占用** | 中等（向量 + 倒排列表） | **最高**（多层图结构） | **最低**（量化码本） |
| **索引构建速度** | **快**（一次 K-Means） | 慢（逐点插入） | 中等（K-Means 训练） |
| **适用规模** | 千万级 | 百万-千万级 | 亿-百亿级 |
| **典型行业** | 中小规模检索 | 高精度在线检索 | 大规模广告/推荐 |

**实践建议**：
- 百万级库：HNSW（精度优先）或 IVF（成本优先）
- 亿级库：IVF+PQ 组合（先 IVF 粗筛，再 PQ 精排）
- 十亿级：必须使用 PQ 或类似量化技术控制内存

### SPLADE（Learned Sparse Retrieval，学习型稀疏检索）

**SPLADE**（SPLADE: Sparse Lexical and Expansion Model）由 Formal et al. 在 2021 年的论文 *"SPLADE: Sparse Lexical and Expansion Model for Information Retrieval"* 中提出，它**弥合了稠密检索和稀疏检索之间的鸿沟**。

**核心思想**：SPLADE 依然使用 BERT 编码器，但其输出不是稠密向量，而是**为词汇表中的每个词预测一个权重**，生成一个稀疏的高维向量。

```
                        输出：稀疏向量（词汇表 V 上的权重分布）
                        [0, 0.3, 0, 0, 0, 2.1, 0, 0.7, 0, ...]
                         ↑    ↑              ↑      ↑
                        "a" "apple"        "fruit" "juice"

                              ↑
                     SPLADE 编码器（BERT + MLM Head）
                              ↑
                        "What fruits are made from apples?"
```

**关键特性**：

| 特性 | 稠密检索 (DPR) | 稀疏检索 (BM25) | **SPLADE** |
|------|----------------|-----------------|------------|
| 向量类型 | 稠密（768d） | 稀疏（词汇表大小） | **稀疏**（词汇表大小） |
| 语义理解 | ✅ 强 | ❌ 无 | ✅ **强**（BERT 语义理解） |
| 精确匹配 | ❌ 弱 | ✅ 强 | ✅ **兼顾**（保留原始词权重） |
| 可解释性 | ❌ 黑箱 | ✅ 每个词贡献可解释 | ✅ **权重可视，可解释** |
| 索引方式 | ANN 向量索引 | 倒排索引 | **倒排索引**（兼容传统搜索引擎） |

**SPLADE 的优势**：
- **零样本领域泛化**：由于使用倒排索引，可以像 BM25 一样直接用于新领域（无需训练）
- **可解释性**：可以回答"为什么检索到这个文档？"——因为权重高的词匹配了
- **精确匹配保障**：保留原始查询词的权重，不会像稠密检索那样"丢失"专有名词
- **倒排索引兼容**：可直接使用 Elasticsearch 等传统搜索引擎存储和检索

**代价**：推理速度比稠密检索慢（需要 BERT 编码），但检索阶段使用倒排索引非常快。

### ColBERT-v2（延迟交互模型）

**ColBERT-v2** 由 Santhanam et al. 在 2022 年的论文 *"ColBERT-v2: Effective and Efficient Retrieval via Lightweight Late Interaction"* 中提出，是对原始 ColBERT（Khattab & Zaharia 2020）的改进版本。

**核心差异**：不同于 DPR 将整个文档压缩为一个向量，ColBERT 为每个 token 保留独立的嵌入表示。

```
DPR：          文档 → [vector]         （一篇文档 = 一个向量）
ColBERT：      文档 → [v1, v2, ..., vn] （一篇文档 = N 个 token 向量）

查询：         [q1, q2, ..., qm]        （查询也是 token 级别）
```

**MaxSim 相似度计算**：

```
查询 token:  "What"  "fruits"  "are"  "made"  "from"  "apples"
                ↓        ↓       ↓       ↓       ↓        ↓
              [q1]     [q2]     [q3]    [q4]    [q5]     [q6]
                         │
              ┌──────────┼──────────┐
              ↓          ↓          ↓
文档 token:  [d1]      [d2]       [d3]      ...     [d100]
            "Apple"    "is"      "a"               "fruit"

MaxSim(q2, doc) = max(cos(q2, d1), cos(q2, d2), ..., cos(q2, d100))
                = max(cos("fruits" EMB, "Apple" EMB), ...)
```

**评分公式**：
$$S(q, d) = \sum_{i=1}^{|q|} \max_{j=1}^{|d|} \text{cos}(q_i, d_j)$$

即：每个查询 token 找到文档中与之最相似的 token，所有查询 token 的得分求和。

**ColBERT-v2 相比 v1 的改进**：
- **残差压缩（Residual Compression）**：使用质心 + 残差量化的方式压缩文档嵌入，减少存储
- **更快的索引**：优化的索引构建流程
- **更高精度**：在 BEIR 基准上达到 SOTA

**Trade-off 分析**：

| 方法 | 存储 | 检索速度 | 精度 | 适用场景 |
|------|------|---------|------|---------|
| DPR | 低（1 向量/文档） | 快（ANN） | 中 | 通用场景 |
| **ColBERT** | 高（N 向量/文档） | 中等（MaxSim） | **最高** | 高精度检索 |
| BM25 | 极低（倒排索引） | 最快 | 低 | 快速原型 |

**实际应用**：ColBERT 通常作为**重排序阶段**使用——先用 DPR/BM25 粗排召回 Top-100，再用 ColBERT 的 MaxSim 精排取 Top-10。

### 查询侧与文档侧变换

在 RAG 检索中，有两条路径可以缩小查询与文档之间的"语义差距"：变换查询（查询侧）或变换文档（文档侧）。

#### 查询侧变换（Query-Side Transformation）

在检索时对用户查询进行改写或扩展，使其更接近文档的表述方式。

| 技术 | 描述 | 示例 |
|------|------|------|
| **查询扩展（Query Expansion）** | 用同义词/相关词扩展查询 | "肺癌治疗" → "肺癌 治疗 化疗 靶向治疗 免疫治疗" |
| **查询改写（Query Rewriting）** | 将口语化问题转为文档风格 | "这个药有啥副作用？" → "药物不良反应及副作用列表" |
| **Step-back Prompting** | 将具体问题抽象为更通用的查询 | "Hinton 获得了什么奖？" → "Geoffrey Hinton 荣誉奖项" |
| **伪查询生成（Pseudo-Query）** | 用 LLM 生成查询的多种表述 | 生成 3 个语义等价的版本同时检索 |

**优势**：无需修改索引，灵活性高。**劣势**：增加检索延迟（需调 LLM），扩展不当会引入噪声。

#### 文档侧变换（Document-Side Transformation）

在索引时对文档进行处理，使其更容易被检索到。

| 技术 | 描述 | 示例 |
|------|------|------|
| **文档扩展（Document Expansion）** | 为文档添加同义关键词 | 原文"苹果公司" → "苹果公司 Apple Inc. 库比蒂诺" |
| **DocT5Query（Nogueira & Lin 2019）** | 用 T5 模型为每篇文档生成可能被搜索的查询 | 文档 → 生成 10 个可能的用户查询 → 附加到文档后索引 |
| **摘要嵌入（Summary Embedding）** | 用文档摘要代替全文嵌入 | 长文档 → LLM 摘要 → 摘要嵌入（更聚焦） |
| **上下文前缀（Context Prefix）** | 为每个块添加上下文描述（即 Contextual Retrieval） | 见第2章 |

**优势**：检索时无额外开销（所有处理在索引时完成）。**劣势**：增加索引成本，文档扩展不当可能引入噪声。

#### 两者对比

| 维度 | 查询侧变换 | 文档侧变换 |
|------|-----------|-----------|
| **处理时机** | 查询时（在线） | 索引时（离线） |
| **延迟影响** | 增加在线查询延迟 | 不影响在线查询延迟 |
| **灵活性** | 高（可根据不同查询动态调整） | 低（索引后固定） |
| **成本** | 每次查询的成本 | 一次索引的成本 |
| **联合使用** | ✅ 两者可组合使用，效果叠加 | |

**最佳实践**：文档侧做**一次性扩展**（如 DocT5Query），查询侧做**轻量级改写**（如查询扩展）。双管齐下能最大程度缩小查询-文档语义差距。

## 🔨 实战演练

### 场景描述

你正在构建一个**技术文档搜索引擎**，用于搜索 React、Vue 和 Angular 的 API 文档。你需要实现一个混合检索系统，既支持语义化的"状态管理框架"查询，也支持精确的"`useState` API 用法"查询。

### 你的任务

1. 实现一个 `HybridSearchEngine` 类，整合稠密检索和 BM25 检索
2. 添加一个 `smartFusion` 方法，根据查询中是否包含代码片段自动调整 `alpha` 权重（含代码时增大 BM25 权重）
3. 实现重排序阶段：使用 LLM 对 Top-10 结果进行重新排序

<details>
<summary>💡 参考实现</summary>

```typescript
class HybridSearchEngine {
  private alpha: number = 0.7;

  async search(query: string) {
    // 动态调整权重
    this.alpha = this.smartFusion(query);

    // 并行执行两种检索
    const [denseResults, sparseResults] = await Promise.all([
      this.denseSearch(query, 20),
      this.bm25Search(query, 20),
    ]);

    // RRF 融合
    return this.rrfFusion(denseResults, sparseResults, this.alpha);
  }

  private smartFusion(query: string): number {
    // 包含代码片段 → 增大稀疏检索权重
    const hasCode = /[`{}()=>;]/.test(query);
    const hasAPI = /\.[a-z]+\(.*\)/i.test(query);
    return (hasCode || hasAPI) ? 0.4 : 0.7;
  }

  private async denseSearch(query: string, topK: number) {
    return await collection.query({ queryTexts: [query], nResults: topK });
  }

  private async bm25Search(query: string, topK: number) {
    // 使用简单的词频匹配模拟 BM25
    const terms = query.toLowerCase().split(/\s+/);
    // ... BM25 实现
    return results;
  }

  private rrfFusion(results1: any[], results2: any[], alpha: number) {
    // RRF 融合实现
    // ...（同上文的 reciprocalRankFusion）
  }
}
```

</details>

## ⚡ 进阶技巧

### 1. 查询扩展（Query Expansion）

```typescript
// 用 LLM 生成查询的多个同义版本，提高召回率
async function expandQuery(query: string): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `为以下查询生成 3 个语义等价的改写版本，每个版本用不同的措辞：\n查询：${query}\n输出 JSON 数组。`,
    }],
  });
  const variants = JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '[]');
  return [query, ...variants];
}
```

### 2. 延迟交互模型（ColBERT）

```typescript
// ColBERT 的 MaxSim 思想：每个查询 token 与文档 token 逐个匹配取最大
function maxSim(queryEmbeddings: number[][], docEmbeddings: number[][]): number {
  let totalScore = 0;
  for (const qEmb of queryEmbeddings) {
    let maxScore = -Infinity;
    for (const dEmb of docEmbeddings) {
      const sim = cosineSimilarity(qEmb, dEmb);
      if (sim > maxScore) maxScore = sim;
    }
    totalScore += maxScore;
  }
  return totalScore / queryEmbeddings.length;
}
```

### 3. 自适应检索阈值

```typescript
// 检索结果置信度低时自动降低阈值或扩大搜索范围
async function adaptiveRetrieve(query: string): Promise<any[]> {
  let results = await vectorSearch(query, 5);
  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;

  if (avgScore < 0.5) {
    // 置信度低：扩大搜索范围 + 增加 BM25 补充
    const [moreDense, bm25] = await Promise.all([
      vectorSearch(query, 15),
      bm25Search(query, 10),
    ]);
    results = [...results, ...moreDense, ...bm25]
      .filter((r, i, a) => a.findIndex(x => x.id === r.id) === i);
  }
  return results.slice(0, 5);
}
```

## 🧠 知识检查点

### Q1: DPR 的双编码器架构如何工作？训练时使用的损失函数是什么？

<details>
<summary>查看答案</summary>

**答案：** DPR 使用两个 BERT 编码器——查询编码器（BERT-Q）和文档编码器（BERT-P），分别将查询和文档映射到同一向量空间。训练使用**对比学习**，损失函数为 **Negative Log-Likelihood (NLL)**：最大化正样本对的相似度，最小化负样本对的相似度。负样本包括批次内负采样和 BM25 硬负例。

</details>

### Q2: 稠密检索（DPR）和稀疏检索（BM25）各自的优势和劣势是什么？

<details>
<summary>查看答案</summary>

**答案：** 稠密检索优势在于**语义理解**——能匹配同义词和近义表达；劣势在于需要领域微调、计算成本高、对专有名词匹配差。稀疏检索（BM25）优势在于**精确匹配**——专有名词和代码片段匹配准确、计算极快；劣势在于不理解语义，无法处理同义词。两者结合（混合检索）通常效果最佳。

</details>

### Q3: 什么是 RRF（Reciprocal Rank Fusion）？它的参数 `k` 和 `alpha` 如何影响融合结果？

<details>
<summary>查看答案</summary>

**答案：** RRF 是一种无参数化的排名融合方法，通过 `score = 1 / (k + rank)` 计算每个文档在各个结果列表中的得分。`k`（默认 60）控制排名衰减速率——`k` 越小，高位排名的影响越大。`alpha` 控制两个检索系统的权重比例——`alpha=0.7` 表示稠密检索占 70% 权重，稀疏检索占 30%。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| ❌ 检索结果全是无关文档 | 查询嵌入和文档嵌入使用了不同的模型或版本 | 确保索引和检索使用**同一个嵌入模型**，且模型版本一致 |
| ❌ BM25 分数异常偏高/偏低 | 参数 `k1` 或 `b` 未根据文档集调整 | `k1=1.2-2.0` 词频饱和，`b=0.75` 长度归一化；短文本场景增大 `b` |
| ❌ 混合检索反而低于单种检索 | RRF 融合权重设置不当，噪声被放大 | 先用小规模测试确定最优 `alpha`；考虑仅在高置信度时混合 |

## 📝 本章小结

- ✅ **稠密检索（DPR）** — 双编码器架构，通过对比学习训练，理解语义
- ✅ **稀疏检索（BM25）** — 基于词频和文档长度归一化，精确匹配
- ✅ **混合检索** — RRF 融合稠密+稀疏，兼顾语义和精确匹配
- ✅ **重排序** — 粗排（高效召回）→ 精排（交叉编码器重排）两阶段策略
- ✅ **检索-生成权衡** — 更多文档 = 更高召回 = 更多噪声，需要合理控制 K 值和排序策略
- ✅ **查询扩展** — 用 LLM 生成语义等价改写，提高多样化召回

## ➡️ 下一章预告

> [第4章：高级 RAG 技术](./04-advanced-rag.md) — Self-RAG、Corrective-RAG、多跳检索等高级技术。
