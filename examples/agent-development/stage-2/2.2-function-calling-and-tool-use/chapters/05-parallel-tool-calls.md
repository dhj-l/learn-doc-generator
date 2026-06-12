# 第5章：并行与顺序工具调用

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解并行调用 vs 顺序调用的区别** — 知道什么时候用哪种
- **实现并行工具调用处理** — 同时执行多个独立工具
- **处理工具调用之间的依赖关系** — 顺序执行有依赖的工具

## 📋 前置知识

> 建议先完成：[第2章：Claude Tool Use](./02-claude-tool-use.md)

---

## 💡 核心概念

### 并行调用 vs 顺序调用

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

### Claude 并行工具调用实现

```typescript
async function handleToolCalls(response: Anthropic.Message): Promise<Anthropic.ToolResultBlockParam[]> {
  const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

  // 并行执行所有工具
  const results = await Promise.all(
    toolUseBlocks.map(async (block) => {
      if (block.type !== 'tool_use') return null;

      try {
        const result = await executeTool(block.name, block.input);
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: result,
        };
      } catch (error) {
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: `错误: ${(error as Error).message}`,
          is_error: true,
        };
      }
    })
  );

  return results.filter(Boolean) as Anthropic.ToolResultBlockParam[];
}
```

**💡 什么时候用并行？** 当工具之间没有数据依赖时。例如「查北京的天气 + 查上海的天气 + 查纽约的汇率」——这三个任务互相独立。如果「先查用户地址 → 再查该地址的天气」，则必须顺序执行。

---

## 🔨 实战演练

<details>
<summary>🧑‍💻 实现智能调度器</summary>

```typescript
class ToolScheduler {
  // 分析工具依赖关系
  async execute(tools: ToolCall[]) {
    const independent = tools.filter(t => !this.hasDependencies(t));
    const dependent = tools.filter(t => this.hasDependencies(t));

    // 并行执行独立工具
    const results = await Promise.all(
      independent.map(t => this.executeTool(t))
    );

    // 顺序执行有依赖的工具
    for (const tool of dependent) {
      const result = await this.executeTool(tool);
      results.push(result);
    }

    return results;
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：动态依赖分析 — 自动判断并行还是顺序
并非所有工具调用都需要开发者手动判断依赖关系。可以编写一个依赖分析器自动判断：

```typescript
interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

function analyzeDependencies(calls: ToolCall[]): { independent: ToolCall[]; dependent: ToolCall[][] } {
  // 模拟依赖规则：如果工具 A 的某个参数值出现在工具 B 的结果中，则 B 依赖 A
  const dependencyGraph = new Map<string, string[]>();

  for (const call of calls) {
    const deps: string[] = [];
    for (const [key, value] of Object.entries(call.input)) {
      // 如果参数值看起来像是一个占位符或引用，标记为依赖
      if (typeof value === 'string' && value.startsWith('$')) {
        const refName = value.slice(1);
        const provider = calls.find(c => c.name === refName.split('.')[0]);
        if (provider) deps.push(provider.id);
      }
    }
    dependencyGraph.set(call.id, deps);
  }

  const independent = calls.filter(c => (dependencyGraph.get(c.id) || []).length === 0);
  const dependent = calls.filter(c => (dependencyGraph.get(c.id) || []).length > 0);

  return { independent, dependent: dependent.length > 0 ? [dependent] : [] };
}
```

### 技巧二：批量处理大量并行调用
当 Claude 一次返回数十个并行工具调用时，使用带并发限制的调度器：

```typescript
async function executeWithConcurrencyLimit(
  calls: ToolCall[],
  concurrency = 5
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  const executing = new Set<Promise<void>>();

  for (const call of calls) {
    const promise = (async () => {
      const result = await executeTool(call.name, call.input);
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: result,
      });
    })();

    executing.add(promise);

    // 当并发数达到上限时，等待至少一个完成
    if (executing.size >= concurrency) {
      await Promise.race(executing);
      // 清理已完成的 promise
      for (const p of executing) {
        if (Promise.resolve(p) === p) { /* 无法直接检查，使用 Promise.race */ }
      }
    }
  }

  await Promise.all(executing);
  return results;
}
```

### 技巧三：顺序调用的状态传递
当顺序调用中每个步骤需要传递上下文时，使用一个共享状态对象：

```typescript
interface AgentContext {
  userId?: string;
  orderId?: string;
  searchResults?: any[];
  accumulatedData: Record<string, any>;
}

async function sequentialWithContext(initialMessage: string) {
  const context: AgentContext = { accumulatedData: {} };
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: initialMessage },
  ];

  for (let step = 0; step < 5; step++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 1024,
      tools,
      messages,
    });

    if (response.stop_reason !== 'tool_use') break;

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      const result = executeTool(block.name, block.input);
      // 将结果存入上下文
      context.accumulatedData[`step_${step}_${block.name}`] = result;

      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: block.id, content: result }],
      });
    }
  }

  return { finalResponse: messages[messages.length - 1], context };
}
```

---

## 🧠 知识检查点

### Q1: 并行调用和顺序调用的核心区别是什么？什么时候用哪种？

<details>
<summary>点击展开答案</summary>

核心区别在于工具之间是否有数据依赖。**并行调用**用于互相独立的工具（如同时查天气和汇率），所有工具可同时执行。**顺序调用**用于有依赖关系的工具（如先查用户 ID，再用 ID 查订单），后一个工具需要前一个工具的输出作为输入。判断标准：如果工具 B 需要工具 A 的结果才能执行，则必须顺序执行，否则可以并行。

</details>

### Q2: 为什么 `Promise.all` 不适合并行工具调用？应该用什么替代？

<details>
<summary>点击展开答案</summary>

`Promise.all` 是「全有或全无」——只要其中一个 Promise reject，整个调用就会立即失败，其他正在执行的工具结果也会丢失。在工具调用场景中，一个工具失败不应影响其他工具的完成。应该使用 `Promise.allSettled`，它等待所有 Promise 完成（无论成功或失败），然后逐个检查每个结果的状态。

</details>

### Q3: 如何防止顺序调用无限循环？

<details>
<summary>点击展开答案</summary>

1) 在 Agent 循环中设置**最大迭代次数**（如 10 次）；2) 在系统提示中明确指示 LLM 何时停止调用工具（如「如果已经得到足够信息，直接回答用户，不要再调用工具」）；3) 检测重复模式——如果 LLM 反复调用同一个工具并传入相同的参数，说明可能陷入循环，此时应强制终止并返回已有结果。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 并行调用时某个工具失败导致整个请求失败 | 使用 `Promise.all` 同时执行多个工具，其中一个 reject 会整体失败 | 使用 `Promise.allSettled` 替代 `Promise.all`，单独处理每个工具的成功/失败，避免一个失败拖垮全部 |
| 未等待所有并行调用完成就返回 LLM | 只处理了部分 tool_use block，遗漏了一些调用结果 | 遍历 `response.content` 中所有 `type === 'tool_use'` 的 block，确保每个都有对应的 tool_result |
| 顺序调用中陷入死循环 | 工具执行结果总是触发同一个工具的再次调用，没有终止条件 | 设置最大迭代次数（如 10 次），并在系统提示中说明「如果工具结果不需要进一步操作，直接回答用户」 |

---

## 📝 本章小结

- ✅ **并行调用** — 独立任务同时执行，减少等待时间
- ✅ **顺序调用** — 有依赖的任务按步骤执行
- ✅ **Claude 支持** — 一次响应可包含多个 tool_use block

## ➡️ 下一章预告

> [第6章：综合实战 — 多工具智能助手](./06-capstone-tool-assistant.md)
