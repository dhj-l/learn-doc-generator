# 第3章：Plan-and-Execute Agent — 先规划，后执行

> 预计学习时间：90-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Plan-and-Execute 架构** — 将"规划"和"执行"分离的设计模式
- **实现规划节点（Plan Node）** — 任务分解与步骤编排
- **实现执行节点（Execute Node）** — 逐步执行计划
- **实现重规划（Replanning）** — 根据执行结果动态调整计划
- **掌握任务分解与层次化规划** — 复杂任务的拆解策略

---

## 💡 从 ReAct 到 Plan-and-Execute

### 概念一：为什么需要 Plan-and-Execute？

**生活类比：** 假设你要组织一场公司年会。ReAct 的方式是"走一步看一步"：先订场地→发现需要确认人数→统计人数→发现需要预算→申请预算→发现场地已被订走→重新找场地... 效率极低。

Plan-and-Execute 的方式是：先**规划**（Plan）— 确定预算、人数、场地、节目、餐饮等所有环节的顺序和依赖关系，然后**执行**（Execute）— 按计划推进，每完成一步检查结果，必要时**重规划**（Replan）— 调整后续步骤。

```
ReAct（反应式）：
  问题 → 思考 → 行动 → 观察 → 思考 → 行动 → ...
  （每一步只考虑当前，缺乏全局规划）

Plan-and-Execute（规划执行式）：
  问题 → 规划（生成完整步骤）
       → 执行步骤1 → 观察结果
       → 执行步骤2 → 观察结果
       → 重规划（如有需要调整剩余步骤）
       → 执行步骤3 → ...
       → 最终答案
  （先有全局计划，再逐步执行，动态调整）
```

> **💡 为什么需要 Plan-and-Execute？**
>
> ReAct Agent 适合简单任务，但涉及多个依赖步骤、需要协调多个工具时，"走一步看一步"的方式会暴露局限性。Plan-and-Execute 通过先制定完整计划再执行，可以显著减少不必要的工具调用、避免重复工作、提高复杂任务的完成质量。

---

## 🏗 Plan-and-Execute 架构设计

### 概念二：核心组件

Plan-and-Execute Agent 由三个核心节点组成：

```typescript
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';

// ============ 状态定义 ============
const PlanExecuteState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, curr) => [...prev, ...curr], default: () => [],
  }),
  plan: Annotation<string[]>({
    reducer: (prev, curr) => curr, default: () => [],
  }),
  currentStep: Annotation<number>({
    reducer: (prev, curr) => curr, default: () => 0,
  }),
  observations: Annotation<string[]>({
    reducer: (prev, curr) => [...prev, ...curr], default: () => [],
  }),
  finalAnswer: Annotation<string>({
    reducer: (_, curr) => curr, default: () => '',
  }),
  needsReplan: Annotation<boolean>({
    reducer: (_, curr) => curr, default: () => false,
  }),
});
type PlanState = typeof PlanExecuteState.State;

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022', temperature: 0.2 });
```

```
                    ┌──────────────┐
                    │    START     │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  planner     │
                    │  生成步骤列表 │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  executor    │
                    │  执行当前步骤 │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ should_replan│
                    │  (是否重规划?)│
                    └───┬──────┬───┘
                  是/需调整  已完成
                       │        │
              ┌────────▼─┐  ┌──▼──────────┐
              │ replanner │  │  finalizer  │
              │ 调整计划   │  │ 生成答案    │
              └────────┬──┘  └──┬──────────┘
                       │        │
                       └───┬────┘
                           │
                    ┌──────▼───────┐
                    │     END      │
                    └──────────────┘
```

### 概念三：规划节点（Planner）

```typescript
async function planNode(state: PlanState) {
  const response = await model.invoke([
    new SystemMessage(`你是一个任务规划专家。将任务分解为3-6个具体可执行的步骤。

## 输出格式
JSON 数组：["步骤1：...", "步骤2：...", ...]

## 示例
用户：帮我研究量子计算的最新进展
输出：["步骤1：搜索量子计算基础概念和技术水平",
       "步骤2：查找2024年量子计算领域重要突破",
       "步骤3：搜索Google、IBM等公司的项目进展",
       "步骤4：分析量子计算对各行业的影响",
       "步骤5：汇总信息生成结构化报告"]`),
    new HumanMessage(state.messages[0].content),
  ]);

  try {
    const plan = JSON.parse(response.content as string);
    return { plan, currentStep: 0, needsReplan: false };
  } catch {
    return { plan: ['步骤1：分析需求', '步骤2：收集信息', '步骤3：综合回答'], currentStep: 0, needsReplan: false };
  }
}
```

> **💡 为什么让 LLM 生成 JSON 格式的计划？**
>
> 结构化的 JSON 数组便于程序化处理。每个步骤作为字符串存储在 `plan` 数组中，`currentStep` 跟踪进度。比自然语言更容易索引、更新和条件跳转。

### 概念四：执行节点（Executor）

