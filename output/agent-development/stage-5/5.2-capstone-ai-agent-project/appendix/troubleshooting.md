# 🔧 综合实战项目排错指南

> 构建 AI Agent 产品过程中常见问题及解决方案（18 个常见错误）

---

## 1. LangGraph 图编译错误

**错误信息：** `GraphSyntaxError: Channel 'messages' not found`
**原因分析：** 声明的 channels 与实际使用的状态键不匹配。
**解决方案：** 使用 `Annotation.Root` 定义状态，确保通道名称一致。

## 2. Stream 响应乱码

**错误信息：** `TypeError: Failed to execute 'decode'`
**原因分析：** 编码格式不匹配。
**解决方案：** 服务端设置 `Content-Type: text/event-stream; charset=utf-8`。

## 3. Agent 工具调用参数错误

**错误信息：** `Tool 'search' received invalid arguments`
**原因分析：** Schema 定义不完整或不清晰。
**解决方案：** 使用 Zod 定义 schema，每个参数写详细 `description`。

## 4. Vite 构建内存溢出

**错误信息：** `JavaScript heap out of memory`
**原因分析：** 类型定义复杂或 node_modules 过大。
**解决方案：** `NODE_OPTIONS="--max-old-space-size=4096" npm run build`。

## 5. Prisma 数据库迁移冲突

**错误信息：** `P3014: relation already exists`
**原因分析：** 多个开发者同时修改 schema。
**解决方案：** `prisma migrate reset --force` 然后重新创建。

## 6. Docker 服务间无法通信

**错误信息：** `connect ECONNREFUSED 127.0.0.1:5432`
**原因分析：** 使用 localhost 而非服务名。
**解决方案：** 用服务名 `postgres:5432` 替代 `localhost:5432`。

## 7. TypeScript 严格模式报错

**错误信息：** `Type 'undefined' is not assignable`
**原因分析：** 未处理 null/undefined。
**解决方案：** 使用可选链 `?.` + 空值合并 `??`。

## 8. MCP Server 权限不足

**错误信息：** `EACCES: permission denied`
**原因分析：** 路径权限不足或使用了相对路径。
**解决方案：** 使用绝对路径，Docker 中挂载卷注意权限。

## 9. HMR 热更新失败

**错误信息：** `HMR failed: SyntaxError`
**原因分析：** WebSocket 连接被阻止。
**解决方案：** `server.watch.usePolling = true`（Docker 环境）。

## 10. 流式输出 UI 卡顿

**错误信息：** 无错误，但页面卡顿。
**原因分析：** 每次流式更新触发完整重渲染。
**解决方案：** 使用独立 ref `streamingContent`，流结束后再 push 到消息列表。

## 11. API 路由 404 (Vercel/Next.js)

**错误信息：** `API route not found: /api/agent/run`
**原因分析：** 文件路径错误或命名不符合约定。
**解决方案：** 必须使用 `app/api/[route]/route.ts` 结构。

## 12. Pinia Store 在组件外访问失败

**错误信息：** `getActivePinia was called with no active Pinia`
**原因分析：** Pinia 未注册前使用 useStore。
**解决方案：** 确保 `app.use(createPinia())` 在 useStore 之前。

## 13. Agent 返回重复内容

**错误信息：** AI 回复中反复出现相同段落。
**原因分析：** ReAct 循环中重复执行相同步骤。
**解决方案：** 设置最大迭代次数 + 去重最近 N 条消息。

## 14. GitHub Actions 部署失败

**错误信息：** `The token is not valid`
**原因分析：** Secrets 未配置或名称不匹配。
**解决方案：** 在 GitHub Settings → Secrets 中配置。

## 15. 向量检索结果不相关

**错误信息：** 搜索返回不相关内容。
**原因分析：** 文档未做分块和清洗。
**解决方案：** 按段落分块（500 字/块）+ 混合检索（关键词 + 向量）。

## 16. 部署后静态资源缺失

**错误信息：** `404 — favicon.ico not found`
**原因分析：** 构建后资源路径与引用不匹配。
**解决方案：** 静态资源放在 `public/` 目录。

## 17. WebSocket 连接断开

**错误信息：** `WebSocket is closed before connection established`
**原因分析：** Serverless 不支持长连接。
**解决方案：** 使用 SSE 或独立 WebSocket 服务器。

## 18. 生产环境日志级别不当

**错误信息：** 无具体错误，但日志量巨大。
**原因分析：** 生产环境用了 debug 级别。
**解决方案：** 生产环境设为 `warn` 级别，仅记录警告和错误。
