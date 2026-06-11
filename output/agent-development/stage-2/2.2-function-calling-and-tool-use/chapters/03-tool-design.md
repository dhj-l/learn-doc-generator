# 第3章：工具设计最佳实践 — 让工具好用又可靠

> 预计学习时间：80-100 分钟

## 🎯 本章目标

掌握工具设计的粒度、参数和错误反馈最佳实践。

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

## 📝 本章小结

- ✅ **粒度** — 单一职责，不粗不细
- ✅ **描述** — 说明什么时候用、什么时候不用
- ✅ **参数** — 使用 enum 约束、default 减少必填
- ✅ **错误** — 区分原因，建议下一步

## ➡️ 下一章预告

> [第4章：常见工具类型](./04-common-tool-types.md)
