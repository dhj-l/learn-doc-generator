# 第4章：Streaming 流式处理 — 从逐字输出到数据河流

> 预计学习时间：70–100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **掌握 streamText 和 streamObject** — 流式文本与流式结构化数据的完整用法
- **理解 Data Stream 协议** — AI SDK 前后端通信的底层机制
- **实现流式中间件** — 对输出流进行过滤、增强和转换
- **使用 AbortController 实现取消和超时控制**

---

## 💡 核心概念

### 概念一：为什么 Streaming 如此重要？

**生活类比：** 想象你在看 Netflix 电影。如果必须等整部电影下载完才能看，你需要等 5 分钟才能按下播放键。但流式传输让你只等 3 秒缓冲就开始观看，后面一边看一边下载。AI 的流式输出也是一样——**用户感知的等待时间从"等全部完成"变为"几乎即时开始"**。

**心理学依据：** 人脑对等待的感知是非线性的。0.1–0.3 秒的延迟被认为是"即时"，1–2 秒的延迟会让人感觉"卡顿"，超过 5 秒用户可能直接离开。流式输出将首 Token 时间（TTFT）从 5–10 秒降到 0.5–2 秒，用户体验天差地别。

```
非流式（Non-streaming）：
用户输入 ─→ [等待 5 秒] ─→ AI 输出（全部一次性显示）
                          ↑ 这 5 秒用户不知道发生了什么

流式（Streaming）：
用户输入 ─→ [0.5 秒] ─→ 开始逐字输出 ─→ [5 秒] ─→ 完成
                         ↑ 用户立刻看到"正在生成"的反馈
```

### 概念二：streamText 深度解析

`streamText` 是 AI SDK 最核心的流式函数。它返回一个 `StreamTextResult` 对象，提供多重消费方式：

```typescript
// src/01-stream-text-deep.ts
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

async function main() {
  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: '你是一个创意写作助手，用诗意的语言回答。',
    messages: [
      {
        role: 'user',
        content: '以"代码"为主题写一段短散文，200字左右',
      },
    ],
    // 可选参数
    temperature: 0.8,
    maxTokens: 500,
  });

  // ============================================
  // 方式 A：textStream — 最常用的文本流
  // 每个 chunk 是字符串片段
  // ============================================
  console.log('=== textStream 模式 ===');
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);  // 逐字输出（模拟打字效果）
  }
  console.log('\n\n');

  // ============================================
  // 方式 B：fullStream — 完整事件流
  // 包含文本、工具调用、完成事件等元数据
  // ============================================
  console.log('=== fullStream 模式 ===');
  for await (const event of result.fullStream) {
    switch (event.type) {
      case 'text-delta':
        process.stdout.write(event.textDelta);
        break;

      case 'tool-call': {
        console.log(`\n🔧 [工具调用] ${event.toolName}`);
        console.log(`   参数: ${JSON.stringify(event.args)}`);
        break;
      }

      case 'tool-result': {
        console.log(`📋 [工具结果] ${event.toolName}`);
        console.log(`   结果: ${JSON.stringify(event.result).slice(0, 100)}...`);
        break;
      }

      case 'finish': {
        console.log(`\n\n✅ [完成] 原因: ${event.finishReason}`);
        console.log(`   用量: ${JSON.stringify(event.usage)}`);
        break;
      }

      case 'error': {
        console.error(`\n❌ [错误] ${event.error}`);
        break;
      }
    }
  }

  // ============================================
  // 方式 C：最终结果（awaited）
  // 等待流结束后获取完整数据
  // ============================================
  const finalText = await result.text;
  const finalUsage = await result.usage;
  const finalFinishReason = await result.finishReason;

  console.log('\n=== 最终汇总 ===');
  console.log(`完整文本 (${finalText.length} 字符):`);
  console.log(finalText.slice(0, 100) + '...');
  console.log(`Prompt Tokens: ${finalUsage.promptTokens}`);
  console.log(`Completion Tokens: ${finalUsage.completionTokens}`);
  console.log(`完成原因: ${finalFinishReason}`);
}

main().catch(console.error);
```

### 概念三：streamObject — 流式结构化输出

当需要逐步展示结构化数据（如 JSON、表格、UI 组件树）时，`streamObject` 让前端可以边生成边渲染：

