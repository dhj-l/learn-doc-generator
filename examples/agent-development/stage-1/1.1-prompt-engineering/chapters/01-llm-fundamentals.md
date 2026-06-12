# 第1章：LLM 基本原理 — 知道你在跟谁对话

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 Transformer 架构的核心思想** — 知道大语言模型为什么能「理解」你的文字
- **掌握 Token 的概念** — 理解模型如何将文字切成碎片来处理，以及这对你的 Prompt 设计有什么影响
- **明白上下文窗口的意义** — 知道为什么 Prompt 有长度限制，以及如何合理利用有限的上下文
- **操控 Temperature 等参数** — 通过调整模型参数来控制输出的随机性和创造力

## 📋 前置知识

> 本章是整个学习路径的起点，不需要任何前置知识。
> 只要你知道 ChatGPT 或 Claude 这类工具的存在，就足够了。

---

## 💡 核心概念

### 概念一：大语言模型到底是什么？

想象你有一个**读过全世界所有书籍的超级学霸**。你给他一段话的开头，他会根据「读过的内容」续写出看起来最合理的后续。

但这里有一个关键的区别：**这个学霸不是在「理解」文字，而是在做「下一个词的预测」**。

这就是大语言模型（Large Language Model, LLM）的本质——一个极其强大的**文字接龙机器**。

```
你输入：今天天气真
模型预测：好 → 的概率 60%
          不错 → 的概率 25%
          糟糕 → 的概率 10%
          ...（其他词）

模型选择「好」，继续预测：
今天天气真好 → ， → 我们 → 去 → 公园 → 散步 → 吧
```

> **💡 为什么这很重要？**
>
> 理解了这个本质，你就不会对 LLM 产生不切实际的期望。它不会「思考」，不会「理解」，它只是在做**极其精密的概率预测**。这也意味着：
> 1. 你给的提示越清晰，模型的预测就越准确
> 2. 模型可能会「一本正经地胡说八道」（生成看起来合理但实际错误的内容）
> 3. 模型的回答是基于训练数据中的模式，而非真正的推理

### 概念二：Transformer — 驱动一切的引擎

2017 年，Google 的一篇论文《Attention Is All You Need》提出了 Transformer 架构，从此改变了整个 AI 领域。你不需要深入理解它的数学原理，但需要知道它的**核心创新**：

#### 自注意力机制（Self-Attention）

想象你在读这句话：

> 「小明把**他的**书放在桌子上，然后**他**去食堂吃饭了」

你一眼就知道「**他**」指的是「小明」，对吧？自注意力机制就是让模型也能做到这一点——在处理每个词的时候，能够「回头看」前面的所有词，找出哪些词是重要的、相关的。

```
处理「他」这个词时，模型的注意力分布：

  小明    把    他的    书    放在    桌子上    然后    他 ← 当前处理
  ↑                                         ↑
  高注意力（0.45）                        中注意力（0.30）
  
  其他词的注意力较低
```

> **💡 这对你的 Prompt 意味着什么？**
>
> 因为模型使用自注意力机制，所以：
> 1. **放在前面和后面的内容权重不同** — 通常，放在 Prompt 开头和结尾的内容会获得更多的注意力
> 2. **重复强调可以增强权重** — 如果某个要求很重要，可以在不同位置重申
> 3. **结构化的 Prompt 更容易被正确解析** — 清晰的标记（如 XML 标签、Markdown 标题）帮助模型快速定位关键信息

#### Transformer 的工作流程

```
输入文本
    ↓
[1] Tokenizer（分词器）— 将文本拆分为 Token
    ↓
[2] Embedding（嵌入层）— 将每个 Token 转为数字向量
    ↓
[3] Transformer 层（×N）— 通过自注意力机制处理所有 Token 的关系
    ↓
[4] 输出层 — 预测下一个 Token 的概率分布
    ↓
[5] 采样策略 — 根据概率选择实际输出的 Token
    ↓
输出文本（逐 Token 生成）
```

