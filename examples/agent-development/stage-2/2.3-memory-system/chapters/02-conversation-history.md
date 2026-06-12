# 第2章：对话历史管理 — 控制上下文窗口

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解三种对话压缩策略** — 滑动窗口、摘要压缩、选择性保留
- **实现 Token 预算控制** — 防止超出上下文窗口限制
- **选择适合场景的压缩策略** — 长对话 vs 短对话的不同方案

## 📋 前置知识

> 建议先完成：[第1章：记忆类型概述](./01-memory-types.md)

---

## 💡 核心概念

### 为什么需要管理对话历史？

**生活类比：** 你和朋友聊天，聊了 3 个小时。你的大脑只能记住最近 30 分钟的内容（短期记忆），更早的只能记住大意（摘要）。AI 模型的上下文窗口也是有限的——Claude 有 200K Token，但聊得足够久总会被填满。

### 三种对话压缩策略

```typescript
// 策略 1：滑动窗口 — 保留最近 N 轮
function slidingWindow(messages: any[], maxTurns: number = 10) {
  // 每轮 = user + assistant 两条消息
  return messages.slice(-maxTurns * 2);
}
// 优点：实现简单，速度快
// 缺点：丢失早期信息

// 策略 2：摘要压缩 — 将旧对话压缩为摘要
async function summarizeOld(messages: any[], keepRecent: number = 6) {
  const toSummarize = messages.slice(0, -keepRecent);
  const recent = messages.slice(-keepRecent);
  const summary = await generateSummary(toSummarize);
  return [
    { role: 'system', content: `之前的对话摘要: ${summary}` },
    ...recent,
  ];
}
// 优点：保留早期关键信息
// 缺点：需要额外 LLM 调用

// 策略 3：选择性保留 — 只保留重要消息
function selectiveKeep(messages: any[]) {
  return messages.filter(m => {
    if (m.role === 'system') return true;
    if (m.role === 'user' && isImportant(m.content)) return true;
    return isRecent(m, 3);
  });
}
// 优点：智能保留有价值的内容
// 缺点：需要定义什么算"重要"
```

**💡 三种策略怎么选？** 滑动窗口适合短对话（<10轮），摘要压缩适合长对话（>20轮），选择性保留适合需要精准控制内容的场景。最佳实践是组合使用——先用滑动窗口兜底，定期触发摘要压缩。

### Token 预算控制

```typescript
class TokenBudgetManager {
  private budget: number;
  private used: number = 0;

  constructor(budget: number = 100000) {
    this.budget = budget;
  }

  canAdd(estimatedTokens: number): boolean {
    return this.used + estimatedTokens < this.budget * 0.9;
  }

  async compressToFit(requiredTokens: number, messages: any[]): Promise<any[]> {
    while (!this.canAdd(requiredTokens) && messages.length > 4) {
      messages = await summarizeOld(messages, 4);
      this.recalculate(messages);
    }
    return messages;
  }
}
```

---

## 🔨 实战演练

<details>
<summary>🧑‍💻 构建自适应对话管理器</summary>

```typescript
class AdaptiveConversationManager {
  private messages: any[] = [];
  private tokenBudget = new TokenBudgetManager();
  private totalCompressions = 0;

  async addMessage(message: any) {
    const estimatedTokens = estimateTokens(JSON.stringify(message));

    if (!this.tokenBudget.canAdd(estimatedTokens)) {
      await this.compress();
      this.totalCompressions++;
    }

    this.messages.push(message);
  }

  private async compress() {
    if (this.messages.length > 20) {
      this.messages = await summarizeOld(this.messages, 6);
    } else {
      this.messages = slidingWindow(this.messages, 10);
    }
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 1. 分层摘要 — 树形压缩

不要每次压缩都重写整个摘要。维护一个**摘要树**，每 10 轮生成一个小摘要，再每 5 个小摘要生成一个父摘要，检索时按需拼接：

```typescript
interface SummaryNode {
  id: string;
  text: string;
  level: number;       // 0=原始, 1=小摘要, 2=父摘要
  messageRange: [number, number];
  children?: SummaryNode[];
}

class HierarchicalSummarizer {
  private summaries: SummaryNode[] = [];
  private messageCount = 0;

