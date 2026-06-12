# 第1章：记忆类型 — 短期、长期与工作记忆

> 预计学习时间：60-80 分钟

## 🎯 本章目标

- 理解 Agent 的三种记忆类型及其认知科学理论基础
- 掌握 Atkinson-Shiffrin 记忆模型（感觉→短期→长期）对 Agent 设计的启示
- 理解 Miller's Law（7±2 组块）与 LLM 上下文窗口限制的关联
- 能够实现一个包含短期、长期、工作记忆的基础 Agent 记忆系统
- 掌握 Embedding 生成与余弦相似度检索的核心技术

## 💡 核心概念

### 认知科学基础：Atkinson-Shiffrin 记忆模型

人脑的记忆并非单一系统，而是由三个相互关联的子系统构成。Atkinson 和 Shiffrin 在 1968 年提出的多存储模型（Multi-Store Model）是理解记忆的经典框架：

```
  感觉输入
     │
     ▼
┌──────────────┐   注意    ┌──────────────┐   复述/编码   ┌──────────────┐
│ 感觉记忆      │ ───────→ │ 短期记忆      │ ───────────→ │ 长期记忆      │
│ (Sensory)    │          │ (Short-term) │              │ (Long-term)  │
│ 持续时间:<2秒 │          │ 容量:7±2 组块 │              │ 容量:无限     │
│ 图标/回声记忆 │          │ 持续时间:~30秒 │             │ 持续时间:数年 │
└──────────────┘          └──────────────┘              └──────────────┘
                                │
                                │ 执行控制
                                ▼
                         ┌──────────────┐
                         │ 工作记忆      │
                         │ (Working)    │
                         │ 中央执行器    │
                         │ 语音回路      │
                         │ 视空间模板    │
                         └──────────────┘
```

**对 Agent 设计的启示：**
- **感觉记忆** → LLM 的输入 Token（原始感知，未经过滤）
- **短期记忆** → 对话历史（messages 数组），容量受限
- **长期记忆** → 向量数据库中的持久知识，理论上无限
- **工作记忆** → Baddeley 模型中中央执行器的概念，对应 Agent 的当前任务状态

### Miller's Law：7±2 与上下文窗口

George Miller 在 1956 年发现，人类的短期记忆容量约为 7±2 个"组块"（Chunks）。这一发现对 Agent 设计有深刻的启示：

- **组块化（Chunking）**：人脑通过将信息组织成有意义的组块来突破容量限制。类似地，Agent 可以通过摘要压缩将多轮对话打包成一个"组块"。
- **上下文窗口限制**：LLM 的上下文窗口（如 100K tokens）虽然远大于 7±2，但"有效容量"同样受限——当上下文过长时，模型对中间信息的注意力会衰减（Lost in the Middle 现象）。
- **分层记忆的必要性**：正是由于容量限制，Agent 需要将记忆分层，而非将所有信息塞入一个上下文窗口。

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
│  │  容量受限     │   Miller's Law 的工程体现            │
│  └──────────────┘                                   │
│                                                      │
│  ┌──────────────┐                                   │
│  │ 长期记忆      │ ← 向量数据库中存储的知识             │
│  │ (Long-term)   │   持久化，跨会话可用                 │
│  │  语义索引     │   通过 Embedding 实现检索            │
│  └──────────────┘                                   │
│                                                      │
│  ┌──────────────┐                                   │
│  │ 工作记忆      │ ← 当前任务的中间结果                 │
│  │ (Working)     │   任务完成后可清除                   │
│  │  短暂存储     │   Baddeley 模型中的中央执行器         │
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

### 检索线索（Retrieval Cues）与语义搜索

在认知心理学中，**检索线索**（Retrieval Cue）是触发记忆恢复的刺激。有效线索通常与目标记忆存在语义关联——这正是向量检索的核心原理：

- **编码特异性原则**（Tulving, 1974）：记忆的编码方式决定了哪些线索能有效检索。在 Agent 中，这体现为 Embedding 的编码质量直接影响检索效果。
- **语义 priming**：当用户提到某个概念时，它在语义空间中"激活"了相邻的记忆节点，这与向量检索中的最近邻搜索完全对应。
- **多线索检索**：综合多条线索（当前问题 + 用户画像 + 对话历史）进行检索，类似于认知心理学中的"生成识别"模型。

### 遗忘曲线（Ebbinghaus）与记忆管理

