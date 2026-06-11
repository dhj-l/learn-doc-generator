# CrewAI 常见错误排错指南

## 1. Agent 之间信息传递不准确
**方案：** 明确 Task 的 context 依赖关系

## 2. 任务循环不终止
**方案：** 设置 max_iter 和明确的 expected_output

## 3. LLM 调用失败
**方案：** 检查 API Key 和模型名称配置
