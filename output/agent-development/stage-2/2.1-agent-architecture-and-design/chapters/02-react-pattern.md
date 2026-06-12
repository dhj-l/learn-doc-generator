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

ReAct（**Re**asoning + **Act**ing）是最经典的 Agent 架构，由 Yao et al. 在 2022 年提出（论文：*ReAct: Synergizing Reasoning and Acting in Language Models*）。

#### 为什么「推理+行动」交替优于单独使用任一策略？

在 ReAct 出现之前，LLM 有两种主流使用方式：
- **Chain-of-Thought (CoT) 推理** — 模型通过「一步一步思考」来提升推理准确性，但完全依赖参数化知识，无法获取实时信息或与外部系统交互。
- **纯 Acting（工具调用）** — 模型直接调用工具并从观察中学习，但缺乏显式的推理链条，容易在复杂任务中迷失方向。

ReAct 的核心洞察是：**推理轨迹（Reasoning Traces）和任务特定行动（Task-Specific Actions）之间存在协同效应（Synergy）**。推理轨迹帮助模型在行动前进行推演、维持任务目标、支撑行动计划；而行动反馈（工具观察结果）则为推理提供新的外部信息，弥补纯推理中知识不足的问题。

```
传统 CoT：  思考 → 思考 → 思考 → 答案
              （只能用内部知识，不能与外界交互）

传统 Act：  行动 → 观察 → 行动 → 观察
              （没有显式的推理过程，容易出错）

ReAct：     思考 → 行动 → 观察 → 思考 → 行动 → 观察 → 答案
              （推理和行动交替，既有思考又能获取外部信息）
```

#### 基准测试结果

Yao et al. 在多个基准上对 ReAct 进行了系统评估，关键结果如下：

| 基准（Benchmark） | 方法 | 准确率 | 备注 |
|-------------------|------|--------|------|
| HotpotQA（多跳问答） | CoT (Chain-of-Thought) | 29.9% (EM) | 纯推理，知识受限 |
| HotpotQA | Act-only | 34.9% (EM) | 纯行动，无推理 |
| HotpotQA | **ReAct** | **42.7% (EM)** | 推理+行动协同最佳 |
| FeverOUS（事实验证） | CoT | 60.5% (Acc) | — |
| FeverOUS | **ReAct** | **66.5% (Acc)** | 信息获取+推理结合显著提升 |

实验表明：**ReAct 在信息密集型任务（需要搜索外部知识）上显著优于 CoT，而在推理密集型任务上保持可比性。** 更重要的是，ReAct 的推理轨迹提供了完全的可解释性——你可以逐行追踪 Agent 的「思考过程」和「依据」。

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

### 练习：为 ReAct Agent 添加一个「知识库查询」工具

**场景描述：** 你的团队正在构建一个技术文档问答 Agent。已有的 ReAct 引擎支持 search 和 calculate 工具，但用户反映答案不够准确——因为 search 返回的是通用互联网信息，不是内部知识库内容。你需要为 ReAct Agent 添加一个 `lookup_knowledge_base` 工具，让它可以查询公司的内部技术文档。

**你的任务：** 基于本章的 `ReActAgent` 类，完成以下改造：
1. 定义一个 `KnowledgeBase` 模拟类，包含一些预置的问答对
2. 创建 `lookup_knowledge_base` 工具，接受关键词返回匹配的文档片段
3. 将新工具注册到 Agent 的 `createTools()` 中
4. 测试 Agent 能否正确使用新工具回答技术问题

<details>
<summary>🧑‍💻 参考答案（先自己写）</summary>

```typescript
// 模拟知识库
class KnowledgeBase {
  private docs: Record<string, string> = {
    'typescript generics': 'TypeScript 泛型允许创建可复用的组件...',
    'react hooks': 'React Hooks 是 React 16.8 引入的特性...',
    'async await': 'async/await 是 Promise 的语法糖...',
    'rest api': 'REST API 使用 HTTP 方法操作资源...',
  };

  query(keyword: string): string {
    const results = Object.entries(this.docs)
      .filter(([key]) => key.includes(keyword.toLowerCase()))
      .map(([key, val]) => `[${key}]: ${val}`);

    return results.length > 0
      ? results.join('\n')
      : `未找到与 "${keyword}" 相关的文档。`;
  }
}

const kb = new KnowledgeBase();

// 注册到工具集
function createTools(): Record<string, Tool> {
  return {
    search: {
      name: 'search',
      description: '搜索互联网信息',
      execute: async (query: string) => `[搜索结果] ${query}`,
    },
    lookup_knowledge_base: {
      name: 'lookup_knowledge_base',
      description: '查询内部技术知识库',
      execute: async (keyword: string) => kb.query(keyword),
    },
    finish: {
      name: 'finish',
      description: '输出最终答案并结束',
      execute: async (answer: string) => answer,
    },
  };
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧 1：用 Zod 做工具参数校验

```typescript
import { z } from 'zod';

