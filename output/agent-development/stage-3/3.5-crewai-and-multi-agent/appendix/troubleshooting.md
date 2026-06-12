# CrewAI 常见错误排错指南

## 1. Agent 之间信息传递不准确
**现象：** 下游 Agent 获取不到上游 Agent 的输出
**原因：** Task 的 context 依赖关系未正确配置
**方案：** 明确 Task 的 context 参数，确保引用了前置 Task

## 2. 任务循环不终止
**现象：** Agent 一直执行不停止，或在 Agent 之间无限传递
**原因：** 没有设置 max_iter 上限，或 expected_output 不够明确
**方案：** 设置 max_iter（建议 3-5 次），在 expected_output 中明确完成条件

## 3. LLM 调用失败
**现象：** Agent 执行时提示 API 错误
**原因：** API Key 无效、模型名不存在、网络问题
**方案：** 检查 API Key 和模型名称配置，确认网络连接

## 4. hierarchical 模式下 Agent 不执行
**现象：** 只有 manager 在工作，员工 Agent 不做事
**原因：** manager 的 allow_delegation=True 未设置
**方案：** 给 manager Agent 设置 `allow_delegation=True`

## 5. Agent 输出和 Role 不匹配
**现象：** 研究 Agent 输出了代码，写手 Agent 输出了数据
**原因：** Role/backstory 的约束不够强
**方案：** 强化 backstory 中的角色限定，使用 examples 约束输出风格

## 6. Token 消耗远超预期
**现象：** 一次 Crew 运行消耗了上百万 Token
**原因：** Agent 之间来回传递了完整的历史记录
**方案：** 减少 max_iter，精简 expected_output，使用更小的上下文

## 7. 工具调用返回空结果
**现象：** Agent 调用了工具但拿到空数据
**原因：** 工具的参数验证过于严格，或返回格式不为 Agent 期望
**方案：** 检查工具的参数 Schema 和返回格式

## 8. 并行任务执行顺序错乱
**现象：** 本应并行的任务串行执行了
**原因：** Task 间存在意外的 context 依赖
**方案：** 检查 Task 的 context 参数，确保独立任务没有互相引用

## 9. Docker 环境中 Agent 无法联网
**现象：** Agent 在容器中运行但无法调用外部 API
**原因：** 容器网络限制
**方案：** 检查 Docker 网络配置，使用 dns 或 host 网络模式

## 10. Memory 模块导致 Agent 行为异常
**现象：** 不同用户的 Agent 互相影响
**原因：** Memory 模块未做用户隔离
**方案：** 使用 `Crew(memory=False)` 或在 memory 配置中添加用户隔离

## 11. 自定义工具的 _run 方法未被调用
**现象：** Agent 声明了工具但执行时未使用
**原因：** 工具的描述不清楚，Agent 不知道何时使用
**方案：** 在 tool 的 description 中写清楚使用场景

## 12. 多语言混用导致输出混乱
**现象：** Agent 的回答中英文混杂
**原因：** LLM 的训练数据包含多语言，backstory 没有明确指定语言
**方案：** 在 backstory 和 expected_output 中明确指定「用中文回答」

## 13. 同一个 Agent 在不同 Crew 中行为不一致
**现象：** Agent 在某个 Crew 中表现良好，换一个 Crew 却表现不佳
**原因：** Agent 的上下文受到 Crew 中其他 Agent 的影响
**方案：** 确保 Agent 的 backstory 足够独立，不依赖其他 Agent 的行为

## 14. 异步方法 _arun 未正确实现
**现象：** 在高并发场景下工具性能下降
**原因：** 只实现了同步 _run 方法，未实现异步 _arun
**方案：** 对于 IO 密集型操作，实现 async _arun 方法支持并发

## 15. Agent 在执行过程中丢失对话上下文
**现象：** Agent 在多次迭代后忘记之前的决策
**原因：** 未启用 Crew 的 memory 功能
**方案：** 在 Crew 中启用 `memory=True`，或使用外部存储持久化状态

## 16. Task 的 expected_output 过于模糊
**现象：** Agent 的输出不符合预期格式
**原因：** expected_output 没有指定格式和内容要求
**方案：** 在 expected_output 中给出具体的输出模板和示例

## 17. verbose 日志过多难以调试
**现象：** Crew 执行时控制台输出大量噪声
**原因：** verbose=True 输出了所有 Agent 的思考过程
**方案：** 仅对核心 Agent 设置 verbose=True，或使用 logging 控制日志级别

## 18. 不同 Task 共用同一个 Agent 导致角色混淆
**现象：** Agent 先后执行两个不同角色的 Task 时表现异常
**原因：** Agent 的 backstory 被前一个 Task 的上下文污染
**方案：** 不同角色的任务使用不同的 Agent 实例
