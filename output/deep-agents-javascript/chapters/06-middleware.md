# 第6章 中间件系统详解

> 预计学习时间：50 分钟

## 🎯 本章目标

学习完本章，你将能够：
- 理解 wrapModelCall 和 wrapTools 两类中间件的作用和区别
- 掌握 6 个内置中间件的用途和配置方式
- 编写自定义中间件实现日志、限流、权限检查等功能
- 使用中间件实现动态模型切换和工具拦截
- 理解中间件的执行顺序和组合方式

## 📋 前置知识

> 如果你还没有学习以下内容，建议先完成：
> - [第2章 核心概念与架构](./02-core-concepts.md) —— 了解 `createDeepAgent` 的参数列表
> - [第3章 工具系统详解](./03-tool-system.md) —— 了解工具调用循环的基本概念

---

## 💡 核心概念

### 6.1 什么是中间件？

**用一个类比来理解：**

> 你开了一家咖啡店。除了正常的咖啡制作流程（取杯→研磨→冲泡→出品），你还需要一些"横切"的服务：
> - **日志记录**：每杯咖啡是谁点的、什么时间、什么品种
> - **权限检查**：只有会员才能点特调咖啡
> - **限流控制**：高峰期每人限购 2 杯
> - **监控告警**：如果咖啡机温度异常，自动报警
>
> 这些服务不改变咖啡本身，但它们为整个流程增加了可观测性和控制力。在 Deep Agents 中，**中间件（Middleware）** 就是这样的角色——它"包裹"在 Agent 的核心流程外面，在不修改核心逻辑的前提下添加各种横切关注点。

**中间件的核心函数签名：**

```typescript
// 中间件的本质是一个"包裹函数"
// 它在核心流程执行前后插入自定义逻辑

// 以 wrapModelCall 为例：
type ModelCallMiddleware = (request, next) => {
  // 1. 前置逻辑 —— 在调用 LLM 之前执行
  //    例如：记录开始时间、检查调用权限、修改请求参数
  console.log(`[前置] 开始调用模型，输入消息数: ${request.state.messages.length}`);

  try {
    // 2. 调用 next() —— 执行真正的 LLM 调用（或链中的下一个中间件）
    const response = await next(request);

    // 3. 后置逻辑 —— 在 LLM 返回之后执行
    //    例如：计算耗时、记录 Token 消耗、缓存结果
    console.log(`[后置] 模型响应完成`);
    return response;
  } catch (error) {
    // 4. 错误处理 —— 捕获 LLM 调用过程中的异常
    //    例如：重试、降级、记录错误
    console.error(`[错误] 模型调用失败: ${error}`);
    throw error;
  }
};
```

### 6.2 两类中间件

Deep Agents 有两种类型的中间件，分别"包裹"在 Agent 的不同环节。理解两者的区别，有助于你在实际开发中选择正确的中间件类型：

```typescript
const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  systemPrompt: "你是一个有用的助手。",
  middlewares: [
    // 类型 1：wrapModelCall —— 包裹 LLM 调用
    // 作用：在每次 LLM 调用前后插入逻辑
    // 适用场景：日志、性能监控、Token 计数、缓存策略、动态模型切换
    {
      name: "Logging",
      wrapModelCall: async (request, next) => {
        console.time("llm-call");
        const response = await next(request);
        console.timeEnd("llm-call");
        return response;
      },
    },
    // 类型 2：wrapTools —— 包裹工具执行
    // 作用：在工具调用前后插入逻辑
    // 适用场景：权限检查、超时控制、审计日志、结果缓存
    {
      name: "ToolAudit",
      wrapTools: async (toolCalls, next) => {
        for (const call of toolCalls) {
          console.log(`[工具调用] ${call.name}`);
        }
        return await next(toolCalls);
      },
    },
  ],
});
```

**两者的区别对比如下：**

| 方面 | `wrapModelCall` | `wrapTools` |
|------|----------------|-------------|
| **包裹对象** | LLM 模型调用（发往 AI 的请求） | 工具函数执行（Agent 调用的外部能力） |
| **触发时机** | 每次 LLM 推理时触发——包括工具调用后的再次推理 | 每次 Agent 决定执行工具时触发 |
| **典型用途** | 记录 LLM 调用日志、统计 Token 消耗、动态切换模型 | 校验工具参数合法性、限制调用频率、记录审计日志 |
| **request 内容** | 包含 state（消息列表）、model（模型名称）等 | 包含工具调用列表（name + args） |

