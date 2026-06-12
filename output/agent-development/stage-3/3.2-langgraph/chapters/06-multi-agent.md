# 第6章：Multi-Agent 系统 — 让 AI 团队协作

> 预计学习时间：90-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解多 Agent 系统架构** — 单一 Agent 的局限性与多 Agent 的优势
- **实现 Supervisor 模式** — 一个"管理者"Agent 协调多个"工作者"Agent
- **设计 Agent 间通信机制** — 消息路由与状态共享
- **实现路由分发** — 根据任务类型将请求分发给不同的 Agent
- **管理共享状态与终止条件** — 多 Agent 协作的生命周期

---

## 💡 为什么需要 Multi-Agent？

### 概念一：从单兵作战到团队协作

**生活类比：** 一个全科医生（Single Agent）可以处理大部分常见病，但遇到复杂的病情，他需要转诊给专科医生：放射科医生看片子、外科医生评估手术、麻醉科医生制定麻醉方案。每个专科医生都是各自领域的专家，他们通过病历（共享状态）和会诊（通信）来协作。

```
单 Agent 模式：
  用户 → Agent（什么都会一点）→ 回答
  （一个 Agent 掌握所有能力，容易达到能力瓶颈）

多 Agent 模式：
               ┌──────────────┐
               │  Supervisor   │ ← 协调者
               │  (任务分配)   │
               └──────┬───────┘
              ┌───────┼───────────┐
              │       │           │
          ┌───▼──┐ ┌──▼──┐ ┌───▼───┐
          │研究  │ │写作  │ │审核   │
          │Agent │ │Agent │ │Agent  │
          └───┬──┘ └──┬──┘ └───┬───┘
              │       │           │
              └───────┼───────────┘
                      │
                 ┌────▼────┐
                 │  最终   │
                 │  回答   │
                 └─────────┘
  （每个 Agent 专注一个领域，通过协作解决复杂问题）
```

> **💡 为什么需要 Multi-Agent？**
>
> 1）**专业分工** — 每个 Agent 专注于一个领域，比全能 Agent 表现更好；2）**可扩展性** — 可以随时添加新的专业 Agent；3）**容错性** — 某个 Agent 失败不会导致整个系统崩溃；4）**模块化** — 每个 Agent 可以独立开发、测试和部署；5）**认知负荷** — 每个 Agent 的上下文窗口只包含其专业领域的信息，减少干扰。

---

## 🏗 Supervisor 模式

### 概念二：Supervisor 模式架构

Supervisor 模式是最常用的多 Agent 架构。一个"Supervisor"Agent 负责理解用户请求、分发给合适的子 Agent、汇总结果。

```typescript
import { StateGraph, START, END, Annotation } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';

// ============ 多 Agent 系统的状态 ============

const MultiAgentState = Annotation.Root({
  // 完整的对话历史
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
  // 当前活跃的 Agent 名称
  activeAgent: Annotation<string>({
    reducer: (_, curr) => curr,
    default: () => 'supervisor',
  }),
  // Agent 路由决策
  nextAgent: Annotation<string>({
    reducer: (_, curr) => curr,
    default: () => '',
  }),
  // 是否完成任务
  isComplete: Annotation<boolean>({
    reducer: (_, curr) => curr,
    default: () => false,
  }),
});

type MAS = typeof MultiAgentState.State;

// ============ 共享的 LLM 模型 ============

const model = new ChatAnthropic({
  modelName: 'claude-sonnet-4-5-20241022',
  temperature: 0.1,
});

// ============ Supervisor 节点 ============

async function supervisorNode(state: MAS) {
  const response = await model.invoke([
    new SystemMessage(`你是一个多 Agent 系统的协调主管（Supervisor）。

你的团队中有以下专家：

1. **researcher** — 研究专家，擅长搜索和分析信息
2. **writer** — 写作专家，擅长撰写和润色文本
3. **reviewer** — 审核专家，擅长检查质量和错误

## 你的职责
1. 分析用户的最新的需求
2. 决定哪个专家最合适处理当前任务
3. 如果是最终回答，回复"DONE"

## 输出格式
必须以下面格式输出决策：
NEXT: [agent_name]
或者
DONE: [最终回答]`),
    ...state.messages.slice(-3),
  ]);

  const content = response.content as string;

  if (content.startsWith('DONE:')) {
    return {
      nextAgent: 'end',
      isComplete: true,
      messages: [new AIMessage(content.slice(5).trim())],
    };
  }

  const nextAgent = content.replace('NEXT:', '').trim();
  return {
    nextAgent,
    activeAgent: nextAgent,
    messages: [new AIMessage(`将任务分配给 ${nextAgent} Agent`)],
  };
}
```

