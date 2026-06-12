# 前端工程师 Agent 开发学习目录

> 面向有前端基础（Vue/React + TypeScript）的开发者
> 目标：系统掌握 AI Agent 开发能力，成为「前端 + Agent」全栈 AI 工程师
> 学习方式：使用 `/learn` 命令逐个生成每个主题的详细学习文档

---

## 学习路线总览

```
阶段 1: AI 基础能力（必修）
├── 1.1 prompt-engineering
├── 1.2 claude-api
├── 1.3 openai-api
└── 1.4 embedding-and-vector-database

阶段 2: Agent 核心技术（必修）
├── 2.1 agent-architecture-and-design
├── 2.2 function-calling-and-tool-use
├── 2.3 memory-system
├── 2.4 rag-system
└── 2.5 prompt-injection-and-safety

阶段 3: Agent 框架实战（必修）
├── 3.1 langchain-js
├── 3.2 langgraph
├── 3.3 vercel-ai-sdk
├── 3.4 mcp-model-context-protocol
└── 3.5 crewai-and-multi-agent

阶段 4: 前端 + Agent 融合（进阶）
├── 4.1 ai-powered-frontend
├── 4.2 agent-ui-design
├── 4.3 streaming-and-real-time
└── 4.4 agent-evaluation-and-observability

阶段 5: 综合实战（收尾）
├── 5.1 production-agent-deployment
└── 5.2 capstone-ai-agent-project
```

---

## 阶段 1: AI 基础能力

> 目标：理解 LLM 的工作方式，掌握与 AI 模型交互的核心技能

### 1.1 prompt-engineering

**学习目标：** 掌握 Prompt Engineering 的核心方法论

**核心内容：**
- LLM 基本原理：Transformer、Token、上下文窗口、Temperature
- Prompt 设计原则：清晰、具体、结构化
- 核心技巧：Zero-shot、Few-shot、Chain-of-Thought (CoT)、ReAct prompting
- System Prompt 设计：角色设定、输出格式约束、能力边界定义
- Prompt 模板化与管理：变量注入、条件分支、版本控制
- 高级技巧：Self-Consistency、Tree-of-Thought、Meta-Prompting

**实战项目：** 构建一个 Prompt 模板管理系统

---

### 1.2 claude-api

**学习目标：** 熟练使用 Anthropic Claude API 进行应用开发

**核心内容：**
- Claude API 基础：Messages API、模型选择（Haiku/Sonnet/Opus）
- 多轮对话实现：消息历史管理、上下文窗口控制
- Streaming 流式输出：实时返回生成内容
- Prompt Caching：缓存机制与成本优化
- Vision 多模态：图像理解与分析
- Extended Thinking：深度推理模式
- Batch API：批量处理与成本优化
- 错误处理与重试策略、速率限制管理

**实战项目：** 开发一个多模型聊天应用（支持 Claude 全系列模型）

---

### 1.3 openai-api

**学习目标：** 掌握 OpenAI API 及其兼容接口的使用

**核心内容：**
- OpenAI Chat Completions API
- 国产模型兼容接口（通义千问、DeepSeek、GLM 等都兼容 OpenAI 格式）
- Responses API 与结构化输出（Structured Outputs）
- 多模型网关设计：统一接口抽象、模型路由、降级策略
- 成本控制：Token 计算、预算管理、模型选择策略

**实战项目：** 构建一个统一的多模型 API 网关

---

### 1.4 embedding-and-vector-database

**学习目标：** 理解向量化原理，掌握向量数据库的使用

**核心内容：**
- Embedding 原理：文本转向量、语义空间、相似度计算
- 主流 Embedding 模型：OpenAI text-embedding-3、Cohere embed、BGE
- 向量数据库实战：
  - ChromaDB（轻量本地，适合原型开发）
  - Pinecone（云托管，适合生产环境）
  - Milvus/Zilliz（高性能，适合大规模场景）
- 相似度搜索：余弦相似度、欧氏距离、混合检索
- 分块策略：固定长度、语义分块、递归分块

**实战项目：** 构建一个语义搜索系统

---

## 阶段 2: Agent 核心技术

> 目标：理解 Agent 的本质，掌握构建 Agent 的核心组件

### 2.1 agent-architecture-and-design

**学习目标：** 深入理解 AI Agent 的架构设计原理