// 为每个工具定义参数 schema
const toolSchemas = {
  search: z.object({
    query: z.string().min(1, '搜索词不能为空'),
    maxResults: z.number().max(10).default(5),
  }),
  calculate: z.object({
    expression: z.string().regex(/^[0-9+\-*/().%\s]+$/, '包含非法字符'),
  }),
};

// 在工具执行前校验
async function safeExecute<T extends keyof typeof toolSchemas>(
  toolName: T,
  rawArgs: unknown
) {
  const schema = toolSchemas[toolName];
  const parsed = schema.parse(rawArgs); // 校验失败会抛 ZodError
  return executeTool(toolName, parsed);
}
```

### 技巧 2：用递归类型增强 Action 解析

```typescript
// ReAct 输出的 Thought/Action 格式
type ReActStep = {
  thought: string;
  action: `${string}(${string})`;
};

// 递归解析多步轨迹
type ReActTrace = ReActStep | [ReActStep, ...ReActTrace[]];

function formatTrace(trace: ReActTrace): string {
  if ('thought' in trace && 'action' in trace) {
    return `💭 ${trace.thought}\n🔧 ${trace.action}`;
  }
  // 递归处理嵌套的轨迹数组
  return (trace as ReActStep[]).map(formatTrace).join('\n');
}
```

### 技巧 3：使用 AbortSignal 实现超时控制

```typescript
async function runWithTimeout<T>(
  agentRun: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await agentRun(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Agent 执行超时 (${timeoutMs}ms)`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// 使用
const result = await runWithTimeout(
  (signal) => agent.run(userTask),
  30000  // 30秒超时
);
```

---

## 🧠 知识检查点

<details>
<summary>Q1: ReAct 相比于纯 Chain-of-Thought 推理，核心优势是什么？</summary>

> A：ReAct 通过交替进行推理和行动，能够从外部环境中获取新信息（工具观察结果），弥补纯 CoT 依赖参数化知识的局限。特别是在需要实时信息或多跳信息检索的场景（如 HotpotQA），ReAct 的准确率显著高于 CoT（42.7% vs 29.9%）。
</details>

<details>
<summary>Q2: ReAct 的「推理轨迹」在实际部署中有哪些作用？</summary>

> A：推理轨迹（Thought + Action 记录）有三个重要用途：① **可解释性** — 用户可以查看 Agent 每一步的思考过程和依据；② **调试** — 当 Agent 给出错误答案时，可以通过轨迹定位是哪一步推理出了偏差；③ **持续改进** — 通过分析失败轨迹，优化 prompt 的格式引导。
</details>

<details>
<summary>Q3: 如果 ReAct Agent 连续多次解析 Action 失败，应该怎么处理？</summary>

> A：可以采取多层处理策略：① **重试** — 给 LLM 发送提示纠正格式（如 "请按 Thought: / Action: 格式输出"）；② **降级** — 如果重试仍失败，退化为仅使用 Thought 输出答案（CoT 模式）；③ **熔断** — 超过最大重试次数后，记录错误并优雅结束，避免无限循环和 Token 浪费。
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| Action 格式解析一直失败 | LLM 输出中 Action 参数使用了中文括号或引号不匹配 | 在 prompt 中明确要求使用英文标点；在解析器中增加对中文括号的容错替换 |
| Agent 陷入「思考→行动→观察」的死循环 | 没有设置最大步骤数限制，或 LLM 无法得出最终结论 | 设置 `maxSteps`（如 10），并在达到限制时强制调用 finish() 返回当前进展 |
| 工具观察结果太长，超出上下文窗口 | 工具返回的内容过大（如读取了整个文件），挤占后续推理的 Token 空间 | 对工具返回做截断（max 2000 字符），使用摘要策略「返回前 N 行 + 省略提示」 |

---

## 📝 本章小结

## ➡️ 下一章预告

> [第3章：Plan-and-Execute 模式](./03-plan-and-execute.md) — 将规划和执行分离，处理更复杂的任务。
