# Function Calling 常见错误排错指南

---

## 1. Claude 不调用工具

**原因：** 工具描述不够清晰，或用户问题不需要工具

**解决方案：**
- 改进工具描述，说明适用场景
- 使用 `tool_choice: { type: 'any' }` 强制调用
- 在 System Prompt 中引导 Claude 使用工具

---

## 2. 调用了错误的工具

**原因：** 工具描述有歧义，或多个工具功能重叠

**解决方案：**
- 明确每个工具的边界（「用 A 做 X，用 B 做 Y」）
- 使用 `tool_choice: { type: 'tool', name: 'correct_tool' }` 指定

---

## 3. 工具参数格式错误

**原因：** LLM 生成了不符合 Schema 的参数

**解决方案：**
- 使用 enum 限制参数选项
- 为参数添加清晰的 description
- 在工具执行前做参数验证

---

## 4. 并行工具调用结果处理错误

**原因：** 没有正确关联 tool_use_id 和 tool_result

**解决方案：**
- 确保每个 tool_result 都有对应的 tool_use_id
- 保持 content 数组中 tool_use 和 tool_result 的对应关系

---

## 5. 工具循环不退出

**原因：** 工具返回的结果让 Claude 反复调用

**解决方案：**
- 设置最大迭代次数
- 在工具结果中明确说「操作完成」
- 使用 `stop_reason === 'end_turn'` 判断正常结束
