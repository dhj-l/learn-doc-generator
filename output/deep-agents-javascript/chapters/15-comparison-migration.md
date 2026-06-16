# 第15章 生态对比与 LangChain v1 迁移

> 预计学习时间：45 分钟

## 🎯 本章目标

学习完本章，你将能够：
- 对比 Deep Agents 与 Claude Agent SDK 的核心差异
- 理解 LangChain v1 的主要变化
- 将现有代码从 v0（createReactAgent）迁移到 v1（createAgent）
- 使用 `@langchain/classic` 处理遗留代码

## 📋 前置知识

> 如果你还没有学习以下内容，建议先完成：
> - [第2章 核心概念与架构](./02-core-concepts.md) —— 了解 Agent 的核心参数和创建方式
> - [第5章 记忆与系统提示](./05-memory-context.md) —— 了解跨平台迁移时需要注意的记忆配置

## 💡 核心概念

### 15.1 Deep Agents vs Claude Agent SDK 对比

**用一个类比来理解：**

> Deep Agents 就像一个**通用接口的智能手机**——你可以用任何运营商的 SIM 卡（任何模型），可以连任何 Wi-Fi（任何部署方式），可以在任何国家使用。Claude Agent SDK 则像**苹果生态专用机**——只用自己的 SIM 卡（仅 Claude 模型），与自家生态深度集成，开箱体验非常流畅，但被绑定了生态。

**为什么需要了解这些对比？**

在选择 Agent 框架时，没有绝对的"最好"，只有"最适合"。如果你已经在使用 LangSmith 生态、需要在不同模型之间切换、或者有多租户需求，Deep Agents 是更好的选择。如果你只需要 Claude 模型、对部署简单性要求高、不需要多租户，Claude Agent SDK 可能更适合你。理解这些差异，能帮助你在项目早期做出正确的技术选型，避免后期迁移的麻烦。

**何时选择 Deep Agents？**
- 你需要在多个模型提供商之间切换以优化成本或性能
- 你的应用需要为不同用户提供隔离的数据访问（多租户）
- 你已经在使用 LangSmith 生态，希望深度集成可观测性和部署能力
- 你需要灵活的部署选项（托管、自部署、本地开发）

**何时选择 Claude Agent SDK？**
- 你已经确定只使用 Claude 模型，不需要切换其他模型
- 你希望开箱即用的简单体验，不需要复杂的配置
- 你的应用没有多租户需求，或者你可以自建租户隔离

```typescript
// Deep Agents —— 模型和部署灵活
const agent = createDeepAgent({
  model: "openai:gpt-5.5",  // 想换哪个换哪个
  // 部署：LangSmith / 自托管 / 本地
});

// Claude Agent SDK —— Claude 专属
// 只支持 Claude 模型
// 部署需要自建 API 和认证层
```

#### 详细对比

以下是从多个关键维度对两个框架的详细对比。理解这些差异有助于你在项目选型时做出更明智的决策：

| 维度 | Deep Agents | Claude Agent SDK |
|------|------------|-----------------|
| **模型选择** | 任意（Anthropic/OpenAI/Gemini 等） | 仅 Claude |
| **部署方式** | Managed / LangSmith / 自托管 | 需自建 HTTP/WS 服务 |
| **多租户** | ✅ 内置（StoreBackend + 命名空间） | ❌ 需自建 |
| **文件系统** | ✅ CompositeBackend（4 种 Backend） | ✅ 内置 |
| **子代理** | ✅ 声明式 + CompiledSubAgent | ✅ |
| **中间件** | ✅ 6 个生命周期钩子 | ❌ 无中间件系统 |
| **流式传输** | ✅ 支持 | ✅ 支持 |
| **认证** | ✅ LangSmith 内置 | ❌ 需自建 |
| **生态集成** | ✅ LangSmith 全栈 | ❌ Anthropic 生态 |

> **💡 为什么这样做？**
> Deep Agents 选择支持多模型、多部署选项的策略，并不是为了"大而全"，而是为了解决一个实际的工程问题：AI 技术迭代速度极快，今天的最优模型可能三个月后就被超越。如果你的 Agent 框架绑定了某个特定模型，更换模型就意味着重写整个应用。Deep Agents 的模型无关架构让你可以像更换数据库一样更换 AI 模型——应用逻辑完全不需要修改。同样，多部署选项保证了你的 Agent 可以从本地开发原型平滑过渡到生产环境，而不需要重新实现通信层。

