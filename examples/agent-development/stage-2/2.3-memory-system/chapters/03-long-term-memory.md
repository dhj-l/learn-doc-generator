# 第3章：长期记忆实现 — 向量存储与检索

> 预计学习时间：90-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **选择合适的向量数据库** — 对比 ChromaDB、Pinecone、Qdrant 的适用场景
- **实现 Embedding 存储与检索** — 使用 OpenAI Embedding API 生成向量并存入数据库
- **设计遗忘策略** — 基于重要性和时间戳清理低价值记忆
- **优化检索质量** — 通过元数据过滤和混合检索提高召回准确率

## 📋 前置知识

> 建议先完成：
> - [第1章：记忆类型概述](./01-memory-types.md) — 理解长期记忆在整个记忆体系中的定位
> - [第2章：对话历史管理](./02-conversation-history.md) — 了解 Token 预算控制与摘要压缩

---

## 💡 核心概念

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

**预期输出：**
```
回忆到的记忆:
  [preference] 用户喜欢使用 TypeScript 而不是 JavaScript
  [fact] 用户正在开发一个 Vue 3 + Vite 的项目
```
}
```

---

## 🔨 实战演练

<details>
<summary>🧑‍💻 为 LongTermMemory 添加遗忘策略和批量导入能力</summary>

**场景描述：** 你的 Agent 已经积累了 1000+ 条长期记忆，其中很多是低价值的中间对话片段。你需要实现一个智能的遗忘策略，并支持从历史对话中批量导入记忆。

**你的任务：**
1. 为 `LongTermMemory` 添加 `prune(olderThanDays: number, importanceBelow: number)` 方法
2. 添加 `importFromHistory(messages: Anthropic.MessageParam[])` 方法，自动提取关键信息并存入
3. 每次 `prune()` 后输出统计日志：清理了多少条、剩余多少条

```typescript
// 参考起点
class LongTermMemoryV2 extends LongTermMemory {
  async prune(olderThanDays: number = 30, importanceBelow: number = 4): Promise<number> {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    // 实现：从 ChromaDB 查询符合条件的记录并删除
    console.log(`🧹 清理前: ${await this.count()} 条记忆`);
    // ... 删除逻辑
    console.log(`🧹 清理后: ${await this.count()} 条记忆`);
    return deletedCount;
  }
}
```

> 挑战：写完后调用 `prune(7, 5)` 观察清理结果。
</details>

---

## ⚡ 进阶技巧

### 1. 混合检索 — 向量 + 关键词联合

纯向量检索对缩写、专有名词（如"ChromaDB"写成"chromadb"）可能不敏感。叠加 BM25 关键词检索能大幅提升召回率：

```typescript
async function hybridSearch(query: string, topK: number = 5) {
  // 向量检索
  const vectorResults = await vectorCollection.query({ queryTexts: [query], nResults: topK * 2 });
  // 关键词检索（简易 BM25 模拟）
  const keywords = query.toLowerCase().split(/\s+/);
  const denseResults = allDocs
    .map(doc => ({
      ...doc,
      score: keywords.filter(kw => doc.text.toLowerCase().includes(kw)).length / keywords.length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  // RRF（Reciprocal Rank Fusion）融合排序
  return fuseResults(vectorResults, denseResults);
}
```

### 2. 记忆去重与合并

同一信息被多次存储（如用户在不同时间说了两次"我喜欢 TypeScript"）导致冗余。在写入前做相似度检测：

```typescript
async function storeDeduplicated(memory: LongTermMemory, content: string, threshold = 0.92) {
  const existing = await memory.recall(content, 3);
  const dupe = existing.find(e => e.content.includes(content) || cosineSimilarity(
    await getEmbedding(content), await getEmbedding(e.content)
  ) > threshold);
  if (dupe) {
    // 合并：增加已有记忆的 importance 和 accessCount
    await memory.bumpImportance(dupe.metadata!.id);
    return false; // 未新增
  }
  await memory.remember(content, { type: 'fact', importance: 7, sessionId: 'current' });
  return true;  // 新增
}
```

### 3. 异步批量 Embedding

单条逐一生成 Embedding 非常慢。使用 OpenAI 的批量接口并发处理：

```typescript
async function batchEmbed(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 20;
  const batches = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: batch });
    batches.push(res.data.map(d => d.embedding));
  }
  return batches.flat();
}
```

## 🧠 知识检查点

<details>
<summary><strong>Q1: 为什么长期记忆需要 Embedding 而不仅仅是关键词匹配？</strong></summary>

**A:** 关键词匹配只能找到字面相同或包含关键词的内容。Embedding 将文本映射到语义空间，能理解"我喜欢写 TypeScript"和"我的编程语言偏好是 TS"之间的语义相似性，即使它们没有共享关键词。这对于 Agent 需要根据用户意图（而非精确查询词）召回记忆的场景至关重要。
</details>

<details>
<summary><strong>Q2: ChromaDB 的 getOrCreateCollection 中 name 参数有什么注意事项？</strong></summary>

**A:** `name` 在同一个 ChromaDB 实例中必须唯一且不可包含特殊字符（如 `/`、`\`）。如果两个用户共用一个数据库实例，建议用 `memory-${userId}` 或 `memory-${sessionId}` 做命名空间隔离。同名的 `getOrCreateCollection` 是幂等的——如果已存在则直接返回。
</details>

<details>
<summary><strong>Q3: forget() 方法中基于「重要性 + 时间」的清理策略为什么是合理的？</strong></summary>

**A:** 单一条件都不够完善：仅按时间清理可能删掉高价值的长期知识；仅按重要性清理可能导致大量"曾经重要但已过时"的记忆堆积。组合策略——"重要性低于阈值 **且** 超过 X 天未访问"——在保留高价值记忆和节约存储之间取得了合理平衡。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 每次对话都重新初始化 ChromaDB 集合 | 每次 `init()` 都调用 `createCollection` 而非 `getOrCreateCollection`，导致重复创建或数据丢失 | 始终使用 `getOrCreateCollection` 保证幂等性 |
| 检索结果不相关 | Embedding 模型与检索内容领域不匹配（如用通用 Embedding 检索代码片段） | 使用 `text-embedding-3-small`（通用）或切换为专门用于代码的 Embedding 模型 |
| 长期记忆无限增长导致查询变慢 | 从未执行 `forget()` 清理，向量数据库体积持续膨胀 | 设置定时任务（如每天 + 每 100 条新记忆）触发 `prune()` 清理 |

---

## 📝 本章小结

- ✅ **向量存储** — 用 Embedding + 向量数据库存储记忆
- ✅ **语义检索** — 基于记忆内容的语义相似度查找
- ✅ **遗忘机制** — 定期清理低价值记忆

## ➡️ 下一章预告

> [第4章：知识图谱基础](./04-knowledge-graph.md) — 结构化实体关系提取、图谱查询与关联推理。
