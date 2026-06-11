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

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

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

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Agent 和 Chatbot 最本质的区别是什么？**

> A：Agent 能够**自主行动**——它不仅能回答问题，还能主动调用工具、访问外部系统、规划和执行多步任务。Chatbot 只能被动回答，不能「做事」。

**Q2：没有工具的 LLM 能算 Agent 吗？**

> A：严格来说不算。没有工具的 LLM 只是一个聊天系统。Agent 的核心特征是能够与外部世界交互——调用 API、读写文件、搜索信息等。工具是 Agent 从「思考者」变为「行动者」的关键。

</details>

---

## 📝 本章小结

- ✅ **Agent 定义** — LLM + 工具 + 记忆 + 规划的综合体
- ✅ **感知-推理-行动循环** — Agent 的核心执行模式
- ✅ **四大组件** — 大脑（LLM）、手脚（工具）、笔记本（记忆）、路线图（规划）

## ➡️ 下一章预告

> [第2章：ReAct 模式](./02-react-pattern.md) — 最经典的 Agent 架构，推理与行动交替循环。
