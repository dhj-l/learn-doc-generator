# MCP 协议速查表

## 🚀 安装

```bash
npm install @modelcontextprotocol/sdk zod
```

## 📦 核心 API

| API | 用途 | 示例 |
|-----|------|------|
| `new McpServer({name, version})` | 创建 Server | `const server = new McpServer({name:'my-server', version:'1.0.0'})` |
| `server.tool(name, desc, schema, handler)` | 注册工具 | `server.tool('get_weather', {...}, async ({city}) => {...})` |
| `server.resource(name, uri, handler)` | 注册资源 | `server.resource('config', 'config://app', async () => {...})` |
| `server.prompt(name, desc, schema, handler)` | 注册提示模板 | `server.prompt('review', {code: z.string()}, ({code}) => {...})` |
| `new StdioServerTransport()` | stdio 传输 | `const transport = new StdioServerTransport()` |
| `new SSEServerTransport('/messages', res)` | SSE 传输 | SSE 模式 |

## 🔧 常用工具 Schema 模式

```typescript
// 字符串参数
path: z.string().describe('文件路径')
// 枚举
mode: z.enum(['read', 'write']).default('read')
// 数字
limit: z.number().min(1).max(100).default(20)
// 布尔
overwrite: z.boolean().default(false)
// 数组
tags: z.array(z.string()).max(5)
// 可选
description: z.string().optional()
```

## 🔄 传输协议

| 协议 | 传输方式 | 适用场景 |
|------|----------|----------|
| Stdio | 标准输入输出 | 本地 Agent、开发环境 |
| HTTP SSE | SSE 长连接 | 远程访问、小规模部署 |
| Streamable HTTP | HTTP 流式 | 生产环境、大规模部署 |

## 🛡️ 错误处理

```typescript
// 业务错误（返回给 LLM）
return { content: [{ type: 'text', text: '错误信息' }], isError: true }

// 协议错误（抛异常）
throw new McpError(ErrorCode.InternalError, 'Server 内部错误')
```

## 📊 客户端 API

```typescript
new Client({name, version})
client.connect(transport)
const { tools } = await client.listTools()
const result = await client.callTool({name, arguments})
await client.close()
```