```typescript
// src/02-stream-object-deep.ts
import { streamObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// ============================================
// 1. 定义复杂的嵌套 Schema
// ============================================
const MeetingMinutesSchema = z.object({
  meeting: z.object({
    title: z.string(),
    date: z.string(),
    attendees: z.array(z.string()),
  }),
  summary: z.string(),
  actionItems: z.array(
    z.object({
      owner: z.string(),
      task: z.string(),
      priority: z.enum(['high', 'medium', 'low']),
      deadline: z.string().optional(),
    })
  ),
  decisions: z.array(
    z.object({
      topic: z.string(),
      conclusion: z.string(),
    })
  ),
  nextSteps: z.array(z.string()),
});

type MeetingMinutes = z.infer<typeof MeetingMinutesSchema>;

// ============================================
// 2. 流式生成
// ============================================
async function generateMinutes(prompt: string) {
  const { partialObjectStream, object } = await streamObject({
    model: anthropic('claude-sonnet-4-5-20241022'),
    schema: MeetingMinutesSchema,
    prompt,
    system: '你是一个会议记录员，生成结构化的会议纪要。',
    // 可选：控制输出长度和温度
    temperature: 0.3,
    maxTokens: 2000,
  });

  // 方式 A：逐步接收部分对象
  // 随着生成进度，对象字段从 undefined 逐步填充
  console.log('=== 实时生成过程 ===\n');
  let lastJson = '';
  for await (const partial of partialObjectStream) {
    const json = JSON.stringify(partial, null, 2);
    if (json !== lastJson) {
      console.clear();
      console.log('🔄 正在生成会议纪要...\n');
      // 显示已生成的字段
      if (partial.meeting?.title) {
        console.log(`📋 标题: ${partial.meeting.title}`);
      }
      if (partial.meeting?.attendees?.length) {
        console.log(`👥 参会人: ${partial.meeting.attendees.join(', ')}`);
      }
      if (partial.actionItems?.length) {
        console.log(`📌 已识别 ${partial.actionItems.length} 个行动项`);
        for (const item of partial.actionItems) {
          if (item.task) {
            console.log(`   [${item.priority}] ${item.owner}: ${item.task}`);
          }
        }
      }
      if (partial.summary) {
        console.log(`\n📝 摘要: ${partial.summary.slice(0, 60)}...`);
      }
      lastJson = json;
    }
  }

  // 方式 B：等待最终完整对象
  const finalObject: MeetingMinutes = await object;
  console.log('\n=== 最终结果 ===\n');
  console.log(JSON.stringify(finalObject, null, 2));

  return finalObject;
}

// ============================================
// 3. 使用示例
// ============================================
async function main() {
  const minutes = await generateMinutes(`
    今天的产品评审会议讨论了以下内容：

    1. 用户反馈搜索功能太慢，需要优化数据库索引
    — 负责人：张三，优先级高，本周五前完成

    2. 新设计的登录页需要在移动端适配
    — 负责人：李四，优先级中，下周三前完成

    3. 决定采用 Stripe 作为支付服务商
    — 迁移工作由王五负责，优先级高，截止月底

    参会人：张三、李四、王五、赵六
    会议时间：2025年1月15日
  `);

  // 生成摘要报告
  const highPriority = minutes.actionItems.filter(i => i.priority === 'high');
  console.log(`\n⚠️ 高优先级任务 (${highPriority.length} 项):`);
  highPriority.forEach(item => {
    console.log(`  🔴 ${item.task} — ${item.owner}`);
  });
}

main().catch(console.error);
```

### 概念四：Data Stream 协议

AI SDK 使用自定义的 **Data Stream Protocol** 在前端和后端之间传输流式数据。理解这个协议对调试和自定义处理非常重要：

