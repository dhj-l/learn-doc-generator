# 第1章：Claude API 基础 — 你的第一个 API 调用

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **安装和配置 Anthropic SDK** — 在 Node.js 项目中完成环境搭建
- **理解 Claude 模型家族** — 知道 Haiku、Sonnet、Opus 的区别和适用场景
- **发送第一个 Messages API 请求** — 掌握基本的 API 调用流程
- **处理 API 响应** — 理解响应结构、内容块和使用量统计

## 📋 前置知识

> 建议先完成：[1.1 第1章：LLM 基本原理](../1.1-prompt-engineering/chapters/01-llm-fundamentals.md)

---

## 💡 核心概念

### 概念一：Claude 模型家族

Anthropic 提供了三个不同级别的模型，就像手机的「经济型、标准型、旗舰型」：

| 模型 | 特点 | 适用场景 | 相对成本 |
|------|------|----------|----------|
| **Haiku** | 最快、最便宜 | 分类、提取、简单对话 | 💰 |
| **Sonnet** | 平衡性能和成本 | 代码生成、分析、复杂对话 | 💰💰 |
| **Opus** | 最强推理能力 | 复杂推理、创意写作、研究 | 💰💰💰 |

```
模型选择指南：

简单分类/提取 → Haiku（快 + 便宜）
代码审查/生成 → Sonnet（能力强 + 性价比高）
数学推理/研究 → Opus（最强推理）
不确定用什么 → Sonnet（万金油）
```

### 概念二：环境搭建

```bash
# 创建项目
mkdir claude-api-demo && cd claude-api-demo
npm init -y
npm install @anthropic-ai/sdk
npm install -D typescript @types/node
npx tsc --init

# 设置 API Key
export ANTHROPIC_API_KEY="sk-ant-api03-xxxxxxxxx"
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

```json
// package.json
{
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts"
  }
}
```

### 概念三：Messages API — 核心接口

Claude 的 API 以 **Messages（消息）** 为核心。每一次交互都是一系列消息的传递。

```typescript
// src/01-hello-claude.ts
import Anthropic from '@anthropic-ai/sdk';

// 初始化客户端（自动读取 ANTHROPIC_API_KEY 环境变量）
const client = new Anthropic();

async function main() {
  // 发送最简单的请求
  const message = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',  // 选择模型
    max_tokens: 1024,                       // 最大输出 Token 数
    messages: [
      {
        role: 'user',                       // 角色：用户
        content: '用一句话解释什么是 TypeScript',  // 内容
      },
    ],
  });

  // 解析响应
  console.log('模型:', message.model);
  console.log('内容:', message.content[0].type === 'text' ? message.content[0].text : '');
  console.log('停止原因:', message.stop_reason);
  console.log('Token 使用:', {
    输入: message.usage.input_tokens,
    输出: message.usage.output_tokens,
    缓存创建: message.usage.cache_creation_input_tokens,
    缓存读取: message.usage.cache_read_input_tokens,
  });
}

main();
```

```
预期输出：
模型: claude-sonnet-4-5-20241022
内容: TypeScript 是 JavaScript 的超集，添加了静态类型系统，让开发者在编写代码时就能捕获类型错误，提升代码的可靠性和开发体验。
停止原因: end_turn
Token 使用: { 输入: 25, 输出: 52, 缓存创建: 0, 缓存读取: 0 }
```

#### API 响应结构详解

```typescript
interface MessageResponse {
  id: string;                    // 消息唯一 ID
  type: 'message';              // 固定值
  role: 'assistant';            // 固定为 assistant
  model: string;                // 实际使用的模型
  content: ContentBlock[];      // 内容块数组（可能包含多个块）
  stop_reason: string;          // 停止原因
  stop_sequence: string | null; // 触发停止的序列
  usage: Usage;                 // Token 使用量
}

type ContentBlock =
  | { type: 'text'; text: string }           // 文本内容
  | { type: 'tool_use'; id: string; name: string; input: object }  // 工具调用
  | { type: 'thinking'; thinking: string }   // 思考过程（Extended Thinking）

interface Usage {
  input_tokens: number;                // 输入 Token 数
  output_tokens: number;               // 输出 Token 数
  cache_creation_input_tokens: number; // 缓存创建的 Token 数
  cache_read_input_tokens: number;     // 从缓存读取的 Token 数
}
```

### 概念四：System Prompt 的使用

```typescript
// src/02-system-prompt.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function withSystemPrompt() {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 500,
    system: `你是一个专业的 TypeScript 代码审查专家。
你的回复风格简洁直接，只关注最重要的问题。
每次审查不超过 3 个问题。`,
    messages: [
      {
        role: 'user',
        content: `审查这段代码：
\`\`\`typescript
function fetchUser(id) {
  const res = fetch('/api/users/' + id);
  return res.json();
}
\`\`\``,
      },
    ],
  });

  console.log(message.content[0].type === 'text' ? message.content[0].text : '');
}

withSystemPrompt();
```

```
预期输出：
3 个问题：

