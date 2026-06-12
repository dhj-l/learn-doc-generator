# 第4章：常见工具类型 — 构建工具箱

> 预计学习时间：70-90 分钟

## 🎯 本章目标

掌握四大类常见工具的设计和实现。

## 📋 前置知识

> 建议先完成：[第3章：工具设计最佳实践](./03-tool-design.md)

---

## 💡 核心概念

### 1. 数据查询工具

```typescript
const databaseQueryTool = {
  name: 'query_database',
  description: '查询数据库中的数据。支持 SQL SELECT 查询。',
  input_schema: {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description: 'SELECT SQL 查询语句（只支持 SELECT）',
      },
    },
    required: ['sql'],
  },
};

// 安全执行器（只允许 SELECT）
function executeSQL(sql: string): string {
  if (!sql.trim().toUpperCase().startsWith('SELECT')) {
    return '错误: 只支持 SELECT 查询，不允许 INSERT/UPDATE/DELETE';
  }
  // 执行查询...
  return JSON.stringify(results);
}
```

### 2. 操作执行工具

```typescript
const sendEmailTool = {
  name: 'send_email',
  description: '发送电子邮件。发送前必须确认收件人和内容。',
  input_schema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: '收件人邮箱' },
      subject: { type: 'string', description: '邮件主题' },
      body: { type: 'string', description: '邮件正文（支持 HTML）' },
    },
    required: ['to', 'subject', 'body'],
  },
};
```

### 3. 计算推理工具

```typescript
const codeExecutorTool = {
  name: 'execute_code',
  description: '执行 Python/JavaScript 代码片段。用于复杂计算、数据分析。',
  input_schema: {
    type: 'object',
    properties: {
      language: { type: 'string', enum: ['javascript', 'python'] },
      code: { type: 'string', description: '要执行的代码' },
    },
    required: ['language', 'code'],
  },
};
```

### 4. 外部服务工具

```typescript
const webSearchTool = {
  name: 'web_search',
  description: '搜索互联网获取最新信息。用于查找实时数据、新闻、文档。',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' },
      num_results: { type: 'number', description: '返回结果数量', default: 5 },
    },
    required: ['query'],
  },
};
```

---

## 🔨 实战演练

**场景描述：**
你正在为一家公司的运营团队开发一个智能运营助手。助手需要具备以下功能：查询数据库中的用户数据、发送营销邮件、调用外部天气 API 获取活动当天的天气信息。

**你的任务：**
1. 设计并实现一个安全的 `query_user_data` 工具（只读，限制行数）
2. 设计一个 `send_marketing_email` 工具，包含二次确认机制
3. 设计一个 `get_weather_forecast` 工具，集成超时处理

<details>
<summary>🧑‍💻 先自己实现，再展开看参考答案</summary>

```typescript
// 安全的数据查询工具
const queryUserDataTool = {
  name: 'query_user_data',
  description: '查询用户数据（只读）。支持按条件筛选用户。',
  input_schema: {
    type: 'object',
    properties: {
      conditions: { type: 'string', description: '查询条件，如 "age > 18 AND city = 北京"' },
      limit: { type: 'number', description: '返回行数上限', default: 50 },
    },
    required: ['conditions'],
  },
};

// 带确认的邮件发送工具
const sendMarketingEmailTool = {
  name: 'send_marketing_email',
  description: '发送营销邮件。注意：发送前会要求确认，请先展示邮件内容给用户确认。',
  input_schema: {
    type: 'object',
    properties: {
      to: { type: 'array', items: { type: 'string' }, description: '收件人邮箱列表' },
      subject: { type: 'string', description: '邮件主题' },
      content: { type: 'string', description: '邮件正文' },
    },
    required: ['to', 'subject', 'content'],
  },
};

// 带超时的天气查询工具
async function getWeatherWithTimeout(city: string, timeoutMs = 3000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://api.weather.com/v1/city/${city}`, {
      signal: controller.signal,
    });
    const data = await response.json();
    return `🌤 ${city}: ${data.temperature}°C, ${data.condition}`;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return `错误: 查询 "${city}" 天气超时 (${timeoutMs}ms)。请稍后重试。`;
    }
    return `错误: 天气查询失败 - ${(error as Error).message}`;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：数据查询工具的安全防护
当 LLM 可以直接执行 SQL 时，必须做好安全防护：

```typescript
function executeSQL(sql: string): string {
  // 1. 只允许 SELECT
  if (!/^\s*SELECT\b/i.test(sql)) {
    return '错误: 只支持 SELECT 查询';
  }

  // 2. 禁止危险操作
  const dangerous = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'EXEC', '--', '/*'];
  for (const keyword of dangerous) {
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(sql)) {
      return `错误: 禁止使用 ${keyword} 操作`;
    }
  }

  // 3. 限制查询行数
  sql = sql.replace(/;.*$/, ''); // 移除多条语句
  if (!/LIMIT\s+\d+/i.test(sql)) {
    sql += ' LIMIT 100'; // 默认限制 100 行
  }

  // 4. 执行查询
  try {
    const results = db.query(sql);
    return JSON.stringify(results);
  } catch (error) {
    return `查询执行失败: ${(error as Error).message}`;
  }
}
```