```typescript
// src/03-data-stream-protocol.ts
/**
 * Data Stream 协议格式
 *
 * 每一行是一个 SSE（Server-Sent Events）格式的事件
 *
 * 文本块事件：
 *   0:"Hello World"
 *   └── 0 表示 text-delta 类型
 *
 * 工具调用事件：
 *   9:"getWeather"{"city":"Beijing"}
 *   └── 9 表示 tool-call
 *
 * 完成事件：
 *   e:{"finishReason":"stop","usage":{...}}
 *   └── e 表示 finish
 *
 * 错误事件：
 *   8:"Error message"
 *   └── 8 表示 error
 */

/**
 * 手动解析 Data Stream（了解底层原理）
 */
async function parseDataStream(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // 按行解析
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // 保留不完整的行

    for (const line of lines) {
      if (!line.trim()) continue;

      const typeChar = line[0];
      const payload = line.slice(2); // 跳过 type 标识和冒号

      switch (typeChar) {
        case '0': // text-delta
          console.log(`📝 文本增量: ${payload}`);
          break;
        case '9': { // tool-call
          // 格式: toolName{"arg1":"value1"}
          const spaceIdx = payload.indexOf('{');
          if (spaceIdx > 0) {
            const toolName = payload.slice(0, spaceIdx);
            const args = JSON.parse(payload.slice(spaceIdx));
            console.log(`🔧 工具调用: ${toolName}(${JSON.stringify(args)})`);
          }
          break;
        }
        case 'e': // finish
          console.log(`✅ 完成: ${payload}`);
          break;
        case '8': // error
          console.error(`❌ 错误: ${payload}`);
          break;
        default:
          console.log(`其他事件类型 [${typeChar}]: ${payload}`);
      }
    }
  }
}

/**
 * 后端 API Route 的标准实现
 */
// app/api/chat/route.ts
export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    messages,
  });

  // toDataStreamResponse() 自动将流转换为 Data Stream 协议格式
  return result.toDataStreamResponse();
}

/**
 * toDataStreamResponse() 内部做的工作：
 *
 * 1. 创建 ReadableStream
 * 2. 监听 fullStream 事件
 * 3. 将每个事件编码为一行 SSE 格式
 * 4. 设置正确的 Content-Type: text/event-stream
 * 5. 返回 Response 对象
 *
 * 手动实现等价代码：
 */
async function manualToDataStream(result: Awaited<ReturnType<typeof streamText>>) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      for await (const event of result.fullStream) {
        let line = '';

        switch (event.type) {
          case 'text-delta':
            line = `0:${event.textDelta}\n`;
            break;
          case 'tool-call':
            line = `9:${event.toolName}${JSON.stringify(event.args)}\n`;
            break;
          case 'tool-result':
            line = `a:${JSON.stringify(event)}\n`;
            break;
          case 'finish':
            line = `e:${JSON.stringify({ finishReason: event.finishReason, usage: event.usage })}\n`;
            break;
          case 'error':
            line = `8:${event.error}\n`;
            break;
        }

        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### 概念五：流式中间件（Stream Middleware）

在流式输出到达客户端之前，你可能需要拦截和转换数据——这就是**流式中间件**的用武之地：

```typescript
// src/04-stream-middleware.ts
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

/**
 * 流式中间件：对输出流进行管道式处理
 *
 * 常见场景：
 * - 过滤敏感词
 * - 添加实时翻译
 * - 记录审计日志
 * - 速率限制
 * - 注入自定义内容
 */

// ============================================
// 中间件 1：敏感词过滤
// ============================================
function createFilterMiddleware(blockedWords: string[]) {
  return function transformStream(
    result: ReturnType<typeof streamText>
  ): ReturnType<typeof streamText> {
    const originalStream = result.textStream;
    const filteredStream = (async function* () {
      let buffer = '';

      for await (const chunk of originalStream) {
        buffer += chunk;

        const containsBlocked = blockedWords.some(word =>
          buffer.toLowerCase().includes(word.toLowerCase())
        );

        if (containsBlocked) {
          for (const word of blockedWords) {
            const regex = new RegExp(word, 'gi');
            buffer = buffer.replace(regex, '***');
          }
        }

        yield buffer;
        buffer = '';
      }
    })();

    return {
      ...result,
      textStream: filteredStream,
    } as any;
  };
}

