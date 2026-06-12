# 第7章：RAG 优化 — 性能与成本

> 预计学习时间：80-100 分钟

## 🎯 本章目标

掌握 RAG 系统在生产环境中的性能优化策略，理解延迟、成本与质量三者之间的平衡关系，能够针对不同业务场景制定合理的优化方案。

## 📋 前置知识

- 掌握 RAG 全流程架构（第1-3章）
- 了解 Embedding 和 LLM 的 API 计费模式
- 熟悉基础系统性能指标（延迟、吞吐量、QPS）

## 💡 核心概念

### RAG 优化的三角平衡

RAG 系统在生产环境中面临三个互相制约的目标：

```
        质量 (Quality)
           /\
          /  \
         /    \
        /______\
   延迟 (Latency)  成本 (Cost)
```

| 目标 | 优化方向 | 可能代价 |
|------|----------|----------|
| **降低延迟** | 缓存、批处理、轻量模型 | 质量下降（轻量模型能力弱） |
| **降低成本** | 模型层化、Prompt Caching、本地模型 | 延迟增加（本地模型推理慢） |
| **提升质量** | 多跳检索、重排序、更大模型 | 延迟和成本同步增加 |

### 延迟优化

#### 1. 语义缓存 (Semantic Caching)

语义缓存不仅缓存完全相同的查询，还缓存**语义相似**的查询。例如，"RAG 是什么"和"解释 RAG 系统"应该命中同一缓存。

```typescript
class SemanticCache {
  private cache: Map<string, { answer: string; embedding: number[] }> = new Map();
  private threshold: number = 0.95; // 语义相似度阈值

  async get(query: string): Promise<string | null> {
    const queryEmb = await getEmbedding(query);

    for (const [, entry] of this.cache) {
      const similarity = cosineSimilarity(queryEmb, entry.embedding);
      if (similarity >= this.threshold) {
        return entry.answer; // 命中语义缓存
      }
    }
    return null;
  }

  async set(query: string, answer: string) {
    this.cache.set(query, {
      answer,
      embedding: await getEmbedding(query),
    });
  }
}
```

#### 2. Embedding 批量处理

```typescript
// Embedding 批量生成，减少 API 调用次数
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
```

#### 3. 异步索引新文档

```typescript
// 不阻塞主流程，在后台索引
async function asyncIndex(document: string) {
  setImmediate(async () => {
    await ingestDocument(document);
    console.log('文档索引完成');
  });
}
```

### 成本优化

#### 模型层化 (Model Tiering)

不同任务使用不同层级的模型，在质量和成本之间取得平衡：

| 任务 | 推荐模型 | 成本 vs Haiku |
|------|----------|--------------|
| 简单查询/问候 | Haiku / GPT-4o-mini | 1x（基准） |
| 重排序/简单推理 | Haiku | 1x |
| 复杂知识问答 | Sonnet / GPT-4o | 5-10x |
| 多跳推理/代码生成 | Opus / o1 | 20-50x |

```typescript
// 使用更便宜的 Embedding 模型（本地模型免费）
// 重排序时用小模型（Haiku）
async function cheapRerank(query: string, docs: string[]) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001', // 便宜模型
    max_tokens: 500,
    messages: [{ role: 'user', content: `排序以下文档与查询的相关性：\n查询：${query}\n文档：${docs.join('\n---\n')}` }],
  });
  return response;
}

// Prompt Caching for RAG system prompt
const system = [{
  type: 'text' as const,
  text: `你是一个知识库问答助手。...（很长的系统提示）`,
  cache_control: { type: 'ephemeral' as const },
}];
```

#### 检索优化技术

| 技术 | 延迟影响 | 成本影响 | 质量影响 |
|------|----------|----------|----------|
| **IVF 索引** | ↓↓ 检索加速 | — | ↓ 召回率略降 |
| **HNSW 索引** | ↓↓ 检索加速 | ↑ 内存成本 | — 召回率不变 |
| **量化 (PQ)** | ↓ 检索加速 | ↓↓ 存储成本 | ↓↓ 精度损失 |
| **预过滤** | ↓↓ 大幅加速 | — | ↑ 质量提升 |
| **文档剪枝** | ↓ 检索加速 | ↓ 存储成本 | ↓ 可能漏信息 |

### 成本模型公式

在优化 RAG 系统之前，首先需要量化"成本"是什么。一个完整的 RAG 请求的成本模型可以分解为：

```
total_cost = N_queries × (C_embed + C_retrieve + C_rerank + C_generate)
```

其中每个组件：

