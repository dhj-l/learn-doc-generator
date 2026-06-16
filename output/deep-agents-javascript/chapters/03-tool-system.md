# 第3章 工具系统详解

> 预计学习时间：1 小时 10 分钟

## 🎯 本章目标

学习完本章，你将能够：
- 使用 `tool()` 函数定义带 Zod Schema 约束的工具
- 理解工具调用循环的完整生命周期和执行机制
- 实现多工具的顺序调用和并行协作
- 使用 `ToolRuntime` 接口访问运行时上下文信息
- 掌握工具错误处理和重试策略

## 📋 前置知识

> 如果你还没有学习以下内容，建议先完成：
> - [第1章 概述与环境搭建](./01-introduction.md) —— 了解 Agent 的基本概念和创建方式
> - [第2章 核心概念与架构](./02-core-concepts.md) —— 了解 createDeepAgent 的完整参数

---

## 💡 核心概念

### 3.1 什么是工具（Tool）？

**用一个类比来理解：**

> 想象你是一个助理（Agent），老板（用户）让你去查一个客户的联系方式、算一笔账、并整理成报告。你的桌上放着三部工具：**电话**（查通讯录）、**计算器**（算数字）、**电脑**（写文档）。你会先通过电话查到客户号码，然后用计算器算出总额，最后在电脑上写成报告。每完成一步，你可能需要根据结果决定下一步做什么。
>
> 在 Deep Agents 中，**工具（Tool）** 就是 Agent 可以调用的外部能力——搜索网络、查询数据库、发送邮件、调用 API、读写文件等等。每个工具通过清晰的 Schema（模式）定义输入和输出格式，Agent 在推理过程中自主决定何时调用哪个工具、传入什么参数。

**工具的核心三要素：**

理解工具的三个核心要素，是掌握工具系统的基础。每个工具由以下三部分组成：

**1. 实现函数（Implementation Function）** —— 工具实际执行的逻辑代码。当 Agent 决定调用这个工具时，这个函数就会被执行。它接收经过 Zod Schema 验证后的参数，执行具体的业务逻辑（如调用 API、查询数据库、计算表达式），然后返回结果字符串。

**2. 元数据（Metadata）** —— 描述工具的用途和使用方式。LLM 通过元数据中的 `name` 和 `description` 来理解这个工具是做什么的、什么时候应该调用它。`description` 写得好不好，直接决定了 Agent 能不能在正确的场景下使用这个工具。

**3. Schema（输入模式）** —— 使用 Zod 定义输入参数的格式、类型、约束和默认值。Zod Schema 不仅验证 LLM 生成的参数是否合法，还通过 `.describe()` 方法告诉 LLM 每个参数应该填什么内容。

```typescript
// 一个工具由三部分组成：
const myTool = tool(
  async (args) => {
    // 1. 实现逻辑 —— 工具具体做什么
    return "result";
  },
  {
    // 2. 元数据 —— 描述工具的用途和用法
    name: "my_tool",
    description: "What this tool does and when to use it",
    // 3. Schema —— 定义输入参数的格式和约束
    schema: z.object({
      param1: z.string().describe("What param1 is"),
    }),
  }
);
```

### 3.2 工具调用循环（Tool-Calling Loop）

工具调用循环是 Agent 运行的核心机制。理解这个循环，就能理解 Agent 的行为模式：

```
用户提问
    │
    ▼
┌──────────────────────┐
│  1. LLM 推理         │ ←─ 判断用户问题，决定是否需要调用工具
│  生成响应或工具调用    │
└──────────┬───────────┘
           │
           需要工具吗？
           ├── 否 → 5. 返回最终响应给用户（结束循环）
           │
           ▼ 是
┌──────────────────────┐
│  2. 执行工具函数      │ ←─ 调用工具、传入参数、获取结果
│     （可能出错重试）    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  3. 工具结果加入对话   │ ←─ 结果作为新消息追加到对话历史
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  4. 回到 LLM 推理     │ ←─ LLM 看到工具结果后决定下一步
│     （回到步骤 1）     │
└──────────────────────┘
```

