# Vercel AI SDK 常见错误排错指南

## 1. 模块找不到 `ai` 或 `@ai-sdk/xxx`
**现象：** 导入 ai 包时提示找不到模块
**原因：** 未安装对应的 npm 包
**方案：** 运行 `npm install ai @ai-sdk/anthropic @ai-sdk/openai`

## 2. generateText 返回内容被截断
**现象：** 模型回答不完整，在中间突然结束
**原因：** maxTokens 设置过小
**方案：** 根据实际需要设置合适的 maxTokens 值，或移除限制

## 3. streamText 在前端无法正确解析
**现象：** 前端收到的流式数据是乱码或格式错误
**原因：** Data Stream 协议实现不完整
**方案：** 使用 ai 包提供的 `readDataStream` 工具函数解析

## 4. 多模型切换时报 Provider 错误
**现象：** 切换模型时报 API 认证错误
**原因：** 某个 Provider 的 API Key 环境变量未设置
**方案：** 检查每个 Provider 对应的 API Key 环境变量是否正确

## 5. generateObject 输出不符合 Schema
**现象：** 生成的对象缺少必需字段或类型不匹配
**原因：** LLM 没有严格遵循 Zod Schema
**方案：** 给每个字段添加 `.describe()` 说明，使用 `.strict()` 禁止额外字段

## 6. useChat 消息不更新
**现象：** 输入消息后界面没有显示响应
**原因：** API Route 未正确实现，或未处理流式响应
**方案：** 检查 API Route 是否使用了 `streamText` 并返回正确格式

## 7. 流式输出在移动端卡顿
**现象：** 移动设备上 SSE 流式响应频繁中断
**原因：** 移动网络切换导致连接断开
**方案：** 实现自动重连机制，在 onError 回调中触发重新请求

## 8. 多步工具调用时 maxSteps 未生效
**现象：** 设置 maxSteps=3 但模型只调用了一次工具就停止了
**原因：** 模型判断已经得到了足够的回答
**方案：** 在系统提示中明确要求模型逐步使用工具

## 9. tool() 定义的 execute 函数未执行
**现象：** Agent 声明了工具但工具函数没有被调用
**原因：** 模型决定不调用工具，只根据自身知识回答
**方案：** 在系统提示中强制要求使用工具

## 10. 流式对象解析错误
**现象：** streamObject 的 partial 输出格式不符合预期
**原因：** 流式输出的 JSON 是增量式的，不完整的 JSON 无法直接解析
**方案：** 使用 `isFinished` 判断是否完成，或使用 partial 安全解析

## 11. React 组件中 useChat 的 onError 未触发
**现象：** API 报错时 useChat 没有触发 onError 回调
**原因：** 错误被 fetch 的 catch 捕获，未正确传递
**方案：** 在 API Route 中返回正确的 HTTP 状态码（如 500），而非直接抛出异常

## 12. 使用 generateImage 时模型不支持
**现象：** 调用 generateImage 时报不支持错误
**原因：** 当前模型不支持图像生成功能
**方案：** 使用支持图像生成的模型（如 DALL-E），或切换到 Provider 支持的模型

## 13. 自定义 UI 不显示 Markdown 格式
**现象：** AI 返回的 Markdown 格式文本被直接显示为纯文本
**原因：** 没有安装 Markdown 渲染库
**方案：** 安装 react-markdown，将消息内容通过 Markdown 组件渲染

## 14. 嵌入模型调用时超时
**现象：** embed() 函数长时间无响应
**原因：** 请求的文本过长导致嵌入生成时间过长
**方案：** 将长文本拆分成多个短文本分段嵌入

## 15. 跨 Provider 切换时模型名称错误
**现象：** 切换 Provider 后模型返回 400 错误
**原因：** 使用了上一个 Provider 的模型名称
**方案：** 切换 Provider 时同步更新模型名称，或在代码中使用 Provider 封装的模型变量
