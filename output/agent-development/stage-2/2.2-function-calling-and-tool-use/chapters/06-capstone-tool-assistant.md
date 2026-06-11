# 第6章：综合实战 — 多工具智能助手

> 预计学习时间：120-150 分钟

## 🎯 本章目标

构建一个具备 5+ 工具的智能助手。

---

## 🔨 完整实现

```typescript
// src/tool-assistant.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// ====== 工具定义 ======

const tools: Anthropic.Tool[] = [
  {
    name: 'search_web',
    description: '搜索互联网获取最新信息',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: '搜索关键词' } },
      required: ['query'],
    },
  },
  {
    name: 'calculate',
    description: '执行数学计算',
    input_schema: {
      type: 'object',
      properties: { expression: { type: 'string', description: '数学表达式' } },
      required: ['expression'],
    },
  },
  {
    name: 'get_weather',
    description: '获取城市天气',
    input_schema: {
      type: 'object',
      properties: { city: { type: 'string', description: '城市名' } },
      required: ['city'],
    },
  },
  {
    name: 'translate',
    description: '翻译文本',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        from: { type: 'string', description: '源语言' },
        to: { type: 'string', description: '目标语言' },
      },
      required: ['text', 'to'],
    },
  },
  {
    name: 'create_reminder',
    description: '创建提醒事项',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        time: { type: 'string', description: '时间（ISO 格式或自然语言）' },
      },
      required: ['title', 'time'],
    },
  },
];

// ====== 工具执行器 ======

function executeTool(name: string, input: any): string {
  switch (name) {
    case 'search_web':
      return `[搜索结果] 关于 "${input.query}" 的最新信息：模拟搜索结果...`;
    case 'calculate':
      try { return String(Function('"use strict";return (' + input.expression + ')')()); }
      catch { return '计算错误'; }
    case 'get_weather':
      return `${input.city}: 25°C，晴，湿度 45%`;
    case 'translate':
      return `[${input.from || '自动检测'} → ${input.to}] ${input.text} 的翻译结果`;
    case 'create_reminder':
      return `✅ 提醒已创建: "${input.title}" @ ${input.time}`;
    default:
      return `未知工具: ${name}`;
  }
}

// ====== Agent 循环 ======

async function assistant(userMessage: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  const systemPrompt = `你是一个全能助手，可以帮助用户查询信息、计算、翻译和设置提醒。
根据用户的需求选择合适的工具。如果不需要工具，直接回答。
使用中文回复。`;

  for (let i = 0; i < 10; i++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages,
    });

    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = executeTool(block.name, block.input);
          console.log(`🔧 ${block.name}: ${result}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock && textBlock.type === 'text' ? textBlock.text : '';
  }

  return '达到最大迭代次数';
}

// ====== 使用 ======
async function main() {
  console.log('💬:', await assistant('北京今天多少度？帮我把温度换算成华氏度'));
  console.log('\n💬:', await assistant('提醒我明天下午3点开会'));
}

main();
```

---

## 📝 本章小结

- ✅ **5 个工具** — 搜索、计算、天气、翻译、提醒
- ✅ **工具循环** — 自动处理多轮工具调用
- ✅ **并行调用** — Claude 可能一次请求多个工具

## ➡️ 下一步

查看附录，然后进入 [2.3 记忆系统](../../2.3-memory-system/README.md)