**这个循环的关键特点：**

理解这个循环的运作方式，对于设计高效的 Agent 至关重要。以下是循环的四个关键特点：

1. **Agent 可以连续调用多个工具** —— Agent 不限于一次只调用一个工具。它可以根据需要依次调用多个工具，比如先搜索获取信息、再根据结果进行计算、最后将结果翻译成另一种语言。每次工具调用后，LLM 都会重新评估下一步应该做什么。

2. **工具结果自动加入对话上下文** —— 工具执行完毕后，返回的结果会自动作为一条新消息追加到对话历史中。这意味着 LLM 在后续推理时可以看到之前所有工具调用的结果，就像人类在对话中回顾之前的讨论一样。这种机制保证了 Agent 的"记忆"连贯性。

3. **循环直到 Agent 认为可以回答为止** —— 循环的终止条件是：LLM 的响应中不再包含工具调用。当 LLM 认为已经收集到足够的信息来回答用户的问题时，它会生成一个普通的文本响应（而非工具调用），此时循环结束，最终响应返回给用户。

4. **工具可以出错，但不会导致崩溃** —— 如果工具执行过程中抛出了错误，错误信息不会导致 Agent 崩溃。相反，错误信息会像正常结果一样被加入对话上下文，LLM 看到错误后可以决定：修正参数重新尝试、选择其他工具替代、或者直接告诉用户错误信息。

```typescript
// 工具循环的代码体现 —— Agent 自动管理这个循环
const agent = createDeepAgent({
  tools: [searchWeb, calculate],  // Agent 有两个工具可用
  systemPrompt: "You are an assistant with search and calculation abilities.",
});

// 用户提问后，Agent 内部自动执行工具循环
const result = await agent.invoke({
  messages: [
    { role: "user", content: "What is the population of France divided by 2?" },
  ],
});
// Agent 内部执行：
//   Step 1: LLM 推理 → 决定调用 search_web("population of France")
//   Step 2: 执行 search_web → 返回 "68 million"
//   Step 3: 将结果加入对话 → LLM 再次推理
//   Step 4: LLM 决定调用 calculate("68000000 / 2") → 返回 "34000000"
//   Step 5: 再次推理 → 给出最终答案 "34 million"
//   Step 6: 没有更多工具调用 → 循环结束，返回结果
```

### 3.3 定义工具

Deep Agents 使用 LangChain 的 `tool()` 函数来定义工具。这个函数接受两个参数：**实现函数**和**元数据配置**：

```typescript
import { tool } from "langchain";
import { z } from "zod";

const getWeather = tool(
  // 第一个参数：工具的实现函数
  // 接收 Zod Schema 验证后的参数对象
  async ({ city, units }: { city: string; units?: string }) => {
    // 这里写真实的工具逻辑 —— 调用外部 API、查询数据库等
    const weather = await fetchWeatherFromApi(city, units);
    return `The weather in ${city} is ${weather.temperature}°${units === "f" ? "F" : "C"}`;
  },
  {
    // 第二个参数：工具的元数据配置
    name: "get_weather",                                 // 工具名称（唯一标识）
    description: "Get the current weather for a given city", // 描述工具的用途
    schema: z.object({                                   // 输入参数的 Schema
      city: z.string().describe("The city name, e.g. Tokyo"),
      units: z.enum(["c", "f"]).optional().describe("Temperature unit"),
    }),
  }
);
```

#### 参数说明

| 参数 | 说明 |
|------|------|
| `name` | 工具名称，Agent 用此名称引用工具（唯一、小写+下划线） |
| `description` | 工具描述，LLM 理解工具用途的关键 —— **写清楚！** |
| `schema` | Zod Schema 定义参数的格式、约束和默认值 |
| 实现函数 | 接收 Schema 解析后的参数，返回结果字符串 |

