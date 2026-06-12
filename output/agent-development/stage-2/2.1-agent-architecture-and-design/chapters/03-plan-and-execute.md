# 第3章：Plan-and-Execute 模式 — 先想好再动手

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Plan-and-Execute 架构** — 规划与执行分离的设计思想
- **实现 Plan → Execute → Replan 循环** — 动态调整计划
- **对比 ReAct 和 Plan-and-Execute** — 选择适合场景的架构

## 📋 前置知识

> 建议先完成：[第2章：ReAct 模式](./02-react-pattern.md)

---

## 💡 核心概念

### 概念一：为什么需要 Plan-and-Execute？

**生活类比：** ReAct 像一个「边走边看」的旅行者——走一步看一步。Plan-and-Execute 像一个「先做攻略」的旅行者——先规划好路线，再按计划行动，遇到意外再调整。

```
ReAct（边走边看）：
  思考→行动→观察→思考→行动→观察→...
  适合：简单任务、不确定下一步需要什么信息

Plan-and-Execute（先规划后执行）：
  [规划] → 步骤1、步骤2、步骤3...
  [执行] → 执行步骤1 → 执行步骤2 → ...
  [重规划] → 遇到意外时调整后续计划
  适合：复杂任务、需要全局视野
```

#### 学术背景：从 Plan-and-Solve 到分解策略

Plan-and-Execute 模式的思想源头可以追溯到 2023 年 Wang et al. 提出的 **Plan-and-Solve Prompting** 论文（*Plan-and-Solve Prompting: Improving Zero-Shot Chain-of-Thought Reasoning by Large Language Models*）。该研究发现，简单的「Let's think step by step」（CoT）虽然有效，但缺乏结构化的任务分解，容易在中间步骤出错。

Plan-and-Solve 的核心改进是引导 LLM 遵循两个阶段：
1. **Plan 阶段：** 先制定完整的执行计划，明确每个子任务的目的和依赖关系
2. **Solve 阶段：** 按计划逐一执行，必要时根据中间结果调整

这一思想进一步启发：在 Agent 领域，我们可以将 Plan 和 Solve 拆分为 **两个独立的 LLM 调用（甚至两个独立的 Agent）**，分别负责「制定计划」和「执行步骤」。

#### Top-Down 规划 vs ReAct 的 Emergent 规划

| 维度 | 显式规划（Plan-and-Execute） | Emergent 规划（ReAct） |
|------|----------------------------|----------------------|
| 规划时机 | 执行前 | 执行中逐步涌现 |
| 全局视野 | ✅ 有，能看到完整任务 | ❌ 只有局部视野 |
| 灵活性 | 中等（依赖重规划） | 高（随时调整） |
| 任务复杂度 | 适合复杂、长链条任务 | 适合简单、短链条任务 |
| 失败恢复 | 通过 Re-planner 修正 | 通过下一轮思考适应 |
| Token 成本 | 规划阶段额外开销 | 按步骤逐步消耗 |

选择策略的经验法则：**如果任务可以预先分解为明确的子步骤（如「数据分析报告」→ 查数据 → 整理 → 生成图表 → 写结论），用 Plan-and-Execute；如果任务路径不确定（如「帮我研究一下这个新技术」），用 ReAct 的 emergent 规划更灵活。**

### 概念二：Plan-and-Execute 架构

```
┌───────────────────────────────────────────┐
│              Plan-and-Execute              │
│                                            │
│  ┌────────────┐                           │
│  │   Planner  │ ← 制定完整计划             │
│  │   (LLM)    │                           │
│  └─────┬──────┘                           │
│        ↓                                  │
│  ┌────────────┐  ┌────────────┐          │
│  │ Step 1     │→ │ Step 2     │→ Step 3  │
│  │ (Executor) │  │ (Executor) │          │
│  └────────────┘  └────────────┘          │
│        ↓                 ↓                │
│  ┌────────────┐  ┌────────────┐          │
│  │  Observer  │  │  Observer  │          │
│  │  (检查结果) │  │  (检查结果) │          │
│  └─────┬──────┘  └─────┬──────┘          │
│        ↓                ↓                  │
│  ┌─────────────────────────────┐         │
│  │       Re-planner            │ ← 动态调整│
│  └─────────────────────────────┘         │
└───────────────────────────────────────────┘
```

### 概念三：核心实现

```typescript
// src/plan-execute.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

interface Plan {
  goal: string;
  steps: Array<{
    id: number;
    description: string;
    tool: string;
    input: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    result?: string;
  }>;
}

// Planner：制定计划
async function createPlan(goal: string, availableTools: string[]): Promise<Plan> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: `目标：${goal}
可用工具：${availableTools.join(', ')}

请制定执行计划，输出 JSON：
{
  "steps": [
    {"id": 1, "description": "步骤描述", "tool": "工具名", "input": "工具输入"}
  ]
}

