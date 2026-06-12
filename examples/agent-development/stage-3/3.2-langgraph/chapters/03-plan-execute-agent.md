# 第3章：Plan-and-Execute Agent — 先规划再执行

> 预计学习时间：90-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Plan-and-Execute 模式** — 先制定计划，再逐步执行
- **构建 Planner + Executor + Replanner 三节点图** — 经典的规划执行架构
- **实现动态重规划** — 根据执行结果调整计划
- **对比 ReAct 和 Plan-and-Execute 的适用场景**

## 📋 前置知识

> 建议先完成：[第2章：内置 ReAct Agent](./02-react-agent.md)

---

## 💡 核心概念

### 概念一：为什么需要 Plan-and-Execute？

**生活类比：** ReAct 像是边走边看的探险家，走一步看一步。Plan-and-Execute 像是旅行规划师——先制定完整的行程（Plan），然后每天按计划行动（Execute），如果遇到意外（航班取消）就调整计划（Replan）。

```
ReAct（边想边做）：
  用户: "帮我写一篇关于 Vue 3 的技术博客"
  Agent: 思考 → 搜索 → 思考 → 写一段 → 思考 → 再搜索 → 写另一段...
  问题: 容易跑偏，写到一半忘了之前写的内容

Plan-and-Execute（先想后做）：
  用户: "帮我写一篇关于 Vue 3 的技术博客"

  Step 1 - Planner:
    计划: [
      "1. 搜索 Vue 3 最新特性和变化",
      "2. 提取 3-5 个核心特性作为章节",
      "3. 为每个特性写 200 字介绍",
      "4. 写引言和总结",
      "5. 整合并润色"
    ]

  Step 2 - Executor: 逐步执行计划

  Step 3 - Replanner: 执行完后检查是否需要调整计划
```

### 概念二：构建 Plan-and-Execute Agent

```typescript
// src/01-plan-execute.ts
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

// 定义状态
const PlanState = Annotation.Root({
  // 用户的原始任务
  task: Annotation<string>({ reducer: (_, curr) => curr, default: () => '' }),
  // 执行计划（步骤列表）
  plan: Annotation<string[]>({ reducer: (_, curr) => curr, default: () => [] }),
  // 已完成的步骤结果
  completedSteps: Annotation<Array<{ step: string; result: string }>>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
  // 当前正在执行的步骤索引
  currentStepIndex: Annotation<number>({
    reducer: (_, curr) => curr,
    default: () => 0,
  }),
  // 最终结果
  result: Annotation<string>({ reducer: (_, curr) => curr, default: () => '' }),
});

// Planner 节点 — 制定计划
async function planner(state: typeof PlanState.State) {
  const plannerPrompt = ChatPromptTemplate.fromTemplate(
    `你是一个任务规划专家。给定以下任务，将其分解为清晰的执行步骤。

任务：{task}

返回一个编号的步骤列表，每步一个具体行动。最多 5 步。
示例格式：
1. 第一步的具体行动
2. 第二步的具体行动
...`
  );

  const chain = plannerPrompt.pipe(model).pipe(new StringOutputParser());
  const planText = await chain.invoke({ task: state.task });

  // 解析步骤
  const steps = planText
    .split('\n')
    .filter(line => /^\d+\./.test(line.trim()))
    .map(line => line.replace(/^\d+\.\s*/, '').trim());

  console.log('📋 计划:');
  steps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));

  return { plan: steps, currentStepIndex: 0 };
}

// Executor 节点 — 执行当前步骤
async function executor(state: typeof PlanState.State) {
  const currentStep = state.plan[state.currentStepIndex];
  const previousResults = state.completedSteps
    .map(s => `步骤: ${s.step}\n结果: ${s.result}`)
    .join('\n\n');

  const executorPrompt = ChatPromptTemplate.fromTemplate(
    `你是一个任务执行专家。

原始任务：{task}

执行计划：
{plan}

已完成的步骤和结果：
{previousResults}

当前需要执行的步骤：{currentStep}

请执行这个步骤，返回执行结果。保持简洁。`
  );

  const chain = executorPrompt.pipe(model).pipe(new StringOutputParser());
  const result = await chain.invoke({
    task: state.task,
    plan: state.plan.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    previousResults: previousResults || '（还没有完成的步骤）',
    currentStep: `${state.currentStepIndex + 1}. ${currentStep}`,
  });

  console.log(`\n✅ 步骤 ${state.currentStepIndex + 1} 完成:`);
  console.log(`   ${result.slice(0, 100)}...`);

  return {
    completedSteps: [{ step: currentStep, result }],
    currentStepIndex: state.currentStepIndex + 1,
  };
}

// Replanner 节点 — 检查是否需要调整计划
async function replanner(state: typeof PlanState.State) {
  const allDone = state.currentStepIndex >= state.plan.length;

  if (allDone) {
    // 所有步骤完成，生成最终结果
    const summaryPrompt = ChatPromptTemplate.fromTemplate(
      `基于以下任务和执行结果，生成最终总结。

任务：{task}

执行结果：
{results}

