# LangGraph 常见错误排错指南

## 1. 图编译错误：节点未找到

**错误信息：**
```
Error: Node "xxx" not found in graph
```

**原因：** `addConditionalEdges` 中的路由函数返回了不存在的节点名。

**解决方案：**
```typescript
// 确保路由函数的返回值和映射表一致
.addConditionalEdges('agent', shouldContinue, {
  tools: 'tools',     // ← key 必须和路由函数返回值匹配
  answer: 'answer',
  [END]: END,
})

function shouldContinue(state) {
  // 返回值必须是映射表中的 key
  return 'tools';  // ✅
  return 'tool';   // ❌ 映射表中没有 'tool'
}
```

---

## 2. 状态 reducer 导致数据丢失

**问题：** 节点返回的状态更新被吞掉了。

**原因：** reducer 函数没有正确合并数据。

**解决方案：**
```typescript
// ❌ 覆盖式 reducer 会丢弃之前的数据
const State = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (_, curr) => curr,  // 只保留最新值
  }),
});

// ✅ 追加式 reducer 保留所有数据
const State = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (prev, curr) => [...prev, ...curr],
  }),
});
```

---

## 3. 循环图无限执行

**问题：** 图一直在循环，不结束。

**原因：** 条件边的退出条件不满足。

**解决方案：**
```typescript
// 添加最大迭代次数
const result = await graph.invoke(input, { recursionLimit: 25 });

// 或在状态中添加计数器
const State = Annotation.Root({
  iteration: Annotation<number>({
    reducer: (prev) => prev + 1,
    default: () => 0,
  }),
});

function shouldContinue(state) {
  if (state.iteration >= 10) return END;  // 强制退出
  // ...
}
```

---

## 4. MemorySaver 数据不持久

**问题：** 重启后 checkpointer 数据丢失。

**原因：** `MemorySaver` 存储在内存中。

**解决方案：**
```typescript
// 生产环境使用 SqliteSaver 或 PostgreSQL
import { SqliteSaver } from '@langchain/langgraph/checkpoint/sqlite';
const checkpointer = SqliteSaver.fromConnString('./checkpoints.db');
```

---

## 5. ToolNode 执行错误

**错误信息：**
```
ToolExecutionError: Tool "xxx" returned error
```

**解决方案：**
```typescript
// 在工具内部处理错误
const safeTool = tool(
  async (input) => {
    try {
      return await actualOperation(input);
    } catch (e) {
      return `操作失败: ${e.message}。请尝试其他方式。`;
    }
  },
  { name: 'safe_tool', description: '...', schema: ... }
);
```

---

## 6. 子图状态不兼容

**问题：** 子图返回的状态和主图不匹配。

**解决方案：**
```typescript
// 在子图调用前后做状态转换
async function wrappedSubgraph(state) {
  const subInput = {
    query: state.topic,  // 主图 → 子图 的字段映射
  };
  const subResult = await subgraph.invoke(subInput);
  return {
    summary: subResult.summary,  // 子图 → 主图 的字段映射
  };
}
```

---

## 7. 中断恢复后状态丢失

**问题：** `interrupt` 恢复后，之前的状态不见了。

**解决方案：**
```typescript
// 确保 thread_id 一致
const threadId = 'thread-001';

// 第一次调用
await app.invoke(input, { configurable: { thread_id: threadId } });

// 恢复 — 使用相同的 thread_id
await app.invoke(humanInput, { configurable: { thread_id: threadId } });
```

---

## 8. 流式输出乱序

**问题：** `stream()` 输出的节点结果顺序不对。

**说明：** 这是正常的。流式输出反映的是执行完成的顺序，而非定义顺序。

**解决方案：**
```typescript
// 用 nodeName 过滤你关心的节点
for await (const event of app.stream(input)) {
  if ('myNode' in event) {
    console.log('myNode 完成:', event.myNode);
  }
}
```

---

## 9. 条件边不按预期执行

**问题：** 条件边路由到了错误的节点。

**解决方案：**
```typescript
// 确保条件函数的返回值与 mapping 的 key 完全一致
.addConditionalEdges('agent', (state) => {
  // 返回值必须是 mapping 中的 key
  return 'tools';  // ✅
}, {
  tools: 'tools',     // key = 'tools'
  answer: 'answer',   // key = 'answer'
})
```

---

## 10. createReactAgent 不调用工具

**问题：** Agent 回答了问题但没有使用工具。

**解决方案：**
```typescript
// 1. 确保工具描述清晰
const myTool = tool(fn, {
  name: 'search_docs',
  description: '当需要查找技术文档或回答关于特定技术的问题时使用此工具',  // ← 明确何时使用
  schema: z.object({ query: z.string().describe('搜索关键词') }),
});

// 2. 在 messageModifier 中强调使用工具
const agent = createReactAgent({
  llm: model,
  tools: [myTool],
  messageModifier: '你必须使用 search_docs 工具来回答问题，不要凭记忆回答。',
});
```

## 11. 图编译时报错 "No path from START to X node"
**现象：** 编译 StateGraph 时报节点不可达错误
**原因：** 某个节点没有通过任何边连接到 START 或前序节点
**方案：** 检查每个节点是否都有入边（从 START 或其他节点）和出边（到 END 或其他节点）

## 12. Checkpointer 恢复状态失败
**现象：** 通过 thread_id 恢复时获取不到之前的状态
**原因：** 使用的 checkpointer 实例与之前不同，或 thread_id 不匹配
**方案：** 使用同一个 MemorySaver 实例，确保 thread_id 完全一致

## 13. 条件路由函数返回了未定义的分支
**现象：** 条件边执行时报 "No path for condition X"
**原因：** 路由函数返回的字符串不在 addConditionalEdges 定义的映射中
**方案：** 在 addConditionalEdges 的 mapping 中添加所有可能的分支，或添加 default 分支

## 14. 节点修改了 State 中未定义的字段
**现象：** 节点返回的字段不在 State 的 Annotation 定义中
**原因：** State 的 Annotation 没有覆盖所有需要修改的字段
**方案：** 在 Annotation.Root 中添加缺失的字段定义

## 15. 子图无法访问父图的 State
**现象：** 子图节点读取不到父图 State 中的字段
**原因：** 子图的 State Schema 与父图不兼容
**方案：** 确保子图 Node 的 State 类型与父图中调用子图的节点兼容，使用 shared Annotation 定义公共字段
