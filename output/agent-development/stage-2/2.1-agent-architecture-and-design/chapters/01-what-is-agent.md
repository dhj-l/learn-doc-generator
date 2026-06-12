# 第1章：什么是 AI Agent — 从 Chatbot 到 Agent 的跨越

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **区分 Chatbot 和 Agent** — 理解两者本质的区别
- **理解 Agent 的核心定义** — 感知→推理→行动循环
- **识别 Agent 的核心组件** — LLM、工具、记忆、规划

## 📋 前置知识

> 建议先完成：[1.1 Prompt Engineering](../../stage-1/1.1-prompt-engineering/README.md) — Prompt 设计基础

---

## 💡 核心概念

### 概念一：Chatbot vs Agent

**生活类比：**
- Chatbot 像一个**电话客服** — 你问问题，它回答，但不会主动帮你做事
- Agent 像一个**私人助理** — 你说「帮我订明天去上海的机票」，它会自己查航班、比较价格、帮你下单

```
Chatbot 的工作模式：
  用户: "北京到上海的高铁多少钱？"
  AI:   "北京到上海的高铁票价约 553 元（二等座）。"  ← 只回答问题

Agent 的工作模式：
  用户: "帮我查一下明天最便宜的高铁票"
  AI:   思考 → 调用查询工具 → 比较价格 → "明天最便宜的是 G103 次，553 元"
       → 要不要帮你买？                              ← 主动行动+后续交互
```

| 维度 | Chatbot | Agent |
|------|---------|-------|
| 交互模式 | 一问一答 | 自主规划+执行 |
| 能力范围 | 文本生成 | 调用工具、访问外部系统 |
| 任务复杂度 | 单步 | 多步、可分解 |
| 自主性 | 低（被动响应） | 高（主动规划和行动） |
| 记忆 | 仅对话历史 | 可持久化长期记忆 |

### 概念二：Agent 的核心定义

```
AI Agent = LLM（大脑）+ 工具（手脚）+ 记忆（笔记本）+ 规划（路线图）

┌─────────────────────────────────────────┐
│                  AI Agent                │
│                                          │
│  ┌───────┐   ┌───────┐   ┌───────┐     │
│  │ 感知  │ → │ 推理  │ → │ 行动  │     │
│  │(输入) │   │(LLM)  │   │(工具) │     │
│  └───────┘   └───────┘   └───────┘     │
│       ↑                      │           │
│       └──────── 反馈 ────────┘           │
│                                          │
│  ┌───────┐   ┌───────┐                  │
│  │ 记忆  │   │ 规划  │                  │
│  └───────┘   └───────┘                  │
└─────────────────────────────────────────┘
```

#### 学术溯源：Russell & Norvig 的 Agent 框架

AI Agent 的概念并非 LLM 时代的发明。早在 1995 年，Russell 和 Norvig 在其经典教材 *Artificial Intelligence: A Modern Approach* 中就给出了 Agent 的正式定义：

> **An agent is anything that can be viewed as perceiving its environment through sensors and acting upon that environment through actuators.**

这一定义包含三个关键要素：
- **环境感知（Environment Sensing）** — Agent 通过传感器（sensors）获取环境状态。在 LLM Agent 中，传感器是输入文本（用户指令、系统消息、工具返回的观察结果）。
- **自主决策（Autonomous Decision-Making）** — Agent 根据感知到的信息，独立决定如何行动，而非简单地遵循预设规则。LLM 的推理能力使这成为可能。
- **作用于环境（Acting upon Environment）** — Agent 通过执行器（actuators）改变环境。在软件 Agent 中，执行器就是工具调用（function calling / tool use）。

Russel & Norvig 进一步将 Agent 按智能程度分为五类，这一分类体系在今天仍然适用：

| 类型 | 描述 | LLM Agent 对应 |
|------|------|---------------|
| Simple Reflex Agent | 基于当前感知直接反应 | — |
| Model-Based Agent | 维护内部世界模型 | 有记忆的 Agent |
| Goal-Based Agent | 根据目标选择行动 | 有规划能力的 Agent |
| Utility-Based Agent | 在不同方案中选择最优 | 带评分/评估的 Agent |
| Learning Agent | 从经验中学习改进 | 带反思机制的 Agent |

理解这一框架有助于我们认识到：**当前的 LLM Agent 实质上是 Goal-Based / Utility-Based Agent 的具体实现**，而 Reflexion（第4章）则向 Learning Agent 迈出了关键一步。

### 概念三：感知-推理-行动循环

这是 Agent 的核心执行模式：