#### 选择指南

```typescript
// 选择 Deep Agents 当：
const useDeepAgents = {
  "需要多模型灵活性": true,
  "需要多租户支持": true,
  "需要 LangSmith 生态": true,
  "需要自定义部署": true,
};

// 选择 Claude Agent SDK 当：
const useClaudeSDK = {
  "已深度使用 Anthropic 生态": true,
  "愿意自建 API 和认证层": true,
  "不需要多租户": true,
  "只需要 Claude": true,
};
```

### 15.2 LangChain v1 迁移

LangChain v1 引入了许多重要变化。如果你之前用的是 LangChain v0（或 `createReactAgent`），以下是关键迁移点。总体来说，v1 的 API 更加统一和简洁，大部分变化是命名和导入路径的调整，逻辑层面的改动不大。

> **💡 迁移建议：**
> 不要试图一次性迁移所有代码。推荐使用增量迁移策略——先将新 Agent 用 v1 的 API 编写，保持旧 Agent 不变，等所有新功能开发完成后再逐步重构旧代码。这样既不会影响现有业务，又能平滑过渡到新版本。

#### 核心变化一览

| v0（旧） | v1（新） |
|---------|---------|
| `createReactAgent` from `@langchain/langgraph/prebuilts` | `createAgent` from `langchain` |
| `prompt` 参数 | `systemPrompt` 参数 |
| 旧中间件模式 | `createMiddleware` 六大钩子 |
| 绑定模型（pre-bound） | 字符串 `provider:model_id` |
| `config.configurable` 传上下文 | `context` 属性传上下文 |
| 流式节点名 `agent` | 流式节点名 `model` |
| 旧代码在 `langchain` | 旧代码移至 `@langchain/classic` |

#### 15.2.1 `createReactAgent` → `createAgent`

这是最常用也最简单的迁移项。变化包括：函数名从 `createReactAgent` 改为 `createAgent`，导入路径从 `@langchain/langgraph/prebuilts` 改为 `langchain`，参数名 `prompt` 改为 `systemPrompt`，模型参数从 ChatModel 实例改为字符串标识：

```typescript
// ❌ 旧写法（v0）
import { createReactAgent } from "@langchain/langgraph/prebuilts";

const agent = createReactAgent({
  model: chatModel,
  tools,
  prompt: "You are a helpful assistant.",  // 参数名：prompt
});

// ✅ 新写法（v1）
import { createAgent } from "langchain";

const agent = createAgent({
  model: "anthropic:claude-sonnet-4-6",  // 字符串标识
  tools,
  systemPrompt: "You are a helpful assistant.",  // 参数名：systemPrompt
});
```

#### 15.2.2 动态系统提示迁移

在 v0 中，你可以通过将一个函数传递给 `prompt` 参数来根据对话状态动态生成系统提示。这个功能在 v1 中通过中间件实现，虽然代码稍长了一些，但提供了更大的灵活性和可组合性：

```typescript
// ❌ 旧写法（v0）
const agent = createReactAgent({
  model: chatModel,
  prompt: (state) => {
    const role = state.role;
    return role === "expert"
      ? "You are an expert..."
      : "You are a beginner's guide...";
  },
});

// ✅ 新写法（v1）—— 使用中间件
import { createAgent, createMiddleware } from "langchain";

const dynamicPrompt = createMiddleware({
  name: "DynamicPrompt",
  wrapModelCall: (request, handler) => {
    const role = request.runtime.context?.userRole;
    const systemPrompt = role === "expert"
      ? "You are an expert..."
      : "You are a beginner's guide...";
    return handler({ ...request, systemPrompt });
  },
});

const agent = createAgent({
  model: "anthropic:claude-sonnet-4-6",
  middleware: [dynamicPrompt],
});
```

#### 15.2.3 上下文传递迁移

```typescript
// ❌ 旧写法（v0）
await agent.invoke(
  { messages: [...] },
  { configurable: { userId: "123" } }  // 塞在 configurable 里
);

// ✅ 新写法（v1）
await agent.invoke(
  { messages: [...] },
  { context: { userId: "123" } }  // 独立的 context 属性
);
```

#### 15.2.4 动态模型迁移