**核心内容：**
- Agent 定义：感知→推理→行动 循环
- 经典架构模式：
  - ReAct（Reasoning + Acting）
  - Plan-and-Execute（规划执行分离）
  - Reflexion（自我反思与改进）
- Agent Loop 设计：循环控制、退出条件、最大迭代限制
- 状态管理：Agent 状态机、工作流状态
- 单 Agent vs Multi-Agent 选型决策
- 错误处理与恢复策略

**实战项目：** 手写一个 ReAct Agent（不依赖框架）

---

### 2.2 function-calling-and-tool-use

**学习目标：** 掌握让 Agent 调用外部工具的完整技术栈

**核心内容：**
- Function Calling 原理：工具描述、参数 Schema、调用链
- Claude Tool Use vs OpenAI Function Calling 的差异
- 工具设计最佳实践：
  - 工具粒度：单一职责 vs 复合工具
  - 参数设计：JSON Schema、枚举约束、默认值
  - 错误反馈：如何让模型理解工具执行失败
- 常见工具类型：
  - 数据查询工具（数据库、API）
  - 操作执行工具（发送邮件、创建文件）
  - 计算推理工具（代码执行、数学计算）
  - 外部服务工具（搜索、天气、地图）
- 并行工具调用与顺序工具调用

**实战项目：** 构建一个具备 5+ 工具的智能助手

---

### 2.3 memory-system

**学习目标：** 为 Agent 设计和实现记忆系统

**核心内容：**
- 记忆分类：
  - 短期记忆（对话上下文、滑动窗口）
  - 长期记忆（持久化存储、向量检索）
  - 工作记忆（当前任务上下文、中间结果）
- 对话历史管理：摘要压缩、选择性保留、Token 预算控制
- 长期记忆实现：向量存储、记忆检索、记忆更新与遗忘
- 知识图谱基础：实体关系提取、图查询
- Mem0、Zep 等记忆管理框架

**实战项目：** 构建一个带持久记忆的个人 AI 助手

---

### 2.4 rag-system

**学习目标：** 构建生产级 RAG（检索增强生成）系统

**核心内容：**
- RAG 基础架构：Indexing → Retrieval → Generation
- 文档处理管线：加载 → 清洗 → 分块 → 嵌入 → 存储
- 检索策略：
  - 语义检索（向量相似度）
  - 关键词检索（BM25）
  - 混合检索（Hybrid Search）
  - 重排序（Reranking）
- 高级 RAG 技术：
  - Query 改写与扩展
  - 上下文压缩
  - Self-RAG / Corrective-RAG / Adaptive-RAG
  - Multi-hop RAG（多跳检索）
- 多模态 RAG：图片、表格、PDF 处理
- 评估指标：Faithfulness、Relevancy、Context Recall

**实战项目：** 构建一个企业知识库问答系统

---

### 2.5 prompt-injection-and-safety

**学习目标：** 理解 Agent 安全威胁并掌握防御方法

**核心内容：**
- Prompt Injection 攻击：直接注入、间接注入、越狱
- 防御策略：
  - 输入过滤与清洗
  - 输出验证与约束
  - 权限最小化原则
  - 人机协作确认机制
- Agent 安全设计：
  - 工具调用权限控制
  - 操作沙箱化
  - 敏感操作审批流程
  - 输出内容审核
- Guardrails 框架：NeMo Guardrails、Guardrails AI

**实战项目：** 为已有的 Agent 添加安全防护层

---

## 阶段 3: Agent 框架实战

> 目标：熟练使用主流 Agent 框架，掌握 MCP 协议

### 3.1 langchain-js

**学习目标：** 使用 LangChain.js（TypeScript）构建 LLM 应用

**核心内容：**
- LangChain.js 核心概念：Model、Prompt、Chain、Memory
- LCEL（LangChain Expression Language）链式调用
- Output Parsers：结构化输出解析
- Document Loaders：网页、PDF、数据库等数据源
- Text Splitters：多种分块策略实现
- Retrievers：向量检索、混合检索
- Callbacks：日志、监控、调试
- LangSmith：调试与可观测性

**实战项目：** 使用 LangChain.js 构建一个文档问答助手

---

### 3.2 langgraph

**学习目标：** 使用 LangGraph 构建复杂的 Agent 工作流