### 概念三：工作者 Agent（Worker Agents）

```typescript
// ============ Researcher Agent ============

async function researcherNode(state: MAS) {
  const lastMessage = state.messages[state.messages.length - 1];

  // 模拟研究过程
  const response = await model.invoke([
    new SystemMessage(`你是一个专业的研究分析师。

## 你的专长
- 信息搜索和收集
- 数据分析和整理
- 事实核查和验证
- 生成结构化研究报告

## 工作规则
1. 深入研究用户提出的问题
2. 提供有数据支撑的分析
3. 使用中文回答
4. 输出研究结果后，说明"研究完成"`),
    new HumanMessage(lastMessage.content),
  ]);

  return {
    messages: [
      new AIMessage(`🔬 [研究结果]\n${response.content}\n\n---\n研究完成，请主管安排下一步工作。`),
    ],
  };
}

// ============ Writer Agent ============

async function writerNode(state: MAS) {
  const lastMessage = state.messages[state.messages.length - 1];

  const response = await model.invoke([
    new SystemMessage(`你是一个专业的写作专家。

## 你的专长
- 文章撰写和润色
- 内容结构化
- 语言优化
- 不同文风适配

## 工作规则
1. 基于已有信息进行写作
2. 注意文章结构和逻辑
3. 使用中文写作
4. 输出后说明"写作完成"`),
    new HumanMessage(lastMessage.content),
  ]);

  return {
    messages: [
      new AIMessage(`📝 [写作结果]\n${response.content}\n\n---\n写作完成，请主管审核。`),
    ],
  };
}

// ============ Reviewer Agent ============

async function reviewerNode(state: MAS) {
  const lastMessage = state.messages[state.messages.length - 1];

  const response = await model.invoke([
    new SystemMessage(`你是一个专业的内容审核专家。

## 你的专长
- 事实准确性检查
- 逻辑一致性验证
- 语法和表达优化
- 质量评分和改进建议

## 工作规则
1. 仔细审核内容
2. 指出问题并给出改进建议
3. 如果内容质量好，明确说"审核通过"
4. 如果需要修改，说明具体问题`),
    new HumanMessage(lastMessage.content),
  ]);

  const isApproved = response.content.includes('审核通过');

  return {
    messages: [
      new AIMessage(`✅ [审核结果]\n${response.content}\n\n${isApproved ? '审核通过，可以输出最终结果。' : '需要返回修改。'}`),
    ],
  };
}
```

### 概念四：路由逻辑

```typescript
// ============ 路由函数 ============

function routeToAgent(state: MAS): string {
  // Supervisor 决定下一个 Agent
  if (state.nextAgent && state.nextAgent !== 'end') {
    return state.nextAgent;
  }
  // 如果完成，回到 Supervisor 做最终输出
  return 'supervisor';
}

// ============ 构建多 Agent 图 ============

const multiAgentGraph = new StateGraph(MultiAgentState)
  // 添加节点
  .addNode('supervisor', supervisorNode)
  .addNode('researcher', researcherNode)
  .addNode('writer', writerNode)
  .addNode('reviewer', reviewerNode)

  // 起始边
  .addEdge(START, 'supervisor')

  // 条件边：Supervisor 路由到对应 Agent
  .addConditionalEdges('supervisor', routeToAgent, {
    supervisor: 'supervisor',
    researcher: 'researcher',
    writer: 'writer',
    reviewer: 'reviewer',
    end: END,
  })

  // 所有 Agent 执行完后回到 Supervisor
  .addEdge('researcher', 'supervisor')
  .addEdge('writer', 'supervisor')
  .addEdge('reviewer', 'supervisor')
  .compile();

// ============ 执行 ============

async function runMultiAgent() {
  const result = await multiAgentGraph.invoke({
    messages: [
      new HumanMessage('写一篇关于量子计算在金融领域应用的文章，先研究再写作最后审核。'),
    ],
  });

  console.log('===== 完整对话 =====');
  for (const msg of result.messages) {
    const role = msg._getType().padEnd(10);
    const content = typeof msg.content === 'string'
      ? msg.content.slice(0, 150)
      : JSON.stringify(msg.content).slice(0, 150);
    console.log(`[${role}]: ${content}`);
  }
}
```

---

## 🔄 多 Agent 协作模式

### 概念五：顺序协作模式

```
Supervisor →  Researcher → Writer → Reviewer → Supervisor → 输出
    │            │          │          │             │
    │  分配研究   │  返回    │  写作    │  审核       │  汇总
    └────────────►└────────►└────────►└────────────►└──────► END
```

