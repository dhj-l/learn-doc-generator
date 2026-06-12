# 第3章：输出解析器 — 让 LLM 输出结构化数据

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解为什么需要输出解析器** — LLM 输出文本，但程序需要结构化数据
- **掌握四种核心解析器** — String、JSON、Structured、Pydantic（Zod）
- **实现类型安全的 LLM 输出** — 用 Zod Schema 约束和验证模型输出
- **构建可靠的结构化分析管线** — 将解析器与 LCEL 链结合

## 📋 前置知识

> 建议先完成：
> - [第2章：LCEL 链式调用](./02-lcel.md) — 管道操作符和 Runnable 接口

---

## 💡 核心概念

### 概念一：为什么需要输出解析器？

**生活类比：** 想象你是一个翻译官，客户说的是中文（LLM 输出的自然语言），但接收方需要填入表单（程序需要的结构化数据）。输出解析器就是你——在两者之间做转换。

```
没有输出解析器的问题：

用户: "分析这篇文章的情感"
LLM:  "这篇文章整体情感偏正面。作者使用了积极的词汇如'突破'、'创新'，
       表达了对未来的乐观态度。我给它打 8 分（满分 10 分）。"

你想要的：
{
  "sentiment": "positive",
  "score": 8,
  "maxScore": 10,
  "reason": "作者使用了积极的词汇如'突破'、'创新'"
}

问题：如何从自由文本中可靠地提取出结构化数据？
      → 输出解析器！
```

> **💡 核心价值**
>
> 输出解析器解决了一个关键问题：**LLM 天生输出的是自由文本，但生产应用需要可靠的结构化数据**。没有解析器，你只能用正则表达式或字符串分割来提取数据——这在模型输出格式稍有变化时就会崩溃。

### 概念二：StringOutputParser — 最简单的解析器

这是最基础的解析器——它做的事情就是提取 LLM 响应中的文本内容。

```typescript
// src/01-string-parser.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });
const prompt = ChatPromptTemplate.fromTemplate('用一句话解释：{concept}');

// 没有解析器时，输出是 AIMessage 对象
const rawResult = await prompt.pipe(model).invoke({ concept: '闭包' });
console.log(rawResult);
// AIMessage { content: "闭包是...", response_metadata: {...}, ... }

// 使用 StringOutputParser，输出是纯字符串
const parser = new StringOutputParser();
const chain = prompt.pipe(model).pipe(parser);

const result = await chain.invoke({ concept: '闭包' });
console.log(result);
// "闭包是函数与其创建时所在作用域中变量的组合。"
console.log(typeof result);  // "string"
```

> **💡 什么时候用 StringOutputParser？**
>
> 当你只需要模型返回的文本，不需要其他元数据（Token 数量、模型名等）时。在 LCEL 管道中，几乎所有链的最后一步都会接一个 `StringOutputParser`。

### 概念三：JsonOutputParser — JSON 格式输出

让 LLM 直接输出 JSON 格式的数据。这是生产中最常用的解析器之一。

```typescript
// src/02-json-parser.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });
const parser = new JsonOutputParser();

// 在提示词中说明 JSON 格式要求
const prompt = ChatPromptTemplate.fromTemplate(
  `分析以下文章，返回 JSON 格式的结果。

文章：
{article}

{format_instructions}`
);

const chain = prompt.pipe(model).pipe(parser);

const result = await chain.invoke({
  article: `
  Vue 3.5 发布了，带来了显著的性能提升。响应式系统完全重写，
  编译器优化使模板渲染速度提高了 40%。新版本还引入了 Vapor Mode，
  这是一个无虚拟 DOM 的编译策略，进一步提升了运行时性能。
  `,
  format_instructions: `返回以下 JSON 格式：
{
  "title": "文章标题",
  "sentiment": "positive | negative | neutral",
  "score": 0-10 的数字,
  "keywords": ["关键词1", "关键词2"],
  "summary": "一句话摘要"
}`,
});

console.log(result);
```

