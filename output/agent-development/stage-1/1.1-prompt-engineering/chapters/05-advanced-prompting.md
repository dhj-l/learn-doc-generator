# 第5章：高级提示技巧 — 从熟练到精通

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **掌握 Self-Consistency 技术** — 通过多次采样取共识来提高输出可靠性
- **运用 Tree-of-Thought（思维树）** — 探索多条推理路径，找到最优解
- **理解 Meta-Prompting** — 让 AI 帮你优化 Prompt
- **掌握 Prompt 链式调用（Chaining）** — 将复杂任务分解为多步 Prompt 管线

## 📋 前置知识

> 建议先完成：
> - [第3章：核心提示技巧](./03-core-techniques.md) — CoT 和 ReAct
> - [第4章：System Prompt 设计](./04-system-prompt-design.md) — 系统指令设计

---

## 💡 核心概念

### 概念一：Self-Consistency — 多数票决的智慧

**生活类比：** 你不确定一道选择题的答案，于是问了 5 个同学。3 个选 A，2 个选 B，你选 A——这就是 Self-Consistency 的核心思想。

Self-Consistency 不是一次生成答案，而是**多次独立运行**相同的 Prompt（使用不同的 Temperature），然后取出现次数最多的答案。

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

interface ConsistencyResult {
  answer: string;
  confidence: number;
  allAnswers: string[];
  reasoningPaths: string[];
}

async function selfConsistency(
  question: string,
  runs: number = 5,
  extractAnswer: (text: string) => string | null
): Promise<ConsistencyResult> {
  const answers: string[] = [];
  const reasoningPaths: string[] = [];

  // 并行运行多次
  const promises = Array.from({ length: runs }, async () => {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 1000,
      temperature: 0.7, // 有一定随机性，使推理路径多样化
      messages: [
        {
          role: 'user',
          content: `${question}\n\n请一步一步推理，最终用 [答案: xxx] 标记你的结论。`
        }
      ],
    });

    const text = response.content[0].text;
    const answer = extractAnswer(text);
    if (answer) {
      answers.push(answer);
      reasoningPaths.push(text);
    }
  });

  await Promise.all(promises);

  // 投票统计
  const counts = answers.reduce((acc, ans) => {
    acc[ans] = (acc[ans] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const [bestAnswer, count] = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)[0] || ['无法确定', 0];

  return {
    answer: bestAnswer,
    confidence: count / runs,
    allAnswers: answers,
    reasoningPaths,
  };
}

// 使用示例
const result = await selfConsistency(
  '一个算法的平均时间复杂度是 O(n log n)，如果输入规模从 1000 增加到 8000，运行时间大约增加多少倍？',
  5,
  (text) => {
    const match = text.match(/\[答案:\s*(.+?)\]/);
    return match ? match[1].trim() : null;
  }
);

console.log(`答案: ${result.answer}`);
console.log(`置信度: ${(result.confidence * 100).toFixed(0)}%`);
console.log(`所有回答: ${result.allAnswers.join(', ')}`);
```

```
预期输出：
答案: 约 24 倍（8000/1000 × log₂(8000)/log₂(1000) ≈ 8 × 3 ≈ 24）
置信度: 100%
所有回答: 约24倍, 约24倍, 约24倍, 约24倍, 约24倍
```

#### 何时使用 Self-Consistency

| 场景 | 是否使用 | 原因 |
|------|----------|------|
| 数学/逻辑推理 | ✅ 强烈推荐 | 多次推理路径可互补 |
| 代码生成 | ⚠️ 视情况 | 代码正确性难以通过投票判断 |
| 创意写作 | ❌ 不推荐 | 没有「标准答案」 |
| 分类/提取 | ✅ 推荐 | 多次运行减少偶发错误 |
| 实时对话 | ❌ 不推荐 | 延迟太高（多次调用） |

### 概念二：Tree-of-Thought（思维树）— 探索多条路径

**生活类比：** 你在迷宫里，走到一个分叉路口。你不是只选一条路走，而是同时派 3 个人分别走 3 条路，然后对比谁走到了出口——这就是 Tree-of-Thought。

与 CoT 的**单链推理**不同，ToT 在每个决策点**同时探索多条路径**，评估每条路径的质量，选择最有希望的路径继续深入。

```typescript
// Tree-of-Thought 实现
interface ThoughtNode {
  thought: string;
  evaluation: number; // 1-10 分
  children: ThoughtNode[];
}

async function treeOfThought(
  problem: string,
  branchingFactor: number = 3,
  depth: number = 3
): Promise<string> {
  // 步骤 1：在根节点生成多条初始思路
  const initialResponse = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `
问题：${problem}

请生成 ${branchingFactor} 种不同的解题思路。每种思路用以下格式：

<approach id="1">
思路名称：...
核心策略：...
预期效果：...
风险/缺点：...
</approach>
`
      }
    ],
  });

  // 步骤 2：评估每条思路的质量
  const evaluationResponse = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1000,
    messages: [
      {
        role: 'user',
        content: `
以下是针对问题的多种解题思路：

${initialResponse.content[0].text}

请为每条思路评分（1-10），并选出最有希望的一条。
评分标准：可行性、效率、创新性
输出格式：
<evaluation>
思路1：X分 — 理由...
思路2：X分 — 理由...
思路3：X分 — 理由...
最佳选择：思路X
</evaluation>
`
      }
    ],
  });

  // 步骤 3：在最佳路径上继续深入
  const deepDiveResponse = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `
问题：${problem}

之前我们评估了多种思路，最佳选择如下：
${evaluationResponse.content[0].text}

请沿着这条最佳思路深入推演，给出完整的解决方案。
如果在推演过程中遇到新问题，可以生成新的分支思路。
`
      }
    ],
  });

  return deepDiveResponse.content[0].text;
}

