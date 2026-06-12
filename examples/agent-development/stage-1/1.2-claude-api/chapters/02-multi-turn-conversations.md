# 第2章：多轮对话 — 让 AI 记住上下文

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **实现多轮对话** — 通过消息历史管理实现连续对话
- **控制上下文窗口** — 管理 Token 预算，防止超出限制
- **实现对话摘要** — 在长对话中压缩历史信息
- **处理对话状态** — 管理对话的生命周期

## 📋 前置知识

> 建议先完成：[第1章：API 基础](./01-api-fundamentals.md)

---

## 💡 核心概念

### 概念一：多轮对话的本质

Claude 没有「记忆」。每次 API 调用都是独立的——你需要**把整个对话历史**发给它。

```
第 1 轮：
  你 → [user: "你好"]
  Claude ← [assistant: "你好！有什么可以帮你的？"]

第 2 轮（需要带上之前的对话）：
  你 → [user: "你好", assistant: "你好！有什么可以帮你的？", user: "我叫小明"]
  Claude ← [assistant: "你好小明！有什么我可以帮你的？"]

第 3 轮（继续累积）：
  你 → [user: "你好", assistant: "你好！", user: "我叫小明", assistant: "你好小明！", user: "我叫什么？"]
  Claude ← [assistant: "你叫小明呀！"]
```

> **💡 关键理解**
>
> Claude 的「记忆」就是你发给它的 messages 数组。数组越长，模型能看到的历史越多，但消耗的 Token 也越多。

### 概念二：基础多轮对话实现

```typescript
// src/multi-turn.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// 对话管理器
class Conversation {
  private messages: Anthropic.MessageParam[] = [];
  private systemPrompt: string;
  private model: string;
  private maxTokens: number;

  constructor(options: {
    systemPrompt?: string;
    model?: string;
    maxTokens?: number;
  } = {}) {
    this.systemPrompt = options.systemPrompt || '';
    this.model = options.model || 'claude-sonnet-4-5-20241022';
    this.maxTokens = options.maxTokens || 1024;
  }

  // 发送消息并获取回复
  async chat(userMessage: string): Promise<string> {
    // 添加用户消息到历史
    this.messages.push({ role: 'user', content: userMessage });

    // 调用 API（包含完整对话历史）
    const response = await client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: this.systemPrompt || undefined,
      messages: this.messages,
    });

    // 提取回复文本
    const assistantMessage = response.content[0];
    const text = assistantMessage.type === 'text' ? assistantMessage.text : '';

    // 添加助手回复到历史
    this.messages.push({ role: 'assistant', content: text });

    return text;
  }

  // 获取对话历史
  getHistory(): Anthropic.MessageParam[] {
    return [...this.messages];
  }

  // 获取当前 Token 使用估算
  estimateTokens(): number {
    const allText = this.messages.map(m => 
      typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    ).join('');
    // 粗略估算：中文约 1.5 字/Token，英文约 4 字符/Token
    const chinese = (allText.match(/[一-鿿]/g) || []).length;
    const other = allText.length - chinese;
    return Math.ceil(chinese / 1.5 + other / 4);
  }

  // 清空对话历史
  clear(): void {
    this.messages = [];
  }

  // 获取对话轮数
  get turnCount(): number {
    return this.messages.length / 2;
  }
}

// 使用示例
async function main() {
  const conversation = new Conversation({
    systemPrompt: '你是一个友好的编程助手，回答简洁明了。',
  });

  // 第 1 轮
  const reply1 = await conversation.chat('你好，我叫小明');
  console.log('Claude:', reply1);

  // 第 2 轮 — Claude 记得你叫小明
  const reply2 = await conversation.chat('我正在学 TypeScript，有什么建议吗？');
  console.log('Claude:', reply2);

  // 第 3 轮 — Claude 记得之前的上下文
  const reply3 = await conversation.chat('我刚才说了我叫什么？');
  console.log('Claude:', reply3);

  console.log(`\n📊 对话统计: ${conversation.turnCount} 轮, 约 ${conversation.estimateTokens()} Token`);
}

main();
```

