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

#### 学术背景：Multi-Agent System（MAS）的起源

多 Agent 系统的概念并非 LLM 时代的产物。早在分布式人工智能（DAI）研究兴起的 1980-1990 年代，多 Agent 系统（MAS）理论就已形成。其核心思想是：**复杂问题可以通过多个具有有限能力和局部视角的智能体（Agent）协作来解决，每个 Agent 只专注于自己擅长的领域，通过通信和协调达成全局目标。**

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

#### 关键理论：从机器人学中借鉴的 MAS 原则

**1. 分布式问题求解（Distributed Problem Solving, DPS）**
- 问题被分解为多个子问题，分配给不同的 Agent
- 各 Agent 独立求解子问题，通过协商合并结果
- 与「分而治之」的思想一脉相承

**2. 涌现行为（Emergent Behavior）**
- 单个 Agent 的行为规则是简单的，但多个 Agent 交互时可以产生复杂的、非预期的集体行为
- 这在 LLM Agent 中同样存在——多个 Agent 协作时可能出现「集体智慧」效应，也可能出现「集体偏见」

**3. 合同网协议（Contract Net Protocol, CNP）**
- 经典 MAS 中的任务分配机制：管理者广播任务，各 Agent 投标，管理者选择最合适的 Agent
- 对应到 LLM Agent 就是 Supervisor 模式的「任务分析 → Agent 选择 → 委派执行」

**4. 信念-愿望-意图模型（BDI Model）**
- 经典 Agent 架构，将 Agent 的内部状态分为 Beliefs（对世界的认知）、Desires（目标）、Intentions（承诺执行的动作）
- 在 LLM Multi-Agent 中，每个 Agent 的 system prompt 定义了它的 BDI

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

---

## 🔨 实战演练

### 练习：搭建一个「写作 + 审查」双 Agent 协作系统

**场景描述：** 你的团队需要每周生成技术博客文章。目前的单 Agent 方案要么写得太技术化（普通读者看不懂），要么太浅显（缺乏技术深度）。你决定采用 Multi-Agent 方案：一个 Writer Agent 负责撰写，一个 Reviewer Agent 负责审查并提出改进建议，两者协作迭代直到文章达到质量标准。

**你的任务：** 基于本章的 `Supervisor` 模式设计，实现：
1. `WriterAgent` — 根据主题撰写技术文章，接受 Reviewer 的反馈并修改
2. `ReviewerAgent` — 审查文章，从「技术准确性」「可读性」「结构清晰度」三个维度评分
3. 最多 3 轮修改迭代，如果 Reviewer 评分达到 8/10 则通过

<details>
<summary>🧑‍💻 参考答案（先自己写）</summary>

```typescript
interface Article {
  title: string;
  content: string;
  score?: number;
}

class WriterAgent {
  async write(topic: string, feedback?: string): Promise<Article> {
    const context = feedback
      ? `\n\nReviewer 的反馈：${feedback}\n请根据上述反馈改进文章。`
      : '';
    return {
      title: topic,
      content: `关于「${topic}」的文章...（${context ? '已根据反馈修改' : '初稿'}）`,
    };
  }
}

class ReviewerAgent {
  async review(article: Article): Promise<{
    passed: boolean;
    score: number;
    feedback: string;
  }> {
    // 模拟审查
    const score = article.content.includes('已根据反馈修改') ? 9 : 6;
    const feedback = score >= 8
      ? '文章质量达标'
      : '建议增加更多代码示例，简化技术术语的解释';
    return { passed: score >= 8, score, feedback };
  }
}

async function writeWithReview(topic: string) {
  const writer = new WriterAgent();
  const reviewer = new ReviewerAgent();
  let feedback = '';

  for (let round = 1; round <= 3; round++) {
    console.log(`\n📝 第 ${round} 轮`);

    const article = await writer.write(topic, feedback);
    const review = await reviewer.review(article);

    console.log(`  评分: ${review.score}/10`);

    if (review.passed) {
      console.log('✅ 文章通过审查！');
      return article;
    }

    feedback = review.feedback;
    console.log(`  改进建议: ${feedback}`);
  }

  console.log('⚠️ 达到最大修改轮次');
  return null;
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧 1：为每个 Agent 分配独立的 system prompt「角色身份」

```typescript
const agentPersonas = {
  researcher: `你是研究型 Agent。你的职责是：
  - 深度搜索和分析信息
  - 提供有数据支撑的结论
  - 标注所有信息来源
  - 保持客观中立，不要给出主观意见`,

  writer: `你是写作型 Agent。你的职责是：
  - 将复杂的技术概念用通俗的语言表达
  - 保持文章结构清晰（引言→主体→结论）
  - 适当使用类比帮助读者理解
  - 控制文章长度在 1000-1500 字`,

  reviewer: `你是审查型 Agent。你的职责是：
  - 检查技术准确性和逻辑一致性
  - 评估可读性和结构完整性
  - 给出具体、可执行的改进建议
  - 按 1-10 分评分`,
};
```

### 技巧 2：用 Promise.all 并行执行独立子任务

```typescript
class ParallelSupervisor {
  async delegate(task: string, agents: Agent[]): Promise<Map<string, string>> {
    // 将任务分解为可并行的子任务
    const subtasks = await this.decompose(task);

    // 并行执行不依赖的步骤
    const results = new Map<string, string>();
    const parallelBatch = subtasks.filter(s => s.dependencies.length === 0);

    await Promise.all(parallelBatch.map(async (sub) => {
      const agent = this.selectAgent(sub, agents);
      results.set(sub.id, await agent.execute(sub.description));
    }));

    return results;
  }
}
```

### 技巧 3：实现 Agent 间消息传递的 timeout 机制

```typescript
class TimedMessageBus {
  async sendWithTimeout(
    message: AgentMessage,
    timeoutMs: number = 5000
  ): Promise<string> {
    const response = this.handlers.get(message.to);
    if (!response) throw new Error(`Agent ${message.to} 不可用`);

    // 使用 Promise.race 实现超时控制
    const result = await Promise.race([
      response(message),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Agent 响应超时')), timeoutMs)
      ),
    ]);