```typescript
const tools = {
  search: async (query: string) => `🔍 搜索: ${query} → 结果摘要...`,
  calculate: async (expr: string) => { try { return String(eval(expr)); } catch { return '错误'; } },
};

async function executeNode(state: PlanState) {
  const step = state.plan[state.currentStep];
  if (!step) return { messages: [new AIMessage('所有步骤已完成')], needsReplan: false };

  const response = await model.invoke([
    new SystemMessage(`执行步骤：${step}
回复格式：SEARCH: 搜索词 / CALC: 表达式 / DONE: 结果描述`),
    ...state.messages.slice(-2),
  ]);

  const content = response.content as string;
  let observation = '';
  if (content.startsWith('SEARCH:')) observation = await tools.search(content.slice(7).trim());
  else if (content.startsWith('CALC:')) observation = await tools.calculate(content.slice(5).trim());
  else observation = content;

  return {
    messages: [new AIMessage(`步骤 ${state.currentStep + 1} 结果: ${observation}`)],
    observations: [`${step}: ${observation}`],
    currentStep: state.currentStep + 1,
    needsReplan: observation.includes('失败') || observation.includes('错误'),
  };
}
```

### 概念五：重规划节点（Replan）

```typescript
async function replanNode(state: PlanState) {
  const remainingSteps = state.plan.slice(state.currentStep);
  const response = await model.invoke([
    new SystemMessage(`原始计划剩余：${JSON.stringify(remainingSteps)}
已完成观察：${JSON.stringify(state.observations)}
请调整剩余计划，输出 JSON 数组。`),
    new HumanMessage('根据结果调整计划'),
  ]);

  try {
    return { plan: JSON.parse(response.content as string), currentStep: 0, needsReplan: false };
  } catch {
    return { needsReplan: false };
  }
}

// 最终回答节点
async function finalizerNode(state: PlanState) {
  const response = await model.invoke([
    new SystemMessage('基于所有执行结果生成完整最终答案。'),
    new HumanMessage(`任务：${state.messages[0].content}\n过程：${JSON.stringify(state.observations)}`),
  ]);
  return { finalAnswer: response.content as string, messages: [new AIMessage(response.content as string)] };
}
```

### 概念六：条件路由与图组装

```typescript
function routeAfterExecute(state: PlanState): string {
  if (state.currentStep >= state.plan.length) return 'finalizer';
  if (state.needsReplan) return 'replaner';
  return 'executor';
}

const planExecuteGraph = new StateGraph(PlanExecuteState)
  .addNode('planner', planNode)
  .addNode('executor', executeNode)
  .addNode('replaner', replanNode)
  .addNode('finalizer', finalizerNode)
  .addEdge(START, 'planner')
  .addEdge('planner', 'executor')
  .addConditionalEdges('executor', routeAfterExecute, {
    executor: 'executor', replaner: 'replaner', finalizer: 'finalizer',
  })
  .addEdge('replaner', 'executor')
  .addEdge('finalizer', END)
  .compile();

// 执行
const result = await planExecuteGraph.invoke({
  messages: [new HumanMessage('研究人工智能在医疗领域的应用，包括诊断、药物研发和医疗影像')],
});
console.log('最终答案:', result.finalAnswer);
```

---

## 📊 任务分解策略

### 概念七：层次化规划（Hierarchical Planning）

```typescript
// 高级规划 → 子任务细化
async function hierarchicalPlanNode(state: PlanState) {
  const task = state.messages[0].content;

  // 第一层：高级分解
  const highResp = await model.invoke([
    new SystemMessage('将任务分解为3-5个子任务，输出JSON数组。'),
    new HumanMessage(task),
  ]);
  const highLevelSteps = JSON.parse(highResp.content as string);

  // 第二层：细化每个子任务
  const detailedPlan: string[] = [];
  for (const step of highLevelSteps) {
    const lowResp = await model.invoke([
      new SystemMessage(`将"${step}"细化为1-2个具体可执行步骤，输出JSON数组。`),
    ]);
    const subSteps = JSON.parse(lowResp.content as string);
    detailedPlan.push(...subSteps);
  }

  return { plan: detailedPlan, currentStep: 0 };
}
```

### 概念八：优先级规划

```typescript
async function priorityPlanner(state: PlanState) {
  const response = await model.invoke([
    new SystemMessage(`将任务分解为步骤并标注优先级(HIGH/MEDIUM/LOW)。
输出：[{"step":"...","priority":"HIGH"},...]
先执行HIGH，再MEDIUM，最后LOW。`),
    new HumanMessage(state.messages[0].content),
  ]);

  const steps = JSON.parse(response.content as string);
  const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  steps.sort((a: any, b: any) => order[a.priority] - order[b.priority]);

  return { plan: steps.map((s: any) => `[${s.priority}] ${s.step}`), currentStep: 0 };
}
```

---

## 🔨 实战演练：完整研究规划 Agent