  async addMessage(msg: any) {
    this.messageCount++;
    if (this.messageCount % 10 === 0) {
      const leaf = await this.summarizeLast(10, 1);
      this.summaries.push(leaf);
      if (this.summaries.filter(s => s.level === 1).length % 5 === 0) {
        const parent = await this.summarizeLevel(1, 2);
        this.summaries.push(parent);
      }
    }
  }
}
```

### 2. Token 预算的灰度预留

不要等到用满 100% Token 才压缩——在 70% 时就开始渐进式清理，避免请求高峰时卡顿：

```typescript
class ProgressiveBudget extends TokenBudgetManager {
  async maybeCompress(messages: any[], requiredTokens: number) {
    const usage = this.used / this.budget;
    if (usage > 0.7) {
      // 70%: 只清理低价值系统消息
      messages = messages.filter(m => !(m.role === 'system' && m.content.startsWith('[临时]')));
    }
    if (usage > 0.85) {
      // 85%: 执行一次摘要压缩
      messages = await summarizeOld(messages, 6);
    }
    if (usage > 0.95) {
      // 95%: 强制执行滑动窗口
      messages = slidingWindow(messages, 8);
    }
    return messages;
  }
}
```

### 3. 混合策略自动选择器

根据对话轮数和 Token 消耗率动态切换策略，而不是硬编码：

```typescript
function selectStrategy(messages: any[], budget: number): 'sliding' | 'summary' | 'selective' {
  const avgTokensPerMsg = estimateTokens(JSON.stringify(messages)) / messages.length;
  const remainingBudget = budget * 0.9 - avgTokensPerMsg * messages.length;
  if (messages.length < 20 && remainingBudget > 0) return 'sliding';
  if (messages.length > 50) return 'summary';
  return 'selective';
}
```

## 🧠 知识检查点

<details>
<summary><strong>Q1: 三种对话压缩策略分别适合什么场景？</strong></summary>

**A:** **滑动窗口**（Sliding Window）适合短对话（<10 轮），实现简单、速度快，但会丢失早期信息。**摘要压缩**（Summarization）适合长对话（>20 轮），保留关键信息但有额外 LLM 调用成本。**选择性保留**（Selective Keep）适合需要精准控制内容的场景，但需要定义"重要"的判定规则。最佳实践通常是组合使用。
</details>

<details>
<summary><strong>Q2: TokenBudgetManager 为什么要用 budget * 0.9 而非全额作为警戒线？</strong></summary>

**A:** 预留 10% 的缓冲空间是为了防范**高估 Token** 的风险。Token 计数往往是估算值（如 `estimateTokens()`），实际模型可能额外消耗系统指令、工具调用定义等开销。如果等到 100% 才压缩，一次高估就可能导致请求超出上下文窗口而失败。
</details>

<details>
<summary><strong>Q3: 自适应对话管理器中，为什么压缩策略要区分消息数量是 >20 还是 <=20？</strong></summary>

**A:** 这是**成本与收益的平衡**。当消息数较少（≤20）时，摘要压缩的 LLM 调用成本相对于消息节省的 Token 并不划算，直接用滑动窗口更高效。当消息数较多（>20）时，摘要压缩能显著节省 Token，保留的信息量也远多于滑动窗口。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 压缩后丢失了关键的用户偏好 | 摘要压缩时没有区分"事实性信息"和"闲聊内容" | 在压缩前先提取并持久化关键信息（存入长期记忆），再对剩余内容做摘要 |
| Token 预算计算不准导致 400 错误 | 使用字符数而非 Token 数做估算，或忽略了 system prompt 的 Token | 使用 `tiktoken` 等 Tokenizer 精确计数，并将 system prompt 也纳入预算 |
| 滑动窗口切断了重要的中间结果 | Agent 在推理过程中需要保留"步骤 2→步骤 3"的中间状态 | 在滑动窗口中高亮标记包含 "final answer"、"result" 等关键字的消息为"不可丢弃" |

## 📝 本章小结

- ✅ **滑动窗口** — 简单直接，适合短对话
- ✅ **摘要压缩** — 保留关键信息，适合长对话
- ✅ **选择性保留** — 智能过滤，保留最重要的消息
- ✅ **Token 预算** — 防止超出上下文窗口限制

---

## ➡️ 下一章预告

> [第3章：长期记忆实现](./03-long-term-memory.md) — 向量数据库选型、Embedding 生成、语义检索与遗忘机制。