| 组件 | 公式 | 说明 |
|------|------|------|
| **C_embed** | `(query_chars / 1000) × P_embed` | 每次查询的 Embedding API 调用成本 |
| **C_retrieve** | `P_vector_db × N_shards` | 向量数据库查询成本（自建则主要是计算资源） |
| **C_rerank** | `(K_rerank × doc_chars / 1000) × P_rerank` | 重排序成本（通常按输入 Token 计费） |
| **C_generate** | `(prompt_tokens + output_tokens) × P_llm` | LLM 生成成本（按 Token 计费） |

**示例**：假设每天 10,000 次查询，使用 text-embedding-3-small（$0.02/1K tokens）、Sonnet（$3/1M input tokens, $15/1M output tokens）、Top-5 检索 + 重排序：

```
C_embed  ≈ 10,000 × ($0.02 × 0.1K) = $20/天
C_rerank ≈ 10,000 × ($0.02 × 5 × 0.5K) = $50/天
C_generate ≈ 10,000 × ($3 × 2K + $15 × 0.5K) / 1M = $135/天
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
总成本 ≈ $205/天 ≈ $6,150/月
```

该模型帮助决策：**如果将 Sonnet 替换为 Haiku（$0.25/1M input），C_generate 可降至约 $18/天，总成本减少 87%**。但也需评估质量损失是否可接受。

### LLMLingua / Selective Context：检索压缩

检索到的上下文越长，LLM 的成本和延迟越高。**LLMLingua**（Jiang et al. 2023）和 **Selective Context**（Li et al. 2023）是两类主动压缩检索结果的代表性技术。

**LLMLingua** 的核心思想是：**不是所有 Token 对生成都有用**。它在检索后的上下文中识别并移除低信息量的 Token，压缩率可达 2-5 倍。

```
原始检索结果 (3000 Tokens):
  "根据公司规定，员工...报销流程...应当提交...发票...财务部门..."（包含大量停顿词、修饰语）

LLMLingua 压缩后 (800 Tokens):
  "公司规定 员工 报销 提交 发票 财务部门"（保留关键语义 Token）
```

LLMLingua 使用一个小型语言模型（如 GPT-2）逐 Token 计算**信息密度**，移除概率高的 Token（即"过于可预测"的 Token），因为这些 Token 对生成贡献有限。

**Selective Context** 则采用另一种策略——它将检索到的文档按句子粒度评估**对当前查询的重要性**，只保留最相关的句子。与 LLMLingua 的 Token 级剪枝相比，Selective Context 的句子级剪枝保留了局部语义完整性。

| 技术 | 剪枝粒度 | 压缩率 | 质量保持 | 额外延迟 |
|------|----------|--------|----------|----------|
| LLMLingua | Token 级 | 2-5x | 约 95% | 低（单次小模型推理） |
| Selective Context | 句子级 | 2-3x | 约 97% | 低（句子嵌入相似度） |

两者都可与**缓存**结合：将压缩后的上下文缓存起来，后续相似查询可直接复用压缩结果。

### Speculative Decoding：无损加速生成

**Speculative Decoding**（Leviathan et al. 2023, Chen et al. 2023）是一种**输出质量完全不变**的加速技术。其核心洞察是：**小模型生成快但质量差，大模型质量好但速度慢——让两者协作**。

```
传统生成（自回归，逐步）:
  大模型: "公" → "司" → "规" → "定" → "..."（每步一次前向传播）

Speculative Decoding:
  小模型(草稿): "公" "司" "规" "定" "..."（快速生成 4 个候选 Token）
  大模型(验证): → "公" ✓ → "司" ✓ → "规" ✓ → "定" ✓（一次前向传播验证全部）
  并行验证 → 接受连续匹配的 Token → 单步生成了 4 个 Token
```

工作流程：
1. **草稿模型（Draft Model）**：一个小型模型（如 100M 参数），快速自回归生成 K 个候选 Token
2. **目标模型（Target Model）**：原始大模型（如 70B 参数），**并行**计算这 K 个候选 Token 的 logits
3. **拒绝采样**：逐位比较草稿和目标模型的分布——如果某 Token 在目标模型中的概率足够高则接受，否则从修正分布中重新采样

实际效果：在 70B 参数的 LLaMA 上，Speculative Decoding 可实现 **2-3x 的生成加速**，且数学上保证了**输出分布与原始大模型完全一致**（即无损）。对于 RAG 系统，这意味着在不牺牲回答质量的前提下降低用户等待时间。

### 文档压缩：从 Token 剪枝到语义浓缩

检索压缩不仅限于 Token 剪枝，更系统的文档压缩策略分为三个层级：

