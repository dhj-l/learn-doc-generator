# 第3章：核心提示技巧 — 四大武器从入门到精通

> 预计学习时间：90-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **灵活运用 Zero-shot Prompting** — 不给任何示例就能让模型完成任务
- **掌握 Few-shot Prompting** — 用示例教会模型你期望的输出模式
- **精通 Chain-of-Thought（思维链）** — 让模型展示推理过程，提高复杂任务的准确率
- **理解 ReAct 模式** — 让模型交替进行「推理」和「行动」，为后续的 Agent 开发奠定基础

## 📋 前置知识

> 建议先完成：
> - [第1章：LLM 基本原理](./01-llm-fundamentals.md) — 了解 Token 和模型参数
> - [第2章：Prompt 设计原则](./02-prompt-principles.md) — 掌握四要素框架

---

## 💡 核心概念

### 概念一：Zero-shot Prompting — 不给示例，直接上

**生活类比：** 就像你对一个经验丰富的厨师说「给我做个宫保鸡丁」，你不需要告诉他宫保鸡丁长什么样——他已经知道该怎么做。

Zero-shot 是最基础的 Prompt 方式——**不给任何示例，直接描述任务**。

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// Zero-shot：直接描述任务，不给示例
const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 500,
  messages: [
    {
      role: 'user',
      content: '将以下英文评论翻译成中文，并判断其情感倾向（正面/负面/中性）：\n\n"The product quality is amazing but the shipping was painfully slow."',
    },
  ],
});

console.log(response.content[0].text);
```

```
预期输出：
翻译：产品质量非常棒，但物流速度慢得令人痛苦。
情感倾向：中性
原因：评论中包含正面评价（产品质量好）和负面评价（物流慢），两者相互抵消。
```

#### Zero-shot 适用场景

| 场景 | 适用性 | 说明 |
|------|--------|------|
| 简单翻译 | ✅ 非常适用 | 模型天然擅长翻译 |
| 文本分类 | ✅ 适用 | 如果分类标签明确 |
| 文本摘要 | ✅ 适用 | 模型理解「总结」的概念 |
| 复杂推理 | ⚠️ 可能不够 | 需要 Chain-of-Thought |
| 特殊格式输出 | ❌ 不适用 | 模型不知道你要什么格式 |
| 领域特定任务 | ❌ 不适用 | 需要 Few-shot 示范 |

### 概念二：Few-shot Prompting — 用示例教模型

**生活类比：** 如果你让厨师做一道他没见过的地方特色菜，你可能需要给他看几张照片，说「就像这样」——这就是 Few-shot。

Few-shot 通过在 Prompt 中提供几个**输入-输出示例**，教会模型你期望的行为模式。

#### Zero-shot vs Few-shot 对比

```typescript
// ❌ Zero-shot — 模型可能输出各种格式
const zeroShot = `分类以下评论的情感：
"${review}"`;

// ✅ Few-shot — 模型学会了精确的输出格式
const fewShot = `分类以下评论的情感，只输出标签。

评论："这家餐厅的菜太好吃了！"
标签：正面

评论："等了半小时才上菜，而且菜是凉的。"
标签：负面

评论："味道还行，价格适中。"
标签：中性

评论："${review}"
标签：`;
```

#### Few-shot 的最佳实践

```typescript
// 最佳实践：示例选择策略

const bestPractices = `
## 示例数量
- 简单分类任务：3-5 个示例
- 复杂格式任务：5-8 个示例
- 通常不需要超过 10 个示例

## 示例多样性
✅ 覆盖所有类别（正面、负面、中性各一个）
✅ 包含边界情况（模糊的、混合情感的）
✅ 示例难度递进

❌ 不要只给同一类别的示例
❌ 不要所有示例都一样简单
❌ 不要示例之间格式不一致
`;

