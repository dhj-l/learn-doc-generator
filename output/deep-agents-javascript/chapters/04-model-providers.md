# 第4章 多模型提供商集成

> 预计学习时间：50 分钟

## 🎯 本章目标

学习完本章，你将能够：
- 掌握 Deep Agents 支持的 7 种模型提供商的配置方法
- 理解 `provider:model_id` 统一命名规范及其设计思路
- 根据不同任务需求选择合适的模型（成本/性能/能力平衡）
- 通过 OpenRouter 统一网关访问 200+ 模型
- 使用 Ollama 运行本地模型进行离线开发和测试
- 实现基于任务复杂度的模型选择和故障转移

## 📋 前置知识

> 如果你还没有学习以下内容，建议先完成：
> - [第2章 核心概念与架构](./02-core-concepts.md) —— 了解 `provider:model_id` 命名规范和模型参数
> - [第3章 工具系统详解](./03-tool-system.md) —— 了解工具调用循环的基本概念

---

## 💡 核心概念

### 4.1 为什么需要多模型支持？

**用一个类比来理解：**

> 想象你经营一家物流公司。不同的运输任务需要不同的车辆——送同城小件用电动车（快速便宜），送跨省大货用卡车（载重大），送紧急文件用飞机（速度优先但成本高）。如果你只有一种车，要么亏本（大材小用），要么完不成任务（能力不足）。
>
> Deep Agents 的多模型支持就像你拥有了一个**智能车队调度系统**——根据任务的特点（简单/复杂、代码/创意、实时/批量）自动选择最合适的"车辆"（模型），在成本、速度和能力之间找到最佳平衡。

**多模型策略的核心价值：**

1. **成本优化** —— 简单任务用便宜模型（如 GPT-nano），复杂任务用强大模型（如 Claude Opus），整体成本可降低 60-80%
2. **避免厂商锁定** —— 不依赖单一模型提供商，可以在不同厂商之间切换，选择最优方案
3. **能力互补** —— 不同模型在不同任务上各有优势：Claude 擅长长文本和推理，GPT 擅长代码生成，Gemini 擅长多模态
4. **高可用** —— 当某个模型不可用时，自动切换到备选模型，保证服务不中断

### 4.2 模型命名规范

**用一个类比来理解：**

> 想象你在管理一个大型跨国公司的电话簿。不同国家的员工有不同的内部分机格式——美国用`+1-xxx-xxxx`，日本用`+81-xx-xxxx`，中国用`+86-xxx-xxxx`。如果没有统一格式，你要记住每个国家的编码规则，打个国际电话简直是噩梦。
>
> 但如果公司统一规定"国家代码-城市代码-本地号码"的格式，不管打到哪里，你只需要知道这一个规则就够了。Deep Agents 的 `provider:model_id` 就是这样的"统一拨号规则"——不管底层是哪个模型提供商的 API，你只需记住一种格式就能调用所有模型。

Deep Agents 使用统一的 `provider:model_id` 格式来标识模型。这个看似简单的设计有两个核心优势：

**第一，统一接口** —— 无论底层是哪个厂商的模型，在 Deep Agents 中配置方式完全一致，只有一个字符串的区别：

```typescript
// 所有模型使用同一接口，切换只需改一个字符串
const agent = createDeepAgent({
  // 只需修改这一行，其他代码完全不用动
  model: "anthropic:claude-sonnet-4-6",
  // model: "openai:gpt-5.5",              ← 切换到这里
  // model: "google_genai:gemini-3.5-flash", ← 或切换到这里
  // model: "ollama:devstral-2",            ← 或使用本地模型
});
```

**第二，运行时切换** —— 通过中间件可以在不重启进程的情况下动态切换模型：

```typescript
// 中间件实现动态模型切换
const dynamicModel = createMiddleware({
  name: "DynamicModel",
  wrapModelCall: (request, handler) => {
    // 根据当前对话的复杂程度选择模型
    const complexity = calculateComplexity(request.state.messages);
    const model = complexity === "high"
      ? "anthropic:claude-opus-4-8"
      : "openai:gpt-5-nano";
    return handler({ ...request, model });
  },
});
```

### 4.3 各提供商配置详解

Deep Agents 支持 7 种模型提供商，每种提供商需要配置对应的 API Key 环境变量：

