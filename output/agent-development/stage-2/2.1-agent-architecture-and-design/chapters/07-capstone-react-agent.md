# 第7章：综合实战 — 手写 ReAct Agent

> 预计学习时间：120-150 分钟

## 🎯 本章目标

不依赖任何 Agent 框架，从零实现一个功能完整的 ReAct Agent。

---

## 📋 前置知识

> 建议先完成：[第1章：什么是 Agent](./01-what-is-agent.md) 至 [第5章：Agent Loop 设计](./05-agent-loop.md)，特别是 [第2章：ReAct 模式](./02-react-pattern.md) 的实现部分。

---

## 💡 核心概念

### 架构总览

本项目将综合运用前 6 章的知识，构建一个生产可用的 ReAct Agent。整体架构遵循 **分层设计** 原则：

```
┌──────────────────────────────────────────────────┐
│                   用户接口层                        │
│          index.ts (CLI / API 入口)                 │
├──────────────────────────────────────────────────┤
│                   Agent 核心层                     │
│  ┌──────────────────────────────────────────┐   │
│  │            ReActAgent (agent.ts)          │   │
│  │  ┌─────┐  ┌──────┐  ┌────────┐          │   │
│  │  │循环  │→ │LLM   │→ │工具执行 │          │   │
│  │  │控制  │  │调用   │  │        │          │   │
│  │  └─────┘  └──────┘  └────────┘          │   │
│  └──────────────────────────────────────────┘   │
├──────────────────────────────────────────────────┤
│                   解析层                          │
│          parser.ts (LLM 输出 → 结构化动作)        │
├──────────────────────────────────────────────────┤
│                   工具层                          │
│          tools.ts (工具注册 + 执行)               │
├──────────────────────────────────────────────────┤
│                  基础设施层                       │
│     LLM Client (SDK)  + 文件系统 + 网络 API       │
└──────────────────────────────────────────────────┘
```

**各层职责：**
- **工具层** — 定义 Agent 能执行的所有操作（search, calculate, read_file 等），每个工具独立封装，便于扩展
- **解析层** — 将 LLM 的自由文本输出解析为结构化的 `{ thought, action, actionInput }` 三元组
- **Agent 核心层** — 负责循环控制、状态管理、Token 追踪、错误恢复，是 Agent 的「大脑和神经系统」
- **用户接口层** — 提供 CLI 或 API 接口，方便集成到不同应用场景

### 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 工具调用方式 | 文本解析（而非 function calling） | 保持框架无关性，任何 LLM 都能使用 |
| 状态管理 | 消息数组（messages） | 简单直接，与 LLM API 天然一致 |
| 循环控制 | for 循环 + maxIterations | 简单可靠，易于理解和调试 |
| 输出解析 | 正则表达式 | 无需额外依赖，对格式良好的输出足够可靠 |

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

## ⚡ 进阶技巧

### 技巧 1：为工具添加超时和重试包装器

```typescript
// 用装饰器模式为所有工具统一添加超时和重试
function withTimeoutAndRetry<T>(
  toolFn: (input: string) => Promise<T>,
  timeoutMs: number = 10000,
  retries: number = 2
): (input: string) => Promise<T> {
  return async (input: string) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await Promise.race([
          toolFn(input),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`工具超时 (${timeoutMs}ms)`)), timeoutMs)
          ),
        ]);
        return result;
      } catch (err) {
        if (attempt === retries) throw err;
        console.warn(`工具调用失败，第 ${attempt + 1} 次重试...`);
      }
    }
    throw new Error('不可达');
  };
}

// 使用
const safeSearch = withTimeoutAndRetry(searchAPI.execute, 5000, 2);
```

### 技巧 2：用 Zod 做工具参数 schema 校验

```typescript
import { z } from 'zod';

// 为工具的 execute 方法添加输入校验
const toolSchemas = {
  search: z.object({
    query: z.string().min(1, '搜索词不能为空'),
    maxResults: z.number().max(20).default(5),
  }),
  calculate: z.object({
    expression: z.string()
      .min(1)
      .regex(/^[0-9+\-*/().%\s]+$/, '表达式包含非法字符'),
  }),
  read_file: z.object({
    path: z.string().min(1),
    maxLines: z.number().positive().default(200),
  }),
};

type ToolInput<T extends keyof typeof toolSchemas> =
  z.infer<typeof toolSchemas[T]>;
```

### 技巧 3：构建可配置的 Agent Factory

