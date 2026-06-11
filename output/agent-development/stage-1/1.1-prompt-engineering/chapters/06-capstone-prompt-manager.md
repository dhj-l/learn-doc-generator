# 第6章：综合实战 — 构建 Prompt 模板管理系统

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **从零构建一个完整的 Prompt 模板管理系统** — 包含模板管理、变量注入、版本控制、效果评估
- **综合运用前五章的所有知识** — Token 理解、设计原则、核心技巧、System Prompt、高级策略
- **体验真实的 Prompt 工程化流程** — 从需求到上线的完整链路
- **掌握生产环境 Prompt 管理的最佳实践**

## 📋 前置知识

> 本章综合运用前面所有章节的知识，建议按顺序完成：
> - [第1章](./01-llm-fundamentals.md) → [第2章](./02-prompt-principles.md) → [第3章](./03-core-techniques.md) → [第4章](./04-system-prompt-design.md) → [第5章](./05-advanced-prompting.md)

---

## 💡 项目概述

我们将构建一个 **PromptCraft** — 企业级 Prompt 模板管理系统。

### 功能需求

```
PromptCraft 系统
├── 模板管理
│   ├── 创建/编辑/删除 Prompt 模板
│   ├── 变量定义和注入
│   ├── 版本控制和变更历史
│   └── 标签分类和搜索
├── 测试评估
│   ├── 单个模板测试
│   ├── A/B 对比测试
│   ├── 批量测试（多输入用例）
│   └── 评估指标（Token 消耗、延迟、质量评分）
├── 执行引擎
│   ├── 模板渲染和变量注入
│   ├── 多模型适配（Claude、GPT 等）
│   ├── 缓存和重试
│   └── 输出格式验证
└── 监控仪表盘
    ├── 使用统计
    ├── 成本分析
    └── 质量趋势
```

### 技术栈

- **语言**：TypeScript（Node.js）
- **AI SDK**：Anthropic SDK
- **存储**：SQLite（轻量本地存储）
- **验证**：Zod（数据验证）
- **测试**：内置测试框架

---

## 🔨 实战：逐步构建

### 第 1 步：定义核心数据模型

```typescript
// src/types.ts

import { z } from 'zod';

// Prompt 变量定义 Schema
const VariableSchema = z.object({
  name: z.string(),                    // 变量名，如 "language"
  description: z.string(),             // 变量说明
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  required: z.boolean().default(true), // 是否必填
  defaultValue: z.string().optional(), // 默认值
  example: z.string().optional(),      // 示例值（用于测试）
});

// Prompt 模板 Schema
const PromptTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),                         // 模板名称
  description: z.string(),                  // 模板说明
  category: z.enum(['code-review', 'documentation', 'translation', 'analysis', 'generation', 'other']),
  tags: z.array(z.string()),                // 标签
  systemPrompt: z.string(),                 // System Prompt 模板
  userPromptTemplate: z.string(),           // User Prompt 模板（含 {{变量}} 占位符）
  variables: z.array(VariableSchema),       // 变量定义列表
  outputFormat: z.object({
    type: z.enum(['text', 'json', 'markdown', 'code']),
    schema: z.string().optional(),          // JSON Schema（如果 type 是 json）
  }),
  modelPreferences: z.object({
    preferred: z.string(),                  // 首选模型
    fallback: z.string().optional(),        // 备选模型
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().default(1000),
  }),
  metadata: z.object({
    version: z.string(),                    // 语义化版本号
    author: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    changelog: z.array(z.object({
      version: z.string(),
      date: z.string(),
      changes: z.string(),
    })),
  }),
  evaluation: z.object({
    testCases: z.array(z.object({
      name: z.string(),
      inputs: z.record(z.string()),        // 变量名 → 值
      expectedOutput: z.string().optional(),
      qualityScore: z.number().optional(),  // 人工评分
    })),
    metrics: z.object({
      avgTokens: z.number().optional(),
      avgLatency: z.number().optional(),   // 毫秒
      successRate: z.number().optional(),   // 0-1
      avgQualityScore: z.number().optional(),
    }).optional(),
  }).optional(),
});

// 导出类型
type Variable = z.infer<typeof VariableSchema>;
type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

export { VariableSchema, PromptTemplateSchema, Variable, PromptTemplate };
```

### 第 2 步：构建模板渲染引擎

