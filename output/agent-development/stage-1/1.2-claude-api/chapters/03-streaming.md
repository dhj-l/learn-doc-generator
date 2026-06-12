# 第3章：流式输出 — 实时展示 AI 的思考过程

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **实现流式输出** — 让 AI 的回答逐字实时显示
- **处理流式事件** — 理解 SSE 事件流的结构
- **在终端中渲染流式内容** — 实现打字机效果
- **处理流式中断** — 用户取消时优雅终止

## 📋 前置知识

> 建议先完成：[第1章：API 基础](./01-api-fundamentals.md)

---

## 💡 核心概念

### 概念一：为什么要用流式输出？

**生活类比：** 想象你在等一封长邮件。非流式就像等对方写完一整封信再一次性发给你——你可能等很久才看到第一个字。流式就像对方一边写你一边看——即时反馈，体验更好。

```
非流式：等待...等待...等待... → 突然显示一整段文字
流式：  「你」「好」「，」「我」「是」「Cla」「ude」... → 逐字出现
```

| 对比 | 非流式 | 流式 |
|------|--------|------|
| 首字等待时间 | 长（等全部生成完） | 短（第一个 Token 就开始返回） |
| 用户体验 | 像在等加载 | 像在看打字 |
| 适用场景 | 后端批处理 | 对话界面、实时交互 |
| 中断支持 | 不灵活 | 可随时取消 |

### 概念二：基础流式调用

```typescript
// src/01-basic-streaming.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function basicStream() {
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: '用 5 个要点介绍 TypeScript 的优势' },
    ],
  });

  // 方式 1：逐文本块接收
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      process.stdout.write(event.delta.text); // 逐字打印，不换行
    }
  }

  // 获取最终完整消息
  const finalMessage = await stream.finalMessage();
  console.log('\n\n📊 最终统计:', {
    输入Token: finalMessage.usage.input_tokens,
    输出Token: finalMessage.usage.output_tokens,
  });
}

basicStream();
```

```
预期输出（逐字出现）：
TypeScript 的 5 大优势：

1. **静态类型检查** — 编译时捕获类型错误，减少运行时 Bug
2. **更好的 IDE 支持** — 自动补全、重构、跳转定义
3. **代码可读性** — 类型注解就是最好的文档
4. **渐进式采用** — 可以与 JavaScript 共存，逐步迁移
5. **活跃的生态系统** — 主流框架和库都有 TypeScript 支持

📊 最终统计: { 输入Token: 32, 输出Token: 198 }
```

### 概念三：流式事件类型详解

```typescript
// src/02-stream-events.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function detailedStream() {
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 500,
    messages: [
      { role: 'user', content: '你好' },
    ],
  });

  for await (const event of stream) {
    switch (event.type) {
      case 'message_start':
        // 消息开始 — 包含模型信息
        console.log('🟢 消息开始:', event.message.model);
        break;

      case 'content_block_start':
        // 内容块开始 — 可能是 text、tool_use 等
        console.log('📦 内容块开始:', event.content_block.type);
        break;

      case 'content_block_delta':
        // 内容增量 — 实际的文本片段
        if (event.delta.type === 'text_delta') {
          process.stdout.write(event.delta.text);
        } else if (event.delta.type === 'input_json_delta') {
          // 工具调用的 JSON 增量
          process.stdout.write(event.delta.partial_json);
        }
        break;

      case 'content_block_stop':
        // 内容块结束
        console.log('\n📦 内容块结束');
        break;

      case 'message_delta':
        // 消息级更新 — 包含 stop_reason 和最终 usage
        console.log('📊 停止原因:', event.delta.stop_reason);
        console.log('📊 输出 Token:', event.usage?.output_tokens);
        break;

      case 'message_stop':
        // 消息完全结束
        console.log('🔴 消息结束');
        break;
    }
  }
}

detailedStream();
```

### 概念四：流式中断和取消

