# 第5章：Agent Loop 设计 — 构建健壮的循环控制系统

> 预计学习时间：90-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **设计 Agent 的循环控制** — 合理的退出条件和最大迭代限制
- **实现状态管理** — Agent 状态机和工作流状态
- **构建错误恢复机制** — 超时、异常、死循环的处理

## 📋 前置知识

> 建议先完成：[第2章：ReAct](./02-react-pattern.md) 或 [第3章：Plan-and-Execute](./03-plan-and-execute.md)

---

## 💡 核心概念

### 概念一：Agent Loop 的关键设计决策

Agent Loop 是 Agent 的执行引擎核心，其设计质量直接影响 Agent 的可靠性、成本和用户体验。一个设计良好的 Agent Loop 需要在 控制、可见性、恢复力 三个维度上做好权衡。

```typescript
// Agent 循环控制的核心问题

interface AgentLoopConfig {
  maxIterations: number;      // 最大循环次数（防止死循环）
  maxTokens: number;          // 总 Token 预算（防止成本失控）
  maxTime: number;            // 最大执行时间（毫秒）
  exitConditions: ExitCondition[];  // 退出条件列表
}

type ExitCondition =
  | { type: 'task_complete' }          // 任务完成
  | { type: 'max_iterations' }         // 达到最大迭代
  | { type: 'max_tokens' }             // 达到 Token 预算
  | { type: 'timeout' }                // 超时
  | { type: 'error' }                  // 不可恢复的错误
  | { type: 'human_interrupt' }        // 人工中断
  | { type: 'confidence_below'; threshold: number }; // 置信度过低
```

#### Agent Loop 的优化策略

**1. 动态 Token 预算分配**

并非所有任务都需要相同的 Token 预算。简单问题用少量 Token 就能解决，复杂问题则需要更多。采用 **自适应预算分配** 可以显著降低成本：

- **Phase-based budgeting** — 将 Loop 分为初始推理阶段（用较少的 max_tokens）和深入执行阶段（逐步增加预算）。如果 Agent 在前 2 步就完成了任务，不会为「可能出现的下一步」预留 Token。
- **Budget 预警** — 当剩余 Token 低于阈值时，提示 Agent 优先给出结论而非继续探索。

**2. 优雅降级（Graceful Degradation）**

当 Agent 遇到无法恢复的错误时，不应直接崩溃，而应：
- 返回已完成的子任务结果 + 失败步骤的说明
- 给用户提供「Partial Answer（部分答案）」而非「Error」
- 记录失败轨迹供后续分析

```typescript
// 优雅降级：返回已完成的部分结果
type AgentResult =
  | { status: 'complete'; answer: string; steps: number }
  | { status: 'partial'; answer: string; steps: number; unfinished: string[] }
  | { status: 'failed'; error: string; steps: number };
```

**3. 成本可见性**

在生产环境中，Agent 的成本不可见是最大的隐患。建议在 Loop 中嵌入实时成本追踪：
- 每次 LLM 调用后计算成本（input_tokens × 单价 + output_tokens × 单价）
- 在 Agent 返回结果时附带成本报告
- 设置每日/每次调用的成本上限

### 概念二：Agent 状态机

```typescript
// src/agent-state-machine.ts

type AgentState =
  | 'idle'          // 空闲
  | 'thinking'      // LLM 推理中
  | 'acting'        // 执行工具中
  | 'observing'     // 等待观察结果
  | 'reflecting'    // 反思中
  | 'completed'     // 任务完成
  | 'failed'        // 任务失败
  | 'paused';       // 暂停（等待人工输入）

interface AgentContext {
  state: AgentState;
  task: string;
  history: Array<{
    state: AgentState;
    timestamp: number;
    data: any;
  }>;
  iterationCount: number;
  totalTokens: number;
  startTime: number;
}

class AgentStateMachine {
  private context: AgentContext;
  private config: AgentLoopConfig;

  constructor(task: string, config: AgentLoopConfig) {
    this.config = config;
    this.context = {
      state: 'idle',
      task,
      history: [],
      iterationCount: 0,
      totalTokens: 0,
      startTime: Date.now(),
    };
  }

  // 状态转换
  transition(newState: AgentState, data?: any): boolean {
    // 检查是否应该退出
    const exitReason = this.checkExitConditions();
    if (exitReason) {
      this.context.state = exitReason === 'task_complete' ? 'completed' : 'failed';
      return false;
    }

    // 记录历史
    this.context.history.push({
      state: this.context.state,
      timestamp: Date.now(),
      data,
    });

    this.context.state = newState;

    if (newState === 'thinking') {
      this.context.iterationCount++;
    }

    return true;
  }

  private checkExitConditions(): string | null {
    if (this.context.iterationCount >= this.config.maxIterations) return 'max_iterations';
    if (this.context.totalTokens >= this.config.maxTokens) return 'max_tokens';
    if (Date.now() - this.context.startTime > this.config.maxTime) return 'timeout';
    return null;
  }

  getState(): AgentContext { return { ...this.context }; }
}
```