```
预期输出：
Claude: 你好小明！有什么我可以帮你的吗？

Claude: 学 TypeScript 的建议：
1. 先熟悉 JavaScript 基础
2. 从 strict 模式开始配置
3. 多用类型推断，少写冗余类型注解
4. 实践项目中逐步添加类型

Claude: 你叫小明呀！

📊 对话统计: 3 轮, 约 280 Token
```

### 概念三：上下文窗口管理

随着对话增长，消息历史会越来越长。你需要管理 Token 预算。

```typescript
// src/context-manager.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

class ContextManagedConversation {
  private messages: Anthropic.MessageParam[] = [];
  private systemPrompt: string;
  private maxContextTokens: number;   // 上下文窗口预算
  private model: string;

  constructor(options: {
    systemPrompt?: string;
    maxContextTokens?: number;
    model?: string;
  } = {}) {
    this.systemPrompt = options.systemPrompt || '';
    this.maxContextTokens = options.maxContextTokens || 100000; // 100K Token 预算
    this.model = options.model || 'claude-sonnet-4-5-20241022';
  }

  // 估算 Token 数
  private estimateTokens(text: string): number {
    const chinese = (text.match(/[一-鿿]/g) || []).length;
    const other = text.length - chinese;
    return Math.ceil(chinese / 1.5 + other / 4);
  }

  // 计算当前消息历史的 Token 总量
  private totalTokens(): number {
    return this.messages.reduce((sum, msg) => {
      const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return sum + this.estimateTokens(text);
    }, 0);
  }

  // 裁剪消息历史以适应上下文窗口
  private trimMessages(maxOutputTokens: number): void {
    const availableTokens = this.maxContextTokens - maxOutputTokens - 1000; // 留 1000 Token 缓冲
    
    while (this.totalTokens() > availableTokens && this.messages.length > 2) {
      // 策略：从最旧的消息开始删除（保留最近的对话）
      // 但始终保留第一条用户消息（提供初始上下文）
      if (this.messages.length > 2) {
        this.messages.splice(0, 2); // 删除一对 user+assistant 消息
      }
    }
  }

  async chat(userMessage: string, maxTokens: number = 1024): Promise<{
    text: string;
    trimmed: boolean;
    contextTokens: number;
  }> {
    this.messages.push({ role: 'user', content: userMessage });

    // 检查是否需要裁剪
    const beforeTrim = this.messages.length;
    this.trimMessages(maxTokens);
    const trimmed = this.messages.length < beforeTrim;

    const response = await client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system: this.systemPrompt || undefined,
      messages: this.messages,
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    this.messages.push({ role: 'assistant', content: text });

    return {
      text,
      trimmed,
      contextTokens: response.usage.input_tokens,
    };
  }
}
```

### 概念四：对话摘要压缩

当对话太长时，可以将历史消息**压缩成摘要**：

```typescript
// src/summarizer.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function summarizeConversation(
  messages: Anthropic.MessageParam[]
): Promise<string> {
  const conversationText = messages.map(m => {
    const role = m.role === 'user' ? '用户' : '助手';
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return `${role}: ${content}`;
  }).join('\n\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `请将以下对话压缩成简洁的摘要，保留：
1. 用户的关键需求和偏好
2. 已经讨论过的结论
3. 未完成的待办事项

对话内容：
${conversationText}

输出格式：
## 用户信息
...
## 已讨论结论
...
## 待办事项
...`
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// 使用摘要替换旧历史
class SmartConversation {
  private messages: Anthropic.MessageParam[] = [];
  private summary: string = '';
  private summarizeAfter: number; // 超过多少轮后摘要

  constructor(summarizeAfter: number = 10) {
    this.summarizeAfter = summarizeAfter;
  }

  async chat(userMessage: string): Promise<string> {
    // 如果有摘要，将其作为上下文
    const effectiveMessages: Anthropic.MessageParam[] = [];
    if (this.summary) {
      effectiveMessages.push({
        role: 'user',
        content: `[之前的对话摘要]\n${this.summary}`,
      });
      effectiveMessages.push({
        role: 'assistant',
        content: '我已了解之前的对话内容，请继续。',
      });
    }
    effectiveMessages.push(...this.messages);
    effectiveMessages.push({ role: 'user', content: userMessage });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 1024,
      messages: effectiveMessages,
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    this.messages.push({ role: 'user', content: userMessage });
    this.messages.push({ role: 'assistant', content: text });

    // 检查是否需要摘要
    if (this.messages.length / 2 >= this.summarizeAfter) {
      this.summary = await summarizeConversation(this.messages);
      this.messages = []; // 清空历史，保留摘要
    }

    return text;
  }
}
```

