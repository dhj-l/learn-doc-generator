# 第3章：工具设计最佳实践 — 让工具好用又可靠

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **掌握工具粒度的设计原则** — 单一职责 vs 复合工具，找到「刚刚好」的粒度
- **编写高效的工具描述** — 让 LLM 准确理解何时使用、何时不使用
- **设计安全的参数 Schema** — 使用 enum、default、描述约束限制 LLM 的行为
- **构建智能错误反馈机制** — 区分错误类型，指导 LLM 下一步操作
- **运用生产级工具设计模式** — 来自真实系统的经验和反模式

## 📋 前置知识

- [第1章：Function Calling 基础](./01-function-calling-basics.md) — 理解工具定义的基本格式和 JSON Schema
- [第2章：Claude Tool Use](./02-claude-tool-use.md) — 了解 Claude 工具调用的完整 API 流程

## 💡 核心概念

### 概念一：工具粒度 — 单一职责 vs 复合工具

```
❌ 太粗的工具：
  manage_database(query: string) — 太模糊，LLM 不知道该传什么

❌ 太细的工具：
  get_user_by_id() / get_user_by_name() / get_user_by_email() — 太多类似工具

✅ 合适的工具：
  search_users(filters: { id?, name?, email?, limit? }) — 统一入口，参数可选
```

#### 粒度设计原则

从生产系统中总结出的工具粒度准则：

| 维度 | 太粗（反模式） | 太细（反模式） | 刚刚好 |
|------|--------------|--------------|-------|
| **功能范围** | 一个工具做所有事 | 每个细微操作一个工具 | 围绕「用户意图」聚合 |
| **参数数量** | 10+ 个参数，大部分必填 | 1-2 个参数，无扩展性 | 3-6 个参数，合理使用 optional |
| **工具数量** | 1-2 个全能工具 | 20+ 个微小工具 | 5-10 个精心设计的工具 |
| **LLM 决策** | 参数太多，LLM 容易填错 | 工具太多，LLM 选择困难 | 每个工具对应一个明确的意图 |
| **维护成本** | 修改一个工具影响所有场景 | 新增场景需要加工具 | 新增场景通常只需调整参数 |

**经验法则：** 设计工具时，问自己「用户的一个自然语言请求，是否通常对应这一个工具的调用？」如果用户说「帮我查一下张三的信息」，这个请求应该能清晰地映射到 `search_users(name: "张三")`，而不是让你猜测用哪个工具。

### 概念二：工具描述 — 好的描述是成功的一半

```typescript
// ❌ 糟糕的描述
{
  name: 'query',
  description: '查询',
  // LLM 不知道这个工具干什么
}

// ✅ 好的描述
{
  name: 'search_products',
  description: `搜索商品数据库。根据关键词、类别、价格范围搜索商品。
当用户询问商品信息、比较价格或寻找推荐商品时使用此工具。
不要用于订单查询或库存检查（那些用其他工具）。`,
  // LLM 知道：什么时候用、什么时候不用
}
```

#### 描述撰写四要素

高质量的工具描述应包含以下四个要素：

1. **做什么（功能概述）** — 工具的核心功能，用一句话说明
2. **什么时候用（触发条件）** — 列举用户的哪些请求应该触发此工具
3. **什么时候不用（排除条件）** — 明确不属于此工具范围的场景（防止误调用）
4. **参数说明（可选）** — 如果参数名称不够直观，在描述中补充说明

```
描述模板：
  [工具的功能概述]。
  当[什么场景/用户请求]时使用此工具。
  不要用于[什么场景]（那些用[其他工具名称]）。
```

