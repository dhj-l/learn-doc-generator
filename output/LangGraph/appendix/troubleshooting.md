# 附录B：常见错误排错指南

> 收集 LangGraph 开发中最常见的错误和解决方法

---

## 🚫 安装与环境问题

### E1: `Cannot find module '@langchain/langgraph'`

**错误信息：**
```
Error: Cannot find module '@langchain/langgraph'
```

**原因：** 没有安装 LangGraph 包  
**解决方法：**
```bash
npm install @langchain/langgraph
```

### E2: `Cannot find module 'zod'`

**错误信息：**
```
Error: Cannot find module 'zod'
```

**原因：** Zod 是 LangGraph 的 peer dependency，需要单独安装  
**解决方法：**
```bash
npm install zod
```

### E3: TypeScript 类型报错

**错误信息：**
```
Type 'X' is not assignable to type 'Y'
```

**原因：** 类型定义不匹配  
**解决方法：**
- 确保 `StateSchema` 中字段的类型和节点返回的类型一致
- 检查 Zod schema 定义是否正确
- 使用 `typeof State.Type` 获取状态的类型

---

## 🔧 图构建问题

### E4: `Node 'xxx' not found`

**错误信息：**
```
Error: Node 'someNode' not found
```

**原因：** `addEdge` 或 `addConditionalEdges` 引用了不存在的节点  
**解决方法：**
```typescript
// ❌ 错误：'myNode' 还没添加
graph.addEdge(START, "myNode");
graph.addNode("otherNode", nodeFunc);

// ✅ 正确：先添加节点，再连接边
graph.addNode("myNode", nodeFunc);
graph.addNode("otherNode", nodeFunc);
graph.addEdge(START, "myNode");
```

### E5: `No path from START to END`

**错误信息：**
```
Error: Graph cannot be compiled. No path from START to END.
```

**原因：** 图中的节点没有连到 END，形成死路  
**解决方法：** 确保所有可能的路径最终都到达 `END`：
```typescript
// 所有分支都要能到达 END
graph.addConditionalEdges("router", router, ["nodeA", "nodeB", END]);
graph.addEdge("nodeA", END);
graph.addEdge("nodeB", END);
// END 本身不需要 connect
```

### E6: `Duplicate node name`

**错误信息：**
```
Error: Node with name 'llmCall' already exists
```

**原因：** 添加了同名节点  
**解决方法：** 每个节点名称必须唯一：
```typescript
// ❌ 错误
graph.addNode("process", node1);
graph.addNode("process", node2);  // 冲突！

// ✅ 正确
graph.addNode("step1", node1);
graph.addNode("step2", node2);
```

---

## ⚡ 执行问题

### E7: 状态不更新

**问题：** 节点执行了，但状态没有变化  
**原因：** 节点返回了空对象或没有返回正确的字段  
**解决方法：**
```typescript
const node: GraphNode<typeof State> = (state) => {
  // ❌ 错误：没有返回任何更新
  // return {};

  // ✅ 正确：返回要更新的字段
  return { messages: [newMessage] };
};
```

### E8: Checkpointer 相关错误

**错误信息：**
```
Error: Checkpointer is required for this operation
```

**原因：** 使用了需要 Checkpointer 的功能（如 `getStateHistory`、Interrupt）但没有配置  
**解决方法：**
```typescript
// ❌ 错误：没有 checkpointer
const graph = graphBuilder.compile();

// ✅ 正确：传入 checkpointer
const graph = graphBuilder.compile({
  checkpointer: new MemorySaver(),
});

// 调用时需要 thread_id
const config = { configurable: { thread_id: "my-session" } };
```

### E9: Interrupt 无法恢复

**问题：** 调用 `invoke(new Command({ resume: ... }))` 时报错  
**原因：** 没有传入正确的 config（`thread_id`）或图没有 checkpointer  
**解决方法：**
```typescript
// 确保：
// 1. 编译时传入 checkpointer
// 2. 每次调用都用同一个 thread_id
// 3. 使用 Command 恢复

const result = await graph.invoke(
  new Command({ resume: "approve" }),
  { configurable: { thread_id: "same-thread" } }  // 必须一致
);
```

### E10: 无限循环