> **💡 为什么 description 这么重要？**
> LLM 完全通过 description 来判断何时调用这个工具。写得越清楚、越具体，Agent 就越能在正确的场景下使用它。一个好的 description 应该告诉 LLM 三件事：
> 1. **什么场景下用** —— "Use this when the user asks about weather"
> 2. **参数怎么填** —— "Pass the city name as it appears in standard spelling"
> 3. **返回什么结果** —— "Returns temperature with unit indicator"

### 3.4 多工具协作

Agent 可以同时注册多个工具，并自主决定调用顺序和次数。这是 Agent 最强大的能力之一——它能像人一样，根据任务需要组合使用多个工具：

```typescript
import { createDeepAgent, tool } from "langchain";
import { z } from "zod";

// 工具 1：网络搜索 —— 获取信息
const searchWeb = tool(
  async ({ query }: { query: string }) => {
    // 模拟搜索：返回格式化的结果
    return `Search results for: ${query}\n- Result 1\n- Result 2\n- Result 3`;
  },
  {
    name: "search_web",
    description: "Search the web for current information on any topic",
    schema: z.object({
      query: z.string().describe("The search query, be specific"),
    }),
  }
);

// 工具 2：数学计算 —— 处理数字
const calculate = tool(
  async ({ expression }: { expression: string }) => {
    // 使用 Function 构造函数安全执行数学表达式
    const fn = new Function(`return (${expression})`);
    return `Result: ${fn()}`;
  },
  {
    name: "calculate",
    description: "Evaluate a mathematical expression",
    schema: z.object({
      expression: z.string().describe("Math expression like '(2 + 3) * 4'"),
    }),
  }
);

// 工具 3：文本翻译 —— 处理多语言
const translate = tool(
  async ({ text, targetLang }: { text: string; targetLang: string }) => {
    // 模拟翻译服务
    return `Translation to ${targetLang}: [${text}]`;
  },
  {
    name: "translate",
    description: "Translate text from any language to another language",
    schema: z.object({
      text: z.string().describe("The text to translate"),
      targetLang: z.string().describe("Target language code, e.g. 'zh', 'ja', 'fr'"),
    }),
  }
);

// 注册所有工具 —— Agent 会自主选择使用
const agent = createDeepAgent({
  tools: [searchWeb, calculate, translate],
  systemPrompt: "You are a versatile assistant with search, calculation, and translation abilities.",
});
```

**多工具调用的典型执行流程：**

当 Agent 拥有多个工具时，它的推理过程就像人类解决复杂问题一样——拆解任务、逐步执行、灵活组合。下面是一个具体的执行示例：

假设用户提问："法国的 population 是多少？除以 2 之后是多少？再把 'hello' 翻译成法语。"

```
用户提问 → Agent 分析发现这是三个子任务的组合
    │
    ▼
Step 1: LLM 推理 → "用户想知道法国人口，我需要先搜索"
    │  Agent 决定调用 search_web
    ▼
Step 2: Agent → search_web("population of France 2025")
    │  工具返回 "68 million"
    ▼
Step 3: LLM 看到结果 → "法国人口是 6800 万，用户还要求除以 2"
    │  Agent 决定调用 calculate
    ▼
Step 4: Agent → calculate("68000000 / 2")
    │  工具返回 "34000000"
    ▼
Step 5: LLM 看到结果 → "结果是 3400 万，用户还要求翻译"
    │  Agent 决定调用 translate
    ▼
Step 6: Agent → translate("hello", "fr")
    │  工具返回 "Bonjour"
    ▼
Step 7: LLM 看到所有结果 → 整合信息生成最终回答
    │  LLM 的响应中没有工具调用 → 循环结束
    ▼
最终响应: "法国人口约 6800 万，除以 2 后是 3400 万。
          'hello' 的法语翻译是 'Bonjour'。"
```

