# 第3章：工具设计最佳实践 — 让工具好用又可靠

> 预计学习时间：80-100 分钟

## 🎯 本章目标

掌握工具设计的粒度、参数和错误反馈最佳实践。

## 📋 前置知识

> 建议先完成：[第2章：Claude Tool Use](./02-claude-tool-use.md)

---

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

---

## 🔨 实战演练

**场景描述：**
你正在设计一个电商平台的 AI 客服工具集。平台需要处理商品搜索、订单查询、退换货申请和物流跟踪等功能。

**你的任务：**
1. 设计 3 个电商客服工具，注意命名规范、参数约束和描述清晰度
2. 确保 `search_products` 和 `query_order` 的描述中明确区分使用场景
3. 为 `return_request` 工具的参数添加 `enum` 约束（退换货原因）

<details>
<summary>🧑‍💻 先自己实现，再展开看参考答案</summary>

```typescript
const ecommerceTools: Anthropic.Tool[] = [
  {
    name: 'product__search',
    description: `搜索商品信息。适用于：
- 用户查询商品详情、价格、库存
- 按关键词、品类、价格范围搜索
- 不适用于查询订单状态（请用 order__query）`,
    input_schema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '搜索关键词' },
        category: { type: 'string', description: '商品分类' },
        min_price: { type: 'number', description: '最低价格' },
        max_price: { type: 'number', description: '最高价格' },
        sort_by: { type: 'string', enum: ['price_asc', 'price_desc', 'sales', 'rating'], default: 'sales' },
      },
    },
  },
  {
    name: 'order__query',
    description: `查询订单状态和详情。适用于：
- 用户查询订单配送进度、物流信息
- 按订单号或用户 ID 查询
- 不适用于搜索商品（请用 product__search）`,
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: '订单号' },
        user_id: { type: 'string', description: '用户 ID' },
      },
    },
  },
  {
    name: 'order__return_request',
    description: '提交退换货申请。在用户明确要求退换货时使用。',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: '订单号' },
        reason: {
          type: 'string',
          enum: ['商品质量问题', '与描述不符', '尺寸/尺码问题', '发错商品', '不想要了', '其他'],
          description: '退换货原因',
        },
        description: { type: 'string', description: '详细说明' },
      },
      required: ['order_id', 'reason'],
    },
  },
];
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：为工具命名使用一致的前缀
当工具数量增多时，使用命名空间前缀可以帮助 LLM 更快理解和分类：

```typescript
// ❌ 无命名规范
const tools = [
  { name: 'get_user', ... },
  { name: 'search_products', ... },
  { name: 'create_invoice', ... },
];

// ✅ 使用 domain 前缀
const tools = [
  { name: 'user__get_profile', description: '用户模块：获取用户个人信息' },
  { name: 'user__search', description: '用户模块：搜索用户' },
  { name: 'product__search', description: '商品模块：搜索商品' },
  { name: 'order__create', description: '订单模块：创建新订单' },
  { name: 'order__get_status', description: '订单模块：查询订单状态' },
];

// 前缀帮助 LLM 理解工具所属领域，实现更好的分组
```

### 技巧二：使用 `oneOf` 和 `anyOf` 描述复杂参数
当参数可能有多种结构时，使用 JSON Schema 的组合关键字让 LLM 理解不同情况：

```typescript
{
  name: 'send_notification',
  description: '发送通知。支持站内信、邮件、短信三种方式。',
  input_schema: {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        enum: ['in_app', 'email', 'sms'],
        description: '通知渠道',
      },
      recipients: {
        type: 'array',
        items: { type: 'string' },
        description: '接收人列表',
      },
      // 使用 description 区分不同渠道的必填参数
      template_id: { type: 'string', description: '站内信/邮件模板 ID' },
      subject: { type: 'string', description: '邮件主题（仅邮件渠道需要）' },
      content: { type: 'string', description: '短信内容（仅短信渠道需要）' },
    },
    required: ['channel', 'recipients'],
  },
}
```

### 技巧三：为相似工具提供「对比描述」
当有多个功能相似的工具时，在描述中明确区分它们的使用场景：

```typescript
// 两个相似但不同的工具
{
  name: 'search_users',
  description: `搜索注册用户。适用于：
- 管理员查找用户账号
- 按姓名/邮箱/手机号搜索
- 不适用于查询员工信息（请用 query_employee）`,
},
{
  name: 'query_employee',
  description: `查询企业内部员工信息。适用于：
- 查看员工部门、职位、工号
- 与 search_users 的区别：search_users 查的是平台注册用户
- query_employee 查的是公司内部员工档案`,
},
```

---

## 🧠 知识检查点

### Q1: 工具设计的「单一职责原则」是什么？为什么重要？

<details>
<summary>点击展开答案</summary>

单一职责原则指一个工具只做一件事，并且做好。例如 `search_users` 只负责搜索用户，而不是同时处理用户搜索和订单查询。这很重要是因为：1) LLM 能更准确地判断何时调用；2) 参数设计更简洁清晰；3) 工具执行逻辑更容易维护和测试。

</details>

### Q2: 什么情况下应该使用 `enum` 约束参数？

<details>
<summary>点击展开答案</summary>

当参数的可选值有明确且有限的集合时，就应该使用 `enum`。例如：排序方向（`asc`/`desc`）、语言（`zh`/`en`/`ja`）、状态（`pending`/`approved`/`rejected`）等。`enum` 可以防止 LLM 传入非法值，提高工具调用的准确性和可靠性。

</details>

### Q3: 如何设计工具描述才能让 LLM 最佳地理解工具用途？

<details>
<summary>点击展开答案</summary>

一个好的工具描述应包含三个层次：1) **功能说明**——工具做什么；2) **适用场景**——什么情况下应该使用这个工具，可以给出具体例子；3) **不适用场景**——什么情况下不应该使用这个工具，并指出应该用哪个替代工具。这种「正面+反面」的描述方式能最大程度减少 LLM 的误调用。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 工具名称过于通用（如 `query`、`search`） | 多个工具名称相似，LLM 容易混淆选错 | 使用有意义的命名空间前缀，如 `user_search`、`product_search`，并在描述中明确区分适用场景 |
| 参数缺少 `enum` 约束导致 LLM 传入非法值 | LLM 可能生成预期之外的值，尤其是在枚举字段上 | 对所有选项有限的参数使用 `enum` 约束，并给出合理的 `default` 值作为备选 |
| 描述中只写「做什么」不写「什么时候用」 | LLM 缺乏判断依据，容易在错误场景调用该工具 | 描述格式：「工具功能 + 适用场景 + 不适用场景 + 示例」，让 LLM 清楚何时该用、何时不该用 |

---

## 📝 本章小结

- ✅ **粒度** — 单一职责，不粗不细
- ✅ **描述** — 说明什么时候用、什么时候不用
- ✅ **参数** — 使用 enum 约束、default 减少必填
- ✅ **错误** — 区分原因，建议下一步

## ➡️ 下一章预告

> [第4章：常见工具类型](./04-common-tool-types.md)