```typescript
// Agent 核心循环（伪代码）
async function agentLoop(task: string) {
  let state = { task, observations: [], actions: [] };
  
  while (!isComplete(state)) {
    // 1. 感知（Perception）— 收集当前状态
    const context = buildContext(state);
    
    // 2. 推理（Reasoning）— LLM 决定下一步
    const decision = await llm.think(context);
    
    // 3. 行动（Action）— 执行决定
    const result = await executeAction(decision);
    
    // 4. 观察（Observation）— 记录结果
    state.observations.push(result);
    state.actions.push(decision);
    
    // 5. 检查是否完成
    if (decision.type === 'finish') break;
  }
  
  return state;
}
```

### 概念四：Agent 的四大核心组件

#### 1. LLM（大脑）

Agent 的「大脑」，负责理解任务、推理和决策。

```typescript
// LLM 在 Agent 中的角色
const llmRoles = {
  understanding: '理解用户的自然语言输入',
  reasoning: '分析当前状态，决定下一步行动',
  planning: '将复杂任务分解为子任务',
  generating: '生成人类可读的回复',
};
```

#### 2. 工具（手脚）

Agent 与外部世界交互的方式。没有工具，LLM 只能「说话」；有了工具，LLM 就能「做事」。

```typescript
const tools = {
  search: '搜索互联网',
  calculator: '进行数学计算',
  database: '查询数据库',
  fileSystem: '读写文件',
  api: '调用外部 API',
  codeExecutor: '执行代码',
};
```

#### 3. 记忆（笔记本）

```typescript
const memory = {
  shortTerm: '当前对话的上下文',      // 对话历史
  longTerm: '持久化存储的知识',       // 向量数据库
  working: '当前任务的中间结果',      // 临时状态
};
```

#### 4. 规划（路线图）

```typescript
const planning = {
  decomposition: '将大任务拆分为小步骤',
  prioritization: '决定先做什么',
  adaptation: '根据中间结果调整计划',
};
```

---

## 🔨 实战演练

### 练习：分析一个真实 Agent 系统的组件

**场景描述：** 你刚加入一个正在构建 AI 编程助手（类似 Claude Code、GitHub Copilot 或 Cursor）的团队。团队已经集成了 LLM 接口，但不确定是否真正具备了「Agent」能力。你需要从 Agent 的核心定义出发，分析现有系统并指出缺少哪些组件。

**你的任务：** 选择一个你熟悉的 AI 编程工具（或以下方的 Claude Code 为例），从 感知（Perception）、推理（Reasoning）、行动（Action）、记忆（Memory）、规划（Planning）五个维度分析其组件构成，并判断它属于 Russell & Norvig 分类中的哪一类 Agent。

<details>
<summary>🧑‍💻 参考答案（先自己分析完再展开）</summary>

以 Claude Code（你正在使用的工具）为例：

```
Claude Code Agent 分析：

🧠 LLM（大脑）：
  - Claude 模型作为推理引擎
  - 理解自然语言指令和代码上下文

🔧 工具（手脚）：
  - Read: 读取文件
  - Write: 写入文件
  - Edit: 编辑文件
  - Bash: 执行命令行
  - Grep: 搜索代码
  - Glob: 查找文件
  - Agent: 启动子代理

📝 记忆（笔记本）：
  - 短期记忆：当前对话的上下文
  - 长期记忆：CLAUDE.md、.claude/ 目录
  - 工作记忆：当前编辑的文件状态

🗺️ 规划（路线图）：
  - EnterPlanMode：规划模式
  - 分析任务 → 制定计划 → 逐步执行
  - 根据执行结果调整计划

🔄 感知-推理-行动循环：
  1. 感知：读取用户的指令和文件内容
  2. 推理：分析代码、制定修改方案
  3. 行动：编辑文件、执行命令
  4. 观察：检查执行结果
  5. 重复直到完成
```

</details>

---

## ⚡ 进阶技巧

### 技巧 1：使用类型系统确保 Agent 组件安全

```typescript
// 强类型定义 Agent 组件，避免运行时错误
type AgentComponent<T extends string> = {
  type: T;
  enabled: boolean;
  config: Record<string, unknown>;
};

// 使用模板字面量类型约束工具名称
type ToolName = 'search' | 'calculator' | 'read_file' | 'write_file';
type ToolCall = `${ToolName}(${string})`;  // "search(weather)" 合法

// 用 satisfies 关键字确保类型安全
const agent = {
  name: 'MyAgent',
  components: ['llm', 'tools', 'memory'] as const,
  // as const 让 TypeScript 推导出字面量类型
} satisfies { name: string; components: readonly string[] };
```

