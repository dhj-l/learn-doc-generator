# 第1章：Function Calling 基础 — 工具调用的原理

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Function Calling 的工作原理** — LLM 如何决定调用哪个工具
- **掌握工具定义的基本格式** — JSON Schema 描述工具
- **实现基础的 Function Calling 流程** — 定义工具→LLM 决策→执行→反馈

## 💡 核心概念

### 概念一：Function Calling 是什么？

**生活类比：** 你是一个项目经理（LLM），手下有一群工程师（工具）。你说「帮我查一下数据库里有多少用户」，工程师去查了，把结果报告给你。

```
传统 LLM：
  用户: "北京今天多少度？"
  LLM:  "我无法获取实时天气信息"  ← 只能靠训练数据回答

有 Function Calling 的 LLM：
  用户: "北京今天多少度？"
  LLM:  → 决定调用 get_weather(city="北京")
  系统:  → 执行工具，返回 "25°C，晴"
  LLM:  "北京今天 25 度，天气晴朗。"  ← 基于实时数据回答
```

### 概念二：工具定义

```typescript
// 工具用 JSON Schema 描述
const weatherTool = {
  name: 'get_weather',                              // 工具名称
  description: '获取指定城市的当前天气信息',           // 工具描述（LLM 靠这个决定何时调用）
  input_schema: {                                    // 参数 Schema
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: '城市名称，如 "北京"、"上海"',
      },
      unit: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: '温度单位',
        default: 'celsius',
      },
    },
    required: ['city'],                              // 必填参数
  },
};
```

### 概念三：完整调用流程

```
┌─────────────────────────────────────────────────────┐
│ Step 1: 用户发送消息 + 工具定义                        │
│   messages: [{ role: "user", content: "北京天气？" }]  │
│   tools: [get_weather, ...]                          │
└───────────────────────┬─────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ Step 2: LLM 分析并决策                                │
│   LLM 判断需要调用 get_weather                         │
│   返回: tool_use block { name: "get_weather",        │
│           input: { city: "北京" } }                   │
└───────────────────────┬─────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ Step 3: 你的代码执行工具                               │
│   const result = get_weather("北京")                  │
│   result = "25°C，晴"                                │
└───────────────────────┬─────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ Step 4: 将结果发回 LLM                                │
│   messages: [...,                                     │
│     { role: "assistant", content: [tool_use block] },│
│     { role: "user", content: [tool_result] }         │
│   ]                                                  │
└───────────────────────┬─────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ Step 5: LLM 生成最终回答                              │
│   "北京今天 25 度，天气晴朗。"                         │
└─────────────────────────────────────────────────────┘
```

### 概念四：基础实现（Claude）

```typescript
// src/claude-tool-use.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// 1. 定义工具
const tools: Anthropic.Tool[] = [
  {
    name: 'get_weather',
    description: '获取指定城市的当前天气',
    input_schema: {
      type: 'object' as const,
      properties: {
        city: { type: 'string', description: '城市名称' },
      },
      required: ['city'],
    },
  },
  {
    name: 'calculate',
    description: '执行数学计算',
    input_schema: {
      type: 'object' as const,
      properties: {
        expression: { type: 'string', description: '数学表达式' },
      },
      required: ['expression'],
    },
  },
];

// 2. 工具执行器
function executeTool(name: string, input: any): string {
  switch (name) {
    case 'get_weather':
      return `${input.city}: 25°C，晴，湿度 45%`;
    case 'calculate':
      try { return String(Function('"use strict";return (' + input.expression + ')')()); }
      catch { return '计算错误'; }
    default:
      return `未知工具: ${name}`;
  }
}

// 3. 带工具调用的对话
async function chatWithTools(userMessage: string) {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 1024,
      tools,
      messages,
    });

    // 如果模型使用了工具
    if (response.stop_reason === 'tool_use') {
      const toolUseBlock = response.content.find(b => b.type === 'tool_use');
      if (toolUseBlock && toolUseBlock.type === 'tool_use') {
        console.log(`🔧 调用工具: ${toolUseBlock.name}(${JSON.stringify(toolUseBlock.input)})`);

        const result = executeTool(toolUseBlock.name, toolUseBlock.input);
        console.log(`📋 结果: ${result}`);

        // 将工具结果反馈给模型
        messages.push({ role: 'assistant', content: response.content });
        messages.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: toolUseBlock.id,
            content: result,
          }],
        });
        continue;
      }
    }

    // 模型生成了最终回复
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock && textBlock.type === 'text' ? textBlock.text : '';
  }
}

// 使用
const answer = await chatWithTools('北京今天多少度？另外算一下 23 × 47');
console.log('\n💬 回答:', answer);
```

```
预期输出：
🔧 调用工具: get_weather({"city":"北京"})
📋 结果: 北京: 25°C，晴，湿度 45%
🔧 调用工具: calculate({"expression":"23 * 47"})
📋 结果: 1081

💬 回答: 北京今天 25 度，天气晴朗，湿度 45%。另外 23 × 47 = 1081。
```

---

## 📝 本章小结

- ✅ **Function Calling** — LLM 决定调用工具，你的代码执行工具
- ✅ **工具定义** — 用 JSON Schema 描述工具的名称、描述和参数
- ✅ **调用流程** — 用户消息 → LLM 决策 → 执行工具 → 反馈结果 → 最终回答
- ✅ **循环处理** — 一次请求可能触发多次工具调用

## ➡️ 下一章预告

> [第2章：Claude Tool Use](./02-claude-tool-use.md) — Claude API 的 Tool Use 深入使用。
