# 第3章：输出解析器 — 结构化 LLM 输出

> 预计学习时间：70-90 分钟

## 🎯 本章目标

完成本章学习后，你将能够：

- ✅ **理解** 为什么需要输出解析器以及它们解决的核心问题
- ✅ **掌握** 五种内置解析器：StringOutputParser、JsonOutputParser、StructuredOutputParser、CommaSeparatedListOutputParser、Zod Schema 解析
- ✅ **编写** 自定义输出解析器处理特定格式需求
- ✅ **集成** 输出解析器到 LangChain 的链式调用中

## 📋 前置知识

- 掌握基本的 LangChain 链式调用（.pipe()）
- 了解 TypeScript 类型系统和泛型
- 熟悉 ChatPromptTemplate 的基本用法

## 💡 核心概念

### 为什么需要输出解析器？

LLM 输出的原始内容是自然语言文本，但应用程序往往需要结构化的数据。想象一下：你问 LLM 「今天北京天气如何？」，得到的回答可能是 「今天北京晴，气温 15-25°C，微风」。如果你的应用需要将温度数据存入数据库，或者在前端展示一个漂亮的天气卡片，你就需要一种方式将这段文本转换为结构化的 JSON 或对象。

输出解析器（Output Parser）正是解决这个问题的关键工具——它负责将 LLM 的原始文本输出转换为应用程序可以可靠使用的结构化数据。

### 输出解析器的工作原理

```
LLM 原始输出（字符串）→ 输出解析器 → 结构化数据（对象/JSON/数组）
                                  ↑
                            Format Instructions（格式指令）
```

大多数解析器会自动向 Prompt 注入格式指令，告诉 LLM 应该以什么格式输出，然后解析器再将这些格式化输出解析为目标数据结构。

## 🔨 实战演练

### 1. StringOutputParser — 纯文本输出

最简单的解析器，不对输出做任何转换，直接返回字符串。适合对话、摘要等纯文本场景。

```typescript
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';

const model = new ChatOpenAI({ model: 'gpt-4' });
const prompt = ChatPromptTemplate.fromMessages([
  ['system', '你是一位友好的助手，请用中文回答。'],
  ['human', '{input}'],
]);

const chain = prompt.pipe(model).pipe(new StringOutputParser());

const result = await chain.invoke({ input: '解释一下什么是量子计算' });
// result 是一个纯文本字符串
console.log(result); // "量子计算是一种利用量子力学原理..."
```

### 2. JsonOutputParser — JSON 格式输出

当需要从 LLM 获取结构化的 JSON 数据时使用。解析器会自动在 Prompt 中加入 JSON 格式指令。

```typescript
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';

const jsonParser = new JsonOutputParser();

const prompt = ChatPromptTemplate.fromTemplate(
  `提取用户评论中的关键信息并返回 JSON。

{format_instructions}

用户评论：{review}`
);

const chain = prompt.pipe(model).pipe(jsonParser);

const result = await chain.invoke({
  review: '这个产品很好用，但价格有点贵，配送速度很快。',
});
// result: { "sentiment": "positive", "issues": ["价格贵"], "highlights": ["配送快"] }
```

### 3. StructuredOutputParser — Schema 定义输出

通过定义 name-description 映射来指定输出结构，比自由 JSON 更加严格可靠。

```typescript
import { StructuredOutputParser } from 'langchain/output_parsers';

const schema = StructuredOutputParser.fromNamesAndDescriptions({
  title: '文章标题，不超过 20 字',
  summary: '一句话摘要，不超过 50 字',
  tags: '标签列表，3-5 个关键词',
  readingTime: '预计阅读时间（分钟）',
});

const prompt = ChatPromptTemplate.fromTemplate(
  `分析以下文本：{text}\n{format_instructions}`
);

const chain = prompt.pipe(model).pipe(schema);
const result = await chain.invoke({
  text: '这是一篇关于人工智能在医疗领域应用的长文...',
  format_instructions: schema.getFormatInstructions(),
});
// result: { title: '...', summary: '...', tags: ['...', '...'], readingTime: 5 }
```

### 4. Zod Schema 验证 — 类型安全的输出

Zod 是 TypeScript 生态中最流行的 Schema 验证库，与 StructuredOutputParser 结合可以实现编译期和运行时的双重类型安全。