Hermann Ebbinghaus 在 1885 年发现，记忆的衰减遵循指数衰减曲线：

```
保留率 = e^(-t/τ)

其中 t 是时间，τ 是遗忘时间常数
```

**对 Agent 记忆系统的启示：**
- **间隔重复**：定期回顾重要记忆可以减缓遗忘。在代码中可以通过 `accessCount` 和 `lastAccessed` 字段实现。
- **重要性加权**：Ebbinghaus 曲线表明编码强度影响遗忘速度。`importance` 字段正是这一思想的工程实现。
- **遗忘即功能**：遗忘不是 Bug，而是 Feature。定期清理低价值记忆可以防止噪声干扰关键信息的检索。

---

## 🔨 实战演练

**场景描述：**
你正在开发一个个人 AI 助手，需要根据用户的不同行为类型将信息存入对应的记忆层级。用户可能会提供事实性信息（"我住在北京"）、表达偏好（"我喜欢简洁的代码风格"）、描述经历（"上周我去了杭州旅行"），或发出指令（"请每天早上提醒我喝水"）。

**你的任务：**
1. 继承 `AgentMemory` 类，为每种记忆类型（`fact`, `preference`, `experience`, `instruction`）实现不同的**重要性评分策略**
2. 添加一个 `consolidateMemory()` 方法，当短期记忆中某条信息被访问超过 3 次时，自动将其提升（consolidate）到长期记忆
3. 实现一个简单的遗忘策略：定期移除长期记忆中 `importance < 3` 且超过 7 天未访问的记忆

<details>
<summary>💡 参考实现思路</summary>

