# OpenAI API 速查表

---

## 🚀 基础调用

```typescript
import OpenAI from 'openai';
const client = new OpenAI();

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  max_tokens: 1024,
  messages: [{ role: 'user', content: '你好' }],
});
```

## 🌊 流式输出

```typescript
const stream = await client.chat.completions.create({
  model: 'gpt-4o',
  stream: true,
  messages: [...],
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

## 📊 结构化输出

```typescript
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const Schema = z.object({ name: z.string(), score: z.number() });

const response = await client.beta.chat.completions.parse({
  model: 'gpt-4o-2024-08-06',
  messages: [...],
  response_format: zodResponseFormat(Schema, 'result'),
});
const data = response.choices[0].message.parsed;
```

## 🇨🇳 国产模型配置

| 模型 | baseURL | 环境变量 |
|------|---------|----------|
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `DASHSCOPE_API_KEY` |
| DeepSeek | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEY` |
| GLM-4 | `https://open.bigmodel.cn/api/paas/v4` | `ZHIPU_API_KEY` |
| Kimi | `https://api.moonshot.cn/v1` | `MOONSHOT_API_KEY` |

## ⚙️ 常用参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `model` | string | 模型 ID |
| `max_tokens` | number | 最大输出 Token |
| `temperature` | number | 0-2，随机性 |
| `stream` | boolean | 是否流式 |
| `response_format` | object | JSON 输出控制 |
| `messages` | array | 消息数组 |
