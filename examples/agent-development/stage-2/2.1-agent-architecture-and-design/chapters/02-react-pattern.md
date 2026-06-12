# 第2章：ReAct 模式 — 推理与行动的交替循环

> 预计学习时间：90-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **深入理解 ReAct 模式** — Reasoning + Acting 的核心思想
- **实现 ReAct 循环** — 从零构建 ReAct 执行引擎
- **处理工具调用和观察** — 让 Agent 能够执行真实操作

## 📋 前置知识

> 建议先完成：[第1章：什么是 Agent](./01-what-is-agent.md) 和 [1.1 第3章：核心提示技巧](../../stage-1/1.1-prompt-engineering/chapters/03-core-techniques.md)

---

## 💡 核心概念

### 概念一：ReAct 的核心思想

ReAct（**Re**asoning + **Act**ing）是最经典的 Agent 架构，由 Yao et al. 在 2022 年提出。

```
传统 CoT：  思考 → 思考 → 思考 → 答案
              （只能用内部知识，不能与外界交互）

传统 Act：  行动 → 观察 → 行动 → 观察
              （没有显式的推理过程，容易出错）

ReAct：     思考 → 行动 → 观察 → 思考 → 行动 → 观察 → 答案
              （推理和行动交替，既有思考又能获取外部信息）
```

### 概念二：ReAct 执行流程

```
用户问题："北京今天适合户外运动吗？"

Thought 1: 我需要知道北京今天的天气情况，包括温度、天气状况和空气质量。
Action 1:  search("北京今天天气")
Observation 1: 北京今天晴，25°C，AQI 85（良），微风

Thought 2: 天气很好，25°C晴天适合户外。但我还需要确认没有极端天气预警。
Action 2:  search("北京今天天气预警")
Observation 2: 北京今天无天气预警

Thought 3: 综合以上信息，北京今天非常适合户外运动。温度适中，天气晴朗，空气质量良好。
Action 3:  finish("北京今天非常适合户外运动！25°C 晴天，空气质量良好，无预警。建议做好防晒，多补充水分。")
```

### 概念三：ReAct 的 Prompt 设计

```typescript
// src/react-prompt.ts

const REACT_SYSTEM_PROMPT = `
你是一个问题解决助手，使用 ReAct（Reasoning + Acting）模式工作。

你可以使用的工具：
- search(query) — 搜索信息
- calculate(expression) — 数学计算
- lookup(term) — 查找术语定义
- finish(answer) — 输出最终答案

请严格按以下格式进行推理和行动：

Thought: [你的推理过程]
Action: [工具名(参数)]

在收到 Observation（观察结果）后，继续推理：

Thought: [基于观察的进一步推理]
Action: [下一个行动]

重复此过程直到你能给出最终答案：
Thought: [最终推理]
Action: finish("最终答案")
`;
```

### 概念四：ReAct 引擎实现

