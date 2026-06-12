# 第3章：长期记忆实现 — 向量存储与检索

> 预计学习时间：90-120 分钟

## 🎯 本章目标

- 理解长期记忆在 Agent 系统中的核心作用及其认知理论基础
- 掌握基于向量数据库的长期记忆存储与语义检索技术
- 理解 MemGPT（Virtual Context Management）论文的核心思想
- 掌握记忆巩固（Memory Consolidation）理论及其工程实现
- 能够实现包含遗忘策略的长期记忆系统

## 📋 前置知识

- 第 1 章中长期记忆（Long-term）的基本概念
- Atkinson-Shiffrin 模型中短期→长期的编码过程
- Embedding 和向量相似度（余弦距离）的基本概念
- 基本的向量数据库概念（Collection、Document、Metadata）

## 💡 核心概念

### 长期记忆的本质

在 Atkinson-Shiffrin 模型中，长期记忆（Long-term Memory）具有以下特征：
- **容量无限**：不像短期记忆受 7±2 限制，长期记忆的容量在理论上没有上限
- **持续时间长**：信息可以保存数年甚至终身
- **通过编码获取**：信息从短期记忆进入长期记忆需要经过**编码（Encoding）**过程

在 Agent 系统中，长期记忆的"编码"过程就是**生成 Embedding 向量**并**存储到向量数据库**。语义相似度检索就是"回忆"过程。

### MemGPT：虚拟上下文管理

MemGPT（Memory-GPT, Packer et al., 2023）提出了一种让 LLM 在固定上下文窗口中管理超出窗口大小的信息的架构。其核心思想是**分层的虚拟上下文管理**：

```
┌──────────────────────────────────────────────┐
│              MemGPT 架构                        │
│                                                │
│  ┌─────────────────┐                          │
│  │ 主上下文          │ ← 当前对话 + 关键记忆     │
│  │ (Main Context)   │   始终在上下文窗口中       │
│  └────────┬────────┘                          │
│           │                                    │
│  ┌────────▼────────┐                          │
│  │ 外部上下文        │ ← 长期记忆的"缓存"       │
│  │ (External        │   根据需求换入/换出        │
│  │  Context)        │   类似操作系统的虚拟内存   │
│  └─────────────────┘                          │
│                                                │
│  LLM 通过"函数调用"自主管理记忆：                  │
│  - recall(depth)    → 将记忆换入主上下文        │
│  - memorize(text)   → 将信息存入外部上下文      │
│  - compress()       → 压缩旧记忆腾出空间         │
└──────────────────────────────────────────────┘
```

**对 Agent 设计的启示：**
- **自主记忆管理**：让 LLM 自己决定什么时候该存储、什么时候该回忆
- **分页访问**：不将所有记忆放入上下文，而是像虚拟内存一样分页换入/换出
- **压缩作为系统调用**：将压缩操作封装为 LLM 可调用的函数

### 记忆巩固理论（Memory Consolidation）

记忆巩固（Consolidation）是认知神经科学中的核心概念，指短期记忆转化为长期记忆的生物学过程。在 Agent 系统中，这一过程可以工程化为：

```
短期记忆（对话历史）
     │
     │ 通过 LLM 提取关键信息
     ▼
中间表征（结构化提取）
     │
     │ 生成 Embedding，存入向量数据库
     ▼
长期记忆（向量存储）
     │
     │ 定期回顾，重新编码（Reconsolidation）
     ▼
巩固后的长期记忆（更高重要性，更强检索信号）
```

**系统 1 与系统 2 式的区别：**
- **在线巩固**（对话中即时提取）：在每次对话中，LLM 实时提取值得记住的信息
- **离线巩固**（后台批量处理）：定期对整段对话进行回顾性分析，提取深层模式

### 基于向量数据库的长期记忆