### 概念六：动态路由模式

根据任务类型动态选择 Agent，不固定执行顺序：

```typescript
// 更细粒度的路由
function dynamicRoute(state: MAS): string {
  const lastMsg = state.messages[state.messages.length - 1];
  const content = typeof lastMsg.content === 'string' ? lastMsg.content : '';

  // 关键词匹配
  if (content.includes('搜索') || content.includes('查找') || content.includes('研究')) {
    return 'researcher';
  }
  if (content.includes('写') || content.includes('生成') || content.includes('创作')) {
    return 'writer';
  }
  if (content.includes('检查') || content.includes('审核') || content.includes('修改')) {
    return 'reviewer';
  }
  return 'supervisor';
}

// 在条件边中使用动态路由
// .addConditionalEdges('supervisor', dynamicRoute, { ... })
```

### 概念七：广播模式（所有 Agent 并行工作）

```typescript
// 广播节点：将任务分发给所有 Agent
async function broadcastNode(state: MAS) {
  // 并行调用所有 Agent
  const [researchResult, writerTemplate, reviewCriteria] = await Promise.all([
    model.invoke([new SystemMessage('研究任务'), new HumanMessage(state.messages[0].content)]),
    model.invoke([new SystemMessage('生成写作大纲'), new HumanMessage(state.messages[0].content)]),
    model.invoke([new SystemMessage('列出审核标准'), new HumanMessage(state.messages[0].content)]),
  ]);

  return {
    messages: [
      new AIMessage(`📋 并行工作结果：
      
研究资料: ${researchResult.content}
写作大纲: ${writerTemplate.content}
审核标准: ${reviewCriteria.content}`),
    ],
    isComplete: true,
  };
}
```

---

## 📊 共享状态与上下文管理

### 概念八：跨 Agent 的上下文

```typescript
// 增强的多 Agent 状态
const EnhancedMultiAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
  // 共享知识库
  sharedKnowledge: Annotation<Record<string, any>>({
    reducer: (prev, curr) => ({ ...prev, ...curr }),
    default: () => ({}),
  }),
  // 任务队列
  taskQueue: Annotation<any[]>({
    reducer: (prev, curr) => [...prev, ...curr],
    default: () => [],
  }),
  // Agent 报告
  agentReports: Annotation<Record<string, string>>({
    reducer: (prev, curr) => ({ ...prev, ...curr }),
    default: () => ({}),
  }),
});

// 研究者将发现写入共享知识库
async function researcherWithMemory(state: typeof EnhancedMultiAgentState.State) {
  const findings = {
    'market_size': '全球量子计算市场2024年约10亿美元',
    'key_players': 'Google、IBM、Microsoft、IonQ',
    'applications': '投资组合优化、风险分析、欺诈检测',
  };

  return {
    sharedKnowledge: findings,
    agentReports: {
      researcher: '已完成市场研究和关键发现收集',
    },
    messages: [new AIMessage(`研究完成，发现已存入共享知识库。`)],
  };
}
```

---

## 🔨 实战演练：多 Agent 客服系统

```typescript
// ===== 专业 Agent =====

// 订单查询 Agent
async function orderAgent(state: MAS) {
  // 模拟查询订单
  return {
    messages: [new AIMessage(`📦 [订单信息]\n订单号: ORD-2024-001\n状态: 已发货\n预计送达: 2024-12-25\n物流: SF1234567890`)],
  };
}

// 退换货 Agent
async function returnAgent(state: MAS) {
  return {
    messages: [new AIMessage(`🔄 [退换货处理]\n您的订单符合7天无理由退货政策。\n请提供：1. 订单号 2. 退货原因 3. 照片凭证`)],
  };
}

// 投诉 Agent
async function complaintAgent(state: MAS) {
  return {
    messages: [new AIMessage(`⚠️ [投诉处理]\n已记录您的投诉，投诉编号: COMP-2024-001\n我们将在24小时内由专属客服跟进。`)],
  };
}

// ===== 智能路由 Supervisor =====

async function customerServiceSupervisor(state: MAS) {
  const lastMsg = state.messages[state.messages.length - 1];
  const content = typeof lastMsg.content === 'string' ? lastMsg.content : '';

  let nextAgent = 'end';
  if (content.includes('订单') || content.includes('物流') || content.includes('配送')) {
    nextAgent = 'order';
  } else if (content.includes('退') || content.includes('换') || content.includes('售后')) {
    nextAgent = 'return';
  } else if (content.includes('投诉') || content.includes('不满') || content.includes('差')) {
    nextAgent = 'complaint';
  }

  return {
    nextAgent,
    messages: [new AIMessage(`转接到 ${nextAgent} 部门`)],
  };
}

// ===== 构建客服多 Agent 系统 =====

const customerServiceGraph = new StateGraph(MultiAgentState)
  .addNode('supervisor', customerServiceSupervisor)
  .addNode('order', orderAgent)
  .addNode('return', returnAgent)
  .addNode('complaint', complaintAgent)
  .addEdge(START, 'supervisor')
  .addConditionalEdges('supervisor', (state) => state.nextAgent, {
    order: 'order',
    return: 'return',
    complaint: 'complaint',
    end: END,
  })
  .addEdge('order', END)
  .addEdge('return', END)
  .addEdge('complaint', END)
  .compile();

// 测试
const csResult = await customerServiceGraph.invoke({
  messages: [new HumanMessage('我想查询我的订单状态')],
});
console.log(csResult.messages[csResult.messages.length - 1].content);
```

