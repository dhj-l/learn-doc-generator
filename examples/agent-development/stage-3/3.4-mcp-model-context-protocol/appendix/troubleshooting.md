# MCP 常见错误排错指南

## 1. Server 启动后立即退出
**现象：** 运行 Server 后进程立即结束
**原因：** 没有 await server.connect(transport)
**方案：** 确保调用了 `await server.connect(transport)`

## 2. 客户端连接成功后工具列表为空
**现象：** listTools() 返回空数组
**原因：** 工具注册在 connect 之后才执行
**方案：** 在 connect 之前完成所有 server.tool() 调用

## 3. 工具调用返回 "Tool not found"
**现象：** 工具名正确但调用失败
**原因：** 工具名大小写不匹配，或带了 namespace 前缀
**方案：** 使用 listTools() 返回的原始工具名调用

## 4. SSE 连接断开
**现象：** 远程连接不稳定，频繁断线
**原因：** 网络问题或 Server 端的连接池管理不当
**方案：** 实现重连机制、清理过期连接

## 5. Tool 参数验证失败
**现象：** 调用工具时返回参数错误
**原因：** LLM 生成的参数不符合 Zod Schema
**方案：** 提供清晰的参数描述，不要用过于复杂的 Schema

## 6. 多个工具同名导致冲突
**现象：** 连接多个 Server 时工具名冲突
**原因：** 不同 Server 提供了同名工具
**方案：** 在 Host 端做 namespace 处理，如 `serverA__get_info`

## 7. 工具返回内容被截断
**现象：** 大文件的返回内容不完整
**原因：** 工具返回的 content 没有做分页或截断
**方案：** 对大内容做分页返回，或限制最大返回长度

## 8. 错误信息丢失
**现象：** 工具报错但 LLM 看不到具体原因
**原因：** isError: true 但没有提供有意义的错误信息
**方案：** 提供人类可读的错误描述，说明原因和可能的解决方案

## 9. 文件路径跨平台问题
**现象：** Windows 上路径正常，Linux 上报错
**原因：** 路径分隔符差异（\ vs /）
**方案：** 统一使用 `path.resolve()` 处理路径

## 10. 同步阻塞导致 Agent 卡死
**现象：** Agent 在等待工具返回时停止响应
**原因：** 工具内部有同步阻塞操作
**方案：** 工具内部使用异步操作，实现合理的超时机制

## 11. Host 端无法发现 Server 的工具
**现象：** client.listTools() 返回空数组
**原因：** Server 的工具注册在 connect() 之后执行，或注册代码有错误
**方案：** 在 connect() 前完成所有 server.tool() 调用，检查注册代码是否有语法错误

## 12. 大文件传输导致内存溢出
**现象：** 读取大文件时 Server 进程崩溃
**原因：** 没有做流式读取或大小限制
**方案：** 使用流式读取（createReadStream），设置最大文件大小限制

## 13. 并发请求导致数据不一致
**现象：** 多个 Agent 同时调用同一个工具导致数据紊乱
**原因：** 工具内部有共享的可变状态
**方案：** 工具保持无状态设计，使用数据库事务或锁机制

## 14. Streamable HTTP 模式连接不稳定
**现象：** 生产环境中 SSE 连接频繁断开
**原因：** HTTP 层缺少心跳检测和重连机制
**方案：** 在 Server 端实现心跳包（ping/pong），客户端实现指数退避重连

## 15. 跨域请求被 CORS 拦截
**现象：** 浏览器端 Host 无法连接远程 MCP Server
**原因：** Server 未设置 CORS 头
**方案：** 在 HTTP Server 中添加 CORS 中间件，允许 Host 的域名

## 16. Resource 返回的数据格式不符合预期
**现象：** LLM 读取 Resource 内容时解析失败
**原因：** Resource 返回的 mimeType 与实际内容不匹配
**方案：** 正确设置 mimeType（JSON 用 application/json，文本用 text/markdown）

## 17. Server 的 tool 函数中抛出的异常未被正确处理
**现象：** 工具调用返回 500 内部错误
**原因：** tool 处理函数中没有 try/catch 包裹可能出错的操作
**方案：** 在 tool 处理函数中使用 try/catch，将错误转换为 `{ content: [...], isError: true }` 格式返回

## 18. 使用动态 ResourceTemplate 时 URI 解析失败
**现象：** 带参数的 Resource URI 无法匹配
**原因：** URI 模板定义与实际传入的 URI 格式不一致
**方案：** 检查 ResourceTemplate 的 URI 模式，确保 `{param}` 占位符与实际传入的 URI 参数匹配

## 19. Mac/Linux 路径在 Windows 上不兼容
**现象：** Server 在 Windows 上无法找到文件
**原因：** 硬编码的路径分隔符 `/` 在 Windows 上不适用
**方案：** 使用 `path.join()` 和 `path.resolve()` 处理路径，避免硬编码路径分隔符

## 20. 多个 MCP Server 的 Resource URI 冲突
**现象：** 不同 Server 有相同 URI 路径的 Resource
**原因：** 没有在 URI 中加 namespace 前缀
**方案：** 在 Resource URI 中使用 Server 名称作为前缀，如 `fs://config` 和 `db://config`