// 使用示例
const solution = await treeOfThought(
  '如何设计一个支持千万级用户的即时通讯系统？需要考虑消息可靠性、实时性和扩展性。',
  3, // 每层 3 条分支
  2  // 深度 2 层
);
console.log(solution);
```

#### CoT vs ToT 的对比

```
CoT（单链）：
  思路A₁ → 思路A₂ → 思路A₃ → 答案
  （一旦某步出错，后续全部偏移）

ToT（树状）：
  思路A₁ ──→ A₂ ──→ 评分 8分
  思路B₁ ──→ B₂ ──→ 评分 6分     → 选择A → 继续深入
  思路C₁ ──→ C₂ ──→ 评分 9分
                  （C 最高分，选择 C 继续）
```

### 概念三：Meta-Prompting — 让 AI 优化 Prompt

**生活类比：** 你不是一个一个地试菜谱，而是让一个大厨帮你「改进菜谱」——这就是 Meta-Prompting。你让 AI 帮你写出更好的 Prompt。

```typescript
// Meta-Prompt：让 AI 帮你优化 Prompt
const metaPrompt = `
你是一个 Prompt Engineering 专家。你的任务是帮我优化一个 Prompt。

## 当前 Prompt
\`\`\`
${currentPrompt}
\`\`\`

## 当前问题
${problemDescription}

## 优化要求
请从以下维度优化这个 Prompt：
1. 清晰度 — 是否有歧义或模糊的地方？
2. 具体性 — 是否缺少必要的细节和约束？
3. 结构 — 信息组织是否合理？
4. 示例 — 是否需要添加 Few-shot 示例？
5. 边界 — 是否明确定义了不允许的行为？

## 输出格式
1. 诊断报告：列出当前 Prompt 的 3 个最大问题
2. 优化后的 Prompt：完整的新版本
3. 改进说明：解释每个修改的原因
`;

// 使用 Meta-Prompt 优化
const optimized = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 3000,
  messages: [
    { role: 'user', content: metaPrompt },
  ],
});

console.log(optimized.content[0].text);
```

#### Meta-Prompt 的迭代优化

```typescript
// 迭代优化：Prompt 进化循环
async function iterativePromptOptimization(
  initialPrompt: string,
  testCases: string[],
  maxIterations: number = 3
): Promise<{ prompt: string; scores: number[] }> {
  let currentPrompt = initialPrompt;
  const scores: number[] = [];

  for (let i = 0; i < maxIterations; i++) {
    // 用当前 Prompt 测试
    const testResults = await Promise.all(
      testCases.map(async (testCase) => {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-5-20241022',
          max_tokens: 1000,
          messages: [
            { role: 'user', content: `${currentPrompt}\n\n${testCase}` },
          ],
        });
        return response.content[0].text;
      })
    );

    // 让 Meta-Prompt 评估并优化
    const metaResponse = await client.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: `
你是一个 Prompt 优化专家。

当前 Prompt：
\`\`\`
${currentPrompt}
\`\`\`

以下是 ${testCases.length} 个测试用例的输出：
${testResults.map((r, idx) => `测试 ${idx + 1}:\n${r}`).join('\n\n')}

请：
1. 给当前 Prompt 打分（1-10）
2. 指出最大的改进空间
3. 输出优化后的完整 Prompt
4. 只输出 JSON：{"score": X, "optimized_prompt": "..."}
`
        }
      ],
    });

    // 解析优化结果
    const result = JSON.parse(
      metaResponse.content[0].text.match(/\{[\s\S]*\}/)?.[0] || '{}'
    );
    scores.push(result.score);

    if (result.optimized_prompt) {
      currentPrompt = result.optimized_prompt;
    }

    console.log(`迭代 ${i + 1}: 得分 ${result.score}`);
  }

  return { prompt: currentPrompt, scores };
}
```

### 概念四：Prompt Chaining（链式调用）

**生活类比：** 像工厂的流水线——每个工位只做一个特定的步骤，半成品在工位之间传递，最终完成品从末端产出。

对于复杂任务，不要试图用一个巨大的 Prompt 搞定一切，而是将任务**拆解为多个步骤**，每步用独立的 Prompt 处理。

```typescript
// Prompt Chaining：文档翻译管线

