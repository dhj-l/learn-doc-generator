# 第3章：长期记忆实现 — 向量存储与检索

> 预计学习时间：90-120 分钟

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
```

---

## 📝 本章小结

- ✅ **向量存储** — 用 Embedding + 向量数据库存储记忆
- ✅ **语义检索** — 基于记忆内容的语义相似度查找
- ✅ **遗忘机制** — 定期清理低价值记忆
