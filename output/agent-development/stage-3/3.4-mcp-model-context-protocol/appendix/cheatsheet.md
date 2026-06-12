# MCP 速查表

## 🚀 安装
```bash
npm install @modelcontextprotocol/sdk zod
```

## 🔧 Server 创建
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
const server = new McpServer({ name: 'my-server', version: '1.0.0' });

server.tool('name', 'description', { param: z.string() }, async ({ param }) => ({
  content: [{ type: 'text', text: 'result' }],
}));
```

## 📦 三大能力

| 类型 | 方法 | 用途 |
|------|------|------|
| Tools | `server.tool()` | 执行操作 |
| Resources | `server.resource()` | 暴露数据 |
| Prompts | `server.prompt()` | Prompt 模板 |
