# 第5章：持久化、流式输出与检查点

> 预计学习时间：1.5 小时

## 🎯 本章目标

学习完本章，你将能够：
- 理解 Checkpointer 的作用和使用场景
- 实现跨会话的对话记忆
- 使用流式输出逐字展示 LLM 回复
- 用 Store 实现跨会话的长期记忆

## 📋 前置知识

> 如果你还没有学习以下内容，建议先完成：
> - [第3章：Graph API](./03-graph-api.md)
> - [第4章：Functional API](./04-functional-api.md)（可选，本章示例基于 Graph API）

---

## 💡 先看问题

假设你写了一个客服 Agent，用户问完第一个问题后，接着问第二个：

```typescript
// 第一次对话
await agent.invoke({
  messages: [{ role: "user", content: "我的订单号是 12345" }]
});
// Agent 记住了订单号

// 第二次对话
await agent.invoke({
  messages: [{ role: "user", content: "这个订单送到哪了？" }]
});
// 😱 Agent 忘了之前的订单号！
```

**问题出在哪？** 每次 `invoke()` 都是独立的——结束后状态就丢了。要让 Agent 有记忆，我们需要**持久化（Persistence）**。

---

## 💾 Checkpointer——给 Agent 装个存档系统

### 概念类比

> Checkpointer 就是**游戏存档系统**。每一步执行完后，系统自动保存当前状态。这样即使断电了，下次还能从存档点继续。

### 安装和配置

```typescript
import { MemorySaver } from "@langchain/langgraph";

// 创建一个内存检查点保存器
// （生产环境建议用数据库版本，比如 PostgreSQL 或 Redis）
const checkpointer = new MemorySaver();

// 编译图时传入 checkpointer
const graph = new StateGraph(State)
  .addNode("llmCall", llmCall)
  .addNode("toolNode", toolNode)
  .addEdge(START, "llmCall")
  .addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
  .addEdge("toolNode", "llmCall")
  .compile({ checkpointer });  // 👈 传入 checkpointer
```

### thread_id——区分不同的会话

有了 Checkpointer 后，每次调用需要指定 `thread_id`：

```typescript
// 同一个 thread_id 内的消息会被记住
const config = { configurable: { thread_id: "user-session-001" } };

// 第一轮：告诉 Agent 订单号
await graph.invoke(
  { messages: [{ role: "user", content: "我的订单号是 12345" }] },
  config  // 👈 传入 config
);

// 第二轮：Agent 还记得订单号！
await graph.invoke(
  { messages: [{ role: "user", content: "这个订单的快递到哪了？" }] },
  config  // 👈 同一个 thread_id
);
// ✅ Agent 回复：您的订单 12345 正在派送中...
```

> **💡 thread_id 就是「会话 ID」**
> 不同的 thread_id 代表不同的会话，状态互不干扰。这就像不同的顾客打电话进来，客服会各自记录对应的信息。

### 用不同的 thread_id 实现多会话

```typescript
// 用户 A 的会话
await graph.invoke(
  { messages: [{ role: "user", content: "我买了台电脑" }] },
  { configurable: { thread_id: "user-a" } }
);

// 用户 B 的会话——独立，不受 A 的影响
await graph.invoke(
  { messages: [{ role: "user", content: "我买了台电脑" }] },
  { configurable: { thread_id: "user-b" } }
);

// 用户 A 继续之前的对话——还记得电脑的事
await graph.invoke(
  { messages: [{ role: "user", content: "什么时候发货？" }] },
  { configurable: { thread_id: "user-a" } }  // ✅ 还记得
);
```

---

### ⚡ 生产进阶：Durability 模式

生产环境中，Checkpointer 的**持久化策略**直接影响系统性能和可靠性。LangGraph 提供了三种 **Durability 模式**，让你在性能和数据安全之间做权衡：

| 模式 | 行为 | 性能 | 风险 | 适用场景 |
|------|------|------|------|----------|
| `"async"`（默认） | 后台异步写入 checkpoint，不阻塞图执行 | 🚀 最快 | ⚠️ 崩溃时可能丢失最近几步的状态 | 开发调试、可容忍少量丢失的生产 |
| `"sync"` | 每一步执行前**同步等待** checkpoint 写入完成 | 🐢 最慢但最安全 | ✅ 无数据丢失 | 金融交易、订单处理等需要强一致性的场景 |
| `"exit"` | 只在图执行完成时写入一次 checkpoint | 🚀 最快 | ❌ 崩溃时丢失全部中间状态 | 只关心最终结果的批处理任务 |

#### async（默认模式）——推荐用于大多数场景

默认情况下，checkpoint 在后台异步写入，图**不需要等待**写入完成就可以继续执行下一步。这让你既获得了持久化能力，又几乎不损失性能。

```typescript
// 默认模式：async — 无需显式指定
const graph = graphBuilder.compile({ checkpointer: new MemorySaver() });

// 等同于显式指定
const graph = graphBuilder.compile({ 
  checkpointer: new MemorySaver(),
  durability: "async"  // 默认值，可省略
});
```

