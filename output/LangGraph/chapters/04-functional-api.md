# 第4章：Functional API——更简洁的方式

> 预计学习时间：1 小时

## 🎯 本章目标

学习完本章，你将能够：
- 理解 Functional API 与 Graph API 的区别
- 使用 `task` 定义独立的工作单元
- 使用 `entrypoint` 组合工作流程
- 用循环和条件逻辑控制执行流程

## 📋 前置知识

> 如果你还没有学习以下内容，建议先完成：
> - [第3章：Graph API](./03-graph-api.md)

---

## 💡 为什么需要 Functional API？

前面我们用 Graph API 构建了一个 Agent，回想一下我们做了哪些事：

1. 定义状态（StateSchema）
2. 定义节点（GraphNode）
3. 定义边（addEdge / addConditionalEdges）
4. 编译（compile）
5. 执行（invoke）

对于简单的场景，这有点**杀鸡用牛刀**了——就像你只是想写个函数，结果要定义一个完整的图结构。

**Functional API** 就是来解决这个问题的。它让你用**普通的 async 函数**来定义工作流，LangGraph 在背后自动帮你处理状态管理和执行编排。

### 两种 API 的对比

| 维度 | Graph API | Functional API |
|------|-----------|----------------|
| 思维模型 | 图（节点+边） | 函数（任务+编排） |
| 代码量 | 较多 | 简洁 |
| 适用场景 | 复杂分支、并行、子图 | 线性/循环流程 |
| 学习曲线 | 稍陡 | 平缓 |
| 灵活性 | 极高 | 高 |

> **一句话总结**：Graph API 是「声明式」的——你要明确画出图的结构；Functional API 是「命令式」的——你用代码逻辑直接控制流程。

---

## 🔧 核心概念

Functional API 只有两个核心概念：

### task——最小的执行单元

> `task` 就像是一个**有名字的函数**——它封装了一段可执行的逻辑。

```typescript
import { task } from "@langchain/langgraph";

const greet = task("greet", async (name: string) => {
  return `你好，${name}！`;
});

// 调用 task
const result = await greet("小明");
console.log(result);  // "你好，小明！"
```

`task` 和普通函数的区别：
- task 有**名字**——便于调试和日志
- task 可以被 LangGraph **追踪和编排**
- task 支持**缓存**（通过 ttl 选项）

### entrypoint——工作流的入口

> `entrypoint` 就是**整个工作流的入口函数**——它编排多个 task 的执行顺序和交互逻辑。

```typescript
import { entrypoint } from "@langchain/langgraph";

const workflow = entrypoint("myWorkflow", async (input: string) => {
  const greeting = await greet(input);  // 调用 task
  return greeting;
});

// 执行工作流
const result = await workflow.invoke("小明");
```

---

## 🔨 用 Functional API 重写计算 Agent

让我们用 Functional API 重新实现第3章的四则运算 Agent，感受一下简洁度：

```typescript
import { tool } from "@langchain/core/tools";
import { ChatAnthropic } from "@langchain/anthropic";
import { task, entrypoint, addMessages } from "@langchain/langgraph";
import {
  SystemMessage,
  HumanMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { ToolCall } from "@langchain/core/messages/tool";
import * as z from "zod";

// 1️⃣ 定义工具（和之前一样）
const add = tool(({ a, b }) => a + b, {
  name: "add",
  description: "计算两个数的和",
  schema: z.object({ a: z.number(), b: z.number() }),
});

const multiply = tool(({ a, b }) => a * b, {
  name: "multiply",
  description: "计算两个数的积",
  schema: z.object({ a: z.number(), b: z.number() }),
});

const divide = tool(({ a, b }) => a / b, {
  name: "divide",
  description: "计算两个数的商",
  schema: z.object({ a: z.number(), b: z.number() }),
});

const toolsByName = { add, multiply, divide };
const model = new ChatAnthropic({ model: "claude-sonnet-4-6", temperature: 0 });
const modelWithTools = model.bindTools(Object.values(toolsByName));

// 2️⃣ 定义 task
// task "callLlm"：调用 LLM
const callLlm = task("callLlm", async (messages: BaseMessage[]) => {
  return modelWithTools.invoke([
    new SystemMessage("你是一个乐于助人的助手，可以执行算术运算。"),
    ...messages,
  ]);
});

// task "callTool"：执行工具
const callTool = task("callTool", async (toolCall: ToolCall) => {
  const tool = toolsByName[toolCall.name as keyof typeof toolsByName];
  return tool.invoke(toolCall);  // 调用工具并返回结果
});

// 3️⃣ 用 entrypoint 组合工作流
const agent = entrypoint("agent", async (messages: BaseMessage[]) => {
  // 第一次调用 LLM
  let modelResponse = await callLlm(messages);

  // Agent 循环：只要有 tool_calls 就继续
  while (true) {
    // LLM 没有请求工具 → 结束
    if (!modelResponse.tool_calls?.length) {
      break;
    }

    // 并行执行所有工具调用
    const toolResults = await Promise.all(
      modelResponse.tool_calls.map((toolCall) => callTool(toolCall))
    );

    // 把 LLM 回复和工具结果都追加到消息列表
    messages = addMessages(messages, [modelResponse, ...toolResults]);

    // 再次调用 LLM，让它基于工具结果继续思考
    modelResponse = await callLlm(messages);
  }

  // 返回最终的消息列表
  return addMessages(messages, [modelResponse]);
});

// 4️⃣ 执行
const result = await agent.invoke([
  new HumanMessage("计算 3 + 4 * 2 等于多少？"),
]);

for (const message of result) {
  console.log(`[${message.type}]: ${message.text}`);
}
```

