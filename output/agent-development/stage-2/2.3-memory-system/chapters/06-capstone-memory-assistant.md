# 第6章：综合实战 — 带持久记忆的个人 AI 助手

> 预计学习时间：120-150 分钟

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

## 📝 本章小结

- ✅ **完整记忆助手** — 短期（对话）+ 长期（向量存储）记忆
- ✅ **自动记忆提取** — 从对话中识别值得记住的信息
- ✅ **记忆增强回复** — 回答时参考历史记忆

## ➡️ 下一步

查看附录，然后进入 [2.4 RAG 系统](../../2.4-rag-system/README.md)