// 实战：高质量 Few-shot 示例
const sentimentFewShot = `你是一个精准的情感分析引擎。根据示例，对评论进行分类。

<examples>
<example>
  <review>这个手机壳质量太差了，用了一天就裂了。</review>
  <sentiment>负面</sentiment>
  <confidence>0.95</confidence>
  <reason>明确的质量投诉</reason>
</example>

<example>
  <review>包装精美，物流快，质量也不错，值得购买。</review>
  <sentiment>正面</sentiment>
  <confidence>0.92</confidence>
  <reason>多维度正面评价，使用了正面词汇链</reason>
</example>

<example>
  <review>东西收到了，还没用，先给个好评吧。</review>
  <sentiment>中性</sentiment>
  <confidence>0.75</confidence>
  <reason>未使用体验，好评是默认行为，非真实情感</reason>
</example>

<example>
  <review>说实话这个价格买到这个品质，我觉得很值，但客服态度真的需要改进。</review>
  <sentiment>中性</sentiment>
  <confidence>0.68</confidence>
  <reason>正面（性价比）+ 负面（客服），相互抵消为中性</reason>
</example>
</examples>

<review>${review}</review>`;
```

#### Few-shot 在实际 API 中的使用

```typescript
// 使用 Messages API 实现 Few-shot
// 关键：示例放在 user/assistant 消息对中

const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 200,
  messages: [
    // 示例 1 — 正面
    { role: 'user', content: '分析代码质量：\nfunction add(a,b){return a+b}' },
    { role: 'assistant', content: '{"quality": "良好", "score": 7, "issues": []}' },
    // 示例 2 — 负面
    { role: 'user', content: '分析代码质量：\nfunction f(x){var a=x;var b=a+1;return b*2+3}' },
    { role: 'assistant', content: '{"quality": "较差", "score": 3, "issues": ["变量命名不清晰", "缺少类型注释", "单一字母变量名"]}' },
    // 实际请求
    { role: 'user', content: '分析代码质量：\nconst calc=(n)=>{let r=n*2;if(r>10){r=r-5}return r}' },
  ],
});

console.log(response.content[0].text);
// 输出：{"quality": "中等", "score": 5, "issues": ["箭头函数返回值不明确", "变量命名过于简短"]}
```

### 概念三：Chain-of-Thought（思维链）— 让模型「展示推理过程」

**生活类比：** 想象老师在批改数学试卷。如果学生只写答案「42」，老师不知道他的思路对不对。但如果学生写了完整的解题步骤，老师就能判断每一步是否正确。Chain-of-Thought 就是要求 AI 也写出「解题步骤」。

#### 标准 CoT：「让我们一步一步想」

```typescript
// ❌ 没有 CoT — 直接给答案，可能出错
const noCoT = `问题：一个商店有 23 个苹果，卖掉了一些后剩下 8 个，
又进了 15 个，最后有多少个苹果？
请直接给出答案。`;
// 模型可能回答：28（错误，跳过了中间计算）

// ✅ 使用 CoT — 让模型展示推理过程
const withCoT = `问题：一个商店有 23 个苹果，卖掉了一些后剩下 8 个，
又进了 15 个，最后有多少个苹果？

请一步一步思考：
1. 首先，计算卖掉了多少苹果
2. 然后，确认剩余数量
3. 最后，加上新进货的数量
4. 给出最终答案`;

// 预期输出：
// 1. 初始有 23 个苹果，卖掉后剩 8 个，所以卖掉了 23 - 8 = 15 个
// 2. 剩余 8 个苹果
// 3. 又进了 15 个，所以 8 + 15 = 23 个
// 4. 最终答案：23 个苹果
```

#### CoT 的变体

```typescript
// 变体 1：Zero-shot CoT — 加一句魔法咒语
const zeroShotCoT = `
问题：...
请一步一步思考（Think step by step）。
`;

// 变体 2：Few-shot CoT — 给带推理过程的示例
const fewShotCoT = `
问题：如果一个项目的工期是 30 天，团队有 5 人，
每个人每天能完成 2 个任务点，项目总共有多少个任务点？

推理过程：
- 每人每天完成 2 个任务点
- 5 人每天完成 5 × 2 = 10 个任务点
- 30 天共完成 10 × 30 = 300 个任务点
答案：300 个任务点

问题：${question}

推理过程：
`;