```typescript
class EnhancedAgentMemory extends AgentMemory {
  // 基于记忆类型的重要性评分
  private scoreImportance(content: string, type: MemoryEntry['type']): number {
    switch (type) {
      case 'instruction': return 9;     // 指令最重要
      case 'preference': return 7;      // 偏好次之
      case 'fact': return 5;            // 事实居中
      case 'experience': return 3;      // 经历基础分
    }
  }

  // 记忆巩固：从短期提升到长期
  async consolidateMemory(message: Anthropic.MessageParam) {
    const content = typeof message.content === 'string' ? message.content : '';
    if (!content) return;

    // 在短期记忆中查找是否已多次出现
    const accessCount = this['shortTerm']
      .filter(m => typeof m.content === 'string' && (m.content as string).includes(content.slice(0, 20)))
      .length;

    if (accessCount >= 3) {
      const importance = this.scoreImportance(content, 'fact');
      await this.addToLongTerm(content, 'fact', importance);
      console.log(`🔄 记忆巩固：将"${content.slice(0, 30)}..."提升到长期记忆`);
    }
  }

  // 遗忘策略
  async forgetOldMemories() {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const beforeCount = this['longTerm'].length;

    this['longTerm'] = this['longTerm'].filter(m =>
      m.importance >= 3 || (now - m.lastAccessed) < sevenDays
    );

    console.log(`🧹 遗忘策略执行：清理了 ${beforeCount - this['longTerm'].length} 条低价值记忆`);
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 1. 分层的重要性评分

不要使用单一的固定阈值，而是根据记忆类型、访问频率和最近使用时间动态计算记忆的"**综合价值分数**"：

```typescript
function calculateMemoryScore(memory: MemoryEntry): number {
  const recencyBonus = Math.max(0, 1 - (Date.now() - memory.lastAccessed) / (30 * 24 * 60 * 60 * 1000));
  const frequencyBonus = Math.min(1, memory.accessCount / 10);
  const importanceWeight = memory.importance / 10;

  return 0.4 * importanceWeight + 0.35 * frequencyBonus + 0.25 * recencyBonus;
  //      ↑ 重要性          ↑ 频率           ↑ 时效性
}
```

### 2. 使用 LRU 缓存优化短期记忆

当短期记忆频繁访问但总量不大时，用 `Map` 的插入顺序特性实现 LRU（Least Recently Used）淘汰策略，避免数组操作的开销：

```typescript
class LRUShortTermMemory<K, V> {
  private cache = new Map<K, V>();
  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.cache.delete(key);   // 先删除
      this.cache.set(key, value); // 再插入（移到末尾）
    }
    return value;
  }

  set(key: K, value: V) {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, value);
    if (this.cache.size > this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest); // 淘汰最久未访问的
    }
  }
}
```

### 3. 混合检索策略

不要只依赖向量相似度，结合基于规则的精确匹配和 LLM 重排序（Re-ranking），可以显著提升检索质量：

```typescript
async function hybridRetrieve(query: string, memories: MemoryEntry[], topK: number) {
  // 1. 规则匹配：关键词精确匹配
  const exactMatches = memories.filter(m => m.content.includes(query));

  // 2. 向量检索：语义相似度
  const semanticMatches = await vectorSearch(query, memories, topK * 2);

  // 3. 融合去重
  const combined = new Map<string, MemoryEntry>();
  for (const m of [...exactMatches, ...semanticMatches]) {
    if (!combined.has(m.id)) combined.set(m.id, m);
  }

  return Array.from(combined.values()).slice(0, topK);
}
```

---

## 🧠 知识检查点

### Q1: Atkinson-Shiffrin 记忆模型中，信息从短期记忆进入长期记忆需要什么条件？

<details>
<summary>查看答案</summary>

需要**注意（Attention）**和**复述/编码（Rehearsal/Encoding）**。感觉记忆中的信息只有被注意才能进入短期记忆；短期记忆中的信息通过精细复述（Elaborative Rehearsal）才能编码进入长期记忆。在 Agent 系统中，这对应着——对话信息需要被标记为"重要"（高 importance 值）并通过 Embedding 编码后才存储到向量数据库中。
</details>

### Q2: Miller's Law 所说的 7±2 是什么意思？它对设计 Agent 的记忆系统有什么启发？

<details>
<summary>查看答案</summary>

Miller's Law 指出人类短期记忆的容量约为 7±2 个"组块"（Chunks）。每个组块可以是一个数字、一个单词，也可以是一个精心组织的信息包。对 Agent 系统的启发：
1. **组块化**：通过摘要压缩将多轮对话打包成一个"组块"，突破表面容量限制
2. **分层结构**：不能将所有信息塞入一个上下文窗口，需要分层（短期/长期）管理
3. **注意力衰减**：上下文过长时 LLM 的"有效容量"同样受限（Lost in the Middle 现象），需要及时压缩
</details>

### Q3: 为什么说"遗忘"是 Agent 记忆系统的 Feature 而非 Bug？

<details>
<summary>查看答案</summary>

Ebbinghaus 遗忘曲线表明遗忘是记忆的自然属性。在 Agent 系统中，刻意遗忘（Forgetting）有三大作用：
1. **提高检索精度**：清除低价值噪声，让高重要性记忆更容易被召回
2. **控制成本**：减少向量数据库规模和 LLM 上下文长度，降低 Token 消耗
3. **适应变化**：用户偏好会随时间变化，及时遗忘过时的信息（如旧的编程偏好）能让 Agent 更好地适应当前需求
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 将所有对话都存入长期记忆 | 认为"记住越多越好"，忽视了噪声对检索的干扰 | 设置 `importance` 阈值，只存储重要性 ≥ 5 的信息；结合 Ebbinghaus 遗忘曲线定期清理 |
| 短期记忆不做摘要压缩 | 直接丢弃旧消息导致重要上下文永久丢失 | 在丢弃前先用 LLM 生成摘要，将多轮信息压缩为"组块"后再移除原文 |
| 工作记忆与短期记忆混淆 | 不区分"当前任务状态"和"对话上下文"，将所有数据堆积在 messages 数组中 | 工作记忆用独立的 `Map` 管理，任务完成后立即清除；对话历史单独维护 |

---

## 📝 本章小结

- ✅ **短期记忆** — 对话历史，滑动窗口 + 摘要压缩
- ✅ **长期记忆** — 向量存储，基于语义相似度检索
- ✅ **工作记忆** — 当前任务的临时状态
- ✅ **遗忘机制** — 低重要性 + 长时间未访问的记忆可被清理
- ✅ **Atkinson-Shiffrin 模型** — 认知科学为 Agent 记忆分层提供了理论支撑
- ✅ **Miller's Law** — 7±2 组块限制解释了为什么需要摘要压缩和分层存储
- ✅ **检索线索** — 语义搜索正是 Retrieval Cue 理论在 AI 系统中的工程实现

## ➡️ 下一章预告

> [第2章：对话历史管理](./02-conversation-history.md) — 摘要压缩、选择性保留、Token 预算控制、上下文窗口的动态管理策略。