<details>
<summary>🧑‍💻 多 Agent 执行示例</summary>

```
用户输入: 请研究量子计算在金融领域的应用，然后写一篇文章

执行流程:
1. Supervisor: "将任务分配给 researcher Agent"
2. Researcher: "🔬 [研究结果] 量子计算在金融领域的三个主要应用..."
3. Supervisor: "将任务分配给 writer Agent"
4. Writer: "📝 [写作结果] # 量子计算在金融领域的应用..."
5. Supervisor: "将任务分配给 reviewer Agent"
6. Reviewer: "✅ [审核结果] 内容质量良好，审核通过"
7. Supervisor: "DONE: 以下是最终文章..."
```

</details>

---

## ⚠️ 常见陷阱与最佳实践

| 陷阱 | 解决方案 |
|------|----------|
| Agent 之间上下文丢失 | 使用共享状态字段（如 `sharedKnowledge`）让所有 Agent 可访问 |
| Supervisor 决策不准 | 给 Supervisor 详细的 Agent 描述和路由规则 |
| Agent 输出过长 | 限制每条消息长度，使用摘要汇总 |
| 循环路由导致死循环 | 设置最大迭代次数，达到后强制结束 |
| Agent 间互相冲突 | 定义清晰的职责边界，避免职责重叠 |

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Supervisor 模式中，Supervisor 本身是否应该是一个 LLM Agent？**

> A：通常是的。使用 LLM 作为 Supervisor 可以利用其自然语言理解能力来解析用户请求并做出路由决策。但在简单场景下，也可以使用基于规则的路由器（关键词匹配）作为 Supervisor。

**Q2：多 Agent 系统如何防止无限路由循环？**

> A：1）设置最大迭代次数；2）在 Supervisor 中检测是否多次路由到同一个 Agent；3）使用计数器在状态中跟踪路由次数；4）设置超时机制。

**Q3：什么时候应该使用多 Agent 而不是单 Agent？**

> A：当任务满足以下条件时：1）涉及多个不同的专业领域；2）需要多人协作式的分工；3）每个子任务有明确的边界和独立的工具集；4）系统需要高度可扩展（频繁添加新功能）。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Supervisor 将任务分配给不存在的 Agent | 路由函数返回的 Agent 名称未在图中注册 | 确保 Supervisor 的路由只返回已在主图中注册的 Agent 节点名称 |
| 多个 Agent 同时修改共享状态导致数据竞争 | 并行 Agent 并发写入同一字段，后写入覆盖前者 | 使用 `reducer` 合并策略（如数组追加），或为每个 Agent 分配独立的字段 |
| 串行协作中下游 Agent 未收到上游的完整输出 | 上游 Agent 状态更新后下游未等待 | 在串行流程中使用条件边确保上游完成后再启动下游 Agent |
| Agent 之间的通信消息堆积导致上下文超长 | 每次交互都保留全部历史消息 | 在状态中做消息摘要或裁剪，只保留必要的上下文信息 |

---

## 📝 本章小结

- ✅ **Supervisor 模式** — 中央协调者分发任务的架构
- ✅ **工作者 Agent** — 各司其职的专业 Agent
- ✅ **条件路由** — 根据任务类型动态选择 Agent
- ✅ **共享状态** — 跨 Agent 的知识库和上下文
- ✅ **顺序协作** — 按固定流程执行的多 Agent
- ✅ **广播模式** — 并行工作的多 Agent
- ✅ **动态路由** — 实时决策的任务分配

## ➡️ 下一章预告

> [第7章：综合实战 — 多 Agent 研究助手](./07-capstone-research-agent.md) — 本章将综合运用所有知识，构建一个完整的多 Agent 研究系统。