// 变体 3：结构化 CoT — 用标签引导推理
const structuredCoT = `
请分析以下系统设计问题，使用如下思考框架：

<thinking>
1. 问题理解：（用自己的话复述问题）
2. 关键约束：（列出所有限制条件）
3. 可选方案：（列出 2-3 种方案）
4. 方案对比：（优缺点分析）
5. 最终选择：（选择最佳方案并说明理由）
</thinking>

<answer>
（最终结论，不超过 3 句话）
</answer>

问题：${designProblem}
`;
```

#### CoT 在代码调试中的应用

```typescript
const debugCoT = `
你是一个高级调试专家。请使用以下推理框架分析 Bug：

<bug_report>
标题：用户列表页面加载后偶尔显示空白
复现步骤：
1. 登录系统
2. 点击「用户管理」菜单
3. 页面有时显示空白，刷新后恢复正常
环境：Chrome 120, React 18, 生产环境
</bug_report>

<thinking>
步骤 1 — 信息整理：
- 关键词：「偶尔」「空白」「刷新后恢复」
- 这说明数据获取有时成功有时失败

步骤 2 — 可能原因分析：
a) 竞态条件（Race Condition）— 组件卸载后还在更新状态
b) 接口超时 — 网络不稳定导致请求失败
c) 权限 Token 过期 — 需要刷新后重新获取
d) 数据格式不一致 — 后端偶尔返回空数据

步骤 3 — 排除与聚焦：
- 「刷新后恢复」排除了权限问题（刷新不会续期 Token）
- 「偶尔」暗示不是确定性 Bug，偏向竞态条件或超时
- 最可能是：竞态条件（组件快速切换时前一个请求还在进行）

步骤 4 — 验证方案：
- 检查 useEffect 的 cleanup 函数是否取消了请求
- 检查是否有 AbortController
- 添加请求状态日志确认

步骤 5 — 修复建议：
- 使用 AbortController 取消过期请求
- 添加 isMounted 标志位（或 useAbortController hook）
- 添加 loading 和 error 状态处理
</thinking>

<answer>
最可能是竞态条件：组件切换时前一个请求未取消就尝试更新状态。
修复：在 useEffect 的 cleanup 中使用 AbortController 取消请求。
</answer>

现在请你也用这个框架分析以下 Bug：
${bugDescription}
`;
```

### 概念四：ReAct — 推理 + 行动的交替循环

**生活类比：** 想象一个侦探在破案。他不是坐在办公室里空想，而是：
1. **思考**（Reasoning）：「根据现场线索，嫌疑人可能是 A」
2. **行动**（Acting）：「让我去调查 A 的不在场证明」
3. **观察**（Observing）：「A 的不在场证明不成立」
4. **再思考**：「A 的嫌疑增大了，但我还需要更多证据」
5. **再行动**：「让我检查监控录像」

这就是 ReAct 模式 —— **Re**asoning + **Act**ing 的交替循环。

#### ReAct 的基本结构

```typescript
// ReAct Prompt 模板
const reactPrompt = `
你是一个问题解决助手。面对问题时，你需要交替进行思考和行动。

你可以执行以下行动：
- search(query) — 搜索信息
- calculate(expression) — 进行数学计算
- lookup(term) — 查找术语定义
- finish(answer) — 输出最终答案

请按以下格式进行：

Question: 用户的问题

Thought 1: 我的分析和推理...
Action 1: search("搜索内容") 或 calculate("表达式") 或 finish("答案")
Observation 1: 行动的结果...

Thought 2: 根据观察结果的进一步推理...
Action 2: ...
...

直到得出最终答案。

Question: 北京到上海的高铁大约需要多长时间？如果早上 8 点出发，中午 12 点前能到吗？
`;
```

```
预期输出：
Thought 1: 我需要了解北京到上海的高铁时长。这是一条常见的高铁路线。
Action 1: search("北京到上海高铁时长")
Observation 1: 北京到上海的高铁（G字头列车）大约需要 4.5-6 小时，最快的约 4 小时 18 分。

Thought 2: 如果早上 8 点出发，加上最快 4 小时 18 分，到达时间约 12:18。
Action 2: calculate("8:00 + 4:18")
Observation 2: 12:18

