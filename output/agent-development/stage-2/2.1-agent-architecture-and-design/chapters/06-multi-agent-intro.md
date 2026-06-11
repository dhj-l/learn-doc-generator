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

## 📝 本章小结

- ✅ **选型依据** — 简单任务用单 Agent，复杂跨领域任务用 Multi-Agent
- ✅ **三种架构** — Supervisor（调度）、Hierarchical（层级）、Network（对等）
- ✅ **通信机制** — 消息传递和共享状态两种方式

## ➡️ 下一章预告

> [第7章：综合实战 — 手写 ReAct Agent](./07-capstone-react-agent.md) — 不依赖框架，从零实现一个完整的 Agent。
