# 第11章 子代理架构与任务委派

> 预计学习时间：1 小时

## 🎯 本章目标

学习完本章，你将能够：
- 理解子代理架构解决的问题
- 使用声明式方式配置子代理
- 使用 `CompiledSubAgent` 创建基于 LangGraph 的自定义子代理
- 设计委派指令和系统提示
- 使用 `write_todos` 内建规划工具分解任务

## 📋 前置知识

> 如果你还没有学习以下内容，建议先完成：
> - [第3章 工具系统详解](./03-tool-system.md) —— 了解工具的基本概念和工具定义方式
> - [第6章 中间件系统详解](./06-middleware.md) —— 了解中间件的包裹和执行机制
> - [第8章 沙箱系统](./08-sandbox.md) —— 了解沙箱隔离的概念，子代理与沙箱有相似的设计理念

## 💡 核心概念

### 11.1 为什么需要子代理？

**用一个类比来理解：**

> 想象你是一个项目经理（主 Agent）。客户让你同时做三件事：调研市场趋势、分析竞争对手、撰写商业计划书。如果你一个人做所有事情，效率很低——因为每切换一次任务，你的大脑都需要时间重新进入状态。更有效的方式是：你（项目经理）把这三件事分别委派给三位专家——市场研究员、竞争分析师、商业策划师——他们在各自的领域更专业、效率更高。你只需要告诉他们目标，等他们完成后把结果整合起来。
>
> 在 Deep Agents 中也是同样的道理。当主 Agent 面对复杂任务时，它可以通过 **子代理（Sub Agent）** 机制将任务委派给专门的子 Agent 来处理。每个子 Agent 可以有不同的系统提示、不同的工具集、甚至使用不同的模型——它们各司其职，就像你团队中的不同专家。
>
> 子代理架构的核心价值在于"分而治之"：把一个大问题分解成若干小问题，每个小问题交给专门的小组解决，最后合并结果。
> 1. 研究市场趋势
> 2. 写一份技术方案
> 3. 设计一个原型图
>
> 如果你一个人做，脑子会乱，上下文不够用。所以你把任务**委派**给三个专家：
> - 研究员（研究子代理）→ 专注搜索和分析
> - 技术写作（写作子代理）→ 专注撰写文档
> - 设计师（设计子代理）→ 专注原型创作
>
> 每个专家有自己的 workspace（隔离上下文），做完后把结果汇报给你。你只需要做决策和整合。

**子代理的三大价值：**

| 价值 | 说明 |
|------|------|
| 🧹 **上下文隔离** | 每个子代理有自己的对话上下文，不会被其他任务干扰 |
| ⚡ **并行执行** | 多个子代理可以同时工作，显著提升效率 |
| 🎯 **专业化** | 每个子代理可以有不同的系统提示、工具和模型 |

除了上述三大价值，子代理架构还带来一个重要的**附加优势：可观测性**。由于每个子代理的执行过程是独立的，你可以清晰地追踪到"哪个子代理在执行什么任务、花了多长时间、使用了哪些工具"——这对于调试和优化 Agent 行为至关重要。在复杂的多步骤任务中，子代理的执行轨迹就像是系统的"操作日志"，让你能够精确定位问题所在。

### 11.2 声明式子代理

**用一个类比来理解：**

> 想象你要购买一台新电脑。如果你很清楚自己的需求——写代码、偶尔玩游戏——你可以选择厂商提供的"设计师套餐"或"游戏套餐"。你只需要告诉销售员你的场景，就能拿到一台配置好的机器，而不需要亲自挑选每个零件。
>
> 声明式子代理就是这个"套餐"模式。你只需声明子代理的**名称**（叫什么）、**描述**（做什么）和**系统提示**（怎么做），Deep Agents 会自动处理底层的创建、通信和管理逻辑。你不需要关心子代理是如何被实例化的、LLM 调用是怎么路由的——这些都被框架封装好了。

最简单的子代理配置方式——只需声明名称和用途：