```typescript
// src/renderer.ts

import Anthropic from '@anthropic-ai/sdk';
import { PromptTemplate, Variable } from './types';

interface RenderResult {
  systemPrompt: string;
  userPrompt: string;
  tokenEstimate: {
    inputTokens: number;
    estimatedCost: number;  // 美元
  };
}

class PromptRenderer {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  // 模板变量注入
  private injectVariables(
    template: string,
    variables: Variable[],
    values: Record<string, string>
  ): string {
    let result = template;

    // 验证必填变量
    for (const variable of variables) {
      if (variable.required && !(variable.name in values) && !variable.defaultValue) {
        throw new Error(`缺少必填变量: ${variable.name} — ${variable.description}`);
      }
    }

    // 注入变量
    for (const variable of variables) {
      const value = values[variable.name] || variable.defaultValue || '';
      const placeholder = `{{${variable.name}}}`;
      result = result.replaceAll(placeholder, value);
    }

    // 检查是否还有未替换的占位符
    const unreplaced = result.match(/\{\{(\w+)\}\}/g);
    if (unreplaced) {
      console.warn(`⚠️ 未替换的变量: ${unreplaced.join(', ')}`);
    }

    return result;
  }

  // 估算 Token 数量（简略估算）
  private estimateTokens(text: string): number {
    // 中文约 1.5 字/Token，英文约 4 字符/Token
    const chineseChars = (text.match(/[一-鿿]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  // 渲染模板
  render(template: PromptTemplate, values: Record<string, string>): RenderResult {
    const systemPrompt = this.injectVariables(
      template.systemPrompt,
      template.variables,
      values
    );
    const userPrompt = this.injectVariables(
      template.userPromptTemplate,
      template.variables,
      values
    );

    const totalTokens = this.estimateTokens(systemPrompt) + this.estimateTokens(userPrompt);

    return {
      systemPrompt,
      userPrompt,
      tokenEstimate: {
        inputTokens: totalTokens,
        estimatedCost: totalTokens * 0.003 / 1000, // 粗略估算
      },
    };
  }

  // 渲染并执行
  async execute(
    template: PromptTemplate,
    values: Record<string, string>
  ): Promise<{
    output: string;
    usage: { inputTokens: number; outputTokens: number };
    latency: number;
  }> {
    const rendered = this.render(template, values);

    const startTime = Date.now();
    const response = await this.client.messages.create({
      model: template.modelPreferences.preferred,
      max_tokens: template.modelPreferences.maxTokens,
      temperature: template.modelPreferences.temperature,
      system: rendered.systemPrompt,
      messages: [
        { role: 'user', content: rendered.userPrompt },
      ],
    });
    const latency = Date.now() - startTime;

    const content = response.content[0];
    const output = content.type === 'text' ? content.text : '';

    return {
      output,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      latency,
    };
  }
}

export { PromptRenderer };
```

### 第 3 步：构建模板管理器

