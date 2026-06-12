# 第4章：人机协作模式 — Human-in-the-Loop

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Human-in-the-Loop 的设计思想** — 在关键节点让人类介入审核
- **使用 `interrupt` 暂停和恢复 Agent** — 在指定节点暂停等待人类输入
- **实现审批流 Agent** — 高风险操作需要人工确认
- **构建人机协作的代码审查系统**

## 📋 前置知识

> 建议先完成：[第2章：内置 ReAct Agent](./02-react-agent.md)

---

## 💡 核心概念

### 概念一：为什么需要人机协作？

**生活类比：** 自动驾驶汽车大部分时间自己开，但在复杂路口、恶劣天气时会提醒驾驶员接管。Agent 也是如此——大部分推理可以自主完成，但关键决策（发送邮件、删除数据、支付操作）需要人类确认。

```
全自主 Agent 的风险：

Agent: 用户说"帮我清理邮箱"
  → 删除了所有邮件（包括重要合同）❌

人机协作 Agent：

Agent: 用户说"帮我清理邮箱"
  → 分析: 找到 500 封邮件，其中 450 封是广告，50 封是工作邮件
  → 暂停: "我建议删除 450 封广告邮件，保留 50 封工作邮件。确认？"
  → 人类: "确认"
  → 执行删除 ✅
```

### 概念二：使用 interrupt 实现暂停

```typescript
// src/01-human-in-loop.ts
import { StateGraph, START, END, Annotation, interrupt, MemorySaver } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

// 定义一个有风险的工具
const sendEmailTool = tool(
  async ({ to, subject, body }) => {
    // 实际发送邮件的逻辑
    console.log(`📧 发送邮件到 ${to}: ${subject}`);
    return `已发送邮件到 ${to}`;
  },
  {
    name: 'send_email',
    description: '发送邮件',
    schema: z.object({
      to: z.string().describe('收件人'),
      subject: z.string().describe('邮件主题'),
      body: z.string().describe('邮件正文'),
    }),
  }
);

// 使用 interrupt 实现人工审批
const HumanState = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
});

async function agentNode(state: typeof HumanState.State) {
  // Agent 推理
  const response = await model.invoke(state.messages);
  return { messages: [response] };
}

async function humanApprovalNode(state: typeof HumanState.State) {
  // interrupt 会暂停图的执行，等待人类输入
  const approval = interrupt({
    question: 'Agent 想执行以下操作，请确认：',
    action: state.messages[state.messages.length - 1].content,
  });

  // 人类回复后，图从这里恢复执行
  if (approval.approved) {
    return { messages: [{ role: 'system', content: '用户已批准，继续执行' }] };
  } else {
    return { messages: [{ role: 'system', content: '用户拒绝了操作，请重新规划' }] };
  }
}

// 构建图
const graph = new StateGraph(HumanState)
  .addNode('agent', agentNode)
  .addNode('human_approval', humanApprovalNode)
  .addEdge(START, 'agent')
  .addEdge('agent', 'human_approval')
  .addEdge('human_approval', END)
  .compile();

// 执行时需要提供 checkpointer
const checkpointer = new MemorySaver();
const app = graph.compile({ checkpointer });

// 第一次执行 — 会在 interrupt 处暂停
const threadId = 'thread-001';
let result = await app.invoke(
  { messages: [{ role: 'user', content: '帮我给 boss@company.com 发一封周报邮件' }] },
  { configurable: { thread_id: threadId } }
);

console.log('⏸️ Agent 已暂停，等待人类审批');
console.log('暂停状态:', result.__interrupt__);

// 模拟人类审批
result = await app.invoke(
  { approved: true },  // 人类的回复
  { configurable: { thread_id: threadId } }
);

console.log('✅ 执行完成');
```

### 概念三：审批流设计模式

```typescript
// src/02-approval-pattern.ts

// 模式 1：简单确认 — "是/否"
function simpleApproval(action: string) {
  return interrupt({
    type: 'confirm',
    message: `确认执行: ${action}?`,
  });
}

// 模式 2：选择式 — 从多个选项中选
function choiceApproval(options: string[]) {
  return interrupt({
    type: 'choice',
    message: '请选择操作方案：',
    options,
  });
}

// 模式 3：编辑式 — 修改后再执行
function editApproval(draft: string) {
  return interrupt({
    type: 'edit',
    message: '请审阅并修改以下草稿：',
    draft,
  });
}

// 模式 4：条件式 — 根据风险等级决定是否需要审批
function conditionalApproval(action: string, riskLevel: 'low' | 'medium' | 'high') {
  if (riskLevel === 'low') {
    return { approved: true };  // 低风险自动通过
  }
  if (riskLevel === 'medium') {
    return interrupt({ type: 'confirm', message: `中风险操作: ${action}，确认？` });
  }
  // 高风险需要二次确认
  return interrupt({ type: 'double-confirm', message: `⚠️ 高风险: ${action}，请二次确认` });
}
```

---

## 🔨 实战演练

### 练习：构建代码审查 Agent

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { StateGraph, START, END, Annotation, interrupt, MemorySaver } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

