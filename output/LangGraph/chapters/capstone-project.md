# 第8章：综合实战项目——智能客服 Agent

> 预计学习时间：2 小时

## 🎯 本章目标

学习完本章，你将能够：
- 综合运用 LangGraph 和 LangChain 构建一个完整的 Agent
- 整合 Interrupt、Checkpointer、Streaming 等核心特性
- 设计生产级 Agent 的架构
- 编写可部署的应用代码

---

## 📋 项目概述

### 项目名称：智能客服助手（SmartSupport Agent）

### 功能需求

我们需要构建一个电商客服 Agent，支持以下功能：

1. **查订单**：根据订单号查询订单状态
2. **查物流**：查询订单的物流信息
3. **改地址**：修改订单的收货地址（需要用户确认）
4. **退换货**：提交退换货申请（需要用户确认）
5. **多轮对话**：记住用户在对话中提到的信息
6. **转人工**：无法处理时转接人工客服

### 技术栈

- **LangGraph**：工作流编排
- **LangChain**：LLM 调用 + 工具定义
- **Zod**：参数验证
- **MemorySaver**：记忆持久化

---

## 🏗️ 架构设计

### 工作流图

```
用户消息
    │
    ▼
┌─────────────────────────────────────────┐
│          理解意图节点（routerNode）       │
│  用 LLM 判断用户想做什么                  │
└──────────────┬──────────────────────────┘
               │
      ┌────────┼─────────┬──────────┬──────────┐
      ▼        ▼         ▼          ▼          ▼
  查订单     查物流    改地址     退换货     转人工
      │        │         │          │          │
      ▼        ▼         ▼          ▼          ▼
  订单系统   物流系统  ┌─→ 确认? ──┐  人工客服
                      │    │      │
                      │  是/否    │
                      │    │      │
                      └────┴──────┘
                              │
                              ▼
                           更新地址
```

### 状态设计

```typescript
const State = new StateSchema({
  messages: MessagesValue,      // 对话消息
  userInfo: z.object({          // 用户信息
    name: z.string().optional(),
    userId: z.string().optional(),
  }).default({}),
  currentOrder: z.string().optional(),  // 当前正在处理的订单
  pendingAction: z.any().optional(),    // 待确认的操作
});
```

---

## 🔨 完整代码实现

### 1️⃣ 定义工具

```typescript
import { tool } from "@langchain/core/tools";
import * as z from "zod";

// 模拟数据库
const mockOrders: Record<string, any> = {
  "12345": { id: "12345", status: "已发货", address: "北京市朝阳区", items: ["MacBook Pro"] },
  "67890": { id: "67890", status: "待付款", address: "上海市浦东新区", items: ["iPhone 15"] },
};

// 查订单
const queryOrder = tool(async ({ orderId }) => {
  const order = mockOrders[orderId];
  if (!order) return `未找到订单 ${orderId}`;
  return JSON.stringify(order);
}, {
  name: "query_order",
  description: "根据订单号查询订单信息",
  schema: z.object({
    orderId: z.string().describe("订单号"),
  }),
});

// 查物流
const trackLogistics = tool(async ({ orderId }) => {
  return `订单 ${orderId} 的物流信息：您的包裹已到达【北京分拣中心】，预计明天送达。`;
}, {
  name: "track_logistics",
  description: "查询物流信息",
  schema: z.object({ orderId: z.string() }),
});

// 修改地址（包含 interrupt）
const updateAddress = tool(async ({ orderId, newAddress }) => {
  const response = interrupt({
    type: "address_change",
    orderId,
    newAddress,
    message: `确认将订单 ${orderId} 的地址修改为 "${newAddress}"？`,
  });

  if (response?.action === "confirm") {
    // 更新地址
    if (mockOrders[orderId]) {
      mockOrders[orderId].address = newAddress;
    }
    return `✅ 订单 ${orderId} 的地址已修改为 "${newAddress}"`;
  }
  return "❌ 地址修改已取消";
}, {
  name: "update_address",
  description: "修改订单收货地址（需要用户确认）",
  schema: z.object({
    orderId: z.string(),
    newAddress: z.string(),
  }),
});

// 转人工
const transferToHuman = tool(async ({ reason }) => {
  return `🔄 已将您的问题转接人工客服。原因：${reason}。请稍候，人工客服马上接入。`;
}, {
  name: "transfer_to_human",
  description: "转接人工客服",
  schema: z.object({
    reason: z.string().describe("转人工的原因"),
  }),
});

const tools = [queryOrder, trackLogistics, updateAddress, transferToHuman];
const toolsByName = {
  query_order: queryOrder,
  track_logistics: trackLogistics,
  update_address: updateAddress,
  transfer_to_human: transferToHuman,
};
```

