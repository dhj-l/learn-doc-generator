# 第4章：Reflexion 模式 — 从错误中学习

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Reflexion 的核心思想** — 自我反思驱动的改进循环
- **实现尝试→评估→反思→重试循环** — 让 Agent 从失败中学习
- **构建自我改进的 Agent** — 每次失败都是学习的机会

## 📋 前置知识

> 建议先完成：[第2章：ReAct 模式](./02-react-pattern.md)

---

## 💡 核心概念

### 概念一：什么是 Reflexion？

**生活类比：** 想象你在做一道数学题。第一次做错了，老师不是直接告诉你答案，而是引导你反思「哪里做错了」「为什么错了」「下次怎么避免」。Reflexion 就是让 Agent 也这样做。

```
传统 Agent：  尝试 → 成功/失败 → 结束
Reflexion：  尝试 → 评估 → 反思 → 重试 → 评估 → 反思 → 重试 → ... → 成功
```

#### 学术溯源：Shinn et al. 2023 的 Reflexion 框架

Reflexion 由 Shinn et al. 在 2023 年提出（论文：*Reflexion: Language Agents with Verbal Reinforcement Learning*），其核心创新是 **言语强化学习（Verbal Reinforcement Learning）**——不同于传统强化学习通过权重更新（梯度下降）来学习，Reflexion 让 Agent 通过自然语言反思来改进行为，完全不需要更新模型参数。

```
┌─────────────────────────────────────────────────────┐
│                  Reflexion 架构                       │
│                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐       │
│  │  Actor   │ → │ Evaluator│ → │  Self-   │       │
│  │  (执行)   │    │  (评估)   │    │ Reflection│       │
│  └────┬─────┘    └──────────┘    └────┬─────┘       │
│       │                                │            │
│       └────────── 经验反馈 ──────────→ │            │
│                                        ↓            │
│                                ┌──────────────┐     │
│                                │  Episodic     │     │
│                                │  Memory Buffer│     │
│                                └──────────────┘     │
└─────────────────────────────────────────────────────┘
```

**三个核心组件：**
1. **Actor（执行者）** — 标准的 ReAct Agent，负责尝试完成任务
2. **Evaluator（评估者）** — 判断 Actor 的输出是否正确（通过 LLM-as-Judge 或外部验证器）
3. **Self-Reflection（自我反思）** — 将失败经验转化为自然语言的经验教训，存入 **Episodic Memory Buffer（情景记忆缓冲区）**

**关键创新 — Verbal Reinforcement Learning：**
- 传统 RL 需要设计奖励函数、更新网络权重，计算量大且不稳定
- Reflexion 用自然语言替代数值奖励，将「成功经验」和「失败教训」编码为文本
- 在下一轮尝试时，这些文本被注入到 prompt 中，指导 Actor 避免重复错误
- 不需要任何权重更新，完全在推理时（inference-time）完成学习

#### 基准测试结果

| 基准（Benchmark） | 方法 | 得分 | 备注 |
|-------------------|------|------|------|
| HumanEval（代码生成） | GPT-4 | 67.0% pass@1 | 无反思 |
| HumanEval | GPT-4 + Reflexion | **91.0% pass@1** | +24% 绝对提升 |
| AlfWorld（具身任务） | ReAct | 57% 成功率 | 基线 |
| AlfWorld | ReAct + Reflexion | **73% 成功率** | +16% 绝对提升 |
| HotpotQA（多跳问答） | ReAct | 42.7% EM | 基线 |
| HotpotQA | ReAct + Reflexion | **51.4% EM** | +8.7% |

HumanEval 上 91% 的 pass@1 结果尤为引人注目——这意味着在 GPT-4 的基础上，仅通过添加反思机制，代码生成的首次通过率就从 67% 飙升到了 91%，几乎持平了当时人类程序员的平均表现。

### 概念二：Reflexion 执行流程

```typescript
// src/reflexion.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

interface ReflectionMemory {
  attempts: Array<{
    action: string;
    result: string;
    success: boolean;
    reflection: string;
  }>;
}

// 尝试执行任务
async function attemptTask(task: string, reflections: string[]): Promise<string> {
  const reflectionContext = reflections.length > 0
    ? `\n\n从之前的尝试中获得的经验教训:\n${reflections.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '';

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `任务：${task}${reflectionContext}

请完成任务。基于之前的经验教训来避免重复犯错。`,
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// 评估结果
async function evaluate(task: string, attempt: string): Promise<{ success: boolean; feedback: string }> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 500,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: `任务：${task}
尝试结果：${attempt}

请评估结果是否正确。输出 JSON：
{"success": true/false, "feedback": "评估反馈", "score": 1-10}`
    }],
  });

  const data = JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '{}');
  return { success: data.success || false, feedback: data.feedback || '' };
}