### 概念三：带 Token 预算的 Agent Loop

```typescript
// src/token-budget-agent.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

interface TokenBudget {
  total: number;
  spent: number;
  remaining: number;
}

class TokenBudgetedAgent {
  private budget: TokenBudget;
  private messages: Anthropic.MessageParam[] = [];

  constructor(totalBudget: number = 100000) {
    this.budget = { total: totalBudget, spent: 0, remaining: totalBudget };
  }

  async run(task: string, tools: Record<string, Function>): Promise<string> {
    this.messages = [{ role: 'user', content: task }];

    while (this.budget.remaining > 1000) { // 保留 1000 Token 余量
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20241022',
        max_tokens: Math.min(2048, this.budget.remaining - 500),
        messages: this.messages,
      });

      // 更新 Token 使用
      this.budget.spent += response.usage.input_tokens + response.usage.output_tokens;
      this.budget.remaining = this.budget.total - this.budget.spent;

      const text = response.content[0].type === 'text' ? response.content[0].text : '';

      // 检查是否结束
      if (response.stop_reason === 'end_turn') {
        return text;
      }

      // 处理工具调用...
      this.messages.push({ role: 'assistant', content: text });
    }

    return 'Token 预算已耗尽';
  }

  getBudget(): TokenBudget { return { ...this.budget }; }
}
```

### 概念四：错误恢复策略

```typescript
// src/error-recovery.ts

interface RecoveryStrategy {
  maxRetries: number;
  backoffMs: number;       // 退避时间
  fallbackAction: string;  // 降级动作
}

const DEFAULT_STRATEGY: RecoveryStrategy = {
  maxRetries: 3,
  backoffMs: 1000,
  fallbackAction: 'report_error',
};

async function withRecovery<T>(
  action: () => Promise<T>,
  strategy: RecoveryStrategy = DEFAULT_STRATEGY
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < strategy.maxRetries; attempt++) {
    try {
      return await action();
    } catch (error) {
      lastError = error as Error;
      const delay = strategy.backoffMs * Math.pow(2, attempt);
      console.warn(`⚠️ 尝试 ${attempt + 1}/${strategy.maxRetries} 失败: ${lastError.message}`);
      console.warn(`   ${delay}ms 后重试...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // 所有重试失败，执行降级动作
  console.error(`❌ 所有重试失败，执行降级动作: ${strategy.fallbackAction}`);
  throw lastError;
}
```

---

## 🔨 实战演练

### 练习：为 Agent Loop 添加实时成本监控

**场景描述：** 你的 Agent 在生产环境中运行一周后，团队发现成本远超预期。有些用户的请求触发了 20+ 次 LLM 调用，消耗了数十万 Token。你需要在不影响用户体验的前提下，为 Agent Loop 添加成本控制机制。

**你的任务：** 基于本章的 `TokenBudgetedAgent` 类，实现以下功能：
1. 在 Loop 中实时追踪每次 LLM 调用的 Token 消耗
2. 在每个步骤后输出当前成本汇总（已用 Token、剩余预算、预估成本）
3. 当成本超过预算的 80% 时，给 Agent 发送警告消息，引导其尽快收尾
4. 当预算耗尽时，优雅地返回当前已完成的中间结果

<details>
<summary>🧑‍💻 参考答案（先自己写）</summary>

```typescript
interface CostReport {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  budget: number;
  budgetUsagePercent: number;
  estimatedCostUSD: number;
  stepCount: number;
}

