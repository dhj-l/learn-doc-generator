# 第6章：综合实战 — 带持久记忆的个人 AI 助手

> 预计学习时间：120-150 分钟

## 🎯 本章目标

- 融合前 5 章的所有概念，构建一个完整的分层记忆 Agent
- 实现短期记忆（对话缓冲）+ 长期记忆（向量存储）+ 知识图谱（结构化关系）的整合
- 运用 MemGPT 的"自主记忆管理"思想：让 LLM 自己决定何时存储和回忆
- 实现遗忘策略和记忆巩固机制
- 构建一个可运行的个人 AI 助手原型

## 📋 前置知识

- 第 1 章：记忆类型（短期/长期/工作记忆）
- 第 2 章：对话历史管理（滑动窗口、摘要压缩、Token 预算）
- 第 3 章：长期记忆（向量数据库、语义检索、MemGPT）
- 第 4 章：知识图谱（实体提取、关系提取、图检索）
- 第 5 章：记忆框架（LangChain、Mem0、Zep）

## 💡 系统架构概览

在开始编码之前，先理解整个系统的架构设计：

```
┌──────────────────────────────────────────────────────────┐
│                 Memory Assistant 架构                      │
│                                                          │
│  用户输入                                                   │
│     │                                                     │
│     ▼                                                     │
│  ┌──────────────────────┐                                 │
│  │ 1. 对话管理器         │ ← 管理短期记忆（滑动窗口）        │
│  │  (Chat Manager)      │   压缩 + 摘要                    │
│  └──────────┬───────────┘                                 │
│             │                                             │
│  ┌──────────▼───────────┐                                 │
│  │ 2. 记忆检索器         │ ← 向量检索（语义）+ 图检索（关系）│
│  │  (Memory Retriever)  │   MemGPT 式主动回忆              │
│  └──────────┬───────────┘                                 │
│             │                                             │
│  ┌──────────▼───────────┐                                 │
│  │ 3. LLM 调用           │ ← 注入记忆上下文                 │
│  │  (LLM Call)          │   解析回复中的记忆标记             │
│  └──────────┬───────────┘                                 │
│             │                                             │
│  ┌──────────▼───────────┐                                 │
│  │ 4. 记忆写入器         │ ← 从回复提取新记忆               │
│  │  (Memory Writer)     │   存储到向量库 + 图谱             │
│  └──────────┬───────────┘                                 │
│             │                                             │
│  ┌──────────▼───────────┐                                 │
│  │ 5. 离线巩固           │ ← 后台定时合并记忆               │
│  │  (Offline            │   遗忘低价值记忆                  │
│  │   Consolidation)     │                                 │
│  └──────────────────────┘                                 │
└──────────────────────────────────────────────────────────┘
```

### 设计原则

1. **分层记忆**：短期（对话）→ 长期（向量）→ 结构化（图谱），各层独立维护
2. **自主管理**：LLM 通过 `<memory>` 标签自主触发记忆存储（MemGPT 思想）
3. **懒加载检索**：只在需要时检索长期记忆，不预加载全部
4. **渐进式遗忘**：低价值记忆先降权，再归档，最后删除

## 🔨 完整实现

```typescript
// src/memory-assistant.ts
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ChromaClient } from 'chromadb';

const anthropic = new Anthropic();
const openai = new OpenAI();
const chroma = new ChromaClient();

class MemoryAssistant {
  private conversationHistory: Anthropic.MessageParam[] = [];
  private memoryCollection: any;
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async init() {
    this.memoryCollection = await chroma.getOrCreateCollection({
      name: `memory-${this.userId}`,
    });
  }

  async chat(userMessage: string): Promise<string> {
    // 1. 检索相关记忆
    const memories = await this.recallMemories(userMessage);

    // 2. 构建带记忆上下文的消息
    const memoryContext = memories.length > 0
      ? `\n\n你对这个用户的了解：\n${memories.map(m => `- ${m.content}`).join('\n')}`
      : '';

    this.conversationHistory.push({ role: 'user', content: userMessage });

    // 3. 调用 LLM
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 1024,
      system: `你是一个贴心的个人助手。你记得用户之前告诉你的事情。${memoryContext}