1. **缺少类型注解** — `id` 参数和返回值没有类型，应为 `(id: string): Promise<User>`
2. **缺少 await** — `fetch` 返回 Promise，需要 `await` 才能获取响应
3. **缺少错误处理** — 网络请求失败时会抛出未处理的异常
```

### 概念五：内容块（Content Blocks）

Claude 的响应可以包含多种类型的内容块，不仅仅是文本：

```typescript
// 解析不同类型的 content block
function parseContent(blocks: Anthropic.ContentBlock[]): string {
  return blocks.map(block => {
    switch (block.type) {
      case 'text':
        return block.text;
      case 'tool_use':
        return `[调用工具: ${block.name}(${JSON.stringify(block.input)})]`;
      case 'thinking':
        return `[思考: ${block.thinking}]`;
      default:
        return '[未知内容类型]';
    }
  }).join('\n');
}
```

### 概念六：stop_reason 详解

```typescript
// 不同的停止原因及处理策略
function handleStopReason(reason: string): void {
  switch (reason) {
    case 'end_turn':
      // ✅ 正常结束 — 模型完成了回答
      console.log('正常完成');
      break;
    case 'max_tokens':
      // ⚠️ 达到 max_tokens 限制 — 输出被截断
      console.warn('输出被截断，考虑增大 max_tokens');
      break;
    case 'stop_sequence':
      // 🛑 遇到了你定义的停止序列
      console.log('遇到停止序列');
      break;
    case 'tool_use':
      // 🔧 模型要调用工具 — 需要你执行工具并返回结果
      console.log('模型请求工具调用');
      break;
  }
}
```

---

## 🔨 实战演练

### 练习 1：构建一个基础的聊天封装

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/chat-client.ts
import Anthropic from '@anthropic-ai/sdk';

interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

class ClaudeChatClient {
  private client: Anthropic;
  private defaultOptions: ChatOptions;

  constructor(apiKey?: string, options: ChatOptions = {}) {
    this.client = new Anthropic({ apiKey });
    this.defaultOptions = {
      model: 'claude-sonnet-4-5-20241022',
      maxTokens: 1024,
      temperature: 0.7,
      ...options,
    };
  }

  // 单轮对话
  async ask(question: string, options: ChatOptions = {}): Promise<string> {
    const opts = { ...this.defaultOptions, ...options };

    const message = await this.client.messages.create({
      model: opts.model!,
      max_tokens: opts.maxTokens!,
      temperature: opts.temperature,
      system: opts.system,
      messages: [{ role: 'user', content: question }],
    });

    const block = message.content[0];
    if (block.type === 'text') return block.text;
    return '[非文本响应]';
  }

  // 带角色设定的对话
  async askAs(
    role: string,
    question: string,
    options: ChatOptions = {}
  ): Promise<string> {
    return this.ask(question, {
      ...options,
      system: `你是${role}。请用你的专业知识回答问题。`,
    });
  }
}

// 使用示例
async function main() {
  const client = new ClaudeChatClient();

  // 简单问答
  const answer = await client.ask('什么是闭包？用一句话解释');
  console.log('简单问答:', answer);

  // 角色扮演
  const expertAnswer = await client.askAs(
    '一个有 20 年经验的前端架构师',
    'React 和 Vue 该怎么选？'
  );
  console.log('专家回答:', expertAnswer);
}

main();
```

</details>

---

## ⚡ 进阶技巧

### 错误处理基础

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function safeApiCall() {
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 100,
      messages: [{ role: 'user', content: '你好' }],
    });
    return message.content[0];
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('❌ API Key 无效，请检查 ANTHROPIC_API_KEY');
    } else if (error instanceof Anthropic.RateLimitError) {
      console.error('⚠️ 请求频率超限，请稍后重试');
    } else if (error instanceof Anthropic.BadRequestError) {
      console.error('❌ 请求参数错误:', error.message);
    } else {
      throw error; // 未知错误，向上抛出
    }
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Haiku、Sonnet、Opus 三个模型的核心区别是什么？**

> A：Haiku 最快最便宜，适合简单任务；Sonnet 平衡性能和成本，是通用首选；Opus 推理能力最强，适合复杂分析和创意任务。

**Q2：max_tokens 限制的是输入还是输出？**

> A：只限制输出。输入的 Token 数受限于模型的上下文窗口大小。注意：输入 + 输出的总 Token 数不能超过上下文窗口。

**Q3：stop_reason 为 'max_tokens' 时该怎么办？**

> A：这意味着输出被截断了。你可以增大 max_tokens，或者检查是否真的需要那么长的输出。

</details>

---

## 📝 本章小结

- ✅ **Claude 模型家族** — Haiku（快便宜）、Sonnet（平衡）、Opus（最强）
- ✅ **Messages API** — 核心接口，通过 messages 数组传递对话
- ✅ **System Prompt** — 通过 system 参数设定角色和规则
- ✅ **响应结构** — content 数组、stop_reason、usage
- ✅ **错误处理** — 认证错误、频率限制、参数错误

## ➡️ 下一章预告

> 在下一章中，我们将学习多轮对话的实现——如何管理消息历史、控制上下文窗口、以及在长对话中保持一致性。
> [第2章：多轮对话](./02-multi-turn-conversations.md)