Thought 3: 12:18 超过了中午 12 点。即使用最快的车次（4 小时 18 分），也无法在 12 点前到达。
Action 3: finish("不能。即使乘坐最快的高铁（约 4 小时 18 分），早上 8 点出发也要 12:18 才能到达，无法在中午 12 点前到达。建议选择 7:30 或更早的车次。")
```

#### ReAct 与纯 CoT 的对比

```
纯 CoT：
  思考 → 思考 → 思考 → 答案
  （全程推理，不接触外部信息）

ReAct：
  思考 → 行动 → 观察 → 思考 → 行动 → 观察 → 答案
  （推理与行动交替，每步都可能获取新信息）
```

| 特性 | CoT | ReAct |
|------|-----|-------|
| 信息来源 | 仅靠模型内部知识 | 可通过行动获取外部信息 |
| 准确性 | 依赖训练数据 | 更准确（可以验证） |
| 可追溯性 | 只有推理过程 | 有推理+行动+观察的完整链 |
| 适用场景 | 逻辑推理、数学 | 需要查询外部信息的复杂任务 |
| 与 Agent 的关系 | 理论基础 | Agent 的核心执行模式 |

> **💡 为什么 ReAct 对 Agent 开发至关重要？**
>
> ReAct 是几乎所有现代 AI Agent 的核心执行模式。当你在后面学习 Agent 架构时，你会发现 ReAct Agent 是最基本也最重要的 Agent 类型。理解 ReAct，就是理解 Agent 的「心跳」。

---

## 🔨 实战演练

### 练习 1：构建一个 CoT 驱动的代码审查器

**场景描述：**
你需要构建一个代码审查器，它不仅能发现问题，还能**展示发现问题的推理过程**。

**你的任务：**
设计一个使用 CoT 的代码审查 Prompt，让模型按照「理解代码 → 分析风险 → 评估影响 → 给出建议」的步骤输出。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const codeToReview = `
async function getUserProfile(userId: string) {
  const cacheKey = \`user:\${userId}\`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  const user = await db.query(\`SELECT * FROM users WHERE id = '\${userId}'\`);
  const profile = user.rows[0];
  
  await redis.set(cacheKey, JSON.stringify(profile), 'EX', 3600);
  return profile;
}
`;

const cotCodeReviewPrompt = `
你是一个资深安全审计工程师。请使用思维链方法审查以下代码。

<code>
${codeToReview}
</code>

请按照以下步骤进行审查：

<thinking>
## 步骤 1：理解代码意图
（用自己的话描述这段代码在做什么）

## 步骤 2：逐行安全分析
（逐行检查，识别每行的潜在问题）

## 步骤 3：攻击路径推演
（站在攻击者角度，如何利用这些漏洞）

## 步骤 4：影响评估
（每个漏洞的严重程度和影响范围）

## 步骤 5：修复方案
（提供完整的修复代码）
</thinking>

<report>
## 审查报告摘要
- 发现漏洞数：x
- 最高严重程度：xxx

## 漏洞详情
（按严重程度排序）

## 修复后的代码
（完整代码）
</report>
`;

const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 2000,
  messages: [
    { role: 'user', content: cotCodeReviewPrompt },
  ],
});

console.log(response.content[0].text);
```

**预期输出（关键部分）：**
```
<thinking>
## 步骤 1：理解代码意图
这段代码实现了用户资料的缓存查询：先查 Redis 缓存，命中则返回；
未命中则查询数据库，写入缓存后返回。

## 步骤 2：逐行安全分析
第 5 行：`db.query(\`SELECT * FROM users WHERE id = '\${userId}'\`)`
⚠️ 发现 SQL 注入！userId 直接拼接进 SQL 查询字符串，攻击者可以注入恶意 SQL。