### 2️⃣ 准备模型

```typescript
import { ChatAnthropic } from "@langchain/anthropic";

const model = new ChatAnthropic({
  model: "claude-sonnet-4-6",
  temperature: 0,
}).bindTools(tools);
```

### 3️⃣ 定义状态和节点

```typescript
import { StateSchema, MessagesValue, GraphNode, ToolNode, MemorySaver, 
         ConditionalEdgeRouter, StateGraph, START, END, interrupt, Command } from "@langchain/langgraph";

const State = new StateSchema({
  messages: MessagesValue,
  userInfo: z.object({
    name: z.string().optional(),
    userId: z.string().optional(),
  }).default({}),
  currentOrder: z.string().optional(),
  pendingAction: z.any().optional(),
});

// LLM 调用节点
const llmCall: GraphNode<typeof State> = async (state) => {
  // 构建系统提示词（包含已有信息）
  let systemContent = "你是一个友好的电商客服助手。";
  if (state.userInfo?.name) {
    systemContent += `\n当前用户：${state.userInfo.name}`;
  }
  if (state.currentOrder) {
    systemContent += `\n当前正在处理的订单：${state.currentOrder}`;
  }

  const result = await model.invoke([
    { role: "system", content: systemContent },
    ...state.messages,
  ]);

  return { messages: [result] };
};

// 工具节点
const toolNode = new ToolNode(tools);
```

### 4️⃣ 定义路由逻辑

```typescript
const shouldContinue: ConditionalEdgeRouter<typeof State, "toolNode"> = (
  state,
) => {
  const lastMessage = state.messages.at(-1);

  // 如果 LLM 请求了工具，去执行
  if (lastMessage?.tool_calls?.length) {
    // 如果是转人工工具，记录日志
    const toolCall = lastMessage.tool_calls[0];
    if (toolCall.name === "transfer_to_human") {
      console.log("🔄 转接人工客服请求");
    }
    return "toolNode";
  }

  return END;
};
```

### 5️⃣ 组装图

```typescript
// 创建 Checkpointer
const checkpointer = new MemorySaver();

// 构建图
const agent = new StateGraph(State)
  .addNode("llmCall", llmCall)
  .addNode("toolNode", toolNode)
  .addEdge(START, "llmCall")
  .addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
  .addEdge("toolNode", "llmCall")
  .compile({ checkpointer });
```

### 6️⃣ 运行 Agent

```typescript
async function runCustomerService() {
  const config = { configurable: { thread_id: "user-session-001" } };

  // 第一轮：用户查订单
  console.log("👤 用户: 帮我查一下订单 12345");
  let result = await agent.invoke({
    messages: [{ role: "user", content: "帮我查一下订单 12345" }],
  }, config);
  console.log("🤖 客服:", result.messages.at(-1)?.content);

  // 第二轮：用户想改地址
  console.log("\n👤 用户: 我想把收货地址改成深圳市南山区");
  result = await agent.invoke({
    messages: [{ role: "user", content: "我想把收货地址改成深圳市南山区" }],
  }, config);

  // 检查是否有 interrupt
  if (result.__interrupt__) {
    console.log("⏸️ 需要确认:", result.__interrupt__[0].value.message);
    
    // 用户确认
    console.log("👤 用户: 是的，确认修改");
    result = await agent.invoke(
      new Command({ resume: { action: "confirm" } }),
      config,
    );
    console.log("🤖 客服:", result.messages.at(-1)?.content);
  } else {
    console.log("🤖 客服:", result.messages.at(-1)?.content);
  }

  // 第三轮：查物流
  console.log("\n👤 用户: 看看这个订单的物流到哪了");
  result = await agent.invoke({
    messages: [{ role: "user", content: "看看物流到哪了" }],
  }, config);
  console.log("🤖 客服:", result.messages.at(-1)?.content);
}

runCustomerService().catch(console.error);
```