```
预期输出：
{
  title: 'Vue 3.5 发布',
  sentiment: 'positive',
  score: 9,
  keywords: ['Vue 3.5', '性能提升', '响应式系统', 'Vapor Mode'],
  summary: 'Vue 3.5 带来重大性能提升，包括重写的响应式系统和无虚拟 DOM 的 Vapor Mode。'
}
```

> **⚠️ JsonOutputParser 的局限**
>
> `JsonOutputParser` 依赖模型「遵守指令」输出合法 JSON。大多数情况下能正常工作，但模型偶尔会输出带有 markdown 代码块标记的 JSON（如 \`\`\`json ... \`\`\`）。`JsonOutputParser` 内部已经处理了这种情况，但如果你需要**类型验证**（确保字段类型正确），应该使用下面的 `StructuredOutputParser`。

### 概念四：StructuredOutputParser — Schema 约束输出

使用 Schema 定义输出结构，解析器会自动验证模型输出是否符合定义。

```typescript
// src/03-structured-parser.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from 'langchain/output_parsers';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

// 方式 1：使用 fromNamesAndDescriptions 快速定义
const parser = StructuredOutputParser.fromNamesAndDescriptions({
  title: '文章的标题',
  sentiment: '情感倾向，只能是 positive、negative 或 neutral',
  confidence: '置信度，0 到 1 之间的小数',
  key_points: '关键要点列表，每项一句话',
});

// 查看生成的格式说明
console.log(parser.getFormatInstructions());
```

```
预期输出（format_instructions）：
The output should be formatted as a JSON instance that conforms to the JSON schema below.
...
{
  "title": "string — 文章的标题",
  "sentiment": "string — 情感倾向...",
  "confidence": "number — 置信度...",
  "key_points": "array — 关键要点列表..."
}
```

```typescript
// 使用 Schema 构建链
const prompt = ChatPromptTemplate.fromTemplate(
  `分析以下文章：\n\n{article}\n\n{format_instructions}`
);

const chain = prompt.pipe(model).pipe(parser);

const result = await chain.invoke({
  article: 'TypeScript 5.5 引入了类型推断的多项改进...',
  format_instructions: parser.getFormatInstructions(),
});

// result 的类型是自动推断的！
console.log(result.title);       // "TypeScript 5.5 发布"
console.log(result.sentiment);   // "positive"
console.log(result.confidence);  // 0.85
console.log(result.key_points);  // ["类型推断改进", "..."]
```

### 概念五：Zod Schema — 类型安全的终极方案

在 TypeScript 项目中，**Zod + withStructuredOutput** 是推荐的组合。它提供完整的类型推断和运行时验证。

```typescript
// src/04-zod-parser.ts
import { z } from 'zod';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

// 1. 用 Zod 定义输出 Schema
const analysisSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral'])
    .describe('文章的情感倾向'),
  score: z.number().min(0).max(10)
    .describe('情感评分，0-10'),
  summary: z.string().max(200)
    .describe('一句话摘要，不超过 200 字'),
  keywords: z.array(z.string()).min(1).max(10)
    .describe('关键词列表，1-10 个'),
  isRecommended: z.boolean()
    .describe('是否推荐阅读'),
});

// 2. 使用 withStructuredOutput 绑定 Schema
const structuredModel = model.withStructuredOutput(analysisSchema);

// 3. 构建链
const prompt = ChatPromptTemplate.fromTemplate(
  '分析以下文章：\n\n{article}'
);
const chain = prompt.pipe(structuredModel);

// 4. 调用 — 返回值自动有 TypeScript 类型
const result = await chain.invoke({
  article: 'Next.js 15 发布，带来了 Turbopack 稳定版...',
});

// 完整的类型推断！
console.log(result.sentiment);     // 类型：'positive' | 'negative' | 'neutral'
console.log(result.score);         // 类型：number
console.log(result.keywords);      // 类型：string[]
console.log(result.isRecommended); // 类型：boolean

