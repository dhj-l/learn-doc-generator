# 第4章：常见工具类型 — 构建工具箱

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **掌握四大类工具的设计和实现** — 数据查询、操作执行、计算推理、外部服务
- **理解每类工具的安全边界** — 防止 SQL 注入、代码注入、权限滥用等安全风险
- **为工具类型选择正确的执行策略** — 同步 vs 异步、缓存 vs 实时
- **根据场景组合多类工具** — 构建功能完备的 Agent 工具箱

## 📋 前置知识

- [第1章：Function Calling 基础](./01-function-calling-basics.md) — 理解工具定义格式和调用流程
- [第3章：工具设计最佳实践](./03-tool-design.md) — 理解工具描述、参数设计和错误反馈原则

## 💡 四大工具类型

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

#### 数据查询工具的设计要点

| 要点 | 说明 | 示例 |
|------|------|------|
| **只读安全** | 严格限制只读操作，防止 LLM 被诱导执行写操作 | 检查 SQL 前缀，只允许 SELECT |
| **结果截断** | 限制返回结果行数，防止 LLM 处理超长数据 | `LIMIT 100` 硬性限制 |
| **Schema 约束** | 限制可查询的表和字段，防止数据泄露 | 白名单表名列表 |
| **超时控制** | 设置查询超时，防止慢查询阻塞 | 30 秒超时 |
| **参数化替代** | 更安全的做法：不让 LLM 写 SQL，而是提供结构化参数 | 见下方「安全替代方案」 |

```typescript
// 更安全的替代方案：结构化参数而不是原始 SQL
const safeQueryTool = {
  name: 'query_products',
  description: '查询商品信息。按条件筛选商品。',
  input_schema: {
    type: 'object',
    properties: {
      category: { type: 'string', description: '商品类别' },
      min_price: { type: 'number', description: '最低价格' },
      max_price: { type: 'number', description: '最高价格' },
      sort_by: { type: 'string', enum: ['price', 'sales', 'rating'], default: 'sales' },
      limit: { type: 'number', default: 20 },
    },
  },
};
// 后端根据结构化参数构建安全的参数化查询，而不是拼接 SQL
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

#### 操作执行工具的安全设计

操作执行工具是风险最高的一类——它们对外部系统产生**副作用**。设计时需注意：

1. **确认机制**：重要操作（发邮件、删除数据、付款）应在工具返回中要求用户确认，而不是直接执行
2. **权限沙箱**：工具应该使用最小权限原则——只赋予完成特定任务所需的最小权限
3. **操作日志**：所有操作执行工具应该记录操作日志，便于审计和回滚
4. **幂等性**：尽可能设计为幂等操作（重复执行结果相同），防止 LLM 多次调用同一个操作

```typescript
// 带确认机制的操作执行
function executeTool(name: string, input: any): string {
  case 'send_email':
    // 检查是否需要确认
    if (!input.confirmed) {
      return `⚠️ 即将发送邮件：
收件人: ${input.to}
主题: ${input.subject}
内容预览: ${input.body.slice(0, 50)}...
如需发送，请再次调用此工具并设置 confirmed: true`;
    }
    // 执行发送
    return `✅ 邮件已发送至 ${input.to} (ID: ${emailId})`;
}
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

#### 代码执行工具的安全沙箱

代码执行工具是**风险最高**的工具类型——它让 LLM 在服务器上运行任意代码。必须严格沙箱化：

| 安全措施 | 说明 | 实现方式 |
|---------|------|---------|
| **超时控制** | 限制代码执行时间 | `setTimeout(5000)` 或沙箱超时 |
| **资源限制** | 限制内存和 CPU 使用 | Docker 容器或 VM 资源限制 |
| **禁止网络** | 不允许执行代码访问网络 | 沙箱内禁用网络连接 |
| **禁止文件系统** | 不允许读写宿主机文件 | 只读 /tmp 或隔离文件系统 |
| **白名单函数** | 只允许安全的内置函数 | 自定义执行上下文 |
| **输出截断** | 限制返回结果大小 | 最大 50KB 输出 |