// ============================================
// 中间件 2：速率限制（模拟打字效果）
// ============================================
function createRateLimitMiddleware(charsPerSecond: number) {
  return function transformStream(
    result: ReturnType<typeof streamText>
  ): ReturnType<typeof streamText> {
    const originalStream = result.textStream;
    const delayMs = 1000 / charsPerSecond;
    const throttledStream = (async function* () {
      for await (const chunk of originalStream) {
        for (const char of chunk) {
          yield char;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    })();

    return {
      ...result,
      textStream: throttledStream,
    } as any;
  };
}

// ============================================
// 中间件 3：统计监控
// ============================================
function createStatsMiddleware() {
  const stats = {
    totalChars: 0,
    totalChunks: 0,
    startTime: Date.now(),
    firstTokenTime: 0 as number | null,
  };

  return {
    middleware: function transformStream(
      result: ReturnType<typeof streamText>
    ): ReturnType<typeof streamText> {
      const originalStream = result.textStream;
      const statsStream = (async function* () {
        for await (const chunk of originalStream) {
          if (!stats.firstTokenTime) {
            stats.firstTokenTime = Date.now();
          }
          stats.totalChars += chunk.length;
          stats.totalChunks++;
          yield chunk;
        }

        const totalTime = Date.now() - stats.startTime;
        console.log('\n📊 流式统计:');
        console.log(`  首 Token 延迟: ${stats.firstTokenTime! - stats.startTime}ms`);
        console.log(`  总耗时: ${totalTime}ms`);
        console.log(`  总字符: ${stats.totalChars}`);
        console.log(`  总 Chunks: ${stats.totalChunks}`);
        console.log(`  平均速率: ${(stats.totalChars / totalTime * 1000).toFixed(0)} 字符/秒`);
      })();

      return {
        ...result,
        textStream: statsStream,
      } as any;
    },
    getStats: () => stats,
  };
}

// ============================================
// 使用组合中间件
// ============================================
async function main() {
  const statsTracker = createStatsMiddleware();

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    messages: [
      {
        role: 'user',
        content: '请详细解释微服务架构的优缺点，不少于 300 字',
      },
    ],
  });

  // 管道式组合中间件
  const pipeline = createFilterMiddleware(['缺点', '不好', '糟糕']);
  const throttled = createRateLimitMiddleware(20);
  const monitored = statsTracker.middleware;

  const processed = monitored(throttled(pipeline(result)));

  console.log('🤖 AI 回复（模拟打字效果）:\n');
  for await (const chunk of processed.textStream) {
    process.stdout.write(chunk);
  }

  console.log('\n\n✅ 完成');
}

main().catch(console.error);
```

### 概念六：AbortController 取消与超时

用户可能随时取消正在进行的 AI 响应。`AbortController` 提供了标准的取消机制：

```typescript
// src/05-abort-controller.ts
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

// ============================================
// 1. 基础取消
// ============================================
async function chatWithCancel() {
  const abortController = new AbortController();

  setTimeout(() => {
    console.log('\n⛔ 用户取消了请求...');
    abortController.abort();
  }, 3000);

  try {
    const result = streamText({
      model: anthropic('claude-sonnet-4-5-20241022'),
      prompt: '写一篇 5000 字的文章，关于人工智能的发展史',
      abortSignal: abortController.signal,
    });

    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('\n⚠️ 请求已被用户取消');
    } else {
      console.error('\n❌ 错误:', error);
    }
  }
}

// ============================================
// 2. 超时自动取消
// ============================================
async function chatWithTimeout(timeoutMs: number = 5000) {
  const abortController = new AbortController();

  const timeoutId = setTimeout(() => {
    abortController.abort(new Error(`请求超时 (${timeoutMs}ms)`));
  }, timeoutMs);

  try {
    const result = streamText({
      model: anthropic('claude-sonnet-4-5-20241022'),
      prompt: '解释一下量子计算的原理',
      abortSignal: abortController.signal,
    });

    let fullText = '';
    for await (const chunk of result.textStream) {
      fullText += chunk;
    }

    clearTimeout(timeoutId);
    console.log('✅ 完成，长度:', fullText.length);
    return fullText;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`⏰ ${error.message}`);
      return null;
    }
    throw error;
  }
}

// ============================================
// 3. 生产级：StreamManager
// ============================================
class StreamManager {
  private currentController: AbortController | null = null;
  private readonly timeoutMs: number;
  private onPartial: (text: string) => void;
  private onComplete: (text: string) => void;
  private onError: (error: Error) => void;

  constructor(options: {
    timeoutMs?: number;
    onPartial?: (text: string) => void;
    onComplete?: (text: string) => void;
    onError?: (error: Error) => void;
  }) {
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.onPartial = options.onPartial ?? console.log;
    this.onComplete = options.onComplete ?? console.log;
    this.onError = options.onError ?? console.error;
  }

