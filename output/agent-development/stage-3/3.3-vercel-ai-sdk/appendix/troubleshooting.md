# Vercel AI SDK 常见错误排错指南

## 1. 模块找不到 `ai` 或 `@ai-sdk/xxx`
**方案：** `npm install ai @ai-sdk/anthropic`

## 2. useChat 无法连接后端
**方案：** 检查 `api` 路径是否正确，后端是否返回正确的流式响应

## 3. 流式输出中断
**方案：** 确保后端使用 `result.toDataStreamResponse()` 而非 `Response`

## 4. 结构化输出验证失败
**方案：** 检查 Zod Schema 是否与模型输出匹配