```typescript
// src/03-stream-abort.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function cancellableStream() {
  const abortController = new AbortController();

  // 模拟用户 3 秒后取消
  setTimeout(() => {
    console.log('\n\n⚠️ 用户取消了请求');
    abortController.abort();
  }, 3000);

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: '写一篇关于 TypeScript 的长文章，至少 500 字'
        },
      ],
    }, { signal: abortController.signal });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        process.stdout.write(event.delta.text);
      }
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('✅ 请求已成功取消');
    } else {
      throw error;
    }
  }
}

cancellableStream();
```

### 概念五：封装可复用的流式工具

```typescript
// src/stream-utils.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// 高级流式封装
interface StreamOptions {
  onToken?: (token: string) => void;
  onComplete?: (fullText: string, usage: Anthropic.Usage) => void;
  onError?: (error: Error) => void;
  abortSignal?: AbortSignal;
}

async function streamChat(
  messages: Anthropic.MessageParam[],
  options: StreamOptions = {},
  modelOptions: {
    model?: string;
    maxTokens?: number;
    system?: string;
  } = {}
): Promise<string> {
  const { onToken, onComplete, onError, abortSignal } = options;

  try {
    const stream = client.messages.stream({
      model: modelOptions.model || 'claude-sonnet-4-5-20241022',
      max_tokens: modelOptions.maxTokens || 1024,
      system: modelOptions.system,
      messages,
    }, { signal: abortSignal });

    let fullText = '';

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
        onToken?.(event.delta.text);
      }
    }

    const finalMessage = await stream.finalMessage();
    onComplete?.(fullText, finalMessage.usage);

    return fullText;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('流式请求已取消');
      return '';
    }
    onError?.(error);
    throw error;
  }
}

// 使用示例：带回调的流式调用
async function main() {
  const result = await streamChat(
    [{ role: 'user', content: '用一句话解释量子计算' }],
    {
      onToken: (token) => process.stdout.write(token),
      onComplete: (text, usage) => {
        console.log(`\n\n✅ 完成！共 ${text.length} 字，使用 ${usage.output_tokens} Token`);
      },
      onError: (error) => console.error('❌ 错误:', error.message),
    }
  );
}

main();
```

---

## 🔨 实战演练

### 练习：构建一个带进度指示的流式对话

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/progress-stream.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

interface ProgressStreamOptions {
  showProgress?: boolean;
  showTokenCount?: boolean;
}

async function progressStream(
  prompt: string,
  options: ProgressStreamOptions = {}
) {
  const startTime = Date.now();
  let tokenCount = 0;
  let fullText = '';

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  console.log('⏳ 正在生成...\n');

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullText += event.delta.text;
      tokenCount++;
      process.stdout.write(event.delta.text);
    }

    // 每 10 个 token 显示一次进度
    if (options.showProgress && tokenCount % 10 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stderr.write(`\r📊 ${tokenCount} tokens | ${elapsed}s`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (options.showTokenCount) {
    console.log(`\n\n📊 完成统计:`);
    console.log(`  总 Token: ~${tokenCount}`);
    console.log(`  耗时: ${elapsed}s`);
    console.log(`  速度: ~${(tokenCount / parseFloat(elapsed)).toFixed(0)} tokens/s`);
  }

  return fullText;
}

// 使用
progressStream('解释 React 的虚拟 DOM 是如何工作的', {
  showProgress: true,
  showTokenCount: true,
});
```

</details>

---

## 📝 本章小结

- ✅ **流式输出** — 使用 `messages.stream()` 实现实时输出
- ✅ **事件类型** — message_start、content_block_delta、message_stop 等
- ✅ **中断处理** — 使用 AbortController 取消流式请求
- ✅ **封装复用** — 构建通用的流式工具函数

## ➡️ 下一章预告

> [第4章：Vision 多模态](./04-vision-multimodal.md) — 让 Claude 理解图片和 PDF。