  async start(prompt: string) {
    this.cancel();

    const controller = new AbortController();
    this.currentController = controller;

    const timeoutId = setTimeout(() => {
      controller.abort(new Error(`Stream timeout after ${this.timeoutMs}ms`));
    }, this.timeoutMs);

    try {
      const result = streamText({
        model: anthropic('claude-sonnet-4-5-20241022'),
        prompt,
        abortSignal: controller.signal,
      });

      let accumulated = '';
      for await (const chunk of result.textStream) {
        if (controller.signal.aborted) break;
        accumulated += chunk;
        this.onPartial(accumulated);
      }

      clearTimeout(timeoutId);
      if (!controller.signal.aborted) {
        this.onComplete(accumulated);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name !== 'AbortError') {
        this.onError(error);
      }
    } finally {
      this.currentController = null;
    }
  }

  cancel() {
    if (this.currentController) {
      this.currentController.abort();
      this.currentController = null;
    }
  }

  get isActive(): boolean {
    return this.currentController !== null;
  }
}

// ============================================
// 4. React 中的 useChat 与取消
// ============================================
/*
'use client';
import { useChat } from 'ai/react';

export function StreamingChat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, stop } = useChat({
    api: '/api/chat',
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>{m.content}</div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit" disabled={isLoading}>
          {isLoading ? '生成中...' : '发送'}
        </button>
        {isLoading && <button onClick={stop}>停止</button>}
      </form>
    </div>
  );
}
*/

async function main() {
  console.log('=== 演示 1：超时取消 ===\n');
  const result = await chatWithTimeout(3000);
  if (result === null) {
    console.log('（已生成超时前的部分内容）');
  }

  console.log('\n=== 演示 2：StreamManager ===\n');
  const manager = new StreamManager({
    timeoutMs: 5000,
    onPartial: (text) => {
      console.clear();
      console.log(`已生成 ${text.length} 字符...`);
    },
    onComplete: (text) => {
      console.log(`✅ 完成: ${text.slice(0, 100)}...`);
    },
  });

  await manager.start('用 200 字介绍 TypeScript');
  console.log('\n✅ 所有演示结束');
}

main().catch(console.error);
```

### 概念七：流式代理与缓存

```typescript
// src/06-stream-proxy.ts
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createHash } from 'crypto';

class StreamProxy {
  private cache = new Map<string, string>();
  private requestLog: number[] = [];
  private readonly maxRequestsPerMinute = 30;

  private checkRateLimit(): boolean {
    const now = Date.now();
    this.requestLog = this.requestLog.filter(t => now - t < 60000);
    return this.requestLog.length < this.maxRequestsPerMinute;
  }

  private getCacheKey(model: any, prompt: string): string {
    const raw = `${JSON.stringify(model)}:${prompt}`;
    return createHash('md5').update(raw).digest('hex');
  }

  async stream(model: any, prompt: string, signal?: AbortSignal) {
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded. Max 30 requests per minute.');
    }