---

## 🔨 实战演练

### 练习：构建一个带记忆的客服机器人

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/customer-service-bot.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

interface CustomerInfo {
  name?: string;
  memberLevel?: string;
  orderIds?: string[];
  issues?: string[];
}

class CustomerServiceBot {
  private messages: Anthropic.MessageParam[] = [];
  private customerInfo: CustomerInfo = {};

  private systemPrompt = `
你是一个专业的客服代表。

## 客户信息
{{customer_info}}

## 规则
- 简洁专业，不泄露内部信息
- 主动记录客户提供的关键信息
- 超出能力范围时建议转人工

## 输出格式
每条回复后附上 <metadata> 标签记录你识别到的客户信息：
<metadata>
{"name": "...", "order_id": "...", "issue_type": "..."}
</metadata>
`;

  async chat(userMessage: string): Promise<string> {
    // 更新系统提示中的客户信息
    const system = this.systemPrompt.replace(
      '{{customer_info}}',
      JSON.stringify(this.customerInfo, null, 2)
    );

    this.messages.push({ role: 'user', content: userMessage });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 500,
      system,
      messages: this.messages,
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // 从回复中提取 metadata
    const metaMatch = text.match(/<metadata>([\s\S]*?)<\/metadata>/);
    if (metaMatch) {
      try {
        const meta = JSON.parse(metaMatch[1]);
        if (meta.name) this.customerInfo.name = meta.name;
        if (meta.order_id) {
          this.customerInfo.orderIds = [...(this.customerInfo.orderIds || []), meta.order_id];
        }
        if (meta.issue_type) {
          this.customerInfo.issues = [...(this.customerInfo.issues || []), meta.issue_type];
        }
      } catch {}
    }

    // 存储不含 metadata 的干净回复
    const cleanReply = text.replace(/<metadata>[\s\S]*?<\/metadata>/, '').trim();
    this.messages.push({ role: 'assistant', content: text });

    return cleanReply;
  }

  getCustomerInfo(): CustomerInfo {
    return { ...this.customerInfo };
  }
}

// 使用示例
async function main() {
  const bot = new CustomerServiceBot();

  console.log('用户:', '你好，我叫小红，我的订单 ORD-001 还没发货');
  console.log('客服:', await bot.chat('你好，我叫小红，我的订单 ORD-001 还没发货'));

  console.log('\n用户:', '已经等了 3 天了');
  console.log('客服:', await bot.chat('已经等了 3 天了'));

  console.log('\n用户:', '我之前还订了一个东西，订单号 ORD-002');
  console.log('客服:', await bot.chat('我之前还订了一个东西，订单号 ORD-002'));

  console.log('\n📊 已记录的客户信息:', bot.getCustomerInfo());
}

main();
```

</details>

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么 Claude 需要完整的对话历史才能进行多轮对话？**

> A：因为 Claude 是无状态的——每次 API 调用都是独立的，不会记住之前的交互。你需要在每次请求时发送完整的对话历史，让模型「看到」之前的对话内容。

**Q2：上下文窗口快满时有哪些处理策略？**

> A：（1）滑动窗口——删除最旧的消息对；（2）摘要压缩——将旧消息压缩为摘要；（3）选择性保留——只保留重要的消息；（4）分段处理——将长对话拆分为多个独立的对话段。

</details>

---

## 📝 本章小结

- ✅ **多轮对话** — 每次请求携带完整 messages 数组
- ✅ **上下文管理** — 监控 Token 使用，必要时裁剪历史
- ✅ **对话摘要** — 压缩旧对话为摘要，保留关键信息
- ✅ **客户信息提取** — 从对话中自动提取和记忆关键数据

## ➡️ 下一章预告

> [第3章：流式输出](./03-streaming.md) — 让 AI 的回答像打字一样实时显示。
