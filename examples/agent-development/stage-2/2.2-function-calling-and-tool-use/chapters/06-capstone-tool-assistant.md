# 第6章：综合实战 — 多工具智能助手

> 预计学习时间：120-150 分钟

## 🎯 本章目标

构建一个具备 5+ 工具的智能助手。

## 📋 前置知识

> 建议先完成：[第5章：并行与顺序工具调用](./05-parallel-tool-calls.md)

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

**预期输出：**
```
🔧 get_weather: 北京: 25°C，晴，湿度 45%
🔧 calculate: 77
💬: 北京今天 25 度，天气晴朗，湿度 45%。换算成华氏度为 77°F。

🔧 create_reminder: ✅ 提醒已创建: "明天下午3点开会" @ 2025-04-15T15:00:00
💬: 已为您创建提醒「明天下午3点开会」，到时候我会提醒您！
```

---

## ⚡ 进阶技巧

### 技巧一：为助手添加 System Prompt 策略
一个好的 System Prompt 能显著提升助手调用工具的准确性：

```typescript
const systemPrompt = `你是一个全能智能助手，拥有搜索、计算、天气查询、翻译和提醒功能。

工具使用策略：
1. **信息优先** — 用户询问实时信息时，优先调用搜索或天气工具，不要凭记忆回答
2. **组合使用** — 如果用户需求复杂，可以组合多个工具完成（如先查天气再换算温度）
3. **逐步拆解** — 遇到复杂任务时，拆解成多个步骤，每次调用一个工具
4. **确认意图** — 如果用户请求不明确，先问清楚再调用工具
5. **错误处理** — 如果工具返回错误，向用户解释并提供替代方案

回复语言：使用中文回复。
`;
```

### 技巧二：添加日志和监控
在生产环境中，完整的日志是排查问题的关键：

```typescript
class ToolLogger {
  private logs: Array<{
    timestamp: string;
    type: 'call' | 'result' | 'error';
    tool: string;
    details: any;
  }> = [];

  logCall(tool: string, input: any) {
    this.logs.push({
      timestamp: new Date().toISOString(),
      type: 'call',
      tool,
      details: input,
    });
  }

  logResult(tool: string, result: any) {
    this.logs.push({
      timestamp: new Date().toISOString(),
      type: 'result',
      tool,
      details: result,
    });
  }

  logError(tool: string, error: any) {
    this.logs.push({
      timestamp: new Date().toISOString(),
      type: 'error',
      tool,
      details: { message: (error as Error).message, stack: (error as Error).stack },
    });
  }

  getSummary(): string {
    const calls = this.logs.filter(l => l.type === 'call').length;
    const errors = this.logs.filter(l => l.type === 'error').length;
    return `📊 工具调用统计: 总调用 ${calls} 次, 失败 ${errors} 次`;
  }

  exportLogs() {
    return JSON.stringify(this.logs, null, 2);
  }
}

// 在助手中使用
const logger = new ToolLogger();
logger.logCall(block.name, block.input);
const result = executeTool(block.name, block.input);
logger.logResult(block.name, result);
```

### 技巧三：模块化工具注册
当工具数量增长到 10+ 时，使用注册模式管理工具：

```typescript
class ToolRegistry {
  private tools: Map<string, { definition: Anthropic.Tool; handler: (input: any) => string }> = new Map();

  register(definition: Anthropic.Tool, handler: (input: any) => string) {
    this.tools.set(definition.name, { definition, handler });
  }

  getDefinitions(): Anthropic.Tool[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  execute(name: string, input: any): string {
    const tool = this.tools.get(name);
    if (!tool) return `错误: 未知工具 "${name}"`;
    try {
      return tool.handler(input);
    } catch (error) {
      return `工具 "${name}" 执行失败: ${(error as Error).message}`;
    }
  }
}

// 使用
const registry = new ToolRegistry();
registry.register(searchTool, (input) => `搜索 "${input.query}" 的结果...`);
registry.register(weatherTool, (input) => `${input.city}: 25°C`);
// ...

const tools = registry.getDefinitions();
// 在工具循环中
const result = registry.execute(block.name, block.input);
```

---

## 🧠 知识检查点

### Q1: 构建一个多工具智能助手时，最重要的三个设计原则是什么？

<details>
<summary>点击展开答案</summary>

1. **工具职责清晰** — 每个工具只做一件事，描述中明确说明何时使用、何时不使用
2. **健壮的错误处理** — 每个工具都要处理失败情况，返回友好的错误信息，让 LLM 可以做出合理的补救
3. **可控的循环** — 设置最大迭代次数，避免无限循环；同时监控工具调用次数，及时发现异常行为

</details>

### Q2: 为什么 System Prompt 在多工具助手中很重要？应该包含哪些内容？

<details>
<summary>点击展开答案</summary>

System Prompt 指导 LLM 如何策略性地使用工具。应该包含：1) 工具的调用策略（什么情况下调用工具）；2) 复杂任务的拆解方法；3) 错误处理方式（工具失败时如何向用户解释）；4) 回复风格要求。好的 System Prompt 可以显著提升工具调用准确率和用户体验。

</details>

### Q3: 当工具数量增长到 10+ 时，有哪些管理策略？

<details>
<summary>点击展开答案</summary>

1) **模块化注册** — 使用 ToolRegistry 模式统一管理工具定义和执行器
2) **动态工具选择** — 根据对话上下文动态提供相关工具子集，而不是一次性传递所有工具
3) **命名空间前缀** — 使用 `domain__action` 命名规范（如 `user__search`、`order__create`）帮助 LLM 理解和分类
4) **分层调用** — 先让 LLM 使用「路由工具」确定需求领域，再加载该领域的详细工具

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 工具数量过多（10+）导致 LLM 选择困难 | 工具列表过长，LLM 难以在大量工具中准确选择 | 按功能模块分组，优先提供最相关的 5-7 个工具；使用 tool_choice 分阶段控制；考虑动态工具注册 |
| 未设置最大迭代次数导致无限循环 | Agent 循环缺少终止条件，LLM 不断调用工具直至超时 | 始终设置最大迭代次数（如 10 次），并在达到上限时返回当前已收集的全部信息 |
| 工具结果未格式化导致 LLM 误解 | 工具返回原始数据结构（如嵌套 JSON），LLM 难以理解 | 将工具结果格式化为自然语言或 Markdown，让 LLM 可以直接引用；对敏感数据进行脱敏处理 |

---

## 📝 本章小结

- ✅ **5 个工具** — 搜索、计算、天气、翻译、提醒
- ✅ **工具循环** — 自动处理多轮工具调用
- ✅ **并行调用** — Claude 可能一次请求多个工具

## ➡️ 下一步

查看附录，然后进入 [2.3 记忆系统](../../2.3-memory-system/README.md)