    const cacheKey = this.getCacheKey(model, prompt);

    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`0:${cached}\n`));
          controller.enqueue(
            new TextEncoder().encode(`e:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n`)
          );
          controller.close();
        },
      });
    }

    this.requestLog.push(Date.now());
    console.log(`📊 请求 #${this.requestLog.length}: "${prompt.slice(0, 50)}..."`);

    const result = streamText({ model, prompt, abortSignal: signal });
    let fullResponse = '';
    const encoder = new TextEncoder();

    const proxyStream = new ReadableStream({
      async start(controller) {
        for await (const event of result.fullStream) {
          if (event.type === 'text-delta') {
            fullResponse += event.textDelta;
            controller.enqueue(encoder.encode(`0:${event.textDelta}\n`));
          } else if (event.type === 'finish') {
            controller.enqueue(
              encoder.encode(`e:${JSON.stringify({ finishReason: event.finishReason, usage: event.usage })}\n`)
            );
            this.cache.set(cacheKey, fullResponse);
            console.log(`💾 已缓存 (${fullResponse.length} 字符)`);
          } else if (event.type === 'error') {
            controller.enqueue(encoder.encode(`8:${event.error}\n`));
          }
        }
        controller.close();
      },
    });

    return proxyStream;
  }

  get cacheSize() { return this.cache.size; }
  clearCache() { this.cache.clear(); }
}
```

---

## 🔨 实战演练

### 练习：实时 Markdown 渲染器

```typescript
// src/07-markdown-stream.ts
async function renderStreamingMarkdown(result: ReturnType<typeof streamText>) {
  const { textStream } = result;
  let inCodeBlock = false;
  let currentLanguage = '';
  let codeContent = '';

  for await (const chunk of textStream) {
    if (chunk.includes('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        const match = chunk.match(/```(\w*)/);
        currentLanguage = match?.[1] || '';
        codeContent = '';
        process.stdout.write(`\n📦 代码块 [${currentLanguage || '未指定语言'}]\n`);
      } else {
        inCodeBlock = false;
        process.stdout.write(`\n📋 代码块结束 (${codeContent.length} 字符)\n`);
      }
    } else if (inCodeBlock) {
      codeContent += chunk;
      process.stdout.write(chunk);
    } else {
      process.stdout.write(chunk);
    }
  }
}
```

---

## ⚡ 进阶技巧

### 技巧一：流式重试

```typescript
async function streamWithRetry(prompt: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = streamText({
        model: anthropic('claude-sonnet-4-5-20241022'),
        prompt,
      });
      let fullText = '';
      for await (const chunk of result.textStream) {
        fullText += chunk;
        process.stdout.write(chunk);
      }
      return fullText;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      console.log(`\n🔄 重试 ${attempt}/${maxRetries}...`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}
```

### 技巧二：混合流

```typescript
const result = streamText({
  model: anthropic('claude-sonnet-4-5-20241022'),
  messages: [{ role: 'user', content: '分析这段代码并给出改进建议' }],
  tools: {
    analyze: tool({...}),
  },
});

for await (const event of result.fullStream) {
  if (event.type === 'text-delta') { /* 实时文本 */ }
  else if (event.type === 'tool-call') { /* 实时工具调用 */ }
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：textStream 和 fullStream 有什么区别？**

> A：`textStream` 只输出文本片段（`string`），适合简单消费。`fullStream` 输出结构化事件 `StreamPart`，包含 `text-delta`、`tool-call`、`tool-result`、`finish`、`error` 等多种类型，适合需要感知完整流状态的场景。

**Q2：Data Stream 协议是如何编码数据的？**

> A：使用改良的 SSE 格式。每行以类型标识字符开头（如 `0` 表示文本增量，`9` 表示工具调用，`e` 表示完成），后面跟具体数据。这种格式允许前端在收到完整 JSON 之前就开始解析和渲染。

**Q3：AbortController 在流式场景中的最佳实践？**

> A：每个流式请求关联一个 `AbortController`。用户取消时调用 `controller.abort()`，流会立即停止。同时设置超时自动取消，防止请求无限挂起。React 的 `useChat` Hook 内置了此机制，通过 `stop()` 函数暴露给用户。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 前端没有正确消费 SSE 流导致数据丢失 | `fetch` 返回的 Response.body 未被正确读取 | 使用内置的 `useChat` hook 或手动通过 `ReadableStream` 逐块读取 |
| 流式中间件修改了数据格式导致前端解析失败 | 中间件改变了 Data Stream 协议的标准编码 | 中间件应在保留原始消息格式的前提下做增强（如添加元数据），不要改变消息结构 |
| `AbortController` 取消后未能正确清理资源 | 取消请求后未关闭数据库连接或文件句柄 | 在 `finally` 块中执行清理操作，确保资源释放 |
| `streamObject` 的 `partialObjectStream` 在类型推断上出错 | TypeScript 无法推断部分对象的准确类型 | 使用 `z.object` 的 `.partial()` 类型或手动断言为 `Partial<T>` |

---

## 📝 本章小结

- ✅ **streamText** — 流式文本，`textStream` / `fullStream` 两种消费方式
- ✅ **streamObject** — 流式结构化数据，`partialObjectStream` 逐步填充
- ✅ **Data Stream 协议** — 前后端 SSE 通信的标准编码格式
- ✅ **流式中间件** — 过滤、限速、统计等管道式处理
- ✅ **AbortController** — 用户取消和超时控制
- ✅ **流式代理** — 缓存、限流、日志等生产级增强

## ➡️ 下一章预告

> [第5章：工具调用集成](./05-tool-use.md) — 定义工具、多步调用链、前端展示与错误处理。
