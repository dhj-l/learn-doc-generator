# Agent 架构常见错误排错指南

---

## 1. Agent 死循环

**现象：** Agent 反复执行相同操作，无法退出

**解决方案：**
- 设置 `maxIterations` 上限
- 检测重复动作（连续 2 次相同动作 → 强制结束）
- 添加超时机制

---

## 2. 工具调用解析失败

**现象：** LLM 输出的 Action 格式不正确

**解决方案：**
- 在 System Prompt 中更精确地定义格式
- 使用 Few-shot 示例
- 降低 Temperature 减少格式变异

---

## 3. Agent 忘记之前的步骤

**现象：** Agent 在第 5 步忘记了第 2 步的结果

**解决方案：**
- 在每步的 Observation 中包含历史摘要
- 使用 Structured Output 记录每步状态
- 控制上下文长度，删除不必要的中间过程

---

## 4. Token 成本爆炸

**现象：** 单次 Agent 任务消耗了大量 Token

**解决方案：**
- 设置 Token 预算上限
- 使用更便宜的模型处理简单步骤
- 压缩中间步骤的 Observation
- 设置最大迭代次数

---

## 5. Multi-Agent 通信混乱

**现象：** Agent 之间传递的信息不准确

**解决方案：**
- 使用 Structured Output 定义消息格式
- 添加消息校验机制
- 使用 Supervisor 统一调度
