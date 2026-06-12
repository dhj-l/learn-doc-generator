# OpenAI API 常见错误排错指南

---

## 1. API Key 无效 (401)

**解决方案：** 检查 `OPENAI_API_KEY` 环境变量。不同提供商使用不同的 Key 和 `baseURL`。

---

## 2. 模型不存在 (404)

**现象：** `model_not_found` 错误

**解决方案：** 确认模型名称拼写正确。国产模型的 model ID 与 OpenAI 不同，查阅对应文档。

---

## 3. 速率限制 (429)

**解决方案：**
- 降低并发请求
- 使用 SDK 内置重试：`new OpenAI({ maxRetries: 3 })`
- 实现指数退避

---

## 4. 结构化输出 Schema 不匹配

**现象：** 输出不完全符合定义的 Schema

**解决方案：**
- 使用 `gpt-4o-2024-08-06` 或更新模型
- 确保 Schema 中 `additionalProperties: false`
- 所有字段都列在 `required` 中

---

## 5. 国产模型调用失败

**常见原因：**
- `baseURL` 配置错误（注意是否有 `/v1` 后缀）
- API Key 格式不同
- 某些模型不支持某些参数

---

## 6. 流式输出中文乱码

**解决方案：** 确保终端编码为 UTF-8，使用 `process.stdout.write()` 而非 `console.log()`。

---

## 7. Token 消耗超出预期

**排查：** 检查 `usage` 字段的 `prompt_tokens`。System Prompt 和对话历史可能比预期长。

---

## 8. 国产模型输出截断

**解决方案：** 部分国产模型的 `max_tokens` 上限较低（如 4096），需要查阅文档确认。
