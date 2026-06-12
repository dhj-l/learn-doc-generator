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

**预期输出：**
```
🔧 调用工具: get_weather({"city":"北京"})
📋 结果: 北京: 25°C，晴，湿度 45%
🔧 调用工具: calculate({"expression":"23 * 47"})
📋 结果: 1081

💬 回答: 北京今天 25 度，天气晴朗，湿度 45%。另外 23 × 47 = 1081。
```

## 🔨 实战演练

**场景描述：**
你正在为公司开发一个内部智能助手，需要整合多个数据源。用户可以通过自然语言查询员工信息、查看项目进度和获取天气信息。你需要实现一个基础的多工具调用流程。

**你的任务：**
1. 定义一个 `query_employee` 工具，根据员工姓名或工号查询基本信息（部门、职位、邮箱）
2. 定义一个 `get_project_status` 工具，根据项目名称查询当前进度和截止日期
3. 实现完整的 Function Calling 循环，让 LLM 能够根据用户请求自动选择合适的工具

<details>
<summary>🧑‍💻 先自己实现，再展开看参考答案</summary>

```typescript
// 工具定义
const tools: Anthropic.Tool[] = [
  {
    name: 'query_employee',
    description: '查询员工基本信息。根据姓名或工号查询部门、职位、邮箱等。',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '员工姓名' },
        employee_id: { type: 'string', description: '员工工号' },
      },
    },
  },
  {
    name: 'get_project_status',
    description: '查询项目当前进度和截止日期。当用户询问项目状态时使用。',
    input_schema: {
      type: 'object',
      properties: {
        project_name: { type: 'string', description: '项目名称' },
      },
      required: ['project_name'],
    },
  },
];

// 模拟数据
const employees = {
  '张三': { department: '技术部', title: '高级工程师', email: 'zhangsan@company.com' },
  '李四': { department: '产品部', title: '产品经理', email: 'lisi@company.com' },
};

const projects = {
  'AI平台': { progress: '75%', deadline: '2025-06-30', status: '进行中' },
  '数据中台': { progress: '40%', deadline: '2025-09-15', status: '进行中' },
};

// 工具执行器
function executeTool(name: string, input: any): string {
  switch (name) {
    case 'query_employee':
      const emp = employees[input.name] ||
        Object.values(employees).find(e => e.email?.includes(input.employee_id || ''));
      if (!emp) return `未找到员工: ${input.name || input.employee_id}`;
      return JSON.stringify(emp);
    case 'get_project_status':
      const proj = projects[input.project_name];
      if (!proj) return `未找到项目: ${input.project_name}`;
      return JSON.stringify(proj);
    default:
      return `未知工具: ${name}`;
  }
}
```

将上面的工具定义和 `executeTool` 函数整合到第一章的 `chatWithTools` 循环中，即可完成一个可用于查询员工和项目信息的多工具助手。

</details>

---

## ⚡ 进阶技巧

### 技巧一：工具调用超时处理
工具调用可能因为网络延迟或服务不可用而超时。建议为每个工具调用设置超时：

```typescript
async function executeToolWithTimeout(name: string, input: any, timeoutMs = 5000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`工具 "${name}" 执行超时 (${timeoutMs}ms)`)), timeoutMs)
  );
  const execution = Promise.resolve(executeTool(name, input));
  return Promise.race([execution, timeout]);
}

// 使用
try {
  const result = await executeToolWithTimeout('get_weather', { city: '北京' });
  console.log('结果:', result);
} catch (error) {
  console.error('工具执行失败:', (error as Error).message);
}
```

**预期输出：**
```
结果: 北京: 25°C，晴，湿度 45%
```

### 技巧二：工具执行结果缓存
对于重复性查询（如天气、汇率），缓存可以大幅减少 API 调用和延迟：

```typescript
const toolCache = new Map<string, { data: string; time: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

function cachedExecute(name: string, input: any): string {
  const key = `${name}:${JSON.stringify(input)}`;
  const cached = toolCache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    console.log(`📦 缓存命中: ${key}`);
    return cached.data;
  }
  const result = executeTool(name, input);
  toolCache.set(key, { data: result, time: Date.now() });
  return result;
}
```

### 技巧三：调试模式 — 打印完整调用链
开发时开启调试模式可以看清每次调用的细节：

```typescript
const DEBUG = true;

function logToolCall(phase: string, name: string, data: any) {
  if (DEBUG) {
    console.log(`[DEBUG] ${phase} | ${name} | ${JSON.stringify(data)}`);
  }
}

// 使用
logToolCall('请求参数', 'get_weather', { city: '北京' });
const result = executeTool('get_weather', { city: '北京' });
logToolCall('执行结果', 'get_weather', result);
```

---

## 🧠 知识检查点

### Q1: Function Calling 中，LLM 的角色是什么？

<details>
<summary>点击展开答案</summary>

LLM 的角色是**决策者**而非执行者。它根据用户的请求和工具定义，决定「是否需要调用工具」「调用哪个工具」「传入什么参数」。实际的工具执行由开发者的代码完成，执行结果再反馈给 LLM 生成最终回答。

</details>

### Q2: 如果 LLM 在一次响应中返回了两个 tool_use block，这意味着什么？

<details>
<summary>点击展开答案</summary>

这意味着 LLM 判断需要同时调用两个工具来完成用户的请求。这两个工具调用是**并行**的，没有依赖关系。开发者应当同时执行这两个工具（例如使用 `Promise.all`），然后一次性将两个结果返回给 LLM。

</details>

### Q3: 工具定义中的 `description` 字段为什么很重要？

<details>
<summary>点击展开答案</summary>

`description` 是 LLM 决定「何时使用该工具」的主要依据。一个好的描述应包含：工具的功能、何时使用、何时不使用、以及参数的说明。描述越清晰，LLM 越能准确判断何时调用该工具，避免误调用或漏调用。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 工具描述太模糊（如只用「查询」二字） | LLM 无法准确判断何时调用该工具，导致错过调用或错误调用 | 明确描述工具的功能、适用场景和限制，例如「查询用户信息。当用户询问个人信息时使用。不要用于订单查询。」 |
| 忘记将工具结果返回给 LLM | 工具执行完成后，结果必须作为新的消息发送给 LLM，否则 LLM 无法生成基于工具结果的自然语言回答 | 将 tool_result 以 `{ role: 'user', content: [{ type: 'tool_result', tool_use_id, content }] }` 格式追加到 messages 数组 |
| 工具参数类型不匹配 | LLM 生成的参数类型与 Schema 定义不一致，导致执行报错 | 在工具执行器中加入类型校验和转换逻辑，并对参数进行容错处理（如 `String(input.city)` 确保字符串类型） |

---

## 📝 本章小结

- ✅ **Function Calling** — LLM 决定调用工具，你的代码执行工具
- ✅ **工具定义** — 用 JSON Schema 描述工具的名称、描述和参数
- ✅ **调用流程** — 用户消息 → LLM 决策 → 执行工具 → 反馈结果 → 最终回答
- ✅ **循环处理** — 一次请求可能触发多次工具调用

## ➡️ 下一章预告

> [第2章：Claude Tool Use](./02-claude-tool-use.md) — Claude API 的 Tool Use 深入使用。