> **💡 为什么需要区分这两类中间件？**
> 因为 Agent 运行过程中的"模型调用"和"工具调用"是两个完全不同的环节。模型调用是 Agent 与 LLM 之间的通信，而工具调用是 Agent 与外部系统之间的通信。如果不加区分，用同一个中间件同时处理两种逻辑，会导致代码耦合度高、难以维护。分开定义让每个中间件职责单一，更容易理解和复用。

### 6.3 6 个内置中间件

Deep Agents 内置了 6 个中间件，覆盖了 Agent 运行的常见需求。这些中间件在创建 Agent 时自动启用，一般情况下你不需要手动配置它们。但理解它们的工作方式，可以帮助你在出现问题时快速定位，或者在需要自定义行为时作为参考：

| 中间件名称 | 类型 | 作用 |
|-----------|------|------|
| `agent-stream` | wrapModelCall | 将 LLM 的流式输出转换为 Agent 的流式事件，支持 `stream()` 模式 |
| `agent-http` | wrapModelCall | 处理 HTTP 请求/响应格式转换，将 LangServe 协议适配到 Agent 内部 |
| `agent-files` | wrapModelCall | 在每次 LLM 调用前，自动将 `files` 参数中的文件内容注入到系统提示中 |
| `agent-tool-checker` | wrapTools | 检查工具调用的合法性，验证参数是否符合 Zod Schema 定义 |
| `agent-mcp` | wrapTools | 支持 MCP（Model Context Protocol）工具协议，让 Agent 能调用 MCP 工具 |
| `agent-context` | wrapModelCall | 在 LLM 调用时注入运行时上下文信息（如 userId、role 等）|

> **💡 为什么需要 6 个内置中间件？**
> 你可以把这 6 个中间件想象成智能手机的出厂预装应用——它们覆盖了最常用的功能，开箱即用，不需要你费心配置。其中 4 个围绕模型调用（流式处理、HTTP 适配、文件注入、上下文注入），2 个围绕工具执行（参数校验、MCP 协议支持）。这种"关注点分离"的设计让每个中间件只做一件事，且做到最好。

以 `agent-files` 中间件为例，看看它实际的工作方式：

```typescript
// agent-files 中间件的简化实现
// 它的作用是将 files 参数中的文件内容自动注入到系统提示后面
const fileInjector = {
  name: "FileInjector",
  wrapModelCall: async (request, next) => {
    // 在调用 LLM 之前，读取 files 参数指定的文件
    const files = request.state.files || [];
    let systemPrompt = request.state.systemPrompt || "";

    for (const filePath of files) {
      // 读取文件内容并追加到系统提示中
      const content = await readFile(filePath);
      systemPrompt += `\n\n## 文件引用: ${filePath}\n\`\`\`\n${content}\n\`\`\``;
    }

    // 调用真正的 LLM，传入增强后的系统提示
    return await next({
      ...request,
      state: { ...request.state, systemPrompt },
    });
  },
};
```

> **💡 为什么内置中间件自动启用？**
> 因为这些中间件解决了 Agent 运行中最常见的基础问题——流式输出、文件注入、工具校验等。如果每次创建 Agent 都需要手动配置这些，用户体验会非常差。但如果你需要覆盖默认行为，也可以通过 `middlewares` 参数传入自定义中间件来覆盖。

### 6.5 中间件的洋葱模型

理解中间件的执行顺序非常重要。所有中间件按照"洋葱模型"（Onion Model）层层包裹——你传入的中间件数组中的顺序决定了它们的嵌套层级：

```typescript
const middlewares = [
  {
    name: "外层",
    wrapModelCall: async (req, next) => {
      console.log("① 外层：前置");
      const result = await next(req);  // ⬇️ 进入内层
      console.log("⑤ 外层：后置");
      return result;
    },
  },
  {
    name: "内层",
    wrapModelCall: async (req, next) => {
      console.log("② 内层：前置");
      const result = await next(req);  // ⬇️ 真正的 LLM 调用
      console.log("④ 内层：后置");
      return result;
    },
  },
];
// 输出顺序：① → ② → [LLM调用] → ④ → ⑤
```

**为什么叫"洋葱模型"？**

> 因为中间件的执行路径是从外层一层层进入，到达核心后再一层层退出——就像剥洋葱一样，先进入最外层，再进入内层，到达核心后原路返回。每次 `next()` 调用就是"往下剥一层"，`next()` 返回就是"往回退一层"。这种模型的最大优势是：**每个中间件只需关心自己的逻辑**，不需要知道其他中间件的存在。你可以自由组合、增删中间件，而不影响彼此。

**示例 1：性能监控中间件**

性能监控是最常用的中间件模式之一。它的核心思想是：在不修改原有业务逻辑的前提下，量化模型调用的性能指标。通过记录每次 LLM 调用的耗时、输入输出大小等指标，你可以发现性能瓶颈、优化模型选择策略，甚至设置告警阈值。

```typescript
const performanceMonitor = {
  name: "PerformanceMonitor",
  wrapModelCall: async (request, next) => {
    // 前置：记录开始时间和消息统计
    const startTime = Date.now();
    const msgCount = request.state.messages.length;
    const msgLength = request.state.messages.reduce(
      (sum, m) => sum + (m.content?.length || 0), 0
    );

    try {
      // 执行真正的 LLM 调用
      const response = await next(request);
      const latency = Date.now() - startTime;

      // 后置：输出性能指标
      console.log(`📊 [Performance] 消息数: ${msgCount} | 输入长度: ${msgLength} | 延迟: ${latency}ms`);

      return response;
    } catch (error) {
      console.error(`🚨 [Performance] 调用失败: ${error}`);
      throw error;
    }
  },
};
```

**示例 2：工具调用审计中间件**

```typescript
const auditTrail = {
  name: "AuditTrail",
  wrapTools: async (toolCalls, next) => {
    // 记录所有工具调用
    for (const call of toolCalls) {
      console.log(`📝 [审计] 工具: ${call.name} | 参数: ${JSON.stringify(call.args)}`);
    }

    // 执行工具
    const results = await next(toolCalls);

    // 记录工具结果
    for (const result of results) {
      console.log(`📝 [审计] 工具: ${result.name} | 结果长度: ${result.output?.length || 0}`);
    }

    return results;
  },
};

