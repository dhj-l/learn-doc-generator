# 第6章：Multi-Agent 初探 — 多 Agent 协作

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **判断何时需要 Multi-Agent** — 单 Agent vs Multi-Agent 选型
- **理解主要的 Multi-Agent 架构** — Supervisor、Hierarchical、Network
- **设计 Agent 间通信机制** — 消息传递、共享状态

## 📋 前置知识

> 建议先完成：[第1章：什么是 Agent](./01-what-is-agent.md)

---

## 💡 核心概念

### 概念一：单 Agent vs Multi-Agent

```
单 Agent：
  一个 LLM 做所有事情
  ✅ 简单、成本低
  ❌ 复杂任务容易出错、上下文窗口有限

Multi-Agent：
  多个 Agent 各司其职，协作完成任务
  ✅ 专业化分工、可并行、可扩展
  ❌ 通信开销、协调复杂度高
```

| 选型维度 | 单 Agent | Multi-Agent |
|----------|----------|-------------|
| 任务复杂度 | 简单-中等 | 复杂 |
| 涉及领域 | 单一 | 跨领域 |
| 需要并行 | 否 | 是 |
| 容错要求 | 低 | 高（子 Agent 可互补） |
| 延迟要求 | 宽松 | 可通过并行优化 |

### 概念二：三种 Multi-Agent 架构

#### 1. Supervisor（管理者模式）

```
┌────────────────┐
│   Supervisor   │ ← 调度和分配任务
│   (管理者)      │
└──┬─────┬───┬──┘
   ↓     ↓   ↓
┌──┐  ┌──┐ ┌──┐
│A1│  │A2│ │A3│  ← 各个专家 Agent
└──┘  └──┘ └──┘
```

```typescript
// Supervisor 模式实现
interface Agent {
  name: string;
  expertise: string;
  execute: (task: string) => Promise<string>;
}

class Supervisor {
  private agents: Agent[];

  constructor(agents: Agent[]) {
    this.agents = agents;
  }

  async delegate(task: string): Promise<string> {
    // 1. 分析任务，选择最合适的 Agent
    const selectedAgent = await this.selectAgent(task);

    // 2. 分配任务
    const result = await selectedAgent.execute(task);

    // 3. 检查结果质量
    const quality = await this.evaluate(result);
    if (quality.score < 7) {
      // 质量不够，尝试另一个 Agent
      const alternative = this.agents.find(a => a.name !== selectedAgent.name);
      if (alternative) return alternative.execute(task);
    }

    return result;
  }

  private async selectAgent(task: string): Promise<Agent> {
    // LLM 决定哪个 Agent 最适合处理这个任务
    // 简化实现：关键词匹配
    for (const agent of this.agents) {
      if (task.includes(agent.expertise)) return agent;
    }
    return this.agents[0]; // 默认返回第一个
  }

  private async evaluate(result: string): Promise<{ score: number }> {
    return { score: 8 }; // 简化实现
  }
}
```

**预期输出：**
```
任务: "审查这段代码的安全性"
→ Supervisor 分析任务，选择 SecurityAgent
→ SecurityAgent 执行审查
→ 审查评分: 8/10
→ 结果: 未发现严重安全漏洞，建议添加输入验证
```


#### 2. Hierarchical（层级模式）

```
         ┌──────┐
         │ Boss │
         └──┬───┘
       ┌────┴────┐
    ┌──┴──┐  ┌──┴──┐
    │ Mgr │  │ Mgr │  ← 中层管理者
    └──┬──┘  └──┬──┘
    ┌──┼──┐  ┌──┼──┐
    ↓  ↓  ↓  ↓  ↓  ↓
   W1  W2 W3 W4 W5 W6  ← 工作 Agent
```

#### 3. Network（对等网络模式）

```
┌──┐  ┌──┐  ┌──┐
│A1│←→│A2│←→│A3│  ← 对等通信
└──┘  └──┘  └──┘
 ↕      ↕      ↕
┌──┐  ┌──┐  ┌──┐
│A4│←→│A5│←→│A6│
└──┘  └──┘  └──┘
```

### 概念三：Agent 间通信

```typescript
// 通信方式 1：消息传递
interface AgentMessage {
  from: string;
  to: string;
  content: string;
  type: 'request' | 'response' | 'broadcast';
}

class MessageBus {
  private handlers: Map<string, (msg: AgentMessage) => void> = new Map();

  subscribe(agentName: string, handler: (msg: AgentMessage) => void) {
    this.handlers.set(agentName, handler);
  }

  send(message: AgentMessage) {
    const handler = this.handlers.get(message.to);
    if (handler) handler(message);
  }
}

// 通信方式 2：共享状态
interface SharedState {
  data: Map<string, any>;
  get(key: string): any;
  set(key: string, value: any): void;
}
```

**预期输出：**
```
发送消息: 从 AgentA 到 AgentB
  内容: "请提供数据库查询结果"
  类型: request

AgentB 收到消息并处理
→ 回复: "查询完成，返回 3 条记录"
```


---

## 🔨 实战演练

### 练习：实现一个「代码审查」Multi-Agent 系统

<details>
<summary>🧑‍💻 先自己动手实现，再展开参考答案</summary>

**场景描述：**
你的团队需要一个自动化代码审查系统。三个专家 Agent 分别审查代码的不同方面：安全性（SecurityAgent）、性能（PerformanceAgent）和代码风格（StyleAgent），最后由一个 Supervisor 汇总结果。

**你的任务：**
1. 创建三个专家 Agent，各自负责一个审查维度
2. 实现 Supervisor 分发代码给所有 Agent 并行审查
3. 实现汇总逻辑：将三个 Agent 的审查结果合并为一份审查报告
4. 测试：给出一段包含安全漏洞、性能问题和风格问题的代码，验证系统能否发现所有问题