### 概念三：Token — 模型的「最小理解单位」

LLM 不会像人类一样一个字一个字地读文字，它把文本切成一个个 **Token**（词元）来处理。

#### 什么是 Token？

你可以把 Token 想象成**乐高积木**。就像乐高积木是拼装模型的最小单元，Token 是 LLM 处理文本的最小单元。

```
英文 Token 示例：
"Hello, world!" → ["Hello", ",", " world", "!"]  → 4 个 Token

中文 Token 示例：
"你好世界" → ["你", "好", "世", "界"]  → 4 个 Token
"人工智能" → ["人工", "智能"]  → 2 个 Token

代码 Token 示例：
function hello() { return "hi"; }
→ ["function", " hello", "()", " {", " return", " \"hi\"", ";", " }"]  → 8 个 Token
```

#### Token 化的一般规律

| 内容类型 | 大约比例 | 说明 |
|----------|----------|------|
| 英文 | 1 Token ≈ 4 个字符 | 1 个英文单词约 1-3 个 Token |
| 中文 | 1 个汉字 ≈ 1-2 个 Token | 常见词可能合并为 1 个 Token |
| 代码 | 因语言而异 | 关键字通常各占 1 个 Token |
| 数字 | 每位数字约 1 个 Token | 大数字可能被拆分 |

> **💡 为什么 Token 知识很重要？**
>
> 1. **成本计算** — API 按 Token 计费。输入和输出的 Token 数直接决定费用
> 2. **上下文限制** — 模型有最大 Token 限制（上下文窗口）。你的 Prompt + 模型的回答不能超过这个限制
> 3. **Prompt 精简** — 理解 Token 机制可以帮你写出更精简、更经济的 Prompt
> 4. **中文处理** — 中文通常比英文消耗更多 Token，需要在设计 Prompt 时考虑这一点

#### Token 计算实战

```typescript
// 使用 Anthropic SDK 查看 Token 使用量
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 100,
  messages: [
    { role: 'user', content: '请用一句话解释什么是量子计算' }
  ],
});

// 查看 Token 使用情况
console.log('输入 Token:', response.usage.input_tokens);   // 例如：25
console.log('输出 Token:', response.usage.output_tokens);   // 例如：48
console.log('总 Token:', response.usage.input_tokens + response.usage.output_tokens);
```

```
预期输出：
输入 Token: 25
输出 Token: 48
总 Token: 73
```

### 概念四：上下文窗口 — 模型的「工作记忆」

你可以把上下文窗口想象成一张**桌子的面积**。桌子上能放多少文件，你就能同时参考多少信息。上下文窗口就是模型能同时「看到」的 Token 数量。

#### 主流模型的上下文窗口（2025-2026）

| 模型 | 上下文窗口 | 大约相当于 |
|------|-----------|-----------|
| Claude 3.5 Haiku | 200K Token | ~15 万字中文 |
| Claude Sonnet 4 | 200K Token | ~15 万字中文 |
| Claude Opus 4 | 200K Token | ~15 万字中文 |
| GPT-4o | 128K Token | ~10 万字中文 |
| Gemini 2.0 | 1M-2M Token | ~75-150 万字中文 |

#### 上下文窗口的实际限制

虽然理论上模型可以「看到」这么多 Token，但有一个关键概念需要理解：

```
上下文窗口 = 输入（Prompt） + 输出（回答）

假设模型上下文窗口是 200K Token：
  - 如果你的 Prompt 占了 180K Token
  - 模型最多只能输出 20K Token 的回答

所以实际使用时：
  可用输出空间 = 上下文窗口 - 输入 Token 数
```

