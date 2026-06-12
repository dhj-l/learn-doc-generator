# 第5章：记忆框架 — Mem0 与 Zep

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 Mem0 框架** — 快速集成开源 AI 记忆层
- **使用 Zep 商业记忆服务** — 生产级持久化记忆管理
- **在自建方案和现成框架之间做选择** — 知道什么场景用什么方案

## 📋 前置知识

> 建议先完成：
> - [第1章：记忆类型概述](./01-memory-types.md) — 理解短期、长期、工作记忆的区别
> - [第3章：长期记忆](./03-long-term-memory.md) — 了解持久化记忆的基础概念

---

## 💡 核心概念

### 概念一：为什么需要记忆框架？

**生活类比：** 如果你要为一个家庭建一个「记忆库」——记录每个人的生日、喜好、说过的话。你可以自己写个 Excel 表格（自建方案），也可以买一本现成的「家庭日记本」（Mem0），或者雇一个专业的管家（Zep）。

| 对比维度 | 自建方案 | Mem0 | Zep |
|----------|----------|------|-----|
| 开发时间 | 2-3 天 | 1-2 小时 | 1 小时 |
| 维护成本 | 高（要自研） | 低（开源社区） | 极低（SaaS） |
| 可定制性 | 完全可控 | 较高 | 有限 |
| 适合阶段 | 有特殊需求 | 快速原型到生产 | 规模化生产 |

### Mem0 — 开源 AI 记忆层

Mem0 是一个开源框架，核心能力是**自动从对话中提取和持久化记忆**：

```python
# Mem0 Python SDK
from mem0 import Memory

# 初始化记忆系统
memory = Memory(
    config={
        "llm": "claude-3-sonnet",  # 使用 Claude 提取记忆
        "embedder": "openai",       # 使用 Embedding 存储记忆
        "vector_store": "chroma",   # 向量存储后端
    }
)

# 添加记忆（自动提取关键信息）
result = memory.add(
    messages=[
        {"role": "user", "content": "我叫小明，今年 25 岁，是一名前端开发者。"},
        {"role": "assistant", "content": "你好小明！很高兴认识你。"},
    ],
    user_id="user_123",
)
# 自动提取出: {name: "小明", age: 25, occupation: "前端开发者"}

# 检索相关记忆
relevant = memory.search(
    query="小明的职业",
    user_id="user_123",
)
# 返回: [{text: "小明是一名前端开发者", score: 0.92}]

# 获取所有用户记忆
all_memories = memory.get_all(user_id="user_123")
```

### Zep — 商业级记忆管理

Zep 是一个开源的记忆服务（提供 SaaS 版本），专注于生产环境的长期记忆管理：

```python
from zep_cloud.client import Zep

client = Zep(api_key="your-api-key")

# 添加对话历史
client.memory.add(
    session_id="session_123",
    messages=[
        {"role_type": "user", "content": "帮我订一张明天去北京的机票"},
        {"role_type": "assistant", "content": "好的，明天去北京的航班..."},
    ],
)

# 获取摘要记忆
summary = client.memory.get(session_id="session_123")
print(summary.relevant_summary)
# 输出: "用户需要订明天去北京的机票"

# 搜索记忆
results = client.memory.search(
    session_id="session_123",
    query="北京机票",
    limit=5,
)
```

---

## 🔨 实战演练

<details>
<summary>🧑‍💻 在 Agent 中集成 Mem0</summary>

```typescript
// agent-with-mem0.ts
import Anthropic from '@anthropic-ai/sdk';

// 简单的内存记忆系统（模拟 Mem0 行为）
class SimpleMemory {
  private memories: Map<string, Array<{ key: string; value: string }>> = new Map();

  async extractAndStore(userId: string, conversation: string[]) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `从以下对话中提取用户的关键信息（姓名、偏好、重要事件等）：
${conversation.join('\n')}
输出 JSON 格式的键值对。`
      }],
    });

    const extracted = JSON.parse(response.content[0].text);
    const existing = this.memories.get(userId) || [];
    for (const [key, value] of Object.entries(extracted)) {
      existing.push({ key, value: String(value) });
    }
    this.memories.set(userId, existing);
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 1. Mem0 + LangChain 集成

Mem0 可以无缝嵌入 LangChain Agent，让 Agent 自动拥有跨会话记忆：

```typescript
import { ChatAnthropic } from '@langchain/anthropic';
import { Memory } from 'mem0';

const memory = new Memory({ config: { llm: 'claude-3-sonnet', embedder: 'openai' } });

