# 第4章：Human-in-the-Loop — 让人参与决策

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Human-in-the-Loop 的必要性** — 为什么 Agent 需要人工介入
- **使用 `interruptBefore` 中断执行** — 在关键节点暂停
- **实现审批流程** — 人工审核后再继续
- **管理执行状态** — 检查点保存与恢复
- **设计人机协作工作流** — 高效的人机交互模式

---

## 💡 为什么需要 Human-in-the-Loop？

### 概念一：Agent 的信任边界

**生活类比：** 想象你让一个实习生去发公司邮件。如果他直接就能发送所有邮件（完全自主），可能会发出错误内容。更好的方式是：他写好邮件草稿 → 给你审核 → 你批准后再发送。这就是 Human-in-the-Loop（人机协作）的核心思想。

```
// ❌ 完全自主的 Agent（高风险）
const fullAutoAgent = createReactAgent({ llm: model, tools: [sendEmailTool] });
await fullAutoAgent.invoke({ messages: [humanMessage] });

// ✅ Human-in-the-Loop Agent（可控）
const safeAgent = graph.compile({ interruptBefore: ['send_email'] });
// Agent 在发送邮件前暂停，等待人工审核
```

> **💡 为什么需要 Human-in-the-Loop？**
>
> AI Agent 并非万无一失。关键场景需要人工介入：1）**高价值决策** — 金融交易、医疗诊断；2）**不可逆操作** — 发送邮件、删除数据；3）**边界情况** — Agent 不确定或超出能力范围；4）**安全审核** — 防止有害内容输出。Human-in-the-Loop 让 Agent 既保持自动化效率，又在关键节点保留人类判断力。

### 概念二：核心机制

LangGraph 通过**检查点**（Checkpoint）和**中断**（Interrupt）实现 Human-in-the-Loop：

```
正常执行流：
  START → agent_node → tools → agent_node → END

HITL 执行流：
  START → agent_node → 
                       ● INTERRUPT（暂停，等待人工）
                       ↓
                    [人工审核状态、批准/拒绝]
                       ↓
                       ● RESUME（继续执行）
                          → tools → agent_node → END
```

---

## 🔧 中断与恢复

### 概念三：使用 `interruptBefore` 和 `interruptAfter`

```typescript
import { StateGraph, START, END, Annotation, MemorySaver } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// 定义工具
const emailTool = tool(
  async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
    return `邮件已发送到 ${to}`;
  },
  {
    name: 'send_email',
    description: '发送电子邮件',
    schema: z.object({
      to: z.string().describe('收件人邮箱'),
      subject: z.string().describe('邮件主题'),
      body: z.string().describe('邮件正文'),
    }),
  }
);

// 构建可中断的 Agent
const agent = createReactAgent({
  llm: new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' }),
  tools: [emailTool],
});

const app = agent.compile({
  checkpointer: new MemorySaver(),
  interruptBefore: ['tools'], // 工具执行前暂停
});

// 执行——在 tools 节点前中断
async function runWithInterrupt() {
  const result = await app.invoke(
    { messages: [new HumanMessage('给 zhangsan@company.com 发邮件，主题"项目进度更新"')] },
    { configurable: { thread_id: 'email-thread-001' } }
  );
  console.log('📌 Agent 已暂停，等待人工审核...');
}
```

### 概念四：检查点状态管理

```typescript
// 获取当前状态（含中断信息）
async function inspectState(threadId: string) {
  const state = await app.getState({ configurable: { thread_id: threadId } });
  console.log('下一节点:', state.next); // 包含 'tools' 表示等待工具执行
  return state;
}

// 获取执行历史
async function getHistory(threadId: string) {
  const history = [];
  for await (const state of app.getStateHistory({ configurable: { thread_id: threadId } })) {
    history.push({ state: state.values, next: state.next });
  }
  return history;
}
```

### 概念五：恢复执行

