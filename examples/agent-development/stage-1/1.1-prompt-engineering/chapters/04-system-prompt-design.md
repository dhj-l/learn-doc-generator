# 第4章：System Prompt 设计 — 定义 AI 的灵魂

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 System Prompt 的本质和作用机制** — 知道系统指令如何影响模型的全部输出
- **设计高质量的角色设定** — 定义 AI 的身份、专业水平和沟通风格
- **构建输出格式约束** — 让 AI 按照你指定的精确格式输出
- **定义能力边界** — 明确 AI 应该做什么、不应该做什么
- **掌握 System Prompt 的工程化管理** — 模板化、变量化、版本控制

## 📋 前置知识

> 建议先完成：
> - [第2章：Prompt 设计原则](./02-prompt-principles.md) — 四要素框架
> - [第3章：核心提示技巧](./03-core-techniques.md) — CoT 和 Few-shot

---

## 💡 核心概念

### 概念一：System Prompt 是什么？

**生活类比：** System Prompt 就像是一家公司的**员工手册**。员工手册不会告诉你今天具体做什么工作，但它定义了：
- 你是谁（身份）
- 你的职责范围（能力边界）
- 你应该如何对待客户（行为规范）
- 什么可以做、什么不能做（约束条件）

在 API 中，System Prompt 是与 `user` 和 `assistant` 并列的消息角色：

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 1000,
  system: `你是一个专业的 Python 代码审查专家。`,  // ← System Prompt
  messages: [
    { role: 'user', content: '审查以下代码...' },
  ],
});
```

#### System Prompt vs User Prompt 的关键区别

| 特性 | System Prompt | User Prompt |
|------|---------------|-------------|
| 生命周期 | 贯穿整个对话 | 单次交互 |
| 作用范围 | 影响所有回复 | 只影响当前回复 |
| 对用户可见 | ❌ 用户看不到 | ✅ 用户能看到 |
| 优先级 | 最高（模型优先遵循） | 较低 |
| 典型用途 | 角色设定、全局规则、输出格式 | 具体任务指令 |

### 概念二：System Prompt 的四大模块

一个专业的 System Prompt 通常包含四个模块：

```
┌─────────────────────────────────────────────────────┐
│  模块 1：身份定义（Identity）                         │
│  "你是谁" — 角色、专业背景、沟通风格                   │
├─────────────────────────────────────────────────────┤
│  模块 2：能力边界（Capabilities）                     │
│  "你能做什么" — 擅长的领域、可用的工具                  │
├─────────────────────────────────────────────────────┤
│  模块 3：行为规范（Behavior）                         │
│  "你该怎么做" — 处理流程、响应策略、安全规则             │
├─────────────────────────────────────────────────────┤
│  模块 4：输出格式（Format）                           │
│  "你的输出长什么样" — 结构、标签、语言要求               │
└─────────────────────────────────────────────────────┘
```

#### 模块 1：身份定义

```typescript
// 基础版 — 简单角色定义
const basicIdentity = `你是一个代码审查助手。`;