**核心内容：**
- LangGraph 核心概念：State、Node、Edge、Conditional Edge
- 有向图执行模型：状态机驱动的 Agent
- 内置 Agent 架构：ReAct Agent、Plan-and-Execute Agent
- 人机协作模式：Human-in-the-Loop、中断与恢复
- 子图与模块化：复杂 Agent 的拆分与组合
- 持久化与检查点：状态快照、断点恢复
- Multi-Agent 系统：
  - Supervisor 模式（管理者调度）
  - Hierarchical 模式（层级分工）
  - Network 模式（对等通信）

**实战项目：** 构建一个 Multi-Agent 研究助手系统

---

### 3.3 vercel-ai-sdk

**学习目标：** 使用 Vercel AI SDK 在前端项目中集成 AI 能力

**核心内容：**
- AI SDK Core：统一的 LLM 调用接口（generateText、streamText、generateObject）
- AI SDK UI：useChat、useCompletion 等 React/Vue Hooks
- 多模型支持：OpenAI、Anthropic、Google、Mistral 等
- Streaming 实现：流式文本、流式对象
- 工具调用集成：前端触发后端工具执行
- RSC（React Server Components）集成
- 与 Next.js / Nuxt 深度集成
- Agent Loop 实现：多步工具调用循环

**实战项目：** 开发一个全栈 AI 聊天应用（Next.js + Vercel AI SDK）

---

### 3.4 mcp-model-context-protocol

**学习目标：** 掌握 MCP 协议，构建标准化的 Agent 工具生态

**核心内容：**
- MCP 协议概述：架构设计、Client-Server 模型
- MCP Server 开发：
  - Tools（工具定义与实现）
  - Resources（资源暴露与检索）
  - Prompts（预置 Prompt 模板）
- TypeScript MCP SDK：@modelcontextprotocol/sdk
- MCP Client 集成：在 Agent 中连接 MCP Server
- 传输协议：stdio、HTTP SSE、Streamable HTTP
- 实战 Server 开发：
  - 文件系统 Server
  - 数据库查询 Server
  - API 集成 Server
- MCP 生态：Claude Desktop、Cursor、Claude Code 等 Host 集成

**实战项目：** 开发 3 个实用的 MCP Server 并集成到 Agent 中

---

### 3.5 crewai-and-multi-agent

**学习目标：** 掌握多 Agent 协作系统的设计与实现

**核心内容：**
- Multi-Agent 系统设计原则：角色定义、任务分配、通信机制
- CrewAI 框架：
  - Agent 定义：Role、Goal、Backstory
  - Task 设计：Description、Expected Output、Tools
  - Crew 编排：Sequential、Hierarchical
  - 自定义工具集成
- AutoGen（Microsoft）：对话式多 Agent 框架
- A2A（Agent-to-Agent）通信协议
- 多 Agent 编排模式：
  - 流水线模式（Pipeline）
  - 辩论模式（Debate）
  - 投票模式（Voting）
  - 分工协作模式（Division of Labor）

**实战项目：** 构建一个 AI 内容生产团队（研究员 + 写手 + 编辑）

---

## 阶段 4: 前端 + Agent 融合

> 目标：将 Agent 能力融入前端应用，打造 AI-Native 产品体验

### 4.1 ai-powered-frontend

**学习目标：** 在前端应用中深度集成 AI 能力

**核心内容：**
- AI-Native UI 模式：Chat Interface、Copilot、Agent Dashboard
- 前端 AI 推理：浏览器端模型运行（Transformers.js、ONNX Runtime Web）
- AI 组件库设计：智能搜索、AI 表单、智能推荐
- 状态管理：AI 状态与 UI 状态的同步
- 边缘 AI：Edge Runtime 上的 AI 推理
- 前端安全：API Key 保护、输入净化、CORS 策略

**实战项目：** 开发一个 AI-Native 的项目管理工具

---

### 4.2 agent-ui-design

**学习目标：** 设计优秀的 Agent 交互界面

**核心内容：**
- Agent 交互模式设计：
  - 对话式界面（Chat UI）
  - 任务面板（Task Panel）
  - 工作流可视化（Workflow Visualization）
  - 混合交互模式
- Agent 状态展示：思考中、执行中、等待确认、完成
- 工具调用可视化：展示 Agent 的推理过程和工具使用
- 错误状态与降级体验设计
- 人机协作界面：确认对话框、参数编辑、操作预览
- 实时反馈：打字机效果、进度条、步骤指示器

**实战项目：** 设计并实现一个 Agent 可视化控制台

---