### Graph API vs Functional API 对比

**Graph API 版本（第3章）：**
```typescript
// 需要：StateSchema + GraphNode × 2 + ConditionalEdgeRouter + addEdge × 3 + addConditionalEdges + compile
```

**Functional API 版本（本章）：**
```typescript
// 只需要：task × 2 + entrypoint（里面用 while 循环控制逻辑）
```

**核心差异：**
- Graph API：你**画图**，框架负责走图
- Functional API：你**写代码**，框架帮你管理状态和执行

---

## ⚡ 进阶用法

### 1. task 的缓存

`task` 支持结果缓存，避免重复计算：

```typescript
const expensiveTask = task(
  { name: "expensiveOp", ttl: 60 },  // ttl: 缓存 60 秒
  async (input: string) => {
    console.log("真正执行了...");
    return `处理: ${input}`;
  }
);

// 第一次调用：真正执行
await expensiveTask("hello");  // 打印 "真正执行了..."

// 第二次调用（60 秒内）：使用缓存结果
await expensiveTask("hello");  // 不打印，直接返回缓存
```

### 2. 流式输出

Functional API 也支持流式输出：

```typescript
const stream = await agent.streamEvents(
  [new HumanMessage("写一首诗")],
  { version: "v3" }
);

// 逐条读取中间状态
for await (const snapshot of stream.values) {
  console.log("当前进度:", snapshot);
}

// 读取 LLM 的逐字输出
for await (const message of stream.messages) {
  for await (const token of message.text) {
    process.stdout.write(token);  // 逐字打印
  }
}
```

### 3. 多步骤工作流

Functional API 特别适合**多步骤处理流水线**：

```typescript
const analyzeSentiment = task("analyzeSentiment", async (text: string) => {
  // 分析情感
  return { score: 0.8, label: "positive" };
});

const generateResponse = task("generateResponse", async (text: string, sentiment: any) => {
  // 根据情感生成回复
  return `感谢你的${sentiment.label === "positive" ? "好评" : "反馈"}！`;
});

const formatOutput = task("formatOutput", async (response: string) => {
  return { result: response, timestamp: new Date().toISOString() };
});

const workflow = entrypoint("customerService", async (userMessage: string) => {
  // 步骤 1：分析情感
  const sentiment = await analyzeSentiment(userMessage);
  
  // 步骤 2：生成回复
  const response = await generateResponse(userMessage, sentiment);
  
  // 步骤 3：格式化输出
  const output = await formatOutput(response);
  
  return output;
});
```

---

## 🔨 实战演练

### 练习：构建一个「生成+评估」优化循环

**场景描述：**
构建一个笑话生成器，生成笑话后让 LLM 自我评估：
- 如果不好笑，根据反馈修改后再试
- 最多尝试 3 次
- 如果第 3 次还不好笑，接受现状

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import * as z from "zod";
import { task, entrypoint } from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";

const model = new ChatAnthropic({ model: "claude-sonnet-4-6" });

const feedbackSchema = z.object({
  grade: z.enum(["funny", "not funny"]).describe("评价笑话是否好笑"),
  feedback: z.string().describe("如果不好的话，提供改进建议"),
});
const evaluator = model.withStructuredOutput(feedbackSchema);

// Task 1: 生成笑话
const jokeGenerator = task("jokeGenerator", async (params: {
  topic: string;
  feedback?: string;
}) => {
  const prompt = params.feedback
    ? `写一个关于"${params.topic}"的笑话，要参考之前的反馈：${params.feedback}`
    : `写一个关于"${params.topic}"的笑话`;
  
  const result = await model.invoke(prompt);
  return result.content;
});

// Task 2: 评估笑话
const jokeEvaluator = task("jokeEvaluator", async (joke: string) => {
  return evaluator.invoke(`请评价这个笑话：${joke}`);
});

// 工作流
const workflow = entrypoint("jokeMaster", async (topic: string) => {
  let feedback: string | undefined;
  let joke = "";
  const maxAttempts = 3;

  for (let i = 0; i < maxAttempts; i++) {
    console.log(`\n--- 第 ${i + 1} 次尝试 ---`);
    
    // 生成笑话
    joke = await jokeGenerator({ topic, feedback });
    console.log(`生成的笑话：${joke}`);
    
    // 评估
    const evaluation = await jokeEvaluator(joke as string);
    console.log(`评估结果：${evaluation.grade}`);
    
    // 如果好笑了就结束
    if (evaluation.grade === "funny") {
      console.log("🎉 成功！");
      break;
    }
    
    // 收集反馈用于下次
    feedback = evaluation.feedback;
    console.log(`改进建议：${feedback}`);
  }

  return { joke, feedback };
});

// 执行
const result = await workflow.invoke("程序员");
console.log("\n最终结果:", result);
```

</details>

---

## 📝 本章小结

- ✅ **Functional API** 让你用普通的 async 函数构建工作流，比 Graph API 更简洁
- ✅ **task** 是有名字的可执行单元，支持缓存
- ✅ **entrypoint** 是工作流的入口，编排 task 的执行顺序
- ✅ 用 `while` 循环实现 Agent 的「判断-执行」循环
- ✅ `addMessages` 工具函数可以方便地合并消息列表
- ✅ Functional API 也支持流式输出

## ➡️ 下一章预告

> 在下一章中，我们将学习 LangGraph 的**持久化机制**——让 Agent 拥有记忆、支持断点恢复、流式输出和历史回放。
> [下一章：持久化、流式输出与检查点 →](./05-persistence-streaming.md)
