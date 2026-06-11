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

---

## 📝 本章小结

- ✅ **Reflexion 核心** — 尝试→评估→反思→重试的循环
- ✅ **反思记忆** — 将每次反思积累的经验用于改进后续尝试
- ✅ **自我评估** — 让 Agent 自己判断结果是否正确

## ➡️ 下一章预告

> [第5章：Agent Loop 设计](./05-agent-loop.md) — 构建健壮的 Agent 循环控制系统。
