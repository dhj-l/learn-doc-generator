# OpenAI API 常见错误排错指南

---

## 1. API Key 无效 (401)

**错误信息：** `401 Unauthorized` 或 `Incorrect API key provided`

**原因分析：** API Key 未设置、已过期，或使用了错误的 Key（如将 DeepSeek 的 Key 用于 OpenAI）

**解决方案：** 检查 `OPENAI_API_KEY` 环境变量是否正确设置。不同提供商使用不同的 Key 和 `baseURL`。可以通过 `console.log(process.env.OPENAI_API_KEY)` 调试确认。

---

## 2. 模型不存在 (404)

**错误信息：** `model_not_found` 或 `The model xxx does not exist`

**原因分析：** 模型名称拼写错误，或使用了当前 API Key 无权访问的模型

**解决方案：** 确认模型名称拼写正确（如 `gpt-4o` 而非 `gpt4o`）。国产模型的 model ID 与 OpenAI 不同，查阅对应文档。

---

## 3. 速率限制 (429)

**错误信息：** `429 Too Many Requests` 或 `Rate limit exceeded`

**原因分析：** 在短时间内发送了过多请求，触发了 API 提供商的限流机制

**解决方案：**
- 降低并发请求数量
- 使用 SDK 内置重试：`new OpenAI({ maxRetries: 3 })`
- 实现指数退避：`setTimeout(retry, 1000 * Math.pow(2, attempt))`
- 在网关层添加速率限制，避免突发请求

---

## 4. 结构化输出 Schema 不匹配

**错误信息：** `Schema validation failed` 或输出不完全符合定义的 Schema

**原因分析：** 使用了不支持结构化输出的模型，或 Schema 定义不够严格

**解决方案：**
- 使用 `gpt-4o-2024-08-06` 或更新模型
- 确保 Schema 中 `additionalProperties: false`
- 所有字段都列在 `required` 数组中
- 使用 Zod 的 `.strict()` 方法

---

## 5. 国产模型调用失败

**错误信息：** 各种 HTTP 错误（400, 401, 404, 500）

**原因分析：** 国产模型的 API 与 OpenAI 存在细微差异

**常见原因：**
- `baseURL` 配置错误（注意是否有 `/v1` 后缀）
- API Key 格式不同（如 DashScope 需要 `sk-` 前缀）
- 某些模型不支持 `max_tokens`、`temperature` 等参数
- 模型 ID 的命名规则不同

---

## 6. 流式输出中文乱码

**现象：** 终端输出 `���` 或乱码字符

**原因分析：** 终端编码不是 UTF-8，或使用了 `console.log()` 输出流式内容

**解决方案：** 确保终端编码为 UTF-8，使用 `process.stdout.write()` 而非 `console.log()`。在 Windows 上执行 `chcp 65001` 切换到 UTF-8。

---

## 7. Token 消耗超出预期

**现象：** 账单金额远高于预估

**原因分析：** System Prompt 过长、历史对话累积、或者没有使用缓存机制

**排查：** 检查 API 响应中的 `usage` 字段的 `prompt_tokens` 和 `completion_tokens`。System Prompt 和对话历史可能比预期长得多。

---

## 8. 国产模型输出截断

**现象：** 模型回答中途停止，内容不完整

**原因分析：** 部分国产模型的 `max_tokens` 上限较低（如 GLM-4 的 4096）

**解决方案：** 查阅对应模型的文档确认 `max_tokens` 上限。如需要长输出，可以分段请求或切换上限更高的模型。

---

## 9. CORS 跨域错误（浏览器端）

**错误信息：** `Access-Control-Allow-Origin` 或 CORS 相关错误

**原因分析：** 在浏览器端直接调用 API，没有经过代理服务器

**解决方案：** OpenAI API 不支持浏览器端直接调用。必须通过后端服务器代理转发，或在 Next.js API Route 中封装。

---

## 10. 请求超时

**错误信息：** `ETIMEDOUT` 或 `socket hang up`

**原因分析：** 网络连接不稳定，或因模型推理时间过长导致默认超时

**解决方案：**
- 增加超时时间：`new OpenAI({ timeout: 60000 })`
- 使用流式输出（stream: true）可以更快获得首 token 响应
- 切换至网络延迟更低的模型提供商

---

## 11. JSON 解析错误

**现象：** 尝试解析模型输出时抛出 JSON 解析异常

**原因分析：** 模型输出的 JSON 格式有误（如缺少逗号、多余的括号）

**解决方案：**
- 使用结构化输出（`response_format: { type: 'json_object' }`）确保输出格式
- 使用 Zod 库的 `.parse()` 方法自动验证和转换类型
- 添加 try-catch 捕获解析错误，实现优雅降级

---

## 12. 内存泄漏（长时间运行）

**现象：** Node.js 进程内存持续增长，最终 OOM

**原因分析：** 长时间运行的流式请求没有正确释放资源，或者历史消息数组无限增长

**解决方案：**
- 限制对话历史长度（如只保留最近 20 轮消息）
- 使用 `stream.controller.abort()` 正确关闭流
- 定期重启工作进程

---

## 13. 多模型网关路由错误

**现象：** 网关路由总是选择同一个模型，没有按任务类型分发

**原因分析：** 评分算法中优先级权重过高，忽略了任务类型和预算因素

**解决方案：** 调整评分算法：降低优先级的基础分，增加任务匹配的加分权重。排查候选模型的 `taskTypes` 配置是否正确。

---

## 14. 模型降级失败

**现象：** 主模型失败后没有自动切换到备用模型

**原因分析：** 降级逻辑中遗漏了某些错误类型，或所有备用模型同样不可用

**解决方案：** 确保降级函数捕获所有异常类型（`Error`, `APIError`, `TimeoutError` 等），并记录降级日志。检查备用模型的 API Key 和 baseURL 配置是否正确。

---

## 15. 成本统计偏差

**现象：** 网关统计的成本与实际 API 账单差异很大

**原因分析：** 只统计了 `prompt_tokens` 而忽略了 `completion_tokens`，或使用了过时的计价公式

**解决方案：** 同时统计输入和输出的 Token 消耗，使用 OpenAI 官网最新的计价公式。定期核对网关统计数据与 API 提供商账单。

---

## 16. 非流式请求产生大量 JSON 响应

**现象：** 非流式请求返回的 JSON 体量过大，导致内存占用高

**原因分析：** 全量返回的响应包含完整的对话内容，对于长文本对话会占用大量内存

**解决方案：** 对于长文本场景，优先使用流式输出。如果必须使用非流式，在 `max_tokens` 参数中限制输出长度。