```typescript
import { createDeepAgent } from "deepagents";

const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  systemPrompt: `You are a project coordinator.

  For complex tasks, delegate to your subagents using the task() tool.
  This keeps your context clean and improves results.`,
  subagents: [
    {
      name: "researcher",
      description: "Research assistant with web search capability",
      systemPrompt: "You are a thorough researcher. Return brief findings.",
      tools: [searchWeb],
    },
    {
      name: "writer",
      description: "Content writer for drafting documents",
      systemPrompt: "You are a skilled writer. Produce well-structured drafts.",
    },
  ],
});
```

### 11.3 子代理如何工作

**用一个类比来理解：**

> 想象你是一个外卖平台的调度中心。当一笔新订单进来时，你不会自己骑车去送餐——你会分析订单需要什么：谁离餐馆最近？谁正在空闲？谁擅长送这种类型的餐品？然后你把任务派发给最适合的外卖员。外卖员骑车去取餐、送餐，整个过程独立完成。最后你只需要确认订单已完成，就可以接收下一个订单。
>
> Deep Agents 的 `task()` 工具就是这个"调度系统"。主 Agent 不再亲力亲为，而是通过 `task()` 将子任务委派给专门的子 Agent，子 Agent 独立执行完成后，结果自动返回给主 Agent。

子代理通过内置的 `task()` 工具实现委派。当主 Agent 判断当前任务太复杂或需要多方面的专业知识时，它会调用 `task()` 工具创建一个新的子 Agent 实例来执行子任务。子 Agent 拥有自己的系统提示、工具集，以及独立的 LLM 推理循环——它和主 Agent 一样"聪明"，只是专注于完成分配到的具体任务。

**子代理的完整执行流程如下：**

下图展示了主 Agent 如何将任务分解为子任务、委派给子代理、最终整合结果的完整过程：

```
用户请求："研究量子计算的进展并写一份报告"
    │
    ▼
┌──────────────────────────────┐
│  Coordinator（主 Agent）       │
│  ├── 分析任务                  │  主 Agent 先分析用户请求
│  ├── 分解为子任务               │  判断需要拆分成多个子任务
│  └── 调用 task() 工具委派       │  使用 task() 创建子代理
└──────────┬───────────────────┘
           │
      ┌────┴────┐
      ▼         ▼
┌──────────┐ ┌──────────┐
│Researcher│ │  Writer  │     两个子代理独立并行执行
│ 研究量子  │ │ 撰写报告  │     每个有自己的工具和推理循环
│ 计算进展  │ │          │
└────┬─────┘ └────┬─────┘
     │            │
     └─────┬──────┘
           ▼
┌──────────────────────────────┐
│  Coordinator（整合结果）       │
│  ├── 收集子代理输出            │  主 Agent 收集所有子任务结果
│  ├── 整合为最终报告            │  合并为完整回答
│  └── 返回给用户                │  最终输出
└──────────────────────────────┘
```

**这个流程的三个关键要点：**

1. **主 Agent 负责分解和协调** —— 主 Agent 像项目经理一样，把大任务拆分成若干子任务，然后分别委派给合适的子 Agent。它不直接执行子任务，而是管理整个流程。这种"分解-委派-整合"模式是人类组织协作中经过验证的高效工作方式，Deep Agents 将其引入到了 AI 系统中。

2. **子 Agent 独立执行** —— 子 Agent 有自己的 LLM 推理循环和工具集，不需要主 Agent 干预。它可以像独立的 Agent 一样调用工具、处理错误、迭代改进结果。这意味着子 Agent 的执行不会占用主 Agent 的上下文窗口——即使子 Agent 在内部进行了 10 轮工具调用，主 Agent 也只看到最终结果，不会被打扰。

3. **结果汇聚回主 Agent** —— 子 Agent 完成后，结果回到主 Agent 的上下文中。主 Agent 看到所有子任务的结果后，将它们整合为最终回答返回给用户。

> **💡 为什么选择子代理架构而不是让主 Agent 自己做所有事情？**
> 核心原因在于 **LLM 的上下文窗口限制和注意力稀释问题**。当主 Agent 同时处理多个子任务的细节时，它的"注意力"会被分散——就像一个人同时做三件事，每件事都做不好。子代理架构把大问题拆成小问题，每个子代理只关注自己擅长的领域，上下文更聚焦，输出质量更高。同时，并行执行的子代理还能大幅缩短整体响应时间。在实践中最常见的经验是：当系统提示超过 1000 个 token 或任务需要调用 3 个以上不同工具时，就应该考虑使用子代理架构。

