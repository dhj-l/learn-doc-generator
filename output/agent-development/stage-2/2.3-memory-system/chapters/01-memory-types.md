# 第1章：记忆类型 — 短期、长期与工作记忆

> 预计学习时间：60-80 分钟

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

## 📝 本章小结

- ✅ **短期记忆** — 对话历史，滑动窗口 + 摘要压缩
- ✅ **长期记忆** — 向量存储，基于语义相似度检索
- ✅ **工作记忆** — 当前任务的临时状态
- ✅ **遗忘机制** — 低重要性 + 长时间未访问的记忆可被清理

## ➡️ 下一章预告

> [第2章：对话历史管理](./02-conversation-history.md) — 摘要压缩、选择性保留、Token 预算控制。