> **💡 关键洞察：** Agent 的"思维链"（Chain of Thought）完全体现在工具调用序列中。通过观察 Agent 调用了哪些工具、以什么顺序调用，你就可以理解 Agent 的推理过程。这也是 `agent.stream()` 模式在调试时极其有用的原因。

### 3.5 LangChain `createAgent` 与 Deep Agents `createDeepAgent` 工具系统对比

| 特性 | Deep Agents (`createDeepAgent`) | LangChain (`createAgent`) |
|------|-------------------------------|---------------------------|
| 工具定义方式 | 相同 `tool()` 函数 | 相同 `tool()` 函数 |
| 内置工具 | ✅ `write_todos` / `ls` / `read_file` / `write_file` / `edit_file` / `grep` / `glob` | ❌ 无内置工具，需要自己定义 |
| ToolRuntime | ✅ 支持运行时上下文访问 | ✅ 支持 |
| 子代理工具 | ✅ 内置 `task()` 工具用于委派子代理 | ❌ 需手动实现子代理调度 |
| 动态工具注册 | ✅ 通过中间件 `wrapModelCall` | ✅ 通过中间件 |

### 3.6 `ToolRuntime` 接口

在真实的业务场景中，工具经常需要访问调用者的身份信息或环境数据。`ToolRuntime` 接口让工具函数的第二个参数可以访问运行时上下文：

```typescript
import { tool } from "langchain";
import type { ToolRuntime } from "@langchain/core/tools";
import { z } from "zod";

// 第一步：定义运行时上下文的 Schema
// 这个 Schema 定义了可以在工具中访问的数据结构
const contextSchema = z.object({
  userId: z.string(),                    // 当前用户的 ID
  role: z.enum(["admin", "user"]),       // 用户角色
});

// 第二步：在工具函数中访问运行时上下文
// 第二个参数 runtime 的类型由 contextSchema 推断
const fetchUserData = tool(
  async (
    input: { query: string },
    runtime: ToolRuntime<unknown, typeof contextSchema>
  ) => {
    // 从 runtime.context 读取上下文信息
    const userId = runtime.context?.userId;
    const role = runtime.context?.role;

    // 根据角色返回不同级别的数据
    if (role === "admin") {
      return `[Admin Access] Full data for user ${userId}: ${input.query}`;
    }
    return `[User Access] Your personal data: ${input.query}`;
  },
  {
    name: "fetch_user_data",
    description: "Fetch data for the currently logged-in user",
    schema: z.object({
      query: z.string().describe("What data to look up"),
    }),
  }
);

// 第三步：创建 Agent 并传入 contextSchema
const agent = createDeepAgent({
  tools: [fetchUserData],
  contextSchema,  // 注册上下文 Schema
  systemPrompt: "You help users access their data securely.",
});

// 第四步：调用时传递上下文信息
const result = await agent.invoke(
  { messages: [{ role: "user", content: "Get my recent activity" }] },
  { context: { userId: "user-123", role: "admin" } }
);
// 在工具内部，runtime.context.userId === "user-123"
// 在工具内部，runtime.context.role === "admin"
```

> **💡 ToolRuntime 的典型应用场景：**
> **场景一：多租户数据隔离**
> 在 SaaS 应用中，不同租户的数据必须严格隔离。通过 ToolRuntime，工具可以读取当前用户的 tenantId，只查询该租户的数据。这样你可以在多个客户之间共享同一个 Agent 实例，而不必担心数据泄露。
>
> **场景二：基于角色的权限控制**
> 管理员和普通用户的权限不同。工具通过 `runtime.context.role` 判断调用者的角色，决定返回数据的范围。管理员可以看到全局统计，普通用户只能看到自己的数据。
>
> **场景三：审计与合规**
> 在金融、医疗等合规要求严格的行业中，每一次数据访问都需要记录「谁在什么时间查了什么」。ToolRuntime 提供的 userId 和 sessionId 可以直接用于审计日志的生成。

---

## 🔨 实战演练

