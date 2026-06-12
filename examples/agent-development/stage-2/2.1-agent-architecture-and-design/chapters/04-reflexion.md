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

**预期输出：**
```
📝 第 1 次尝试...
结果: 计算得到结果为 42...
评估: ❌ 失败 — 答案不正确，计算逻辑有误
反思: 错误原因：忽略了运算符优先级，应先乘除后加减

📝 第 2 次尝试...
结果: 计算得到结果为 38...
评估: ✅ 成功 — 答案正确

最终答案: 38（经过 2 次尝试，1 次反思改进）
```


---

## 🔨 实战演练

### 练习：实现一个「代码 Debug」Reflexion Agent

<details>
<summary>🧑‍💻 先自己动手实现，再展开参考答案</summary>

**场景描述：**
你有一个需求：给出一段有 Bug 的代码，Agent 需要找出 Bug 并修复。如果修复不正确，Agent 需要反思错误原因并再次尝试。

**你的任务：**
1. 基于本章的 Reflexion 循环，创建一个 CodeDebugAgent
2. Agent 需要实现：分析代码 → 提出修复 → 运行测试 → 如果失败则反思重试
3. 用下面这段有 Bug 的代码测试你的 Agent：
```typescript
function sumArray(arr: number[]): number {
  let sum = 0;
  for (let i = 0; i <= arr.length; i++) {  // 这里有 Bug
    sum += arr[i];
  }
  return sum;
}
```

**参考实现思路：**
```typescript
class CodeDebugAgent {
  async fix(buggyCode: string): Promise<string> {
    const reflections: string[] = [];

    for (let attempt = 1; attempt <= 3; attempt++) {
      // 1. 尝试修复
      const fix = await this.proposeFix(buggyCode, reflections);

      // 2. 运行测试验证
      const testResult = await this.runTest(fix);

      // 3. 如果测试通过则返回
      if (testResult.passed) return fix;

      // 4. 否则反思
      const reflection = await this.reflect(buggyCode, fix, testResult);
      reflections.push(reflection);
    }

    throw new Error('无法修复 Bug');
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：结构化反思模板

好的反思不是笼统的「我错了」，而是结构化地分析错误原因：

```typescript
interface StructuredReflection {
  rootCause: string;           // 根本原因
  misconception: string;       // 误解了什么
  correction: string;          // 正确的理解
  futureStrategy: string;      // 未来如何避免
  applicableScenarios: string[]; // 同样策略适用的场景
}

const REFLECTION_PROMPT = `
请按以下结构反思失败原因：
1. 根本原因：为什么这个做法是错误的？
2. 误解：我之前的推理哪里出了问题？
3. 修正：正确的做法是什么？
4. 策略：下次遇到类似问题应该怎么做？
`;
```

### 技巧二：设置「反思截止线」

并非所有失败都值得无限反思。设定截止条件防止过度反思：

```typescript
interface ReflectionConfig {
  maxReflections: number;      // 最大反思次数
  improvementThreshold: number; // 改进幅度阈值（低于此值停止）
  diminishingReturns: number;   // 连续改进递减次数
}

class BoundedReflexion {
  private previousScores: number[] = [];

  shouldContinue(score: number): boolean {
    this.previousScores.push(score);

    // 如果改进幅度低于阈值，停止反思
    if (this.previousScores.length >= 2) {
      const improvement = this.previousScores.at(-1)! - this.previousScores.at(-2)!;
      if (improvement < 0.1) return false;
    }
    return true;
  }
}
```

### 技巧三：将反思结果持久化

反思经验不应只在单次任务中有效，应该存入长期记忆库：

```typescript
interface ReflectionRecord {
  taskType: string;             // 任务类型标签
  reflection: string;           // 反思内容
  successRate: number;          // 应用后的成功率
  lastApplied: Date;            // 最后使用时间
}

// 跨会话复用反思经验
async function loadRelevantReflections(
  taskType: string,
  memoryStore: VectorDB
): Promise<string[]> {
  return memoryStore.similaritySearch(taskType, 3);
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Reflexion 和简单的「失败重试」有什么区别？**

> A：简单的失败重试只是重新执行相同的操作，没有从失败中学习。Reflexion 则是在每次失败后主动分析失败原因（反思），并将反思结果用于指导下一次尝试，从而避免重复同样的错误。反思让重试变得「更聪明」。

**Q2：反思记忆会如何影响后续的尝试？**

> A：每次反思的结果会作为上下文注入到下一次尝试的 Prompt 中，例如「从上次尝试中学到：不要使用 XXX 方法，因为 YYY」。这相当于让 Agent 带着「经验教训」重新开始，而不是从零开始。

**Q3：Reflexion 的主要局限性是什么？**

> A：（1）每次反思都要额外调用 LLM，增加了 Token 消耗；（2）反思质量取决于 LLM 的自我评估能力，如果 LLM 不能正确识别错误原因，反而可能学到错误经验；（3）连续失败可能导致反思「钻牛角尖」，需要设置反思上限。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 反思过于笼统 | LLM 输出「我要更小心」这类无实际指导意义的反思 | 使用结构化反思模板，强制分析 rootCause 和具体策略 |
| 反复犯同一个错误 | 反思没有真正被应用到下一次尝试中 | 将反思结果显式注入下一次的 Prompt，并让 LLM 确认已理解 |
| 无限反思循环 | Agent 不断反思但整体表现没有提升 | 设置最大反思次数和「改进幅度阈值」，没有进步就停止 |

---

## 📝 本章小结

- ✅ **Reflexion 核心** — 尝试→评估→反思→重试的循环
- ✅ **反思记忆** — 将每次反思积累的经验用于改进后续尝试
- ✅ **自我评估** — 让 Agent 自己判断结果是否正确

## ➡️ 下一章预告

> [第5章：Agent Loop 设计](./05-agent-loop.md) — 构建健壮的 Agent 循环控制系统。
