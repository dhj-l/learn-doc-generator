# 第2章：对话历史管理 — 控制上下文窗口

> 预计学习时间：80-100 分钟

## 💡 核心概念

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
}
```

---

## 📝 本章小结

- ✅ **滑动窗口** — 简单直接，适合短对话
- ✅ **摘要压缩** — 保留关键信息，适合长对话
- ✅ **选择性保留** — 智能过滤，保留最重要的消息
- ✅ **Token 预算** — 防止超出上下文窗口限制
