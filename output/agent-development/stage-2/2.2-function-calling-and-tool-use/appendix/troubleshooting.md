# Function Calling & Tool Use 排错指南

> 涵盖 Claude Tool Use / Function Calling 开发中 18 个常见问题的现象、原因和解决方案。

---

## 1. Claude 不调用任何工具

**现象：** 用户输入明显需要工具的场景（如查天气、算数学），但 Claude 直接以文本回答，没有触发 tool_use。

**原因：**
- 工具描述（description）不够清晰，LLM 不知道何时该用
- 用户输入本身可以被 LLM 知识覆盖，不需要调用工具
- System Prompt 中没有引导使用工具

**方案：**
- 为每个工具写详细的 description，明确「何时调用/何时不调用」
- 在 System Prompt 中加入引导语：`你是一个 AI 助手，当需要实时数据或执行操作时，请使用提供的工具`
- 使用 `tool_choice: { type: 'any' }` 强制每次响应都调用工具

---

## 2. 调用了错误的工具

**现象：** 有多个工具可用，Claude 选择了功能不匹配的工具，返回了错误或无意义的结果。

**原因：**
- 多个工具的 description 有重叠或歧义，Claude 无法区分
- 工具名称相似度过高

**方案：**
- 在每个工具描述的开头写清楚「本工具用于处理 X 场景，不要用于 Y」
- 使用不同的命名前缀区分功能领域，如 `search_*`、`calc_*`、`db_*`
- 用 `tool_choice: { type: 'tool', name: 'correct_tool' }` 强制指定

---

## 3. 工具参数格式错误

**现象：** LLM 生成的参数缺少必填字段、类型不对，或提供了 schema 中不存在的字段。

**原因：**
- input_schema 中的 description 不够详细
- 参数没有用 enum 约束可选值
- Claude 对复杂嵌套对象的理解偏差

**方案：**
- 为每个参数写详细 description，包括格式示例
- 用 enum 约束所有可选值，避免自由文本
- 在工具函数执行前做参数验证（JSON Schema validation）
- 参数验证失败时返回 readable 错误消息，引导 Claude 修正

---

## 4. 并行工具调用结果处理错误

**现象：** Claude 一次返回了多个 tool_use block，但处理时 tool_use_id 对应错误，或部分结果丢失。

**原因：**
- 没有用 tool_use_id 一一对应 tool_result
- 并行工具中某个工具抛异常，导致整个 Promise.all 失败
- 多个 tool_result 合并到一个 content block 中

**方案：**
- 每个 tool_result 必须携带对应的 `tool_use_id`（从 tool_use block 中提取）
- 用 `Promise.allSettled` 替代 `Promise.all`，单独处理每个工具的成功/失败
- 每个 tool_result 使用独立的 content block：`{ type: 'tool_result', tool_use_id: id, content: result }`

---

## 5. 工具循环不退出（无限递归）

**现象：** Claude 持续调用工具，每次调用后返回结果，然后又继续调用同一工具，永不进入 end_turn。

**原因：**
- 工具返回的结果让 Claude 认为还需要继续操作
- 没有设置最大迭代次数
- 工具结果中没有明确的「完成」信号

**方案：**
- 强制设置最大迭代次数（建议 10-20 轮）
- 在工具返回结果中明确标注操作状态：`{ status: 'completed', data: ... }`
- 监控 `stop_reason`，当 `stop_reason === 'end_turn'` 时终止循环
- 在 System Prompt 中提示：`当你认为问题已解决时，请结束工具调用`

---

## 6. 工具返回结果太长导致超限

**现象：** 工具返回了大量数据（如查询数据库返回数千行），导致后续请求的 token 数超出限制。

**原因：**
- 工具返回结果没有做截断或摘要
- 工具结果中的冗余数据过多

**方案：**
- 对工具返回结果做摘要或截断，只保留关键信息
- 在工具函数中增加 pagination 参数，分页返回
- 使用 `max_tokens` 控制响应长度
- 工具返回前做 token 估算，超过阈值自动截断

---

## 7. 流式（Streaming）模式下工具调用异常

**现象：** 启用 `stream: true` 后，工具调用的 content block 被拆分到多个 chunk 中，无法正确组装。

**原因：**
- 流式模式下 tool_use 的 content_block 是增量返回的，需要逐块累加
- 没有正确处理 `content_block_start` 和 `content_block_delta` 事件

**方案：**
- 使用 `content_block_start` 事件初始化一个累积 buffer
- 用 `content_block_delta` 事件中的 `partial_json` 逐步拼接
- 用 `content_block_stop` 事件触发工具执行
- 示例代码：

```typescript
let currentToolUse: { id: string; name: string; input: string } | null = null;

for await (const event of stream) {
  if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
    currentToolUse = {
      id: event.content_block.id,
      name: event.content_block.name,
      input: '',
    };
  }
  if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
    currentToolUse!.input += event.delta.partial_json;
  }
  if (event.type === 'content_block_stop' && currentToolUse) {
    const parsedInput = JSON.parse(currentToolUse.input);
    await executeTool(currentToolUse.name, parsedInput);
    currentToolUse = null;
  }
}
```

---

## 8. System Prompt 中工具规则被忽略

**现象：** System Prompt 中明确要求「只能通过工具获取数据」，但 Claude 仍然用自己的知识回答。

**原因：**
- System Prompt 中的指令位置靠后，被后续消息覆盖
- 指令不够具体，没有可操作性
- 用户消息中出现的矛盾指令覆盖了 System Prompt