```typescript
// ❌ 旧写法（v0）
const agent = createReactAgent({
  model: (state) => {
    return state.messages.length > 10 ? bigModel : smallModel;
  },
  tools,
});

// ✅ 新写法（v1）
const dynamicModel = createMiddleware({
  name: "DynamicModel",
  wrapModelCall: (request, handler) => {
    const msgCount = request.state.messages.length;
    const model = msgCount > 10 ? "anthropic:claude-sonnet-4-6" : "openai:gpt-5-nano";
    return handler({ ...request, model });
  },
});

const agent = createAgent({
  model: "openai:gpt-5-nano",
  tools,
  middleware: [dynamicModel],
});
```

#### 15.2.5 遗留代码处理

```typescript
// v1 中将不再维护的旧代码移到了 @langchain/classic
// 如果使用了 chains 等遗留 API：

// ❌ v0
import { LLMChain } from "langchain/chains";

// ✅ v1
import { LLMChain } from "@langchain/classic/chains";
```

---

## 🔨 实战演练

### 练习 1：将 v0 Agent 迁移到 v1

**场景描述：**
将使用 `createReactAgent` 的旧代码迁移到 v1 的 `createAgent`。

**你的任务：**
1. 找到项目中所有使用 `createReactAgent` 的地方并标记
2. 将 `createReactAgent` 替换为 `createAgent`，更新导入路径
3. 将 `prompt` 参数改为 `systemPrompt`
4. 将 ChatModel 实例改为字符串标识（如 `"anthropic:claude-sonnet-4-6"`）
5. 运行测试验证迁移结果

<details>
<summary>🧑‍💻 先自己尝试，写完再展开看参考答案</summary>

**参考代码：**

```typescript
// === 迁移前（v0）===
import { createReactAgent } from "@langchain/langgraph/prebuilts";
import { ChatAnthropic } from "@langchain/anthropic";
import { MemorySaver } from "@langchain/langgraph";

const model = new ChatAnthropic({ model: "claude-sonnet-4-6" });

const agent = createReactAgent({
  model,
  tools: [searchTool],
  prompt: "You are a helpful assistant.",
  checkpointer: new MemorySaver(),
});

await agent.invoke(
  { messages: [{ role: "user", content: "Hello" }] },
  { configurable: { thread_id: "123" } }
);

// === 迁移后（v1）===
import { createAgent } from "langchain";

const agent = createAgent({
  model: "anthropic:claude-sonnet-4-6",  // 字符串，而非 ChatModel 实例
  tools: [searchTool],
  systemPrompt: "You are a helpful assistant.",  // 改名
  // 注意：v1 的 createAgent 不一定需要 checkpointer
  // 如需持久化，通过 Deep Agents 的 createDeepAgent 的 checkpointer 参数
});

await agent.invoke(
  { messages: [{ role: "user", content: "Hello" }] },
  // 不再使用 configurable.thread_id，改用 createDeepAgent
);
```
</details>

**预期输出：**

```
迁移前（v0）：
- 导入：@langchain/langgraph/prebuilts → createReactAgent
- 模型：ChatAnthropic 实例
- 参数名：prompt

迁移后（v1）：
- 导入：langchain → createAgent
- 模型：字符串 "anthropic:claude-sonnet-4-6"
- 参数名：systemPrompt

✅ 迁移完成，测试通过！
```

---

## ⚡ 进阶技巧

### 技巧一：增量迁移策略

```typescript
// 可以在同一项目中同时使用 v0 和 v1
// 逐步迁移各个 Agent

// 新 Agent 直接用 v1
const newAgent = createAgent({ model: "anthropic:claude-sonnet-4-6", ... });

// 旧 Agent 保持 v0 直到完全测试
const oldAgent = createReactAgent({ model: chatModel, ... });

// 逐个替换，确保每个替换都有测试覆盖
```

### 技巧二：版本检测

在开始迁移之前，建议先确认你当前使用的版本。有时候项目依赖的更新可能不兼容，通过版本检测可以提前发现问题。使用 npm list 命令可以查看当前安装的版本号，确保迁移到正确的目标版本。建议在开始迁移前记录所有相关包的版本号，以便在出现问题时可以回退：

