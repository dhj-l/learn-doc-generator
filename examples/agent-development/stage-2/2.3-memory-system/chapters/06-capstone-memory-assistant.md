# 第6章：综合实战 — 带持久记忆的个人 AI 助手

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **构建完整的记忆增强助手** — 整合短期对话 + 长期向量记忆
- **实现自动记忆提取** — 从对话文本中识别并持久化值得记住的信息
- **实践记忆增强回复** — 在生成回答时融入历史记忆上下文
- **评估记忆系统效果** — 通过多轮对话验证记忆的正确性和时效性

## 📋 前置知识

> 建议先完成全部前序章节：
> - [第1章：记忆类型概述](./01-memory-types.md)
> - [第2章：对话历史管理](./02-conversation-history.md)
> - [第3章：长期记忆实现](./03-long-term-memory.md)
> - [第4章：知识图谱基础](./04-knowledge-graph.md)
> - [第5章：记忆框架](./05-memory-frameworks.md)

---

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

**预期输出：**
```
用户: 我叫小明，我喜欢用 TypeScript 写代码
🧠 新记忆: [preference] 用户喜欢使用 TypeScript
🧠 新记忆: [fact] 用户名叫小明
助手: 你好小明！很高兴认识你，我也很喜欢 TypeScript！我会记住你的偏好的。

用户: 推荐一个前端框架给我
助手: 根据你对 TypeScript 的偏好，我推荐你使用 React 或 Vue 3，它们都有优秀的 TypeScript 支持！

用户: 你还记得我叫什么吗？
助手: 当然记得！你叫小明，而且我知道你喜欢用 TypeScript 写代码。
```
```

---

## ⚡ 进阶技巧

### 1. 批量导入历史对话

新用户首次使用时，可以离线批量导入历史聊天记录，让助手立刻"认识"用户：

```typescript
class MemoryAssistantV2 extends MemoryAssistant {
  async importHistory(history: { role: string; content: string }[]) {
    const batchSize = 20;
    for (let i = 0; i < history.length; i += batchSize) {
      const batch = history.slice(i, i + batchSize);
      const text = batch.map(m => `${m.role}: ${m.content}`).join('\n');
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `从以下对话中提取值得记住的事实、偏好和经验（JSON 数组格式）:\n${text}`,
        }],
      });
      const facts = JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '[]');
      for (const fact of facts) {
        await this.storeMemory(fact.content, fact.type, fact.importance);
      }
    }
    console.log(`📥 批量导入完成，共导入 ${history.length} 条消息`);
  }
}
```

### 2. <memory> 标签的时序合并

如果同一轮对话中 LLM 输出多个 `<memory>` 标签，且内容相关，合并为一条结构化记忆以减少冗余：

```typescript
function mergeMemoryTags(raw: string): string {
  const tags = [...raw.matchAll(/<memory[^>]*>(.+?)<\/memory>/g)].map(m => m[1]);
  if (tags.length <= 1) return raw;
  const merged = `<memory type="composite" importance="8">${tags.join('；')}</memory>`;
  return raw.replace(/<memory[^>]*>.*?<\/memory>\s*/g, '').trim() + '\n' + merged;
}
```

### 3. 记忆置信度评估

不是所有 LLM 提取的记忆都准确。添加置信度评估机制，低置信度记忆用"待确认"标记：

```typescript
async function assessConfidence(content: string, originalContext: string): Promise<number> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    messages: [{
      role: 'user',
      content: `以下记忆是否可以从对话中明确得出？只回答 0-1 的小数。\n记忆: ${content}\n对话: ${originalContext}`,
    }],
  });
  return parseFloat(response.content[0].type === 'text' ? response.content[0].text : '0.5');
}
// 置信度 < 0.6 的记忆标记为 pending，需要用户在后续对话中确认
```

## 🧠 知识检查点

<details>
<summary><strong>Q1: MemoryAssistant 中为什么用 <memory> 标签而非独立 API 调用来提取记忆？</strong></summary>

**A:** 两种方案各有利弊。使用 `<memory>` 标签的优势是：① 零额外 LLM 调用，记忆提取和对话回复在一个请求中完成；② 记忆提取有完整的对话上下文，提取质量更高。缺点是：① 需要正则解析，格式依赖 LLM 输出的一致性和正确性；② 增加了回复 Token 消耗。实际生产中，可考虑混合方案——常规场景用标签，重要场景用独立调用做二次确认。
</details>

<details>
<summary><strong>Q2: 在 chat() 方法中，为什么要用 system prompt 而非 user message 注入记忆上下文？</strong></summary>

**A:** System prompt 在整个对话中对所有消息生效，相当于"背景知识"。将记忆上下文放在 system prompt 中可以让模型在回复每一条消息时都自动参考记忆，且不会在 `conversationHistory` 中占用 user/assistant Token。而如果放入 user message，它只影响下一条回复，后续轮次需要重新注入。
</details>

<details>
<summary><strong>Q3: 第三次对话中，助手能正确回答"你还记得我叫什么吗？"的关键机制是什么？</strong></summary>

**A:** 关键机制是三步流水线：① 用户输入"你还记得我叫什么吗？"→② `recallMemories()` 用这个 query 在 ChromaDB 中搜索相关记忆，返回"用户叫小明"的记录→③ 该记忆被注入到 system prompt 中，LLM 看到"你对这个用户的了解：- 用户叫小明"后自然回答。这验证了"短期对话 + 长期向量记忆"的组合工作流。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 记忆标签中的内容没有实际存储 | `chat()` 中使用 `string.match()` 提取后忘记调用 `storeMemory()` | 添加断言：遍历 `memoryMatch` 后打印日志 `🧠 新记忆: [type] content` 验证 |
| 多次对话后 system prompt 越来越长导致 Token 超限 | 每次 `chat()` 把所有历史记忆都注入 system prompt | 只注入 `topK=5` 条与当前 query 最相关的记忆，而非全部 |
| 用户修改信息后旧记忆仍被召回 | 没有记忆版本或更新时间戳，新旧信息冲突 | 存储时添加 `timestamp` 字段，检索后按时间排序优先取最新，或添加 `overwrite` 方法 |

---

## 📝 本章小结

- ✅ **完整记忆助手** — 短期（对话）+ 长期（向量存储）记忆
- ✅ **自动记忆提取** — 从对话中识别值得记住的信息
- ✅ **记忆增强回复** — 回答时参考历史记忆

## ➡️ 下一步

查看附录，然后进入 [2.4 RAG 系统](../../2.4-rag-system/README.md)