> **💡 实践建议**
>
> 1. **不要浪费上下文空间** — 只放必要的信息，删除无关内容
> 2. **重要信息放在开头或结尾** — 研究表明模型对中间内容的注意力较弱（"Lost in the Middle" 现象）
> 3. **长文档要分段处理** — 不要把整本书塞进一个 Prompt
> 4. **监控 Token 使用量** — 养成检查 `usage` 字段的习惯

### 概念五：Temperature 与采样策略 — 控制输出的「创造力」

当模型预测下一个 Token 时，它会给出所有候选 Token 的概率分布。**采样策略**决定了从这个分布中如何选择 Token。

#### Temperature — 最重要的参数

你可以把 Temperature 想象成一个**「创造力旋钮」**：

```
Temperature = 0（最低）
  → 模型总是选择概率最高的 Token
  → 输出最确定、最可预测
  → 适合：代码生成、数据提取、分类任务

Temperature = 0.5（中等）
  → 模型倾向于选择概率较高的 Token，但有小概率选其他
  → 输出相对稳定，略有变化
  → 适合：技术文档、邮件撰写

Temperature = 1.0（默认）
  → 模型按原始概率选择
  → 输出平衡，兼顾准确性和多样性
  → 适合：通用对话

Temperature = 1.5-2.0（最高）
  → 模型大幅提高低概率 Token 的选中率
  → 输出非常随机、有创意但可能不连贯
  → 适合：创意写作、头脑风暴
```

```typescript
// Temperature 对比实验
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// 低 Temperature — 确定性强
const preciseResponse = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 200,
  temperature: 0,        // ← 确定性输出
  messages: [
    { role: 'user', content: '用一句话定义 RESTful API' }
  ],
});

// 高 Temperature — 创造力强
const creativeResponse = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 200,
  temperature: 1.5,      // ← 创造性输出
  messages: [
    { role: 'user', content: '用一句话定义 RESTful API' }
  ],
});

console.log('低 Temperature:', preciseResponse.content[0].text);
console.log('高 Temperature:', creativeResponse.content[0].text);
```

```
预期输出（多次运行对比）：

低 Temperature（几乎不变）:
"RESTful API 是一种基于 HTTP 协议、使用标准方法（GET/POST/PUT/DELETE）对资源进行操作的接口设计风格。"

高 Temperature（每次不同）:
"RESTful API 就像是互联网世界的自助餐厅菜单——你用标准化的点菜方式告诉服务器你要什么资源，然后它用统一的格式端上来。"
```

#### Top-P（核采样）— 另一个控制参数

```
Top-P = 0.1
  → 只从累积概率最高的 10% 的 Token 中选择
  → 非常保守，输出高度确定

Top-P = 0.9（常用值）
  → 从累积概率 90% 的 Token 中选择
  → 平衡多样性和质量

Top-P = 1.0
  → 从所有候选 Token 中选择
  → 最多样化
```

> **💡 Temperature 和 Top-P 的选择指南**
>
> | 场景 | Temperature | Top-P | 说明 |
> |------|-------------|-------|------|
> | 代码生成 | 0-0.2 | 0.95 | 需要确定性，但保留小概率的创新 |
> | 数据提取/分类 | 0 | 1.0 | 完全确定性输出 |
> | 技术文档 | 0.3-0.5 | 0.9 | 相对稳定，允许适度变化 |
> | 对话聊天 | 0.7-1.0 | 0.9 | 自然流畅 |
> | 创意写作 | 1.0-1.5 | 0.95-1.0 | 最大创造力 |
>
> **注意**：通常只调一个参数就好。同时调 Temperature 和 Top-P 可能产生不可预测的效果。

### 概念六：Stop Sequences 和 max_tokens — 控制输出长度

```typescript
// 使用 stop_sequences 控制输出终止
const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 1000,
  stop_sequences: ['\n\n---'],  // 遇到这个字符串就停止
  messages: [
    { role: 'user', content: '列出 3 个 JavaScript 的数组方法，每个方法用 --- 分隔' }
  ],
});

// 使用 max_tokens 限制输出长度
const shortResponse = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 50,    // 最多输出 50 个 Token
  messages: [
    { role: 'user', content: '写一首关于编程的诗' }
  ],
});

console.log('是否因 stop_sequence 停止:', response.stop_reason === 'stop_sequence');
console.log('是否因 max_tokens 截断:', shortResponse.stop_reason === 'max_tokens');
```