#### sync 模式——金融级可靠性

当你需要确保**每一步的状态都安全落地**后才能继续执行时（比如处理支付），使用 `sync` 模式：

```typescript
// 同步模式：每一步都等 checkpoint 写完
const graph = graphBuilder.compile({ 
  checkpointer: new MemorySaver(),
  durability: "sync"  // 同步写入，保证每一步都被保存
});

// stream 时也可以指定
await graph.stream(
  { messages: [{ role: "user", content: "下单" }] },
  { ...config, durability: "sync" }
);
```

> **💡 为什么需要 sync 模式？**
> 在 async 模式下，如果程序在第5步执行完后、第5步的 checkpoint 还没写入磁盘时崩溃了，重启后只能从第4步继续。sync 模式确保第5步执行前，第4步的 checkpoint 一定已经安全写入。

#### exit 模式——只记最终状态

当你只关心**最终结果**，不需要中间状态的恢复能力时（比如批量数据处理），使用 `exit` 模式：

```typescript
// Exit 模式：只保存最终状态
const graph = graphBuilder.compile({ 
  checkpointer: new MemorySaver(),
  durability: "exit"  // 只在结束时写入
});
```

> **💡 怎么选？**
> - 开发调试 → `async`（默认）——速度最快，交互流畅
> - 生产环境（一般场景） → `async` ——性能好，偶尔丢失几步可接受
> - 生产环境（支付/交易） → `sync` ——安全第一
> - 批处理任务 → `exit` ——只关心最终结果

---

## 🌊 流式输出——让用户看到思考过程

LLM 生成文本需要时间。如果等全部生成完才给用户看，体验很差。流式输出可以让用户**逐字看到** LLM 的回复。

### stream——获取中间状态

```typescript
// 使用 stream() 替代 invoke()
const stream = await graph.stream(
  { messages: [{ role: "user", content: "讲个故事" }] },
  config
);

// 每个 node 执行完都会产生一次输出
for await (const output of stream) {
  console.log("中间状态:", JSON.stringify(output, null, 2));
}
```

### streamEvents——更精细的控制

```typescript
// 使用 v3 版本的流式事件
const stream = await graph.streamEvents(
  { messages: [{ role: "user", content: "讲个故事" }] },
  { ...config, version: "v3" }
);

// 逐字读取 LLM 的生成内容
for await (const message of stream.messages) {
  for await (const token of message.text) {
    process.stdout.write(token);  // 逐字打印到控制台
  }
}
```

### 实战：前端实时展示 LLM 输出

```typescript
// 配合前端使用的模式
async function* streamAgentResponse(userInput: string) {
  const stream = await graph.streamEvents(
    { messages: [{ role: "user", content: userInput }] },
    { configurable: { thread_id: "live-chat" }, version: "v3" }
  );

  for await (const event of stream) {
    // 不同类型的事件
    switch (event.event) {
      case "on_chat_model_stream":
        // LLM 逐字输出
        yield { type: "token", content: event.data.chunk.text };
        break;
      case "on_chain_end":
        // 节点执行完毕
        yield { type: "node_end", node: event.name };
        break;
    }
  }
}

// 在 React/Next.js 中使用
// for await (const chunk of streamAgentResponse("你好")) {
//   setOutput(prev => prev + chunk.content);
// }
```

---

## 🏪 Store——长期记忆

Checkpointer 是**会话级别的记忆**（只在一个 thread 内共享）。有时你需要**跨会话的记忆**（比如用户长期偏好），这时就用 `Store`。

### 两种记忆系统的对比

| 特性 | Checkpointer | Store |
|------|-------------|-------|
| 作用域 | 单 thread（会话内） | 跨 thread（全局） |
| 存储内容 | 图的状态 | 自定义数据 |
| 生命周期 | 会话结束可清理 | 长期保存 |
| 典型用途 | 对话历史、执行状态 | 用户偏好、共享知识库 |
| 是否需要持久化存储 | 建议需要 | ❓ 可选 |

### 使用 Store

```typescript
// 创建 Store（这里用内存版本）
const store = new MemoryStore();

// 在节点中读取和写入 Store
const agentNode: GraphNode<typeof State> = async (state, config) => {
  // 读取用户偏好
  const userPrefs = await config.store?.get(["users", "user-123"], "preferences");
  
  // 根据偏好调整回复
  const response = userPrefs?.value?.language === "zh" 
    ? await model.invoke([...state.messages])
    : await model.invoke([...state.messages]);
  
  // 更新使用记录
  await config.store?.put(
    ["users", "user-123"],
    "usage",
    { lastVisit: new Date().toISOString() }
  );
  
  return { messages: [response] };
};
```

---

## 🎮 Time Travel——时间旅行

有了 Checkpointer，LangGraph 还能做到一件很酷的事——**回溯到任意历史状态重新执行**。

### 查看历史状态

