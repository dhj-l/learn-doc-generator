# 第5章：记忆框架 — LangChain Memory、Mem0 与 Zep

> 预计学习时间：70-90 分钟

## 🎯 本章目标

- 了解主流 Agent 记忆框架的架构设计与使用场景
- 掌握 LangChain Memory 模块的四种记忆类型及其原理
- 理解 Mem0 的自动记忆提取与分层存储机制
- 了解 Zep 的生产级记忆管理特性及其与自建方案的取舍
- 能够根据项目需求选择合适的记忆框架

## 📋 前置知识

- 第 1-4 章中关于短期、长期、知识图谱记忆的全部概念
- 基本的 LLM 应用开发经验
- 了解 Python/TypeScript 跨语言集成的概念

## 💡 核心概念

### 为什么需要记忆框架？

在前 4 章中，我们从零搭建了记忆系统的各个组件。但在生产环境中，通常不需要重新发明轮子——**记忆框架**提供了开箱即用的解决方案：

```
自建方案 vs 记忆框架

自建方案：             记忆框架：
  ┌──────────┐         ┌──────────┐
  │ Embedding│         │ 自动提取  │ ← 集成 LLM 调用
  │ 向量数据库│         │ 分层存储  │ ← 短期/长期自动管理
  │ LLM 调用 │         │ 遗忘策略  │ ← 内置 Ebbinghaus 衰减
  │ 压缩逻辑 │         │ 检索增强  │ ← 混合检索策略
  │ 遗忘策略 │         │ API 接口  │ ← 一行代码接入
  │ Kimi 手工│         │ 生产就绪  │ ← 高可用、可扩展
  └──────────┘         └──────────┘
```

**选型决策树：**

```
需要记忆功能？
  ├── 简单的对话压缩 → LangChain ConversationBufferMemory
  ├── 需要跨会话持久记忆
  │   ├── 开源优先 → Mem0
  │   └── 生产级/高性能 → Zep
  └── 需要完全定制 → 自建（ChromaDB + LLM）
```

### LangChain Memory 模块

LangChain 提供了四种内置记忆类型，覆盖了 Atkinson-Shiffrin 模型的不同层次：

```typescript
import { BufferMemory } from 'langchain/memory';
import { ConversationSummaryMemory } from 'langchain/memory';
import { VectorStoreRetrieverMemory } from 'langchain/memory';
import { CombinedMemory } from 'langchain/memory';

// === 类型 1：BufferMemory（短期记忆） ===
// 对应：短期记忆 — 保留所有对话历史
// 缺点：随对话增长无限膨胀，无压缩机制
const bufferMemory = new BufferMemory({
  memoryKey: 'chat_history',
  returnMessages: true,
});

// === 类型 2：ConversationSummaryMemory（摘要压缩） ===
// 对应：Miller's Law 组块化 — 将历史压缩为摘要
// 机制：每次对话后自动用 LLM 生成摘要
const summaryMemory = new ConversationSummaryMemory({
  llm: new ChatOpenAI({ modelName: 'gpt-4', temperature: 0 }),
  maxTokenLimit: 2000,        // 摘要最大 Token 数
  summaryMessage: "以下是对之前对话的总结：",
});

// === 类型 3：VectorStoreRetrieverMemory（长期记忆） ===
// 对应：长期记忆 — 基于语义检索
// 机制：存储 + Embedding + 向量检索
const vectorMemory = new VectorStoreRetrieverMemory({
  vectorStore: new MemoryVectorStore(new OpenAIEmbeddings()),
  memoryKey: 'relevant_history',
  k: 3,   // Top-K 检索
});

// === 类型 4：CombinedMemory（混合记忆） ===
// 对应：完整记忆系统 — 整合所有层级
const combinedMemory = new CombinedMemory({
  memories: [bufferMemory, summaryMemory, vectorMemory],
});
```

### Mem0 — 开源 AI 记忆层

Mem0（Memory Layer for AI）是一个开源框架，核心特点是从对话中**自动提取**关键信息并存储。它内置了 Atkinson-Shiffrin 模型的工程实现：