```typescript
// src/manager.ts

import { v4 as uuidv4 } from 'uuid';
import { PromptTemplate, PromptTemplateSchema } from './types';
import { PromptRenderer } from './renderer';
import * as fs from 'fs/promises';
import * as path from 'path';

class PromptManager {
  private templates: Map<string, PromptTemplate> = new Map();
  private renderer: PromptRenderer;
  private storagePath: string;

  constructor(apiKey: string, storagePath: string = './prompts') {
    this.renderer = new PromptRenderer(apiKey);
    this.storagePath = storagePath;
  }

  // 初始化：从磁盘加载模板
  async init(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      const files = await fs.readdir(this.storagePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const data = await fs.readFile(path.join(this.storagePath, file), 'utf-8');
          const template = PromptTemplateSchema.parse(JSON.parse(data));
          this.templates.set(template.id, template);
        }
      }
      console.log(`✅ 加载了 ${this.templates.size} 个模板`);
    } catch (error) {
      console.log('📁 初始化存储目录');
    }
  }

  // 创建新模板
  async create(data: Omit<PromptTemplate, 'id' | 'metadata'>): Promise<PromptTemplate> {
    const template: PromptTemplate = {
      ...data,
      id: uuidv4(),
      metadata: {
        version: '1.0.0',
        author: 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        changelog: [
          { version: '1.0.0', date: new Date().toISOString(), changes: '初始版本' },
        ],
      },
    };

    // 验证模板
    PromptTemplateSchema.parse(template);

    this.templates.set(template.id, template);
    await this.persist(template);
    return template;
  }

  // 更新模板（自动版本递增）
  async update(
    id: string,
    changes: Partial<PromptTemplate>,
    changelog: string
  ): Promise<PromptTemplate> {
    const existing = this.templates.get(id);
    if (!existing) throw new Error(`模板 ${id} 不存在`);

    // 递增版本号
    const [major, minor, patch] = existing.metadata.version.split('.').map(Number);
    const newVersion = `${major}.${minor}.${patch + 1}`;

    const updated: PromptTemplate = {
      ...existing,
      ...changes,
      id, // 防止 id 被覆盖
      metadata: {
        ...existing.metadata,
        ...changes.metadata,
        version: newVersion,
        updatedAt: new Date().toISOString(),
        changelog: [
          ...existing.metadata.changelog,
          { version: newVersion, date: new Date().toISOString(), changes: changelog },
        ],
      },
    };

    PromptTemplateSchema.parse(updated);
    this.templates.set(id, updated);
    await this.persist(updated);
    return updated;
  }

  // 删除模板
  async delete(id: string): Promise<void> {
    const template = this.templates.get(id);
    if (!template) throw new Error(`模板 ${id} 不存在`);

    this.templates.delete(id);
    await fs.unlink(path.join(this.storagePath, `${id}.json`));
  }

  // 搜索模板
  search(query: string): PromptTemplate[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.templates.values()).filter(t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  // 执行模板
  async executeTemplate(
    id: string,
    values: Record<string, string>
  ) {
    const template = this.templates.get(id);
    if (!template) throw new Error(`模板 ${id} 不存在`);

    return this.renderer.execute(template, values);
  }

  // 批量测试
  async batchTest(id: string) {
    const template = this.templates.get(id);
    if (!template?.evaluation?.testCases) {
      throw new Error('模板没有定义测试用例');
    }

    const results = [];
    for (const testCase of template.evaluation.testCases) {
      console.log(`🧪 测试: ${testCase.name}`);
      const result = await this.executeTemplate(id, testCase.inputs);
      results.push({
        testCase: testCase.name,
        ...result,
        expectedOutput: testCase.expectedOutput,
      });
    }

    // 计算统计指标
    const avgTokens = results.reduce((sum, r) => sum + r.usage.outputTokens, 0) / results.length;
    const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length;

    console.log(`\n📊 测试结果:`);
    console.log(`  平均输出 Token: ${avgTokens.toFixed(0)}`);
    console.log(`  平均延迟: ${avgLatency.toFixed(0)}ms`);

    return results;
  }

  // 持久化到磁盘
  private async persist(template: PromptTemplate): Promise<void> {
    await fs.mkdir(this.storagePath, { recursive: true });
    await fs.writeFile(
      path.join(this.storagePath, `${template.id}.json`),
      JSON.stringify(template, null, 2),
      'utf-8'
    );
  }
}

export { PromptManager };
```

### 第 4 步：使用示例 — 创建代码审查模板

```typescript
// src/examples/code-review.ts

import { PromptManager } from '../manager';

async function main() {
  const manager = new PromptManager(process.env.ANTHROPIC_API_KEY!);
  await manager.init();

  // 创建代码审查模板
  const template = await manager.create({
    name: '代码审查助手 v2',
    description: '全面的代码审查，覆盖安全性、性能、可维护性',
    category: 'code-review',
    tags: ['code', 'security', 'performance', 'typescript'],
    systemPrompt: `# 身份
你是一个拥有 15 年经验的资深 {{language}} 工程师。
你的审查风格是「严格但务实」——关注真正影响生产环境的问题。

# 能力
精通 {{language}} 和 {{framework}} 生态。
擅长安全审计、性能优化、代码架构。

# 行为规范
- 按严重程度排序：🔴 必须修复 → 🟡 建议改进 → 🟢 可选优化
- 每个问题附带具体修复代码
- 如果代码质量好，明确肯定

