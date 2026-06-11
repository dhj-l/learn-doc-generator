# 第4章：常见工具类型 — 构建工具箱

> 预计学习时间：70-90 分钟

## 🎯 本章目标

掌握四大类常见工具的设计和实现。

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

## 📝 本章小结

- ✅ **数据查询** — SQL 查询、API 调用
- ✅ **操作执行** — 发邮件、创建文件、API 写入
- ✅ **计算推理** — 代码执行、数学计算
- ✅ **外部服务** — 搜索、天气、地图

## ➡️ 下一章预告

> [第5章：并行与顺序工具调用](./05-parallel-tool-calls.md)
