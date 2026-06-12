# 第2章：对话历史管理 — 控制上下文窗口

> 预计学习时间：80-100 分钟

## 🎯 本章目标

- 理解三种对话压缩策略（滑动窗口、摘要压缩、选择性保留）的原理与取舍
- 掌握 Token 预算控制的工程实现
- 理解 Ebbinghaus 遗忘曲线在对话摘要压缩中的应用
- 掌握应对"Lost in the Middle"问题的策略
- 能够实现一个动态上下文窗口管理器

## 📋 前置知识

- 第 1 章中关于短期记忆（对话上下文）的基本概念
- LLM 的上下文窗口限制（如 Claude 100K、GPT-4 128K）
- Atkinson-Shiffrin 模型中短期记忆的容量限制

## 💡 核心概念

### 对话历史的根本矛盾

Agent 的对话历史管理面临一个根本矛盾：

> **保留更多上下文 → 更好的回答质量，但消耗更多 Token，增加延迟和成本**
> **保留更少上下文 → 更低的成本和延迟，但可能丢失关键信息**

这个矛盾来源于 LLM 的固有特性——即使模型支持 100K+ 的上下文窗口，实际使用中仍然面临：
- **Lost in the Middle 问题**（Liu et al., 2023）：当相关文档位于长上下文中部时，模型召回准确率显著下降
- **Token 成本**：每个 Token 都产生推理费用，过长上下文增加每次调用的成本
- **推理延迟**：更长的输入导致更长的首 Token 生成时间（TTFT）

### 三种对话压缩策略

```typescript
// 策略 1：滑动窗口 — 保留最近 N 轮
function slidingWindow(messages: any[], maxTurns: number = 10) {
  return messages.slice(-maxTurns * 2); // 每轮 = user + assistant
}

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

// 策略 3：选择性保留 — 只保留重要消息
function selectiveKeep(messages: any[]) {
  return messages.filter(m => {
    // 保留系统消息
    if (m.role === 'system') return true;
    // 保留包含关键信息的用户消息
    if (m.role === 'user' && isImportant(m.content)) return true;
    // 保留最近 3 轮
    return isRecent(m, 3);
  });
}
```

### 三种策略的深度对比

| 策略 | 理论依据 | 优点 | 缺点 | 适用场景 |
|------|---------|------|------|----------|
| **滑动窗口** | Miller's Law — 只关注最近的 7±2 组块 | 实现简单，零开销 | 永久丢失早期信息 | 短对话、简单问答 |
| **摘要压缩** | Atkinson-Shiffrin 复述编码 → 将短期信息整合为长期记忆 | 保留关键摘要信息，不丢失上下文 | 有 LLM 调用开销，压缩可能损失细节 | 长对话、需要完整语境 |
| **选择性保留** | 检索线索理论 — 只保留与当前查询相关的线索 | 智能高效，最小化 Token 消耗 | 重要性判断可能出错 | 复杂任务、多轮交互 |

### Token 预算控制

```typescript
class TokenBudgetManager {
  private budget: number;
  private used: number = 0;

  constructor(budget: number = 100000) {
    this.budget = budget;
  }

  // 在添加新消息前检查预算
  canAdd(estimatedTokens: number): boolean {
    return this.used + estimatedTokens < this.budget * 0.9; // 留 10% 给输出
  }

  // 压缩历史以腾出空间
  async compressToFit(requiredTokens: number, messages: any[]): Promise<any[]> {
    while (!this.canAdd(requiredTokens) && messages.length > 4) {
      // 从最旧的消息开始压缩
      messages = await summarizeOld(messages, 4);
      this.recalculate(messages);
    }
    return messages;
  }

  // 动态预算调整：根据当前任务的复杂度自适应
  adjustBudget(taskComplexity: 'simple' | 'medium' | 'complex') {
    switch (taskComplexity) {
      case 'simple':   this.budget = 10000;  break;   // 简单问答
      case 'medium':   this.budget = 40000;  break;   // 一般对话
      case 'complex':  this.budget = 100000; break;   // 复杂代码/分析
    }
  }
}
```

### Ebbinghaus 遗忘曲线在对话摘要中的应用

Ebbinghaus 遗忘曲线描述了记忆随时间衰减的规律。在对话历史管理中，我们可以利用这一规律来指导压缩策略：

```
保留率(t) = e^(-t/τ)

其中 τ 是遗忘时间常数，取决于内容的"重要性"
     重要性越高 → τ 越大 → 衰减越慢
```

**工程实现：**