```typescript
// src/react-engine.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// 工具定义
interface Tool {
  name: string;
  description: string;
  execute: (input: string) => Promise<string>;
}

// 创建工具集合
function createTools(): Record<string, Tool> {
  return {
    search: {
      name: 'search',
      description: '搜索互联网信息',
      execute: async (query: string) => {
        // 实际项目中这里会调用搜索 API
        return `搜索 "${query}" 的结果：[模拟搜索结果]`;
      },
    },
    calculate: {
      name: 'calculate',
      description: '执行数学计算',
      execute: async (expression: string) => {
        try {
          const result = Function('"use strict"; return (' + expression + ')')();
          return `${expression} = ${result}`;
        } catch (e) {
          return `计算错误: ${(e as Error).message}`;
        }
      },
    },
    finish: {
      name: 'finish',
      description: '输出最终答案并结束',
      execute: async (answer: string) => answer,
    },
  };
}

// ReAct Agent 引擎
class ReActAgent {
  private tools: Record<string, Tool>;
  private maxSteps: number;

  constructor(tools: Record<string, Tool>, maxSteps: number = 10) {
    this.tools = tools;
    this.maxSteps = maxSteps;
  }

  async run(task: string): Promise<{ answer: string; trace: string[] }> {
    const trace: string[] = [];
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: task },
    ];

    const systemPrompt = this.buildSystemPrompt();

    for (let step = 0; step < this.maxSteps; step++) {
      // 1. 让 LLM 推理
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20241022',
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      trace.push(text);

      // 2. 解析 Thought 和 Action
      const thoughtMatch = text.match(/Thought:\s*(.+?)(?=\nAction:|$)/s);
      const actionMatch = text.match(/Action:\s*(\w+)\((.+?)\)/s);

      if (!actionMatch) {
        trace.push('⚠️ 无法解析 Action，结束');
        break;
      }

      const thought = thoughtMatch?.[1]?.trim() || '';
      const toolName = actionMatch[1];
      const toolInput = actionMatch[2].replace(/^["']|["']$/g, '');

      trace.push(`💭 Thought: ${thought}`);
      trace.push(`🔧 Action: ${toolName}("${toolInput}")`);

      // 3. 检查是否结束
      if (toolName === 'finish') {
        trace.push(`✅ 完成: ${toolInput}`);
        return { answer: toolInput, trace };
      }

      // 4. 执行工具
      const tool = this.tools[toolName];
      if (!tool) {
        const observation = `错误: 工具 "${toolName}" 不存在。可用工具: ${Object.keys(this.tools).join(', ')}`;
        trace.push(`❌ ${observation}`);
        messages.push({ role: 'assistant', content: text });
        messages.push({ role: 'user', content: `Observation: ${observation}` });
        continue;
      }

      const observation = await tool.execute(toolInput);
      trace.push(`👁️ Observation: ${observation}`);

      // 5. 将结果反馈给 LLM
      messages.push({ role: 'assistant', content: text });
      messages.push({ role: 'user', content: `Observation: ${observation}` });
    }

    return { answer: '达到最大步骤数限制', trace };
  }

  private buildSystemPrompt(): string {
    const toolDescriptions = Object.values(this.tools)
      .map(t => `- ${t.name} — ${t.description}`)
      .join('\n');

    return `你是一个问题解决助手，使用 ReAct 模式工作。

可用工具：
${toolDescriptions}

请严格按以下格式行动：
Thought: [推理过程]
Action: [工具名(参数)]

收到 Observation 后继续推理，直到给出最终答案。
当完成任务时使用：Action: finish("最终答案")`;
  }
}

// 使用示例
async function main() {
  const agent = new ReActAgent(createTools());

  const { answer, trace } = await agent.run('一个圆的半径是 5，求它的面积');

  console.log('📋 执行轨迹:');
  trace.forEach(step => console.log(step));
  console.log('\n💡 最终答案:', answer);
}

main();
```

```
预期输出：
📋 执行轨迹:
Thought: 我需要计算圆的面积。圆的面积公式是 πr²，半径 r=5。
Action: calculate("Math.PI * 5 * 5")
👁️ Observation: 78.53981633974483
Thought: 计算完成，面积约为 78.54 平方单位。
✅ 完成: 半径为 5 的圆的面积约为 78.54 平方单位。

💡 最终答案: 半径为 5 的圆的面积约为 78.54 平方单位。
```

---

## 🔨 实战演练

### 练习：实现一个天气查询 ReAct Agent

<details>
<summary>🧑‍💻 先自己动手实现，再展开参考答案</summary>

**场景描述：**
你的公司需要做一个内部工具：用户可以问「明天北京适合穿什么衣服？」，Agent 需要先查天气，再根据温度给出穿衣建议。

**你的任务：**
1. 基于本章的 ReAct 引擎，添加 `weather` 工具
2. `weather(city, date)` 返回模拟天气数据（温度、天气状况、风力）
3. 添加 `clothingAdvice(temperature, condition)` 工具，根据天气给出穿衣建议
4. 测试 Agent 能否正确处理「今天上海适合穿什么？」这样的查询

**参考实现要点：**
```typescript
// 1. 添加天气工具
const weatherTool: Tool = {
  name: 'weather',
  description: '查询指定城市和日期的天气信息',
  execute: async (input: string) => {
    // 模拟天气数据
    const mockWeather: Record<string, any> = {
      '北京': { temp: 25, condition: '晴', wind: '3级' },
      '上海': { temp: 30, condition: '多云', wind: '2级' },
      '广州': { temp: 35, condition: '雷阵雨', wind: '4级' },
    };
    const city = Object.keys(mockWeather).find(c => input.includes(c));
    if (!city) return `未找到城市 "${input}" 的天气数据`;
    const w = mockWeather[city];
    return `${city} 天气：${w.condition}，${w.temp}°C，${w.wind} 风力`;
  },
};
```

**预期输出：**
```
北京 天气：晴，25°C，3级 风力

上海 天气：多云，30°C，2级 风力

广州 天气：雷阵雨，35°C，4级 风力
```


</details>

---

## ⚡ 进阶技巧

### 技巧一：为 ReAct 添加结构化输出格式

