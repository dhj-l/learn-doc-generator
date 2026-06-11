# 第3-7章概要

## 第3章：TypeScript SDK 深入

MCP SDK 的高级特性：认证、错误处理、进度报告。

## 第4章：传输协议

| 协议 | 用途 | 场景 |
|------|------|------|
| stdio | 标准输入输出 | 本地进程 |
| HTTP SSE | Server-Sent Events | 远程服务 |
| Streamable HTTP | 流式 HTTP | 生产环境 |

## 第5章：实战 Server

- 文件系统 Server
- 数据库查询 Server
- API 集成 Server

## 第6章：MCP Client 集成

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'my-client', version: '1.0.0' });
const transport = new StdioClientTransport({ command: 'node', args: ['./server.js'] });
await client.connect(transport);

// 列出工具
const { tools } = await client.listTools();

// 调用工具
const result = await client.callTool({ name: 'read_file', arguments: { path: './data.txt' } });
```

## 第7章：综合实战

开发 3 个实用的 MCP Server 并集成到 Agent 中。

---

## 📎 附录

[MCP 速查表](../appendix/cheatsheet.md) | [排错指南](../appendix/troubleshooting.md)