> **引用参考：** Anthropic 官方指南强调：「工具描述越清晰，模型就越有可能在正确的时间选择正确的工具。在描述中包含使用该工具的示例场景。」详见 [Anthropic Tool Use Best Practices](https://docs.anthropic.com/en/docs/build-with-claude/tool-use#best-practices-for-tool-definitions)。OpenAI 也指出：「函数描述帮助模型判断何时调用函数，应清晰说明函数的功能和参数的含义。」详见 [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling#best-practices)。

### 概念三：参数设计

```typescript
// 使用 enum 约束参数值
{
  name: 'sort_results',
  input_schema: {
    type: 'object',
    properties: {
      order: {
        type: 'string',
        enum: ['asc', 'desc'],  // 限制选项，避免 LLM 乱填
        description: '排序方向',
      },
    },
  },
}

// 使用 default 值减少必填参数
{
  properties: {
    limit: {
      type: 'number',
      description: '返回结果数量',
      default: 10,  // 默认值，LLM 不必每次都填
    },
  },
}
```

#### 参数设计黄金法则

| 法则 | 说明 | 示例 |
|------|------|------|
| **enum 约束** | 能用 enum 限制的值，绝不留自由文本 | `enum: ['email', 'sms', 'push']` |
| **default 减负** | 提供合理的默认值，减少必填参数 | `default: 10` |
| **描述补充** | 参数名称不够直观时，在描述中解释 | `description: '用户ID（数字格式）'` |
| **类型精确** | 使用精确的类型约束 | `number` 而非 `string`，`integer` 而非 `number` |
| **可选优先** | 尽量让参数 optional，减少 required | 用户提供的信息越少，LLM 调用成功率越高 |

### 概念四：错误反馈 — 让 LLM 理解失败原因

```typescript
// 好的错误反馈帮助 LLM 决定下一步
function executeTool(name: string, input: any): string {
  try {
    switch (name) {
      case 'search_user':
        const user = db.findUser(input.email);
        if (!user) {
          // 告诉 LLM 为什么找不到，建议下一步
          return `未找到邮箱为 ${input.email} 的用户。
可能原因：邮箱拼写错误或用户已注销。
建议：请用户确认邮箱地址，或尝试用 name 搜索。`;
        }
        return JSON.stringify(user);

      case 'send_email':
        if (!input.to.includes('@')) {
          return `错误: 邮箱格式无效 "${input.to}"。请检查邮箱地址格式。`;
        }
        // ...发送邮件
        return `邮件已发送至 ${input.to}`;

      default:
        return `错误: 未知工具 "${name}"`;
    }
  } catch (error) {
    // 区分可重试和不可重试的错误
    if ((error as any).code === 'RATE_LIMIT') {
      return '错误: 请求频率超限，请等待 30 秒后重试。';
    }
    return `工具执行失败: ${(error as Error).message}`;
  }
}
```

#### 错误反馈设计原则

好的错误反馈就像「给 LLM 的导航」——不仅告诉它走错了路，还告诉它正确的路怎么走：

| 错误类型 | 反馈策略 | 示例 |
|---------|---------|------|
| **参数错误** | 指出具体哪个参数错，给出正确格式 | `'邮箱格式无效"abc"。正确的邮箱格式如 user@example.com'` |
| **数据未找到** | 说明找什么、在哪里找、为什么没找到 | `'未找到邮箱为 xxx 的用户。可能原因：邮箱拼写错误'` |
| **权限错误** | 明确说明缺什么权限，可能的解决途径 | `'无权执行此操作。需要 admin 角色。'` |
| **临时故障** | 标明可重试性，建议等待时间 | `'服务暂不可用，请 30 秒后重试。'` |
| **不可恢复错误** | 明确告知无法继续，建议用户操作 | `'数据库连接失败，请稍后再试或联系管理员。'` |

#### 生产系统中的错误反馈策略

在生产环境中，工具的执行结果不只是简单返回数据，而是返回一个结构化的「结果包」：

```typescript
// 生产级工具结果格式（推荐）
interface ToolResult {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;  // 是否可重试
    suggestion?: string;   // 给 LLM 的建议
  };
}

// LLM-friendly 的字符串化
function formatToolResult(result: ToolResult): string {
  if (result.success) {
    return JSON.stringify(result.data);
  }
  return `错误 [${result.error.code}]: ${result.error.message}
${result.error.recoverable ? `建议: ${result.error.suggestion || '请重试'}` : '此错误无法自动恢复，请告知用户。'}`;
}
```

## 🔨 实战演练

**场景描述：** 你正在设计一个「智能客服系统」的工具集合。系统需要处理：订单查询、退换货申请、商品推荐、物流跟踪四个核心功能。你需要设计 3-4 个工具，每个工具的参数和描述要符合最佳实践。

**你的任务：** 根据工具设计原则，定义这些工具。注意粒度控制：
- 不要设计一个 `do_everything` 的超级工具
- 也不要拆成 10+ 个微小工具
- 每个工具的描述要包含：功能概述、触发场景、排除场景

<details>
<summary>💡 参考实现</summary>

```typescript
const customerTools: Anthropic.Tool[] = [
  {
    name: 'search_orders',
    description: `查询订单信息。根据订单号、用户手机号或时间范围查询订单详情和状态。
当用户询问"我的订单怎么样了"、"查一下订单"、"看看我买了什么"时使用此工具。
不要用于退换货申请（请用 create_return 工具），也不要用于物流详情（返回物流单号后请用户自行查询）。`,
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: '订单号（如 ORD-2024-xxxx）' },
        phone: { type: 'string', description: '用户手机号' },
        limit: { type: 'number', description: '返回订单数量', default: 5 },
      },
    },
  },
  {
    name: 'create_return',
    description: `创建退换货申请。记录用户的退换货请求和原因。
当用户明确表示"要退货"、"要换货"、"申请退款"时使用此工具。
不要用于查询订单状态（请用 search_orders），也不要用于查询退换货进度（请用 search_orders 查看订单状态）。`,
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: '要退换的订单号' },
        reason: { type: 'string', description: '退换货原因' },
        type: { type: 'string', enum: ['return', 'exchange'], description: '退货或换货', default: 'return' },
      },
      required: ['order_id', 'reason'],
    },
  },
  {
    name: 'recommend_products',
    description: `根据用户需求推荐商品。基于关键词、类别和价格范围推荐合适的商品。
当用户说"推荐一下"、"有什么好介绍"、"我想买..."时使用此工具。
不要用于查询具体订单或物流信息。`,
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '商品类别（如 电子产品、服装、食品）' },
        keywords: { type: 'string', description: '关键词描述' },
        max_price: { type: 'number', description: '最高价格' },
        limit: { type: 'number', default: 5 },
      },
    },
  },
];
```

</details>

## ⚡ 进阶技巧

1. **使用 TypeScript 工具类型工厂**：为了避免工具定义中的重复和类型错误，可以创建类型安全的工具工厂：

```typescript
function defineTool<T extends Record<string, any>>(
  name: string,
  description: string,
  schema: JSONSchema<T>
): ToolDef<T> {
  return { name, description, input_schema: schema };
}

// 使用
const searchUsers = defineTool('search_users', '搜索用户', {
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
});
// TypeScript 会推断出 searchUsers.input 的类型为 { name: string }
```

2. **动态工具注入**：根据对话上下文动态调整可用工具集合，而不是每次都把所有工具传给 LLM。这可以减少 token 消耗和模型的选择负担：

```typescript
function getToolsForContext(context: 'general' | 'order' | 'after_sale'): Anthropic.Tool[] {
  const baseTools = [searchProducts, getWeather];
  if (context === 'order') return [...baseTools, searchOrders, trackLogistics];
  if (context === 'after_sale') return [...baseTools, createReturn, checkRefundStatus];
  return baseTools;
}
```

3. **工具描述的 A/B 测试**：工具描述是「提示工程」的一部分，不同措辞会影响模型的调用准确率。建议：
   - 在开发阶段为每个工具准备 2-3 个描述变体
   - 用测试集评估不同描述的工具选择准确率
   - 选择准确率最高的描述用于生产

## 🧠 知识检查点

**问题 1：** 什么是工具设计的「单一职责原则」？为什么太粗或太细的工具都有问题？

<details>
<summary>答案</summary>
单一职责原则指每个工具应该对应一个明确的用户意图。太粗的工具（如 `manage_database(query: string)`）参数模糊，LLM 不知道该传入什么，容易出错。太细的工具（如 20 个 get_XXX_by_YYY 工具）让 LLM 有太多选择，容易选错。合适的粒度是围绕用户自然语言请求设计工具——一个请求应该能清晰映射到一个工具。
</details>

**问题 2：** 工具描述应该包含哪些要素？为什么需要说明「什么时候不用」？

<details>
<summary>答案</summary>
好的工具描述应包含四要素：1) 功能概述（做什么）；2) 触发条件（什么时候用）；3) 排除条件（什么时候不用）；4) 参数说明（可选）。说明「什么时候不用」是为了**减少误调用**——当多个工具功能相似时，明确的排除条件帮助 LLM 区分选哪个，避免 LLM 总是选择第一个匹配的工具。
</details>