```typescript
// 获取某个 thread 的所有历史状态
const states = [];
for await (const state of graph.getStateHistory(config)) {
  states.push(state);
}

// states 是按时间倒序排列的，最新的在前
// 每个 state 包含当时的完整状态和配置
console.log(`总共有 ${states.length} 个历史状态`);

// 找到某个特定节点执行前的状态
const beforeToolCall = states.filter(
  s => s.next.includes("toolNode")
).pop();

if (beforeToolCall) {
  // 从那个状态重新执行
  const replayResult = await graph.invoke(null, beforeToolCall.config);
}
```

### 分叉执行（Fork）

```typescript
// 从某个历史状态"分叉"——创建一条新的执行路径
const beforeToolCall = states.filter(
  s => s.next.includes("toolNode")
).pop();

if (beforeToolCall) {
  // 修改历史状态中的某条消息内容
  const forkConfig = await graph.updateState(
    beforeToolCall.config,
    { messages: [{ role: "user", content: "改了主意，不要查询了" }] }
  );
  
  // 从分叉点继续执行
  const forkResult = await graph.invoke(null, forkConfig);
  // Agent 会基于修改后的消息重新决策
}
```

> **💡 分叉的用途：**
> - **调试**：回到某个错误的决策点，修改输入重试
> - **假设分析**：如果用户当时问了不同的问题，Agent 会怎么回答？
> - **人工修正**：发现之前的一次回复不准确，修改后让 Agent 继续

---

## 🔨 实战演练

### 练习：实现带记忆的对话 Agent

**场景描述：**
构建一个 Agent，它能：
1. 记住用户在不同轮次中透露的信息（名字、偏好等）
2. 在后续对话中引用这些信息
3. 支持流式输出
4. 不同 thread_id 的用户之间不互相干扰

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { StateSchema, MessagesValue, StateGraph, GraphNode, MemorySaver, START, END } from "@langchain/langgraph";
import * as z from "zod";

// 状态定义
const State = new StateSchema({
  messages: MessagesValue,
  userInfo: z.string().default(""),
});

// 创建一个有记忆的 LLM 节点
const llmCall: GraphNode<typeof State> = async (state) => {
  // 组装系统提示词，包含已收集的用户信息
  const systemPrompt = state.userInfo
    ? `你是一个友好的助手。你已经知道以下用户信息：${state.userInfo}`
    : "你是一个友好的助手。";

  const result = await model.invoke([
    { role: "system", content: systemPrompt },
    ...state.messages,
  ]);

  // 尝试从用户消息中提取信息
  const lastUserMsg = state.messages.filter(m => m.role === "user").at(-1);
  let newUserInfo = state.userInfo;

  if (lastUserMsg?.content) {
    const content = String(lastUserMsg.content);
    if (content.includes("我叫") || content.startsWith("我叫")) {
      const name = content.replace("我叫", "").trim();
      newUserInfo = `用户名字：${name}`;
    }
  }

  return {
    messages: [result],
    userInfo: newUserInfo,
  };
};

// 检查是否需要工具的条件边
const shouldContinue: ConditionalEdgeRouter<typeof State, typeof END> = (state) => {
  const lastMessage = state.messages.at(-1);
  if (lastMessage?.tool_calls?.length) {
    return "toolNode";
  }
  return END;
};

// 创建 checkpointer
const checkpointer = new MemorySaver();

// 编译图
const graph = new StateGraph(State)
  .addNode("llmCall", llmCall)
  .addEdge(START, "llmCall")
  .addEdge("llmCall", END)
  .compile({ checkpointer });

// 测试：同一会话
const config = { configurable: { thread_id: "test-session" } };

// 第一轮
const r1 = await graph.invoke(
  { messages: [{ role: "user", content: "你好，我叫小明" }] },
  config
);
console.log("Agent:", r1.messages.at(-1)?.content);

// 第二轮——应该记得名字
const r2 = await graph.invoke(
  { messages: [{ role: "user", content: "我叫什么名字？" }] },
  config
);
console.log("Agent:", r2.messages.at(-1)?.content);
// 应该输出：你叫小明
```

**预期输出：**
```
Agent: 你好小明！很高兴认识你！
Agent: 你叫小明，刚才你告诉我了！
```

</details>

---

## 📝 本章小结

- ✅ **Checkpointer** 为图添加持久化能力，支持断点续传和会话记忆
- ✅ **Durability 模式**：`async`（默认，性能优先）、`sync`（强一致）、`exit`（仅最终状态）三种持久化策略
- ✅ `thread_id` 用于区分不同的会话，同一会话共享状态
- ✅ **stream()** 获取每个节点的执行输出
- ✅ **streamEvents(v3)** 支持逐字获取 LLM 生成的内容
- ✅ **Store** 提供跨会话的长期记忆
- ✅ **Time Travel** 支持回溯历史状态和分叉执行

## ➡️ 下一章预告

> 在下一章中，我们将学习 LangGraph 的**高级特性**——Interrupts（人机交互）、容错机制、Subgraphs（子图）等，这些是构建生产级 Agent 的关键能力。
> [下一章：高级特性 →](./06-advanced-features.md)
