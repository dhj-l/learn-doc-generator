# 🔧 生产部署排错指南

> AI Agent 部署与运维中常见问题及解决方案（18 个常见错误）

---

## 1. Vercel Functions 超时

**错误信息：** `Error: Function timed out after 30 seconds`
**原因分析：** Hobby 计划默认超时 10s，Agent 多步推理需要更长时间。
**解决方案：** 设置 `export const maxDuration = 300;` 或将长任务改为异步队列模式。

## 2. AWS Lambda 冷启动慢

**错误信息：** `Task timed out after 3.00 seconds`
**原因分析：** 冷启动需下载代码包 + 加载运行时 + 初始化全局代码。
**解决方案：** 使用 esbuild 打包减少体积，配置 Provisioned Concurrency。

## 3. pgvector 向量查询性能差

**错误信息：** `Seq Scan on documents` 全表扫描
**原因分析：** 未创建向量索引或索引类型选择不当。
**解决方案：** 创建 HNSW 索引（推荐）或 IVFFlat 索引（> 100 万条时）。

## 4. Docker 内存不足（OOMKilled）

**错误信息：** `WARNING: Memory limit exceeded — OOMKilled`
**原因分析：** 并发 LLM 请求导致内存激增。
**解决方案：** 设置 `deploy.resources.limits.memory: 1G`，代码级限制并发数。

## 5. Redis 连接池耗尽

**错误信息：** `ioredis: connect ETIMEDOUT`
**原因分析：** 连接池中的连接泄漏。
**解决方案：** 使用 `try/finally` 确保 `client.release()`，设置 `maxRetriesPerRequest`。

## 6. API 认证失败

**错误信息：** `401 Unauthorized: Invalid or expired token`
**原因分析：** JWT 过期、签名不匹配、API Key 暴露到前端。
**解决方案：** 服务端校验 Token，API Key 不使用 `NEXT_PUBLIC_` 前缀。

## 7. 流式响应中断

**错误信息：** `TypeError: Cannot read properties of undefined`
**原因分析：** 客户端断开连接但服务端仍继续生成。
**解决方案：** 监听 `req.signal` 的 `abort` 事件，调用 `abortController.abort()`。

## 8. LLM API 限流（429）

**错误信息：** `429 Too Many Requests`
**原因分析：** 并发请求超过 API 速率限制。
**解决方案：** 使用 Bottleneck 库控制并发和速率。

## 9. Docker 健康检查失败

**错误信息：** `Container agent-api is unhealthy`
**原因分析：** Healthcheck 命令错误或应用启动太慢。
**解决方案：** 使用 curl 替代 wget，设置 `start-period: 40s`。

## 10. 数据库连接泄漏

**错误信息：** `Connection pool exhausted`
**原因分析：** 查询后未释放连接。
**解决方案：** 使用 `client.connect()` + `try/finally` 确保释放。

## 11. Agent 循环无终止

**错误信息：** `Agent exceeded maximum recursion depth`
**原因分析：** ReAct 循环中工具返回无效结果。
**解决方案：** 设置 `iterations >= 10` 强制结束。

## 12. Vercel 环境变量缺失

**错误信息：** `ANTHROPIC_API_KEY is not defined`
**原因分析：** `.env.local` 中的变量未同步到 Vercel。
**解决方案：** `vercel env add ANTHROPIC_API_KEY`。

## 13. 部署后页面白屏

**错误信息：** `Uncaught SyntaxError: Unexpected token '<'`
**原因分析：** 静态资源路径错误。
**解决方案：** 检查 `vite.config.ts` 的 `base` 配置。

## 14. MCP Server 连接失败

**错误信息：** `MCP server 'filesystem' not found`
**原因分析：** 配置文件路径错误或服务未启动。
**解决方案：** 手动测试 `npx -y @modelcontextprotocol/server-filesystem .`。

## 15. LLM Token 超限

**错误信息：** `exceeds the maximum context length`
**原因分析：** 消息积累超过上下文窗口。
**解决方案：** 实现滑动窗口，保留最近的 N 条消息。

## 16. CORS 跨域错误

**错误信息：** `blocked by CORS policy`
**原因分析：** 前后端域名不一致。
**解决方案：** 在 Hono/Express 中配置具体的前端域名。

## 17. 生产成本失控

**错误信息：** `Billing alert: Exceeded $500 budget`
**原因分析：** 未设置用量上限和告警。
**解决方案：** 设置用户级每日限额 + 月预算告警。

## 18. 日志丢失

**错误信息：** `No logs found for function invocation`
**原因分析：** Serverless 平台在执行完成后丢弃日志。
**解决方案：** 使用外部日志服务（Sentry、Datadog）。
