# Agent 架构速查表

---

## 🏗️ 三大经典架构

| 架构 | 核心思想 | 适用场景 | 核心实现 |
|------|----------|----------|----------|
| **ReAct** | 推理+行动交替（Yao et al. 2022） | 通用任务 | `while(!done) { thought → action → observe }` |
| **Plan-and-Execute** | 先规划后执行 | 复杂多步任务 | `plan = planner(task); plan.forEach(executor.step)` |
| **Reflexion** | 尝试→评估→反思→重试（Shinn et al. 2023） | 迭代改进 | `for(i=0;i<max;i++){ result=try(task); self_eval(result) }` |

## 🔄 ReAct 循环核心代码

```typescript
async function reactLoop(task: string, maxSteps = 10) {
  let steps = 0;
  const messages = [{ role: 'user', content: task }];

  while (steps < maxSteps) {
    const response = await llm.call(messages);
    const action = parseAction(response);

    if (action.type === 'finish') return action.result;

    const observation = await executeTool(action);
    messages.push({ role: 'user', content: `观察: ${observation}` });
    steps++;
  }
  return '已超出最大步骤数';
}
```

## 🔄 ReAct 格式模板

```
Thought: [推理当前情况]
Action: [工具名(参数)]
Observation: [工具返回结果]
... 重复 ...
Thought: [总结并给出答案]
Action: finish("最终答案")
```

## 📋 Plan-and-Execute 实现

```typescript
class PlanAndExecute {
  async run(task: string) {
    // 1. 规划
    const plan = await this.planner.createPlan(task);
    // 2. 执行
    for (const step of plan.steps) {
      const result = await this.executor.execute(step);
      if (!result.success) {
        // 3. 调整
        const adjustedPlan = await this.planner.adjust(plan, result);
        return this.runWithPlan(adjustedPlan);
      }
    }
  }
}
```

## 🪞 Reflexion 实现

```typescript
async function reflexion(task: string, maxAttempts = 3) {
  let reflections: string[] = [];

  for (let i = 0; i < maxAttempts; i++) {
    const context = reflections.length > 0
      ? `之前的尝试和反思:\n${reflections.join('\n')}\n\n请基于反思改进。`
      : '';

    const result = await attempt(task, context);
    const evaluation = await evaluate(result);

    if (evaluation.passed) return result;

    const reflection = await reflect(task, result, evaluation);
    reflections.push(reflection);
  }
  throw new Error('达到最大尝试次数');
}
```

## 🏢 Multi-Agent 架构

| 架构 | 特点 | 适用场景 | 通信方式 |
|------|------|----------|----------|
| Supervisor | 中央调度 | 任务分配明确 | `supervisor.assign(task, agent)` |
| Hierarchical | 层级管理 | 大型复杂系统 | `manager.delegate(subTask, subAgent)` |
| Network | 对等协作 | 多角度分析 | `agents.broadcast(message).collect()` |

## ⚙️ Agent Loop 配置

```typescript
const agentConfig = {
  maxIterations: 10,      // 最大循环次数
  maxTokens: 100000,      // Token 预算
  maxTime: 300000,        // 超时（5 分钟）
  retryCount: 3,          // 错误重试次数
  backoffMs: 1000,        // 退避起始时间
  tools: ['search', 'calculate'],
  memory: { type: 'sliding_window', windowSize: 20 },
};
```

## 🔗 关键 API 速查

| API | 用途 | 示例 |
|-----|------|------|
| `parseAction()` | 解析 LLM 输出的 Action | `parseAction("Action: search(\"天气\")")` |
| `executeTool()` | 执行工具调用 | `const result = await executeTool(name, args)` |
| `evaluate()` | 评估结果质量 | `const score = evaluate(result, criteria)` |
| `reflect()` | 生成反思 | `const insight = reflect(task, result, eval)` |
| `createPlan()` | 生成执行计划 | `const plan = await planner.createPlan(task)` |
