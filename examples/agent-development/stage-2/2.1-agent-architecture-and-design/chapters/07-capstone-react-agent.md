# 第7章：综合实战 — 手写 ReAct Agent

> 预计学习时间：120-150 分钟

## 🎯 本章目标

不依赖任何 Agent 框架，从零实现一个功能完整的 ReAct Agent。

---

## 📋 前置知识

> 建议先完成：[第2章：ReAct 模式](./02-react-pattern.md) 和 [第5章：Agent Loop 设计](./05-agent-loop.md)

---

## 🔨 完整实现

### 项目结构

```
react-agent/
├── src/
│   ├── agent.ts        # Agent 核心引擎
│   ├── tools.ts        # 工具定义
│   ├── parser.ts       # 输出解析器
│   └── index.ts        # 入口
└── package.json
```

### 工具定义

```typescript
// src/tools.ts
import Anthropic from '@anthropic-ai/sdk';

export interface Tool {
  name: string;
  description: string;
  parameters: string;  // 参数描述
  execute: (input: string) => Promise<string>;
}

export function createDefaultTools(): Tool[] {
  return [
    {
      name: 'search',
      description: '搜索互联网获取信息',
      parameters: '搜索关键词',
      execute: async (query: string) => {
        // 实际项目中接入搜索 API
        return `关于 "${query}" 的搜索结果：[这是模拟的搜索结果]`;
      },
    },
    {
      name: 'calculate',
      description: '执行数学计算',
      parameters: '数学表达式',
      execute: async (expression: string) => {
        try {
          // 安全的数学表达式计算
          const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
          const result = Function('"use strict"; return (' + sanitized + ')')();
          return `${expression} = ${result}`;
        } catch (e) {
          return `计算错误: ${(e as Error).message}`;
        }
      },
    },
    {
      name: 'lookup',
      description: '查询术语或概念的定义',
      parameters: '术语名称',
      execute: async (term: string) => {
        const definitions: Record<string, string> = {
          'typescript': 'TypeScript 是 JavaScript 的超集，添加了静态类型系统',
          'react': 'React 是一个用于构建用户界面的 JavaScript 库',
          'api': 'API（Application Programming Interface）是应用程序编程接口',
        };
        return definitions[term.toLowerCase()] || `未找到 "${term}" 的定义`;
      },
    },
    {
      name: 'finish',
      description: '输出最终答案并结束任务',
      parameters: '最终答案',
      execute: async (answer: string) => answer,
    },
  ];
}
```

### 输出解析器

```typescript
// src/parser.ts

interface ParsedAction {
  thought: string;
  action: string;
  actionInput: string;
  isFinish: boolean;
}

export function parseAgentOutput(output: string): ParsedAction | null {
  // 提取 Thought
  const thoughtMatch = output.match(/Thought:\s*(.+?)(?=\nAction:|$)/s);
  const thought = thoughtMatch?.[1]?.trim() || '';

  // 提取 Action 和 Input
  const actionMatch = output.match(/Action:\s*(\w+)\((.*?)\)/s);

  if (!actionMatch) return null;

  const action = actionMatch[1];
  const actionInput = actionMatch[2].replace(/^["']|["']$/g, '').replace(/\\"/g, '"');

  return {
    thought,
    action,
    actionInput,
    isFinish: action === 'finish',
  };
}
```

### Agent 核心引擎

```typescript
// src/agent.ts
import Anthropic from '@anthropic-ai/sdk';
import { Tool, createDefaultTools } from './tools';
import { parseAgentOutput } from './parser';

const client = new Anthropic();

interface AgentConfig {
  model: string;
  maxIterations: number;
  maxTokens: number;
  temperature: number;
  verbose: boolean;
}

const DEFAULT_CONFIG: AgentConfig = {
  model: 'claude-sonnet-4-5-20241022',
  maxIterations: 10,
  maxTokens: 4096,
  temperature: 0.3,
  verbose: true,
};

interface StepRecord {
  iteration: number;
  thought: string;
  action: string;
  input: string;
  output: string;
  isFinish: boolean;
}

export class ReActAgent {
  private tools: Map<string, Tool>;
  private config: AgentConfig;
  private systemPrompt: string;

  constructor(tools?: Tool[], config?: Partial<AgentConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tools = new Map(
      (tools || createDefaultTools()).map(t => [t.name, t])
    );
    this.systemPrompt = this.buildSystemPrompt();
  }

  private buildSystemPrompt(): string {
    const toolDescs = Array.from(this.tools.values())
      .map(t => `- ${t.name}(${t.parameters}): ${t.description}`)
      .join('\n');

    return `你是一个问题解决助手，使用 ReAct 模式工作。