// 如果模型输出了不符合 Schema 的数据，Zod 会抛出验证错误
```

> **💡 JsonOutputParser vs StructuredOutputParser vs Zod**
>
> | 特性 | JsonOutputParser | StructuredOutputParser | Zod + withStructuredOutput |
> |------|-----------------|----------------------|---------------------------|
> | 使用难度 | 低 | 中 | 中 |
> | 类型安全 | ❌ | 部分 | ✅ 完整 |
> | 运行时验证 | ❌ | ✅ | ✅ |
> | Schema 复杂度 | 无 | 中等 | 高（嵌套、联合类型等） |
> | 推荐场景 | 快速原型 | 简单结构化 | **生产环境** |

### 概念六：CommaSeparatedListOutputParser — 列表输出

一个专门解析逗号分隔列表的解析器，适合简单的列表提取场景。

```typescript
// src/05-list-parser.ts
import { CommaSeparatedListOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';

const parser = new CommaSeparatedListOutputParser();
const prompt = ChatPromptTemplate.fromTemplate(
  `列出 5 个适合初学者的 {topic} 学习资源。
用逗号分隔，不要编号。{format_instructions}`
);

const chain = prompt.pipe(model).pipe(parser);

const result = await chain.invoke({
  topic: 'TypeScript',
  format_instructions: parser.getFormatInstructions(),
});

console.log(result);
// ["TypeScript 官方手册", "TypeScript Deep Dive", "Total TypeScript", ...]
console.log(Array.isArray(result));  // true
```

### 概念七：自定义输出解析器

当内置解析器不能满足需求时，你可以实现自定义解析器。

```typescript
// src/06-custom-parser.ts
import { BaseOutputParser } from '@langchain/core/output_parsers';

// 自定义解析器：提取代码块
class CodeBlockParser extends BaseOutputParser<string> {
  lc_namespace = ['custom', 'parsers'];

  // 告诉 LLM 如何格式化输出
  getFormatInstructions(): string {
    return '请将代码放在 ```typescript 代码块中。';
  }

  // 解析 LLM 输出
  async parse(text: string): Promise<string> {
    const match = text.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
    if (!match) {
      throw new Error('未找到代码块，请确保代码被包裹在 ```typescript ``` 中');
    }
    return match[1].trim();
  }
}

// 使用自定义解析器
const codeParser = new CodeBlockParser();
const prompt = ChatPromptTemplate.fromTemplate(
  '写一个 TypeScript 函数：{requirement}\n{format_instructions}'
);

const codeChain = prompt.pipe(model).pipe(codeParser);

const code = await codeChain.invoke({
  requirement: '实现一个 debounce 函数',
  format_instructions: codeParser.getFormatInstructions(),
});

console.log(code);
// "function debounce<T extends (...args: any[]) => any>(..."
// 只有代码，没有多余的解释文字
```

---

## 🔨 实战演练

### 练习 1：构建一个结构化简历解析器

**场景描述：** 你正在开发一个招聘平台，需要从自由文本的简历中提取结构化信息。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/resume-parser.ts
import { z } from 'zod';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

// 定义简历 Schema
const resumeSchema = z.object({
  name: z.string().describe('姓名'),
  email: z.string().email().describe('邮箱地址'),
  phone: z.string().optional().describe('电话号码'),
  skills: z.array(z.string()).describe('技术技能列表'),
  experience: z.array(z.object({
    company: z.string().describe('公司名称'),
    role: z.string().describe('职位'),
    duration: z.string().describe('工作时长，如"2年3个月"'),
    highlights: z.array(z.string()).describe('工作亮点'),
  })).describe('工作经历'),
  education: z.object({
    degree: z.string().describe('学位'),
    school: z.string().describe('学校'),
    major: z.string().describe('专业'),
  }).optional().describe('教育背景'),
});

const structuredModel = model.withStructuredOutput(resumeSchema);

const prompt = ChatPromptTemplate.fromTemplate(
  `从以下简历文本中提取结构化信息：

{resume_text}`
);

const chain = prompt.pipe(structuredModel);

// 测试
const result = await chain.invoke({
  resume_text: `
  张三，邮箱 zhangsan@example.com，手机 13800138000。
  
  3年前端开发经验，精通 Vue 3、TypeScript、React，熟悉 Node.js 和 PostgreSQL。
  
  工作经历：
  2023-至今 ABC科技 高级前端工程师
  - 主导公司核心产品的前端架构从 Vue 2 迁移到 Vue 3
  - 性能优化使首屏加载时间减少 60%
  - 搭建组件库，被 5 个团队采用
  
  2021-2023 XYZ互联网 前端开发工程师
  - 参与电商平台前端开发
  - 实现了商品搜索的实时过滤功能
  
  教育背景：浙江大学 计算机科学与技术 本科
  `,
});

console.log('姓名:', result.name);
console.log('技能:', result.skills.join(', '));
console.log('经历数:', result.experience.length);
console.log('最新职位:', result.experience[0].role);
```

**预期输出：**
```
姓名: 张三
技能: Vue 3, TypeScript, React, Node.js, PostgreSQL
经历数: 2
最新职位: 高级前端工程师
```

</details>

### 练习 2：构建一个多输出格式的翻译服务

**场景描述：** 构建一个翻译服务，支持不同格式的输出（纯文本、JSON、带注释的双语对照）。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/translation-service.ts
import { z } from 'zod';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser, JsonOutputParser } from '@langchain/core/output_parsers';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

