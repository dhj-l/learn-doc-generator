# 第5章：并行与顺序工具调用

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **区分并行调用和顺序调用的适用场景** — 独立任务并行，依赖任务串行
- **实现批量工具调用的执行器** — 使用 Promise.all 并行处理多个工具
- **构建依赖关系管理** — 识别工具间的数据依赖，自动构建执行 DAG
- **处理部分失败** — 并行调用中部分工具失败时的优雅降级策略
- **理解模型对并行调用的限制** — token 限制、上下文窗口、最大并行数

## 📋 前置知识

- [第1章：Function Calling 基础](./01-function-calling-basics.md) — 理解工具调用的基本流程
- [第2章：Claude Tool Use](./02-claude-tool-use.md) — 了解 Claude 的 tool_use 格式和并行调用能力

## 💡 核心概念

### 概念一：并行调用 vs 顺序调用

```
并行调用（Parallel）：
  LLM 一次返回多个 tool_use block
  → 你同时执行所有工具
  → 将所有结果一次性返回

  适合：多个独立的查询（查天气 + 查汇率 + 查新闻）

顺序调用（Sequential）：
  LLM 一次返回一个 tool_use block
  → 你执行工具
  → 返回结果
  → LLM 决定下一步（可能调用另一个工具）

  适合：有依赖关系的操作（先查用户 → 根据用户ID查订单）
```

### 概念二：并行执行的两种模式

#### 模式 A：模型原生的并行（一次返回多个 tool_use）

Claude 和 OpenAI 都支持在一次响应中返回多个工具调用。这是最高效的并行方式——模型在「思考」阶段就已经规划好了多个工具调用，一次性输出。

```typescript
// Claude 返回的多工具响应示例
response.content = [
  { type: 'text', text: '我来查一下这些信息' },
  { type: 'tool_use', id: 'toolu_001', name: 'get_weather', input: { city: '北京' } },
  { type: 'tool_use', id: 'toolu_002', name: 'get_weather', input: { city: '上海' } },
  { type: 'tool_use', id: 'toolu_003', name: 'get_exchange_rate', input: { from: 'USD', to: 'CNY' } },
];
// 可以并行执行所有工具
```

#### 模式 B：多轮 Agent 循环中的顺序依赖

当工具之间有数据依赖时，需要在多轮中按顺序执行：

```
用户: "北京的天气如何？帮我换算成华氏度"

Round 1: LLM 返回 get_weather(city: "北京")
  → 执行 → 返回 "北京: 25°C"

Round 2: LLM 看到 25°C，决定调用 convert_temperature(value: 25, from: "celsius", to: "fahrenheit")
  → 执行 → 返回 "77°F"

Round 3: LLM 生成最终回答
  → "北京目前 25°C（77°F）"
```

### 概念三：依赖关系管理（DAG 执行）

在复杂的 Agent 场景中，你可能需要手动管理工具间的依赖关系，而不是依赖模型的多轮决策。这种方法被称为 **DAG-based Execution**（有向无环图执行）。

```typescript
// 工具依赖关系定义
const toolDependencies: Record<string, string[]> = {
  get_user_orders: ['get_user_profile'],  // 先查用户信息，再查订单
  send_order_email: ['get_user_orders'],  // 先查订单，再发邮件
};

// DAG 执行器
async function executeWithDependencies(
  toolCalls: ToolCall[]
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  const executed = new Set<string>();
  
  // 计算每个调用的依赖层
  function getDependencyLevel(tc: ToolCall): number {
    const deps = toolDependencies[tc.name] || [];
    if (deps.length === 0) return 0;
    return 1 + Math.max(...deps.map(d => {
      const depCall = toolCalls.find(c => c.name === d);
      return depCall ? getDependencyLevel(depCall) : 0;
    }));
  }

  // 按依赖层级分组执行
  const grouped = new Map<number, ToolCall[]>();
  for (const tc of toolCalls) {
    const level = getDependencyLevel(tc);
    if (!grouped.has(level)) grouped.set(level, []);
    grouped.get(level)!.push(tc);
  }

  // 逐层并行执行
  for (let level = 0; level < grouped.size; level++) {
    const levelCalls = grouped.get(level)!;
    const levelResults = await Promise.all(
      levelCalls.map(tc => executeTool(tc.name, tc.input))
    );
    levelResults.forEach((r, i) => results.push({ 
      tool_use_id: levelCalls[i].id, 
      content: r 
    }));
  }

  return results;
}
```