### 4.3 streaming-and-real-time

**学习目标：** 掌握 AI 应用中的流式传输和实时通信

**核心内容：**
- SSE（Server-Sent Events）：AI 流式输出的标准方案
- WebSocket：双向实时通信
- 流式 JSON 解析：处理不完整的 JSON 增量
- 后端流式代理：Node.js 转发 LLM 流式响应
- 前端流式渲染：逐步展示、Markdown 流式解析
- 断线重连与状态恢复
- 性能优化：背压控制、缓冲策略

**实战项目：** 实现一个支持流式输出的 AI 对话应用

---

### 4.4 agent-evaluation-and-observability

**学习目标：** 建立 Agent 质量评估和监控体系

**核心内容：**
- Agent 评估维度：
  - 任务完成率
  - 推理质量
  - 工具使用准确性
  - 响应延迟
  - Token 消耗
- 评估方法：
  - 自动化评估（LLM-as-Judge）
  - 人工评估
  - A/B 测试
  - 基准测试（Benchmark）
- 可观测性工具：
  - LangSmith / LangFuse（Agent 追踪与调试）
  - Weights & Biases（实验追踪）
  - 自建 Dashboard
- 生产监控：日志、告警、异常检测
- 成本优化：模型路由、缓存策略、Token 预算

**实战项目：** 为已有 Agent 项目添加完整的监控与评估体系

---

## 阶段 5: 综合实战

> 目标：将所学知识整合到完整的生产级项目中

### 5.1 production-agent-deployment

**学习目标：** 掌握 Agent 应用的生产部署能力

**核心内容：**
- 架构设计：前后端分离的 Agent 服务架构
- 后端部署：
  - Serverless（Vercel Functions、AWS Lambda、Cloudflare Workers）
  - 容器化（Docker + Kubernetes）
  - 长连接服务（WebSocket Server）
- 前端部署：Vercel、Cloudflare Pages、自建 Nginx
- 数据库选型：PostgreSQL + pgvector、Redis、向量数据库
- CI/CD：自动化测试、部署流水线
- 扩展性设计：队列、异步任务、并发控制
- 成本控制与优化策略

**实战项目：** 将 Agent 应用部署到生产环境

---

### 5.2 capstone-ai-agent-project

**学习目标：** 独立完成一个完整的 AI Agent 产品

**项目建议（任选其一）：**

**选项 A：智能代码助手**
- 代码分析、Bug 检测、代码生成
- 支持多语言、上下文感知
- IDE 集成（VS Code 插件）

**选项 B：AI 研究助手**
- 多源信息检索与整合
- 自动化报告生成
- 多 Agent 协作研究

**选项 C：智能客服系统**
- 知识库驱动的问答
- 多轮对话与意图理解
- 工单创建与流转

**选项 D：AI 工作流自动化平台**
- 可视化 Agent 编排
- 自定义工具与连接器
- 执行监控与日志

**技术要求：**
- 前端：Vue 3 / React + TypeScript
- 后端：Node.js / Python
- Agent：LangGraph / Vercel AI SDK
- 工具：MCP Server
- 部署：云端部署，可公开访问

---

## 学习顺序建议

```
推荐顺序（可穿插进行）：

Week 1-2:  1.1 prompt-engineering + 1.2 claude-api
Week 3-4:  1.3 openai-api + 1.4 embedding-and-vector-database
Week 5-6:  2.1 agent-architecture-and-design + 2.2 function-calling-and-tool-use
Week 7-8:  2.3 memory-system + 2.4 rag-system
Week 9:    2.5 prompt-injection-and-safety
Week 10-11: 3.1 langchain-js + 3.2 langgraph
Week 12-13: 3.3 vercel-ai-sdk + 3.4 mcp-model-context-protocol
Week 14:   3.5 crewai-and-multi-agent
Week 15-16: 4.1 ai-powered-frontend + 4.2 agent-ui-design
Week 17:   4.3 streaming-and-real-time + 4.4 agent-evaluation-and-observability
Week 18-22: 5.1 production-agent-deployment + 5.2 capstone-ai-agent-project
```

---

## 使用方式

逐个主题生成详细学习文档：

```
/learn prompt-engineering
/learn claude-api
/learn agent-architecture-and-design
...
```

每个主题都会生成完整的 Markdown 学习文档，包含理论讲解、代码示例、实战练习。

---

> 最后更新：2026-06-11