### 11.4 `CompiledSubAgent`——自定义子代理

**用一个类比来理解：**

> 继续用电脑来类比。声明式子代理像是买品牌机——方便快捷，但配置是固定的。如果你想要一台完全按照自己需求定制的电脑——特定型号的主板、水冷散热系统、定制化布线——你就需要自己挑选每个零件来组装。CompiledSubAgent 就是这个"自己组装"的模式。
>
> 声明式子代理适用于大多数场景，但当你的子代理需要**自定义中间件**、**精细控制 LangGraph 图结构**、或**特殊的错误处理策略**时，CompiledSubAgent 为你提供了完全的灵活性——你可以像组装电脑一样，精确控制每个组件。

对于需要更精细控制的场景，可以使用 LangChain 的 `createAgent` 创建自定义子代理，然后包装为 `CompiledSubAgent`：

```typescript
import { createDeepAgent, CompiledSubAgent } from "deepagents";
import { createAgent } from "langchain";

// 1. 使用 LangChain 创建自定义子代理
const customGraph = createAgent({
  model: "anthropic:claude-sonnet-4-6",
  tools: [specializedTool1, specializedTool2],
  systemPrompt: "You are a specialized agent for data analysis...",
});

// 2. 包装为 CompiledSubAgent
const customSubagent: CompiledSubAgent = {
  name: "data-analyzer",
  description: "Specialized agent for complex data analysis tasks",
  runnable: customGraph,  // LangChain 的 CompiledRunnable
};

// 3. 注入到 Deep Agent
const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  subagents: [customSubagent],
  systemPrompt: "Delegate data analysis tasks to the data-analyzer subagent.",
});
```

### 11.5 任务规划（`write_todos`）

**用一个类比来理解：**

> 想象你要装修一套房子。你不会直接拿起工具就开始敲墙——你会先画一张设计图，列出需要完成的各项任务：拆旧墙（第1天）、铺水电（第2-3天）、贴瓷砖（第4-5天）、刷墙面（第6-7天）……每完成一项就划掉一项。这样你不仅清楚进度，也能在某个环节延误时及时调整计划。
>
> `write_todos` 工具就是 Agent 的"装修设计图"。当 Agent 接到复杂任务时，它不会盲目开始执行，而是先用 `write_todos` 将任务分解为结构化的待办事项列表，然后按计划逐步推进。

Deep Agents 内置了 `write_todos` 规划工具，帮助 Agent 在任务开始前制定计划：

```typescript
// write_todos 自动可用，Agent 会在系统提示的引导下使用它
const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  systemPrompt: `When given a complex task:
  1. First use write_todos to break it down into steps
  2. Each todo starts as 'pending'
  3. Mark them 'in_progress' as you work
  4. Mark them 'completed' when done

  For tasks requiring specialized knowledge, delegate to subagents.`,
});

// 跟踪 todo 进度（在前端展示）
// todos 状态：pending → in_progress → completed
```

### 11.6 Context 传播到子代理

**用一个类比来理解：**

> 想象你是一家大公司的 CEO。你委派市场部做调研、研发部做产品、销售部做推广。虽然你把任务下放给了不同部门，但他们都知道公司的核心价值观、今年的战略方向、以及预算限制——这些"上下文信息"在你委派任务时就已经传递给他们了。他们不需要在每次汇报时重新问你"我们公司是做什么的"。
>
> 在 Deep Agents 中，Runtime Context 也扮演着同样的角色。一旦你在主 Agent 上设置了 context（如 `userId`、`role`、`sessionId`），所有子代理自动继承这些上下文——既保证了信息的一致性，又避免了重复传递。

Runtime Context 会自动传播到所有子代理及其工具：

