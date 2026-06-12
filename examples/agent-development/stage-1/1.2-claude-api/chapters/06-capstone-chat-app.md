# 第6章：综合实战 — 构建多模型聊天应用

> 预计学习时间：120-150 分钟

## 🎯 本章目标

综合运用前五章的知识，构建一个支持 Claude 全系列模型的终端聊天应用。

## 📋 前置知识

> 建议按顺序完成：[第1章](./01-api-fundamentals.md) → [第5章](./05-advanced-features.md)

---

## 🔨 项目构建

### 完整代码：终端聊天应用

```typescript
// src/chat-app.ts
import Anthropic from '@anthropic-ai/sdk';
import * as readline from 'readline';

const client = new Anthropic();

// ============ 配置 ============

interface AppConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  enableCaching: boolean;
  enableStreaming: boolean;
}

const defaultConfig: AppConfig = {
  model: 'claude-sonnet-4-5-20241022',
  maxTokens: 2048,
  temperature: 0.7,
  systemPrompt: '你是一个友好的 AI 助手，回答简洁明了。',
  enableCaching: true,
  enableStreaming: true,
};

// ============ 模型切换 ============

const MODELS: Record<string, { name: string; model: string; description: string }> = {
  haiku: {
    name: 'Haiku',
    model: 'claude-haiku-4-5-20251001',
    description: '快速、经济',
  },
  sonnet: {
    name: 'Sonnet',
    model: 'claude-sonnet-4-5-20241022',
    description: '平衡性能和成本',
  },
  opus: {
    name: 'Opus',
    model: 'claude-opus-4-20250514',
    description: '最强推理能力',
  },
};

// ============ 对话管理 ============

class ChatSession {
  private messages: Anthropic.MessageParam[] = [];
  private config: AppConfig;
  private totalTokens = { input: 0, output: 0, cacheRead: 0 };
  private totalCost = 0;

  constructor(config: AppConfig) {
    this.config = config;
  }

  async sendMessage(userInput: string): Promise<string> {
    this.messages.push({ role: 'user', content: userInput });

    if (this.config.enableStreaming) {
      return this.streamResponse();
    } else {
      return this.standardResponse();
    }
  }

  // 流式响应
  private async streamResponse(): Promise<string> {
    const systemParams = this.config.enableCaching
      ? [{ type: 'text' as const, text: this.config.systemPrompt, cache_control: { type: 'ephemeral' as const } }]
      : this.config.systemPrompt;

    const stream = client.messages.stream({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: systemParams,
      messages: this.messages,
    });

    let fullText = '';

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        process.stdout.write(event.delta.text);
        fullText += event.delta.text;
      }
    }

    const finalMessage = await stream.finalMessage();
    this.updateStats(finalMessage.usage);
    this.messages.push({ role: 'assistant', content: fullText });

    return fullText;
  }

  // 标准响应
  private async standardResponse(): Promise<string> {
    const systemParams = this.config.enableCaching
      ? [{ type: 'text' as const, text: this.config.systemPrompt, cache_control: { type: 'ephemeral' as const } }]
      : this.config.systemPrompt;

    const response = await client.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: systemParams,
      messages: this.messages,
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    this.updateStats(response.usage);
    this.messages.push({ role: 'assistant', content: text });

    return text;
  }

  private updateStats(usage: Anthropic.Usage) {
    this.totalTokens.input += usage.input_tokens;
    this.totalTokens.output += usage.output_tokens;
    this.totalTokens.cacheRead += usage.cache_read_input_tokens;
  }

  getStats() {
    return {
      ...this.totalTokens,
      turns: this.messages.length / 2,
      estimatedCost: this.totalCost,
    };
  }

  clearHistory() {
    this.messages = [];
    console.log('🗑️ 对话历史已清空');
  }
}

// ============ 主交互循环 ============

async function main() {
  const config = { ...defaultConfig };
  const session = new ChatSession(config);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('🤖 Claude 聊天助手');
  console.log('─'.repeat(40));
  console.log(`模型: ${config.model}`);
  console.log('命令: /model <haiku|sonnet|opus> | /clear | /stats | /quit');
  console.log('─'.repeat(40));
  console.log();

  const ask = () => {
    rl.question('你: ', async (input) => {
      if (!input.trim()) { ask(); return; }

      // 处理命令
      if (input.startsWith('/')) {
        const [cmd, ...args] = input.split(' ');
        switch (cmd) {
          case '/model':
            const modelName = args[0];
            if (MODELS[modelName]) {
              config.model = MODELS[modelName].model;
              console.log(`✅ 模型已切换为 ${MODELS[modelName].name} (${MODELS[modelName].description})`);
            } else {
              console.log('❌ 未知模型。可选: haiku, sonnet, opus');
            }
            break;
          case '/clear':
            session.clearHistory();
            break;
          case '/stats':
            const stats = session.getStats();
            console.log(`📊 统计: ${stats.turns} 轮对话, ${stats.input + stats.output} 总 Token`);
            break;
          case '/quit':
            console.log('👋 再见！');
            rl.close();
            return;
          default:
            console.log('❌ 未知命令');
        }
        ask();
        return;
      }

      // 发送消息
      process.stdout.write('\nClaude: ');
      try {
        await session.sendMessage(input);
        console.log('\n');
      } catch (error: any) {
        console.error(`\n❌ 错误: ${error.message}\n`);
      }

      ask();
    });
  };

  ask();
}

main();
```

### 运行效果

```
🤖 Claude 聊天助手
────────────────────────────────────
模型: claude-sonnet-4-5-20241022
命令: /model <haiku|sonnet|opus> | /clear | /stats | /quit
────────────────────────────────────

你: 你好，帮我解释一下闭包

Claude: 闭包是一个函数加上它创建时能访问的外部变量的组合。

简单来说：函数「记住」了它出生时的环境。

```javascript
function createCounter() {
  let count = 0; // 外部变量
  return function() {
    count++; // 内部函数访问外部变量
    return count;
  };
}

const counter = createCounter();
counter(); // 1
counter(); // 2  （count 被「记住」了）
```

你: /model haiku
✅ 模型已切换为 Haiku (快速、经济)

你: 用一句话总结
Claude: 闭包就是函数带着它的「行李箱」（外部变量）到处走。

你: /stats
📊 统计: 2 轮对话, 450 总 Token
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么聊天应用推荐使用流式输出？**

> A：因为非流式输出需要等待整个回答生成完毕才能显示，对于长回答可能需要等待 10-30 秒。流式输出第一个 Token 就开始显示，用户感知的等待时间大幅缩短，体验更好。

**Q2：Prompt Caching 在聊天应用中如何发挥作用？**

> A：聊天应用通常有固定的 System Prompt（角色设定、规则等），这部分内容在所有对话中不变，非常适合缓存。首次请求创建缓存，后续请求直接读取缓存，可节省 90% 的输入 Token 成本。

</details>

---

## 📝 本章小结

- ✅ **完整聊天应用** — 整合多轮对话、流式输出、模型切换、Prompt Caching
- ✅ **配置管理** — 可动态调整模型、温度、Token 限制
- ✅ **成本追踪** — 实时统计 Token 使用量
- ✅ **交互命令** — /model、/clear、/stats、/quit

## ➡️ 下一步

请查看附录：
- [Claude API 速查表](../appendix/cheatsheet.md)
- [常见错误排错指南](../appendix/troubleshooting.md)

然后进入 [1.3 OpenAI API](../../1.3-openai-api/README.md)
