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

---

## 📝 本章小结

- ✅ **Plan-and-Execute** — 先制定完整计划，再逐步执行
- ✅ **Re-planning** — 根据执行结果动态调整后续计划
- ✅ **与 ReAct 对比** — ReAct 适合简单任务，Plan-and-Execute 适合复杂多步任务

## ➡️ 下一章预告

> [第4章：Reflexion 模式](./04-reflexion.md) — 让 Agent 从错误中学习和改进。
