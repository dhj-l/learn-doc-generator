# 第1章：记忆类型 — 短期、长期与工作记忆

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **区分三种记忆类型** — 理解短期、长期和工作记忆的角色与生命周期
- **实现基础记忆系统** — 用 TypeScript 构建一个支持三种记忆的 `AgentMemory` 类
- **掌握 Embedding 检索** — 使用向量相似度从长期记忆中召回相关内容
- **设计遗忘策略** — 根据重要性和访问频率清理过期记忆

## 💡 核心概念

### Agent 的三种记忆

**生活类比：** 把 Agent 想象成一个人：
- **短期记忆**（对话上下文）— 你正在和别人聊天，记住刚才说了什么
- **长期记忆**（持久存储）— 你的人生经历和知识，一直记得
- **工作记忆**（当前任务状态）— 你正在做数学题，脑子里暂存的中间计算结果

```
┌─────────────────────────────────────────────────────┐
│                    Agent 记忆系统                      │
│                                                      │
│  ┌──────────────┐                                   │
│  │ 短期记忆      │ ← 对话历史（messages 数组）         │
│  │ (Short-term)  │   会话结束即消失                    │
│  └──────────────┘                                   │
│                                                      │
│  ┌──────────────┐                                   │
│  │ 长期记忆      │ ← 向量数据库中存储的知识             │
│  │ (Long-term)   │   持久化，跨会话可用                 │
│  └──────────────┘                                   │
│                                                      │
│  ┌──────────────┐                                   │
│  │ 工作记忆      │ ← 当前任务的中间结果                 │
│  │ (Working)     │   任务完成后可清除                   │
│  └──────────────┘                                   │
└─────────────────────────────────────────────────────┘
```

### 实现记忆系统