---

## 🧪 测试与验证

### 测试场景 1：正常流程

```
用户: 帮我查一下订单 12345
客服: 找到了您的订单 12345，状态为"已发货"...

用户: 我想把地址改成深圳市南山区
系统: ⏸️ 需要确认——确认将订单 12345 的地址修改为"深圳市南山区"？
用户: 确认修改
客服: ✅ 订单 12345 的地址已修改为"深圳市南山区"
```

### 测试场景 2：多轮对话记忆

```
用户: 我是小明
客服: 你好小明！有什么可以帮你的？

用户: 我的订单号是 67890
客服: 已记录，订单 67890 的状态是"待付款"

用户: 这个订单的地址是什么？    ← 不需要重复说订单号
客服: 订单 67890 的地址是上海市浦东新区
```

### 测试场景 3：需要转人工

```
用户: 我要求赔偿！
客服: 很抱歉给您带来不好的体验...
系统: 🔄 转接人工客服请求...
客服: 已将您的问题转接人工客服，请稍候。
```

---

## 🚀 进一步优化

### 1. 添加流式输出

```typescript
const stream = await agent.streamEvents(
  { messages: [{ role: "user", content: "帮我查订单" }] },
  { ...config, version: "v3" },
);

for await (const message of stream.messages) {
  for await (const token of message.text) {
    process.stdout.write(token);
  }
}
```

### 2. 添加错误处理

```typescript
try {
  const result = await agent.invoke(input, config);
} catch (error) {
  // 记录错误
  console.error("Agent 执行出错:", error);
  // 返回友好的错误信息
  return "抱歉，我遇到了一些技术问题，请稍后再试或联系人工客服。";
}
```

### 3. 添加日志与监控

```typescript
// 在节点中添加日志
const llmCallWithLogging: GraphNode<typeof State> = async (state) => {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] LLM 调用开始`);
  
  const result = await model.invoke([...state.messages]);
  
  console.log(`[${new Date().toISOString()}] LLM 调用完成，耗时: ${Date.now() - startTime}ms`);
  console.log(`[日志] Token 使用: ${result.usage_metadata}`);
  
  return { messages: [result] };
};
```

### 4. 生产级 Checkpointer

```typescript
// 开发阶段用 MemorySaver
// 生产环境用数据库版本
// import { PostgresSaver } from "@langchain/langgraph/checkpoint/postgres";
// const checkpointer = new PostgresSaver({
//   connectionString: process.env.DATABASE_URL,
// });
```

---

## 📝 本章小结

✅ 综合运用了 StateGraph、Node、Edge、Conditional Edge  
✅ 实现了 Interrupt 审批流程（改地址需要确认）  
✅ 使用 Checkpointer 实现了多轮对话记忆  
✅ 集成了多个工具（查订单、查物流、改地址、转人工）  
✅ 设计了生产级 Agent 的完整架构  

### 项目文件结构

```
smart-support-agent/
├── src/
│   ├── tools.ts          # 工具定义
│   ├── agent.ts          # Agent 图和节点
│   └── index.ts          # 入口文件
├── .env                  # 环境变量
├── package.json
└── langgraph.json        # LangGraph 部署配置
```

### 学习回顾

通过这个实战项目，你应该已经掌握了：

1. **第1-2章**：核心概念（State、Node、Edge）——构建图的基础
2. **第3章**：Graph API——定义节点和边的连接方式
3. **第4章**：Functional API——另一种更简洁的写法
4. **第5章**：持久化——Checkpointer 实现对话记忆
5. **第6章**：高级特性——Interrupt 实现审批流程
6. **第7章**：对比复习——LangChain 提供工具，LangGraph 编排工作流

---

> 🎉 **恭喜你完成全部学习！** 你现在已经掌握了 LangGraph 的核心知识和实战技能，可以开始构建自己的 Agent 了！
>
> 建议下一步：
> - 尝试用 Functional API 重写这个项目
> - 添加更多工具（如数据库查询、API 调用）
> - 部署到 LangGraph Cloud
> - 配合 LangSmith 做调试和监控