```
层级 1: Token 剪枝
  移除低信息 Token（LLMLingua），压缩率 2-5x，质量保持高

层级 2: 提取式压缩（Extractive Compression）
  从文档中选择最相关的句子/段落，抛弃无关内容
  压缩率 3-10x，质量取决于选择策略（基于相似度 vs 基于重要性分类器）

层级 3: 抽象式压缩（Abstractive Compression）
  用小 LLM 对每个检索块生成摘要/总结，保留核心信息
  压缩率 5-20x，质量取决于摘要模型的性能
```

| 方法 | 压缩率 | 质量 | 延迟开销 | 代表工作 |
|------|--------|------|----------|----------|
| Token 剪枝 | 2-5x | 高 | 极低 | LLMLingua (2023) |
| 提取式压缩 | 3-10x | 中-高 | 低 | Selective Context (2023), PRCA (2023) |
| 抽象式压缩 | 5-20x | 中 | 中 | Compressed Context (2023), Recomp (2024) |

**质量与速度的权衡**：Token 剪枝最快但无法消除冗余段落；提取式压缩能删除整段无关内容，但可能丢失隐式相关的线索；抽象式压缩压缩率最高，但会产生摘要特有的"信息衰减"——细节被泛化、精确数字被近似表述替代。

实践中推荐**分层组合策略**：
1. 先用提取式压缩（保留与查询相似度 > 阈值的句子）
2. 对剩余内容用 LLMLingua 做 Token 级剪枝
3. （可选）对超长上下文（>10K tokens）先做抽象式压缩，再做提取式压缩

这样可以同时获得高压缩率和可接受的质量保真度。

## 🔨 实战演练

### 场景描述

你维护着一个面向**全球用户**的企业知识库 RAG 系统。当前系统面临以下挑战：
- **延迟高**：用户平均等待时间 4.5 秒（目标 < 2 秒）
- **成本高**：每月 API 费用 $12,000（预算 $8,000）
- **高峰期压力**：早 9-11 点 QPS 达到 200，系统响应急剧变慢

### 你的任务

1. 分析系统瓶颈，设计一个包含三层优化（缓存 + 模型层化 + 检索加速）的优化方案
2. 实现一个 `CostOptimizedRAG` 类，其中包含：
   - 语义缓存（相似度阈值 0.92）
   - 模型选择器：简单查询用 Haiku，复杂查询用 Sonnet
   - 检索预过滤：按用户权限和文档类别缩小搜索范围

<details>
<summary>💡 参考实现</summary>

```typescript
type QueryComplexity = 'simple' | 'medium' | 'complex';

class CostOptimizedRAG {
  private semanticCache: SemanticCache;
  private haiku = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  private sonnet = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  async query(question: string, context?: { userId?: string; category?: string }) {
    // 1. 检查语义缓存
    const cached = await this.semanticCache.get(question);
    if (cached) return { answer: cached, source: 'cache' };

    // 2. 判断查询复杂度
    const complexity = await this.classifyQuery(question);

    // 3. 检索预过滤
    const filter: any = {};
    if (context?.category) filter.category = context.category;

    const docs = await this.collection.query({
      queryTexts: [question],
      nResults: 5,
      where: filter,
    });

    // 4. 根据复杂度选择模型
    const model = complexity === 'simple' ? 'claude-haiku-4-5-20251001'
      : complexity === 'medium' ? 'claude-sonnet-4-5-20241022'
      : 'claude-opus-4-5-20251022';

    const response = await this.haiku.messages.create({
      model,
      max_tokens: complexity === 'simple' ? 300 : 1500,
      system: `基于以下文档回答问题：\n${docs.documents?.[0]?.join('\n')}`,
      messages: [{ role: 'user', content: question }],
    });

    return { answer: response.content[0].type === 'text' ? response.content[0].text : '' };
  }

  private async classifyQuery(question: string): Promise<QueryComplexity> {
    const patterns = {
      simple: [/^(什么是|介绍|你好|谢谢)/, /^\w{1,10}$/],
      complex: [/^(为什么|如何|比较|分析|对比)/, /.{50,}/],
    };
    if (patterns.simple.some(p => p.test(question))) return 'simple';
    if (patterns.complex.some(p => p.test(question))) return 'complex';
    return 'medium';
  }
}
```

</details>

## ⚡ 进阶技巧

### 1. 预计算结果缓存

```typescript
// 针对高频查询预计算并缓存答案
class PrecomputedCache {
  private db: Map<string, string>;

  async warmUp(highFrequencyQueries: string[]) {
    const results = await Promise.all(
      highFrequencyQueries.map(async (q) => ({
        query: q,
        answer: await fullRAGPipeline(q),
      }))
    );
    results.forEach(r => this.db.set(r.query, r.answer));
    console.log(`🔥 预热完成：${results.length} 个高频查询已缓存`);
  }
}
```

### 2. 流式输出优化