// 格式 1：纯文本翻译
const textPrompt = ChatPromptTemplate.fromTemplate(
  '将以下中文翻译为英文，只返回翻译结果：\n\n{text}'
);
const textChain = textPrompt.pipe(model).pipe(new StringOutputParser());

// 格式 2：JSON 详细翻译
const detailSchema = z.object({
  original: z.string().describe('原文'),
  translated: z.string().describe('翻译'),
  alternatives: z.array(z.string()).describe('其他可选翻译'),
  notes: z.string().optional().describe('翻译说明'),
});

const detailPrompt = ChatPromptTemplate.fromTemplate(
  '将以下中文翻译为英文，提供详细信息：\n\n{text}'
);
const detailChain = detailPrompt.pipe(model.withStructuredOutput(detailSchema));

// 格式 3：双语对照
const bilingualSchema = z.object({
  sentences: z.array(z.object({
    source: z.string(),
    target: z.string(),
  })).describe('逐句对照翻译'),
});

const bilingualPrompt = ChatPromptTemplate.fromTemplate(
  '将以下中文逐句翻译为英文，返回对照格式：\n\n{text}'
);
const bilingualChain = bilingualPrompt.pipe(model.withStructuredOutput(bilingualSchema));

// 统一翻译服务
type OutputFormat = 'text' | 'detail' | 'bilingual';

async function translate(text: string, format: OutputFormat) {
  switch (format) {
    case 'text': return textChain.invoke({ text });
    case 'detail': return detailChain.invoke({ text });
    case 'bilingual': return bilingualChain.invoke({ text });
  }
}

// 测试
const text = 'TypeScript 是 JavaScript 的超集。它添加了静态类型检查。';

console.log('=== 纯文本 ===');
console.log(await translate(text, 'text'));

console.log('\n=== 详细 ===');
const detail = await translate(text, 'detail') as any;
console.log('翻译:', detail.translated);
console.log('备选:', detail.alternatives);

console.log('\n=== 双语对照 ===');
const bilingual = await translate(text, 'bilingual') as any;
bilingual.sentences.forEach((s: any, i: number) => {
  console.log(`${i + 1}. ${s.source}`);
  console.log(`   → ${s.target}`);
});
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：输出重试机制

当模型输出不符合 Schema 时，自动重试：