# 输出格式
使用 Markdown 格式，每个问题包含：
**问题 N：[标题]**
- 严重程度：🔴/🟡/🟢
- 位置：第 X 行
- 描述：[问题说明]
- 修复：\`\`\`{{language}} [修复代码] \`\`\``,
    userPromptTemplate: `请审查以下 {{language}} 代码：

\`\`\`{{language.toLowerCase()}}
{{code}}
\`\`\`

审查重点：{{focus_areas}}`,
    variables: [
      {
        name: 'language',
        description: '编程语言',
        type: 'string',
        required: true,
        example: 'TypeScript',
      },
      {
        name: 'framework',
        description: '使用的框架',
        type: 'string',
        required: false,
        defaultValue: 'Node.js',
      },
      {
        name: 'code',
        description: '待审查的代码',
        type: 'string',
        required: true,
      },
      {
        name: 'focus_areas',
        description: '审查重点',
        type: 'string',
        required: false,
        defaultValue: '安全性、性能、可维护性',
      },
    ],
    outputFormat: {
      type: 'markdown',
    },
    modelPreferences: {
      preferred: 'claude-sonnet-4-5-20241022',
      fallback: 'claude-haiku-4-5-20251001',
      temperature: 0.3,
      maxTokens: 2000,
    },
    evaluation: {
      testCases: [
        {
          name: 'SQL 注入检测',
          inputs: {
            language: 'TypeScript',
            code: 'const user = await db.query(`SELECT * FROM users WHERE id = ${userId}`)',
          },
        },
        {
          name: 'React 性能问题',
          inputs: {
            language: 'TypeScript',
            framework: 'React',
            code: `function UserList({ users }: { users: User[] }) {
  return users.map(u => <div key={u.id}>{u.name} - {new Date().toLocaleString()}</div>);
}`,
            focus_areas: 'React 性能优化',
          },
        },
      ],
    },
  });

  console.log(`✅ 模板已创建: ${template.name} (ID: ${template.id})`);

  // 执行测试
  const testResults = await manager.batchTest(template.id);

  // 显示第一个测试结果
  console.log('\n📝 测试1结果:');
  console.log(testResults[0].output.substring(0, 500) + '...');
}

main().catch(console.error);
```

### 第 5 步：构建评估报告

```typescript
// src/evaluator.ts

import Anthropic from '@anthropic-ai/sdk';

interface EvaluationReport {
  templateId: string;
  templateName: string;
  testResults: Array<{
    testCase: string;
    qualityScore: number;  // 1-10
    tokenEfficiency: number;
    latencyMs: number;
    feedback: string;
  }>;
  overallScore: number;
  recommendations: string[];
}

class PromptEvaluator {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  // 使用 AI 评估输出质量
  async evaluateQuality(
    prompt: string,
    output: string,
    expectedBehavior?: string
  ): Promise<{ score: number; feedback: string }> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 500,
      temperature: 0,
      messages: [{
        role: 'user',
        content: `你是一个 Prompt 质量评估专家。

原始 Prompt:
\`\`\`
${prompt}
\`\`\`

AI 输出:
\`\`\`
${output}
\`\`\`

${expectedBehavior ? `期望行为:\n${expectedBehavior}\n` : ''}

请评估输出质量（1-10 分），并给出改进建议。
输出 JSON: {"score": N, "feedback": "..."}`
      }],
    });

    const text = response.content[0].text;
    try {
      return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
    } catch {
      return { score: 5, feedback: '评估解析失败' };
    }
  }

  // 生成完整的评估报告
  async generateReport(
    templateId: string,
    templateName: string,
    testResults: Array<{
      testCase: string;
      output: string;
      usage: { inputTokens: number; outputTokens: number };
      latency: number;
      prompt: string;
    }>
  ): Promise<EvaluationReport> {
    const evaluations = await Promise.all(
      testResults.map(async (result) => {
        const quality = await this.evaluateQuality(result.prompt, result.output);
        return {
          testCase: result.testCase,
          qualityScore: quality.score,
          tokenEfficiency: result.usage.outputTokens / result.usage.inputTokens,
          latencyMs: result.latency,
          feedback: quality.feedback,
        };
      })
    );

    const overallScore = evaluations.reduce((sum, e) => sum + e.qualityScore, 0) / evaluations.length;

    // 生成改进建议
    const improvementPrompt = `基于以下测试结果，给出 3 条 Prompt 改进建议：
${JSON.stringify(evaluations, null, 2)}

用 JSON 输出: {"recommendations": ["建议1", "建议2", "建议3"]}`;

    const recResponse = await this.client.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 500,
      messages: [{ role: 'user', content: improvementPrompt }],
    });

    const recData = JSON.parse(recResponse.content[0].text.match(/\{[\s\S]*\}/)?.[0] || '{}');

    return {
      templateId,
      templateName,
      testResults: evaluations,
      overallScore,
      recommendations: recData.recommendations || [],
    };
  }
}

export { PromptEvaluator, EvaluationReport };
```

### 第 6 步：完整使用流程

```typescript
// src/main.ts — 完整演示

import { PromptManager } from './manager';
import { PromptEvaluator } from './evaluator';