### 技巧 2：用 discriminated union 管理 Agent 状态

```typescript
// 每个状态携带不同的数据，TypeScript 自动收窄类型
type AgentState =
  | { status: 'idle' }
  | { status: 'thinking'; prompt: string; tokensBudget: number }
  | { status: 'acting'; toolName: string; args: unknown }
  | { status: 'observing'; observation: string }
  | { status: 'done'; result: string };

function handleState(state: AgentState) {
  switch (state.status) {
    case 'thinking':
      // TypeScript 知道这里可以访问 state.prompt 和 state.tokensBudget
      console.log(`Using ${state.tokensBudget} tokens for: ${state.prompt}`);
      break;
    case 'acting':
      console.log(`Calling ${state.toolName}`);
      break;
  }
}
```

### 技巧 3：用装饰器模式动态组合 Agent 能力

```typescript
// 基础 Agent 只具备核心推理能力
class BaseAgent {
  async think(prompt: string): Promise<string> {
    return `【推理结果】${prompt}`;
  }
}

// 装饰器：添加工具使用能力
class ToolUsingAgent {
  constructor(private base: BaseAgent) {}
  async think(prompt: string): Promise<string> {
    const result = await this.base.think(prompt);
    // 在推理结果之上添加工具调用解析
    return result + '\n[工具调用已注入]';
  }
}

// 装饰器：添加记忆能力
class MemoryAgent {
  constructor(private base: BaseAgent) {}
  async think(prompt: string): Promise<string> {
    const memory = await this.recall();
    return this.base.think(`[记忆上下文: ${memory}]\n${prompt}`);
  }
  private async recall() { return '历史对话摘要...'; }
}

// 组合使用
const agent = new MemoryAgent(new ToolUsingAgent(new BaseAgent()));
```

---

## 🧠 知识检查点

<details>
<summary>Q1: Agent 和 Chatbot 最本质的区别是什么？</summary>

> A：Agent 能够**自主行动**——它不仅能回答问题，还能主动调用工具、访问外部系统、规划和执行多步任务。Chatbot 只能被动回答，不能「做事」。从 Russell & Norvig 的定义来看，Chatbot 只有感知（读输入）和推理（生成回复），缺少「作用于环境」的 actuators 环节。
</details>

<details>
<summary>Q2: 没有工具的 LLM 能算 Agent 吗？</summary>

> A：严格来说不算。没有工具的 LLM 只是一个聊天系统。Agent 的核心特征是能够与外部世界交互——调用 API、读写文件、搜索信息等。工具是 Agent 从「思考者」变为「行动者」的关键。按照 Russell & Norvig 的分类，无工具的 LLM 连 Simple Reflex Agent 都算不上。
</details>

<details>
<summary>Q3: 为什么「记忆」是 Agent 区别于普通程序的重要特征？</summary>

> A：普通程序的状态是确定的、由开发者预定义的。而 Agent 的记忆（尤其是长期记忆）让它在运行时不断积累知识，从而能处理非结构化、开放式的任务。没有记忆，Agent 每次交互都得「从头开始」，无法从历史中学习，也无法维持连贯的多轮交互。记忆也是 Agent 从 Model-Based Agent 进化为 Learning Agent 的基石。
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| 认为「只要接入了 LLM 就是 Agent」 | 混淆了「对话模型」和「自主 Agent」的概念，忽略了工具调用和规划组件 | 检查系统是否具备感知→推理→行动的完整闭环，而不仅仅是文本生成 |
| 让 LLM 直接执行所有操作，不加安全边界 | 缺乏对工具调用的权限控制和确认机制 | 为每个工具设置独立的权限校验，关键操作（写文件、执行命令）加人工确认环节 |
| 只关注 LLM 选型，忽视工具和记忆设计 | 低估了工具接口质量和记忆策略对 Agent 整体效果的影响 | 在 Agent 架构设计阶段将工具 API 设计和记忆策略纳入关键考量，像设计产品一样设计工具 |

---

## 📝 本章小结

- ✅ **Agent 定义** — LLM + 工具 + 记忆 + 规划的综合体
- ✅ **感知-推理-行动循环** — Agent 的核心执行模式
- ✅ **四大组件** — 大脑（LLM）、手脚（工具）、笔记本（记忆）、路线图（规划）

## ➡️ 下一章预告

> [第2章：ReAct 模式](./02-react-pattern.md) — 最经典的 Agent 架构，推理与行动交替循环。