> **💡 迁移前的准备工作：**
> 1. 先运行测试套件，确保当前所有测试通过——这样迁移后你才能知道是否引入了问题
> 2. 从不太重要的模块开始迁移，积累经验后再迁移核心业务模块
> 3. 每次迁移后立即运行相关测试，不要等到全部迁移完再测试——那样问题定位会变得非常困难
> 4. 记录所有依赖包的版本号，以便在迁移出现问题时可以快速回退到稳定版本

```bash
# 检查当前版本
npm list langchain @langchain/core

# 更新到最新版本
npm update langchain @langchain/core

# 安装特定版本
npm install langchain@1.0.0 @langchain/core@1.0.0
```

### 技巧三：测试迁移结果

迁移完成后，建议运行完整的测试套件来验证所有功能是否正常。特别需要关注以下几个方面，这些是迁移过程中最容易出问题的地方，务必逐一确认：
- **工具调用是否正确**：检查所有工具是否按预期触发和返回正确的结果
- **中间件是否正常工作**：检查自定义中间件是否在新的 API 下正确执行，不遗漏也不重复
- **流式输出是否正常**：如果使用了 stream()，确认输出格式没有变化，用户端体验一致
- **子代理调用是否正常**：检查子代理的委派和结果返回是否正确，多级调用是否正常

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Deep Agents 和 Claude Agent SDK 最大的区别是什么？**
> A：Deep Agents 支持任意模型提供商（Anthropic、OpenAI、Google 等）、内置多租户支持、与 LangSmith 生态深度集成；Claude Agent SDK 仅支持 Claude 模型、需要自建基础设施、不提供多租户能力。

**Q2：LangChain v1 中 `createReactAgent` 被什么替代了？**
> A：被 `createAgent` 替代（从 `langchain` 包导入），新的 API 更简洁统一。

**Q3：`prompt` 参数在 v1 中改成了什么？**
> A：改成了 `systemPrompt`，名称更直观，避免了 `prompt` 一词在 LangChain 中有多种含义的混淆。

**Q4：v0 中的动态模型选择通过函数实现，v1 中如何实现？**
> A：通过 `createMiddleware` 中的 `wrapModelCall` 钩子实现。在钩子函数中，你可以根据当前的对话状态（如消息长度、用户角色等）动态设置使用的 model 参数。

**Q5：从 v0 迁移到 v1 时，最需要注意的变化是什么？**
> A：最核心的变化包括：`createReactAgent` → `createAgent` 的名称变更、`chain.invoke` → `agent.invoke` 的调用方式变化、中间件 API 的升级、以及配置文件格式的更新。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `createReactAgent is not found` | 从 v1 包中导入旧函数 | 改用 `createAgent` from `langchain` |
| `prompt is not a valid parameter` | 使用了旧参数名 | 改用 `systemPrompt` |
| `configurable is not used` | 尝试用 configurable 传上下文 | 改用 `context` 属性 |
| `Cannot find module @langchain/chains` | 未安装 @langchain/classic | `npm install @langchain/classic` |
| 迁移后工具调用行为不同 | v1 中工具调用的参数格式发生了变化 | 检查 Zod Schema 定义，确保参数名和类型与 v0 一致 |

---

## 📝 本章小结

- ✅ Deep Agents vs Claude Agent SDK：灵活性（多模型多部署） vs 专一性（仅 Claude，开箱即用）
- ✅ `createReactAgent` → 改用 `createAgent`（从 `langchain` 包导入）
- ✅ `prompt` 参数重命名为 `systemPrompt`，语义更清晰
- ✅ 旧的中间件系统升级为 `createMiddleware` 的六大钩子系统
- ✅ `config.configurable` 传递上下文的方式改为 `context` 属性
- ✅ 动态模型选择通过中间件的 `wrapModelCall` 钩子实现
- ✅ 旧版 v0 代码可以迁移到 `@langchain/classic` 包，保持兼容性
- ✅ 增量迁移策略：新旧版本可以共存，逐步升级避免一次性大规模改动
- ✅ 迁移后测试重点：工具调用、中间件、流式输出和子代理调用

## ➡️ 下一章预告

> 在下一章中，我们将学习 LangChain 的组件架构与多 Agent 模式——通过 LangGraph 构建 Router 模式、Handoffs 模式和完整的 SQL Agent。
>
> [第16章 LangChain 组件架构与多 Agent 模式](./16-component-architecture.md)