```typescript
// 方案一：批准后继续
async function approveAndContinue(threadId: string) {
  const state = await app.getState({ configurable: { thread_id: threadId } });
  const lastMsg = state.values.messages[state.values.messages.length - 1];

  console.log('📋 待审核的工具调用:');
  if (lastMsg.tool_calls) {
    for (const tc of lastMsg.tool_calls) {
      console.log(`  工具: ${tc.name}, 参数: ${JSON.stringify(tc.args)}`);
    }
  }

  // 审批通过，继续执行
  const result = await app.invoke(null, { configurable: { thread_id: threadId } });
  return result;
}

// 方案二：修改参数后继续
async function modifyAndContinue(threadId: string) {
  const state = await app.getState({ configurable: { thread_id: threadId } });
  const lastMsg = state.values.messages[state.values.messages.length - 1];

  if (lastMsg.tool_calls) {
    // 人工修改工具参数
    lastMsg.tool_calls[0].args.body = '修改后的正文内容...';
  }

  await app.updateState({ configurable: { thread_id: threadId } }, { messages: [lastMsg] });
  const result = await app.invoke(null, { configurable: { thread_id: threadId } });
  return result;
}

// 方案三：取消执行（不调用 invoke，丢弃线程）
async function cancelExecution(threadId: string) {
  console.log('❌ 操作已取消');
}
```

---

## 🎯 高级人机协作模式

### 概念六：多级审批流程

```typescript
const ApprovalState = Annotation.Root({
  messages: Annotation<any[]>({ reducer: (p: any, c: any) => [...p, ...c], default: () => [] }),
  approvalLevel: Annotation<string>({ reducer: (_, c) => c, default: () => 'none' }),
  approvedBy: Annotation<string[]>({ reducer: (p: any, c: any) => [...p, ...c], default: () => [] }),
});

async function draftProposal(state: typeof ApprovalState.State) {
  return { messages: [new AIMessage('提案草稿：...')], approvalLevel: 'manager' };
}
async function managerReview(state: typeof ApprovalState.State) {
  return { approvalLevel: 'director', approvedBy: ['manager'] };
}
async function directorReview(state: typeof ApprovalState.State) {
  return { approvedBy: [...state.approvedBy, 'director'] };
}

const approvalGraph = new StateGraph(ApprovalState)
  .addNode('draft', draftProposal)
  .addNode('manager_review', managerReview)
  .addNode('director_review', directorReview)
  .addNode('execute', async (s) => ({ messages: [new AIMessage('提案已批准，开始执行')] }))
  .addEdge(START, 'draft').addEdge('draft', 'manager_review')
  .addEdge('manager_review', 'director_review')
  .addEdge('director_review', 'execute').addEdge('execute', END)
  .compile({
    checkpointer: new MemorySaver(),
    interruptBefore: ['manager_review', 'director_review'], // 两级审批
  });
```

### 概念七：选择性中断

```typescript
// 根据条件决定是否中断
async function conditionalAgentNode(state: any) {
  const response = await model.invoke(state.messages);
  const content = response.content as string;
  const highRiskActions = ['send_email', 'delete_file', 'execute_command'];
  const needsApproval = highRiskActions.some(a => content.toLowerCase().includes(a));
  return { messages: [response], needsHumanApproval: needsApproval };
}

function shouldInterrupt(state: any): string {
  return state.needsHumanApproval ? 'human_review' : 'continue';
}

const conditionalGraph = new StateGraph(Annotation.Root({
  messages: Annotation<any[]>({ reducer: (p: any, c: any) => [...p, ...c], default: () => [] }),
  needsHumanApproval: Annotation<boolean>({ reducer: (_, c) => c, default: () => false }),
}))
  .addNode('agent', conditionalAgentNode)
  .addNode('human_review', async (s) => ({ needsHumanApproval: false }))
  .addNode('continue', async (s) => s)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', shouldInterrupt, { human_review: 'human_review', continue: 'continue' })
  .addEdge('human_review', 'continue').addEdge('continue', END)
  .compile({ checkpointer: new MemorySaver(), interruptBefore: ['human_review'] });
```

---

## 🔨 实战演练：带审批的邮件助手