class MonitoredAgent extends TokenBudgetedAgent {
  private report: CostReport = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    budget: 100000,
    budgetUsagePercent: 0,
    estimatedCostUSD: 0,
    stepCount: 0,
  };

  // 每步调用后更新报告
  private updateReport(inputTokens: number, outputTokens: number) {
    this.report.totalInputTokens += inputTokens;
    this.report.totalOutputTokens += outputTokens;
    this.report.totalTokens += inputTokens + outputTokens;
    this.report.budgetUsagePercent =
      (this.report.totalTokens / this.report.budget) * 100;
    // Claude Sonnet 约 $3/M input tokens, $15/M output tokens
    this.report.estimatedCostUSD =
      (this.report.totalInputTokens / 1_000_000) * 3 +
      (this.report.totalOutputTokens / 1_000_000) * 15;
    this.report.stepCount++;
  }

  getReport(): CostReport {
    return { ...this.report };
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧 1：使用 Interrupt 模式处理人工介入

```typescript
class InterruptibleAgentLoop {
  private interruptRequested = false;

  // 暴露中断接口，允许外部（如 HTTP 请求）触发中断
  requestInterrupt(reason: string) {
    this.interruptRequested = true;
    console.log(`🛑 中断请求: ${reason}`);
  }

  async run(task: string): Promise<string> {
    for (let step = 0; step < this.maxSteps; step++) {
      // 每次迭代前检查中断
      if (this.interruptRequested) {
        return `【任务被中断】当前进展: ${this.getProgress()}`;
      }
      // ... 正常执行逻辑
    }
  }

  private getProgress(): string {
    return `已完成 ${this.completedSteps} 步`;
  }
}
```

### 技巧 2：用结构化的日志记录每步执行详情

```typescript
interface StepLog {
  step: number;
  timestamp: string;
  duration: number;     // 毫秒
  tokensUsed: number;
  state: AgentState;
  action: string;
  observation: string;
  error?: string;
}

class Logger {
  private logs: StepLog[] = [];

  log(entry: Omit<StepLog, 'timestamp' | 'step'>) {
    this.logs.push({
      step: this.logs.length + 1,
      timestamp: new Date().toISOString(),
      ...entry,
    });
  }

  // 提供查询接口
  findErrors(): StepLog[] {
    return this.logs.filter(l => l.state === 'failed');
  }

  totalTokens(): number {
    return this.logs.reduce((sum, l) => sum + l.tokensUsed, 0);
  }
}
```

### 技巧 3：用 Racer 模式提前终止（Speculative Early Exit）

```typescript
// 当 Agent 在 N 步内没有产生新的有用信息时提前终止
async function runWithEarlyExit(
  agentLoop: () => AsyncGenerator<string>,
  stalenessThreshold: number = 3
) {
  let staleSteps = 0;
  let lastObservation = '';

  for await (const step of agentLoop()) {
    if (step === lastObservation) {
      staleSteps++;
      if (staleSteps >= stalenessThreshold) {
        return '【提前终止】Agent 陷入重复循环';
      }
    } else {
      staleSteps = 0;
      lastObservation = step;
    }
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>Q1: Agent Loop 设计中为什么需要「三重保护」（最大迭代 + Token 预算 + 超时）？</summary>

> A：三重保护从三个维度防止 Agent 失控：**最大迭代**防止语义层面的死循环（Agent 不断思考但不推进）；**Token 预算**控制成本上限，防止单次请求消耗过多资源；**超时**防止 LLM 响应或工具调用挂起导致的无限等待。三者互补——任何一个单独都不能完全覆盖所有失控场景。
</details>

<details>
<summary>Q2: 「优雅降级（Graceful Degradation）」在 Agent Loop 中具体指什么？</summary>

> A：优雅降级是指当 Agent 遇到无法恢复的错误（如工具不可用、Token 耗尽、上下文溢出）时，不直接抛出异常或返回空结果，而是：① 返回已完成部分的成果（部分答案）；② 清晰告知用户哪些步骤已完成、哪些未完成及原因；③ 提供继续任务的入口（如「点击这里从失败步骤继续」）。这比完全失败的用户体验要好得多。
</details>

<details>
<summary>Q3: Agent Loop 中如何避免「过早停止」——Agent 任务没完成就以为完成了？</summary>

> A：过早停止是一个常见问题。缓解策略包括：① **要求 Agent 显式总结完成的工作** — 在 finish() 前必须列出所有子任务及其完成状态；② **使用两步确认** — 让 Agent 在输出 finish 前先生成一个「完成确认」消息，由另一个 LLM 调用验证是否真的完成了所有要求；③ **检查列表法** — 在 prompt 中嵌入初始任务清单，要求 Agent 逐一标记完成状态，减少遗漏。
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| Agent 在「思考→行动→观察」中循环但没有任何进展 | LLM 不理解任务或缺乏足够的上下文来决定下一步 | 在 prompt 中加入「当连续 3 步都没有推进任务时，输出 finish(当前总结)」的指令；实现前面提到的 Racer 模式检测 |
| Token 预算设置过小，Agent 经常在即将完成时被截断 | 预算设置没有考虑任务复杂度波动 | 采用动态预算：简单任务用 20K，中等任务用 50K，复杂任务用 100K+；或者在预算耗尽前 20% 时发送「请尽快收尾」的提示 |
| 超时设置与工具执行时间不匹配（如搜索 API 偶尔需要 30 秒） | 超时设置未考虑工具调用延迟，用 Agent 层面统一的超时覆盖了工具调用 | 区分 Agent 级别超时（整体执行时间）和工具级别超时（单次调用时间），分别设置；对慢工具使用异步超时包装 |

---

## 📝 本章小结

## ➡️ 下一章预告

> [第6章：Multi-Agent 初探](./06-multi-agent-intro.md) — 何时使用多个 Agent 协作。