#### 依赖管理的对比

| 方法 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| **模型驱动** | 让 LLM 在多轮中自然处理依赖 | 无需手动编码依赖关系 | 多轮增加延迟和 token 消耗 |
| **DAG 执行** | 开发者编码依赖关系，自动排序执行 | 减少 LLM 交互轮次，效率高 | 需要预定义所有依赖关系 |
| **混合模式** | 第一轮并行执行独立工具，后续 LLM 决定下一步 | 灵活性和效率的平衡 | 实现更复杂 |

### 概念四：部分失败处理

并行调用中最棘手的问题是——如果一部分工具成功、一部分失败了怎么办？

```typescript
async function handleToolCallsWithPartialFailure(
  response: Anthropic.Message
): Promise<Anthropic.ToolResultBlockParam[]> {
  const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
  
  // 并行执行所有工具
  const results = await Promise.allSettled(  // 使用 allSettled 而不是 all
    toolUseBlocks.map(async (block) => {
      if (block.type !== 'tool_use') return null;
      const result = await executeTool(block.name, block.input);
      return {
        type: 'tool_result' as const,
        tool_use_id: block.id,
        content: result,
      };
    })
  );

  return results.map(r => {
    if (r.status === 'fulfilled' && r.value) {
      return r.value;
    }
    // 失败的调用返回错误信息
    return {
      type: 'tool_result' as const,
      tool_use_id: (r as any).tool_use_id || 'unknown',
      content: '错误: 工具执行失败',
      is_error: true,
    };
  }).filter(Boolean) as Anthropic.ToolResultBlockParam[];
}
```

**为什么 `Promise.allSettled` 优于 `Promise.all`？** `Promise.all` 会在任何一个 Promise 失败时整体拒绝，导致所有成功的工具结果丢失。`Promise.allSettled` 会等待所有 Promise 完成（无论成功或失败），让工具执行器可以返回已成功的结果，同时标记失败的工具。LLM 收到部分成功和部分失败的结果后，可以决定如何处理——重试失败的工具、用替代工具、或向用户解释。

## 🔨 实战演练

**场景描述：** 你正在构建一个「旅行规划助手」。用户提问：「北京和东京的天气怎么样？汇率是多少？帮我算一下 10000 元人民币能换多少日元，能玩几天？」

**你的任务：**
1. 观察这个请求需要哪些工具调用
2. 判断哪些可以并行、哪些需要顺序依赖
3. 实现一个并行+顺序混合的执行器，最小化 LLM 交互轮次

<details>
<summary>💡 参考实现</summary>

```typescript
// 需要的工具
const travelTools: Anthropic.Tool[] = [
  { name: 'get_weather', input_schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } },
  { name: 'get_exchange_rate', input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] } },
  { name: 'calculate', input_schema: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } },
];

// 预期并行执行：
// Round 1: get_weather("北京") + get_weather("东京") + get_exchange_rate("CNY", "JPY") ← 全并行
// Round 2: calculate("10000 * 汇率")  ← 依赖汇率结果
// Round 3: calculate("预算 / 日均花费") ← 依赖上一步
// 通过 DAG 分析，可以合并为 3 轮而不是 6 轮顺序执行

// 混合执行器
async function travelAssistant(query: string) {
  // ... 标准工具循环
  // 在每轮中，使用 Promise.allSettled 并行执行所有工具
  // 如果 LLM 返回了文本+多个 tool_use，先执行所有工具再统一返回
}
```

</details>

## ⚡ 进阶技巧

1. **`Promise.allSettled` 替代 `Promise.all`**：并行执行工具时，永远使用 `Promise.allSettled` 而不是 `Promise.all`。前者保证即使部分工具失败，所有结果都能返回给 LLM，让 LLM 决定下一步。`Promise.all` 的「一错全错」行为会导致成功的工具结果也丢失，浪费 token 和延迟。

2. **工具的「并行兼容性」声明**：在工具定义中隐含标记该工具是否可以并行执行：