使用 JSON 格式的 Action 输出可以让解析更稳定，减少解析错误：

```typescript
// 推荐的 Action 输出格式
const REACT_JSON_PROMPT = `
请严格按以下 JSON 格式输出：

{
  "thought": "你的推理过程",
  "action": {
    "name": "工具名称",
    "input": "工具参数"
  }
}
`;

// 解析 JSON 格式更稳定
function parseJsonOutput(text: string): ParsedAction | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const data = JSON.parse(jsonMatch[0]);
    return {
      thought: data.thought || '',
      action: data.action.name || '',
      actionInput: data.action.input || '',
      isFinish: (data.action.name || '') === 'finish',
    };
  } catch {
    return null;
  }
}
```

**预期输出：**
```
输入: "{"thought": "需要计算圆的面积", "action": {"name": "calculate", "input": "Math.PI * 5 * 5"}}"

解析结果:
  thought: "需要计算圆的面积"
  action: "calculate"
  actionInput: "Math.PI * 5 * 5"
  isFinish: false
```


### 技巧二：引入「思考预算」控制推理深度

为 LLM 设置 Token 限制，防止单步推理过长：

```typescript
interface ThinkingBudget {
  maxThoughtTokens: number;   // 每次推理的最大 Token
  minThoughtTokens: number;   // 保证基本思考质量
}

// 在 Prompt 中加入预算提示
const BUDGET_PROMPT = `
本次思考预算：${budget.maxThoughtTokens} tokens
请简洁推理，直接给出关键结论和下一步行动。
`;
```

### 技巧三：为工具调用添加「上下文摘要」

当历史太长时，压缩上下文以避免 Token 超限：

```typescript
function summarizeHistory(messages: Array<{role: string; content: string}>): string {
  const lastActions = messages
    .filter(m => m.role === 'assistant')
    .slice(-3)
    .map(m => m.content.substring(0, 200))
    .join('\n');

  return `最近操作摘要：\n${lastActions}`;
}
```

**预期输出：**
```
输入消息列表: 5 条消息

最近操作摘要:
  第 3 步: 💭 需要查询天气信息
  第 4 步: 💭 天气查询完成，温度 25°C
  第 5 步: 💭 综合所有信息，给出最终答案
```


---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：ReAct 模式和传统的 Chain-of-Thought（CoT）有什么区别？**

> A：CoT 只有「思考→思考→思考→答案」的纯推理链条，Agent 无法获取外部信息。ReAct 在推理的基础上引入「行动」和「观察」步骤，让 LLM 可以调用工具获取外部信息，再基于观察结果继续推理，实现了推理和行动的交替循环。

**Q2：ReAct 模式适合什么样的任务？**

> A：ReAct 适合需要外部信息的任务（如查询天气、搜索资料）、需要多步推理的任务（如数学计算加信息查询）、以及探索性任务（Agent 需要自己决定下一步做什么）。对于完全不需要外部信息的纯推理任务，CoT 可能更高效。

**Q3：为什么 ReAct 输出格式的解析很重要？**

> A：LLM 的输出是自然语言，不是结构化命令。Agent 需要从文本中精确提取 Action 的名称和参数，才能调用对应的工具。如果解析不稳定（例如正则表达式不匹配、格式错误），Agent 就会卡住或执行错误操作。因此，设计稳定的解析器和健壮的错误重试机制是 ReAct 实现的关键。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Action 格式不对导致解析失败 | LLM 输出了非标准的 Action 格式（如遗漏引号、参数括号不匹配） | 在 System Prompt 中给出明确的格式示例，并实现容错解析（支持多种格式） |
| 没有处理 Action 不存在的错误 | Agent 执行了未定义的工具名，导致程序崩溃 | 先检查工具是否存在，若不存在则返回有意义的错误信息让 LLM 重新选择 |
| 无限循环（死循环） | Agent 反复执行相同操作，陷入重复模式 | 设置最大迭代限制（maxSteps），并检测是否出现重复的 Action 模式 |

---

## 📝 本章小结

- ✅ **ReAct 核心** — Thought → Action → Observation 的循环
- ✅ **Prompt 设计** — 用 System Prompt 定义工具和格式
- ✅ **引擎实现** — 解析 LLM 输出 → 执行工具 → 反馈结果
- ✅ **错误处理** — 工具不存在、解析失败等边界情况

## ➡️ 下一章预告

> [第3章：Plan-and-Execute 模式](./03-plan-and-execute.md) — 将规划和执行分离，处理更复杂的任务。