```typescript
// 统一配置模式 —— 只需设置环境变量，不需要修改代码
// .env 文件示例：
// ANTHROPIC_API_KEY=sk-ant-...
// OPENAI_API_KEY=sk-...
// GOOGLE_API_KEY=...
// OPENROUTER_API_KEY=sk-...
```

> **用选车来理解各提供商的区别：** 不同的模型提供商就像是不同品牌的汽车制造商。Anthropic 像 Mercedes——稳重、安全、适合长途（长上下文）；OpenAI 像 Tesla——技术先进、适合高速行驶（代码生成）；Gemini 像 Toyota——全能型、性价比高（多模态）。你根据路况（任务类型）选择最合适的车（模型）。

#### 4.3.1 Anthropic（Claude）

Anthropic 的 Claude 系列模型以**长上下文处理**和**安全性**著称，特别适合需要深入推理和长文档分析的场景：

```typescript
// 方式 1：使用字符串标识（推荐）
const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",  // 最新旗舰版
});

// 可选模型：
// anthropic:claude-sonnet-4-6    → 旗舰版，性能与速度的平衡
// anthropic:claude-opus-4-8      → 最强推理能力，适合复杂分析
// anthropic:claude-haiku-4-5     → 最快响应速度，适合简单任务
```

> **💡 适用场景：** Claude 在长文档分析、代码审查、复杂推理任务上表现优异。如果你需要 Agent 处理 100K+ token 的长对话，Claude 是首选。

#### 4.3.2 OpenAI（GPT）

OpenAI 的 GPT 系列在**代码生成**和**结构化输出**方面表现出色：

```typescript
const agent = createDeepAgent({
  model: "openai:gpt-5.5",
  // 可选：openai:gpt-5-nano（最快最便宜）
  //       openai:gpt-5.5（平衡）
  //       openai:gpt-5.4-mini（经济型）
});
```

> **💡 适用场景：** GPT 在代码生成、JSON 结构化输出、工具调用准确率方面有优势。如果你需要 Agent 频繁调用工具，GPT 是不错的选择。

#### 4.3.3 Google Gemini

Gemini 系列在**多模态理解**和**长上下文**方面有独特优势：

```typescript
const agent = createDeepAgent({
  model: "google_genai:gemini-3.5-flash",
  // 可选：google_genai:gemini-3.5-pro（更强推理）
});
```

> **💡 适用场景：** 如果 Agent 需要处理图片、音频等多模态输入，或需要超长上下文窗口，Gemini 是最佳选择。

#### 4.3.4 OpenRouter（统一网关）

OpenRouter 是一个**模型网关服务**——通过一个 API 接口访问 200+ 模型。这是实现多模型策略最便捷的方式：

```typescript
// 通过 OpenRouter 使用任何主流模型
const agent = createDeepAgent({
  model: "openrouter:anthropic/claude-sonnet-4-6",
});

// 也可以使用同一网关访问其他模型
// model: "openrouter:openai/gpt-5.5"
// model: "openrouter:google/gemini-3.5-flash"
// model: "openrouter:meta-llama/llama-4"
// model: "openrouter:deepseek/deepseek-v4"
```

**OpenRouter 的四大优势：**

| 优势 | 说明 |
|------|------|
| **统一计费** | 一个 API Key、一张账单管理所有模型 |
| **自动 Fallback** | 模型不可用时自动切换到备选 |
| **负载均衡** | 在多个模型供应商之间分发请求 |
| **模型对比** | 方便在同一接口下对比不同模型效果 |

#### 4.3.5 Baseten 与 Fireworks

这两个平台提供**云端 GPU 推理服务**，适合部署自定义模型或使用开源模型的高性能版本：

```typescript
// Baseten —— 适合部署私有模型
const agent = createDeepAgent({
  model: "baseten:zai-org/GLM-5",
});

// Fireworks —— 提供优化的开源模型
const agent = createDeepAgent({
  model: "fireworks:accounts/fireworks/models/qwen3p5-397b-a17b",
});
```

#### 4.3.6 Ollama（本地模型）

Ollama 让你在**本地运行开源模型**，无需任何 API Key，零成本开发和测试：

```bash
# 第一步：安装 Ollama
# 访问 https://ollama.com 下载安装包

# 第二步：拉取模型
ollama pull devstral-2    # 轻量模型，适合开发测试
ollama pull llama-4       # 更强的本地模型

# 第三步：启动服务
ollama serve
```