如果对话中提到了值得记住的信息（偏好、事实、重要事件），在回复末尾用 <memory>标签标记。
格式: <memory type="preference|fact|experience" importance="1-10">值得记住的内容</memory>`,
      messages: this.conversationHistory,
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // 4. 提取并存储新记忆
    const memoryMatch = text.match(/<memory type="(\w+)" importance="(\d+)">(.+?)<\/memory>/g);
    if (memoryMatch) {
      for (const match of memoryMatch) {
        const [, type, importance, content] = match.match(/<memory type="(\w+)" importance="(\d+)">(.+?)<\/memory>/) || [];
        if (content) {
          await this.storeMemory(content, type as any, parseInt(importance));
        }
      }
    }

    // 清除 memory 标签后存储回复
    const cleanReply = text.replace(/<memory[^>]*>.*?<\/memory>/g, '').trim();
    this.conversationHistory.push({ role: 'assistant', content: cleanReply });

    return cleanReply;
  }

  private async recallMemories(query: string) {
    const results = await this.memoryCollection.query({
      queryTexts: [query],
      nResults: 5,
    });
    return (results.documents?.[0] || []).map((doc: string, i: number) => ({
      content: doc,
      metadata: results.metadatas?.[0]?.[i],
    }));
  }

  private async storeMemory(content: string, type: string, importance: number) {
    await this.memoryCollection.add({
      ids: [`mem-${Date.now()}`],
      documents: [content],
      metadatas: [{ type, importance, timestamp: Date.now() }],
    });
    console.log(`🧠 新记忆: [${type}] ${content}`);
  }
}

// 使用示例
async function main() {
  const assistant = new MemoryAssistant('user-001');
  await assistant.init();

  // 第一次对话
  console.log('用户:', '我叫小明，我喜欢用 TypeScript 写代码');
  console.log('助手:', await assistant.chat('我叫小明，我喜欢用 TypeScript 写代码'));

  // 第二次对话（助手应该记得）
  console.log('\n用户:', '推荐一个前端框架给我');
  console.log('助手:', await assistant.chat('推荐一个前端框架给我'));

  // 第三次对话（验证记忆）
  console.log('\n用户:', '你还记得我叫什么吗？');
  console.log('助手:', await assistant.chat('你还记得我叫什么吗？'));
}

main();
```

---

## ⚡ 进阶技巧

### 1. 知识图谱 + 向量记忆的双重检索

整合第 4 章的知识图谱，实现"向量做语义召回，图谱做精确推理"的双通道记忆：

```typescript
class DualRetrievalAssistant extends MemoryAssistant {
  private kg: KnowledgeGraph;

  async chat(userMessage: string): Promise<string> {
    // 通道 1：向量检索（语义相似）
    const vectorMemories = await this.recallMemories(userMessage);

    // 通道 2：图检索（关系路径）
    const entities = await this.extractEntities(userMessage);
    const graphRelations = entities.flatMap(e => {
      const subgraph = this.kg.getSubgraph(e.name, 2);
      return subgraph.relations.map(r =>
        `(${r.source}) -[${r.type}]-> (${r.target})`
      );
    });

    // 融合记忆上下文
    const context = [
      ...vectorMemories.map(m => `📝 ${m.content}`),
      ...graphRelations.map(r => `🔗 ${r}`),
    ];
    const memoryContext = context.length > 0
      ? `\n\n相关知识:\n${context.join('\n')}`
      : '';

    // 继续标准的 chat 流程...
  }
}
```

### 2. 间隔重复式记忆巩固

参照 Ebbinghaus 间隔重复（Spaced Repetition）原理，让 Agent 定期主动回顾旧记忆，强化关键信息：

```typescript
class SpacedRepetitionMemory {
  private reviewSchedule = [
    { after: 1 * 60 * 1000 },     // 1 分钟后首次回顾
    { after: 10 * 60 * 1000 },    // 10 分钟
    { after: 60 * 60 * 1000 },    // 1 小时
    { after: 24 * 60 * 60 * 1000 }, // 1 天
  ];

  async reviewAndConsolidate() {
    const memories = await this.getAllMemories();
    for (const mem of memories) {
      const lastReview = mem.metadata.lastReview || 0;
      const nextReview = this.getNextReview(mem.metadata.reviewCount || 0);
      if (Date.now() - lastReview > nextReview) {
        // 用 LLM 重新评估记忆的重要性
        const newImportance = await this.rerankImportance(mem.content);
        await this.updateMemory(mem.id, {
          importance: newImportance,
          reviewCount: (mem.metadata.reviewCount || 0) + 1,
          lastReview: Date.now(),
        });
      }
    }
  }
}
```

### 3. 记忆审计日志

记录每次记忆的"存取操作"，便于调试和追溯：

```typescript
interface AuditLog {
  timestamp: number;
  action: 'store' | 'recall' | 'forget' | 'consolidate';
  memoryId: string;
  content: string;
  trigger: string;  // 触发该操作的用户消息
}

class AuditableMemoryAssistant extends MemoryAssistant {
  private auditLogs: AuditLog[] = [];

  logAction(action: AuditLog['action'], memoryId: string, content: string, trigger: string) {
    this.auditLogs.push({
      timestamp: Date.now(),
      action,
      memoryId,
      content: content.slice(0, 100),
      trigger: trigger.slice(0, 100),
    });
  }

  getAuditReport(): string {
    return this.auditLogs
      .map(log => `[${new Date(log.timestamp).toISOString()}] ${log.action}: ${log.content}`)
      .join('\n');
  }
}
```

