# 第6章：高级特性

> 预计学习时间：1.5 小时

## 🎯 本章目标

学习完本章，你将能够：
- 使用 Interrupts 实现人机交互（Human-in-the-Loop）
- 理解五种错误类型及其处理策略
- 用 Subgraphs 构建模块化的工作流
- 使用 Send API 实现动态并行执行

---

## 🔴 Interrupts——人机交互

### 概念类比

> Interrupt 就像**审批流程**——流程走到需要领导签字的一步时停下来，等领导批了再继续。这里的「领导」就是人类用户。

### 为什么需要 Interrupt？

有些操作**不能自动执行**，需要人类确认：
- 发送邮件前需要用户确认内容
- 执行支付前需要用户确认金额
- 修改数据库前需要管理员审批

### 在工具中使用 Interrupt

```typescript
import { tool } from "@langchain/core/tools";
import { interrupt, Command } from "@langchain/langgraph";
import * as z from "zod";

// 发送邮件的工具——发送前会暂停等人批准
const sendEmailTool = tool(
  async ({ to, subject, body }) => {
    // 【关键】在这里暂停，等待用户确认
    const response = interrupt({
      action: "send_email",
      to,
      subject,
      body,
      message: "请确认是否发送这封邮件？",
    });

    // response 是用户通过 resume 传回来的决定
    if (response?.action === "approve") {
      // 用户批准了，可以发送
      console.log(`📧 邮件已发送至 ${to}`);
      return `邮件已发送至 ${to}`;
    }
    
    return "邮件已取消";
  },
  {
    name: "send_email",
    description: "发送一封邮件给收件人",
    schema: z.object({
      to: z.string().describe("收件人"),
      subject: z.string().describe("主题"),
      body: z.string().describe("正文"),
    }),
  },
);
```

### 执行时需要 Checkpointer

Interrupt 必须配合 Checkpointer 使用，否则状态无法保存：

```typescript
import { MemorySaver, StateGraph, StateSchema, MessagesValue, START, END } from "@langchain/langgraph";

const State = new StateSchema({ messages: MessagesValue });

// 构建图
const graph = new StateGraph(State)
  .addNode("agent", agentNode)
  .addEdge(START, "agent")
  .addEdge("agent", END)
  .compile({ checkpointer: new MemorySaver() });  // 必须！

const config = { configurable: { thread_id: "email-approval" } };

// 第一步：触发 interrupt
const initial = await graph.invoke(
  {
    messages: [
      { role: "user", content: "发邮件给 alice@example.com 通知会议" },
    ],
  },
  config,
);

// 检查是否触发了 interrupt
if (initial.__interrupt__) {
  console.log("等待审批:", initial.__interrupt__);
  // 输出: [{ value: { action: 'send_email', message: '请确认...' } }]
}

// 第二步：用户审批通过
const resumed = await graph.invoke(
  new Command({
    resume: { action: "approve", subject: "会议通知（已更新）" },  // 也可以修改内容
  }),
  config,
);

console.log(resumed.messages.at(-1)?.content);
// 输出: "邮件已发送至 alice@example.com"
```

### HITL 流式交互模式

```typescript
async function runWithHumanInTheLoop(userInput: string) {
  let streamInput: any = {
    messages: [{ role: "user", content: userInput }]
  };

  while (true) {
    const stream = await graph.streamEvents(streamInput, {
      ...config,
      version: "v3",
    });

    // 实时展示 LLM 输出
    for await (const message of stream.messages) {
      for await (const token of message.text) {
        process.stdout.write(token);
      }
    }

    // 检查是否有 interrupt
    if (!stream.interrupted) {
      break;  // 执行完毕
    }

    // 有 interrupt，等待用户输入
    const interruptInfo = stream.interrupts[0].payload;
    console.log("\n\n🤔 需要你的决定:", interruptInfo.message);
    
    // 假设这里从 UI 获取用户输入
    const userResponse = await getUserInput();
    streamInput = new Command({ resume: userResponse });
  }
}
```

---

## 🔄 错误处理策略（Error Handling）

### 概念类比

> 错误处理就像**医生看病**——不同的病要找不同的科室。网络超时就像感冒（吃颗药就好），工具调用失败就像需要复查（换个方法再试），信息不足就像需要问病人（找本人确认）。

### 五种错误类型及其处理策略

LangGraph 官方文档定义了五种错误类型，每种有不同的处理方式：