最终总结：`
    );

    const chain = summaryPrompt.pipe(model).pipe(new StringOutputParser());
    const result = await chain.invoke({
      task: state.task,
      results: state.completedSteps
        .map(s => `${s.step}: ${s.result}`)
        .join('\n'),
    });

    return { result };
  }

  return {};  // 还有步骤未完成，继续执行
}

// 路由逻辑
function routeAfterReplan(state: typeof PlanState.State) {
  if (state.currentStepIndex >= state.plan.length && state.result) {
    return 'end';
  }
  return 'execute';
}

// 构建图
const graph = new StateGraph(PlanState)
  .addNode('planner', planner)
  .addNode('executor', executor)
  .addNode('replanner', replanner)
  .addEdge(START, 'planner')
  .addEdge('planner', 'executor')
  .addEdge('executor', 'replanner')
  .addConditionalEdges('replanner', routeAfterReplan, {
    execute: 'executor',
    end: END,
  })
  .compile();

// 使用
const result = await graph.invoke({
  task: '总结 Vue 3 和 React 19 的核心区别，面向正在选型的前端团队',
});

console.log('\n📄 最终结果:');
console.log(result.result);
```

### 概念三：ReAct vs Plan-and-Execute

| 维度 | ReAct | Plan-and-Execute |
|------|-------|-------------------|
| 执行方式 | 边想边做 | 先规划再执行 |
| 适合任务 | 简单查询、单步任务 | 复杂多步任务 |
| 可预测性 | 低（路径不确定） | 高（有明确计划） |
| 错误恢复 | 每步自动调整 | 通过 Replanner 调整 |
| 资源消耗 | 较低 | 较高（需要规划和重规划） |
| 适用场景 | 搜索问答、工具调用 | 研究报告、代码生成、项目规划 |

---

## 🔨 实战演练

### 练习：构建一个技术调研 Agent

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

// 研究工具
const searchTool = tool(
  async ({ query }) => `搜索 "${query}" 的结果：相关内容摘要...`,
  { name: 'search', description: '搜索互联网', schema: z.object({ query: z.string() }) }
);

const noteTool = tool(
  async ({ note }) => { console.log(`📝 笔记: ${note}`); return '已记录'; },
  { name: 'take_note', description: '记录研究笔记', schema: z.object({ note: z.string() }) }
);

// 使用 Plan-and-Execute 做技术调研
const researchGraph = /* ... 按上面的模板构建 ... */;
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：动态重规划策略

当执行结果与预期不符时，Replanner 可以修改剩余步骤而非重新制定全部计划。

```typescript
async function smartReplanner(state: typeof PlanState.State) {
  const lastResult = state.completedSteps[state.completedSteps.length - 1];

  // 如果某步执行失败，插入修正步骤
  if (lastResult.result.includes('错误') || lastResult.result.includes('失败')) {
    const fixStep = `修复上一步的问题：${lastResult.step}`;
    return {
      plan: [
        ...state.plan.slice(0, state.currentStepIndex),
        fixStep,
        ...state.plan.slice(state.currentStepIndex),
      ],
    };
  }

  // 正常情况继续
  return {};
}
```

### 技巧二：并行执行独立步骤

如果计划中的多个步骤之间没有依赖关系，可以使用并行执行加速。

```typescript
import { RunnableParallel } from '@langchain/core/runnables';

// 将独立的搜索步骤并行化
const parallelSearch = RunnableParallel.from({
  result1: searchFunction.bind(null, 'query1'),
  result2: searchFunction.bind(null, 'query2'),
});
```

### 技巧三：规划步骤的 Token 优化

Planner 的 prompt 会随着已完成步骤增多而膨胀。可以只保留最近的 N 步结果来节省 Token。

```typescript
function trimCompletedSteps(steps: Array<{ step: string; result: string }>, maxKeep = 3) {
  if (steps.length <= maxKeep) return steps;
  return [
    { step: '...', result: `（已省略 ${steps.length - maxKeep} 步）` },
    ...steps.slice(-maxKeep),
  ];
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Plan-and-Execute 和 ReAct 模式的核心区别是什么？**

> A：ReAct 是「边想边做」，每一步都根据当前状态决策下一步。Plan-and-Execute 是「先想后做」，先制定完整计划再逐步执行，适合需要全局规划的复杂任务。

**Q2：Replanner 节点在什么情况下触发？**

> A：Replanner 在每一步执行之后触发，检查是否需要调整后续计划。如果某步执行失败或结果与预期不符，Replanner 可以修改、插入或删除剩余步骤。

**Q3：Planner 制定的计划步骤过多怎么办？**

> A：可以在 prompt 中限制最大步数（如 5 步），或在 Planner 逻辑中动态合并相似步骤。对于超长任务，可以分层规划——先规划大阶段，再细化每个阶段。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Plan 解析失败导致步骤列表为空 | Planner 的输出格式不符合预期，正则解析没有匹配到步骤 | 在 prompt 中给出明确的格式示例，并添加解析失败的容错逻辑 |
| Executor 重复执行同一步骤 | `currentStepIndex` 更新逻辑错误，导致步进未正常递增 | 确保 Executor 返回时正确更新 `currentStepIndex`，并在路由中检查是否越界 |
| Replanner 无限修改计划 | 没有设置最大重规划次数，导致反复调整计划 | 添加 `replanCount` 计数器，达到上限后强制结束或直接输出当前结果 |
| 计划步骤太多超出 Token 限制 | 长任务产生的步骤列表和结果过于庞大 | 使用步骤裁剪策略，只保留最近的 N 步结果，或对已完成步骤做摘要压缩 |

---

## 📝 本章小结

- ✅ **Plan-and-Execute** — 先规划后执行的 Agent 模式
- ✅ **三个节点** — Planner（规划）、Executor（执行）、Replanner（重规划）
- ✅ **动态调整** — 根据执行结果决定是否修改计划
- ✅ **vs ReAct** — 复杂任务选 Plan-and-Execute，简单任务选 ReAct

## ➡️ 下一章预告

> [第4章：人机协作模式](./04-human-in-the-loop.md) — 让人类在关键步骤介入审核。
