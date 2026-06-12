# LangGraph 常见错误排错指南

## 1. 图编译时报错 "No path from START to X node"
**现象：** 编译 StateGraph 时报节点不可达错误
**原因：** 某个节点没有通过任何边连接到 START 或前序节点
**方案：** 检查每个节点是否都有入边和出边，确保所有节点都连通

## 2. 条件路由函数返回了未定义的分支
**现象：** 条件边执行时报 "No path for condition X"
**原因：** 路由函数返回的字符串不在 addConditionalEdges 定义的映射中
**方案：** 在 mapping 中添加所有可能的分支，或添加 default 分支

## 3. Checkpointer 恢复状态失败
**现象：** 通过 thread_id 恢复时获取不到之前的状态
**原因：** 使用的 checkpointer 实例与之前不同，或 thread_id 不匹配
**方案：** 使用同一个 MemorySaver 实例，确保 thread_id 完全一致

## 4. 节点修改了 State 中未定义的字段
**现象：** 节点返回的字段不在 State 的 Annotation 定义中
**原因：** State 的 Annotation 没有覆盖所有需要修改的字段
**方案：** 在 Annotation.Root 中添加缺失的字段定义

## 5. 子图无法访问父图的 State
**现象：** 子图节点读取不到父图 State 中的字段
**原因：** 子图的 State Schema 与父图不兼容
**方案：** 使用 shared Annotation 定义公共字段，确保子图和父图共享状态

## 6. Agent 执行时陷入无限循环
**现象：** Agent 在同一组节点之间来回跳转，永不结束
**原因：** 条件边的路由逻辑不完整或存在环
**方案：** 添加递归深度限制，在 State 中增加 iteration 计数器

## 7. 流式执行时事件丢失
**现象：** 使用 .stream() 时某些节点的事件没有输出
**原因：** 节点执行太快，事件被合并或跳过
**方案：** 使用 stream_mode="updates" 获取完整的节点更新

## 8. Human-in-the-loop 中断不触发
**现象：** 设置了 interrupt_before 但图执行没有暂停
**原因：** interrupt_before 的节点名与图中的节点名不匹配
**方案：** 检查 interrupt_before 中的节点名称是否与 addNode 中的完全一致

## 9. 并行节点之间的数据竞争
**现象：** 多个并行执行的节点修改了 State 中的同一个字段
**原因：** 字段的 reducer 没有正确处理并发更新
**方案：** 使用追加型 reducer（如消息列表）而不是覆盖型 reducer

## 10. 编译后的图无法序列化
**现象：** 尝试 JSON.stringify(app) 时抛出错误
**原因：** LangGraph 包含不可序列化的对象（如 LLM 实例）
**方案：** 不要直接序列化编译后的图对象，而是保存 checkpoint

## 11. createReactAgent 无法识别自定义工具
**现象：** Agent 声明了工具但执行时从不调用
**原因：** 工具的 description 不够清晰，Agent 不知道何时使用
**方案：** 在 tool 的 description 中写清楚调用场景

## 12. 子图的 State 与父图冲突
**现象：** 子图编译时报 State key 冲突
**原因：** 子图 Annotation 中包含了与父图同名的字段但类型不同
**方案：** 使用命名空间前缀或在子图中只定义新增字段

## 13. 图执行时内存持续增长
**现象：** 长时间运行的 Agent 内存不断增长
**原因：** 所有消息历史和中间状态都保存在 State 中
**方案：** 定期清理 State 中的历史消息，只保留最近 N 轮

## 14. 条件边映射中缺少 END 分支
**现象：** Agent 执行到终点后无法结束
**原因：** 条件路由函数的返回值不在映射中，且没有映射到 END
**方案：** 在条件边的映射中添加 END: END

## 15. Multi-Agent 系统中的 Agent 互相等待死锁
**现象：** 多个 Agent 互相等待对方的结果，系统卡死
**原因：** 任务依赖关系形成了循环等待
**方案：** 确保任务依赖图是一个有向无环图（DAG）
