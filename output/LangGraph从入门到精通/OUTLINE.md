# LangGraph 从入门到精通 — 学习大纲

📌 基于版本：LangGraph ~1.2.0（2026年5月）
📌 总章节数：9 章
📌 预计总字数：~5 万字
📌 贯穿案例：智能客服工单处理 Agent
📌 学习时长：约 8-12 小时

---

## 第1章 LangGraph 概述与环境搭建
> 核心内容：了解 LangGraph 在 LLM 生态中的定位、安装方式，运行第一个 Hello World 程序
> 术语定义：LangGraph, LangChain, LangSmith, StateGraph, Graph API, Functional API

- [ ] 1.1 LangGraph 是什么？
- [ ] 1.2 LangGraph 与 LangChain/LangSmith 的关系
- [ ] 1.3 安装与环境配置
- [ ] 1.4 第一个程序：Hello World StateGraph
- [ ] 1.5 贯穿案例引入：智能客服工单系统需求

## 第2章 核心概念：State、Node、Edge
> 核心内容：掌握 LangGraph 的三大核心抽象——状态（State）、节点（Node）、边（Edge）
> 术语定义：State, Node, Edge, Reducer, TypedDict, START, END

- [ ] 2.1 State：应用的共享工作记忆
- [ ] 2.2 Reducer 函数：控制状态的更新方式
- [ ] 2.3 Node：执行实际工作的函数
- [ ] 2.4 Edge：定义执行流程的路径
- [ ] 2.5 案例：客服工单的状态定义与节点设计

## 第3章 构建图：序列、分支与条件路由
> 核心内容：学会构建不同拓扑结构的图，掌握条件路由实现分支逻辑
> 术语定义：add_node, add_edge, add_conditional_edges, compile

- [ ] 3.1 序列结构：线性执行多个节点
- [ ] 3.2 分支结构：并行 fan-out
- [ ] 3.3 条件路由：根据状态决定下一步
- [ ] 3.4 循环与 ReAct 模式
- [ ] 3.5 案例：客服工单的分流路由

## 第4章 使用 Graph API 构建 Agent
> 核心内容：用 StateGraph 构建完整的 LLM Agent，集成工具调用
> 术语定义：Agent, Tool calling, bind_tools, tool_node, MessagesState

- [ ] 4.1 MessagesState：消息驱动的状态管理
- [ ] 4.2 定义工具与绑定模型
- [ ] 4.3 LLM 节点与工具节点
- [ ] 4.4 条件路由实现 Agent Loop
- [ ] 4.5 案例：客服工单自动回复 Agent

## 第5章 Functional API：更简洁的 Agent 定义方式
> 核心内容：学习使用 @task 和 @entrypoint 装饰器以函数式风格定义 Agent
> 术语定义：@task, @entrypoint, add_messages

- [ ] 5.1 Functional API 的设计思想
- [ ] 5.2 @task 装饰器：定义可并发执行的任务
- [ ] 5.3 @entrypoint 装饰器：定义 Agent 入口
- [ ] 5.4 Graph API vs Functional API：何时选择谁？
- [ ] 5.5 案例：用 Functional API 重构客服 Agent

## 第6章 持久化与检查点
> 核心内容：让 Agent 拥有记忆力——线程内短时记忆和跨线程长时记忆
> 术语定义：Checkpointer, Checkpoint, Thread, Store, InMemorySaver, SqliteSaver

- [ ] 6.1 为什么需要持久化？
- [ ] 6.2 Checkpointer：线程内状态快照
- [ ] 6.3 Memory Store：跨线程的长时记忆
- [ ] 6.4 生产环境：PostgresSaver 与 SqliteSaver
- [ ] 6.5 案例：客服工单的多轮对话记忆

## 第7章 人机协同：中断（Interrupts）与 Human-in-the-Loop
> 核心内容：学会在 Agent 执行中插入人工审核、编辑和决策环节
> 术语定义：interrupt, Command, resume, HITL, stream_events

- [ ] 7.1 中断机制：为什么需要 HITL？
- [ ] 7.2 interrupt() 函数的使用
- [ ] 7.3 使用 Command(resume=...) 恢复执行
- [ ] 7.4 审批流程、编辑审核、输入验证等模式
- [ ] 7.5 中断的规则与最佳实践
- [ ] 7.6 案例：客服工单升级需要主管审批

## 第8章 流式输出与事件流
> 核心内容：掌握流式输出机制，实现实时响应用户的体验
> 术语定义：stream, stream_events, stream.messages, stream.values, event streaming

- [ ] 8.1 为什么需要流式输出？
- [ ] 8.2 使用 graph.stream() 流式获取状态快照
- [ ] 8.3 使用 graph.stream_events() 实现事件流
- [ ] 8.4 与 HITL 结合：在流中处理中断
- [ ] 8.5 案例：客服工单处理结果实时推送

## 第9章 综合实战：智能客服工单处理系统
> 核心内容：综合运用 LangGraph 所有核心能力构建完整的生产级 Agent 系统
> 涉及技术：StateGraph, MessagesState, Checkpointer, Interrupt, Stream, Tool calling

- [ ] 9.1 需求分析与系统设计
- [ ] 9.2 状态模式与数据库设计
- [ ] 9.3 工具定义：工单查询、升级、回复
- [ ] 9.4 Agent 主流程：受理 → 分析 → 处理 → 审批 → 结单
- [ ] 9.5 人机协同：自动处理 + 人工审核
- [ ] 9.6 部署与 LangSmith 监控集成

---

## 附录

- [ ] A — API 速查表
- [ ] B — 常见错误排错指南