要求：
- 每个步骤只做一件事
- 步骤之间有清晰的依赖关系
- 总步骤不超过 7 步`
    }],
  });

  const data = JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '{}');
  return {
    goal,
    steps: data.steps.map((s: any) => ({ ...s, status: 'pending' })),
  };
}

// Executor：执行单个步骤
async function executeStep(
  step: Plan['steps'][0],
  previousResults: string[],
  tools: Record<string, (input: string) => Promise<string>>
): Promise<string> {
  const tool = tools[step.tool];
  if (!tool) return `错误: 工具 ${step.tool} 不存在`;

  // 将之前的步骤结果作为上下文
  const context = previousResults.length > 0
    ? `\n之前的步骤结果:\n${previousResults.join('\n')}\n`
    : '';

  // 用 LLM 包装工具调用
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `当前步骤: ${step.description}
工具: ${step.tool}
输入: ${step.input}
${context}
请基于以上信息，生成工具调用的具体参数。只输出参数，不要其他文字。`
    }],
  });

  const refinedInput = response.content[0].type === 'text' ? response.content[0].text : step.input;
  return tool(refinedInput);
}

// Re-planner：根据执行结果调整计划
async function replan(
  plan: Plan,
  failedStep: Plan['steps'][0]
): Promise<Plan> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1500,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: `原始目标：${plan.goal}
已完成的步骤：${plan.steps.filter(s => s.status === 'completed').map(s => `\n- ${s.description}: ${s.result}`).join('')}
失败步骤：${failedStep.description}
失败原因：${failedStep.result}

请重新规划剩余步骤，输出 JSON：
{"steps": [{"id": N, "description": "...", "tool": "...", "input": "..."}]}`
    }],
  });

  const data = JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '{}');
  return {
    ...plan,
    steps: [
      ...plan.steps.filter(s => s.status === 'completed'),
      ...data.steps.map((s: any) => ({ ...s, status: 'pending' as const })),
    ],
  };
}

// 主循环
async function planAndExecute(
  goal: string,
  tools: Record<string, (input: string) => Promise<string>>
) {
  let plan = await createPlan(goal, Object.keys(tools));
  console.log('📋 初始计划:');
  plan.steps.forEach(s => console.log(`  ${s.id}. ${s.description}`));

  for (const step of plan.steps) {
    if (step.status === 'completed') continue;

    console.log(`\n🔧 执行步骤 ${step.id}: ${step.description}`);
    step.status = 'in_progress';

    try {
      const result = await executeStep(
        step,
        plan.steps.filter(s => s.status === 'completed' && s.result).map(s => s.result!),
        tools
      );
      step.result = result;
      step.status = 'completed';
      console.log(`  ✅ ${result}`);
    } catch (error) {
      step.result = (error as Error).message;
      step.status = 'failed';
      console.log(`  ❌ 失败: ${step.result}`);

      // 重规划
      console.log('🔄 重新规划...');
      plan = await replan(plan, step);
      console.log('📋 更新后的计划:');
      plan.steps.forEach(s => console.log(`  ${s.id}. [${s.status}] ${s.description}`));
    }
  }

  return plan;
}
```

---

## 🔨 实战演练

### 练习：将天气查询 Agent 从 ReAct 改造为 Plan-and-Execute

**场景描述：** 你的上一个项目用 ReAct 模式做了一个天气查询 Agent，它能回答「北京明天适合跑步吗？」这类问题。但随着业务扩展，用户开始问「帮我规划一个下周末上海三日游的行程，包括天气预报、景点推荐和餐厅预订」。ReAct 在处理这个复合任务时经常遗漏步骤或重复劳动。

**你的任务：** 基于本章的 `planAndExecute` 函数，实现一个旅游规划 Agent：
1. 定义至少 3 个工具：`search_weather`（查天气）、`search_attractions`（查景点）、`search_restaurants`（查餐厅）
2. 使用 `createPlan` 让 LLM 为「上海三日游规划」生成执行计划
3. 执行计划并处理可能的重规划

<details>
<summary>🧑‍💻 参考答案（先自己写）</summary>

```typescript
// 旅游规划工具
const travelTools: Record<string, (input: string) => Promise<string>> = {
  search_weather: async (city: string) => {
    const data = { '上海': '25°C, 晴转多云', '北京': '20°C, 小雨' };
    return `${city} 天气: ${data[city] || '未知'}`;
  },
  search_attractions: async (city: string) => {
    const data = { '上海': '外滩、东方明珠、迪士尼、豫园' };
    return `${city} 景点: ${data[city] || '暂无数据'}`;
  },
  search_restaurants: async (city: string) => {
    const data = { '上海': '老吉士、南翔小笼、鼎泰丰' };
    return `${city} 餐厅: ${data[city] || '暂无数据'}`;
  },
};

async function travelPlanner() {
  const result = await planAndExecute(
    '帮我规划下周末上海三日游，包括天气、景点和餐厅',
    travelTools
  );

  console.log('✅ 规划结果:');
  result.steps.filter(s => s.status === 'completed').forEach(s => {
    console.log(`  ${s.id}. ${s.description} → ${s.result}`);
  });
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧 1：用 DAG 依赖图管理计划步骤

```typescript
interface StepNode {
  id: string;
  description: string;
  dependencies: string[];   // 前置步骤 ID
  tool: string;
  status: 'pending' | 'ready' | 'running' | 'done' | 'failed';
}