// 使用审计中间件
const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  tools: [searchTool, calculateTool],
  middlewares: [auditTrail],
});
```

---

## 🔨 实战演练

### 练习 1：实现请求日志中间件

**场景描述：**
创建一个中间件，记录每次 LLM 调用的请求和响应信息，包括时间戳、消息数量和响应时长。这对于调试和监控 Agent 行为非常有用。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { createDeepAgent } from "deepagents";

const requestLogger = {
  name: "RequestLogger",
  wrapModelCall: async (request, next) => {
    const timestamp = new Date().toISOString();
    const msgCount = request.state.messages.length;

    console.log(`[${timestamp}] 🤖 LLM 调用开始 | 消息数: ${msgCount}`);

    const startTime = Date.now();
    const response = await next(request);
    const elapsed = Date.now() - startTime;

    console.log(`[${timestamp}] ✅ LLM 调用完成 | 耗时: ${elapsed}ms`);

    return response;
  },
};

const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  middlewares: [requestLogger],
  systemPrompt: "你是一个助手。回答要简洁。",
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "1+1等于几？" }],
});
console.log(`\n最终回答: ${result.messages.at(-1)?.content}`);
```

**预期输出：**
```
[2025-01-15T10:30:00.000Z] 🤖 LLM 调用开始 | 消息数: 1
[2025-01-15T10:30:01.235Z] ✅ LLM 调用完成 | 耗时: 1235ms

最终回答: 1+1等于2。
```

</details>

### 练习 2：工具调用限流中间件

**场景描述：**
某些工具可能调用外部付费 API（如搜索引擎、翻译服务、图像生成等），每次调用都产生费用。如果不加限制，一个失控的 Agent 可能在单轮对话中调用几十次工具，导致意外的费用支出。实现一个限流中间件，当单轮对话中工具调用超过阈值时自动中断，保护你的 API 预算。

**你的任务：**
1. 创建一个 `wrapTools` 类型的中间件，命名为 `RateLimiter`
2. 定义一个阈值常量 `MAX_CALLS_PER_TURN = 3`
3. 在中间件中检查当前工具调用数量是否超过阈值
4. 如果超限，返回错误提示信息而非执行工具
5. 如果未超限，正常执行 `next(toolCalls)`

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
const rateLimiter = {
  name: "RateLimiter",
  wrapTools: async (toolCalls, next) => {
    const MAX_CALLS_PER_TURN = 3;  // 每轮最多 3 次工具调用

    if (toolCalls.length > MAX_CALLS_PER_TURN) {
      console.warn(`⚠️ 工具调用超限 (${toolCalls.length} > ${MAX_CALLS_PER_TURN})`);
      // 返回错误结果，而非执行工具
      return toolCalls.map(call => ({
        name: call.name,
        output: `❌ 工具 ${call.name} 被限流拦截：单轮最多调用 ${MAX_CALLS_PER_TURN} 次`,
      }));
    }

    return await next(toolCalls);
  },
};