async function runPromptCraft() {
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  // 初始化
  const manager = new PromptManager(apiKey);
  const evaluator = new PromptEvaluator(apiKey);
  await manager.init();

  // 1. 创建一个技术文档翻译模板
  const translationTemplate = await manager.create({
    name: '技术文档翻译',
    description: '将英文技术文档翻译成中文，保持术语一致性',
    category: 'translation',
    tags: ['translation', 'documentation', 'technical'],
    systemPrompt: `# 身份
你是一个专业的技术文档翻译专家。

# 规则
- 技术术语首次出现时用「中文（English）」格式
- 代码块不翻译
- 保持 Markdown 格式
- 专有名词保留英文：{{preserve_terms}}`,
    userPromptTemplate: `请将以下文档翻译成 {{target_language}}：

{{document}}`,
    variables: [
      { name: 'target_language', description: '目标语言', type: 'string', required: true, defaultValue: '简体中文' },
      { name: 'preserve_terms', description: '保留英文的术语', type: 'string', required: false, defaultValue: 'API, SDK, TypeScript, React' },
      { name: 'document', description: '待翻译文档', type: 'string', required: true },
    ],
    outputFormat: { type: 'markdown' },
    modelPreferences: {
      preferred: 'claude-sonnet-4-5-20241022',
      temperature: 0.3,
      maxTokens: 4000,
    },
  });

  // 2. 执行模板
  const result = await manager.executeTemplate(translationTemplate.id, {
    document: `
## Getting Started with the Anthropic SDK

The Anthropic SDK provides a convenient way to interact with the Claude API.
Install it via npm: \`npm install @anthropic-ai/sdk\`

### Key Concepts
- **Messages API**: The primary interface for conversations
- **Streaming**: Real-time response generation
- **Tool Use**: Enable Claude to call external functions
`,
  });

  console.log('📝 翻译结果:');
  console.log(result.output);
  console.log(`\n📊 Token 使用: ${result.usage.inputTokens} 输入 + ${result.usage.outputTokens} 输出`);
  console.log(`⏱️ 延迟: ${result.latency}ms`);

  // 3. 更新模板（版本迭代）
  const updated = await manager.update(
    translationTemplate.id,
    {
      modelPreferences: {
        preferred: 'claude-sonnet-4-5-20241022',
        temperature: 0.2,  // 降低温度以提高一致性
        maxTokens: 4000,
      },
    },
    '降低 Temperature 到 0.2，提高翻译一致性'
  );

  console.log(`\n🔄 模板已更新: v${updated.metadata.version}`);
  console.log(`📋 变更历史: ${updated.metadata.changelog.length} 条记录`);
}

runPromptCraft().catch(console.error);
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么模板系统需要版本控制？**

> A：因为 Prompt 是「活的」——需要不断迭代优化。版本控制让你能：（1）追踪每次修改的内容和原因；（2）回滚到效果更好的旧版本；（3）对比不同版本的性能指标；（4）多人协作时避免冲突。

**Q2：变量注入时应该注意什么安全问题？**

> A：（1）验证变量类型和长度，防止注入攻击；（2）不要让用户提供 System Prompt 的内容；（3）对用户输入的内容进行转义；（4）限制单次请求的 Token 总量。

**Q3：如何判断一个 Prompt 模板是否「好」？**

> A：从五个维度评估：（1）任务完成率——是否正确完成任务；（2）输出稳定性——多次运行结果是否一致；（3）Token 效率——是否在合理 Token 范围内完成；（4）延迟——是否满足实时性要求；（5）用户满意度——最终用户是否满意。

</details>

---

## 📝 本章小结

- ✅ **核心数据模型** — 用 Zod Schema 定义模板结构，类型安全且可验证
- ✅ **渲染引擎** — 变量注入 + Token 估算 + 多模型适配
- ✅ **模板管理器** — CRUD 操作 + 版本控制 + 持久化存储
- ✅ **评估系统** — AI 驱动的质量评估 + 自动化测试
- ✅ **工程化实践** — 完整的从创建到评估的流程

## ➡️ 下一步

恭喜你完成了「Prompt Engineering」主题的全部学习！🎉

接下来请查看：
- [Prompt Engineering 速查表](../appendix/cheatsheet.md) — 快速回顾核心知识点
- [常见错误排错指南](../appendix/troubleshooting.md) — 遇到问题时查阅
- [1.2 Claude API](../../1.2-claude-api/README.md) — 将 Prompt 付诸实践