可用工具：
${toolDescs}

使用格式：
Thought: [分析当前情况，决定下一步]
Action: [工具名]("[参数]")

收到 Observation 后继续推理。
当可以回答用户问题时：
Thought: [总结所有信息]
Action: finish("[最终答案]")

重要：每次只执行一个 Action。`;
  }

  async run(task: string): Promise<{
    answer: string;
    steps: StepRecord[];
    totalTokens: number;
  }> {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: task },
    ];
    const steps: StepRecord[] = [];
    let totalTokens = 0;

    for (let i = 0; i < this.config.maxIterations; i++) {
      if (this.config.verbose) {
        console.log(`\n--- 第 ${i + 1} 步 ---`);
      }

      // 调用 LLM
      const response = await client.messages.create({
        model: this.config.model,
        max_tokens: 1024,
        temperature: this.config.temperature,
        system: this.systemPrompt,
        messages,
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      totalTokens += response.usage.input_tokens + response.usage.output_tokens;

      // 解析输出
      const parsed = parseAgentOutput(text);
      if (!parsed) {
        if (this.config.verbose) console.log('⚠️ 解析失败，重试...');
        messages.push({ role: 'assistant', content: text });
        messages.push({ role: 'user', content: 'Observation: 解析错误，请按格式重新输出 Thought 和 Action。' });
        continue;
      }

      if (this.config.verbose) {
        console.log(`💭 ${parsed.thought}`);
        console.log(`🔧 ${parsed.action}("${parsed.actionInput}")`);
      }

      // 检查是否结束
      if (parsed.isFinish) {
        const record: StepRecord = {
          iteration: i + 1,
          thought: parsed.thought,
          action: parsed.action,
          input: parsed.actionInput,
          output: parsed.actionInput,
          isFinish: true,
        };
        steps.push(record);
        return { answer: parsed.actionInput, steps, totalTokens };
      }

      // 执行工具
      const tool = this.tools.get(parsed.action);
      let observation: string;

      if (tool) {
        observation = await tool.execute(parsed.actionInput);
      } else {
        observation = `错误: 工具 "${parsed.action}" 不存在。可用: ${Array.from(this.tools.keys()).join(', ')}`;
      }

      if (this.config.verbose) {
        console.log(`👁️ ${observation}`);
      }

      steps.push({
        iteration: i + 1,
        thought: parsed.thought,
        action: parsed.action,
        input: parsed.actionInput,
        output: observation,
        isFinish: false,
      });

      // 更新消息历史
      messages.push({ role: 'assistant', content: text });
      messages.push({ role: 'user', content: `Observation: ${observation}` });
    }

    return { answer: '达到最大迭代次数', steps, totalTokens };
  }
}
```

**预期输出：**
```
--- 第 1 步 ---
💭 需要计算长方形的面积和周长
🔧 calculate("12 * 8")
👁️ 12 * 8 = 96

--- 第 2 步 ---
💭 面积是 96 平方厘米。现在计算周长。
🔧 calculate("2 * (12 + 8)")
👁️ 2 * (12 + 8) = 40

--- 第 3 步 ---
💭 已经得到面积和周长，可以给出最终答案。
🔧 finish("长方形面积 = 96 平方厘米；周长 = 40 厘米")
```


### 使用示例