### 练习 1：构建电商客服工具集

**场景描述：**
为电商客服平台构建一套完整的工具集，包括订单状态查询、商品搜索和退货处理。Agent 需要根据用户的问题自主选择合适的工具并组合使用。

**你的任务：**
1. 创建三个工具：`get_order`（查订单）、`search_products`（搜商品）、`initiate_return`（发起退货）
2. 用 `createDeepAgent` 组合这些工具
3. 测试 Agent 是否能根据用户问题自动选择正确的工具

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { createDeepAgent } from "deepagents";
import { tool } from "langchain";
import { z } from "zod";

// 模拟订单数据库
const orders: Record<string, { status: string; items: string[]; total: number }> = {
  "ORD-001": { status: "shipped", items: ["Widget A"], total: 250 },
  "ORD-002": { status: "processing", items: ["Widget B"], total: 125 },
};

// 工具 1：订单查询
const getOrder = tool(
  async ({ orderId }: { orderId: string }) => {
    const order = orders[orderId];
    if (!order) return `Order ${orderId} not found. Please check the order ID.`;
    return `Order ${orderId}: Status=${order.status}, Items=${order.items.join(", ")}, Total=$${order.total}`;
  },
  {
    name: "get_order",
    description: "Get detailed information about a customer's order by order ID",
    schema: z.object({
      orderId: z.string().describe("The order ID in format ORD-XXX"),
    }),
  }
);

// 工具 2：商品搜索
const searchProducts = tool(
  async ({ query }: { query: string }) => {
    const products = [
      { name: "Widget A", price: 25, stock: 10, category: "Tools" },
      { name: "Widget B", price: 25, stock: 5, category: "Tools" },
      { name: "Gadget C", price: 50, stock: 0, category: "Electronics" },
    ];
    const results = products.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.category.toLowerCase().includes(query.toLowerCase())
    );
    if (results.length === 0) return "No products found matching your query.";
    return results
      .map((p) => `${p.name}: $${p.price} (${p.stock > 0 ? "✅ In stock" : "❌ Out of stock"})`)
      .join("\n");
  },
  {
    name: "search_products",
    description: "Search for products by name or keyword. Returns price and stock info.",
    schema: z.object({
      query: z.string().describe("Product name or category to search"),
    }),
  }
);

// 工具 3：退货处理
const initiateReturn = tool(
  async ({ orderId, reason }: { orderId: string; reason: string }) => {
    if (!orders[orderId]) return `Order ${orderId} not found.`;
    return `✅ Return initiated for ${orderId}.\nReason: ${reason}\nA prepaid shipping label will be emailed to you within 24 hours.`;
  },
  {
    name: "initiate_return",
    description: "Start the return/refund process for a customer's order",
    schema: z.object({
      orderId: z.string().describe("The order ID to return"),
      reason: z.string().describe("Customer's reason for the return"),
    }),
  }
);

// 组合所有工具
const agent = createDeepAgent({
  tools: [getOrder, searchProducts, initiateReturn],
  systemPrompt: `You are an e-commerce customer support agent.
  Help customers with:
  - Checking order status (use get_order)
  - Searching products (use search_products)
  - Initiating returns (use initiate_return)
  Always confirm details before initiating a return.`,
});

// 测试多工具协作
async function main() {
  const result = await agent.invoke({
    messages: [
      {
        role: "user",
        content: "I want to check my order ORD-001 and also search for gadgets.",
      },
    ],
  });

  for (const msg of result.messages ?? []) {
    if (msg.content && typeof msg.content === "string") {
      console.log(`\n[${msg._getType().toUpperCase()}]\n${msg.content}`);
    }
  }
}

main().catch(console.error);
```

**预期输出：**
```
[HUMAN]
I want to check my order ORD-001 and also search for gadgets.

[AI]
Let me help you with both!

1. First, checking your order ORD-001...
(get_order tool called)

2. Now searching for gadgets...
(search_products tool called)