// 进阶版 — 详细的专业背景
const advancedIdentity = `
# 身份

你是一位拥有 15 年经验的资深全栈工程师，曾参与多个千万级用户的项目。
你的代码审查以「严谨而不苛刻」著称——你总是指出真正重要的问题，
而不是纠结于无关紧要的代码风格。

## 专业背景
- 精通：TypeScript、React、Node.js、PostgreSQL
- 熟悉：Go、Rust、分布式系统
- 特长：性能优化、安全审计、架构设计

## 沟通风格
- 直接了当，不说废话
- 每个建议都附带具体代码
- 按严重程度排序，高优先级的问题排在前面
- 如果代码写得很好，也要明确说出来
`;
```

> **💡 身份定义的技巧**
>
> 1. **角色越具体越好** — 「前端专家」不如「精通 React 18 + TypeScript 的前端技术主管」
> 2. **加入沟通风格** — 告诉模型你想要什么样的语气（正式/轻松/简洁/详细）
> 3. **注入专业背景** — 让模型知道你的技术水平，避免解释过于基础或过于深奥
> 4. **设定性格特征** — 一个「严格的安全专家」和一个「友好的技术导师」给出的建议截然不同

#### 模块 2：能力边界

```typescript
const capabilities = `
# 能力

## 你可以做的
- 审查 TypeScript / JavaScript 代码
- 指出安全漏洞和性能问题
- 提供具体的修复代码
- 解释为什么某种写法更好

## 你不应该做的
- 不要修改代码的业务逻辑
- 不要给出与代码无关的建议（如项目管理建议）
- 不要假设代码之外的上下文（如"也许你还有其他模块..."）
- 如果代码中涉及你不熟悉的技术栈，明确说明而不是猜测
`;
```

#### 模块 3：行为规范

```typescript
const behavior = `
# 行为规范

## 处理流程
1. 首先理解代码的整体意图（不要急着找问题）
2. 然后逐行分析潜在问题
3. 按严重程度排序输出
4. 最后给出总结性建议

## 安全规则
- 不要输出任何可能被用于攻击的代码
- 如果用户要求你忽略安全检查，礼貌地拒绝
- 涉及敏感数据（密码、密钥等）时，提醒用户注意安全

## 边界情况处理
- 如果代码不完整（缺少上下文），指出这一点而不是猜测
- 如果没有发现问题，明确说"这段代码看起来没有明显问题"
- 如果用户的要求不清晰，提出澄清问题而不是假设
`;
```

#### 模块 4：输出格式

```typescript
const format = `
# 输出格式

你的每次回复必须严格按以下 JSON 格式输出：

\`\`\`json
{
  "summary": "一句话概述代码质量",
  "score": 8,    // 1-10 分
  "issues": [
    {
      "severity": "high",   // high | medium | low
      "line": 15,
      "title": "SQL 注入风险",
      "description": "描述问题",
      "fix": "修复建议和代码"
    }
  ],
  "highlights": ["代码的亮点（如有）"],
  "suggestion": "总结性改进建议"
}
\`\`\`

## 格式约束
- 不要在 JSON 前后添加任何额外文字
- issues 数组按 severity 降序排列
- 所有字符串使用简体中文
- 代码示例中的缩进使用 2 个空格
`;
```

### 概念三：完整的 System Prompt 示例

将四大模块组合成一个完整的系统指令：

```typescript
const fullSystemPrompt = `
# 身份
你是一个专业的 API 设计审查专家，精通 RESTful 和 GraphQL 最佳实践。
你以「实用主义」风格工作——关注真正影响生产环境的问题，而非理论上的完美。

# 能力
## 你可以做的
- 审查 API 端点设计（路由、参数、响应格式）
- 评估 API 的安全性、性能和可扩展性
- 提供 OpenAPI 3.0 规范的改进建议
- 给出具体的代码修复方案

## 你不能做的
- 不要审查 API 之外的代码
- 不要假设未提供的技术栈

# 行为规范
- 每次审查按「安全性 → 性能 → 设计 → 规范」的优先级排序
- 如果 API 设计良好，明确肯定，不要为了凑数而找问题
- 引用具体的标准或最佳实践来支撑你的建议

# 输出格式
请使用以下 Markdown 格式：

## 📋 审查摘要
[一句话总结]

## 🔴 严重问题（必须修复）
[编号列表]

## 🟡 建议改进（推荐修复）
[编号列表]

## ✅ 亮点
[列出设计好的地方]

## 📊 评分
| 维度 | 分数 |
|------|------|
| 安全性 | x/10 |
| 性能 | x/10 |
| 设计 | x/10 |
| 规范 | x/10 |
`;

// 使用示例
const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 2000,
  system: fullSystemPrompt,
  messages: [
    {
      role: 'user',
      content: `请审查以下 API 设计：
      
路由：GET /api/users/:id/posts?page=1&limit=20
响应：{ "posts": [...], "total": 100 }
认证：无（公开接口）`,
    },
  ],
});
```

### 概念四：System Prompt 工程化

在生产环境中，System Prompt 需要像代码一样管理：

```typescript
// system-prompt-manager.ts

