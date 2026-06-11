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

## 📝 本章小结

- ✅ **循环控制** — 最大迭代、Token 预算、超时三重保护
- ✅ **状态机** — 用状态机管理 Agent 的生命周期
- ✅ **Token 预算** — 防止成本失控的必要手段
- ✅ **错误恢复** — 重试 + 退避 + 降级的策略组合

## ➡️ 下一章预告

> [第6章：Multi-Agent 初探](./06-multi-agent-intro.md) — 何时使用多个 Agent 协作。