```typescript
// src/long-term-memory.ts
import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';

const openai = new OpenAI();
const chroma = new ChromaClient();

class LongTermMemory {
  private collection: any;

  async init() {
    this.collection = await chroma.getOrCreateCollection({
      name: 'agent-memory',
      metadata: { description: 'Agent 的长期记忆' },
    });
  }

  // 存储记忆
  async remember(content: string, metadata: {
    type: 'fact' | 'preference' | 'experience';
    importance: number;
    sessionId: string;
  }) {
    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.collection.add({
      ids: [id],
      documents: [content],
      metadatas: [{
        type: metadata.type,
        importance: metadata.importance,
        sessionId: metadata.sessionId,
        timestamp: Date.now(),
        accessCount: 0,
      }],
    });
  }

  // 回忆相关记忆
  async recall(query: string, topK: number = 5, filter?: any) {
    const results = await this.collection.query({
      queryTexts: [query],
      nResults: topK,
      where: filter,
    });

    // 更新访问计数
    if (results.ids[0]?.length > 0) {
      // 记录访问（简化实现）
    }

    return results.documents[0].map((doc: string, i: number) => ({
      content: doc,
      metadata: results.metadatas?.[0][i],
      distance: results.distances?.[0][i],
    }));
  }

  // 遗忘低价值记忆
  async forget(criteria: { olderThan?: number; importanceBelow?: number }) {
    // 实际实现需要根据条件删除
    console.log('执行遗忘策略:', criteria);
  }
}

// 使用示例
async function main() {
  const memory = new LongTermMemory();
  await memory.init();

  // 存储对话中的关键信息
  await memory.remember('用户喜欢使用 TypeScript 而不是 JavaScript', {
    type: 'preference', importance: 8, sessionId: 'session-1'
  });

  await memory.remember('用户正在开发一个 Vue 3 + Vite 的项目', {
    type: 'fact', importance: 7, sessionId: 'session-1'
  });

  // 在新对话中回忆
  const relevant = await memory.recall('用户的编程偏好');
  console.log('回忆到的记忆:');
  relevant.forEach(m => console.log(`  [${m.metadata?.type}] ${m.content}`));
}
```

### 检索增强：从朴素搜索到 MemGPT 式管理

朴素的向量检索只是"查到了就返回"。更成熟的检索策略融合了 MemGPT 的思想：

```typescript
class EnhancedRecall {
  // 1. 主动检索：根据当前查询语义搜索
  async activeRecall(query: string): Promise<MemoryEntry[]> { /* ... */ }

  // 2. 被动激活：根据对话上下文预取相关记忆
  async passivePrefetch(context: string): Promise<MemoryEntry[]> {
    // 类似 CPU 的预取指令
    const keyConcepts = await extractConcepts(context);
    return Promise.all(keyConcepts.map(c => this.recall(c, 3)))
      .then(results => results.flat());
  }

  // 3. 记忆合并：将多个相关的旧记忆合并为一条高重要性摘要
  async mergeRelatedMemories(threshold: number = 0.85) {
    const all = await this.getAllMemories();
    const clusters = this.clusterBySimilarity(all, threshold);
    for (const cluster of clusters) {
      if (cluster.length > 3) {
        const merged = await this.summarizeMemories(cluster);
        await this.remember(merged, { ... }, importance: 9);
        await this.deleteMemories(cluster.map(m => m.id));
      }
    }
  }
}
```

---

## 🔨 实战演练

**场景描述：**
你正在构建一个长期记忆系统，参照 MemGPT 的"虚拟上下文管理"思想，需要让 LLM **自主决定**何时存储和检索记忆。用户与 Agent 进行多轮对话，Agent 需要在对话中动态管理自己的记忆——就像操作系统管理虚拟内存一样。

**你的任务：**
1. 实现一个 `MemGPTLikeMemory` 类，其中 LLM 可以通过特殊格式的输出来触发 `recall()` 和 `memorize()` 操作
2. 实现**被动预取（Passive Prefetch）**：在每次 LLM 调用前，根据最近 3 条消息自动检索相关的长期记忆并注入上下文
3. 实现**记忆合并**：当向量数据库中存在超过 3 条语义相似度 > 0.85 的记忆时，将它们合并为一条概括性记忆

<details>
<summary>💡 参考实现思路</summary>

