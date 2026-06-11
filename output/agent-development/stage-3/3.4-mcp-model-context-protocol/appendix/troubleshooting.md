# MCP 常见错误排错指南

## 1. Server 连接失败
**方案：** 检查传输协议配置（stdio command 或 HTTP URL）

## 2. 工具调用无响应
**方案：** 检查工具函数是否正确返回 `{ content: [...] }` 格式

## 3. Zod 验证错误
**方案：** 确保工具参数 Schema 与实际传入参数匹配

## 4. Resource URI 不匹配
**方案：** 确保 `server.resource()` 的 URI 模板与客户端请求的 URI 一致
