# 第3章：结构化输出 — 让模型输出稳定的 JSON

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 JSON Mode 获取格式化输出** — 让模型稳定输出 JSON
- **使用 Structured Outputs 保证 Schema 遵循** — 输出严格匹配定义的 Schema
- **用 Zod 验证输出数据** — TypeScript 类型安全的结构化输出

## 📋 前置知识

> 建议先完成：[第1章](./01-chat-completions.md)

---

## 💡 核心概念

### 概念一：为什么需要结构化输出？

LLM 的默认输出是自由文本，但在程序中处理自由文本非常困难：

```
❌ 自由文本："分析结果：用户满意度为 85 分，主要问题是..."
   → 需要复杂的正则表达式解析，容易出错

✅ JSON 输出：{"satisfaction": 85, "issues": [...]}
   → 直接 JSON.parse()，类型安全
```

### 概念二：JSON Mode

```typescript
// src/01-json-mode.ts
import OpenAI from 'openai';

const client = new OpenAI();

async function getJsonOutput() {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1000,
    response_format: { type: 'json_object' },  // 启用 JSON Mode
    messages: [
      {
        role: 'system',
        content: '你是一个数据分析助手。请始终以 JSON 格式输出结果。',
      },
      {
        role: 'user',
        content: '分析以下数据并输出统计结果：用户反馈评分 [4, 5, 3, 5, 4, 2, 5, 4, 3, 4]',
      },
    ],
  });

  const jsonStr = response.choices[0].message.content || '{}';
  const data = JSON.parse(jsonStr);
  console.log('解析结果:', JSON.stringify(data, null, 2));
}

getJsonOutput();
```

```
预期输出：
解析结果: {
  "count": 10,
  "average": 3.9,
  "median": 4,
  "distribution": {
    "5": 3,
    "4": 4,
    "3": 2,
    "2": 1
  },
  "summary": "平均评分 3.9 分，好评率 70%"
}
```

### 概念三：Structured Outputs（结构化输出）

JSON Mode 只保证输出是 JSON，但不保证结构。Structured Outputs 更进一步——**严格遵循你定义的 JSON Schema**：

```typescript
// src/02-structured-outputs.ts
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const client = new OpenAI();

// 用 Zod 定义输出 Schema
const CodeReviewSchema = z.object({
  summary: z.string().describe('一句话总结代码质量'),
  score: z.number().min(1).max(10).describe('代码质量评分'),
  issues: z.array(z.object({
    severity: z.enum(['high', 'medium', 'low']),
    line: z.number().optional(),
    title: z.string(),
    description: z.string(),
    fix: z.string(),
  })).describe('发现的问题列表'),
  highlights: z.array(z.string()).describe('代码亮点'),
});

type CodeReview = z.infer<typeof CodeReviewSchema>;

async function structuredCodeReview(code: string): Promise<CodeReview> {
  const response = await client.beta.chat.completions.parse({
    model: 'gpt-4o-2024-08-06',
    max_tokens: 2000,
    messages: [
      { role: 'system', content: '你是一个代码审查专家。' },
      { role: 'user', content: `审查以下代码：\n\`\`\`typescript\n${code}\n\`\`\`` },
    ],
    response_format: zodResponseFormat(CodeReviewSchema, 'code_review'),
  });

  // parsed 自动解析为 TypeScript 类型
  return response.choices[0].message.parsed!;
}

// 使用
const review = await structuredCodeReview(`
function fetchUser(id) {
  const res = fetch('/api/users/' + id);
  return res.json();
}
`);

console.log('评分:', review.score, '/10');
console.log('问题数:', review.issues.length);
review.issues.forEach(issue => {
  console.log(`  ${issue.severity === 'high' ? '🔴' : '🟡'} ${issue.title}`);
});
```

```
预期输出：
评分: 3 /10
问题数: 3
  🔴 缺少 async/await
  🔴 缺少错误处理
  🟡 缺少类型注解
```

### 概念四：JSON Schema 直接定义

```typescript
// src/03-json-schema.ts
import OpenAI from 'openai';

const client = new OpenAI();

const schema = {
  type: 'json_schema',
  json_schema: {
    name: 'product_info',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        price: { type: 'number' },
        currency: { type: 'string', enum: ['CNY', 'USD', 'EUR'] },
        categories: { type: 'array', items: { type: 'string' } },
        inStock: { type: 'boolean' },
      },
      required: ['name', 'price', 'currency', 'categories', 'inStock'],
      additionalProperties: false,
    },
  },
};

async function extractProductInfo(text: string) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o-2024-08-06',
    max_tokens: 500,
    messages: [
      { role: 'system', content: '从文本中提取产品信息。' },
      { role: 'user', content: text },
    ],
    response_format: schema as any,
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}

const product = await extractProductInfo(
  'Apple MacBook Pro 14寸，售价 14999 元，属于笔记本电脑和电子产品类别，目前有货'
);
console.log(product);
// { name: "MacBook Pro 14寸", price: 14999, currency: "CNY", categories: ["笔记本电脑", "电子产品"], inStock: true }
```

---

## 🔨 实战演练

### 练习：构建一个结构化数据提取管线

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

const client = new OpenAI();

// 定义通用的实体提取 Schema
const EntitySchema = z.object({
  entities: z.array(z.object({
    name: z.string(),
    type: z.enum(['person', 'company', 'product', 'location', 'date', 'number']),
    value: z.string(),
    confidence: z.number().min(0).max(1),
  })),
  relations: z.array(z.object({
    source: z.string(),
    target: z.string(),
    type: z.string(),
  })),
});

async function extractEntities(text: string) {
  const response = await client.beta.chat.completions.parse({
    model: 'gpt-4o-2024-08-06',
    max_tokens: 1000,
    messages: [
      {
        role: 'system',
        content: `从文本中提取实体和关系。
实体类型：person（人名）、company（公司）、product（产品）、location（地点）、date（日期）、number（数字）
关系：实体之间的关联关系。`,
      },
      { role: 'user', content: text },
    ],
    response_format: zodResponseFormat(EntitySchema, 'entities'),
  });

  return response.choices[0].message.parsed;
}

// 使用
const result = await extractEntities(
  '2024年3月，张三创立了北京智源科技有限公司，推出了AI助手"小智"，融资5000万元。'
);
console.log('实体:', result?.entities.map(e => `${e.name}(${e.type})`).join(', '));
console.log('关系:', result?.relations.map(r => `${r.source} → ${r.type} → ${r.target}`).join(', '));
```

</details>

---

## 📝 本章小结

- ✅ **JSON Mode** — 保证输出是 JSON，但不保证结构
- ✅ **Structured Outputs** — 严格遵循 JSON Schema，类型安全
- ✅ **Zod 验证** — TypeScript 类型推断 + 运行时验证
- ✅ **应用场景** — 数据提取、分类、表单填写等需要结构化结果的任务

## ➡️ 下一章预告

> [第4章：多模型网关设计](./04-multi-model-gateway.md) — 设计统一的多模型 API 网关。