```
Mem0 架构：
  用户输入
     │
     ▼
  ┌─────────────────────┐
  │ 1. 信息提取          │ ← LLM 从对话中自动提取事实/偏好
  │    (Online Encoding) │
  └─────────┬───────────┘
            ▼
  ┌─────────────────────┐
  │ 2. 冲突检测          │ ← 与已有记忆比较，避免重复
  │    (Entity         │
  │     Resolution)     │
  └─────────┬───────────┘
            ▼
  ┌─────────────────────┐
  │ 3. 重要性评分        │ ← 自动评分（1-10）
  │    (Importance)     │
  └─────────┬───────────┘
            ▼
  ┌─────────────────────┐
  │ 4. 分层存储          │ ← 短期→长期，按重要性分层
  │    (Multi-level)    │
  └─────────┬───────────┘
            ▼
  ┌─────────────────────┐
  │ 5. 记忆检索          │ ← 基于语义相似度 + 重要性
  │    (Hybrid Search)  │
  └─────────────────────┘
```

```bash
pip install mem0ai  # Python SDK
# 或使用 API
```

```typescript
// Mem0 的核心概念
// 自动从对话中提取和存储记忆
// 支持用户级、会话级、Agent 级记忆
```

**Mem0 的分层存储模型：**

| 层级 | 持久性 | 容量 | 管理方式 |
|------|--------|------|----------|
| 用户级（User） | 跨所有会话 | 无限 | 自动提取用户偏好和事实 |
| 会话级（Session） | 单次对话 | 上下文窗口限制 | 对话历史 + 摘要 |
| Agent 级（Agent） | 跨用户共享 | 按 Agent 隔离 | Agent 自身的知识库 |

### Zep — 生产级记忆管理

Zep 是一个商业化的记忆管理平台，专门为生产环境设计。它的核心优势在于**性能和可扩展性**：

```
Zep 特性矩阵：
  ┌──────────────────────────┬──────────┬──────────┐
  │ 特性                      │ Mem0     │ Zep      │
  ├──────────────────────────┼──────────┼──────────┤
  │ 开源                      │ ✅       │ ❌ (商业) │
  │ 自动记忆提取               │ ✅       │ ✅       │
  │ 向量存储                  │ 内置      │ 内置     │
  │ 知识图谱                  │ ❌       │ ✅       │
  │ 实体提取                  │ 基础     │ 高级     │
  │ 摘要生成                  │ ✅       │ ✅       │
  │ 分类/标签                 │ ❌       │ ✅       │
  │ API 延迟                 │ N/A      │ <50ms   │
  │ 水平扩展                  │ 自建     │ 内置     │
  │ 角色基础的访问控制（RBAC）   │ ❌       │ ✅       │
  └──────────────────────────┴──────────┴──────────┘
```

**Zep 的独特优势：**
- **内置知识图谱**：不只是向量检索，Zep 从对话中构建知识图谱，支持关系查询
- **分类与标签**：自动对记忆片段进行分类（如"工作相关"、"个人偏好"）
- **低延迟 API**：专为实时对话优化
- **官方 SDK**：JavaScript、Python、Go 等多语言支持

### 选型建议

| 框架 | 特点 | 适用场景 |
|------|------|----------|
| 自建 | 完全可控 | 需要定制化、学习目的 |
| Mem0 | 开源、自动提取 | 快速集成、中小型项目 |
| Zep | 商业级、高性能 | 生产环境、大型部署 |
| LangChain | 框架集成、多种选择 | 已在用 LangChain 的项目 |

---

## 🔨 实战演练

**场景描述：**
你正在为一家 SaaS 公司构建一个**客户支持 Agent**。Agent 需要：
1. **跨会话记忆**：记住客户的技术栈、已解决的问题、偏好
2. **团队共享**：同一客户与不同客服对话时，Agent 共享记忆
3. **知识库集成**：将公司的产品文档作为"永久知识"注入上下文

**你的任务：**
1. 使用 LangChain 的 `CombinedMemory` 整合三种记忆类型（buffer + summary + vector）
2. 使用 Mem0（或模拟其 API）实现跨会话的客户偏好存储
3. 设计一个**记忆分级访问策略**：客户信息（高优先级）→ 会话摘要（中等）→ 产品知识库（按需检索）

<details>
<summary>💡 参考实现思路</summary>