```typescript
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { MemorySaver } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const sendEmail = tool(
  async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
    console.log(`\n📧 邮件已发送到 ${to}\n`);
    return `邮件成功发送到 ${to}`;
  },
  { name: 'send_email', description: '发送邮件（发送前需人工审核）',
    schema: z.object({ to: z.string(), subject: z.string(), body: z.string() }) }
);

const emailAgent = createReactAgent({
  llm: new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022', temperature: 0.1 }),
  tools: [sendEmail],
  systemMessage: new SystemMessage('你是专业的邮件助手。撰写邮件后展示给用户确认。'),
});

const emailApp = emailAgent.compile({
  checkpointer: new MemorySaver(),
  interruptBefore: ['tools'],
});

// 完整使用流程
async function emailWorkflow() {
  const threadId = 'email-demo';

  // Step 1: 用户提出需求
  await emailApp.invoke(
    { messages: [new HumanMessage('给 pm@company.com 发邮件，同步Q2项目进度')] },
    { configurable: { thread_id: threadId } }
  );

  // Step 2: 展示待审核内容
  const state = await emailApp.getState({ configurable: { thread_id: threadId } });
  const lastMsg = state.values.messages[state.values.messages.length - 1];
  console.log('📋 待审核:');
  if (lastMsg.tool_calls) {
    for (const tc of lastMsg.tool_calls) {
      console.log(`  收件人: ${tc.args.to}\n  主题: ${tc.args.subject}\n  正文: ${tc.args.body}`);
    }
  }

  // Step 3: 审批通过
  console.log('\n✅ 审批通过，发送中...');
  const result = await emailApp.invoke(null, { configurable: { thread_id: threadId } });
  console.log('🎉 完成:', result.messages[result.messages.length - 1].content);
}
```

---

## ⚠️ 常见陷阱与最佳实践

```typescript
// ❌ 忘记 thread_id
const r1 = await app.invoke({ messages: [msg] });
const r2 = await app.invoke(null); // 新会话，不会恢复

// ✅ 正确：相同 thread_id 恢复
const r1 = await app.invoke({ messages: [msg] }, { configurable: { thread_id: 'fix-001' } });
const r2 = await app.invoke(null, { configurable: { thread_id: 'fix-001' } });

// ❌ 生产环境用 MemorySaver（服务重启丢失）
// ✅ 使用持久化存储
// import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：`interruptBefore` 和 `interruptAfter` 的区别？**

> A：`interruptBefore` 在节点执行前中断（审批场景：先审核再执行）。`interruptAfter` 在节点执行后中断（审核执行结果）。

**Q2：如何实现多次中断？**

> A：编译时传入多个节点：`interruptBefore: ['node1', 'node3', 'node5']`。每次恢复后运行到下一个中断点。

**Q3：恢复时传入 `null` 和新消息有何不同？**

> A：`null` 不添加消息，从暂停处继续。新消息会在执行前添加该消息，用于补充指令或修改方向。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 中断后恢复执行时状态丢失或混乱 | 未使用相同的 `thread_id` 恢复检查点 | 每次中断后恢复时，必须传入与中断时完全相同的 `thread_id` |
| 在 `updateState` 中修改了只读字段导致恢复失败 | 某些状态字段被标记为不可修改 | 在定义 State 时明确字段的读写权限，只修改允许更新的字段 |
| 中断点设置过多导致用户体验差 | 每个步骤都要求人工审批，流程冗长 | 只在关键决策节点（如资金操作、敏感数据访问）设置中断，其他步骤自动化 |
| 恢复执行后 Agent 重复执行已完成的步骤 | 状态中未记录已完成步骤，恢复时从头开始 | 在 State 中用数组维护已完成步骤列表，恢复时跳过已执行步骤 |

---

## 📝 本章小结

- ✅ **Human-in-the-Loop** — 在关键节点引入人工审核
- ✅ **`interruptBefore` / `interruptAfter`** — 指定节点前后中断
- ✅ **检查点** — `MemorySaver` 等持久化状态
- ✅ **状态管理** — `getState` / `getStateHistory`
- ✅ **恢复执行** — 相同 `thread_id` 再次 `invoke`
- ✅ **状态更新** — `updateState` 在恢复前修改
- ✅ **多级审批** — 多个中断点实现多级审核

## ➡️ 下一章预告

> [第5章：子图与模块化](./05-subgraph.md) — 将复杂 Agent 拆分为可复用、可组合的子图模块。
