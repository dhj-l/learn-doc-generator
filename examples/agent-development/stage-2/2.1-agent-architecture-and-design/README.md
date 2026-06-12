# 2.1 Agent 架构与设计 — 理解 AI Agent 的本质

> 🎯 **学习目标**：深入理解 AI Agent 的架构设计原理
> ⏱️ **预计学习时间**：12-15 小时
> 📊 **内容规模**：7 章 + 2 附录，约 22,000 字
> ✅ **信息来源**：基于学术论文 + 行业实践 + 模型知识（🟡 标准模式）

---

## 📍 你在学习路线中的位置

```
阶段 1: AI 基础能力 ✅
阶段 2: Agent 核心技术
  ► 2.1 agent-architecture-and-design    ← 你在这里
  ○ 2.2 function-calling-and-tool-use
  ○ 2.3 memory-system
  ○ 2.4 rag-system
  ○ 2.5 prompt-injection-and-safety
```

## 🗺️ 章节导航

| 章节 | 标题 | 核心内容 | 预计时间 |
|------|------|----------|----------|
| [第1章](./chapters/01-what-is-agent.md) | 什么是 AI Agent | Agent 定义、与 Chatbot 的区别、感知-推理-行动循环 | 60-80 min |
| [第2章](./chapters/02-react-pattern.md) | ReAct 模式 | Reasoning + Acting 的交替循环，核心执行模式 | 90-120 min |
| [第3章](./chapters/03-plan-and-execute.md) | Plan-and-Execute 模式 | 规划与执行分离，适合复杂多步任务 | 80-100 min |
| [第4章](./chapters/04-reflexion.md) | Reflexion 模式 | 自我反思与改进，从错误中学习 | 80-100 min |
| [第5章](./chapters/05-agent-loop.md) | Agent Loop 设计 | 循环控制、退出条件、最大迭代、错误恢复 | 90-120 min |
| [第6章](./chapters/06-multi-agent-intro.md) | Multi-Agent 初探 | 单 Agent vs Multi-Agent 选型、通信机制 | 80-100 min |
| [第7章](./chapters/07-capstone-react-agent.md) | 综合实战：手写 ReAct Agent | 不依赖框架，从零实现一个完整的 ReAct Agent | 120-150 min |

## 🎓 学完本主题你能做到

- 理解 AI Agent 的定义和核心组件
- 掌握 ReAct、Plan-and-Execute、Reflexion 三大经典架构
- 设计 Agent Loop 的循环控制和错误恢复机制
- 判断何时使用单 Agent vs Multi-Agent
- 从零手写一个不依赖框架的 ReAct Agent
