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

## 📝 本章小结

- ✅ **ReAct 核心** — Thought → Action → Observation 的循环
- ✅ **Prompt 设计** — 用 System Prompt 定义工具和格式
- ✅ **引擎实现** — 解析 LLM 输出 → 执行工具 → 反馈结果
- ✅ **错误处理** — 工具不存在、解析失败等边界情况

## ➡️ 下一章预告

> [第3章：Plan-and-Execute 模式](./03-plan-and-execute.md) — 将规划和执行分离，处理更复杂的任务。