## 步骤 3：攻击路径推演
攻击者可以传入 userId = "' OR '1'='1"，使 SQL 变为：
SELECT * FROM users WHERE id = '' OR '1'='1'
这会返回所有用户的敏感数据！
...
</thinking>
```

</details>

### 练习 2：实现一个 ReAct 模式的任务规划器

**场景描述：**
构建一个使用 ReAct 模式的任务规划器，能够将一个复杂任务分解为可执行的步骤，并根据执行结果动态调整计划。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// ReAct 任务规划器
class TaskPlanner {
  private client: Anthropic;
  private tools: Record<string, (input: string) => string>;

  constructor(client: Anthropic) {
    this.client = client;
    this.tools = {
      // 模拟工具：查询天气
      'check_weather': (city: string) => {
        const weather: Record<string, string> = {
          '北京': '晴，25°C，适合户外活动',
          '上海': '小雨，18°C，建议室内活动',
        };
        return weather[city] || '未知城市';
      },
      // 模拟工具：查询可用场地
      'check_venues': (type: string) => {
        const venues: Record<string, string> = {
          '户外': '朝阳公园（可用）、奥森公园（已满）',
          '室内': '国贸会议室A（可用）、中关村活动中心（可用）',
        };
        return venues[type] || '无可用场地';
      },
    };
  }

  async plan(task: string): Promise<string> {
    const systemPrompt = `
你是一个任务规划助手，使用 ReAct 模式工作。

你可以使用的工具：
- check_weather(city) — 查询天气
- check_venues(type) — 查询可用场地

请按以下格式逐步推理和行动：

Thought: [你的推理]
Action: [工具名(参数)]
PAUSE

我会提供 Observation，你继续下一步推理，直到给出最终方案。

格式示例：
Thought: 我需要先了解天气情况
Action: check_weather("北京")
PAUSE

当所有信息收集完毕后，输出：
Thought: 综合所有信息...
Action: finish("最终方案：...")
`;

    const messages: Array<{role: 'user' | 'assistant', content: string}> = [
      { role: 'user', content: `请规划以下任务：${task}` },
    ];

    // ReAct 循环
    let maxSteps = 10;
    while (maxSteps-- > 0) {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-5-20241022',
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      });

      const text = response.content[0].text;
      messages.push({ role: 'assistant', content: text });

      // 检查是否结束
      if (text.includes('finish(')) break;

      // 解析 Action 并执行
      const actionMatch = text.match(/Action:\s*(\w+)\("([^"]+)"\)/);
      if (actionMatch) {
        const [, toolName, input] = actionMatch;
        const tool = this.tools[toolName];
        const result = tool ? tool(input) : `工具 ${toolName} 不存在`;
        messages.push({ role: 'user', content: `Observation: ${result}` });
      }
    }

    return messages.map(m => m.content).join('\n\n');
  }
}

// 使用示例
const planner = new TaskPlanner(client);
const result = await planner.plan(
  '组织一场 20 人的团建活动，地点在北京，需要考虑天气和场地'
);
console.log(result);
```