```typescript
import { z } from 'zod';
import { ChatAnthropic } from '@langchain/anthropic';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

const schema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
});

// withStructuredOutput 默认内置了重试逻辑
// 如果模型输出的 JSON 无法通过 Zod 验证，会自动重试（最多 3 次）
const structuredModel = model.withStructuredOutput(schema, {
  includeRaw: true,  // 同时返回原始响应
});

const result = await structuredModel.invoke('什么是闭包？');
console.log(result.answer);     // 验证后的结构化数据
console.log(result.raw);        // 原始 AIMessage
```

### 技巧二：部分解析 — 处理不完整输出

```typescript
import { z } from 'zod';

// 使用 .partial() 允许部分字段缺失
const fullSchema = z.object({
  title: z.string(),
  summary: z.string(),
  keywords: z.array(z.string()),
  sentiment: z.enum(['positive', 'negative', 'neutral']),
});

const partialSchema = fullSchema.partial();  // 所有字段变为可选

// 即使模型只返回了部分字段，也不会报错
const partialModel = model.withStructuredOutput(partialSchema);
const result = await partialModel.invoke('分析：...');
// result 可能只有 { title: '...', sentiment: 'positive' }
```

### 技巧三：组合解析器 — 用 RunnableSequence 链接

```typescript
import { RunnableSequence } from '@langchain/core/runnables';
import { JsonOutputParser } from '@langchain/core/output_parsers';

// 先用 JSON 解析器提取原始数据
const jsonParser = new JsonOutputParser();

// 再用 RunnableLambda 做后处理
const postProcessor = RunnableSequence.from([
  jsonParser,
  (data: any) => ({
    ...data,
    // 补充默认值
    sentiment: data.sentiment || 'neutral',
    // 格式化
    keywords: (data.keywords || []).map((k: string) => k.toLowerCase()),
    // 添加时间戳
    analyzedAt: new Date().toISOString(),
  }),
]);
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么不能直接用 JSON.parse() 来解析 LLM 输出？**

> A：因为 LLM 的输出可能不是合法的 JSON——它可能包含 markdown 代码块标记、前后的解释文字、或者格式不正确的字段。输出解析器会做清洗和容错处理，比裸 JSON.parse() 可靠得多。

**Q2：withStructuredOutput 和 JsonOutputParser 有什么区别？**

> A：`withStructuredOutput` 是在模型层面约束输出格式，底层可能使用工具调用（tool_use）来强制模型输出特定结构的 JSON，然后用 Zod 做运行时验证。`JsonOutputParser` 只是在提示词中要求模型输出 JSON，然后在输出端做解析，可靠性稍低。

**Q3：自定义解析器什么时候用？**

> A：当内置解析器无法满足需求时——比如你需要提取代码块、解析 Markdown 表格、处理特殊格式的输出等。自定义解析器只需要继承 `BaseOutputParser` 并实现 `parse()` 和 `getFormatInstructions()` 两个方法。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `OutputParserException: Failed to parse JSON` | 模型输出了非法 JSON | 使用 `withStructuredOutput` 替代，或在提示词中强调 JSON 格式 |
| Zod 验证错误：`expected number, received string` | 模型将数字输出为字符串 | 在 Schema 中用 `.transform()` 做类型转换，或在描述中明确类型 |
| `格式说明太长，占用大量 Token` | Schema 字段过多 | 精简 `.describe()` 描述，减少不必要的字段 |

---

## 📝 本章小结

- ✅ **StringOutputParser** — 最基础，提取纯文本
- ✅ **JsonOutputParser** — 输出 JSON 格式
- ✅ **StructuredOutputParser** — Schema 约束 + 验证
- ✅ **Zod + withStructuredOutput** — 类型安全的终极方案（生产推荐）
- ✅ **自定义解析器** — 继承 BaseOutputParser，处理特殊格式
- ✅ **重试机制** — withStructuredOutput 内置自动重试

## ➡️ 下一章预告

> 在下一章中，我们将学习 LangChain 的文档加载器——从各种数据源（PDF、网页、数据库）加载数据，为构建 RAG 系统打下基础。
> [第4章：文档加载器](./04-document-loaders.md)