```typescript
const ResearchState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({ reducer: (p: any, c: any) => [...p, ...c], default: () => [] }),
  plan: Annotation<string[]>({ reducer: (p, c) => c, default: () => [] }),
  currentStep: Annotation<number>({ reducer: (p, c) => c, default: () => 0 }),
  observations: Annotation<string[]>({ reducer: (p: any, c: any) => [...p, ...c], default: () => [] }),
  finalReport: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  iterationCount: Annotation<number>({ reducer: (p, c) => p + c, default: () => 0 }),
});
type RS = typeof ResearchState.State;

const searchEngine = async (q: string) => `[搜索结果] ${q}: 相关内容...`;

async function planner(state: RS) {
  const resp = await model.invoke([
    new SystemMessage('将研究任务分解为3-6个步骤，输出JSON字符串数组。'),
    new HumanMessage(state.messages[0].content),
  ]);
  return { plan: JSON.parse(resp.content as string), currentStep: 0, observations: [] };
}

async function executor(state: RS) {
  const step = state.plan[state.currentStep];
  const result = await searchEngine(step);
  return {
    observations: [`步骤${state.currentStep + 1}: ${step} → ${result}`],
    currentStep: state.currentStep + 1,
    iterationCount: 1,
  };
}

function router(state: RS) {
  return state.currentStep >= state.plan.length ? 'finalizer' : 'executor';
}

async function finalizer(state: RS) {
  const resp = await model.invoke([
    new SystemMessage('基于观察结果撰写研究报告。'),
    new HumanMessage(`任务: ${state.messages[0].content}\n观察: ${JSON.stringify(state.observations)}`),
  ]);
  return { finalReport: resp.content as string };
}

const researchGraph = new StateGraph(ResearchState)
  .addNode('planner', planner).addNode('executor', executor).addNode('finalizer', finalizer)
  .addEdge(START, 'planner').addEdge('planner', 'executor')
  .addConditionalEdges('executor', router, { executor: 'executor', finalizer: 'finalizer' })
  .addEdge('finalizer', END).compile();

const rs = await researchGraph.invoke({
  messages: [new HumanMessage('分析AI大模型在代码生成领域的应用现状和趋势')],
});
console.log('研究报告:', rs.finalReport);
```

---

## ⚠️ 常见陷阱与最佳实践

| 陷阱 | 解决方案 |
|------|----------|
| 计划过于抽象 | 要求 LLM 生成具体可执行的步骤，含明确搜索词 |
| 步骤过多（>10） | 控制3-8步，超复杂任务用层次化规划 |
| 重规划过于频繁 | 仅在执行失败或发现关键新信息时触发 |
| 忽略步骤间依赖 | 规划时标注依赖关系，确保执行顺序正确 |

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Plan-and-Execute 相比 ReAct 的主要优势？**

> A：通过先制定完整计划再执行，减少了不必要的工具调用，避免"走一步看一步"导致的重复工作和上下文丢失。适合多步骤、有依赖关系的复杂任务。

**Q2：什么情况下应该触发重规划？**

> A：1）工具返回错误或空结果；2）发现新信息使原计划部分不再需要；3）执行结果与规划假设不符；4）用户中途提出新需求。

**Q3：如何控制规划粒度？**

> A：通过系统提示控制步骤数（3-8步），每步应为原子操作。超复杂任务使用层次化规划：高级分解→子任务细化。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 规划节点生成的步骤过于笼统，无法直接执行 | Prompt 未引导 LLM 分解出具体、可操作的单一步骤 | 在规划 Prompt 中要求步骤必须是「一个工具调用可完成的原子操作」 |
| 执行节点在步骤失败后未向规划节点反馈错误信息 | 执行节点未将工具返回的错误信息写入状态 | 在状态中增加 `stepError` 字段，将错误信息传递给重规划节点 |
| 重规划后 Agent 反复执行相同的失败步骤 | 重规划节点未标记已失败的步骤，导致重复尝试 | 在状态中维护已完成和失败的步骤列表，重规划时排除失败步骤 |
| 条件路由逻辑错误导致无法结束执行 | 结束条件判断过于严格或未定义明确的终止条件 | 设置清晰的结束条件（如所有步骤完成、达到最大重规划次数）并测试边界 |

---

## 📝 本章小结

- ✅ **Plan-and-Execute 架构** — 规划→执行→重规划的循环
- ✅ **规划节点** — 将任务分解为可执行的步骤列表
- ✅ **执行节点** — 按顺序执行每一步，调用工具
- ✅ **重规划节点** — 根据执行结果动态调整计划
- ✅ **条件路由** — 判断继续执行、重规划还是结束
- ✅ **层次化规划** — 多级分解策略
- ✅ **优先级规划** — 按 HIGH/MEDIUM/LOW 排序执行

## ➡️ 下一章预告

> [第4章：Human-in-the-Loop](./04-human-in-the-loop.md) — 当 Agent 不确定时，暂停并请求人工介入。