```typescript
// 连接本地 Ollama 模型
const agent = createDeepAgent({
  model: "ollama:devstral-2",  // 无需 API Key！
});
```

> **💡 Ollama 的典型场景：**
> - **开发测试**：在本地快速迭代，不消耗 API 费用
> - **离线环境**：内网部署，数据不出境
> - **隐私保护**：敏感数据处理在本地完成
> - **成本控制**：大量测试时使用本地模型降低成本

### 4.4 模型调参

**用一个类比来理解：**

> 想象你是一个咖啡师。选好了咖啡豆（模型）之后，你还需要调整研磨度（temperature）、萃取时间（maxTokens）、水流速度（topP）来得到一杯完美的咖啡。
> - **研磨度（temperature）**：研磨越细（值越低），咖啡越稳定可预测；研磨越粗（值越高），风味越丰富多变
> - **萃取量（maxTokens）**：你想要一杯浓缩（短输出）还是大杯美式（长输出）
> - **水流速度（topP）**：控制萃取的均匀度，配合研磨度一起调整效果更好
>
> 没有这些调节，就像咖啡机只有"开"和"关"——能出咖啡，但永远调不出你最喜欢的风味。

除了选择模型，你还可以通过 `ChatModel` 实例对模型进行精细化调参，让模型的表现更贴合你的具体需求：

```typescript
import { ChatAnthropic } from "@langchain/anthropic";

// 使用 ChatModel 实例进行精细控制
const model = new ChatAnthropic({
  model: "claude-sonnet-4-6",
  temperature: 0.2,       // 控制输出的随机性（0=确定，1=创造性）
  maxTokens: 4096,         // 最大输出长度
  topP: 0.9,              // 核采样参数
  streaming: true,         // 启用流式输出
});

const agent = createDeepAgent({
  model,  // 传入 ChatModel 实例
  systemPrompt: "You are a precise assistant. Be concise and accurate.",
});
```

**各参数的作用：**

| 参数 | 范围 | 作用 | 推荐值 |
|------|------|------|--------|
| `temperature` | 0-1 | 控制输出的随机性。越低越确定，越高越有创意 | 代码任务 0.2，创意写作 0.7 |
| `maxTokens` | 1-N | 单次响应的最大 Token 数 | 根据任务复杂度设定 |
| `topP` | 0-1 | 核采样，控制候选词的多样性 | 通常与 temperature 配合 |
| `streaming` | true/false | 是否启用流式输出 | 需要实时显示时设为 true |

**调试参数的最佳实践：**

调参不是一蹴而就的，建议采用以下步骤：
1. **从高 temperature 开始**（0.7~0.8）测试模型的创造性上限，看它能否给出多样化的回答
2. **逐步降低**到目标值，观察输出质量的变化曲线
3. **固定 temperature 后**再微调 topP——先粗调再精调，避免两个参数同时变动导致无法判断效果
4. 对于**生产环境**的 API 调用，建议 temperature 设置在 0.1~0.3 之间，保证输出的一致性和可靠性
5. 对于**创意写作或头脑风暴**场景，可以大胆使用 0.7~0.9，让模型发挥想象力

> **💡 为什么需要调试参数？**
> 因为同一个模型在不同参数配置下表现完全不同。一个写代码的 Agent 和写文案的 Agent，即使使用同一个模型，参数设置也应该不同。盲目使用默认参数，就像穿均码衣服——能穿，但绝不合身。

---

## 🔨 实战演练

### 练习 1：多模型问答对比工具

**场景描述：**
创建一个工具函数，用三个不同模型回答同一个问题，对比它们的答案风格和质量。这是多模型策略中最基础的调试手段——了解每个模型的"性格"差异。

**你的任务：**
1. 创建一个模型列表（Claude、GPT、Gemini）
2. 对每个模型创建临时 Agent
3. 用同一个问题分别调用并对比输出

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { createDeepAgent } from "deepagents";

// 定义要对比的模型列表
// 每个模型有不同的"性格"和擅长领域
const models = [
  { name: "Claude Sonnet", id: "anthropic:claude-sonnet-4-6" },
  { name: "GPT-5", id: "openai:gpt-5.5" },
  { name: "Gemini Flash", id: "google_genai:gemini-3.5-flash" },
];