| 错误类型 | 谁处理 | 策略 | 适用场景 |
|---------|--------|------|----------|
| **瞬时错误**（网络超时、限流） | 系统（自动重试） | 配置 Retry Policy | 临时性故障，重试后大概率恢复 |
| **LLM 可恢复错误**（工具调用失败、解析出错） | LLM 自己 | 把错误存到 State，循环回 LLM | LLM 能看到错误并调整策略 |
| **用户可修复错误**（缺少信息、需求不明确） | 人类用户 | 用 `interrupt()` 暂停等用户输入 | 需要用户提供额外信息 |
| **重试耗尽后的失败** | 开发者（声明式） | 配置 `error_handler` 执行补偿分支 | 重试多次后仍然失败 |
| **意外错误**（bug、未知异常） | 开发者 | 让错误冒泡，记录日志 | 未知问题需要调试排查 |

#### 1️⃣ 瞬时错误——自动重试

网络超时、API 限流这类错误通常是临时的，重试就能解决：

```typescript
// 在节点或工具上配置重试策略
import { tool } from "@langchain/core/tools";

const fragileApi = tool(async ({ input }) => {
  // 这个 API 有时会超时
  const response = await fetch("https://api.example.com/data");
  return response.json();
}, {
  name: "fragile_api",
  description: "调用外部 API",
  schema: z.object({ input: z.string() }),
});
// 结合 LangChain 的 Retry 机制自动重试
```

也可以直接在图中用 `try/catch` + 循环实现重试：

```typescript
const resilientNode: GraphNode<typeof State> = async (state) => {
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await model.invoke(state.messages);
      return { messages: [result] };
    } catch (error) {
      if (i === maxRetries - 1) throw error;  // 最后一次，抛出
      console.log(`第 ${i + 1} 次重试...`);
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));  // 退避等待
    }
  }
};
```

#### 2️⃣ LLM 可恢复错误——存到 State 循环回去

当 LLM 调用的工具返回错误时，我们可以把错误信息存到 state，然后让 LLM 自己看看怎么修正：

```typescript
const agentNode: GraphNode<typeof State, "toolNode" | typeof END> = async (state) => {
  const result = await modelWithTools.invoke([
    { role: "system", content: "你是一个助手。如果工具有错误，尝试修正后再试。" },
    ...state.messages,
  ]);

  if (result.tool_calls?.length) {
    return new Command({
      goto: "toolNode",
      update: { messages: [result] },
    });
  }
  return new Command({
    goto: END,
    update: { messages: [result] },
  });
};

// 在 toolNode 中，如果工具执行出错，把错误作为消息存起来
// LLM 下一个循环就能看到错误信息并调整
```

#### 3️⃣ 用户可修复错误——用 interrupt()

当 Agent 缺少关键信息时（比如需要订单号但用户没提供），用 `interrupt()` 暂停并询问用户：

```typescript
const checkInfo: GraphNode<typeof State> = (state) => {
  const lastMsg = state.messages.at(-1)?.content;
  
  // 用户想要查订单，但没有提供订单号
  if (String(lastMsg).includes("查订单") && !state.currentOrder) {
    // 暂停，等用户提供订单号
    const response = interrupt({
      type: "missing_info",
      field: "orderId",
      message: "请提供您的订单号",
    });
    
    // 用户提供了订单号
    return { currentOrder: response.orderId };
  }
  
  return {};
};
```

#### 4️⃣ 重试耗尽后的补偿分支

当 Node 重试了多次仍然失败时，可以配置一个 `error_handler` 来执行补偿逻辑（比如记录失败、通知人工处理）：

```typescript
// 在节点级别配置 error handler（官方推荐方式）
const handleApiError: GraphNode<typeof State> = async (state) => {
  console.error("API 调用失败，执行补偿逻辑:", state.error);
  // 记录失败
  await logFailure(state.error);
  // 返回友好的错误信息
  return {
    messages: [{ role: "ai", content: "抱歉，我暂时无法完成这个操作。已通知技术人员处理。" }],
  };
};

// 在图中，可以在 try/catch 后路由到补偿节点
const apiNode: GraphNode<typeof State, "errorHandler"> = async (state) => {
  try {
    const result = await callExternalApi(state.input);
    return { apiResult: result };
  } catch (error) {
    return new Command({
      goto: "errorHandler",  // 路由到错误处理节点
      update: { error: String(error) },
    });
  }
};
```

#### 5️⃣ 意外错误——让错误冒泡

对于无法预期的 bug，不要吞掉错误——让它们冒泡到上层，方便调试：