Here are the results:
📦 Order ORD-001: Shipped ✓ - Widget A, Total $250
🛍️ Gadget C: $50 (Currently out of stock)

Would you like to initiate a return or find alternative products?
```

</details>

### 练习 2：工具错误处理

**场景描述：**
工具调用可能因为各种原因失败——API 不可用、参数无效、限流等。Agent 需要优雅地处理这些错误，而不是直接崩溃。

**你的任务：**
1. 创建一个可能失败的股票价格查询工具
2. 测试有效和无效的股票代码
3. 观察 Agent 如何处理工具错误

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { createDeepAgent } from "deepagents";
import { tool } from "langchain";
import { z } from "zod";

// 带错误处理的股票查询工具
const fetchStockPrice = tool(
  async ({ symbol }: { symbol: string }) => {
    // 模拟 API 调用可能失败的情况
    const invalidSymbols = ["XXX", "YYY", "ZZZ"];
    if (invalidSymbols.includes(symbol.toUpperCase())) {
      throw new Error(`Invalid stock symbol: ${symbol}. Please check and try again.`);
    }

    const prices: Record<string, number> = {
      AAPL: 175.50,
      GOOGL: 140.25,
      MSFT: 380.30,
      AMZN: 178.20,
    };

    const price = prices[symbol.toUpperCase()];
    if (!price) {
      throw new Error(`Price data not available for symbol: ${symbol}. It may be delisted.`);
    }

    return `${symbol}: $${price.toFixed(2)} (updated ${new Date().toLocaleDateString()})`;
  },
  {
    name: "fetch_stock_price",
    description: "Get the current stock price for a given ticker symbol. Supports NYSE and NASDAQ.",
    schema: z.object({
      symbol: z.string().min(1).max(5).describe("Stock ticker symbol, e.g. AAPL, GOOGL, MSFT"),
    }),
  }
);

const agent = createDeepAgent({
  tools: [fetchStockPrice],
  systemPrompt: `You are a stock price assistant.
  When you get an error from a tool:
  1. Explain it clearly to the user
  2. Suggest possible corrections
  3. Try alternative symbols if appropriate`,
});

async function main() {
  const queries = [
    "What's the price of AAPL?",
    "What about XXX stock?",     // 无效代码
    "Can you try MSFT?",
  ];

  let messages: any[] = [];
  for (const query of queries) {
    const result = await agent.invoke({
      messages: [...messages, { role: "user", content: query }],
    });
    messages = result.messages;
    const lastMsg = result.messages.at(-1);
    if (lastMsg?.content && typeof lastMsg.content === "string") {
      console.log(`\n${lastMsg.content}`);
    }
  }
}

main().catch(console.error);
```

**预期输出：**
```
AAPL: $175.50 (updated 1/15/2025)

It looks like "XXX" is not a valid stock symbol. Stock symbols are typically 1-5 letters.
Could you check the symbol and try again? Common tech symbols include AAPL, GOOGL, MSFT, AMZN.

MSFT: $380.30 (updated 1/15/2025)
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：工具 Schema 最佳实践

好的 Schema 设计能显著提高 Agent 正确调用工具的概率：

```typescript
// ✅ 好的 Schema —— 清晰、有示例、有约束
const goodTool = tool(
  async (args) => { /* ... */ },
  {
    name: "search_flights",
    description: "Search for available flights between two airports on a specific date",
    schema: z.object({
      origin: z.string().min(3).max(4)
        .describe("IATA airport code, e.g. PEK, JFK, LAX"),
      destination: z.string().min(3).max(4)
        .describe("IATA airport code, e.g. LHR, NRT, CDG"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Departure date in YYYY-MM-DD format"),
      passengers: z.number().int().min(1).max(9).default(1)
        .describe("Number of passengers (max 9)"),
    }),
  }
);

// ❌ 不好的 Schema —— 模糊、无约束
const badTool = tool(
  async (args) => { /* ... */ },
  {
    name: "search",
    description: "Search",  // 太模糊，LLM 不知道什么时候用
    schema: z.object({
      q: z.string(),  // 没有 describe，LLM 不知道填什么
    }),
  }
);
```

### 技巧二：工具限流与超时保护

```typescript
const rateLimitedTool = tool(
  async ({ query }: { query: string }) => {
    // 使用 AbortController 实现 5 秒超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`https://api.example.com/search?q=${query}`, {
        signal: controller.signal,
      });
      return await response.text();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "Search timed out. Please try again later.";
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  },
  {
    name: "safe_search",
    description: "Search with automatic timeout protection",
    schema: z.object({ query: z.string() }),
  }
);
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：工具的 `description` 字段为什么非常重要？**
> A：LLM 完全通过 description 来判断何时调用工具。写清楚的 description（什么场景用、参数怎么填、返回什么结果）能显著提高 Agent 正确调用工具的概率。