### 技巧二：操作执行工具的确认机制
对于有副作用的操作工具（发邮件、删除数据），添加二次确认机制：

```typescript
// 在工具执行器中实现确认检查
const pendingConfirmations = new Map<string, { action: string; input: any }>();

function executeSafely(name: string, input: any, confirmed = false): string {
  switch (name) {
    case 'delete_user':
      if (!confirmed) {
        const id = crypto.randomUUID();
        pendingConfirmations.set(id, { action: name, input });
        return `⚠️ 确认操作：确定要删除用户 "${input.user_id}" 吗？
此操作不可撤销。如需确认，请调用 confirm_action(id="${id}")`;
      }
      // 确认后执行删除
      return `✅ 用户 ${input.user_id} 已删除`;

    case 'confirm_action':
      const pending = pendingConfirmations.get(input.id);
      if (!pending) return '错误: 无效的确认 ID 或已过期';
      return executeSafely(pending.action, pending.input, true);
  }
}
```

### 技巧三：外部服务工具的熔断机制
当外部 API 不稳定时，使用熔断器避免雪崩：

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private readonly threshold = 3;
  private readonly resetTimeout = 30000; // 30 秒

  async call(fn: () => Promise<string>): Promise<string> {
    if (this.failures >= this.threshold) {
      if (Date.now() - this.lastFailureTime < this.resetTimeout) {
        return '错误: 该服务暂时不可用（熔断中），请稍后重试或使用其他工具';
      }
      this.failures = 0; // 半开尝试
    }

    try {
      const result = await fn();
      this.failures = 0;
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      return `服务调用失败 (${this.failures}/${this.threshold}): ${(error as Error).message}`;
    }
  }
}

const webSearchBreaker = new CircuitBreaker();
// 使用
const result = await webSearchBreaker.call(() => fetchSearchAPI(query));
```

---

## 🧠 知识检查点

### Q1: 四大工具类型分别是什么？各举一个实际例子。

<details>
<summary>点击展开答案</summary>

1. **数据查询工具** — 从数据库或 API 读取信息，如 `query_user_profile`
2. **操作执行工具** — 执行有副作用的操作，如 `send_email`、`create_order`
3. **计算推理工具** — 执行代码或数学计算，如 `execute_code`、`calculate`
4. **外部服务工具** — 调用第三方 API，如 `web_search`、`get_weather`

</details>

### Q2: 为什么数据查询工具需要做安全限制？至少说出两个。

<details>
<summary>点击展开答案</summary>

1) 防止 SQL 注入或恶意修改：LLM 可能被诱导生成 `DELETE FROM users` 等危险语句；2) 防止资源耗尽：不加 `LIMIT` 可能导致查询返回数百万行数据，消耗大量内存和带宽；3) 防止数据泄露：需要确保 LLM 只能查询授权的数据范围。

</details>

### Q3: 操作执行工具的「二次确认机制」如何实现？

<details>
<summary>点击展开答案</summary>

在执行有副作用的操作前，工具先返回一条确认信息（包含操作的详细描述和唯一确认 ID），而不是直接执行。然后提供一个 `confirm_action` 工具让用户或 LLM 传入确认 ID 来批准操作。如果用户拒绝或超时，操作不会执行。这样可以防止 LLM 误触发危险操作。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 数据查询工具暴露了修改权限 | SQL 工具没有限制只读查询，LLM 可能被诱导执行 DELETE/UPDATE | 在工具执行器中严格检查 SQL 语句，只允许 SELECT 操作，并移除多条语句和注释符 |
| 操作执行工具缺少确认步骤 | 发邮件、删除数据等操作直接执行无回滚，用户无确认机会 | 对有副作用的工具引入二次确认机制，先返回确认提示，等待用户调用确认工具后再执行 |
| 外部服务工具未处理网络超时 | API 调用可能长时间挂起，阻塞整个 Agent 循环 | 为每个外部服务调用设置超时（`AbortController` 或 `Promise.race`），并在失败时返回友好的错误信息和替代方案 |

---

## 📝 本章小结

- ✅ **数据查询** — SQL 查询、API 调用
- ✅ **操作执行** — 发邮件、创建文件、API 写入
- ✅ **计算推理** — 代码执行、数学计算
- ✅ **外部服务** — 搜索、天气、地图

## ➡️ 下一章预告

> [第5章：并行与顺序工具调用](./05-parallel-tool-calls.md)