**参考实现结构：**
```typescript
interface ReviewResult {
  agent: string;
  issues: Array<{
    severity: 'critical' | 'major' | 'minor';
    line?: number;
    description: string;
    suggestion: string;
  }>;
}

class CodeReviewSupervisor {
  private agents: Agent[];

  async review(code: string): Promise<{
    summary: string;
    allIssues: ReviewResult[];
    overallScore: number;
  }> {
    // 并行审查
    const results = await Promise.all(
      this.agents.map(a => a.execute(code))
    );
    // 汇总评分
    return this.aggregate(results);
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：为 Multi-Agent 系统添加「通信合约」

Agent 间的通信应该遵循明确的接口协议，而不是随意传递字符串：

```typescript
// 定义 Agent 间的通信合约
interface AgentContract {
  // 每个 Agent 声明它能做什么
  capabilities: string[];
  // 每个 Agent 声明它需要什么
  requirements: string[];
  // 通信协议版本
  protocol: '1.0';
}

// 使用合约验证通信
function validateMessage(
  msg: AgentMessage,
  contract: AgentContract
): boolean {
  // 检查接收方是否支持这个请求类型
  return contract.capabilities.some(c =>
    msg.content.includes(c)
  );
}
```

### 技巧二：添加「投票仲裁」机制

当多个 Agent 给出不同答案时，引入投票或仲裁机制：

```typescript
interface Vote {
  agentName: string;
  answer: string;
  confidence: number;  // 1-10
  reasoning: string;
}

class Arbiter {
  async resolve(votes: Vote[]): Promise<{
    finalAnswer: string;
    consensusLevel: 'unanimous' | 'majority' | 'conflict';
  }> {
    // 计算加权答案
    const weightedAnswers = votes.reduce((acc, v) => {
      acc[v.answer] = (acc[v.answer] || 0) + v.confidence;
      return acc;
    }, {} as Record<string, number>);

    const topAnswer = Object.entries(weightedAnswers)
      .sort((a, b) => b[1] - a[1])[0];

    const totalConfidence = Object.values(weightedAnswers)
      .reduce((a, b) => a + b, 0);

    return {
      finalAnswer: topAnswer[0],
      consensusLevel: topAnswer[1] === totalConfidence
        ? 'unanimous' : 'majority',
    };
  }
}
```

**预期输出：**
```
投票结果:
  AgentA (security): 评分 8 — "代码安全"
  AgentB (performance): 评分 6 — "存在性能问题"
  AgentC (style): 评分 9 — "代码规范"

仲裁结果:
  最终评分: 7.7 (多数一致)
  共识级别: majority
```


### 技巧三：为 Supervisor 添加「负载均衡」

当多个 Agent 提供相同能力时，Supervisor 应该分散负载：

```typescript
class LoadBalancedSupervisor {
  private agentLoads: Map<string, number> = new Map();

  async selectAgent(task: string, candidates: Agent[]): Promise<Agent> {
    // 选择当前负载最低的 Agent
    const sorted = [...candidates].sort((a, b) => {
      const loadA = this.agentLoads.get(a.name) || 0;
      const loadB = this.agentLoads.get(b.name) || 0;
      return loadA - loadB;
    });

    const selected = sorted[0];
    this.agentLoads.set(
      selected.name,
      (this.agentLoads.get(selected.name) || 0) + 1
    );

    return selected;
  }

  releaseAgent(name: string) {
    const current = this.agentLoads.get(name) || 0;
    this.agentLoads.set(name, Math.max(0, current - 1));
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：什么情况下应该选择 Multi-Agent 而不是单 Agent？**

> A：（1）任务涉及多个专业领域（如医疗诊断+药物推荐+保险报销）；（2）需要并行处理提高效率；（3）单个 Agent 的上下文窗口不足以容纳所有信息；（4）系统需要高容错性——一个 Agent 失败不影响整体。

**Q2：Supervisor 架构和 Hierarchical 架构的核心区别？**

> A：Supervisor 是一个扁平的管理结构：一个调度者直接管理多个专家 Agent，Agent 之间不直接通信。Hierarchical 是多层结构：顶层管理者管理中层管理者，中层管理者再管理下层工作 Agent。Supervisor 适合中小规模系统，Hierarchical 适合大规模企业级系统。

**Q3：Multi-Agent 系统最大的挑战是什么？**

> A：（1）通信开销——Agent 间传递信息的 Token 成本；（2）协调复杂度——多个 Agent 的决策需要对齐，可能出现冲突；（3）调试困难——问题可能跨多个 Agent，追踪根因困难；（4）成本倍增——每个 Agent 都要调用 LLM。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 不必要的 Multi-Agent 化 | 一个 Agent 就能完成的任务，硬拆成多个，增加复杂度 | 遵循「先单 Agent，再拆分」原则，当单 Agent 遇到瓶颈时再考虑拆分 |
| Agent 间通信不设防 | Agent 直接信任其他 Agent 的消息，可能被误导 | 添加消息验证机制、签名、或由 Supervisor 仲裁 |
| 没有定义 Agent 的职责边界 | 多个 Agent 的职责重叠，导致冲突或重复工作 | 每个 Agent 有明确的 capability 声明，Supervisor 按能力分配任务 |

---

## 📝 本章小结

- ✅ **选型依据** — 简单任务用单 Agent，复杂跨领域任务用 Multi-Agent
- ✅ **三种架构** — Supervisor（调度）、Hierarchical（层级）、Network（对等）
- ✅ **通信机制** — 消息传递和共享状态两种方式

## ➡️ 下一章预告

> [第7章：综合实战 — 手写 ReAct Agent](./07-capstone-react-agent.md) — 不依赖框架，从零实现一个完整的 Agent。