```typescript
class MemGPTLikeMemory extends LongTermMemory {
  private contextWindow: any[] = [];

  // LLM 回复中的特殊标记触发记忆操作
  async processLLMOutput(text: string): Promise<string> {
    // 处理记忆存储
    const storeMatch = text.match(/\[MEMORIZE\](.+?)\[\/MEMORIZE\]/);
    if (storeMatch) {
      await this.remember(storeMatch[1].trim(), {
        type: 'fact',
        importance: 6,
        sessionId: 'current',
      });
    }

    // 处理记忆回忆
    const recallMatch = text.match(/\[RECALL\](.+?)\[\/RECALL\]/);
    if (recallMatch) {
      const memories = await this.recall(recallMatch[1].trim(), 3);
      // 将回忆结果注入回上下文
      this.contextWindow.push({
        role: 'system',
        content: `[回忆结果]: ${memories.map(m => m.content).join(', ')}`,
      });
    }

    return text.replace(/\[(MEMORIZE|RECALL)\].*?\[\/\1\]/g, '').trim();
  }

  // 被动预取
  async prefetch(recentMessages: string[]) {
    const combined = recentMessages.join(' ');
    const concepts = await this.extractKeyConcepts(combined);
    const prefetched: any[] = [];

    for (const concept of concepts.slice(0, 3)) {
      const results = await this.recall(concept, 2);
      prefetched.push(...results);
    }

    // 去重后注入上下文
    const unique = Array.from(new Map(prefetched.map(m => [m.content, m])).values());
    if (unique.length > 0) {
      this.contextWindow.push({
        role: 'system',
        content: `[预取的长期记忆]: ${unique.map(m => m.content).join('; ')}`,
      });
    }
  }

  private async extractKeyConcepts(text: string): Promise<string[]> {
    // 实际项目中用 LLM 或 NLP 工具提取关键词
    return text.split(/[,，。.、]/).filter(s => s.length > 4);
  }

  // 记忆合并（离线巩固）
  async consolidateMemories() {
    const allMemories = await this.getAllMemories();
    const clusters = this.clusterBySimilarity(allMemories, 0.85);

    for (const cluster of clusters) {
      if (cluster.length < 3) continue;

      const summary = await this.generateSummary(cluster);
      await this.remember(summary, {
        type: 'fact',
        importance: Math.max(...cluster.map(m => m.metadata.importance)) + 1,
        sessionId: 'consolidation',
      });
      await this.deleteMemories(cluster.map(m => m.id));
      console.log(`🔄 合并了 ${cluster.length} 条记忆为一条摘要`);
    }
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 1. 时间衰减权重检索

在语义相似度的基础上，加入**时间衰减因子**，让最近的记忆有更高的检索优先级。这符合 Ebbinghaus 遗忘曲线和人类记忆的特点：

```typescript
function timeDecayedSimilarity(
  queryEmbedding: number[],
  memoryEmbedding: number[],
  memoryAge: number     // 毫秒
): number {
  const semanticScore = cosineSimilarity(queryEmbedding, memoryEmbedding);
  const timeDecay = Math.exp(-memoryAge / (7 * 24 * 60 * 60 * 1000)); // 7 天半衰期
  return semanticScore * 0.7 + timeDecay * 0.3;
  //        ↑ 语义相关     ↑ 时效性
}
```

### 2. 多向量单记忆

不要只对整个记忆片段生成一个 Embedding。将同一段记忆用多个角度编码（标题、摘要、关键词列表），提高被不同查询检索到的概率：

```typescript
async function storeWithMultipleViews(content: string) {
  const views = [
    content,
    await generateTitle(content),
    await extractKeywords(content),
  ];
  const embeddings = await Promise.all(
    views.map(v => generateEmbedding(v))
  );
  // 存储多条向量但指向同一个记忆 ID
  await vectorStore.add({
    ids: [`view-${Date.now()}-1`, `view-${Date.now()}-2`, `view-${Date.now()}-3`],
    embeddings: embeddings,
    metadatas: [{ contentId: memoryId, view: 'full' },
                 { contentId: memoryId, view: 'title' },
                 { contentId: memoryId, view: 'keywords' }],
  });
}
```

### 3. 对比学习式 Embedding 优化

标准的 `text-embedding-3-small` 对通用语义效果好，但对特定领域（如医疗、法律）的检索效果有限。可以使用对比学习（Contrastive Learning）微调 Embedding 模型：

```typescript
// 使用 SimCSE 或类似方法构造正负样本对
const trainingData = [
  // 正样本对（应该被检索到的）
  { anchor: "用户说"我喜欢 TypeScript"", positive: "用户偏好 TypeScript" },
  // 负样本对（不应该被检索到的）
  { anchor: "用户说"我喜欢 TypeScript"", negative: "用户使用 Python" },
];
// 通过对比损失函数微调 Embedding 模型
```

---

## 🧠 知识检查点

### Q1: MemGPT 的"虚拟上下文管理"和操作系统的虚拟内存有什么异曲同工之处？

<details>
<summary>查看答案</summary>

两者都解决同一个根本问题：**有限的"工作空间"如何容纳超出容量的信息**。

| 方面 | 操作系统虚拟内存 | MemGPT |
|------|----------------|--------|
| 工作空间 | RAM（物理内存） | LLM 上下文窗口 |
| 存储层 | 磁盘（Swap） | 向量数据库 |
| 换入 | Page Fault → 加载 | recall() 函数 |
| 换出 | SWAP 出 | compress() → 存档 |
| 预取 | Prefetching | 被动预取相似记忆 |
| 页面替换 | LRU 算法 | 重要性 + 时效性评分 |

核心思想一致：不试图扩大工作空间，而是智能地管理哪些内容在当前应该"驻留"。
</details>

### Q2: 为什么需要"离线巩固"（Offline Consolidation）？它和"在线提取"有什么区别？

<details>
<summary>查看答案</summary>

**在线提取**（对话中即时存储）的优势是实时性，但存在局限：
1. 单次对话视角有限，无法识别跨会话的模式
2. LLM 调用成本高，每条消息都提取会大幅增加开销
3. 容易存储冗余信息（同一件事在多次对话中被重复存储）

**离线巩固**（后台批量处理）弥补了这些局限：
1. 可以分析大量历史对话，发现深层模式和趋势
2. 可以将多条相关记忆合并为一条高质量摘要
3. 可以执行"记忆重构"（Reconsolidation）——更新旧记忆以融入新信息

最佳实践是两者结合：对话中**在线提取**关键信息，后台定期**离线巩固**优化存储。
</details>

### Q3: 在向量检索中加入"重要性"和"时效性"权重后，会不会导致低重要性的有用信息永远无法被检索到？

<details>
<summary>查看答案</summary>

这是一个经典的**探索-利用（Exploration vs. Exploitation）困境**。如果完全依赖权重排序，低权重记忆确实可能被"饿死"。

解决方案包括：
1. **随机采样**（$\epsilon$-greedy）：以 10% 的概率随机返回一条低权重记忆，提供"惊喜发现"的机会
2. **多轮检索**：先用加权检索获取高相关结果，再用纯语义检索获取补充结果
3. **重要性衰减重置**：当一条记忆长期未被访问时，自动将其重要性重新评估（可能因为未被访问意味着编码时的预估不准确）
4. **用户反馈循环**：如果检索结果被用户手动忽略多次，降低其权重；如果被用户引用或修正，提高其权重
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 长期记忆只存不回顾，导致关键记忆被海量噪音淹没 | 忽视了 MemGPT 中的"主动回忆"机制——仅仅存储不等于有效记忆，还需要在需要时主动检索 | 在每次 LLM 调用前执行被动预取（Passive Prefetch），根据当前对话自动检索相关记忆注入上下文 |
| 每条对话存一条 Embedding，不做合并 | 没有设置记忆合并策略，导致向量数据库中充斥大量语义重复的近似条目 | 实现离线巩固（Consolidation），定期将相似度 > 0.85 的记忆合并为概括性摘要 |
| 遗忘策略只按时间删除，不考虑重要性 | 简单的"超过 X 天就删"策略会删除虽然旧但重要的记忆（如用户很久前表达的编程偏好） | 使用综合评分：`重要性 × 访问频率 × (1 - 时间衰减)`，只有综合评分低于阈值的才删除 |

---

## 📝 本章小结

- ✅ **向量存储** — 用 Embedding + 向量数据库存储记忆
- ✅ **语义检索** — 基于记忆内容的语义相似度查找
- ✅ **遗忘机制** — 定期清理低价值记忆
- ✅ **MemGPT 虚拟上下文管理** — LLM 自主管理记忆，类似操作系统的虚拟内存
- ✅ **记忆巩固** — 通过在线提取和离线合并将短期记忆转化为高质量长期记忆
- ✅ **检索增强策略** — 主动检索 + 被动预取 + 记忆合并

## ➡️ 下一章预告

> [第4章：知识图谱基础](./04-knowledge-graph.md) — 结构化记忆、实体关系提取、语义网络理论、图数据库在记忆系统中的应用。