**方案：**
- 将工具使用规则放在 System Prompt 最前面
- 使用具体的行为约束而非抽象要求
- 在 tool description 中加入规则提示
- 考虑使用 `tool_choice: { type: 'any' }` 强制执行

---

## 9. 工具描述过长导致性能下降

**现象：** 工具描述写了大量文字，Claude 每次调用响应变慢，token 消耗剧增。

**原因：**
- description 和 input_schema 中包含了冗余信息
- 每个工具的 input_schema properties 过多

**方案：**
- description 控制在 200 字以内，聚焦关键场景
- input_schema 的参数不超过 5 个（最小化原则）
- 多个相关工具可以合并为一个，用参数区分行为

---

## 10. 工具执行结果未被 Claude 正确理解

**现象：** 工具返回了正确的数据，但 Claude 在回复中错误解读了这些数据。

**原因：**
- 工具返回的数据格式过于复杂或非结构化
- 返回结果中没有关键信息的摘要

**方案：**
- 工具返回结构化 JSON，并在结果开头附上关键摘要
- 格式示例：`{ summary: '北京当前 22°C，晴', rawData: {...} }`
- 用自然语言描述结果后附加 JSON 数据

---

## 11. 多轮工具调用上下文丢失

**现象：** 经过多轮工具调用后，Claude 忘记了之前的工具结果或对话目标。

**原因：**
- 对话历史过长导致早期信息被截断
- messages 数组中 tool_result 的格式不正确

**方案：**
- 确保每轮工具调用的结果都包含关键摘要
- 定期在 tool_result 中总结已获取的信息
- 使用 System Prompt 中的「当前目标」字段保持方向

---

## 12. 工具调用与用户消息交替顺序错误

**现象：** 消息顺序不符合 Claude API 要求的 `user ↔ assistant ↔ user ↔ assistant` 交替规则，导致 400 错误。

**原因：**
- 多个 tool_result 被放在不同的回合中
- assistant message 中没有包含上一个 tool_use 的引用

**方案：**
- 确保 messages 数组符合角色交替规则：user → assistant(tool_use) → user(tool_result) → assistant(...)
- 将多个 tool_result 合并到同一个 user message 中
- 使用 API 验证工具检查消息顺序

---

## 13. 工具返回非 JSON 格式导致解析错误

**现象：** 工具执行成功但返回了纯文本或非标准格式，Claude 无法正确解析。

**原因：**
- 工具函数返回了字符串而非 JSON
- 工具结果中包含了不可序列化的对象

**方案：**
- 统一让所有工具返回 `JSON.stringify` 后的字符串
- 在工具函数中捕获异常，统一返回 `{ success: false, error: message }`

---

## 14. API 限流（Rate Limit）导致工具执行中断

**现象：** 高频调用 Claude API 时收到 429 错误，工具循环中断。

**原因：**
- 工具循环中每次迭代都调用 API，且没有限速
- 并行工具调用导致短时间内大量 API 请求

**方案：**
- 实现指数退避重试逻辑
- 在循环中加入延迟：`await delay(200)`
- 使用 API 配额监控，接近上限时降级

---

## 15. tool_use 参数被截断

**现象：** Claude 生成的工具参数 JSON 不完整，导致解析失败。

**原因：**
- `max_tokens` 设置得太小，Claude 在输出参数时被截断
- 工具 schema 过于复杂，参数 JSON 过长

**方案：**
- 增大 `max_tokens`（建议至少 2048）
- 简化工具 schema，避免深层嵌套
- 在解析参数前检查 JSON 完整性

---

## 16. 多工具场景下 Claude 偏好特定工具

**现象：** 有 5 个可用工具，但 Claude 总是只用前 2 个，其他工具被忽略。

**原因：**
- 工具描述的质量不同，某些描述更有吸引力
- 工具在列表中的位置影响选择概率
- 某些工具的实际使用价值被 Claude 认为更高

**方案：**
- 均衡所有工具的描述长度和质量
- 定期轮换工具列表顺序
-在工具描述中标注特殊使用条件

---

## 17. 工具调用结果中的敏感信息泄露

**现象：** 工具返回了数据库中的敏感字段（如密码、手机号），Claude 将这些信息输出给了用户。

**原因：**
- 工具函数没有做输出过滤
- 权限控制不严格，工具返回了超出必要范围的数据

**方案：**
- 在工具函数中对敏感字段做脱敏处理（如 `phone: "138****1234"`）
- 建立输出安全检查层，过滤不允许输出的字段
- 遵循最小数据原则，只返回需要展示的字段

---

## 18. 自定义工具与 SDK 内置工具冲突

**现象：** 定义了名为 `search` 的工具，与某些 SDK 内置的搜索功能名称冲突，导致行为异常。

**原因：**
- 工具名称与系统保留字或 SDK 内部功能重名
- 不同工具库之间的命名空间冲突

**方案：**
- 工具命名使用前缀命名空间：`app_search`、`app_calculate`
- 在 tools 数组中用唯一标识符区分
- 检查 SDK 文档避免使用保留名称

---

## 🔑 关键检查清单

| 检查项 | 说明 |
|--------|------|
| ☐ tool_use_id 对应 | 每个 tool_result 必须与 tool_use 的 id 一致 |
| ☐ 消息角色交替 | assistant(user message)... → user(tool_result) → assistant |
| ☐ 最大迭代限制 | 始终设置 maxIterations 避免无限循环 |
| ☐ 参数验证 | 工具执行前验证参数完整性 |
| ☐ 结果截断 | 过长结果做摘要或分页 |
| ☐ 错误返回格式 | 统一返回 readable 错误信息 |
| ☐ 流式处理 | streaming 模式下正确处理 content_block 事件 |
