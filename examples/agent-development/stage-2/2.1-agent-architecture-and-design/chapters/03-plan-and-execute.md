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

**预期输出：**
```
📋 初始计划:
  1. 搜索笔记本商品列表
  2. 提取商品详情页链接
  3. 逐个访问详情页提取信息
  4. 保存结果到文件

🔧 执行步骤 1: 搜索笔记本商品列表
  ✅ 搜索到 10 条笔记本商品信息

🔧 执行步骤 2: 提取商品详情页链接
  ✅ 提取到 3 个商品详情页 URL

📋 执行摘要: 所有步骤完成
```


---

## 🔨 实战演练

### 练习：实现一个「网页数据采集」Plan-and-Execute Agent

<details>
<summary>🧑‍💻 先自己动手实现，再展开参考答案</summary>

**场景描述：**
你需要采集某个电商网站上商品的名称、价格和评价信息。该任务涉及多个步骤：搜索商品、进入详情页、提取信息、汇总数据。

**你的任务：**
1. 编写一个 Planner，将上述任务分解为 3-5 个步骤
2. 实现对应的工具（search, extractData, saveToFile）
3. 添加一个失败场景的测试：如果某个步骤失败，验证重规划是否正确调整了后续步骤

**参考实现要点：**
```typescript
// Planner 输出示例
const plan = {
  goal: '采集笔记本商品信息',
  steps: [
    { id: 1, description: '搜索笔记本商品列表', tool: 'search', input: '笔记本电脑 销量排行', dependsOn: [] },
    { id: 2, description: '提取商品详情页链接', tool: 'extractData', input: '从搜索结果中提取 URL', dependsOn: [1] },
    { id: 3, description: '逐个访问详情页提取信息', tool: 'extractData', input: '提取每个商品的价格和评价', dependsOn: [2] },
    { id: 4, description: '保存结果到文件', tool: 'saveToFile', input: '将商品信息保存为 CSV', dependsOn: [3] },
  ],
};
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：为 Planner 添加「依赖图」感知

让 Planner 不只输出步骤列表，还输出步骤间的依赖关系：

```typescript
interface PlanStep {
  id: number;
  description: string;
  tool: string;
  input: string;
  dependsOn: number[];   // 前置依赖的步骤 ID
  parallelizable: boolean; // 是否可以并行执行
}

// 利用依赖图可以并行执行无依赖的步骤
async function executePlan(plan: Plan, tools: Record<string, Tool>) {
  const results = new Map<number, string>();

  while (results.size < plan.steps.length) {
    // 找出所有可执行的步骤（依赖已满足）
    const ready = plan.steps.filter(s =>
      !results.has(s.id) &&
      s.dependsOn.every(d => results.has(d))
    );

    // 并行执行
    await Promise.all(ready.map(async step => {
      results.set(step.id, await executeStep(step, results, tools));
    }));
  }
}
```

### 技巧二：规划时估算步骤成本

在生成计划时让 LLM 同时估算每个步骤的 Token 消耗和延迟：

```typescript
interface CostEstimate {
  stepId: number;
  estimatedTokens: number;
  estimatedLatencyMs: number;
  riskLevel: 'low' | 'medium' | 'high';
}
```

### 技巧三：支持「增量重规划」

不需要每次失败都重新生成完整计划，只调整受影响的后继步骤：

```typescript
async function incrementalReplan(
  plan: Plan,
  failedStepId: number,
  failureReason: string
): Promise<Plan> {
  // 只重新规划从失败步骤开始的后继步骤
  const affectedSteps = plan.steps.filter(s =>
    s.id >= failedStepId || s.dependsOn.includes(failedStepId)
  );

  // 只让 LLM 重新规划受影响的部分
  const newPlan = await replanPartial(
    plan.goal,
    plan.steps.filter(s => s.status === 'completed'),
    affectedSteps,
    failureReason
  );

  return mergePlans(plan, newPlan);
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Plan-and-Execute 和 ReAct 模式的核心区别是什么？**

> A：Plan-and-Execute 将「规划」和「执行」分离——先制定完整计划再逐步执行，遇到失败时触发重规划。ReAct 则是「走一步看一步」，每一步都由 LLM 实时决定下一步。Plan-and-Execute 适合需要全局视野的复杂任务，ReAct 更适合探索性任务。

**Q2：什么情况下 Plan-and-Execute 比 ReAct 更合适？**

> A：当任务（1）需要多个步骤且步骤间有明确依赖关系；（2）需要全局优化（如资源调度、数据流水线）；（3）中间步骤失败后需要系统性地调整后续计划时，Plan-and-Execute 更合适。

**Q3：Plan-and-Execute 的主要缺点是什么？**

> A：（1）初始规划阶段就要消耗大量 Token；（2）如果任务信息不完整，初始计划可能偏离实际需要；（3）重规划的成本较高；（4）不适合需要频繁与环境交互的动态场景。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 计划过于细化导致执行笨拙 | 将任务分解为过多微小步骤，每一步都调用 LLM | 步骤粒度以「一个工具调用能完成」为标准，一页不要超过 7 步 |
| 重规划时迷失原始目标 | 多次重规划后，LLM 偏离了最初的 goal | 每次重规划时都在上下文中保留原始 goal 描述 |
| 忽略步骤间的数据传递 | 前一步的输出是后一步的输入，但没有传递上下文 | 执行每一步时，将之前步骤的结果一并传入 |

---

## 📝 本章小结

- ✅ **Plan-and-Execute** — 先制定完整计划，再逐步执行
- ✅ **Re-planning** — 根据执行结果动态调整后续计划
- ✅ **与 ReAct 对比** — ReAct 适合简单任务，Plan-and-Execute 适合复杂多步任务

## ➡️ 下一章预告

> [第4章：Reflexion 模式](./04-reflexion.md) — 让 Agent 从错误中学习和改进。