**问题：** Agent 不停地调用工具，永远不结束  
**原因：** 条件边逻辑不完整或 LLM 一直返回 tool_calls  
**解决方法：**
```typescript
// 方案1：设置最大循环次数
let callCount = 0;
const llmCall: GraphNode<typeof State> = async (state) => {
  callCount++;
  if (callCount > 10) {
    return new Command({
      goto: END,
      update: { messages: [{ role: "ai", content: "抱歉，我无法完成这个请求。" }] }
    });
  }
  // ... 正常逻辑
};

// 方案2：在条件边中添加兜底
const shouldContinue = (state) => {
  const lastMsg = state.messages.at(-1);
  if (lastMsg?.tool_calls?.length) {
    // 检查工具调用次数
    const toolCallCount = state.messages.filter(
      m => m.role === "tool"
    ).length;
    if (toolCallCount > 5) {
      return END;  // 超过 5 次就强制结束
    }
    return "toolNode";
  }
  return END;
};
```

---

## 🔗 工具调用问题

### E11: 工具参数不匹配

**错误信息：**
```
Error: Tool 'xxx' received invalid arguments
```

**原因：** LLM 生成的参数不符合工具定义的 schema  
**解决方法：**
```typescript
// 确保 schema 定义清晰
const myTool = tool(async ({ a, b }) => a + b, {
  name: "add",
  description: "计算两个数的和",    // 描述要清晰
  schema: z.object({
    a: z.number().describe("第一个数"),  // 每个字段都要 describe
    b: z.number().describe("第二个数"),
  }),
});
```

### E12: LLM 不调用工具

**问题：** LLM 应该调用工具，但只是文字回复  
**原因：** 没有 bindTools，或工具的 description 不够清晰  
**解决方法：**
```typescript
// 确保绑定了工具
const modelWithTools = model.bindTools(tools);

// 工具描述要清晰
const searchTool = tool(async ({ q }) => { ... }, {
  name: "web_search",
  description: "搜索互联网获取最新信息。当用户问到时事、新闻、最新数据时使用此工具。",  // 要具体！
  schema: z.object({ q: z.string() }),
});
```

---

## 🎯 流式输出问题

### E13: `streamEvents` 没有输出

**问题：** 调用 `streamEvents` 但没有任何输出  
**原因：** 没有传 `version: "v3"` 或事件类型过滤不对  
**解决方法：**
```typescript
const stream = await graph.streamEvents(input, {
  ...config,
  version: "v3",  // 必须指定
});

// 正确的事件类型
for await (const message of stream.messages) { ... }  // ✅
for await (const event of stream.events) { ... }       // 或 events
```

---

## 📦 部署问题

### E14: `langgraph.json` 配置错误

**问题：** 部署时找不到文件或路径不对  
**解决方法：** 确保 `langgraph.json` 正确：
```json
{
  "node_version": "18",
  "graphs": {
    "agent": "./src/agent.ts:graph"    // 路径:导出变量名
  },
  "env": ".env"
}
```

### E15: API Key 未设置

**错误信息：**
```
Error: Anthropic API key is missing
```

**原因：** 环境变量没配好  
**解决方法：**
```bash
# 创建 .env 文件
echo "ANTHROPIC_API_KEY=your_key_here" > .env

# 注意：不要把 .env 提交到 Git！
echo ".env" >> .gitignore
```

---

## 💡 调试小技巧

### 打印中间状态

```typescript
// 在每个节点中打印当前状态
const debugNode: GraphNode<typeof State> = async (state) => {
  console.log("🔍 当前状态:", JSON.stringify(state, null, 2));
  // ... 原有逻辑
};
```

### 使用 LangSmith

```typescript
// 配置 LangSmith 来追踪调用
process.env.LANGCHAIN_TRACING_V2 = "true";
process.env.LANGCHAIN_API_KEY = "your_langsmith_key";
```

### 简化问题排查

遇到复杂问题时，先构建最小的可复现用例：

```typescript
// 最小化测试
const TestState = new StateSchema({
  value: z.number().default(0),
});

const testNode: GraphNode<typeof TestState> = (state) => {
  return { value: state.value + 1 };
};

const testGraph = new StateGraph(TestState)
  .addNode("test", testNode)
  .addEdge(START, "test")
  .addEdge("test", END)
  .compile();

const result = await testGraph.invoke({ value: 0 });
console.log(result);  // { value: 1 }
```
