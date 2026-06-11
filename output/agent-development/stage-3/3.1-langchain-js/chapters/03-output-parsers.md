# 第3章：输出解析器 — 结构化 LLM 输出

> 预计学习时间：70-90 分钟

## 💡 输出解析器类型

```typescript
import { StringOutputParser } from '@langchain/core/output_parsers';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { StructuredOutputParser } from 'langchain/output_parsers';

// 1. StringOutputParser — 最简单
const stringParser = new StringOutputParser();

// 2. JsonOutputParser — JSON 输出
const jsonParser = new JsonOutputParser();

// 3. StructuredOutputParser — 用 Schema 定义结构
const schema = StructuredOutputParser.fromNamesAndDescriptions({
  title: '文章标题',
  summary: '一句话摘要',
  tags: '标签列表',
});

const prompt = ChatPromptTemplate.fromTemplate(
  `分析以下文本：{text}\n{format_instructions}`
);

const chain = prompt.pipe(model).pipe(schema);
const result = await chain.invoke({
  text: '...',
  format_instructions: schema.getFormatInstructions(),
});
// result: { title: '...', summary: '...', tags: '...' }
```

### Zod Schema 验证

```typescript
import { z } from 'zod';
import { StructuredOutputParser } from 'langchain/output_parsers';

const zodSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  confidence: z.number().min(0).max(1),
  keywords: z.array(z.string()),
});

const parser = StructuredOutputParser.fromZodSchema(zodSchema);
```

---

## 📝 本章小结

- ✅ **StringOutputParser** — 纯文本输出
- ✅ **JsonOutputParser** — JSON 格式输出
- ✅ **StructuredOutputParser** — 用 Schema 定义结构
- ✅ **Zod 验证** — 类型安全的输出验证