// 步骤 1：提取关键术语表
async function extractGlossary(document: string): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `从以下技术文档中提取所有专业术语，格式为 JSON：

<document>
${document}
</document>

输出格式：
{
  "glossary": [
    {"term": "英文术语", "definition": "中文解释", "context": "在文档中的使用场景"}
  ]
}

只输出 JSON，不要额外文字。`
    }],
  });

  return response.content[0].text;
}

// 步骤 2：基于术语表进行翻译
async function translateDocument(
  document: string,
  glossary: string
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `将以下英文技术文档翻译成简体中文。

## 术语表（必须严格遵循）
${glossary}

## 翻译规则
- 术语首次出现时用「中文（English）」格式
- 代码块不翻译
- 保持原文的 Markdown 结构

## 待翻译文档
${document}`
    }],
  });

  return response.content[0].text;
}

// 步骤 3：审校翻译质量
async function reviewTranslation(
  original: string,
  translated: string
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `请审校以下翻译，检查是否有：
1. 术语不一致
2. 遗漏的段落
3. 语法错误
4. 不自然的表达

原文：
${original}

译文：
${translated}

输出格式：JSON
{"issues": [...], "corrected_translation": "..."}`
    }],
  });

  return response.content[0].text;
}

// 管线执行
async function translatePipeline(document: string) {
  console.log('📝 步骤 1：提取术语表...');
  const glossary = await extractGlossary(document);

  console.log('🌐 步骤 2：翻译文档...');
  const translated = await translateDocument(document, glossary);

  console.log('🔍 步骤 3：审校翻译...');
  const reviewed = await reviewTranslation(document, translated);

  return { glossary, translated, reviewed };
}
```

#### Chaining 的错误处理

```typescript
// 带重试和降级的 Prompt 管线
async function resilientChain<T>(
  steps: Array<{
    name: string;
    execute: () => Promise<T>;
    validate: (result: T) => boolean;
    fallback?: () => Promise<T>;
  }>
): Promise<T[]> {
  const results: T[] = [];

  for (const step of steps) {
    let attempts = 0;
    let success = false;

    while (attempts < 3 && !success) {
      try {
        console.log(`执行步骤：${step.name}（尝试 ${attempts + 1}）`);
        const result = await step.execute();

        if (step.validate(result)) {
          results.push(result);
          success = true;
        } else {
          console.warn(`步骤 ${step.name} 验证失败，重试...`);
          attempts++;
        }
      } catch (error) {
        console.error(`步骤 ${step.name} 执行错误:`, error);
        attempts++;
      }
    }

    if (!success && step.fallback) {
      console.log(`步骤 ${step.name} 使用降级方案`);
      results.push(await step.fallback());
    } else if (!success) {
      throw new Error(`步骤 ${step.name} 失败，无降级方案`);
    }
  }

  return results;
}
```

---

## 🔨 实战演练

### 练习：构建一个 Self-Consistency 代码生成器

**场景描述：**
你正在构建一个高可靠性的代码生成系统。对于同一个需求，生成 5 个不同的实现，然后通过对比测试选择最可靠的版本。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

interface CodeCandidate {
  code: string;
  tests: string;
  reasoning: string;
  score: number;
}

async function consistentCodeGeneration(
  requirement: string,
  candidates: number = 5
): Promise<CodeCandidate> {
  // 步骤 1：生成多个候选实现
  const candidatePromises = Array.from({ length: candidates }, async (_, i) => {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 2000,
      temperature: 0.5 + (i * 0.1), // 不同的 Temperature 创造多样性
      messages: [{
        role: 'user',
        content: `需求：${requirement}

请提供：
1. 实现代码（TypeScript，包含类型注释）
2. 3 个单元测试用例
3. 你的设计思路

用以下格式：
<code>
// 实现代码
</code>

<tests>
// 测试代码
</tests>