```typescript
// src/index.ts
import { ReActAgent } from './agent';

async function main() {
  const agent = new ReActAgent();

  const { answer, steps, totalTokens } = await agent.run(
    '如果一个长方形的长是 12 厘米，宽是 8 厘米，它的面积和周长分别是多少？'
  );

  console.log('\n========================================');
  console.log('📋 执行摘要:');
  console.log(`  总步骤: ${steps.length}`);
  console.log(`  总 Token: ${totalTokens}`);
  console.log(`  最终答案: ${answer}`);
}

main();
```

```
预期输出：
--- 第 1 步 ---
💭 需要计算长方形的面积和周长。面积 = 长 × 宽，周长 = 2 ×（长 + 宽）
🔧 calculate("12 * 8")
👁️ 12 * 8 = 96

--- 第 2 步 ---
💭 面积是 96 平方厘米。现在计算周长。
🔧 calculate("2 * (12 + 8)")
👁️ 2 * (12 + 8) = 40

--- 第 3 步 ---
💭 已经得到面积 96 平方厘米和周长 40 厘米，可以给出最终答案。
🔧 finish("长方形面积 = 12 × 8 = 96 平方厘米；周长 = 2 × (12 + 8) = 40 厘米。")

========================================
📋 执行摘要:
  总步骤: 3
  总 Token: 520
  最终答案: 长方形面积 = 12 × 8 = 96 平方厘米；周长 = 2 × (12 + 8) = 40 厘米。
```

---

## ⚡ 进阶技巧

### 技巧一：为 Agent 添加流式输出

让 Agent 边思考边输出，提升用户体验：

```typescript
class StreamingReActAgent extends ReActAgent {
  async runStreaming(
    task: string,
    onStep: (step: { type: 'thought' | 'action' | 'observation'; content: string }) => void
  ) {
    onStep({ type: 'thought', content: `开始处理任务: ${task}` });

    const result = await super.run(task);

    for (const step of result.steps) {
      onStep({ type: 'thought', content: step.thought });
      onStep({ type: 'action', content: `${step.action}("${step.input}")` });
      onStep({ type: 'observation', content: step.output });
    }

    onStep({ type: 'thought', content: `答案: ${result.answer}` });
  }
}
```

**预期输出：**
```
💭 开始处理任务: "巴黎和东京的时差是多少？"
💭 需要查询巴黎和东京的时区信息
🔧 search("巴黎时区")
👁️ 巴黎位于 UTC+1（东一区）
💭 现在查询东京时区
🔧 search("东京时区")
👁️ 东京位于 UTC+9（东九区）
💭 答案: 巴黎和东京时差 8 小时（东京比巴黎快 8 小时）
```


### 技巧二：添加中间结果的验证钩子

在执行过程中插入验证点，提前发现潜在问题：

```typescript
interface ValidationHook {
  name: string;
  validate: (step: StepRecord, context: AgentContext) =>
    Promise<{ valid: boolean; warning?: string; block?: boolean }>;
}

// 示例：检测 Agent 是否在搜索已经查过的信息
const duplicateSearchHook: ValidationHook = {
  name: 'duplicate-search-check',
  validate: async (step, context) => {
    const previousSearches = context.history
      .filter(h => h.data?.action === 'search')
      .map(h => h.data?.input);

    if (previousSearches.includes(step.input)) {
      return {
        valid: false,
        warning: `你已经查过 "${step.input}" 了，看看之前的结果`,
        block: false, // 不阻止，只是提醒
      };
    }
    return { valid: true };
  },
};
```

### 技巧三：实现 Agent 的「回滚」能力

当某一步执行错误时，可以回滚到之前的状态：

```typescript
class RollbackCapableAgent {
  private snapshots: Map<number, AgentContext> = new Map();

  // 执行前创建快照
  async beforeStep(iteration: number): Promise<void> {
    this.snapshots.set(iteration, {
      state: this.getState(),
      messages: [...this.messages],
      filesBackup: await this.backupModifiedFiles(),
    });
  }

  // 回滚到指定步骤
  async rollback(toIteration: number): Promise<void> {
    const snapshot = this.snapshots.get(toIteration);
    if (!snapshot) throw new Error(`没有步骤 ${toIteration} 的快照`);
    await this.restoreSnapshot(snapshot);
  }
}
```