function getReadySteps(plan: StepNode[]): StepNode[] {
  return plan.filter(step =>
    step.status === 'pending' &&
    step.dependencies.every(depId =>
      plan.find(s => s.id === depId)?.status === 'done'
    )
  );
}

// 并行执行就绪的步骤
async function executePlanInParallel(plan: StepNode[]) {
  while (plan.some(s => s.status === 'pending' || s.status === 'ready')) {
    const readySteps = getReadySteps(plan);
    readySteps.forEach(s => { s.status = 'running'; });

    await Promise.all(readySteps.map(async step => {
      step.status = 'done';
    }));
  }
}
```

### 技巧 2：用结构化输出保障 Plan 格式可靠

```typescript
import Anthropic from '@anthropic-ai/sdk';

// 使用 Anthropic 的工具调用（function calling）能力保证结构化输出
const planningTool: Anthropic.Tool = {
  name: 'create_plan',
  description: '为给定目标创建执行计划',
  input_schema: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            description: { type: 'string' },
            tool: { type: 'string' },
            input: { type: 'string' },
          },
          required: ['id', 'description', 'tool', 'input'],
        },
      },
    },
    required: ['steps'],
  },
};
// 这比用 JSON.parse 解析 LLM 文本更可靠
```

### 技巧 3：为 Planner 和 Executor 使用不同模型

```typescript
const plannerModel = 'claude-opus-4-5-20241022';  // 更智能的模型做规划
const executorModel = 'claude-sonnet-4-5-20241022'; // 更经济的模型做执行

// 规划阶段使用强大模型
const planResponse = await client.messages.create({
  model: plannerModel,
  // ... plan generation
});

// 执行阶段使用经济模型
const execResponse = await client.messages.create({
  model: executorModel,
  // ... step execution
});
```

---

## 🧠 知识检查点

<details>
<summary>Q1: Plan-and-Execute 相比 ReAct，在什么场景下优势最明显？</summary>

> A：当任务可以预先分解为有明确依赖关系的子步骤时（如数据分析报告、多步骤工作流），Plan-and-Execute 的全局规划可以避免 ReAct「走一步看一步」可能导致的步骤遗漏或重复劳动。特别是子步骤数超过 5 步的复杂任务，显式规划的优势更明显。
</details>

<details>
<summary>Q2: Re-planning（重规划）机制的触发条件有哪些？</summary>

> A：重规划通常在以下情况触发：① **工具执行失败** — 当前步骤调用的工具返回错误；② **中间结果不符合预期** — 返回的数据格式或内容与计划假设不一致；③ **环境状态变化** — 外部环境发生了变化，使原计划不再适用（如查天气发现下周末有台风）；④ **步骤数超出预期** — 执行过程中发现需要额外的子步骤才能完成任务。
</details>

<details>
<summary>Q3: Plan-and-Execute 的 Planner 和 Executor 为什么建议拆分为两个独立的 LLM 调用？</summary>

> A：将规划与执行分离有三大好处：① **关注点分离** — Planner 专注于全局策略不需要关心执行细节，Executor 专注于当前步骤不需要考虑全局依赖；② **Token 效率** — 规划阶段的 prompt 包含所有工具描述和约束，执行阶段不需要重复此上下文；③ **成本优化** — 可以让更强的模型（如 Opus）做规划，用更经济的模型（如 Sonnet）做执行，在保证质量的同时控制成本。
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| Plan 步骤过于笼统，执行时 LLM 不知道具体怎么做 | Planner prompt 没有给出步骤粒度的指引 | 在 Planner prompt 中明确要求「每一步只调用一个工具、只做一件事」 |
| 重规划后陷入「规划→失败→重规划→又失败」的循环 | 没有设置最大重规划次数，或失败原因没被正确传递给 Re-planner | 添加重规划上限（如 2 次），超出后直接返回已完成的步骤结果和失败说明 |
| Executor 执行时「忘记」了前面步骤的结果 | 上下文传递不完整，Executor 没有获取到前置步骤的输出 | 在调用 Executor 时，自动将已完成步骤的描述和结果拼接到 prompt 上下文中 |

---

## 📝 本章小结

## ➡️ 下一章预告

> [第4章：Reflexion 模式](./04-reflexion.md) — 让 Agent 从错误中学习和改进。