const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  tools: [searchWeb, calculate, translate],
  middlewares: [rateLimiter],
  systemPrompt: "你是一个助手。",
});

**预期输出：**
```
⚠️ 工具调用超限 (4 > 3)
[工具 searchWeb 被限流拦截：单轮最多调用 3 次]
[工具 calculate 被限流拦截：单轮最多调用 3 次]
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：中间件组合顺序

中间件的执行顺序是按照数组中的顺序"从外到内"的：

```typescript
const middlewares = [
  { name: "Outer", wrapModelCall: async (req, next) => {
    console.log("1. 外层中间件：前置");
    const result = await next(req);   // 先经过外层的 next，才进入内层
    console.log("5. 外层中间件：后置");
    return result;
  }},
  { name: "Inner", wrapModelCall: async (req, next) => {
    console.log("2. 内层中间件：前置");
    const result = await next(req);   // 真正的 LLM 调用
    console.log("4. 内层中间件：后置");
    return result;
  }},
];
// 执行顺序：1 → 2 → LLM → 4 → 5
```

### 技巧二：中间件的错误传播

中间件可以选择捕获错误、记录日志后重新抛出，或者吞没错误让上层继续处理：

```typescript
const errorHandler = {
  name: "ErrorHandler",
  wrapModelCall: async (request, next) => {
    try {
      return await next(request);
    } catch (error) {
      // 记录错误信息，便于排查问题
      console.error(`模型调用错误: ${error.message}`);
      // 重新抛出错误，让上层中间件或调用方继续处理
      // 如果不重新抛出，错误会被"吞没"，调用方将收不到任何错误通知
      throw error;  // 重新抛出，不吞没错误
    }
  },
};
```

**错误传播的两种策略对比：**

| 策略 | 做法 | 效果 |
|------|------|------|
| 捕获并重新抛出 | catch → log → throw | 上层可以继续处理，调用方知道出错 |
| 捕获并吞没 | catch → log → return 默认值 | 调用方不知道出错，但 Agent 可能行为异常 |

> **💡 建议：** 在大多数情况下，应该选择"重新抛出"。吞没错误虽然看起来"稳定"，但实际上会让问题更难排查——Agent 可能给出了错误的答案，而你完全不知道原因。

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Deep Agents 有哪两类中间件？它们的区别是什么？**
> A：`wrapModelCall`（包裹 LLM 调用，用于日志、监控、动态模型切换）和 `wrapTools`（包裹工具执行，用于权限检查、审计、限流）。

**Q2：内置的 6 个中间件各自的作用是什么？**
> A：agent-stream（流式转换）、agent-http（HTTP 处理）、agent-files（文件注入）、agent-tool-checker（工具校验）、agent-mcp（MCP 协议支持）、agent-context（运行时上下文注入）。

**Q3：中间件的执行顺序是怎样的？**
> A：按照 middlewares 数组的顺序"洋葱模型"执行——数组第一个中间件最先进入，最后退出。

**Q4：中间件可以捕获并处理模型调用的错误吗？**
> A：可以。通过 try/catch 包裹 next(request)，中间件可以捕获错误、记录日志、或者执行降级逻辑后重新抛出。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 中间件不执行 | 未正确传入 `middlewares` 参数 | 确认 middlewares 数组格式正确 |
| `wrapTools` 未收到工具调用 | 中间件注册顺序问题 | 在 wrapModelCall 中处理工具相关逻辑 |
| 中间件导致 Agent 运行变慢 | 中间件中有同步阻塞操作 | 确保所有中间件函数是异步的 |
| 中间件的错误被吞没 | 未正确 rethrow 错误 | 在 catch 中记录后重新抛出 `throw error` |

---

## 📝 本章小结

- ✅ 中间件是 Agent 的"包裹层"，在不修改核心逻辑的前提下添加横切关注点
- ✅ 两类中间件：`wrapModelCall`（LLM 调用）和 `wrapTools`（工具执行）
- ✅ 6 个内置中间件自动启用，覆盖常见需求
- ✅ 自定义中间件可实现日志、监控、限流、审计等功能
- ✅ 中间件按"洋葱模型"顺序执行，数组第一个最先进入
- ✅ 中间件可以捕获、记录、传播或吞没下游错误

## ➡️ 下一章预告

> 在下一章中，我们将学习 Deep Agents 的后端（Backend）系统——理解 CompositeBackend 架构、4 种存储后端类型（StateBackend、FilesystemBackend、ACPServerBackend、CompositeBackend），以及如何选择和配置适合的后端。
>
> [第7章 后端系统详解](./07-backend.md)