```typescript
interface ConversationSegment {
  messages: any[];
  timestamp: number;
  importance: number;  // 1-10
}

function shouldCompress(segment: ConversationSegment): boolean {
  const elapsed = Date.now() - segment.timestamp;
  const retentionRate = Math.exp(-elapsed / (segment.importance * 60 * 60 * 1000));
  // 当保留率低于 30% 时触发压缩
  return retentionRate < 0.3;
}
```

---

## 🔨 实战演练

**场景描述：**
你正在开发一个客服聊天机器人，用户可能会进行长对话（50+ 轮）。你需要实现一个**自适应对话历史管理器**，根据对话的复杂度和阶段动态选择压缩策略：
- 对话前 10 轮：简单滑动窗口，保留全部
- 10-30 轮：摘要压缩，每 5 轮生成一次摘要
- 30+ 轮：选择性保留 + Token 预算控制

**你的任务：**
1. 实现 `AdaptiveHistoryManager` 类，包含三种压缩策略
2. 实现 `decayCompression()` 方法：根据 Ebbinghaus 遗忘曲线，当某段对话超过一定时间后自动压缩
3. 添加 `restoreContext()` 方法：在用户重新参与旧对话时，自动将该对话的摘要注入到当前上下文中

<details>
<summary>💡 参考实现思路</summary>

```typescript
class AdaptiveHistoryManager {
  private config = {
    phase1: { maxTurns: 10, strategy: 'sliding' },
    phase2: { maxTurns: 30, strategy: 'summarize', summaryInterval: 5 },
    phase3: { strategy: 'selective' },
  };

  private sessions = new Map<string, {
    messages: any[];
    summaries: string[];
    lastActivity: number;
  }>();

  async processMessage(sessionId: string, message: any) {
    const session = this.sessions.get(sessionId) || { messages: [], summaries: [], lastActivity: 0 };
    session.messages.push(message);
    session.lastActivity = Date.now();

    const turn = Math.floor(session.messages.length / 2);
    let compressed: any[];

    if (turn <= this.config.phase1.maxTurns) {
      compressed = session.messages;  // 不做压缩
    } else if (turn <= this.config.phase2.maxTurns) {
      compressed = await this.phaseCompression(session);
    } else {
      compressed = await this.budgetCompression(session);
    }

    session.messages = compressed;
    this.sessions.set(sessionId, session);
    return compressed;
  }

  // Ebbinghaus 衰减压缩
  async decayCompression(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const elapsed = Date.now() - session.lastActivity;
    const tau = 2 * 60 * 60 * 1000; // 2 小时衰减常数
    const retention = Math.exp(-elapsed / tau);

    if (retention < 0.3 && session.messages.length > 10) {
      const summary = await generateSummary(session.messages);
      session.summaries.push(summary);
      session.messages = [
        { role: 'system', content: `[历史摘要 #${session.summaries.length}]: ${summary}` },
        ...session.messages.slice(-4),
      ];
    }
  }

  // 恢复历史上下文
  async restoreContext(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || session.summaries.length === 0) return '';

    return session.summaries
      .map((s, i) => `[对话阶段 ${i + 1}]: ${s}`)
      .join('\n');
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 1. 分层摘要（Hierarchical Summarization）

不要在一次调用中对整个历史做摘要。采用**分层合并**策略：生成小段摘要，再对摘要做摘要。这符合 Atkinson-Shiffrin 模型中的"精细复述"过程。

```typescript
async function hierarchicalSummarize(
  messages: any[],
  chunkSize: number = 10
): Promise<string> {
  // 第 1 层：将消息分块，每块生成摘要
  const chunks: any[][] = [];
  for (let i = 0; i < messages.length; i += chunkSize) {
    chunks.push(messages.slice(i, i + chunkSize));
  }
  const summaries = await Promise.all(
    chunks.map(chunk => generateSummary(chunk))
  );

  // 第 2 层：如果摘要太多，对摘要再做摘要
  if (summaries.length > 5) {
    return hierarchicalSummarize(
      summaries.map(s => ({ role: 'assistant', content: s })),
      chunkSize
    );
  }
  return summaries.join('\n---\n');
}
```

### 2. 关键时刻标记（Critical Moment Tagging）

在对话中自动标记"关键时刻"（如用户首次披露个人信息、做出重要决策），将这些消息标记为"不可压缩"，确保它们在压缩过程中被保留。

```typescript
function tagCriticalMoments(messages: any[]): any[] {
  const criticalPatterns = [
    /我(叫|是|喜欢|住在|工作)/,
    /我的(名字|邮箱|电话|地址)/,
    /决定|选择|同意|批准/,
  ];

  return messages.map(msg => {
    if (typeof msg.content === 'string') {
      const isCritical = criticalPatterns.some(p => p.test(msg.content));
      return { ...msg, metadata: { ...msg.metadata, critical: isCritical } };
    }
    return msg;
  });
}
```