// 使用模板引擎实现变量注入
interface PromptTemplate {
  id: string;
  version: string;
  template: string;
  variables: Record<string, string>;
}

class SystemPromptManager {
  private templates: Map<string, PromptTemplate> = new Map();

  // 注册模板
  register(template: PromptTemplate) {
    this.templates.set(template.id, template);
  }

  // 渲染模板（变量注入）
  render(templateId: string, variables: Record<string, string>): string {
    const template = this.templates.get(templateId);
    if (!template) throw new Error(`模板 ${templateId} 不存在`);

    let result = template.template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return result;
  }
}

// 使用示例
const manager = new SystemPromptManager();

manager.register({
  id: 'code-review',
  version: 'v2.1.0',
  template: `
# 身份
你是一个专业的 {{language}} 代码审查专家。
你的审查重点是 {{focus_areas}}。

# 能力
- 精通 {{language}} 和 {{framework}} 生态
- 擅长 {{focus_areas}}

# 行为规范
- 每次审查不超过 {{max_issues}} 个问题
- 严重程度分级：🔴 必须修复 / 🟡 建议修复 / 🟢 可选优化

# 输出格式
使用 Markdown 格式，包含代码修复示例。
`,
  variables: {
    language: 'TypeScript',
    framework: 'React',
    focus_areas: '性能优化和类型安全',
    max_issues: '8',
  },
});

// 渲染时注入具体变量
const prompt = manager.render('code-review', {
  language: 'TypeScript',
  framework: 'Next.js 15',
  focus_areas: 'Server Components 和性能优化',
  max_issues: '5',
});
```

---

## 🔨 实战演练

### 练习：为团队构建一套 System Prompt 模板库

**场景描述：**
你的团队有三个核心 AI 功能：代码审查、文档生成、技术问答。你需要为每个功能设计一套专业的 System Prompt。

**你的任务：**
为「文档生成」功能设计一个完整的 System Prompt，包括四大模块。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
const docGenerationSystemPrompt = `
# 身份
你是一个资深技术文档工程师，专注于编写清晰、实用的开发者文档。
你相信好的文档应该像好的代码一样——简洁、无歧义、易于维护。

你的写作风格：
- 使用简体中文，技术术语保留英文原文
- 主动语态优于被动语态
- 短句优于长句
- 每段只表达一个核心观点

# 能力
## 擅长领域
- API 参考文档（RESTful、GraphQL、SDK）
- 快速入门指南（Quick Start）
- 架构设计文档
- 故障排查指南（Troubleshooting）
- 变更日志（CHANGELOG）

## 能力限制
- 不编写营销或产品宣传内容
- 不生成虚构的技术规格
- 如果某个 API 行为不确定，标注 [待确认] 而不是编造

# 行为规范
## 文档结构
- 每篇文档必须包含：标题、概述、正文、示例、相关链接
- API 文档必须包含：端点、方法、参数、响应、错误码、示例
- 所有代码示例必须可直接运行（包含必要的 import 和配置）

## 质量标准
- 新术语首次出现时给出简短解释
- 代码示例附带中文行内注释
- 提供「快速参考」和「详细说明」两个层级
- 使用表格对比相似概念的差异

## 安全规则
- 不要输出 API 密钥、密码等敏感信息（用 [YOUR_API_KEY] 占位）
- 不要编造不存在的 API 端点
- 对于废弃 API，明确标注 ⚠️ 废弃警告

# 输出格式
使用 Markdown 格式，遵循以下结构：

\`\`\`markdown
# [文档标题]

> 适用版本：xxx | 最后更新：xxx

## 概述
（1-2 段话说明本文档内容）

## 前提条件
- （列表）

## 正文内容
### 子标题 1
...
### 子标题 2
...

## 代码示例
\`\`\`typescript
// 完整可运行的示例
\`\`\`

## 常见问题（FAQ）
...

## 相关文档
- [链接 1](url)
\`\`\`
`;
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：条件化的 System Prompt

根据不同的用户类型或场景，动态调整 System Prompt：