---

## 🧠 知识检查点

### Q1: 为什么要在 LLM 的 system prompt 中嵌入记忆上下文（`${memoryContext}`），而不是直接添加到 messages 数组末尾？

<details>
<summary>查看答案</summary>

有两个原因：

1. **Lost in the Middle 效应**：放在 system prompt 中（上下文开头）比放在 messages 数组中间更容易被 LLM 关注。研究表明 LLM 对上下文开头和末尾的信息关注度最高。

2. **区分"记忆"和"对话"**：记忆是 Agent 自己的知识，不是用户当前说的内容。放在 system prompt 中可以明确告诉模型"这些是你的记忆，不是对当前问题的直接输入"，帮助模型正确地区分"我记住的"和"用户刚说的"。

3. **持久性**：system prompt 在压缩对话历史时不会被裁剪，确保关键记忆始终存在于上下文中。
</details>

### Q2: 本实现中使用 `<memory>` 标签让 LLM 自主决定存储什么，这和 MemGPT 的 "recall/memorize 函数调用"有何异同？

<details>
<summary>查看答案</summary>

**相同点**：两者都遵循"LLM 自主管理记忆"的核心思想——不是由外部代码决定什么值得记住，而是让 LLM 自己评估并标记需要存储的信息。

**不同点**：
- **本实现**：使用文本标签 `<memory>`，在 LLM 回复中嵌入结构化标记，代码端解析后存储。优点是实现简单，不需要 function calling。
- **MemGPT**：使用函数调用（`recall(depth)`、`memorize(text)`、`compress()`），LLM 在推理过程中主动调用这些函数。优点是更灵活——LLM 可以随时检索记忆，而不是只在回复结尾插入标签。

**改进建议**：如果 LLM 支持 Tool Use（工具调用），可以将 `<memory>` 替换为实际的 `storeMemory()` 和 `recallMemory()` 函数调用，让 LLM 在对话过程中主动管理记忆。
</details>

### Q3: 如果用户说"我讨厌 TypeScript，我现在喜欢 Python"，系统应该怎么做才能正确更新记忆？

<details>
<summary>查看答案</summary>

这是一个典型的**记忆冲突（Memory Conflict）**场景。正确的处理流程应该是：

1. **检测冲突**：首先在向量数据库中检索所有与"TypeScript"和"偏好"相关的记忆
2. **识别旧记忆**：发现已有记忆"用户喜欢使用 TypeScript"
3. **标记过期**：将旧记忆的 `importance` 降低（如从 7 降到 2），或者添加 `validUntil` 时间戳
4. **存储新记忆**：存入"用户偏好已从 TypeScript 迁移到 Python"
5. **更新知识图谱**：将 (用户) --偏好--> (TypeScript) 的关系标记为过期，新增 (用户) --偏好--> (Python)

**不要直接删除旧记忆**，因为在某些上下文中（如"用户过去用什么？"）旧记忆仍然有参考价值。使用时间戳标记过期比直接删除更灵活。
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 没有处理记忆冲突——用户改变偏好后新旧记忆同时存在 | 每次对话只做"追加式"存储，不做冲突检测和更新 | 在存储前执行冲突检测：检索语义相似的已有记忆，如果存在冲突则标记旧记忆过期而非直接覆盖 |
| 短期对话历史无限增长，没有压缩策略 | 只实现了长期记忆的存储，没有管理对话历史大小 | 在 `chat()` 方法中添加：每次对话后检查 `conversationHistory` 长度，超过阈值时执行摘要压缩（第 2 章策略） |
| 对话中提取的记忆没有去重，同一信息被多次存储 | `<memory>` 标签机制只在存储端工作，缺少读取时的去重 | 在 `storeMemory()` 中添加：存储前先检索相似度 > 0.9 的已有记忆，如果存在则只更新重要性而非重复添加 |

---

## 📝 本章小结

- ✅ **完整记忆助手** — 短期（对话）+ 长期（向量存储）记忆
- ✅ **自动记忆提取** — 从对话中识别值得记住的信息
- ✅ **记忆增强回复** — 回答时参考历史记忆
- ✅ **MemGPT 式自主管理** — LLM 通过标签自主触发存储
- ✅ **双重检索架构** — 向量语义召回 + 图谱关系推理
- ✅ **间隔重复巩固** — Ebbinghaus 曲线指导的记忆回顾策略
- ✅ **记忆冲突处理** — 用户偏好变化时标记旧记忆过期而非直接删除
- ✅ **审计日志** — 记录每次记忆操作，便于调试和追溯

## ➡️ 下一步

恭喜你完成了记忆系统的完整学习！你已经掌握了从认知科学理论到工程实践的全面知识。

> 查看附录，然后进入 [2.4 RAG 系统](../../2.4-rag-system/README.md) 继续学习检索增强生成。