```typescript
// 安全的代码执行器（使用隔离沙箱）
async function executeCodeSafe(language: string, code: string): Promise<string> {
  if (code.length > 2000) return '错误: 代码过长';
  
  if (language === 'javascript') {
    // 在沙箱中执行（仅允许纯计算，禁用 require/import/globalThis）
    const context = { Math, JSON, Array, Object, String, Number, Date, console: { log: (...args: any[]) => logs.push(args.join(' ')) } };
    const logs: string[] = [];
    try {
      const result = Function('"use strict"',
        ...Object.keys(context),
        `${code}
return typeof __result__ !== 'undefined' ? __result__ : logs.join('\\n');`
      )(...Object.values(context));
      return String(result).slice(0, 5000);
    } catch (e) {
      return `执行错误: ${(e as Error).message}`;
    }
  }
  return '不支持的编程语言';
}
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

#### 外部服务工具的调用策略

外部服务（API 调用）是最多样化的工具类型，设计时需考虑：

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| **缓存** | 相同参数的请求返回缓存结果 | 天气、汇率等变化慢的数据 |
| **限流** | 控制 API 调用频率，避免超限 | 第三方 API 有 rate limit |
| **降级** | 主服务不可用时使用备选 | API 宕机时返回缓存存量数据 |
| **超时** | 设置合理的超时时间 | 第三方 API 可能响应慢 |
| **认证安全** | 不要在工具参数中传递 API Key | 认证信息应在服务端注入 |

> **引用参考：** OpenAI 的 GPTs 中 Actions 工具设计指南建议：「对外部 API 的调用应包含适当的错误处理和超时机制。不要在函数参数中传递敏感凭证。」详见 [OpenAI Actions Documentation](https://platform.openai.com/docs/actions)。Anthropic 也强调：「工具应当设计为安全的——工具的实现应该校验输入，使用最小权限原则。」

## 🔨 实战演练

**场景描述：** 你需要为一个数据分析助手设计工具集合。助手需要能够：
1. 查询数据库中的销售数据（只读）
2. 执行 Python 代码进行数据分析
3. 将分析结果通过邮件发送给用户
4. 搜索网络获取市场趋势

**你的任务：** 设计这 4 个工具，并实现安全执行器。特别注意：
- 数据库查询工具要防止 SQL 注入
- 代码执行工具要有安全沙箱
- 邮件发送工具要有确认机制

<details>
<summary>💡 参考实现</summary>

```typescript
const dataAssistantTools: Anthropic.Tool[] = [
  {
    name: 'query_sales_data',
    description: '查询销售数据库中的记录。支持按日期范围、产品类别、地区筛选。只读操作。',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: '起始日期 YYYY-MM-DD' },
        end_date: { type: 'string', description: '结束日期 YYYY-MM-DD' },
        category: { type: 'string', description: '产品类别筛选' },
        region: { type: 'string', description: '地区筛选' },
        limit: { type: 'number', default: 100, description: '最大返回行数' },
      },
    },
  },
  {
    name: 'analyze_data',
    description: '执行 Python 代码进行数据分析。代码运行在沙箱环境中，无法访问网络和文件系统。',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python 分析代码' },
        data: { type: 'string', description: '输入数据（JSON 格式）' },
      },
      required: ['code', 'data'],
    },
  },
  {
    name: 'send_report',
    description: '将分析报告通过邮件发送。发送前会要求确认。',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: '收件人邮箱' },
        subject: { type: 'string', description: '邮件主题' },
        body: { type: 'string', description: '报告内容' },
        confirmed: { type: 'boolean', description: '是否已确认发送', default: false },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'search_market_trends',
    description: '搜索互联网获取市场趋势和行业新闻。',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        num_results: { type: 'number', default: 5 },
      },
      required: ['query'],
    },
  },
];
```

</details>

## ⚡ 进阶技巧

1. **为工具类型建立「安全等级」体系**：不同工具类型风险不同，可以在执行时动态调整处理方式：

```typescript
type ToolRiskLevel = 'safe' | 'caution' | 'dangerous';

const toolRiskMap: Record<string, ToolRiskLevel> = {
  search_web: 'safe',
  calculate: 'safe',
  query_database: 'caution',   // 只读但可能泄露数据
  send_email: 'caution',       // 有副作用但可逆
  execute_code: 'dangerous',   // 任意代码执行
  delete_data: 'dangerous',    // 不可逆操作
};