    return result;
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>Q1: 什么情况下应该选择 Multi-Agent 而不是单 Agent？</summary>

> A：Multi-Agent 适合以下场景：① **任务涉及多个专业领域**（如同时需要写代码、写文档、做设计）；② **需要多轮审查和迭代**（如代码审查→修复→再审查）；③ **任务可以自然分解为可并行的子任务**（如同时搜索多个信息源）；④ **需要不同「角色视角」**（如一个 Agent 写正面观点，另一个写反面观点）。如果任务简单、领域单一，单 Agent 更合适。
</details>

<details>
<summary>Q2: Multi-Agent 系统中的「涌现行为」可能带来什么风险？</summary>

> A：涌现行为是指多个 Agent 交互产生的、非预期的集体现象。风险包括：① **集体幻觉** — 多个 Agent 互相确认错误信息，形成「回音室效应」；② **过度协商** — Agent 间来回沟通但迟迟不做决策，浪费时间与 Token；③ **责任模糊** — 最终输出有错误时，难以追溯到是哪个 Agent 的问题。缓解方法包括引入 Supervisor 做决策仲裁、设置最大通信轮次、以及记录完整的通信日志用于追溯。
</details>

<details>
<summary>Q3: 合同网协议（Contract Net Protocol）在 LLM Multi-Agent 中如何落地？</summary>

> A：合同网协议的核心是「招标-投标-中标」机制。在 LLM Agent 中可以实现为：① **招标** — Supervisor 分析任务需求，生成任务描述（requirements）；② **投标** — 各 Agent 根据自身能力（system prompt 中定义的专业领域）判断是否能完成该任务，返回「我能做 + 我的方案」；③ **中标** — Supervisor 评估各 Agent 的方案，选择最合适的 Agent 执行。这种方式比简单的「按关键词匹配 Agent」更灵活、更准确。
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| 多个 Agent 之间互相等待，形成死锁 | Agent A 等待 Agent B 的结果，B 也在等待 A | 使用有向无环图（DAG）管理任务依赖关系，检测并禁止循环依赖；为每个等待操作设置超时 |
| 通信内容过于冗长，Agent 在「读消息」上消耗了大量 Token | Agent 间传递完整上下文而不是摘要 | 要求 Agent 在发送消息前先总结核心信息；对超过 500 字的消息强制截断并附上「更多信息可继续查询」的提示 |
| 多个 Agent 的上下文窗口被对方的输出快速填满 | 每次通信都将完整历史追加到所有 Agent 的 prompt 中 | 为每个 Agent 维护独立的、可配置的上下文窗口策略；使用共享黑板模式（shared blackboard）而非广播模式 |

---

## 📝 本章小结

## ➡️ 下一章预告

> [第7章：综合实战 — 手写 ReAct Agent](./07-capstone-react-agent.md) — 不依赖框架，从零实现一个完整的 Agent。