// 反思：从失败中学习
async function reflect(task: string, attempt: string, feedback: string): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `任务：${task}
我的尝试：${attempt}
评估反馈：${feedback}

请反思：
1. 哪里做错了？
2. 为什么错了？
3. 下次应该怎么改进？

用一句话总结经验教训。`
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// Reflexion 主循环
async function reflexionLoop(
  task: string,
  maxAttempts: number = 5
): Promise<{ answer: string; attempts: number; reflections: string[] }> {
  const reflections: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n📝 第 ${attempt} 次尝试...`);

    // 1. 尝试
    const result = await attemptTask(task, reflections);
    console.log(`结果: ${result.substring(0, 100)}...`);

    // 2. 评估
    const { success, feedback } = await evaluate(task, result);
    console.log(`评估: ${success ? '✅ 成功' : '❌ 失败'} — ${feedback}`);

    if (success) {
      return { answer: result, attempts: attempt, reflections };
    }

    // 3. 反思
    const reflection = await reflect(task, result, feedback);
    reflections.push(reflection);
    console.log(`反思: ${reflection}`);
  }

  return { answer: '达到最大尝试次数', attempts: maxAttempts, reflections };
}
```

---

## 🔨 实战演练

### 练习：为代码审查 Agent 添加 Reflexion 能力

**场景描述：** 你的团队有一个代码生成 Agent，它根据需求描述生成代码片段。但生成结果经常有小 bug——变量名拼写错误、缺少边界检查、类型不匹配等。每次都是人工审查后发现问题再修改，效率很低。你决定引入 Reflexion 机制，让 Agent 在提交代码前先自我反思和改进。

**你的任务：** 基于本章的 `reflexionLoop` 逻辑，实现一个「代码生成 + 自我审查 + 反思修正」流水线：
1. 实现 `generateCode(task)` — 生成代码
2. 实现 `reviewCode(code)` — LLM 审查代码，返回 bug 列表
3. 实现 `fixCode(code, bugs)` — 根据审查意见修复代码
4. 使用 Reflexion 循环，最多尝试 3 次，直到审查通过

<details>
<summary>🧑‍💻 参考答案（先自己写）</summary>

```typescript
async function generateAndFixCode(task: string): Promise<string> {
  const reflections: string[] = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    // 1. 生成代码
    const code = await generateCode(task, reflections);
    console.log(`📝 第 ${attempt} 次生成完成`);

    // 2. 自我审查
    const { passed, bugs } = await reviewCode(code);
    if (passed) {
      console.log('✅ 审查通过！');
      return code;
    }

    console.log(`❌ 发现 ${bugs.length} 个问题:`, bugs);

    // 3. 反思总结
    const reflection = await reflectOnBugs(task, code, bugs);
    reflections.push(reflection);
    console.log(`💡 反思: ${reflection}`);
  }

  throw new Error('代码生成未通过审查');
}

async function reviewCode(code: string): Promise<{ passed: boolean; bugs: string[] }> {
  // LLM 审查代码（简化实现）
  const bugs: string[] = [];
  if (!code.includes('try')) bugs.push('缺少错误处理');
  if (!code.includes('return')) bugs.push('缺少返回值');
  return { passed: bugs.length === 0, bugs };
}

async function reflectOnBugs(
  task: string, code: string, bugs: string[]
): Promise<string> {
  // LLM 总结教训（简化）
  return `确保代码包含错误处理、边界检查和正确的返回值类型。`;
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧 1：用评分卡替代二元评估，让反思更精准

```typescript
interface EvaluationCard {
  criteria: string;
  score: 1 | 2 | 3 | 4 | 5;
  evidence: string;
  suggestion: string;
}

// 多维度评分让 Agent 知道具体哪里不足
const evaluationCard: EvaluationCard[] = [
  {
    criteria: '正确性',
    score: 3,
    evidence: '主逻辑正确，但缺少空值检查',
    suggestion: '在函数入口添加参数校验',
  },
  // 反思 prompt 中注入评分卡，引导更精确的改进
];
```

### 技巧 2：限制情景记忆条目数，防止上下文膨胀

```typescript
class EpisodicMemory {
  private maxEntries: number;
  private entries: string[];

  constructor(maxEntries: number = 5) {
    this.maxEntries = maxEntries;
    this.entries = [];
  }

  add(reflection: string) {
    this.entries.push(reflection);
    // 只保留最近的 N 条经验（滑动窗口）
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  getSummary(): string {
    return this.entries
      .map((e, i) => `${i + 1}. ${e}`)
      .join('\n');
  }
}
```

### 技巧 3：混合评估策略 — LLM 评估 + 确定性检查

```typescript
async function hybridEvaluate(task: string, result: string) {
  // 确定性检查（规则引擎）
  const ruleCheck = {
    isEmpty: result.length === 0,
    hasError: result.includes('Error') || result.includes('undefined'),
    isValidJSON: tryParseJSON(result),
  };

  // 如果规则检查失败，直接返回
  if (ruleCheck.isEmpty || ruleCheck.hasError) {
    return { success: false, feedback: '规则检查失败' };
  }

  // 再让 LLM 做语义层面的评估
  const llmEval = await evaluate(task, result);
  return llmEval;
}
```

---

## 🧠 知识检查点

<details>
<summary>Q1: Reflexion 中的「言语强化学习（Verbal RL）」与传统强化学习有什么本质区别？</summary>

> A：传统 RL 通过数值奖励函数和梯度下降更新模型权重来学习，计算量大、需要大量训练样本且容易不稳定。Verbal RL 完全在推理时进行——它将「成功/失败」经验编码为自然语言文本，注入到下一轮尝试的 prompt 中。不需要任何权重更新，也不需要训练数据，只通过 prompt 工程就能让 Agent「学习」。缺点是每次推理都需要带上历史经验，增加了上下文长度。
</details>

<details>
<summary>Q2: Reflexion 在 HumanEval 上实现了 91% pass@1，为什么能提升这么多？</summary>

> A：HumanEval 是代码生成基准，要求模型根据文档字符串生成正确的函数。Reflexion 的提升主要来自：① **自我检查** — Agent 可以运行生成的代码并检查输出；② **针对性修复** — 根据错误信息（编译错误、测试失败）精准定位问题；③ **经验积累** — 每次失败的修复经验被提炼为自然语言教训，指导后续尝试避免同类错误。这一过程模拟了人类程序员的「写代码 → 运行测试 → 看错误 → 修复」循环。
</details>

<details>
<summary>Q3: 如果不加限制地让 Reflexion 循环下去，会有什么风险？</summary>

> A：主要风险有三：① **成本爆炸** — 每次迭代都消耗 Token（生成 + 评估 + 反思），无限循环会迅速耗尽预算；② **上下文膨胀** — 每次反思都往 prompt 中添加新内容，超出上下文窗口后会丢失早期信息；③ **过度拟合反思** — Agent 可能变得「过度谨慎」，因为之前的失败教训而在简单任务上过度复杂化。解决方案包括设置最大迭代次数、限制情景记忆条目数、以及在反思中区分「关键教训」和「噪音」。
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| Evaluator 给出错误评估，把正确结果判为失败 | LLM-as-Judge 的不一致性，评估 prompt 不够清晰 | 为 Evaluator 提供明确的评分标准（checklist），如「答案必须包含具体数字」「代码必须无语法错误」；考虑用确定性测试替代 LLM 评估 |
| 反思内容越来越长但质量越来越差 | 每次反思都追加到 prompt，Agent 被大量历史教训「淹没」 | 限制情景记忆缓冲区的大小（如最多 3-5 条），或用「摘要-反思」策略——先让 LLM 总结已有经验，再追加新反思 |
| Reflexion 循环在「失败→反思→重试」中反复无法突破 | 反思太过笼统（如「下次要更仔细」），缺乏具体改进方向 | 在反思 prompt 中引导 Agent 给出精确的、可执行的经验教训，如「在调用 parseInt 之前必须先检查字符串是否为空」而非「注意输入验证」 |

---

## 📝 本章小结

## ➡️ 下一章预告

> [第5章：Agent Loop 设计](./05-agent-loop.md) — 构建健壮的 Agent 循环控制系统。