```typescript
// src/memory-system.ts
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const anthropic = new Anthropic();
const openai = new OpenAI();

interface MemoryEntry {
  id: string;
  content: string;
  type: 'fact' | 'preference' | 'experience' | 'instruction';
  importance: number;      // 1-10
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  embedding?: number[];
}

class AgentMemory {
  // 短期记忆：当前对话
  private shortTerm: Anthropic.MessageParam[] = [];

  // 长期记忆：持久化的知识
  private longTerm: MemoryEntry[] = [];

  // 工作记忆：当前任务状态
  private working: Map<string, any> = new Map();

  // ====== 短期记忆管理 ======

  addToShortTerm(message: Anthropic.MessageParam) {
    this.shortTerm.push(message);
    // 滑动窗口：只保留最近 20 轮
    if (this.shortTerm.length > 40) {
      // 压缩旧消息为摘要
      this.compressOldMessages();
    }
  }

  getShortTerm(): Anthropic.MessageParam[] {
    return [...this.shortTerm];
  }

  private async compressOldMessages() {
    const oldMessages = this.shortTerm.slice(0, 20);
    const recentMessages = this.shortTerm.slice(20);

    // 用 LLM 压缩旧消息
    const summary = await this.summarize(oldMessages);

    this.shortTerm = [
      { role: 'user', content: `[之前的对话摘要]\n${summary}` },
      { role: 'assistant', content: '我已了解之前的对话内容。' },
      ...recentMessages,
    ];
  }

  private async summarize(messages: Anthropic.MessageParam[]): Promise<string> {
    const text = messages.map(m =>
      `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
    ).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: `用 3 句话总结这段对话的关键信息：\n${text}` }],
    });

    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  // ====== 长期记忆管理 ======

  async addToLongTerm(content: string, type: MemoryEntry['type'], importance: number) {
    // 生成 Embedding
    const embResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: content,
    });

    const entry: MemoryEntry = {
      id: `mem-${Date.now()}`,
      content,
      type,
      importance,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      embedding: embResponse.data[0].embedding,
    };

    this.longTerm.push(entry);
  }

  async recallFromLongTerm(query: string, topK: number = 5): Promise<MemoryEntry[]> {
    const embResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const queryEmbedding = embResponse.data[0].embedding;

    // 计算相似度并排序
    const scored = this.longTerm
      .filter(m => m.embedding)
      .map(m => ({
        ...m,
        score: this.cosineSimilarity(queryEmbedding, m.embedding!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    // 更新访问记录
    scored.forEach(m => {
      const original = this.longTerm.find(lt => lt.id === m.id);
      if (original) {
        original.lastAccessed = Date.now();
        original.accessCount++;
      }
    });

    return scored;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  // ====== 工作记忆管理 ======

  setWorking(key: string, value: any) {
    this.working.set(key, value);
  }

  getWorking(key: string): any {
    return this.working.get(key);
  }

  clearWorking() {
    this.working.clear();
  }
}

export { AgentMemory, MemoryEntry };
```

---

## 🔨 实战演练

<details>
<summary>🧑‍💻 扩展 AgentMemory — 添加遗忘策略和重要性排序</summary>

**场景描述：** 你的 AI 助手已经运行了 3 个月，长期记忆里有 500 条记录。你需要实现一个遗忘策略，自动清理低价值记忆，并让高重要性记忆的检索优先级更高。

**你的任务：**
1. 在 `AgentMemory` 中添加 `prune()` 方法，清理重要性 < 3 且 30 天未访问的记忆
2. 修改 `recallFromLongTerm()` 的排序公式，将 `importance` 纳入评分（权重 30%）
3. 添加 `getMemoryStats()` 方法，返回三种记忆的数量和总体 Token 占用

```typescript
// 参考起点
class AgentMemoryV2 extends AgentMemory {
  async prune(): Promise<number> {
    const now = Date.now();
    const before = this.longTerm.length;
    this.longTerm = this.longTerm.filter(entry =>
      entry.importance >= 3 ||
      (now - entry.lastAccessed) < 30 * 24 * 60 * 60 * 1000
    );
    return before - this.longTerm.length;  // 返回清理条数
  }
}
```

> 试试看：实现后在控制台调用 `prune()` 并观察清理了多少条低价值记忆。
</details>

---

## ⚡ 进阶技巧

### 1. 重要性衰减 — 让记忆"降温"

只靠 Embedding 相似度检索可能让高频但无意义的记忆占据首页。实现一个**时间衰减函数**，让长时间未访问的记忆自动降低权重：

```typescript
function computeScore(entry: MemoryEntry, queryEmbedding: number[], now: number): number {
  const similarity = cosineSimilarity(queryEmbedding, entry.embedding!);
  const hoursSinceAccess = (now - entry.lastAccessed) / (1000 * 60 * 60);
  const decay = Math.max(0.5, 1 - hoursSinceAccess * 0.01);  // 每 10 小时衰减 10%
  const importanceBoost = entry.importance / 10;               // 重要性权重
  return similarity * decay * (0.5 + 0.5 * importanceBoost);
}
```

### 2. 记忆分层存储

将记忆按重要性和访问频率分为"热/温/冷"三层，避免每次检索都扫描全部数据：

```typescript
class TieredMemory {
  private hot: MemoryEntry[] = [];   // 内存：最近高频访问
  private warm: MemoryEntry[] = [];  // 本地向量 DB：中等频率
  private cold: MemoryEntry[] = [];  // 远端存储：低频/低重要性

  async recall(query: string) {
    const results = [];
    results.push(...this.searchLocal(this.hot, query));
    if (results.length < 3) results.push(...await this.searchWarm(query));
    if (results.length < 3) results.push(...await this.searchCold(query));
    return results.slice(0, 5);
  }
}
```

### 3. 批量 Embedding 缓存

重复生成相同文本的 Embedding 浪费 Token 和延迟。在 `AgentMemory` 中加入 LRU 缓存：

```typescript
import { LRUCache } from 'lru-cache';

const embeddingCache = new LRUCache<string, number[]>({ max: 500 });
async function getEmbedding(text: string): Promise<number[]> {
  const cached = embeddingCache.get(text);
  if (cached) return cached;
  const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text });
  embeddingCache.set(text, res.data[0].embedding);
  return res.data[0].embedding;
}
```

## 🧠 知识检查点

<details>
<summary><strong>Q1: 短期记忆、长期记忆和工作记忆的核心区别是什么？</strong></summary>

**A:** 短期记忆存在于当前对话的 `messages` 数组中，会话结束即消失；长期记忆存储在向量数据库里，跨会话持久化；工作记忆是当前任务进度的临时状态（如 Map<string, any>），任务完成后可主动清除。
</details>

<details>
<summary><strong>Q2: 为什么压缩旧消息时要使用 LLM 生成摘要，而不是直接丢弃？</strong></summary>

**A:** 直接丢弃会丢失早期对话中的关键信息（如用户的偏好、已确认的事实）。LLM 生成的摘要能保留高价值信息，同时大幅减少 Token 占用，让 Agent 在长对话中仍能"记住"早期的重要上下文。
</details>

<details>
<summary><strong>Q3: cosineSimilarity 的值越接近 1 意味着什么？</strong></summary>

**A:** 余弦相似度衡量两个向量方向的接近程度，值越接近 1 表示语义越相关。但要注意：高相似度不等同于"正确"——两条包含相同关键词但语义相反的句子（如"我喜欢 TypeScript" vs "我不喜欢 TypeScript"）Embedding 仍可能接近，需要结合 importance 和 recency 综合判断。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 短期记忆无限制增长 | 没有设置滑动窗口或 Token 预算，导致上下文超限 | 实现 `maxTurns` 限制 + 摘要压缩兜底 |
| 长期记忆只存不删 | 遗忘机制缺失，向量数据库体积无限膨胀 | 添加定时清理：删除 importance < 3 且 30 天未访问的记忆 |
| 工作记忆跨会话污染 | 未在会话结束时调用 `clearWorking()`，导致不同用户/任务的数据混淆 | 每个会话/任务创建独立的 `AgentMemory` 实例 |

---

## 📝 本章小结

- ✅ **短期记忆** — 对话历史，滑动窗口 + 摘要压缩
- ✅ **长期记忆** — 向量存储，基于语义相似度检索
- ✅ **工作记忆** — 当前任务的临时状态
- ✅ **遗忘机制** — 低重要性 + 长时间未访问的记忆可被清理

## ➡️ 下一章预告

> [第2章：对话历史管理](./02-conversation-history.md) — 摘要压缩、选择性保留、Token 预算控制。