---

## 🔨 实战演练

### 练习 1：Temperature 参数对比实验

**场景描述：**
你正在开发一个代码评审助手，需要让模型审查一段代码。你需要测试不同 Temperature 设置对审查结果的影响。

**你的任务：**
1. 用 `temperature: 0` 发送一个代码审查请求
2. 用 `temperature: 1.0` 发送相同的请求
3. 对比两次输出的差异
4. 确定哪种设置更适合代码审查场景

**参考代码：**

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const codeSnippet = `
function fetchData(url) {
  const response = fetch(url);
  const data = response.json();
  return data;
}
`;

async function reviewCode(temperature: number, label: string) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 500,
    temperature,
    messages: [
      {
        role: 'user',
        content: `请审查以下代码，指出问题并给出改进建议：\n\`\`\`javascript\n${codeSnippet}\n\`\`\``
      }
    ],
  });

  console.log(`\n=== ${label} (temperature=${temperature}) ===`);
  console.log(response.content[0].text);
  console.log(`Token 使用: ${response.usage.input_tokens} 输入 + ${response.usage.output_tokens} 输出`);
}

// 运行对比实验
await reviewCode(0, '精确模式');
await reviewCode(1.0, '平衡模式');
```

**预期输出：**
```
=== 精确模式 (temperature=0) ===
代码存在以下问题：
1. `fetch` 函数返回的是 Promise，需要使用 `await` 关键字等待结果
2. 缺少错误处理（try-catch）
3. 函数应该声明为 `async`
...

Token 使用: 85 输入 + 156 输出

=== 平衡模式 (temperature=1.0) ===
这段代码有几个值得注意的地方哦！首先，`fetch` 是异步的...
（内容类似但措辞更灵活）
```

</details>

### 练习 2：Token 使用量优化

**场景描述：**
你发现你的 AI 客服机器人每次对话消耗太多 Token，成本超预算。你需要优化 Prompt，在不影响回答质量的前提下减少 Token 使用。

**你的任务：**
1. 写一个冗长的 Prompt（包含大量冗余信息）
2. 精简这个 Prompt，保留核心指令
3. 对比 Token 使用量

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// ❌ 冗长版本
const verbosePrompt = `
你好！我需要你扮演一个非常专业的客户服务代表。
你是一个有多年经验的客服专家，擅长处理各种客户问题。
你的性格非常友好、耐心、专业。
你总是能给客户提供准确、有用的帮助。
现在有一个客户来咨询问题，请你根据以下信息回答：
客户的会员等级是金卡会员。
请注意你的回答要礼貌、专业、有条理。
如果问题超出你的能力范围，请建议客户联系人工客服。
你还需要注意不要泄露公司内部信息。
回答要简洁明了，不要太长。

客户问题：我的订单 #12345 还没发货，已经等了3天了。
`;

// ✅ 精简版本
const concisePrompt = `
角色：客服代表
规则：简洁专业、不泄露内部信息、超出能力转人工
客户：金卡会员

客户问：我的订单 #12345 还没发货，已经等了3天了。
`;

async function measureTokens(prompt: string, label: string) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });
  console.log(`${label}: ${response.usage.input_tokens} 输入 Token`);
  return response;
}

await measureTokens(verbosePrompt, '冗长版');
await measureTokens(concisePrompt, '精简版');
```

