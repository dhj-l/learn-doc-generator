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

**预期输出：**
```
状态转换轨迹:
  idle → thinking (第 1 次迭代)
  thinking → acting
  acting → observing
  observing → thinking (第 2 次迭代)
  thinking → acting
  acting → completed

最终状态: completed (共 2 次迭代，耗时 3.2 秒)
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

**预期输出：**
```
Token 使用情况:
  总预算: 100000 tokens
  已使用: 2450 tokens
  剩余: 97550 tokens
  使用率: 2.45%

执行结果: 任务已完成（预算充足）
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

**预期输出：**
```
⚠️ 尝试 1/3 失败: 连接超时
   1000ms 后重试...
⚠️ 尝试 2/3 失败: 连接超时
   2000ms 后重试...
✅ 尝试 3/3 成功: 返回数据

如所有重试均失败，执行降级动作: report_error
```


---

## 🔨 实战演练

### 练习：为 ReAct Agent 添加循环控制系统

<details>
<summary>🧑‍💻 先自己动手实现，再展开参考答案</summary>

**场景描述：**
你之前实现的 ReAct Agent 没有任何安全保障。现在需要给 Agent 添加完整的循环控制：最大迭代次数、Token 预算、超时、退避重试和心跳检测。

**你的任务：**
1. 基于本章的 `AgentStateMachine` 和 `TokenBudgetedAgent`，创建一个 `SafeReActAgent`
2. 添加退避重试：当工具调用失败时，等待指数增长的时间后重试
3. 添加心跳检测：每 3 轮检查 Agent 是否卡住
4. 当 Token 预算低于 10% 时自动切换到节能模式

**参考实现结构：**
```typescript
class SafeReActAgent {
  private stateMachine: AgentStateMachine;
  private budget: TokenBudget;
  private heartbeat: HeartbeatMonitor;

  constructor(config: SaferAgentConfig) {
    this.stateMachine = new AgentStateMachine(config.maxIterations);
    this.budget = new TokenBudget(config.totalBudget);
    this.heartbeat = new HeartbeatMonitor();
  }

  async run(task: string): Promise<AgentResult> {
    // 主循环 + 安全检查 + 退避重试 + 心跳检测 + 优雅降级
    // ...
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：实现「优雅降级」的 Token 预算

当 Token 预算即将耗尽时，不是直接终止，而是逐步降级到更经济的模式：

```typescript
class GracefulDegradationAgent {
  private budget: TokenBudget;

  async run(task: string): Promise<string> {
    // 正常模式
    if (this.budget.remaining > 50000) {
      return this.runNormal(task);
    }

    // 节能模式 — 减少上下文、缩短响应
    if (this.budget.remaining > 10000) {
      return this.runEco(task);
    }

    // 极简模式 — 只回答最关键的信息
    return this.runMinimal(task);
  }

  private async runEco(task: string): Promise<string> {
    // 使用更短的 System Prompt，更小的 max_tokens
    // 压缩历史消息，只保留最近的 3 轮
    return '（节能模式运行中）';
  }

  private async runMinimal(task: string): Promise<string> {
    // 仅输出结果，不展示推理过程
    return '（极简模式运行中）';
  }
}
```

**预期输出：**
```
预算 > 50000 → 正常运行模式
预算 10000-50000 → 节能模式（压缩历史，缩短响应）
预算 < 10000 → 极简模式（仅输出关键结果，省略推理过程）

降级效果: Token 消耗降低约 60%，输出质量保持核心信息完整
```


### 技巧二：为循环添加「心跳检测」

定期的健康检查可以及早发现问题：

```typescript
interface Heartbeat {
  iteration: number;
  timestamp: number;
  state: AgentState;
  progressSinceLastBeat: boolean; // 本轮是否有实质进展
}

class HeartbeatMonitor {
  private beats: Heartbeat[] = [];

  check(agent: AgentContext): 'healthy' | 'stuck' | 'looping' {
    const last3 = this.beats.slice(-3);

    if (last3.length < 3) return 'healthy';

    // 检测是否卡住（连续 3 轮无进展）
    if (last3.every(b => !b.progressSinceLastBeat)) {
      return 'stuck';
    }

    // 检测是否在重复相同的 Action
    const actions = last3.map(b => b.state);
    if (new Set(actions).size === 1) {
      return 'looping';
    }

    return 'healthy';
  }
}
```

**预期输出：**
```
心跳检测结果:
  第 1-3 轮: healthy（每轮都有进展）
  第 4-6 轮: stuck（连续 3 轮无进展）
  第 7-9 轮: looping（重复执行相同操作）

建议: 触发 stuck 或 looping 时暂停 Agent，请求人工干预
```


### 技巧三：最终答案的「信心评分」

在执行结束时，让 LLM 对自己的答案做一个信心评估：

```typescript
interface FinalConfidence {
  score: number;        // 1-10 的信心评分
  confidence: 'high' | 'medium' | 'low';
  uncertainties: string[];  // 不确定的点
  suggestedVerification?: string; // 建议的验证方式
}

async function getConfidence(answer: string, trace: string[]): Promise<FinalConfidence> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `基于执行轨迹，给最终答案做信心评分（1-10）：
执行轨迹：${trace.join('\n')}
最终答案：${answer}

请输出 JSON：{"score": N, "confidence": "high|medium|low", "uncertainties": [...]}`,
    }],
  });
  // ...
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Agent Loop 设计中最重要的三个安全机制是什么？**

> A：最大迭代次数（maxIterations）防止无限循环；Token 预算（maxTokens）防止成本失控；超时控制（maxTime）防止长时间挂起。三者共同构成 Agent 的安全护栏。

**Q2：为什么 Agent 需要状态机管理？**

> A：状态机让 Agent 的行为可预测、可追踪。（1）明确每个阶段 Agent 在做什么（推理、执行、观察）；（2）方便实现暂停/恢复/中断等控制流；（3）通过状态转换日志可以回溯问题。

**Q3：什么是「退避重试」策略？为什么需要它？**

> A：退避重试（Exponential Backoff）是指失败后等待一段时间再重试，并且每次重试的等待时间指数增长。它防止了（1）对暂时性故障的频繁重试加重系统负担；（2）多个 Agent 同时重试造成「惊群效应」。是构建健壮 Agent 的必备策略。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 没有设置 maxIterations 导致死循环 | LLM 陷入重复模式，不断执行相同的 Action | 始终设置最大迭代次数（建议 10-20 步），并检测重复 Action |
| Token 预算耗尽时报错而非降级 | 预算耗尽后直接 throw error，没有给用户任何输出 | 实现优雅降级：预算不足时切换到更经济的模式或者给出部分结果 |
| 状态转换条件不完整导致状态泄露 | 某些路径下状态没有被正确更新 | 用状态机全覆盖所有转换路径，并添加状态不变量断言 |

---

## 📝 本章小结

- ✅ **循环控制** — 最大迭代、Token 预算、超时三重保护
- ✅ **状态机** — 用状态机管理 Agent 的生命周期
- ✅ **Token 预算** — 防止成本失控的必要手段
- ✅ **错误恢复** — 重试 + 退避 + 降级的策略组合

## ➡️ 下一章预告

> [第6章：Multi-Agent 初探](./06-multi-agent-intro.md) — 何时使用多个 Agent 协作。