```typescript
import { createDeepAgent, tool } from "deepagents";
import type { ToolRuntime } from "@langchain/core/tools";
import { z } from "zod";

const contextSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
});

const getUserData = tool(
  async (input, runtime: ToolRuntime<unknown, typeof contextSchema>) => {
    const userId = runtime.context?.userId;
    return `Data for user ${userId}: ${input.query}`;
  },
  {
    name: "get_user_data",
    description: "Fetch data for current user",
    schema: z.object({ query: z.string() }),
  }
);

const researchSubagent = {
  name: "researcher",
  description: "Research subagent",
  tools: [getUserData],
};

const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  subagents: [researchSubagent],
  contextSchema,
});

// Context 自动传播到 researcher 子代理
const result = await agent.invoke(
  { messages: [{ role: "user", content: "Research my recent activity" }] },
  { context: { userId: "user-123", sessionId: "abc" } }
);
```

---

## 🔨 实战演练

### 练习 1：深度研究 Agent

**场景描述：**
构建一个研究团队：一个协调者 + 多个研究员子代理，并行搜索不同方面，最后综合报告。

**你的任务：**
1. 定义一个 `searchWeb` 工具，模拟网络搜索功能（接收查询字符串，返回结构化搜索结果）
2. 创建一个研究员子代理 `researcher`，赋予它 `searchWeb` 工具，并设置简洁的研究汇报提示词
3. 创建协调者主 Agent，配置子代理列表，并在系统提示中明确"分解任务→委派→整合"的工作流程
4. 运行 Agent 并测试：输入一个需要多角度研究的问题，观察主 Agent 如何分解、委派和整合

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

**参考代码：**

```typescript
import { createDeepAgent, tool } from "deepagents";
import { z } from "zod";

// 搜索工具 —— 模拟网络搜索引擎的返回结果
const searchWeb = tool(
  async ({ query }: { query: string }) => {
    // 模拟搜索结果，实际项目中应替换为真实的搜索 API 调用
    return `[Search Results for: ${query}]\n1. Result about ${query}...\n2. Another finding...\n3. Related information...`;
  },
  {
    name: "search_web",
    description: "Search the web for information",
    schema: z.object({ query: z.string() }),
  }
);

// 研究员子代理 —— 专注于单一研究主题，避免上下文污染
const researcher = {
  name: "research-agent",
  description: `Research agent specialized in finding information.
  Give ONE focused research topic at a time.`,
  systemPrompt: `You are a research assistant.
  Use search_web to find information on your assigned topic.
  Return findings in a structured format with bullet points.
  Keep your response under 300 words.`,
  tools: [searchWeb],
};

// 协调者主 Agent —— 负责任务分解和结果整合
const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  subagents: [researcher],
  systemPrompt: `You are a research coordinator.

  Process:
  1. Break the user's question into 2-3 research topics
  2. Delegate EACH topic to the research-agent using task() tool
  3. Wait for all research results
  4. Synthesize a comprehensive answer with citations

  Example:
  User: "Compare Rust and Go for web services"
  You: Break into topics → "Rust web frameworks performance" and "Go web development ecosystem"
  → Delegate both to research-agent
  → Synthesize findings`,
});

async function main() {
  const result = await agent.invoke({
    messages: [
      {
        role: "user",
        content: "What are the pros and cons of using TypeScript vs Python for data engineering?",
      },
    ],
  });

  for (const msg of result.messages ?? []) {
    if (msg.content && typeof msg.content === "string") {
      console.log(msg.content);
    }
  }
}

main().catch(console.error);
```

**预期输出：**
```
Agent 会将问题分解为 "TypeScript data engineering ecosystem" 和 "Python data engineering tools" 两个子主题，
分别委派给 research-agent 并行研究，最后整合为一份完整的对比分析报告返回给用户。
```

</details>

### 练习 2：多 Agent 专长团队

**场景描述：**
创建一个包含代码审查员、测试编写员和文档撰写员的 Agent 团队，协同完成开发任务。

**你的任务：**
1. 定义三个专业子代理：`codeReviewer`（代码审查）、`testWriter`（测试编写）、`docWriter`（文档撰写）
2. 为每个子代理设置专业化系统提示，包括审查维度、测试覆盖策略和文档输出规范
3. 创建一个开发主管主 Agent，将三个子代理注入其 subagents 列表
4. 编写委派指令，告诉主 Agent 何时和如何将任务委派给不同的子代理

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

**参考代码：**

