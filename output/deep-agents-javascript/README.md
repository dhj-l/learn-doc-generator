# LangChain Deep Agents (JavaScript) 从入门到精通

> 基于官方文档 `https://docs.langchain.com/oss/javascript/deepagents/overview` 生成的完整学习教程

---

## 📚 学习路线图

```
📌 学习主题：LangChain Deep Agents (JavaScript)
📌 基于版本：最新稳定版（deepagents >= 1.9.1）
📌 信息来源：🟢 满配模式（context7 官方文档获取）
📌 总章节数：19 章 + 2 附录
📌 总字数：60,000+ 字 | 代码示例：150+ | 实战练习：30+
```

### 🗺️ 学习路线

#### 【基础篇】—— 打好地基

| # | 章节 | 时间 | 核心内容 |
|---|------|------|---------|
| 1 | [概述与环境搭建](chapters/01-introduction.md) | 40min | Harness/Framework/Runtime 三层架构、安装、第一个 Agent |
| 2 | [核心概念与架构](chapters/02-core-concepts.md) | 45min | createDeepAgent 参数、三种调用模式、模型命名 |
| 3 | [工具系统详解](chapters/03-tool-system.md) | 1h | tool() 定义、工具调用循环、ToolRuntime |
| 4 | [多模型提供商集成](chapters/04-model-providers.md) | 45min | 7 种模型配置、调参、OpenRouter、Ollama |
| 5 | [记忆、上下文与系统提示](chapters/05-memory-context.md) | 1h | 三层记忆、MemorySaver、Runtime Context、动态系统提示 |

#### 【进阶篇】—— 掌握核心能力

| # | 章节 | 时间 | 核心内容 |
|---|------|------|---------|
| 6 | [Middleware 系统](chapters/06-middleware.md) | 1h | 六大钩子、动态工具/模型、状态驱动 |
| 7 | [文件系统与 Backend](chapters/07-backend.md) | 1h | 四种 Backend、CompositeBackend 路由 |
| 8 | [沙箱与代码执行](chapters/08-sandbox.md) | 45min | Daytona/Deno 沙箱、代码执行 |
| 9 | [技能系统](chapters/09-skills.md) | 1h | SKILL.md、dcode CLI、技能同步 |
| 10 | [权限控制](chapters/10-permissions.md) | 45min | 声明式规则、多租户隔离 |
| 11 | [子代理与任务委派](chapters/11-subagents.md) | 1h | 子代理架构、CompiledSubAgent、write_todos |
| 12 | [流式传输与实时进度](chapters/12-streaming.md) | 1h | stream/streamEvents、useStream、Headless Tools |

#### 【高级篇】—— 生产就绪

| # | 章节 | 时间 | 核心内容 |
|---|------|------|---------|
| 13 | [ACP 协议与服务端](chapters/13-acp-server.md) | 45min | startServer、DeepAgentsServer、CLI、Zed 集成 |
| 14 | [生产环境部署](chapters/14-production.md) | 1h | LangSmith 托管、langgraph.json、认证、Webhooks |
| 15 | [生态对比与迁移](chapters/15-comparison-migration.md) | 45min | Deep Agents vs Claude SDK、LangChain v1 迁移 |
| 16 | [组件架构与多 Agent 模式](chapters/16-component-architecture.md) | 1h | Router/Handoffs 模式、SQL Agent |

#### 【完整教程项目】

| # | 项目 | 时间 | 实践内容 |
|---|------|------|---------|
| 17 | [深度研究助手](chapters/17-tutorial-research-agent.md) | 3h | 子代理 + 并行搜索 + 结果合成 + 前端 + 部署 |
| 18 | [内容创作 Agent](chapters/18-tutorial-content-agent.md) | 2h | AGENTS.md 写作风格 + 研究 + 撰稿 + 配图 |
| 19 | [数据分析 Agent](chapters/19-tutorial-data-analysis.md) | 2.5h | Python 沙箱 + Pandas + Matplotlib + Slack |

#### 【附录】

| # | 内容 |
|---|------|
| A | [API 速查表](appendix/cheatsheet.md) |
| B | [常见错误排错指南](appendix/troubleshooting.md) |

---

## 🚀 快速开始

```bash
# 1. 安装
npm install deepagents langchain @langchain/core

# 2. 创建 Agent
import { createDeepAgent } from "deepagents";

const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  systemPrompt: "You are a helpful assistant.",
});

# 3. 调用
const result = await agent.invoke({
  messages: [{ role: "user", content: "Hello!" }],
});
```

---

## 📊 统计信息

| 项目 | 数据 |
|------|------|
| 总章节数 | 19 章（含 3 个完整教程项目） |
| 附录 | 2 个 |
| 预计总字数 | 60,000+ |
| 代码示例 | 150+ |
| 实战练习 | 30+ |
| Markdown 文件 | 22 页 |
| 信息来源 | 🟢 满配模式（context7 官方文档同步） |

## 💡 学习建议

1. 📖 **按顺序学习**：基础篇 → 进阶篇 → 高级篇 → 教程项目
2. 💻 **动手实践**：每个代码示例都要亲手敲一遍
3. 🔄 **循序渐进**：完成每章的实战练习再进入下一章
4. 🐛 **遇到问题**：先查看[排错指南](appendix/troubleshooting.md)
5. 📝 **做笔记**：结合自己的项目需求做学习笔记

---

> 文档生成日期：2025 年
> 基于 Deep Agents 官方文档：https://docs.langchain.com/oss/javascript/deepagents/overview
