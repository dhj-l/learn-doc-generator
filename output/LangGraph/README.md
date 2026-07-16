# LangGraph 从入门到精通

> 基于 **LangGraph JavaScript/TypeScript** 最新官方文档，包含与 LangChain 的对比讲解

📌 **版本**：基于官方最新文档（2026年6月更新）  
📌 **信息来源**：🟢 满配模式（context7 + 官方文档站）  
📌 **预计学习时长**：8-12 小时  
📌 **前置要求**：了解 JavaScript/TypeScript 基础，有 LLM API 使用经验更佳

---

## 📋 什么是 LangGraph？

**LangGraph** 是 LangChain 团队推出的**底层编排框架（low-level orchestration framework）**，专门用于构建、管理和部署**长运行、有状态（stateful）的 AI Agent**。你可以把它理解为「AI Agent 的操作系统」——它管理 Agent 的**状态**、**执行流程**、**持久化**、**流式输出**和**人机交互（Human-in-the-Loop）**。

如果把 **LangChain** 比作一个工具包（提供各种 LLM 工具和链式调用），那 **LangGraph** 就是一个**完整的 Agent 运行时**——它能精确控制 Agent 的每一步执行，支持暂停、恢复、回放和调试。

### 一句话总结

| LangChain | LangGraph |
|-----------|-----------|
| 🧰 瑞士军刀（工具集合） | 🏗️ 建筑蓝图 + 施工队（编排框架） |
| 适合简单的链式调用 | 适合复杂的、有状态的 Agent 工作流 |
| 线性流程（Chain） | 图结构流程（Graph）—— 有分支、循环、条件跳转 |

---

## 🗺️ 学习路线

```
第1章 ▸ 概述与环境搭建（30分钟）
  └─ 了解 LangGraph 定位、安装和第一个"Hello World"

第2章 ▸ 核心概念：图、节点、边（1小时）
  └─ StateGraph、Node、Edge、Conditional Edge、状态管理

第3章 ▸ Graph API：构建你的第一个 Agent（1.5小时）
  └─ 用 StateGraph 构建带工具的 Agent，学会条件路由

第4章 ▸ Functional API：更简洁的方式（1小时）
  └─ 用 task + entrypoint 快速搭建 Agent

第5章 ▸ 持久化、流式输出与检查点（1.5小时）
  └─ Checkpointer、MemorySaver、Durability 模式（async/sync/exit）、Streaming、Event Streaming

第6章 ▸ 高级特性（1.5小时）
  └─ Interrupts、错误处理策略（5种错误类型）、Time Travel、Subgraphs、Stores、Send API

第7章 ▸ LangGraph vs LangChain 深度对比（30分钟）
  └─ 什么时候用 LangChain，什么时候用 LangGraph

第8章 ▸ 综合实战项目：智能客服 Agent（2小时）
  └─ 从 0 到 1 构建一个生产级 Agent

附录A ▸ API 速查表
附录B ▸ 常见错误排错指南
```

---

## 🔗 章节导航

### 基础篇
- [第1章：概述与环境搭建](chapters/01-introduction.md)
- [第2章：核心概念——图、节点、边](chapters/02-core-concepts.md)

### 实战篇
- [第3章：Graph API——构建你的第一个 Agent](chapters/03-graph-api.md)
- [第4章：Functional API——更简洁的方式](chapters/04-functional-api.md)
- [第5章：持久化、流式输出与检查点](chapters/05-persistence-streaming.md)
- [第6章：高级特性](chapters/06-advanced-features.md)

### 对比篇
- [第7章：LangGraph vs LangChain 深度对比](chapters/07-vs-langchain.md)

### 项目篇
- [第8章：综合实战项目——智能客服 Agent](chapters/capstone-project.md)

### 附录
- [API 速查表](appendix/cheatsheet.md)
- [常见错误排错指南](appendix/troubleshooting.md)

---

## 💡 学习建议

1. **按顺序学习**：每章内容建立在前面章节的基础上
2. **动手实操**：每个代码示例都要亲手敲一遍，不要直接复制
3. **先思考再看答案**：实战练习部分，先自己写代码，再展开查看参考实现
4. **遇到问题先查排错指南**：附录 B 收集了最常见的问题
5. **对比学习**：第7章提供了 LangChain vs LangGraph 的对比，学完前面的内容后再看效果更好

> 📘 **说明**：本文档所有代码示例使用 **TypeScript** 语言。如果你更熟悉 Python，LangGraph Python API 的设计与 JS 版本类似，概念通用。