```typescript
class CustomerSupportAgent {
  private langChainMemory: CombinedMemory;
  private customerProfile: Map<string, any>;

  constructor() {
    this.langChainMemory = new CombinedMemory({
      memories: [
        new BufferMemory({ memoryKey: 'recent_chat' }),
        new ConversationSummaryMemory({
          llm: new ChatOpenAI({ temperature: 0 }),
          maxTokenLimit: 2000,
        }),
        new VectorStoreRetrieverMemory({
          vectorStore: new MemoryVectorStore(new OpenAIEmbeddings()),
          k: 5,
        }),
      ],
    });
    this.customerProfile = new Map();
  }

  async handleMessage(customerId: string, message: string) {
    // 1. 加载客户档案（高优先级）
    const profile = this.customerProfile.get(customerId) || {};
    const profileContext = profile.bio
      ? `客户简介：${profile.bio}. 技术栈：${profile.techStack?.join(', ')}`
      : '';

    // 2. 从 LangChain 检索相关记忆（中等优先级）
    const memoryResult = await this.langChainMemory.loadMemoryVariables({ input: message });

    // 3. 知识库检索（按需，低优先级）
    const kbResults = message.includes('产品') || message.includes('功能')
      ? await this.searchKnowledgeBase(message)
      : [];

    // 4. 构建上下文
    const context = [
      { role: 'system', content: `客户档案：${profileContext}` },
      { role: 'system', content: `相关记忆：${memoryResult.relevant_history}` },
      ...(kbResults.length > 0
        ? [{ role: 'system', content: `相关知识：${kbResults.join('\n')}` }]
        : []),
    ];

    return context;
  }

  // 记忆分级：按优先级降级
  async compressIfNeeded() {
    // 低优先级（知识库）先被丢弃
    // 中优先级（会话摘要）被压缩
    // 高优先级（客户档案）永不丢弃
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 1. 混合记忆策略：将框架能力与自建逻辑结合

不要局限于某个框架的记忆模型。可以在 LangChain 之上叠加自定义的逻辑：

```typescript
class HybridMemorySystem {
  constructor() {
    this.buffer = new BufferMemory();        // LangChain
    this.vector = new VectorStoreRetrieverMemory(); // LangChain
    this.kg = new KnowledgeGraph();          // 自建
    this.importanceScorer = new ImportanceScorer(); // 自建
  }

  async save(context: string, importance: number) {
    // 高重要性 → 同时存入向量和图谱
    if (importance > 7) {
      await this.vector.saveContext({ input: context }, { output: '' });
      await this.kg.extractAndStore(context);
    }
    // 中等重要性 → 只存入向量
    else if (importance > 4) {
      await this.vector.saveContext({ input: context }, { output: '' });
    }
    // 低重要性 → 只留在缓冲区
    else {
      await this.buffer.saveContext({ input: context }, { output: '' });
    }
  }
}
```

### 2. 记忆预热（Memory Warmup）

对于已知的重要客户或场景，在对话开始前预填充记忆——减少冷启动时的空检索问题：

```typescript
async function warmupMemory(
  vectorMemory: VectorStoreRetrieverMemory,
  customerProfile: { name: string; techStack: string[]; history: string }
) {
  // 将客户档案中的关键信息预填充到向量存储中
  const lines = [
    `客户姓名：${customerProfile.name}`,
    `技术栈：${customerProfile.techStack.join(', ')}`,
    `历史交互摘要：${customerProfile.history}`,
  ];

  for (const line of lines) {
    await vectorMemory.saveContext(
      { input: `关于客户的信息：${line}` },
      { output: '已记录' }
    );
  }
}
```

### 3. 多租户隔离

当 Agent 服务多个组织（租户）时，确保记忆隔离——Zep 通过 Collection 隔离、Mem0 通过 user_id 隔离：

```typescript
class MultiTenantMemory {
  private stores = new Map<string, VectorStoreRetrieverMemory>();