**预期输出：**
```
冗长版: 230 输入 Token
精简版: 58 输入 Token
节省: 75% 的输入 Token（回答质量基本不变）
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：利用「预填充」引导输出格式

你可以在 `assistant` 消息的开头预填充一些内容，引导模型沿着你期望的方向输出：

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20241022',
  max_tokens: 500,
  messages: [
    { role: 'user', content: '分析这段代码的性能问题' },
    // 预填充 assistant 的回复开头，引导输出格式
    { role: 'assistant', content: '## 性能分析报告\n\n### 问题 1：' }
  ],
});

// 模型会接着你的预填充继续输出，保持你定义的格式
```

### 技巧二：理解模型的「知识截止日期」

每个模型都有一个训练数据的截止日期。对于截止日期之后发生的事情，模型不会知道：

```
Claude 的知识截止日期：2025 年初
  → 知道 2024 年发布的技术和事件
  → 不知道 2025 年中后期的新发布
  → 解决方案：在 Prompt 中提供最新的背景信息
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么 LLM 可能会生成看似合理但实际错误的内容（幻觉）？**

> A：因为 LLM 的本质是「下一个 Token 的概率预测」，它不是在查询知识数据库，而是在根据训练数据中的模式生成最「像样」的文本。当模型对某个话题的训练数据不足或模式不够清晰时，它可能会生成符合语法和逻辑结构、但事实不正确的内容。

**Q2：为什么 Token 的概念对 Prompt 设计很重要？**

> A：因为 Token 决定了三个关键因素：（1）成本——API 按 Token 计费；（2）上下文空间——Token 数量直接占用有限的上下文窗口；（3）处理效率——更多的 Token 意味着更长的处理时间和更高的延迟。理解 Token 可以帮你写出更精简高效的 Prompt。

**Q3：Temperature 设为 0 就一定每次输出相同的结果吗？**

> A：不完全对。Temperature=0 时模型总是选择概率最高的 Token，理论上输出应该相同。但有些 API 系统在底层可能存在浮点精度差异或并行计算的不确定性，导致极小概率出现差异。此外，如果模型更新了，结果也会变化。所以 Temperature=0 可以极大提高一致性，但不能 100% 保证。

**Q4：如果我的 Prompt 内容很长，应该怎么处理上下文窗口的限制？**

> A：有几种策略：（1）精简 Prompt，只保留核心信息；（2）将长内容分批处理；（3）使用摘要压缩技术，先对长内容做摘要再放入 Prompt；（4）利用 RAG（检索增强生成）技术，只检索最相关的内容片段；（5）选择上下文窗口更大的模型。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 输出被截断 | `max_tokens` 设置太小 | 增大 `max_tokens` 值，或检查 `stop_reason` |
| 回答不稳定、每次不同 | Temperature 太高 | 降低 Temperature，任务导向场景用 0-0.3 |
| Prompt 太长报错 | 超过上下文窗口限制 | 精简 Prompt 或分段处理 |
| 中文回答里夹杂英文 | Prompt 中混用了英文术语 | 在 Prompt 中明确要求「全部使用中文回答」 |
| 模型回答「我不知道这个信息」 | 问题涉及训练截止日期之后的内容 | 在 Prompt 中提供最新背景信息 |

---

## 📝 本章小结

- ✅ **LLM 是文字接龙机器** — 理解「下一个 Token 预测」的本质，才能正确使用它
- ✅ **Token 是模型的最小单位** — 影响成本、上下文空间和处理效率
- ✅ **上下文窗口有限** — 输入+输出的 Token 总量不能超过窗口大小
- ✅ **Temperature 控制创造力** — 任务型用低值，创意型用高值
- ✅ **自注意力机制影响 Prompt 设计** — 重要信息放在开头和结尾

## ➡️ 下一章预告

> 在下一章中，我们将学习 Prompt 设计的六大原则，掌握让模型「听懂你的话」的核心方法论。你会发现，一个好的 Prompt 和一个糟糕的 Prompt 之间的差距，可能比换一个更强的模型带来的提升还要大。
> [第2章：Prompt 设计原则](./02-prompt-principles.md)
