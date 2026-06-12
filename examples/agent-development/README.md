# AI Agent 开发体系化学习文档

> 面向有前端基础（Vue/React + TypeScript）的开发者
> 目标：系统掌握 AI Agent 开发能力，成为「前端 + Agent」全栈 AI 工程师
> 📅 生成日期：2026-06-11
> ✅ 信息来源：🟡 标准模式（context7 + 模型知识）

---

## 📊 文档概览

| 指标 | 数据 |
|------|------|
| 总阶段数 | 5 个 |
| 总主题数 | 20 个 |
| 总章节数 | ~128 章 |
| 目标字数 | ≥ 25 万字（不含代码） |
| 目标学习时长 | ≥ 26 小时 |
| 实战内容占比 | ≥ 60% |

---

## 🗺️ 学习路线总览

```
阶段 1: AI 基础能力（必修）
├── 1.1 prompt-engineering           ✅
├── 1.2 claude-api                   ✅
├── 1.3 openai-api                   ✅
└── 1.4 embedding-and-vector-database ✅

阶段 2: Agent 核心技术（必修）
├── 2.1 agent-architecture-and-design ✅
├── 2.2 function-calling-and-tool-use ✅
├── 2.3 memory-system                 ✅
├── 2.4 rag-system                    ✅
└── 2.5 prompt-injection-and-safety   ✅

阶段 3: Agent 框架实战（必修）
├── 3.1 langchain-js                  ✅
├── 3.2 langgraph                     ✅
├── 3.3 vercel-ai-sdk                 ✅
├── 3.4 mcp-model-context-protocol    ✅
└── 3.5 crewai-and-multi-agent        ✅

阶段 4: 前端 + Agent 融合（进阶）
├── 4.1 ai-powered-frontend           ✅
├── 4.2 agent-ui-design               ✅
├── 4.3 streaming-and-real-time       ✅
└── 4.4 agent-evaluation-and-observability ✅

阶段 5: 综合实战（收尾）
├── 5.1 production-agent-deployment   ✅
└── 5.2 capstone-ai-agent-project     ✅
```

---

## 📚 各阶段详情

### [阶段 1：AI 基础能力](./stage-1/README.md) 🔄

理解 LLM 的工作方式，掌握与 AI 模型交互的核心技能。

| 主题 | 预计时间 |
|------|----------|
| 1.1 Prompt Engineering | 9-12h |
| 1.2 Claude API | 9-12h |
| 1.3 OpenAI API | 7-10h |
| 1.4 Embedding 与向量数据库 | 9-12h |

### [阶段 2：Agent 核心技术](./stage-2/README.md) ⏳

理解 Agent 的本质，掌握构建 Agent 的核心组件。

| 主题 | 预计时间 |
|------|----------|
| 2.1 Agent 架构与设计 | 12-15h |
| 2.2 Function Calling 与 Tool Use | 9-12h |
| 2.3 记忆系统 | 9-12h |
| 2.4 RAG 系统 | 12-15h |
| 2.5 Prompt 注入与安全 | 6-8h |

### [阶段 3：Agent 框架实战](./stage-3/README.md) ⏳

熟练使用主流 Agent 框架，掌握 MCP 协议。

| 主题 | 预计时间 |
|------|----------|
| 3.1 LangChain.js | 11-14h |
| 3.2 LangGraph | 12-15h |
| 3.3 Vercel AI SDK | 9-12h |
| 3.4 MCP 协议 | 11-14h |
| 3.5 CrewAI 与多 Agent | 9-12h |

### [阶段 4：前端 + Agent 融合](./stage-4/README.md) ⏳

将 Agent 能力融入前端应用，打造 AI-Native 产品体验。

| 主题 | 预计时间 |
|------|----------|
| 4.1 AI 驱动的前端 | 8-10h |
| 4.2 Agent UI 设计 | 7-9h |
| 4.3 流式传输与实时通信 | 8-10h |
| 4.4 Agent 评估与可观测性 | 6-8h |

### [阶段 5：综合实战](./stage-5/README.md) ⏳

将所学知识整合到完整的生产级项目中。

| 主题 | 预计时间 |
|------|----------|
| 5.1 生产部署 | 9-12h |
| 5.2 综合实战项目 | 12-15h |

---

## 📋 学习建议

### 推荐学习顺序

```
Week 1-2:   1.1 prompt-engineering + 1.2 claude-api
Week 3-4:   1.3 openai-api + 1.4 embedding-and-vector-database
Week 5-6:   2.1 agent-architecture + 2.2 function-calling
Week 7-8:   2.3 memory-system + 2.4 rag-system
Week 9:     2.5 prompt-injection-safety
Week 10-11: 3.1 langchain-js + 3.2 langgraph
Week 12-13: 3.3 vercel-ai-sdk + 3.4 mcp-protocol
Week 14:    3.5 crewai-multi-agent
Week 15-16: 4.1 ai-powered-frontend + 4.2 agent-ui-design
Week 17:    4.3 streaming + 4.4 evaluation
Week 18-22: 5.1 production-deployment + 5.2 capstone
```

### 学习方法

1. 📖 **按章节顺序学习** — 不要跳章，每个知识都建立在前面的基础上
2. ⌨️ **代码要亲手敲** — 不要复制粘贴，理解每行代码的含义
3. 🔨 **完成实战练习** — 看懂和会写是两码事
4. 🧠 **做完知识检查点** — 检验自己是否真正理解
5. 🐛 **遇到问题查排错指南** — 附录中有常见问题的解决方案

---

## 📎 附录

每个主题都包含两个附录文件：
- **速查表（Cheatsheet）** — 核心知识点快速回顾
- **排错指南（Troubleshooting）** — 常见问题和解决方案