  getMemory(tenantId: string): VectorStoreRetrieverMemory {
    if (!this.stores.has(tenantId)) {
      // 每个租户独立的向量存储
      this.stores.set(tenantId, new VectorStoreRetrieverMemory({
        vectorStore: new MemoryVectorStore(new OpenAIEmbeddings()),
        // 确保检索时只搜索该租户的数据
        k: 5,
      }));
    }
    return this.stores.get(tenantId)!;
  }
}
```

---

## 🧠 知识检查点

### Q1: LangChain 的 ConversationSummaryMemory 和 BufferMemory 最核心的区别是什么？

<details>
<summary>查看答案</summary>

**BufferMemory** 保留所有消息原文，随对话增长线性增加 Token 消耗。它是"原始短期记忆"——完整但低效。

**ConversationSummaryMemory** 每次对话后用 LLM 生成摘要，只保留摘要 + 最近的消息。它是"Miller's Law 组块化的工程实现"——将分散的多轮对话压缩为一个信息组块。

核心区别：BufferMemory 是**无损但高成本**（完整信息，高 Token），SummaryMemory 是**有损但低成本**（摘要信息，低 Token）。选择取决于对话的长度和对细节的需求程度。
</details>

### Q2: Mem0 和自建方案（ChromaDB + LLM）相比，Mem0 解决了哪些"自建"的痛点？

<details>
<summary>查看答案</summary>

自建方案需要处理的大量"脏活"被 Mem0 封装了：

1. **自动提取策略**：自建需要手写 Prompt 从对话中提取关键信息；Mem0 内置了经过多轮迭代的提取策略
2. **冲突检测**：自建需要自己实现"如果用户先说喜欢 A 后又喜欢 B，是更新还是追加？"的逻辑；Mem0 内置了记忆更新和合并
3. **重要性评分**：自建需要设计评分公式；Mem0 通过 LLM 自动评估重要性
4. **遗忘策略**：自建需要实现定时清理；Mem0 内置了基于重要性 + 时效性的遗忘机制
5. **多层级管理**：自建需要自己维护用户级/会话级/Agent 级存储；Mem0 原生支持

不过，**自建的优势是完全的控制权**——你可以针对特定领域微调提取策略、评分规则和检索逻辑。
</details>

### Q3: Zep 的"内置知识图谱"和我们在第 4 章自建的知识图谱相比，有哪些额外优势？

<details>
<summary>查看答案</summary>

Zep 的知识图谱不是简单的关系存储，而是**在知识图谱之上叠加了向量索引**的双重结构：

1. **自动实体解析**：Zep 自动处理共指消解（"小明"和"Xiao Ming"识别为同一实体），自建方案需要手写实体解析逻辑
2. **图向量混合检索**：在 Zep 中，一个查询可以同时利用图的路径关系和向量的语义相似度排序结果
3. **关系置信度**：Zep 对每一条提取的关系标注置信度，低置信度关系在检索中被降权
4. **时间衰减**：Zep 自动对旧关系施以衰减权重，自建需要手写 Temporal Graph 逻辑
5. **API 即可用**：不需要部署图数据库（如 Neo4j），Zep 管理了全部基础设施
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 同时使用多个记忆框架但不做协调 | 将 LangChain BufferMemory、Mem0、自建向量存储同时启用，导致同一信息被多处重复存储 | 确定主框架（如 LangChain），将其他框架作为"插件"在 LangChain 的 memory 链路上集成；使用 CombinedMemory 统一管理 |
| 忽视框架的 Token 消耗 | LangChain 的 SummaryMemory 每次对话后调用 LLM 生成摘要，如果对话频繁（每秒多条），LLM 调用成本失控 | 设置摘要生成的最小间隔（如每 5 轮生成一次），或在对话空闲期批量处理；使用小模型（如 Haiku/GPT-4o-mini）做摘要 |
| 生产环境直接使用内存向量存储（MemoryVectorStore） | LangChain 的 `MemoryVectorStore` 是纯内存实现，重启后数据全部丢失 | 生产环境替换为持久化向量数据库（ChromaDB/Pinecone/Weaviate），或使用 Zep 这样的托管服务 |

---

## 📝 本章小结

- ✅ **LangChain Memory** — BufferMemory、ConversationSummaryMemory、VectorStoreRetrieverMemory、CombinedMemory 四种内置类型
- ✅ **Mem0** — 开源记忆框架，自动提取对话中的关键信息，内置重要性评分和遗忘策略
- ✅ **Zep** — 商业级记忆管理，内置知识图谱，适合生产环境
- ✅ **自建方案** — ChromaDB + LLM 实现定制化记忆系统，完全可控
- ✅ **混合策略** — 框架提供基础设施，自建逻辑实现领域特定的记忆策略
- ✅ **记忆预热** — 冷启动时预填充记忆，减少空检索问题
- ✅ **多租户隔离** — 不同组织/用户的记忆严格隔离

## ➡️ 下一章预告

> [第6章：综合实战 — 带持久记忆的个人 AI 助手](./06-capstone-memory-assistant.md) — 将前 5 章所学整合为一个完整的、带分层记忆的 AI 助手。