```typescript
import { z } from 'zod';
import { StructuredOutputParser } from 'langchain/output_parsers';

const zodSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  confidence: z.number().min(0).max(1),
  keywords: z.array(z.string()),
  isUrgent: z.boolean(),
});

const parser = StructuredOutputParser.fromZodSchema(zodSchema);

// 自动推断 TypeScript 类型
type AnalysisResult = z.infer<typeof zodSchema>;
// 等价于：
// { sentiment: 'positive' | 'negative' | 'neutral',
//   confidence: number,
//   keywords: string[],
//   isUrgent: boolean }

const chain = ChatPromptTemplate.fromTemplate(
  `分析以下客服消息：{message}\n{format_instructions}`
).pipe(model).pipe(parser);

const result = await chain.invoke({
  message: '我的订单已经延迟三天了，非常不满！',
  format_instructions: parser.getFormatInstructions(),
});
// result 类型为 AnalysisResult
console.log(result.sentiment); // "negative"
```

### 5. CommaSeparatedListOutputParser — 逗号分隔列表

当需要 LLM 返回一个列表（如关键词、建议列表）时使用。

```typescript
import { CommaSeparatedListOutputParser } from '@langchain/core/output_parsers';

const listParser = new CommaSeparatedListOutputParser();

const prompt = ChatPromptTemplate.fromTemplate(
  `列出 {topic} 领域的 5 个重要趋势，用逗号分隔。\n{format_instructions}`
);

const chain = prompt.pipe(model).pipe(listParser);

const result = await chain.invoke({
  topic: '前端开发',
  format_instructions: listParser.getFormatInstructions(),
});
// result: ["WebAssembly", "Server Components", "AI 辅助开发", "微前端", "边缘渲染"]
```

### 6. 自定义输出解析器

当内置解析器无法满足需求时，可以创建自定义解析器。

```typescript
import { BaseOutputParser } from '@langchain/core/output_parsers';

// 自定义 Markdown 标题提取器
class MarkdownTitleParser extends BaseOutputParser<string[]> {
  lc_namespace = ['langchain', 'output_parsers'];

  getFormatInstructions(): string {
    return '请使用 Markdown 格式输出，包含多个 ## 二级标题。';
  }

  async parse(text: string): Promise<string[]> {
    const titleRegex = /^##\s+(.+)$/gm;
    const titles: string[] = [];
    let match;
    while ((match = titleRegex.exec(text)) !== null) {
      titles.push(match[1]);
    }
    return titles;
  }
}

const titleParser = new MarkdownTitleParser();
const chain = prompt.pipe(model).pipe(titleParser);
```

## ⚡ 进阶技巧

1. **错误重试**：设置 `maxRetries` 参数，当解析失败时自动重试
2. **部分解析**：使用 `stream` 模式时，可以逐步解析流式输出
3. **格式指令自定义**：覆盖 `getFormatInstructions()` 方法提供更精确的输出格式说明
4. **组合使用**：先使用 StringOutputParser 获取原始输出，再根据情况选择不同的解析器

## 🧠 知识检查点

1. 为什么说输出解析器是 LLM 应用开发中「不可忽视的中间层」？
2. StructuredOutputParser 和 Zod Schema 解析器的区别是什么？各有什么优势？
3. 如何处理 LLM 输出格式不符合预期的情况？
4. 在流式输出场景中，使用输出解析器需要注意什么？

## 🐛 常见错误

- ❌ **忘记注入 format_instructions**：解析器需要格式指令来指导 LLM 输出，忘记注入会导致解析失败
- ❌ **Schema 定义过于复杂**：过于复杂的嵌套结构会让 LLM 难以准确遵循
- ❌ **忽略类型转换**：Zod Schema 的 `z.number()` 要求 LLM 输出数字而非字符串
- ❌ **未处理解析异常**：LLM 偶尔会输出不符合格式的内容，应该用 try-catch 捕获异常

## 📝 本章小结

- ✅ **StringOutputParser** — 纯文本输出，最简单直接
- ✅ **JsonOutputParser** — 自由格式的 JSON 输出
- ✅ **StructuredOutputParser** — Schema 驱动的结构化输出
- ✅ **Zod 验证** — 类型安全的输出验证，TypeScript 最佳搭档
- ✅ **CommaSeparatedListOutputParser** — 快速获取列表数据
- ✅ **自定义解析器** — 满足特定需求的终极方案

输出解析器是将 LLM 的强大能力与工程化应用连接起来的关键桥梁。选择合适的解析器能大幅提升应用的可靠性和开发效率。

## ➡️ 下一章预告

> 第4章：Memory 与 Agent 状态管理 — 学习如何让 Agent 记住对话历史和用户偏好，构建更智能的持久化应用