```typescript
import { createDeepAgent } from "deepagents";

// 代码审查专家 —— 关注安全、性能、风格和潜在缺陷
const codeReviewer = {
  name: "code-reviewer",
  description: "Expert code reviewer. Analyze code for bugs, security issues, and best practices.",
  systemPrompt: `You are a senior code reviewer.
  Analyze code for:
  - Security vulnerabilities
  - Performance issues
  - Code style and best practices
  - Potential bugs
  Return a structured review with severity levels.`,
};

// 测试编写专家 —— 覆盖正常路径、边界情况和异常处理
const testWriter = {
  name: "test-writer",
  description: "Test engineer. Write comprehensive unit and integration tests.",
  systemPrompt: `You are a test engineer.
  Write tests that cover:
  - Happy path
  - Edge cases
  - Error handling
  Use TypeScript and Vitest.`,
};

// 文档撰写专家 —— 生成清晰的技术文档和 API 参考
const docWriter = {
  name: "doc-writer",
  description: "Technical writer. Create clear documentation and API references.",
  systemPrompt: `You are a technical writer.
  Write documentation that includes:
  - Overview and purpose
  - Installation/setup
  - Usage examples
  - API reference
  Use clear, concise language.`,
};

// 开发主管主 Agent —— 协调各个专家的输出
const devLead = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  subagents: [codeReviewer, testWriter, docWriter],
  systemPrompt: `You are a development team lead.
  For each development task:
  1. Review existing code (delegate to code-reviewer)
  2. Write tests (delegate to test-writer)
  3. Write documentation (delegate to doc-writer)
  4. Consolidate all outputs

  Use task() tool to delegate to the right specialist.`,
});
```

**预期输出：**
```
当用户提交代码或需求时，devLead Agent 会自动判断需要哪些专业角色参与，
依次或将并行地委派任务给 code-reviewer（审查代码）、test-writer（编写测试）和 doc-writer（撰写文档），
最后将所有输出整合为一份完整的交付报告。
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：委派指令设计

好的委派指令是指引主 Agent 正确使用子代理的关键。设计原则是：**告诉主 Agent 什么时候该委派、什么时候不该委派，以及如何格式化委派请求**。

```typescript
const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  subagents: [researcher],
  systemPrompt: `Subagent Usage Rules:
  ✅ DO delegate when:
    - Task requires specialized knowledge    // 需要专业知识时委派
    - Task produces large output (>200 words) // 输出较长时委派以隔离上下文
    - Multiple tasks can run in parallel      // 多个任务可并行时委派
    - Task requires different tools           // 需要特定工具时委派

  ❌ DON'T delegate when:
    - Simple question you can answer directly  // 简单问题直接回答
    - User is just chatting casually           // 闲聊不需要委派
    - Output is very short (<50 words)          // 短输出直接完成

  Delegation format:
  task(query="focused research question", subagent_type="research-agent")

  ⚠️ KEEP SUBAGENT RESPONSES CONCISE (<300 words)`,
});
```

### 技巧二：并行执行多个子代理

当任务可以拆分为多个独立子任务时，主 Agent 可以同时调用多个子代理并行执行，大幅缩短响应时间。这在需要多角度分析同一问题时特别有效：

```typescript
// 主 Agent 可以同时调用多个子代理
// 在系统提示中引导并行委派

const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  subagents: [researcherA, researcherB],
  systemPrompt: `For complex topics, delegate MULTIPLE research tasks in PARALLEL:
  
  Example:
  1. task(query="Topic A research", subagent_type="research-agent")
  2. task(query="Topic B research", subagent_type="research-agent")
  
  Then synthesize all results together.`,
});
```

### 技巧三：子代理超时与错误处理

生产环境中，子代理可能会因为 LLM 调用超时、工具执行出错或上下文溢出而失败。合理配置超时和错误处理策略可以增强系统的鲁棒性：

```typescript
import { createDeepAgent, CompiledSubAgent } from "deepagents";
import { createAgent } from "langchain";

// 配置带超时和错误处理的子代理
const resilientSubagent: CompiledSubAgent = {
  name: "data-analyzer",
  description: "Data analysis with error handling",
  runnable: createAgent({
    model: "anthropic:claude-sonnet-4-6",
    tools: [dataAnalysisTool],
    systemPrompt: "You are a data analyst. If you encounter errors, return a structured error report.",
  }),
  // 子代理级别的配置
  maxRetries: 2,          // 失败时最多重试 2 次
  timeout: 60_000,        // 60 秒超时
};