```typescript
// ❌ 错误做法：吞掉所有异常
try {
  await riskyOperation();
} catch (error) {
  // 什么都不做——错误消失了，但问题还在
}

// ✅ 正确做法：让意外的错误冒泡
const node: GraphNode<typeof State> = async (state) => {
  // 只处理你知道怎么处理的错误
  try {
    return await doRiskyThing(state);
  } catch (error) {
    if (isRetryable(error)) {
      return new Command({ goto: "retryNode", update: { error } });
    }
    throw error;  // 其他错误让框架处理
  }
};
```

### 总结：容错 + Checkpointer = 断电续传

除了上面的策略，LangGraph 的 Checkpointer 提供了最基础的容错保障：

```typescript
// 任何时刻崩溃，下次都能从 checkpoint 恢复
const result = await graph.invoke(
  new Command({ resume: "继续" }),
  config
);
// LangGraph 自动从最近的 checkpoint 恢复执行
```

---

## 🧩 Subgraphs——模块化子图

### 概念类比

> Subgraph 就像**函数嵌套**。一个大的函数可以拆成多个小函数，每个小函数负责一个独立的功能。同样，一个大的图可以拆成多个子图，每个子图负责一个独立的子流程。

### 为什么需要 Subgraphs？

- **模块化**：把复杂流程拆成独立模块
- **复用**：同一个子图可以在多个地方使用
- **隔离**：子图可以有自己的状态和 checkpointer

### 定义和使用 Subgraph

```typescript
// 子图：处理用户反馈
const FeedbackState = new StateSchema({
  feedback: z.string(),
  sentiment: z.string(),
});

const analyzeSentiment: GraphNode<typeof FeedbackState> = async (state) => {
  const result = await model.invoke(`分析这句话的情感：${state.feedback}`);
  return { sentiment: result.content };
};

const feedbackSubgraph = new StateGraph(FeedbackState)
  .addNode("analyze", analyzeSentiment)
  .addEdge(START, "analyze")
  .addEdge("analyze", END)
  .compile();  // 可以有自己的 checkpointer

// 主图
const MainState = new StateSchema({
  messages: MessagesValue,
  analytics: z.any(),
});

const processFeedback: GraphNode<typeof MainState> = async (state) => {
  // 调用子图
  const subResult = await feedbackSubgraph.invoke({
    feedback: String(state.messages.at(-1)?.content),
    sentiment: "",
  });
  return { analytics: subResult };
};

const mainGraph = new StateGraph(MainState)
  .addNode("chat", chatNode)
  .addNode("feedback", processFeedback)
  .addEdge(START, "chat")
  .addEdge("chat", "feedback")
  .addEdge("feedback", END)
  .compile();
```

### 子图独立 Checkpointer

子图可以拥有自己的 checkpointer，实现细粒度的状态控制：

```typescript
const subgraph = new StateGraph(SubState)
  .addNode("stepA", stepA)  // 里面有 interrupt
  .addNode("stepB", stepB)
  .addEdge(START, "stepA")
  .addEdge("stepA", "stepB")
  .addEdge("stepB", END)
  .compile({ checkpointer: true });  // 子图自己的 checkpointer
```

---

## 📨 Send API——动态并行执行

### 概念类比

> Send API 就像**同时派多个快递员去不同的地点取件**——每个人去一个地方，互不干扰，最后汇总结果。

### 使用场景

当你需要**根据当前状态动态决定创建多少个并行任务**时：

- 生成报告时，多个章节同时编写
- 分析多个文件时，每个文件单独处理
- 批量查询时，多个查询同时发送

### 示例：并行编写报告章节

```typescript
import { StateGraph, StateSchema, ReducedValue, GraphNode, Send } from "@langchain/langgraph";
import * as z from "zod";

// 主图状态
const State = new StateSchema({
  topic: z.string(),
  sections: z.array(z.any()),
  completedSections: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: (a, b) => a.concat(b) }
  ),
  finalReport: z.string(),
});

// 编排节点：把任务分配给多个 worker
const orchestrator: GraphNode<typeof State> = async (state) => {
  // 生成章节计划
  const plan = ["介绍", "原理", "实践", "总结"];  // 模拟
  return { sections: plan.map(name => ({ name })) };
};

// 条件边：把每个 section 发送给 worker
const assignWorkers = (state: typeof State.Type) => {
  return state.sections.map(
    (section) => new Send("worker", { section })  // 每个 worker 处理一个 section
  );
};

// Worker 节点：独立编写一个章节
const WorkerState = new StateSchema({
  section: z.any(),
  completedSections: new ReducedValue(
    z.array(z.string()).default(() => []),
    { reducer: (a, b) => a.concat(b) }
  ),
});

const worker: GraphNode<typeof WorkerState> = async (state) => {
  const content = `这是关于"${state.section.name}"的章节内容...`;
  return { completedSections: [content] };
};

// 汇总节点
const synthesizer: GraphNode<typeof State> = async (state) => {
  return { finalReport: state.completedSections.join("\n\n") };
};

// 构建图
const reportGraph = new StateGraph(State)
  .addNode("orchestrator", orchestrator)
  .addNode("worker", worker)          // 同一个 worker 节点会被多个 Send 调用
  .addNode("synthesizer", synthesizer)
  .addEdge(START, "orchestrator")
  .addConditionalEdges("orchestrator", assignWorkers, ["worker"])  // 动态并行
  .addEdge("worker", "synthesizer")
  .addEdge("synthesizer", END)
  .compile();
```