**问题 3：** 当工具执行失败时，为什么不应该只返回一个简单的 `"错误"` 或抛出异常？

<details>
<summary>答案</summary>
简单的错误信息不给 LLM 提供任何「上下文」来修复问题。好的错误反馈应该：1) 指出具体错误原因（如参数错了、数据不存在、权限不足）；2) 如果是可恢复的错误，给出建议（如重试、换参数）；3) 如果是不可恢复的错误，明确告知 LLM 无法自动处理，应该向用户解释。这样 LLM 才能做出有意义的后续决策。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| 工具描述中使用了否定语气但不清晰 | 如 `"不要用于查询订单"` — LLM 对否定句的理解不如肯定句准确 | 改为肯定句：`"用于搜索商品。订单查询请用 search_orders 工具。"` |
| 过于依赖 LLM 的「常识」推断工具用途 | 工具名称是 `get_data`，期待 LLM 自动理解它做什么 | 所有工具都必须有明确、完整的 `description`，不能靠名称让 LLM 猜测 |
| 工具返回原始错误（如 `500 Internal Server Error`） | 直接将后端异常堆栈抛给了 LLM | 将所有错误包装为 LLM-friendly 的格式：解释原因 + 给出建议 + 标明可恢复性 |

## 📝 本章小结

- ✅ **工具粒度** — 遵循单一职责，每个工具对应一个明确的用户意图；不粗不细，5-10 个工具为佳
- ✅ **工具描述四要素** — 功能概述 + 触发条件 + 排除条件 + 参数说明，写清楚「什么时候用，什么时候不用」
- ✅ **参数设计黄金法则** — enum 约束、default 减负、类型精确、可选优先
- ✅ **智能错误反馈** — 区分参数错误/数据未找到/权限错误/临时故障，给出可操作的建议
- ✅ **生产级策略** — 动态工具注入减少 token 消耗，结构化结果包统一错误格式，A/B 测试优化描述

## ➡️ 下一章预告

> [第4章：常见工具类型](./04-common-tool-types.md) — 掌握数据查询、操作执行、计算推理、外部服务四大类工具的设计和实现，构建完整的工具箱。