const ReviewState = Annotation.Root({
  code: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
  reviewComments: Annotation<string[]>({
    reducer: (p, c) => [...p, ...c],
    default: () => [],
  }),
  approved: Annotation<boolean>({ reducer: (_, c) => c, default: () => false }),
  revisedCode: Annotation<string>({ reducer: (_, c) => c, default: () => '' }),
});

async function reviewNode(state: typeof ReviewState.State) {
  const prompt = ChatPromptTemplate.fromTemplate(
    `你是一个代码审查专家。审查以下代码，列出问题和改进建议：

\`\`\`
{code}
\`\`\`

返回格式：
- 🔴 严重问题：...
- 🟡 改进建议：...
- 🟢 优点：...`
  );
  const chain = prompt.pipe(model);
  const response = await chain.invoke({ code: state.code });
  return { reviewComments: [response.content as string] };
}

async function humanReviewNode(state: typeof ReviewState.State) {
  // 暂停，让人类审阅 AI 的代码审查意见
  const humanFeedback = interrupt({
    type: 'edit',
    message: '以下是 AI 的代码审查意见，请确认或修改：',
    comments: state.reviewComments,
    originalCode: state.code,
  });

  return {
    approved: humanFeedback.approved,
    revisedCode: humanFeedback.revisedCode || state.code,
  };
}

async function finalizeNode(state: typeof ReviewState.State) {
  if (state.approved) {
    console.log('✅ 代码审查通过');
  } else {
    console.log('❌ 代码需要修改');
    console.log('修改后代码:', state.revisedCode);
  }
  return {};
}

const reviewGraph = new StateGraph(ReviewState)
  .addNode('review', reviewNode)
  .addNode('human_review', humanReviewNode)
  .addNode('finalize', finalizeNode)
  .addEdge(START, 'review')
  .addEdge('review', 'human_review')
  .addEdge('human_review', 'finalize')
  .addEdge('finalize', END)
  .compile();
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：带超时的中断恢复

当人类长时间未响应时，可以设置超时自动降级处理。

```typescript
async function approvalWithTimeout(state: typeof HumanState.State) {
  const approval = interrupt({
    question: '请确认此操作：',
    action: state.messages[state.messages.length - 1].content,
  });

  // 如果人类超时未响应，approval 可能为 null 或 undefined
  if (!approval || approval.timeout) {
    return { messages: [{ role: 'system', content: '审批超时，操作已取消' }] };
  }

  return approval.approved
    ? { messages: [{ role: 'system', content: '已批准，继续执行' }] }
    : { messages: [{ role: 'system', content: '已拒绝，取消操作' }] };
}
```

### 技巧二：多级审批流

高风险操作可以设置多级审批，需要多个角色确认才能执行。

```typescript
// 第一级：技术负责人审批
const techApproval = interrupt({ level: 'tech', message: '技术审核：...' });
// 第二级：业务负责人审批
const bizApproval = interrupt({ level: 'business', message: '业务审核：...' });

if (techApproval.approved && bizApproval.approved) {
  // 执行操作
}
```

### 技巧三：审批日志审计

每次中断和恢复都记录到日志中，方便事后审计。

```typescript
async function auditedApproval(state, logger) {
  const approval = interrupt({ ... });
  logger.log({
    action: 'human_approval',
    state: state.messages,
    decision: approval,
    timestamp: new Date().toISOString(),
  });
  return { ... };
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：使用 `interrupt` 暂停 Agent 时需要什么先决条件？**

> A：必须在编译图时提供 `checkpointer`（如 `MemorySaver`），并且每次 `invoke` 时传入 `thread_id`，否则中断状态无法保存和恢复。

**Q2：恢复执行时传入的数据如何被中断节点接收？**

> A：中断节点 `interrupt()` 的返回值就是恢复时传入的数据。第一次执行时 `interrupt` 抛出中断信号，第二次（恢复时）传入的数据作为返回值继续执行。

**Q3：多个中断点如何管理？**

> A：可以为每个中断点设置不同的 `name` 或使用不同的节点名称来区分。恢复时通过 `thread_id` 找到对应的中断点，LangGraph 会自动路由到正确的节点。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 执行时未提供 checkpointer | `interrupt` 需要检查点机制来保存暂停状态 | 在编译图时传入 `checkpointer: new MemorySaver()` |
| 恢复时未传入 thread_id | without `thread_id` 无法定位之前暂停的会话 | 每次 `invoke` 都传入 `{ configurable: { thread_id: '...' } }` |
| 中断节点返回了 undefined | 恢复执行时代码逻辑没有正确处理 `interrupt` 的返回值 | 检查 `interrupt()` 的返回值，确保节点在所有路径上都有 return |
| 人类审批数据格式不匹配 | `interrupt` 传入和返回的数据结构不一致 | 明确定义审批数据格式（如 `{ approved: boolean, comment?: string }`） |

---

## 📝 本章小结

- ✅ **interrupt()** — 在指定节点暂停，等待人类输入
- ✅ **MemorySaver** — 检查点保存状态，支持暂停和恢复
- ✅ **四种审批模式** — 确认、选择、编辑、条件审批
- ✅ **人机协作** — AI 自主处理常规决策，人类审核高风险操作

## ➡️ 下一章预告

> [第5章：子图与模块化](./05-subgraph.md) — 将复杂 Agent 拆分为可复用的子图。