<reasoning>
// 设计思路
</reasoning>`
      }],
    });

    const text = response.content[0].text;
    return {
      code: text.match(/<code>([\s\S]*?)<\/code>/)?.[1]?.trim() || '',
      tests: text.match(/<tests>([\s\S]*?)<\/tests>/)?.[1]?.trim() || '',
      reasoning: text.match(/<reasoning>([\s\S]*?)<\/reasoning>/)?.[1]?.trim() || '',
      score: 0,
    };
  });

  const candidatesList = await Promise.all(candidatePromises);

  // 步骤 2：让 AI 评审每个候选方案
  const evaluationResponse = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `需求：${requirement}

以下是 ${candidatesList.length} 个候选实现，请评估每个的质量。

${candidatesList.map((c, i) => `
--- 候选方案 ${i + 1} ---
${c.code}
`).join('\n')}

评估维度（每项 1-10 分）：
1. 正确性 — 是否满足需求
2. 健壮性 — 是否处理了边界情况
3. 可读性 — 代码是否清晰易懂
4. 性能 — 是否有不必要的开销

输出 JSON：
{
  "evaluations": [
    {"index": 0, "correctness": 8, "robustness": 7, "readability": 9, "performance": 8, "total": 32},
    ...
  ],
  "best_index": 0,
  "reasoning": "选择理由"
}`
    }],
  });

  // 步骤 3：选择最佳方案
  const evalText = evaluationResponse.content[0].text;
  const evalResult = JSON.parse(evalText.match(/\{[\s\S]*\}/)?.[0] || '{}');
  const bestIndex = evalResult.best_index || 0;

  const best = candidatesList[bestIndex];
  best.score = evalResult.evaluations?.[bestIndex]?.total || 0;

  console.log(`✅ 从 ${candidates} 个候选方案中选择了方案 ${bestIndex + 1}，得分：${best.score}`);
  return best;
}

// 使用
const result = await consistentCodeGeneration(
  '实现一个 TypeScript 函数，将嵌套的 JSON 对象拍平（flatten），支持自定义分隔符'
);
console.log(result.code);
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：Prompt 缓存与复用

```typescript
// Anthropic API 支持 Prompt Caching
// 将不变的 System Prompt 和大量上下文缓存起来，减少 Token 成本

const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 1000,
  system: [
    {
      type: 'text',
      text: veryLongSystemPrompt, // 这段内容会被缓存
      cache_control: { type: 'ephemeral' }, // 启用缓存
    },
  ],
  messages: [
    { role: 'user', content: '短小的用户问题' },
  ],
});

// 第二次及后续调用可以复用缓存，大幅降低成本
```

### 技巧二：组合策略

将多种技巧组合使用，发挥协同效果：

```
Self-Consistency + CoT
  → 多次运行 CoT，取共识答案
  → 适用于数学推理、逻辑分析

ToT + Few-shot
  → 在树的每个节点使用 Few-shot 提供参考
  → 适用于创意方案设计

Prompt Chaining + Self-Consistency
  → 管线的每个步骤都用 Self-Consistency 保证可靠性
  → 适用于生产级关键流程
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Self-Consistency 和多次运行同一个 Prompt 有什么区别？**

> A：Self-Consistency 的关键在于使用**非零 Temperature**（通常 0.5-0.8），让每次运行产生不同的推理路径，然后通过投票选出共识答案。如果用 Temperature=0 多次运行，只会得到相同的结果，没有意义。

**Q2：Tree-of-Thought 在什么情况下比 CoT 更好？**

> A：当问题存在多条可行路径且需要全局比较时。例如系统架构设计、复杂算法选择、多方案评估等。CoT 适合单路径推理（数学证明、逻辑推导），ToT 适合需要探索和比较的开放性问题。

**Q3：Prompt Chaining 的最大优势是什么？**

> A：（1）每个步骤可以独立调试和优化；（2）每步的输出可以被检查和验证；（3）失败时只需重跑出错的步骤；（4）每个步骤的 Prompt 更简单、更聚焦，效果更好。

</details>

---

## 📝 本章小结

- ✅ **Self-Consistency** — 多次采样取共识，提高关键任务的可靠性
- ✅ **Tree-of-Thought** — 多路径探索，适合复杂开放性问题
- ✅ **Meta-Prompting** — 让 AI 帮你优化 Prompt，迭代进化
- ✅ **Prompt Chaining** — 管线化复杂任务，每步独立可控
- ✅ **组合策略** — 多种技巧协同使用，发挥最大效果

## ➡️ 下一章预告

> 在下一章中，我们将综合运用前面学到的所有知识，构建一个完整的 Prompt 模板管理系统——一个真实可用的生产级项目。
> [第6章：综合实战 — Prompt 模板管理系统](./06-capstone-prompt-manager.md)