function shouldConfirmCall(toolName: string): boolean {
  return toolRiskMap[toolName] === 'dangerous';
}
```

2. **工具结果的结构化包装**：统一所有工具返回格式，便于 LLM 解析和后处理：

```typescript
function wrapResult(data: any, meta?: { cached?: boolean; latency_ms?: number; truncated?: boolean }): string {
  return JSON.stringify({ data, _meta: meta });
}
// 使用时
const result = executeTool('query_sales_data', input);
return wrapResult(result, { truncated: result.length > 1000 });
```

3. **动态工具注册模式**：使用装饰器或配置驱动的方式注册工具，而不是手写每个工具的执行器：

```typescript
// 装饰器驱动的工具注册
const toolRegistry = new Map<string, { definition: Anthropic.Tool; handler: (input: any) => string }>();

function registerTool(definition: Anthropic.Tool) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    toolRegistry.set(definition.name, { definition, handler: descriptor.value });
  };
}

class ToolHandlers {
  @registerTool({
    name: 'get_weather',
    description: '获取天气',
    input_schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
  })
  getWeather(input: { city: string }) {
    return `${input.city}: 25°C`;
  }
}
```

## 🧠 知识检查点

**问题 1：** 为什么数据库查询工具应该优先使用「结构化参数」而不是让 LLM 写 SQL？

<details>
<summary>答案</summary>
结构化参数更安全（防止 SQL 注入）、更可靠（LLM 生成的 SQL 可能语法错误）、更可控（限制表和字段访问）。让 LLM 写原始 SQL 相当于给 LLM 一个「万能钥匙」，一旦被 prompt injection 攻击，可能导致数据泄露或破坏。
</details>

**问题 2：** 代码执行工具的风险最高，需要哪些安全措施？

<details>
<summary>答案</summary>
至少需要：1) 超时控制（防止无限循环）；2) 资源限制（限制内存和 CPU）；3) 禁用网络访问（防止数据外泄）；4) 禁用宿主机文件系统访问；5) 输出截断（防止返回超大数据）；6) 白名单运行环境（只允许安全的函数和库）。
</details>

**问题 3：** 什么是操作执行工具的「确认机制」？为什么要用它？

<details>
<summary>答案</summary>
确认机制指在执行有副作用的操作（如发邮件、删除数据）之前，先返回操作预览让用户确认，用户确认后才真正执行。这样做的原因是：1) 防止 LLM 误解用户意图而执行意外操作；2) 给用户「最后检查」的机会；3) 降低 prompt injection 攻击的影响范围——即使攻击者诱导 LLM 调用工具，也需要用户确认才能执行。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| 允许 LLM 拼接 SQL 或 shell 命令 | 最严重的安全漏洞，容易被 prompt injection 利用 | 使用结构化参数代替原始命令；必须用原始命令时进行严格的输入验证和白名单限制 |
| 没有为操作执行工具设置确认机制 | LLM 可能误解用户意图而执行有副作用的操作 | 所有写操作（发邮件、删除、修改）都先返回预览，要求用户确认 |
| 不同工具返回格式不统一 | LLM 需要处理多种格式，增加了推理负担 | 为所有工具统一结果格式（如 `{ success, data, error }`），便于 LLM 一致地处理 |

## 📝 本章小结

- ✅ **数据查询工具** — 结构化参数优于原始 SQL，防止注入；结果截断、超时控制、Schema 约束
- ✅ **操作执行工具** — 最高风险类别，需要确认机制、最小权限原则、操作日志和幂等性设计
- ✅ **计算推理工具** — 必须沙箱化执行：超时、资源限制、禁用网络/文件系统、输出截断
- ✅ **外部服务工具** — 缓存策略降低延迟，限流保护 API 限额，降级策略提高可用性
- ✅ **安全等级体系** — 根据风险等级动态调整处理方式，高风险操作自动触发确认流程

## ➡️ 下一章预告

> [第5章：并行与顺序工具调用](./05-parallel-tool-calls.md) — 学习如何管理批量工具调用、处理依赖关系、优化执行性能。