> **💡 Send 和普通节点的区别：**
> 普通节点接收的是父状态（整个图的状态）。Send 创建的 worker 接收的是**自定义的状态子集**——你只发送 worker 需要的数据。

---

## 🔨 实战演练

### 练习：实现带审批的订单处理流程

**场景描述：**
构建一个订单处理 Agent，流程是：
1. 用户下订单（自动处理）
2. Agent 生成订单摘要
3. **停下来等用户确认**（Interrupt）
4. 用户确认后执行发货
5. 如果用户拒绝，取消订单

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { StateGraph, StateSchema, GraphNode, interrupt, Command, MemorySaver, START, END } from "@langchain/langgraph";
import * as z from "zod";

const OrderState = new StateSchema({
  orderDetails: z.string(),
  status: z.string().default("pending"),
  result: z.string(),
});

// 处理订单节点（包含 interrupt）
const processOrder: GraphNode<typeof OrderState> = async (state) => {
  console.log(`📋 收到订单: ${state.orderDetails}`);
  
  // 暂停，等待用户确认
  const userDecision = interrupt({
    type: "order_confirmation",
    order: state.orderDetails,
    message: "请确认订单信息是否正确？",
  });
  
  if (userDecision?.action === "confirm") {
    return {
      status: "confirmed",
      result: `✅ 订单已确认并开始处理: ${state.orderDetails}`,
    };
  } else {
    return {
      status: "cancelled",
      result: `❌ 订单已取消: ${state.orderDetails}`,
    };
  }
};

// 构建图
const orderGraph = new StateGraph(OrderState)
  .addNode("processOrder", processOrder)
  .addEdge(START, "processOrder")
  .addEdge("processOrder", END)
  .compile({ checkpointer: new MemorySaver() });

// 执行流程
const config = { configurable: { thread_id: "order-001" } };

// 第一步：提交订单，触发 interrupt
const step1 = await orderGraph.invoke(
  { orderDetails: "MacBook Pro 14寸 × 1", status: "pending", result: "" },
  config,
);

if (step1.__interrupt__) {
  console.log("⏸️ 等待确认:", step1.__interrupt__[0].value.message);
  
  // 第二步：用户确认
  const step2 = await orderGraph.invoke(
    new Command({ resume: { action: "confirm" } }),
    config,
  );
  console.log(step2.result);  // ✅ 订单已确认并开始处理
}
```

**预期输出：**
```
📋 收到订单: MacBook Pro 14寸 × 1
⏸️ 等待确认: 请确认订单信息是否正确？
✅ 订单已确认并开始处理: MacBook Pro 14寸 × 1
```

</details>

---

## 📝 本章小结

- ✅ **Interrupt** 让 Agent 在关键步骤暂停，等待人类决策
- ✅ Interrupt 需要配合 Checkpointer 使用
- ✅ **错误处理策略**：瞬时错误→自动重试、LLM 可恢复→循环回 LLM、用户可修复→interrupt、重试耗尽→补偿分支、意外错误→冒泡
- ✅ **Checkpointer 容错**：任何时刻崩溃都能从最近 checkpoint 恢复
- ✅ **Subgraph** 实现模块化，子图可以有独立的 checkpointer
- ✅ **Send API** 实现动态并行，根据状态灵活创建 worker

## ➡️ 下一章预告

> 在下一章中，我们将**深入比较 LangGraph 和 LangChain**，给出何时选择哪个框架的决策指南，以及它们如何配合使用。
> [下一章：LangGraph vs LangChain 深度对比 →](./07-vs-langchain.md)