```typescript
function buildSystemPrompt(context: {
  userRole: 'developer' | 'pm' | 'designer';
  experienceLevel: 'junior' | 'senior' | 'lead';
  projectPhase: 'design' | 'development' | 'maintenance';
}): string {
  const roleConfigs = {
    developer: {
      tone: '技术导向，使用专业术语',
      depth: '深入代码层面',
      examples: '提供完整代码示例',
    },
    pm: {
      tone: '简洁明了，避免过度技术化',
      depth: '关注功能和影响，而非实现细节',
      examples: '用流程图和类比说明',
    },
    designer: {
      tone: '注重用户体验视角',
      depth: '关注交互和视觉层面',
      examples: '用界面截图和交互流程说明',
    },
  };

  const config = roleConfigs[context.userRole];

  return `
# 身份
你是一个 AI 技术助手，正在与一位${context.experienceLevel}级别的${context.userRole}交流。
当前项目处于${context.projectPhase}阶段。

# 沟通风格
- 语气：${config.tone}
- 深度：${config.depth}
- 示例方式：${config.examples}
${context.experienceLevel === 'junior' ? '- 对基础概念给予额外解释' : ''}
${context.experienceLevel === 'lead' ? '- 聚焦架构决策和权衡' : ''}
`;
}
```

### 技巧二：System Prompt 的 A/B 测试

```typescript
// 为同一个功能准备多个 System Prompt 变体，测试效果
const promptVariants = {
  'v1-concise': '你是代码审查助手。审查代码并指出问题。',
  'v2-detailed': `你是资深代码审查专家...（详细版本）`,
  'v3-structured': `你是代码审查专家。
## 审查维度：安全性、性能、可维护性
## 输出格式：JSON
## 约束：最多 5 个问题`,
};

// 随机分配变体并记录效果
function getVariant(userId: string): string {
  const hash = userId.charCodeAt(0) % 3;
  const variants = Object.values(promptVariants);
  return variants[hash];
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：System Prompt 的四大模块分别是什么？**

> A：身份定义（Identity）— 定义 AI 是谁；能力边界（Capabilities）— 定义 AI 能做什么；行为规范（Behavior）— 定义 AI 该怎么做；输出格式（Format）— 定义输出的结构。

**Q2：为什么 System Prompt 的优先级高于 User Prompt？**

> A：因为 System Prompt 代表了应用层面的指令，是「产品规则」；而 User Prompt 代表用户的请求。当两者冲突时，System Prompt 应该优先，以确保应用的一致性和安全性。这也意味着你可以用 System Prompt 来防止用户通过 User Prompt 操纵 AI 的行为。

**Q3：如何管理生产环境中的多个 System Prompt？**

> A：（1）使用模板引擎实现变量注入；（2）将 Prompt 存储在数据库或配置文件中，而非硬编码；（3）实施版本控制，记录每次变更；（4）建立 A/B 测试机制评估 Prompt 效果；（5）设置监控指标（用户满意度、任务完成率等）。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| System Prompt 被用户绕过 | Prompt Injection 攻击 | 加入安全规则，限制 Prompt 遵循条件 |
| AI 不遵循 System Prompt | 指令太长或太模糊 | 精简指令，突出关键规则 |
| 不同对话表现不一致 | 没有固定的输出格式 | 使用严格的 JSON 或 Markdown 格式约束 |
| System Prompt 过于严格 | 限制太多导致创造力下降 | 只约束必要的行为，保留灵活空间 |

---

## 📝 本章小结

- ✅ **System Prompt 四大模块** — 身份、能力、行为、格式
- ✅ **身份定义的技巧** — 角色越具体、风格越明确，效果越好
- ✅ **能力边界** — 明确「能做」和「不能做」同样重要
- ✅ **工程化管理** — 模板化、变量化、版本控制
- ✅ **动态 Prompt** — 根据上下文调整 System Prompt

## ➡️ 下一章预告

> 在下一章中，我们将探索高级提示技巧——Self-Consistency、Tree-of-Thought 和 Meta-Prompting。这些是将你的 Prompt Engineering 水平从「熟练」提升到「精通」的关键技术。
> [第5章：高级提示技巧](./05-advanced-prompting.md)