const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  subagents: [resilientSubagent],
  systemPrompt: `If a subagent fails, check the error and decide whether to retry, 
  delegate to a different subagent, or inform the user.`,
});
```

> **💡 最佳实践：** 建议始终为子代理设置超时时间（默认可能较长）。对于用户交互场景，单个子代理的响应时间应控制在 30 秒以内，否则会影响用户体验。同时，建议在主 Agent 的系统提示中明确说明"当子代理失败时应该怎么做"，避免出现子代理出错后主 Agent 陷入无限重试的死循环。

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：子代理解决的三个核心问题是什么？**
> A：上下文隔离（每个子代理拥有独立的对话上下文，不会混淆信息）、并行执行（多个子任务可以同时进行，提高效率）、专业化（不同子代理可以配置不同的系统提示、工具集甚至不同的模型）。

**Q2：`CompiledSubAgent` 和声明式子代理有什么区别？**
> A：声明式子代理更简单——只需指定 name、description、systemPrompt 和 tools 即可快速搭建。CompiledSubAgent 基于 LangChain 的 createAgent，支持更精细的自定义（如添加中间件、配置 LangGraph 运行时）。

**Q3：Runtime Context 会在子代理中传递吗？**
> A：会！父 Agent 的 Runtime Context（如 userId、role）会自动传播到所有子代理及其工具调用中。这让子代理也能访问调用者的身份信息，实现权限控制。

**Q4：`write_todos` 工具的作用是什么？**
> A：它是 Deep Agents 内置的规划工具，帮助 Agent 将复杂任务分解为一个待办事项列表。每个事项有 pending → in_progress → completed 三种状态，Agent 可以标记进度，用户可以实时看到任务的执行状态。这比 Agent 在对话中"口头"规划要清晰得多，因为 todo 列表是结构化的、可追踪的。

**Q5：子代理执行完毕后，结果如何交回给主 Agent？**
> A：子代理的结果通过 `task()` 工具的返回值交回给主 Agent，成为主 Agent 对话上下文中的一部分。主 Agent 看到结果后继续推理。这个过程类似于函数调用的返回值——调用方传入参数，被调用方处理完成后返回结果。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 主 Agent 不委派任务 | 系统提示中未明确引导委派 | 添加委派指令和示例，明确什么时候该用子代理 |
| 子代理输出过长 | 未限制子代理的输出长度 | 在子代理的 systemPrompt 中加"保持简洁"指令 |
| 子代理上下文污染 | 子代理之间共享了不必要的信息 | 确保子代理只接收委派时传入的 query，不要跨越隔离边界 |
| `task is not a function` | 缺少对应的子代理声明 | 确保在 subagents 数组中正确声明子代理 |
| 子代理超时 | 子代理执行时长超过默认超时 | 在 subAgentConfig 中设置 timeout 参数，或优化子代理任务复杂度 |

---

## 📝 本章小结

- ✅ 子代理提供上下文隔离、并行执行和专业化三大核心价值
- ✅ 声明式配置：`subagents: [{name, description, systemPrompt, tools}]` 快速搭建子代理
- ✅ CompiledSubAgent：基于 LangChain createAgent 的完整自定义，支持中间件和精细控制
- ✅ 委派指令设计：清晰的目标 + 输入 + 输出格式 + 完成标准
- ✅ Context 传播：父 Agent 的 Runtime Context 自动传递给子代理
- ✅ `write_todos` 工具为任务分解和进度追踪提供了标准化方案
- ✅ 子代理架构让复杂任务可以拆解为多个独立子任务并行执行，显著提升效率

## ➡️ 下一章预告

> 在下一章中，我们将学习 Deep Agents 的流式传输（Streaming）机制——了解如何利用 stream() 和 streamEvents() 实现 Token 级的实时输出，掌握子代理状态追踪的实用技巧，以及在 React 前端中通过 useStream Hook 集成流式响应的完整方案。
>
> [第12章 流式传输与实时进度](./12-streaming.md)