async function chatWithMemory(userId: string, message: string) {
  // 检索相关记忆
  const relevant = await memory.search(message, { user_id: userId });
  const context = relevant.map(r => r.text).join('\n');

  const llm = new ChatAnthropic({ model: 'claude-sonnet-4-5-20241022' });
  const response = await llm.invoke([
    { role: 'system', content: `用户相关记忆:\n${context}` },
    { role: 'user', content: message },
  ]);

  // 自动提取新记忆
  await memory.add([{ role: 'user', content: message }, { role: 'assistant', content: response.content }], { user_id: userId });
  return response.content;
}
```

### 2. Zep 的会话摘要自动生成

Zep 在每次添加消息后自动生成会话摘要，无需手动调用。利用这个特性可以实现"零代码"记忆持久化：

```typescript
// 只需添加消息，Zep 后台自动维护摘要
await client.memory.add(sessionId, [
  { role_type: 'user', content: '我的名字是 Alice' },
]);

// 几秒后即可获取自动生成的摘要
const session = await client.memory.getSession(sessionId);
console.log(session.summary);
```

**预期输出：**
```
用户自我介绍为 Alice
```

### 3. 自建方案的模块化设计

如果选择自建，把每个能力拆成独立模块，方便后续替换：

```typescript
interface MemoryBackend {
  store(entry: MemoryEntry): Promise<void>;
  search(query: string, topK: number): Promise<MemoryEntry[]>;
  delete(id: string): Promise<void>;
  prune(): Promise<number>;
}

// 可随时切换后端实现
class ChromaBackend implements MemoryBackend { /* ... */ }
class PineconeBackend implements MemoryBackend { /* ... */ }
class InMemoryBackend implements MemoryBackend { /* 本地测试用 */ }
```

## 🧠 知识检查点

<details>
<summary><strong>Q1: Mem0 和 Zep 的核心定位区别是什么？</strong></summary>

**A:** Mem0 是一个**开源 SDK 层**，专注于自动从对话中提取和结构化记忆（姓名、偏好等），轻量灵活，适合快速集成。Zep 是一个**完整的记忆服务**（支持自托管和 SaaS），专注于会话管理、摘要生成和持久化，适合生产环境中需要开箱即用、免运维的场景。
</details>

<details>
<summary><strong>Q2: 什么情况下应该选择自建方案而非使用现成框架？</strong></summary>

**A:** 当你有以下需求时自建更合适：① 需要私有化部署在特定网络环境内；② 需要深度定制 Embedding 模型和检索算法（如混合检索、图向量融合）；③ 数据合规要求不能将用户数据发送到第三方服务；④ 需要与现有的 ChromaDB / Postgres 等基础设施集成。否则，优先选 Mem0（快速迭代）或 Zep（生产级）。
</details>

<details>
<summary><strong>Q3: SimpleMemory 中用 LLM 提取键值对的局限性是什么？</strong></summary>

**A:** ① **延迟** — 每次对话都调用 LLM 提取记忆，增加 1-3 秒响应时间；② **成本** — Token 消耗随对话长度线性增长；③ **格式不稳定** — LLM 输出的 JSON 偶尔不合法，需要 try-catch 兜底；④ **增量更新困难** — 已提取的信息如果被后续对话修正很难优雅更新。生产环境建议用 Mem0 等专门框架替代。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Mem0 的 `add()` 重复提取相同信息 | 每次对话都传入全部历史，Mem0 重新提取导致冗余 | 只传入新增的消息对，或使用 Mem0 的 `update()` 方法增量更新 |
| Zep API Key 泄露到代码仓库 | 将 API Key 硬编码在代码中并提交到 Git | 使用环境变量 `ZEP_API_KEY`，并添加 `.env` 到 `.gitignore` |
| 过度依赖框架导致 Vendor Lock-in | 代码直接耦合 Mem0/Zep 的 API 类型，切换成本高 | 定义 `MemoryBackend` 接口隔离层，框架实现在接口之下 |

---

## 📝 本章小结

- ✅ **Mem0** — 开源记忆框架，自动从对话中提取关键信息
- ✅ **Zep** — 商业级记忆管理，适合生产环境
- ✅ **自建方案** — ChromaDB + LLM 实现定制化记忆系统
- ✅ **选型建议** — 快速原型用 Mem0，生产环境用 Zep，特殊需求自建

## ➡️ 下一章预告

> [第6章：综合实战 — 带记忆的 AI 助手](./06-capstone-memory-assistant.md)
