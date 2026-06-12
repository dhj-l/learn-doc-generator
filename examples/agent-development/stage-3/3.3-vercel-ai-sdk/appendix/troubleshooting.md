# Vercel AI SDK 常见错误排错指南

## 1. 模块找不到 `ai` 或 `@ai-sdk/xxx`

**错误信息：**
```
Cannot find module 'ai' or '@ai-sdk/anthropic'
```

**解决方案：**
```bash
npm install ai @ai-sdk/anthropic
# 或其他需要的 provider
npm install @ai-sdk/openai @ai-sdk/google
```

---

## 2. useChat 无法连接后端

**错误信息：** 前端发送消息后无反应，或报网络错误。

**解决方案：**
```typescript
// 检查 1：API Route 是否存在
// app/api/chat/route.ts（文件路径必须正确）

// 检查 2：是否返回了正确的流式响应
export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({ model, messages });
  return result.toDataStreamResponse();  // ✅ 必须用这个
  // return Response.json({ text });     // ❌ 这样 useChat 无法解析
}

// 检查 3：自定义 API 路径
const { messages } = useChat({ api: '/api/v2/chat' });
```

---

## 3. 流式输出中断或无输出

**问题：** 流式输出中途停止，或完全无输出。

**解决方案：**
```typescript
// 确保使用 toDataStreamResponse() 而非手动构造 Response
return result.toDataStreamResponse();  // ✅
// return new Response(result.textStream);  // ❌ 缺少协议格式

// 确保没有在中间件中消费了流
// 流只能被消费一次！
const result = streamText({ model, messages });
// const text = await result.text;  // ❌ 如果先 await text，流就没了
return result.toDataStreamResponse();  // ✅ 直接返回流
```

---

## 4. 结构化输出验证失败

**错误信息：** `generateObject` 抛出 Schema 验证错误。

**解决方案：**
```typescript
// 在 describe 中明确约束
const schema = z.object({
  score: z.number().min(0).max(10)
    .describe('0 到 10 之间的整数'),  // ← 明确范围和类型
  status: z.enum(['active', 'inactive'])
    .describe('只能是 active 或 inactive'),  // ← 明确枚举值
});

// 使用 errorType 参数控制错误行为
const { object } = await generateObject({
  model,
  schema,
  prompt,
  mode: 'tool',  // 使用工具调用模式，更可靠
});
```

---

## 5. 工具调用不触发

**问题：** 模型回答了问题但没有调用工具。

**解决方案：**
```typescript
// 1. 工具描述要清晰
const myTool = tool({
  description: '当用户询问天气时，必须使用此工具查询',  // ← 明确何时使用
  // ...
});

// 2. 系统提示中强调工具使用
const result = await generateText({
  model,
  system: '你必须使用提供的工具来回答问题，不要凭记忆回答。',
  tools: { myTool },
  maxSteps: 3,
});

// 3. 检查 maxSteps 是否 >= 1
// maxSteps: 1 是默认值，只允许一次工具调用
```

---

## 6. 多步工具调用中断

**问题：** `maxSteps > 1` 但模型只调了一次工具。

**解决方案：**
```typescript
// 确保 maxSteps 足够大
const result = await generateText({
  model,
  prompt: '查天气并换算温度',
  tools: { getWeather, convertTemp },
  maxSteps: 5,  // 至少 3 才能完成两步工具调用
});
```

---

## 7. TypeScript 类型错误

**错误信息：** 消息类型不兼容、model 类型不匹配等。

**解决方案：**
```typescript
import type { Message } from 'ai';

// 使用正确的消息类型
const messages: Message[] = [];

// model 使用 Provider 返回的类型
const model = anthropic('claude-sonnet-4-5-20241022');
// 类型由 Provider 自动推断，不要手动 cast
```

---

## 8. API Key 未生效

**错误信息：** `AuthenticationError` 或 401。

**解决方案：**
```bash
# 确认环境变量名正确
# Anthropic: ANTHROPIC_API_KEY
# OpenAI:    OPENAI_API_KEY
# Google:    GOOGLE_GENERATIVE_AI_API_KEY

# .env.local
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# 确认文件名是 .env.local（不是 .env）
# 确认重启了开发服务器
```

---

## 9. useChat 消息丢失

**问题：** 刷新页面后聊天记录消失。

**解决方案：**
```typescript
// 使用 initialMessages 从 localStorage 恢复
const { messages, sendMessage, setMessages } = useChat({
  initialMessages: typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('chat') || '[]')
    : [],
  onFinish: (message) => {
    localStorage.setItem('chat', JSON.stringify([...messages, message]));
  },
});

// 清空
function clearChat() {
  setMessages([]);
  localStorage.removeItem('chat');
}
```

---

## 10. 流式中间件不生效

**问题：** `wrapLanguageModel` 的中间件没有执行。

**解决方案：**
```typescript
import { wrapLanguageModel } from 'ai';

// 确保使用包装后的模型
const wrappedModel = wrapLanguageModel({
  model: anthropic('claude-sonnet-4-5-20241022'),
  middleware: { /* ... */ },
});

// 必须传入 wrappedModel，不是原始 model
const result = streamText({ model: wrappedModel, messages });  // ✅
```

---

## 11. 前端 build 报错：Server Component 引用客户端 API

**错误信息：** `useChat is not exported from 'ai'` 或类似。

**解决方案：**
```tsx
// ✅ 客户端组件必须加 'use client'
'use client';
import { useChat } from '@ai-sdk/react';

// ✅ 后端不需要 'use client'
// app/api/chat/route.ts
import { streamText } from 'ai';
```

---

## 12. generateObject 返回部分数据

**问题：** `object` 中某些字段是 `undefined`。

**解决方案：**
```typescript
// 确保所有字段在 Schema 中都不是 optional
const schema = z.object({
  name: z.string(),          // 必填
  email: z.string().optional(),  // 可选 → 可能是 undefined
});

// 如果某些字段是可选的，在使用前检查
if (result.object.email) {
  console.log(result.object.email);
}

## 13. 流式响应在移动端出现断续
**现象：** 移动设备上 SSE 流式响应频繁中断
**原因：** 移动网络切换（如 4G/Wi-Fi 切换）导致连接断开
**方案：** 实现自动重连机制，在 useChat 中配置 onError 回调触发重连

## 14. 多步工具调用时 maxSteps 未生效
**现象：** 设置 maxSteps=3 但模型只调用了一次工具就停止了
**原因：** 模型判断已经得到了足够的回答，不需要继续调用工具
**方案：** 在系统提示中明确要求模型逐步使用工具，或降低模型温度值

## 15. generateObject 输出的 JSON 不符合预期 Schema
**现象：** 生成的对象缺少某些必需字段
**原因：** LLM 没有严格遵循 Zod Schema，尤其是在复杂嵌套对象时
**方案：** 使用 z.object() 明确每个字段，给字段添加 .describe() 说明，必要时设置 .strict() 禁止额外字段
```