async function compareModels(question: string) {
  console.log(`📝 问题: ${question}\n`);
  console.log("=".repeat(60));

  for (const { name, id } of models) {
    console.log(`\n🤖 ${name} (${id})`);
    console.log("-".repeat(40));

    // 为每个模型创建独立的 Agent 实例
    const agent = createDeepAgent({
      model: id,
      systemPrompt: "请用 2-3 句话简洁回答。",
    });

    try {
      const startTime = Date.now();
      const result = await agent.invoke({
        messages: [{ role: "user", content: question }],
      });
      const elapsed = Date.now() - startTime;

      // 输出模型回答和响应时间
      console.log(result.messages.at(-1)?.content);
      console.log(`\n⏱️  响应时间: ${elapsed}ms`);
    } catch (err) {
      // 如果某个模型不可用（如未配置 API Key），优雅跳过
      console.log(`❌ 模型不可用: ${err}`);
    }
  }
}

// 运行对比
compareModels("解释量子计算的基本原理，让初中生也能听懂。").catch(console.error);
```

**预期输出：**
```
📝 问题: 解释量子计算的基本原理，让初中生也能听懂。

🤖 Claude Sonnet (anthropic:claude-sonnet-4-6)
----------------------------------------
量子计算就像是同时尝试所有可能的密码...
⏱️  响应时间: 2340ms

🤖 GPT-5 (openai:gpt-5.5)
----------------------------------------
想象你在一个迷宫里，普通计算机一次只能试一条路...
⏱️  响应时间: 1890ms

🤖 Gemini Flash (google_genai:gemini-3.5-flash)
----------------------------------------
量子计算机使用"量子比特"而不是普通比特...
⏱️  响应时间: 1520ms
```

</details>

### 练习 2：基于任务复杂度的智能模型路由

**场景描述：**
构建一个智能路由系统，根据用户问题的复杂程度自动选择模型——简单问题用快速便宜的模型，复杂问题用强大的模型，代码问题用代码专用模型。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { createDeepAgent } from "deepagents";

// 定义不同层级的模型
// 简单问题用 nano（快速便宜），复杂问题用最强模型
const modelTiers = {
  fast: "openai:gpt-5-nano",                // 快速便宜，适合简单问答
  balanced: "anthropic:claude-sonnet-4-6",   // 性能与成本平衡
  powerful: "anthropic:claude-opus-4-8",     // 最强推理，适合复杂任务
};

async function smartAgent(question: string) {
  // 根据问题特征选择模型层级
  let selectedModel: string;

  if (question.length > 200) {
    // 长问题通常更复杂
    selectedModel = modelTiers.powerful;
    console.log("📊 检测到长问题 → 使用最强模型");
  } else if (question.includes("代码") || question.includes("code") ||
             question.includes("实现") || question.includes("implement")) {
    // 代码相关问题
    selectedModel = modelTiers.balanced;
    console.log("📊 检测到代码问题 → 使用平衡模型");
  } else if (question.length < 30) {
    // 非常短的问题，通常很简单
    selectedModel = modelTiers.fast;
    console.log("📊 检测到简单问题 → 使用快速模型");
  } else {
    selectedModel = modelTiers.balanced;
    console.log("📊 一般问题 → 使用平衡模型");
  }

  console.log(`  选用模型: ${selectedModel}`);

  const agent = createDeepAgent({
    model: selectedModel,
    systemPrompt: "你是一个有用的助手。请根据问题的复杂度给出适当详细的回答。",
  });

  const result = await agent.invoke({
    messages: [{ role: "user", content: question }],
  });

  return result.messages.at(-1)?.content;
}

// 测试不同复杂度的问题
async function main() {
  const testCases = [
    "2+2等于几？",                                            // 简单
    "用 TypeScript 实现一个二叉搜索树，包含插入和查找方法",      // 代码
    "请详细分析量子纠缠的哲学意义及其对现代物理学的影响，\n包括EPR悖论、贝尔不等式和最新的量子隐形传态实验进展。", // 复杂
  ];

  for (const question of testCases) {
    console.log(`\n📝 问题: ${question.slice(0, 50)}...`);
    console.log("=".repeat(50));
    const answer = await smartAgent(question);
    console.log(`💬 ${answer?.slice(0, 200)}...\n`);
  }
}

main().catch(console.error);
```