**Q2：Agent 如何决定是继续调用工具还是返回最终答案？**
> A：Agent 运行在"LLM 推理 → 工具调用 → 工具结果加入对话 → 再次 LLM 推理"的循环中。当 LLM 生成的响应中不再包含工具调用（tool_calls）时，循环结束，返回最终答案。

**Q3：`ToolRuntime` 参数在工具函数中的作用是什么？**
> A：提供运行时上下文信息（如 userId、role、sessionId 等），让工具可以访问调用者的身份、权限和环境信息，实现多租户数据隔离和权限控制。

**Q4：一个工具抛出错误时，Deep Agents 会怎么处理？**
> A：错误信息会作为工具结果返回给 Agent 的 LLM，Agent 据此可以调整策略（如修正参数重新尝试、告诉用户错误信息、选择备选方案）。

**Q5：多工具协作时，Agent 如何决定工具的调用顺序？**
> A：Agent 的 LLM 根据用户的问题和已有的工具结果自主决定。它像人一样思考：先做什么、看到结果后决定下一步做什么。开发者不需要指定顺序，只需要提供工具和清晰的描述。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Tool 'xxx' not found` | 工具未注册到 Agent 的 tools 数组 | 确保在 `createDeepAgent({ tools: [...] })` 中包含该工具 |
| `ZodError: Validation failed` | LLM 生成的参数不符合 Schema 约束 | 用 `.describe()` 给 LLM 清晰的参数说明和示例 |
| `Tool execution timed out` | 工具执行时间超过默认超时 | 添加 AbortController 超时控制或优化工具性能 |
| 工具循环不停（无限调用） | Agent 不断调用工具无法结束 | 在系统提示中添加约束，如"最多调用 3 次工具" |
| `context is undefined in runtime` | 工具访问 context 但未传入 | 检查 invoke 时是否正确传递了 `context` 参数 |

---

## 📝 本章小结

- ✅ `tool()` 函数定义工具，包含实现函数和元数据（name/description/schema）
- ✅ Agent 运行在"LLM 推理 → 工具调用 → 结果反馈 → 再推理"的循环中
- ✅ 多工具协作：Agent 自主决定调用顺序和次数，无需开发者指定
- ✅ `ToolRuntime` 提供运行时上下文访问，支持多租户和权限控制
- ✅ 工具错误应抛出 Error，Agent 会自动捕获并调整策略
- ✅ 清晰的 description 和 Schema 约束是工具设计的关键
- ✅ Zod Schema 的 `.describe()` 方法直接影响 LLM 生成参数的质量

## ➡️ 下一章预告

> 在下一章中，我们将探索 Deep Agents 的多模型提供商集成 —— 如何使用 7 种不同厂商的模型（Anthropic Claude、OpenAI GPT、Google Gemini、OpenRouter 等），如何在不同模型间切换和对比，以及如何通过 Ollama 运行本地模型进行开发和测试。
>
> [第4章 多模型提供商集成](./04-model-providers.md)