**预期输出：**
```
步骤 1: 创建快照 → 读取文件成功
步骤 2: 创建快照 → 编辑文件成功
步骤 3: 创建快照 → 执行命令失败 ❌
→ 触发回滚到步骤 2 的快照
→ 文件已恢复到编辑后的正确状态
```


---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：在实现 ReAct Agent 时，为什么需要输出解析器（parser）？**

> A：LLM 的输出是自然语言文本，Agent 需要从中提取结构化的 Action 信息（工具名称和参数）。解析器负责将 Thought/Action/Observation 格式的文本解析为可执行的结构，是连接 LLM 和工具系统的桥梁。没有解析器，Agent 就无法理解 LLM 想要调用什么工具。

**Q2：工具系统的设计为什么采用 Map 而不是数组？**

> A：使用 Map（或字典）可以 O(1) 时间复杂度查找到对应工具。Agent 在每次循环中需要根据解析出的工具名称快速找到工具执行函数。如果使用数组，每次查找都需要遍历，效率低。此外，Map 还能提供清晰的工具注册和管理接口。

**Q3：为什么 capstone 实现使用了 `finish` 工具而不是 `return` 语句？**

> A：`finish` 工具将「结束任务」也设计为一次工具调用，保持了 ReAct 循环的一致性。Agent 从「思考」到「行动」再到「观察」的周期完全统一，`finish` 只是最后一个特殊的 Action。这样 Agent 可以在输出最终答案之前再经过一次完整的推理，确保答案质量。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 忘记在 System Prompt 中给出 Action 格式示例 | LLM 不清楚输出的结构要求，返回自由格式文本 | 在 System Prompt 中至少给出 2 个完整的 Thought/Action/… 示例 |
| 没有处理 LLM 返回空内容的情况 | LLM API 可能返回空字符串或只包含非文本内容 | 检查 `response.content` 的类型和长度，处理空内容的重试 |
| maxIterations 设置过大或过小 | 太大导致成本失控，太小导致 Agent 无法完成复杂任务 | 根据任务复杂度设置（简单任务 5-10，复杂任务 15-20），并配合 Token 预算双重保护 |

---

## 🔨 实战演练

### 练习：为你的 ReAct Agent 添加文件读写能力

<details>
<summary>🧑‍💻 先自己动手实现，再展开参考答案</summary>

**场景描述：**
你的 ReAct Agent 目前只能搜索和计算。现在需要给它添加文件读写能力，让它能读取指定文件内容并将结果保存到文件。

**你的任务：**
1. 添加 `readFile(path)` 和 `writeFile(path, content)` 两个工具
2. 测试 Agent 能否完成：「读取文件 input.txt 中的数学题，计算答案，将结果写入 output.txt」
3. 添加安全检查：`readFile` 只能读取当前目录下的文件，`writeFile` 不能覆盖已有文件

**参考实现：**
```typescript
const readFileTool: Tool = {
  name: 'readFile',
  description: '读取当前目录下的文件',
  parameters: '文件路径',
  execute: async (input: string) => {
    const path = input.replace(/["']/g, '').trim();
    // 安全检查：禁止路径穿越
    if (path.includes('..') || path.startsWith('/')) {
      return '错误：只能读取当前目录下的文件';
    }
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(path, 'utf-8');
      return `文件 "${path}" 的内容：\n${content}`;
    } catch (e) {
      return `读取失败: ${(e as Error).message}`;
    }
  },
};
```

</details>

---

## 📝 本章小结

- ✅ **完整 ReAct Agent** — 不依赖框架，从零实现
- ✅ **工具系统** — 可扩展的工具注册和执行机制
- ✅ **输出解析** — 从 LLM 文本输出中提取结构化动作
- ✅ **循环控制** — 最大迭代 + Token 追踪 + 错误处理
- ✅ **执行追踪** — 完整的步骤记录和统计

## ➡️ 下一步

查看附录，然后进入 [2.2 Function Calling 与 Tool Use](../../2.2-function-calling-and-tool-use/README.md)
