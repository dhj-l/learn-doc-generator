# 附录A：API 速查表

> 按使用频率排序，常用 API 在前

---

## 🔹 核心 API（高频使用）

### 状态定义

```typescript
import { StateSchema, MessagesValue, ReducedValue } from "@langchain/langgraph";

// 基本状态
const State = new StateSchema({
  messages: MessagesValue,                    // 消息列表
  field: z.string(),                          // 普通字段
  fieldWithDefault: z.number().default(0),    // 带默认值
});

// 自定义合并逻辑
const State = new StateSchema({
  total: new ReducedValue(z.number().default(0), {
    reducer: (x, y) => x + y                 // 求和
  }),
  items: new ReducedValue(z.array(z.string()).default(() => []), {
    reducer: (a, b) => [...a, ...b]          // 数组合并
  }),
});
```

### Graph API

```typescript
import { StateGraph, START, END, GraphNode, ConditionalEdgeRouter } from "@langchain/langgraph";

// 创建图
const graph = new StateGraph(State)
  .addNode("name", nodeFunction)                     // 添加节点
  .addEdge(START, "nodeName")                        // 起点→节点
  .addEdge("nodeA", "nodeB")                         // 节点→节点（固定）
  .addConditionalEdges("fromNode", router, targets)  // 条件边
  .addEdge("nodeName", END)                          // 节点→终点
  .compile({ checkpointer });                        // 编译

// 执行
await graph.invoke(input, config);                   // 完整执行
for await (const s of graph.stream(input, config)) {} // 流式执行
```

### Functional API

```typescript
import { task, entrypoint, addMessages } from "@langchain/langgraph";

const myTask = task("taskName", async (input) => {   // 定义任务
  return result;
});

const workflow = entrypoint("name", async (input) => { // 定义入口
  const r1 = await myTask(input);
  return r1;
});

await workflow.invoke(input);                         // 执行
await workflow.streamEvents(input, { version: "v3" }); // 流式
```

---

## 🔸 节点编写

```typescript
// 普通节点
const node: GraphNode<typeof State> = (state) => {
  return { field: "new value" };  // 返回要更新的字段
};

// 异步节点
const asyncNode: GraphNode<typeof State> = async (state) => {
  const result = await someApi();
  return { field: result };
};

// 带 Command 的节点（同时控制路由）
const cmdNode: GraphNode<typeof State, "nextNode"> = (state) => {
  return new Command({
    goto: state.condition ? "nodeA" : "nodeB",  // 指定下一步
    update: { field: "value" },                  // 更新状态
  });
};
```

---

## 🔸 条件边

```typescript
const router: ConditionalEdgeRouter<typeof State, "toolNode"> = (state) => {
  if (condition) return "nodeName";  // 去某节点
  return END;                        // 结束
};

// 并行发送
const parallelRouter = (state) => {
  return state.items.map(
    (item) => new Send("worker", { data: item })
  );
};
```

---

## 🔸 持久化

```typescript
import { MemorySaver } from "@langchain/langgraph";

const checkpointer = new MemorySaver();                    // 内存版
const config = { configurable: { thread_id: "session-1" } };  // 会话 ID

// 获取历史状态
for await (const s of graph.getStateHistory(config)) {}

// 分叉（Time Travel Fork）
const forkConfig = await graph.updateState(oldConfig, newState);

// Interrupt
const response = interrupt({ message: "请确认" });
const resumed = await graph.invoke(new Command({ resume: "yes" }), config);
```

---

## 🔸 工具

```typescript
import { tool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";

const myTool = tool(async ({ param }) => {
  return result;
}, {
  name: "tool_name",
  description: "工具描述",
  schema: z.object({ param: z.string() }),
});

const toolNode = new ToolNode([tool1, tool2]);   // 工具节点
model.bindTools([tool1, tool2]);                  // 绑到模型
```

---

## 🔸 流式输出

```typescript
// 方式1：stream
for await (const output of graph.stream(input, config)) {}

// 方式2：streamEvents（v3，支持逐字）
const stream = await graph.streamEvents(input, { ...config, version: "v3" });
for await (const message of stream.messages) {
  for await (const token of message.text) {
    process.stdout.write(token);
  }
}
```

---

## 🔸 安装

```bash
npm install @langchain/langgraph        # 核心包
npm install @langchain/core             # LangChain 核心
npm install @langchain/anthropic        # Claude 模型
npm install @langchain/openai           # OpenAI 模型
npm install zod                         # 数据验证
npm install @langchain/langgraph-sdk    # 部署 SDK
```