```typescript
type AgentFactoryConfig = {
  model: string;
  tools: Tool[];
  maxIterations: number;
  maxTokens: number;
  temperature: number;
  verbose: boolean;
  memory?: EpisodicMemory;
  hook?: {
    onStep?: (step: StepRecord) => void;
    onComplete?: (result: AgentResult) => void;
    onError?: (error: Error) => void;
  };
};

class AgentFactory {
  static createReActAgent(config: AgentFactoryConfig): ReActAgent {
    const agent = new ReActAgent(config.tools, config);

    // 注入生命周期钩子
    if (config.hook) {
      agent.on('step', config.hook.onStep ?? (() => {}));
      agent.on('complete', config.hook.onComplete ?? (() => {}));
      agent.on('error', config.hook.onError ?? (() => {}));
    }

    return agent;
  }
}

// 使用
const agent = AgentFactory.createReActAgent({
  model: 'claude-sonnet-4-5-20241022',
  tools: createDefaultTools(),
  maxIterations: 15,
  maxTokens: 50000,
  temperature: 0.3,
  verbose: true,
  hook: {
    onStep: (step) => console.log(`[步骤 ${step.iteration}] ${step.action}`),
    onComplete: (result) => console.log(`总 Token: ${result.totalTokens}`),
  },
});
```

---

## 🧠 知识检查点

<details>
<summary>Q1: 本项目的「文本解析式工具调用」和 Anthropic/Bedrock 的「Function Calling」各有什么优缺点？</summary>

> A：文本解析式（本项目的方案）优点是框架无关——任何 LLM（包括开源模型）都能用，不需要 API 层面的特殊支持。缺点是解析不稳定，LLM 可能输出格式错误的 Action 导致解析失败。Function Calling 的优点是格式可靠（由 API 保证）、支持结构化参数（JSON Schema），缺点是绑定特定模型和 API。生产环境建议两者结合：优先使用 Function Calling，降级到文本解析作为后备方案。
</details>

<details>
<summary>Q2: 如果想让本项目支持多轮对话（Agent 的记忆跨对话持久化），需要修改哪些部分？</summary>

> A：需要修改三个地方：① **记忆层** — 在 tools.ts 中新增 `save_memory` 和 `load_memory` 工具，对接向量数据库（如 Chroma、Pinecone）；② **Agent 初始化** — 在 `ReActAgent` 构造函数中增加 memory 参数，在启动时加载历史记忆；③ **System Prompt** — 在 `buildSystemPrompt` 中注入记忆摘要，让 Agent 知道之前的对话背景。更深入的方案可以参考第 4 章的 Reflexion 模式中的 Episodic Memory。
</details>

<details>
<summary>Q3: 本项目的 Agent 在遇到工具返回错误时会怎么处理？如何改进？</summary>

> A：当前实现只是将错误信息作为 Observation 反馈给 LLM，由 LLM 决定如何应对。改进方案包括：① **自动重试** — 在 `Tool.execute` 中加入重试逻辑（如指数退避）；② **降级策略** — 为每个工具定义 fallback（如 search 失败时用缓存数据）；③ **熔断机制** — 如果同一工具连续失败 3 次，标记为不可用并通知 LLM 避免后续调用；④ **错误分类** — 区分临时错误（可重试）和永久错误（需换方案），让 LLM 能做出更合理的决策。
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| 解析器 `parseAgentOutput` 返回 null，Agent 无法继续 | LLM 输出格式不符合预期（如使用了中文冒号「：」代替英文「:」） | 在 prompt 中强调格式要求 + 在解析器中添加字符标准化处理（全角→半角） |
| Agent 在第一步就调用了 finish，任务实际没完成 | LLM「偷懒」，遇到复杂问题选择直接总结而非逐步推理 | 在 prompt 中加入「在充分探索后再给出结论」的指令；在 Agent 配置中设置 `minSteps`（最小步骤数） |
| 多次运行同一任务的结果不一致 | LLM 输出的随机性导致 Action 格式或工具选择不稳定 | 降低 temperature（0.0-0.3）；在 prompt 中使用 few-shot 示例固定输出格式；对关键任务做多次运行取投票结果 |

---

## 📝 本章小结

- ✅ **完整 ReAct Agent** — 不依赖框架，从零实现了一个生产可用的 Agent
- ✅ **分层架构** — 工具层、解析层、核心层、接口层职责分明
- ✅ **工具系统** — 可扩展的工具注册和执行机制
- ✅ **输出解析** — 从 LLM 文本输出中提取结构化动作
- ✅ **循环控制** — 最大迭代 + Token 追踪 + 错误处理
- ✅ **执行追踪** — 完整的步骤记录和统计

---

## ➡️ 下一步

查看附录，然后进入 [2.2 Function Calling 与 Tool Use](../../2.2-function-calling-and-tool-use/README.md)