```typescript
// 为工具添加元数据
interface ToolMeta {
  parallelSafe: boolean;  // 是否可以与其他工具并行执行
  maxConcurrent?: number; // 最大并行实例数
}

const toolMeta: Record<string, ToolMeta> = {
  get_weather: { parallelSafe: true, maxConcurrent: 5 },
  send_email: { parallelSafe: false }, // 发邮件通常是串行的
  execute_code: { parallelSafe: true, maxConcurrent: 2 }, // 沙箱资源有限
};
```

3. **控制最大并行数**：过多的并行调用可能压垮后端服务，使用信号量或批处理限制并发：

```typescript
async function executeWithConcurrencyLimit(
  toolCalls: ToolCall[], 
  maxConcurrent: number = 5
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (let i = 0; i < toolCalls.length; i += maxConcurrent) {
    const batch = toolCalls.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(tc => executeTool(tc.name, tc.input))
    );
    batchResults.forEach((r, j) => results.push({
      tool_use_id: batch[j].id,
      content: r,
    }));
  }
  return results;
}
```

## 🧠 知识检查点

**问题 1：** 并行调用和顺序调用的核心区别是什么？各自适合什么场景？

<details>
<summary>答案</summary>
并行调用中 LLM 一次返回多个 tool_use block，同时执行所有工具后一次性返回结果给 LLM，适合多个**独立**的工具调用（如查多个城市的天气）。顺序调用中 LLM 每次返回一个工具调用，执行后把结果给 LLM，LLM 再决定下一步，适合有**数据依赖**的操作（如先查用户 ID，再查该用户的订单）。
</details>

**问题 2：** 为什么并行执行工具时应该优先使用 `Promise.allSettled` 而不是 `Promise.all`？

<details>
<summary>答案</summary>
`Promise.all` 在任何一个 Promise 失败时立即整体拒绝，导致其他已成功完成的工具结果也丢失，这些结果需要重新执行才能获取。`Promise.allSettled` 等待所有 Promise 完成，可以同时返回成功和失败的结果。这样 LLM 可以基于已有结果继续工作，同时针对失败的工具尝试重试或替代方案，节省了 token 和延迟成本。
</details>

**问题 3：** 什么是 DAG-based 工具执行？它和模型驱动的顺序执行有什么区别？

<details>
<summary>答案</summary>
DAG-based 执行是开发者在代码中预定义工具间的依赖关系（如 `get_user_orders` 依赖 `get_user_profile`），然后按依赖层级分组并行执行。模型驱动的执行则让 LLM 在多轮对话中自然地处理依赖（第一轮查用户，第二轮查订单）。DAG 方法减少 LLM 交互轮次、效率更高，但需要预定义依赖关系；模型驱动更灵活但延迟更高。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| 使用 `Promise.all` 导致成功结果丢失 | 一个工具失败导致所有结果丢失 | 改用 `Promise.allSettled` 确保所有结果（成功和失败）都被返回 |
| 没有限制并行调用数导致后端过载 | LLM 一次返回 20 个 tool_use，同时执行压垮数据库 | 实现并发控制（信号量或批处理），限制最大并行数 |
| 依赖关系的工具被并行执行 | 工具 B 需要工具 A 的结果作为参数，但被安排同时执行 | 实现 DAG 检测或分轮执行：第一轮执行独立工具，第二轮执行依赖工具 |

## 📝 本章小结

- ✅ **并行 vs 顺序** — 独立任务并行（如查多个城市天气），依赖任务串行（如查用户→查订单）
- ✅ **Promise.allSettled** — 替代 Promise.all 处理部分失败，保证所有工具结果返回给 LLM
- ✅ **DAG 依赖管理** — 预定义工具间的依赖关系，按层级分组并行执行，减少 LLM 交互轮次
- ✅ **并发控制** — 使用信号量或批处理限制最大并行数，防止后端过载
- ✅ **部分失败处理** — 标记失败工具为 is_error，让 LLM 自主决定重试或替代方案

## ➡️ 下一章预告

> [第6章：综合实战 — 多工具智能助手](./06-capstone-tool-assistant.md) — 运用前 5 章所学，构建一个包含 5+ 工具的综合性智能助手。