```typescript
// 先返回检索结果，再流式生成最终回答
async function streamingRAG(question: string, res: Response) {
  // 1. 立即返回检索到的文档摘要
  res.write(JSON.stringify({ type: 'retrieval', docs: await retrieve(question) }));
  // 2. 流式生成回答
  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 2000,
    messages: [{ role: 'user', content: question }],
  });
  for await (const chunk of stream) {
    res.write(JSON.stringify({ type: 'token', text: chunk.delta?.text || '' }));
  }
  res.end();
}
```

### 3. 自适应节能模式

```typescript
// 非高峰期使用更便宜的配置
function getTierByTime(): 'performance' | 'balanced' | 'economy' {
  const hour = new Date().getHours();
  if (hour >= 9 && hour <= 11) return 'performance'; // 高峰期
  if (hour >= 8 && hour <= 18) return 'balanced';    // 工作时间
  return 'economy';                                    // 非工作时间
}

function getConfig(tier: string) {
  const configs = {
    performance: { model: 'sonnet', cacheTTL: 60, topK: 5 },
    balanced: { model: 'haiku', cacheTTL: 300, topK: 3 },
    economy: { model: 'haiku', cacheTTL: 3600, topK: 2 },
  };
  return configs[tier] || configs.balanced;
}
```

## 🧠 知识检查点

### Q1: 语义缓存（Semantic Cache）和传统缓存（Exact Cache）有什么区别？

<details>
<summary>查看答案</summary>

**答案：** 传统缓存只匹配**完全相同的查询**（字符串精确匹配），而语义缓存基于**向量相似度**判断语义相近的查询是否命中缓存。例如，"RAG 是什么"和"解释 RAG 系统"在语义缓存中可以命中同一个缓存条目，但在传统缓存中会视为不同查询。语义缓存可以显著提升缓存命中率（30-50%），但需要额外的 Embedding 计算开销。

</details>

### Q2: 模型层化（Model Tiering）策略如何平衡成本和质量？

<details>
<summary>查看答案</summary>

**答案：** 模型层化将不同复杂度的查询路由到不同成本的模型——简单查询（问候、定义类）使用 Haiku/GPT-4o-mini（成本低），中等复杂查询（知识问答）使用 Sonnet/GPT-4o（中等成本），复杂推理（多跳、分析）使用 Opus/o1（高成本）。通过查询分类器（规则或轻量模型）动态选择，可节省 40-60% 的 API 成本，同时保持复杂查询的高质量。

</details>

### Q3: RAG 系统的延迟瓶颈通常在哪里？如何针对性地优化？

<details>
<summary>查看答案</summary>

**答案：** RAG 系统的三大延迟瓶颈：1) **检索阶段**（30-40%）——向量数据库的 ANN 搜索，优化方案：HNSW 索引、IVF 量化、预过滤；2) **LLM 生成阶段**（40-50%）——模型推理时间，优化方案：使用更小的模型、Prompt Caching、流式输出；3) **网络 IO**（10-20%）——API 调用延迟，优化方案：本地部署模型、连接池复用、地理就近部署。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| ❌ 缓存命中率低（<10%） | 使用了精确字符串匹配缓存，用户提问方式多样化 | 改用语义缓存（余弦相似度阈值 0.92-0.95），或对查询做归一化（去除停用词、同义替换） |
| ❌ 模型层化后大面积质量下降 | 查询分类器判断错误，将复杂查询路由到了小型模型 | 使用更精确的查询分类器（如 small LLM 分类而非关键词规则）；设置回退机制——小模型低置信度时自动升级 |
| ❌ 索引后检索速度反而变慢 | ANN 索引参数（efConstruction、M）设置不当 | 增大 HNSW 的 `efConstruction`（训练）和 `ef`（搜索）参数平衡；使用 IVF 进行粗粒度预过滤 |

## 📝 本章小结

- ✅ **缓存** — 语义缓存（相似度匹配）比精确缓存命中率高 3-5 倍
- ✅ **批量处理** — Embedding 批量生成减少 API 调用次数
- ✅ **模型层化** — 简单任务用便宜模型，复杂任务用大模型
- ✅ **Prompt Caching** — 缓存固定的系统提示，减少重复 Token 消耗
- ✅ **检索加速** — HNSW 索引、IVF 量化、预过滤等技术
- ✅ **三角平衡** — 延迟、成本、质量三者互相制约，需按业务场景取舍
- ✅ **自适应优化** — 按时间段（高峰期/低峰期）动态调整配置策略

## ➡️ 下一章预告

> [第8章：综合实战 — 企业知识库问答系统](./08-capstone-knowledge-base.md) — 将前7章知识融会贯通，构建完整的企业级 RAG 系统。