**预期输出：**
```
📊 检测到简单问题 → 使用快速模型
  选用模型: openai:gpt-5-nano
💬 2+2=4

📊 检测到代码问题 → 使用平衡模型
  选用模型: anthropic:claude-sonnet-4-6
💬 以下是用 TypeScript 实现的二叉搜索树...
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：模型不可用时的 Fallback 策略

当主模型不可用（配额超限、网络故障等）时，自动切换到备选模型：

```typescript
async function createAgentWithFallback(primary: string, fallback: string) {
  try {
    return createDeepAgent({
      model: primary,
      systemPrompt: "You are a helpful assistant.",
    });
  } catch {
    console.warn(`⚠️ ${primary} 不可用，回退到 ${fallback}`);
    return createDeepAgent({
      model: fallback,
      systemPrompt: "You are a helpful assistant.",
    });
  }
}

// 使用：优先使用 Opus，不可用时回退到 Sonnet
const agent = await createAgentWithFallback(
  "anthropic:claude-opus-4-8",
  "anthropic:claude-sonnet-4-6"
);
```

### 技巧二：OpenRouter 的自动 Fallback 配置

如果使用 OpenRouter，可以在 HTTP 请求头中设置 Fallback 模型：

```typescript
// OpenRouter 会自动处理 Fallback
const agent = createDeepAgent({
  model: "openrouter:anthropic/claude-sonnet-4-6",
  // 如果 Claude 不可用，OpenRouter 会自动尝试 GPT
  // 无需在应用层处理 Fallback 逻辑
});
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Deep Agents 支持哪些模型提供商？它们分别有什么特点？**
> A：支持 7 种：Anthropic Claude（长文本/安全）、OpenAI GPT（代码/结构化输出）、Google Gemini（多模态）、OpenRouter（统一网关/200+模型）、Baseten（私有模型部署）、Fireworks（优化开源模型）、Ollama（本地/离线）。

**Q2：`provider:model_id` 格式的优势是什么？**
> A：统一接口（所有模型配置方式相同，只需改一个字符串）和运行时切换（通过中间件无需重启即可动态切换模型）。

**Q3：OpenRouter 相比直接使用模型提供商有什么核心优势？**
> A：统一计费（一个 Key 管理所有模型）、自动 Fallback（模型不可用时自动切换）、负载均衡、方便对比不同模型。

**Q4：Ollama 适合什么场景？** 
> A：开发测试（零成本迭代）、离线环境（内网部署）、隐私保护（数据不出境）、成本控制（大量测试用本地模型）。

**Q5：temperature 参数的作用是什么？应该如何设置？**
> A：控制输出随机性，0-1 之间。代码任务用 0.2（确定性），创意写作用 0.7（创造性），事实问答用 0.1（准确性优先）。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `API key not configured for provider: xxx` | 未设置对应 API Key 环境变量 | 检查 `.env` 文件，确保 Key 名称正确 |
| `Model not found: xxx` | 模型名称拼写错误或格式不正确 | 确认使用 `provider:model_id` 格式 |
| `Insufficient quota` | API 调用配额超限 | 检查账户余额，或使用 OpenRouter 负载均衡 |
| `Ollama: connection refused` | Ollama 服务未启动 | 运行 `ollama serve` 启动本地服务 |
| `Model unavailable` | 模型暂时不可用 | 添加 Fallback 逻辑自动切换备选模型 |

---

## 📝 本章小结

- ✅ Deep Agents 支持 7 种模型提供商，通过 `provider:model_id` 统一标识
- ✅ 多模型策略的核心价值：成本优化、避免厂商锁定、能力互补、高可用
- ✅ Claude 擅长长文本推理，GPT 擅长代码生成，Gemini 擅长多模态
- ✅ OpenRouter 提供统一网关，一个 API Key 访问 200+ 模型
- ✅ Ollama 支持本地模型运行，零成本开发和离线部署
- ✅ 通过中间件可实现基于任务复杂度的动态模型选择
- ✅ 通过 Fallback 策略可确保模型不可用时的服务连续性

## ➡️ 下一章预告

> 在下一章中，我们将深入 Deep Agents 的记忆与上下文系统——理解三层记忆机制（对话历史、Memory 文件、Runtime Context），以及如何使用 MemorySaver 实现跨对话的状态持久化。
>
> [第5章 记忆、上下文与系统提示](./05-memory-context.md)
