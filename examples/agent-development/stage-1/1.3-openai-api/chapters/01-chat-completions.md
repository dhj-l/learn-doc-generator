# 第1章：Chat Completions API — OpenAI 核心接口

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 OpenAI SDK 发送 Chat Completions 请求** — 掌握 OpenAI 的核心 API
- **理解 OpenAI 与 Claude API 的异同** — 快速迁移到新平台
- **管理多轮对话和流式输出** — 构建实时交互应用

## 📋 前置知识

> 建议先完成：[1.2 Claude API](../1.2-claude-api/README.md) — 理解 LLM API 的基本模式

---

## 💡 核心概念

### 概念一：环境搭建

```bash
mkdir openai-demo && cd openai-demo
npm init -y
npm install openai
npm install -D typescript @types/node
npx tsc --init

# 设置 API Key
export OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
```

### 概念二：OpenAI vs Claude API 对比

如果你已经学过 Claude API，理解两者的差异能帮你快速上手：

| 特性 | OpenAI | Claude |
|------|--------|--------|
| 核心接口 | `chat.completions.create` | `messages.create` |
| 系统消息 | `messages` 中 `role: 'system'` | 独立的 `system` 参数 |
| 流式输出 | `stream: true` | `messages.stream()` |
| Token 术语 | `prompt_tokens` / `completion_tokens` | `input_tokens` / `output_tokens` |
| 停止原因 | `finish_reason` | `stop_reason` |
| 图片输入 | content 中 `type: 'image_url'` | content 中 `type: 'image'` |

### 概念三：基础调用

```typescript
// src/01-basic.ts
import OpenAI from 'openai';

const client = new OpenAI();

async function basicChat() {
  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: '你是一个友好的编程助手。' },
      { role: 'user', content: '用一句话解释什么是 TypeScript' },
    ],
  });

  // 解析响应
  const choice = completion.choices[0];
  console.log('回复:', choice.message.content);
  console.log('停止原因:', choice.finish_reason);
  console.log('Token 使用:', {
    输入: completion.usage?.prompt_tokens,
    输出: completion.usage?.completion_tokens,
    总计: completion.usage?.total_tokens,
  });
}

basicChat();
```

```
预期输出：
回复: TypeScript 是 JavaScript 的超集，添加了静态类型系统，让开发者在编写代码时就能发现类型错误。
停止原因: stop
Token 使用: { 输入: 35, 输出: 42, 总计: 77 }
```

#### OpenAI 响应结构

```typescript
interface ChatCompletion {
  id: string;                    // 唯一 ID
  object: 'chat.completion';    // 类型标识
  created: number;               // 创建时间戳
  model: string;                 // 使用的模型
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;    // 文本内容
      tool_calls?: Array<{       // 工具调用（如有）
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;     // JSON 字符串
        };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

### 概念四：流式输出

```typescript
// src/02-streaming.ts
import OpenAI from 'openai';

const client = new OpenAI();

async function streamingChat() {
  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1000,
    stream: true,
    messages: [
      { role: 'user', content: '列出 5 个 JavaScript 的数组方法' },
    ],
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      process.stdout.write(content);
    }
  }
  console.log('\n');
}

streamingChat();
```

### 概念五：多轮对话

```typescript
// src/03-multi-turn.ts
import OpenAI from 'openai';

const client = new OpenAI();

class OpenAIConversation {
  private messages: OpenAI.ChatCompletionMessageParam[] = [];

  constructor(private systemPrompt: string = '') {
    if (systemPrompt) {
      this.messages.push({ role: 'system', content: systemPrompt });
    }
  }

  async chat(userMessage: string): Promise<string> {
    this.messages.push({ role: 'user', content: userMessage });

    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: this.messages,
    });

    const reply = completion.choices[0].message.content || '';
    this.messages.push({ role: 'assistant', content: reply });
    return reply;
  }
}

async function main() {
  const conversation = new OpenAIConversation('你是一个 Python 导师。');

  console.log('Q1:', await conversation.chat('什么是装饰器？'));
  console.log('Q2:', await conversation.chat('给我一个实际例子'));
  console.log('Q3:', await conversation.chat('我刚才问了什么？'));
}

main();
```

---

## 🔨 实战演练

### 练习：封装 OpenAI 和 Claude 的统一接口

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/unified-client.ts
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// 统一接口定义
interface UnifiedMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface UnifiedResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

interface UnifiedClient {
  chat(messages: UnifiedMessage[], options?: { maxTokens?: number; temperature?: number }): Promise<UnifiedResponse>;
}

// OpenAI 适配器
class OpenAIAdapter implements UnifiedClient {
  private client = new OpenAI();
  
  constructor(private model: string = 'gpt-4o') {}

  async chat(messages: UnifiedMessage[], options = {}): Promise<UnifiedResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    return {
      text: response.choices[0].message.content || '',
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      model: response.model,
    };
  }
}

// Claude 适配器
class ClaudeAdapter implements UnifiedClient {
  private client = new Anthropic();
  
  constructor(private model: string = 'claude-sonnet-4-5-20241022') {}

  async chat(messages: UnifiedMessage[], options = {}): Promise<UnifiedResponse> {
    const systemMsg = messages.find(m => m.role === 'system');
    const otherMsgs = messages.filter(m => m.role !== 'system');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature,
      system: systemMsg?.content,
      messages: otherMsgs.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    });

    return {
      text: response.content[0].type === 'text' ? response.content[0].text : '',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: response.model,
    };
  }
}

// 使用统一接口
async function main() {
  const messages: UnifiedMessage[] = [
    { role: 'system', content: '你是一个编程助手' },
    { role: 'user', content: '什么是闭包？一句话解释' },
  ];

  // 两个模型，同一套代码
  const openai = new OpenAIAdapter('gpt-4o');
  const claude = new ClaudeAdapter('claude-sonnet-4-5-20241022');

  const [openaiResult, claudeResult] = await Promise.all([
    openai.chat(messages),
    claude.chat(messages),
  ]);

  console.log('OpenAI:', openaiResult.text);
  console.log('Claude:', claudeResult.text);
}
```

</details>

---

## 📝 本章小结

- ✅ **Chat Completions API** — OpenAI 的核心接口，与 Claude Messages API 类似
- ✅ **系统消息** — 通过 `role: 'system'` 设置 System Prompt
- ✅ **流式输出** — `stream: true` + 逐 chunk 处理
- ✅ **统一接口** — 设计适配器模式兼容多个 LLM 提供商

## ➡️ 下一章预告

> [第2章：国产模型兼容接口](./02-compatible-models.md) — 用 OpenAI 格式调用通义千问、DeepSeek 等国产模型。
