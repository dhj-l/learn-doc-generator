# 第7章：综合实战 — 手写 ReAct Agent

> 预计学习时间：120-150 分钟

## 🎯 本章目标

不依赖任何 Agent 框架，从零实现一个功能完整的 ReAct Agent。

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

## 📝 本章小结

- ✅ **完整 ReAct Agent** — 不依赖框架，从零实现
- ✅ **工具系统** — 可扩展的工具注册和执行机制
- ✅ **输出解析** — 从 LLM 文本输出中提取结构化动作
- ✅ **循环控制** — 最大迭代 + Token 追踪 + 错误处理
- ✅ **执行追踪** — 完整的步骤记录和统计

## ➡️ 下一步

查看附录，然后进入 [2.2 Function Calling 与 Tool Use](../../2.2-function-calling-and-tool-use/README.md)