### 3. 主动退化衰减（Proactive Decay）

不要让对话一直累积到触发压缩阈值，而是**在后台定时检查**并主动衰减旧段。这类似人脑在睡眠中主动巩固（consolidate）记忆的过程。

```typescript
class ProactiveDecayManager {
  private decayInterval: NodeJS.Timeout | null = null;

  start(intervalMs: number = 5 * 60 * 1000) { // 每 5 分钟
    this.decayInterval = setInterval(async () => {
      for (const [sessionId, session] of this.sessions) {
        const elapsed = Date.now() - session.lastActivity;
        if (elapsed > 30 * 60 * 1000) { // 30 分钟无活动
          await this.decayCompression(sessionId);
        }
      }
    }, intervalMs);
  }

  stop() {
    if (this.decayInterval) clearInterval(this.decayInterval);
  }
}
```

---

## 🧠 知识检查点

### Q1: "Lost in the Middle"现象是什么？它对对话历史管理有什么启示？

<details>
<summary>查看答案</summary>

"Lost in the Middle"（Liu et al., 2023）是指当相关信息位于长上下文的中间位置时，LLM 的检索准确率显著下降的现象。模型对上下文开头和结尾的信息关注度最高，中间部分容易被"遗忘"。启示：
1. **优先置顶**：将最重要的上下文（用户简介、关键指令）放在 system message 中
2. **及时压缩**：不要让对话无限积累，定期压缩中间的历史信息
3. **RAG 前置**：对需要检索的外部知识，放在上下文开头或末尾
</details>

### Q2: 滑动窗口和摘要压缩的本质区别是什么？什么时候应该选用哪一种？

<details>
<summary>查看答案</summary>

**本质区别**：滑动窗口是**丢弃**旧信息（只保留最近 N 轮），而摘要压缩是**提炼**旧信息（将多轮内容压缩为少量 Token）。滑动窗口在 Token 效率上更优（零额外开销），但信息丢失不可逆；摘要压缩保留了信息要点但需要 LLM 调用成本。

**选用原则**：
- 对话 < 10 轮 → 不用压缩（全部保留）
- 对话 10-30 轮 → 摘要压缩（信息价值高，值得保留）
- 对话 > 30 轮 → 滑动窗口 + 摘要混合（旧段摘要 + 最近窗口）
</details>

### Q3: 为什么需要为 LLM 输出预留 Token 预算（如示例中的 10%）？

<details>
<summary>查看答案</summary>

预留输出 Token 预算有三个原因：
1. **上下文窗口硬限制**：LLM 的总上下文 = 输入 Token + 输出 Token。如果输入占满窗口，模型会截断输出或报错
2. **输出质量**：预留空间确保模型有足够的 Token 生成完整、有用的回答，而不是因为 Token 不足而戛然而止
3. **边际效应**：当输入接近窗口上限时，模型对输入的注意力分布会更加分散（Lost in the Middle 加剧），预留空间也在间接保护输出质量
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 只在上下文快满时才压缩，不做主动衰减 | 没有理解 Ebbinghaus 遗忘曲线的连续性——记忆衰减是持续过程，不是"满了才清理" | 设置定时任务（如每 5 分钟）对超过 30 分钟无活动的对话执行衰减压缩 |
| 对所有消息一视同仁，不区分关键消息 | 忽视了选择性保留策略的价值，认为"摘要压缩就够了" | 引入关键消息标记机制，将用户首次披露个人信息、做出决策等消息标记为"不可压缩" |
| 压缩后丢失了必要的系统指令和角色设定 | 将 system message 也放入了滑动窗口或摘要范围 | 在压缩前将 system message 分离出来，排除在压缩范围之外，始终保持 system prompt 的完整性 |

---

## 📝 本章小结

- ✅ **滑动窗口** — 简单直接，适合短对话
- ✅ **摘要压缩** — 保留关键信息，适合长对话
- ✅ **选择性保留** — 智能过滤，保留最重要的消息
- ✅ **Token 预算** — 防止超出上下文窗口限制
- ✅ **Ebbinghaus 遗忘曲线** — 指导对话压缩的时机选择
- ✅ **Lost in the Middle** — 解释了为什么需要主动管理上下文结构
- ✅ **分层摘要** — 通过分层合并策略，大幅降低摘要生成的 Token 开销

## ➡️ 下一章预告

> [第3章：长期记忆实现](./03-long-term-memory.md) — 向量数据库、语义检索、MemGPT 虚拟上下文管理、记忆巩固理论。