**预期输出（关键部分）：**
```
Thought: 我需要先了解北京的天气情况来决定是户外还是室内活动
Action: check_weather("北京")
PAUSE

Observation: 晴，25°C，适合户外活动

Thought: 天气很好，适合户外活动。让我查询户外场地的可用情况
Action: check_venues("户外")
PAUSE

Observation: 朝阳公园（可用）、奥森公园（已满）

Thought: 综合信息：天气晴朗 25°C，朝阳公园可用，20 人规模适合。
方案：在朝阳公园组织户外团建活动。
Action: finish("最终方案：下周六在朝阳公园组织 20 人户外团建...")
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：自洽性检验（Self-Consistency）

对于需要高准确率的任务，可以多次运行 CoT，然后取**多数票**：

```typescript
// Self-Consistency：多次运行，取多数结果
async function selfConsistentAnswer(question: string, runs: number = 5) {
  const answers: string[] = [];

  for (let i = 0; i < runs; i++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 500,
      temperature: 0.7, // 有一定随机性，让推理路径多样化
      messages: [
        {
          role: 'user',
          content: `${question}\n\n请一步一步推理，最终答案用 [答案: xxx] 标记。`
        }
      ],
    });

    const match = response.content[0].text.match(/\[答案:\s*(.+?)\]/);
    if (match) answers.push(match[1]);
  }

  // 找到出现次数最多的答案
  const counts = answers.reduce((acc, ans) => {
    acc[ans] = (acc[ans] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const consensus = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)[0];

  return {
    answer: consensus[0],
    confidence: (consensus[1] / runs * 100).toFixed(0) + '%',
    allAnswers: answers,
  };
}

// 使用
const result = await selfConsistentAnswer(
  '一个水池有两个进水管和一个出水管。进水管 A 每小时注水 3 吨，进水管 B 每小时注水 5 吨，出水管 C 每小时排水 2 吨。水池容量 20 吨，从空池开始，多久能注满？'
);
console.log(result);
// { answer: '4小时', confidence: '100%', allAnswers: ['4小时', '4小时', '4小时', '4小时', '4小时'] }
```

### 技巧二：Few-shot 示例的动态选择

不要总是使用固定的示例——根据用户输入**动态选择最相关的示例**：

```typescript
// 动态 Few-shot 选择
interface Example {
  input: string;
  output: string;
  category: string;
}

const examplePool: Example[] = [
  { input: '这个产品太棒了', output: '正面', category: '产品质量' },
  { input: '服务态度很差', output: '负面', category: '服务质量' },
  { input: '价格还可以', output: '中性', category: '价格' },
  // ... 更多示例
];

function selectRelevantExamples(
  userInput: string,
  pool: Example[],
  count: number = 3
): Example[] {
  // 简单策略：基于关键词匹配选择最相关的示例
  // 生产环境中可以使用向量相似度检索
  return pool
    .map(ex => ({
      example: ex,
      relevance: calculateRelevance(userInput, ex.input),
    }))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, count)
    .map(item => item.example);
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Zero-shot、Few-shot 和 CoT 分别适用于什么场景？**

> A：Zero-shot 适用于模型已经熟悉的简单任务（翻译、摘要等）。Few-shot 适用于需要特定格式输出或模型不熟悉领域的任务。CoT 适用于需要逻辑推理、数学计算、多步骤分析的复杂任务。

**Q2：为什么 CoT 能提高复杂推理任务的准确率？**

> A：因为 CoT 让模型将复杂问题分解为多个简单步骤，每个步骤的错误率远低于直接一步到位。就像学生做数学题，写步骤比直接口算更不容易出错。此外，步骤化的推理为模型提供了「工作记忆」——前面步骤的输出成为后续步骤的输入。

**Q3：ReAct 模式的核心创新是什么？**

> A：ReAct 的核心创新是将推理（Reasoning）和行动（Acting）交织在一起，让模型在推理过程中可以获取外部信息。这突破了纯 CoT 只能依赖模型内部知识的限制，让模型能够与外部世界交互。这也是 ReAct 成为 Agent 核心执行模式的原因。

**Q4：Few-shot 示例的最佳数量是多少？**

> A：一般 3-5 个就足够了。研究表明，对于大多数任务，5 个高质量示例的边际收益递减明显。更多示例会占用宝贵的上下文空间，增加成本和延迟。关键是示例的质量、多样性和覆盖度，而不是数量。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| CoT 推理过程正确但最终答案错误 | 推理步骤和结论之间没有正确连接 | 添加显式的结论推导步骤 |
| Few-shot 格式不稳定 | 示例之间的格式不一致 | 严格统一所有示例的格式 |
| ReAct 陷入无限循环 | 模型反复执行相同的行动 | 添加最大步骤限制和重复检测 |
| Few-shot 示例产生误导 | 示例数量太少或偏向某一类 | 增加示例多样性，覆盖各类情况 |

---

## 📝 本章小结

- ✅ **Zero-shot** — 最简洁，适用于模型擅长的简单任务
- ✅ **Few-shot** — 用示例教会模型特定行为，适用于格式化和分类任务
- ✅ **Chain-of-Thought** — 让模型展示推理过程，大幅提高复杂任务准确率
- ✅ **ReAct** — 推理+行动交替循环，Agent 的核心执行模式
- ✅ **Self-Consistency** — 多次运行取共识，提高高风险任务的可靠性

## ➡️ 下一章预告

> 在下一章中，我们将深入 System Prompt 的设计——如何通过系统级指令精确定义 AI 的角色、能力边界和行为规范。这是构建专业级 AI 应用的关键一步。
> [第4章：System Prompt 设计](./04-system-prompt-design.md)
