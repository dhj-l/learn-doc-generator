# 第1章：项目选择与需求分析

> 预计学习时间：150-180 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **从 4 个 Capstone 项目中选择最适合自己的一个**
- **明确项目的功能范围和里程碑**
- **制定项目时间计划**

## 📋 前置知识

> 建议先完成阶段 1-4 和 [5.1 生产部署](../5.1-production-agent-deployment/README.md)。

---

## 💡 核心概念

### 概念一：Capstone 项目的本质

**生活类比：** Capstone 项目就像烹饪学校的「毕业考试」——前面学过了刀工（提示工程）、火候（API 调用）、调味（工具使用）、摆盘（前端集成），现在需要独立完成一道完整的宴席菜品。

### 概念二：需求分析框架

```
功能需求（必须做）
├── P0: [用户场景] → [系统行为] — 少了产品不可用
├── P1: [用户场景] → [系统行为] — 有更好，没有也能用
└── P2: [锦上添花] — 有时间再做
```

### 概念三：四种项目深度对比

**生活类比：** 选择 Capstone 项目就像选择健身计划。智能代码助手是「力量训练」（见效快），AI 研究助手是「耐力训练」（收益期长），智能客服是「瑜伽」（门槛低），工作流平台是「铁人三项」（全方位挑战）。

#### 选项 A：智能代码助手（⭐⭐⭐）
核心功能：代码分析、代码生成、重构建议、多语言支持
关键 MCP：filesystem / github / 自定义代码分析 Server

#### 选项 B：AI 研究助手（⭐⭐⭐⭐）
核心功能：多源检索、报告生成、多 Agent 协作、来源验证
关键 MCP：web-search / 论文检索 / sequential-thinking

#### 选项 C：智能客服系统（⭐⭐）
核心功能：知识库问答（RAG）、多轮对话、工单系统、人工转接
关键 MCP：filesystem / 自定义检索 / 工单管理 API

#### 选项 D：AI 工作流自动化平台（⭐⭐⭐⭐）
核心功能：可视化编排、自定义工具、执行监控、定时触发
关键 MCP：filesystem / github / 自定义连接器

### 概念四：项目选择决策框架

```typescript
function recommendProject(skills: Skills, interests: Interests, time: number): string {
  if (time < 10) return 'C: 智能客服（最省时）';
  if (interests.workflow > 4) return 'D: 工作流平台（最具挑战）';
  if (interests.codeTools > 4) return 'A: 智能代码助手';
  if (interests.research > 4) return 'B: AI 研究助手';
  return 'C: 智能客服（最稳妥）';
}
```

---

## 🔨 实战演练

**场景描述：** 你的技术栈是 Vue 3 + TypeScript（熟练）、Node.js（熟练）、LangGraph（初学者）。你有 12 小时。你的兴趣是构建实际的开发工具。

**你的任务：** 选择项目 → 编写需求文档（P0/P1/P2）→ 定义 3 个 MCP 工具 → 创建目录结构 → 估算时间分配

<details>
<summary>📖 参考答案</summary>

选择：智能代码助手。理由：Vue 3 熟练 + Node.js 熟练 + 对开发工具感兴趣。

P0: 代码分析、代码生成、文件操作、流式输出
P1: 多语言支持、重构建议、代码搜索
P2: 单元测试、CI/CD、VS Code 插件

目录结构：
```
code-assistant/
├── src/ (components/Editor, ChatPanel, FileTree + agent/ + api/ + stores/)
├── mcp-servers/ (code-search, code-analyzer)
├── package.json + tsconfig.json + README.md
```

时间分配：需求 1h → 架构 2h → 实现 6h → 部署 2h = 11h
</details>

---

## ⚡ 进阶技巧

### 技巧一：在需求阶段就考虑边界情况
### 技巧二：MVP 思维 — 先跑通核心链路

---

## 🧠 知识检查点

<details>
<summary>🧠 Q1：P0 和 P1 需求有什么区别？</summary>
P0：没有这个功能产品不可用。P1：有更好但没有也能用。
</details>
<details>
<summary>🧠 Q2：为什么要先估算时间再开始？</summary>
防止范围蔓延，指导取舍，保持动力。
</details>
<details>
<summary>🧠 Q3：需求分析阶段需要考虑部署方案吗？</summary>
需要！WebSocket 需要独立服务器，大文件上传不适用 Lambda 等。
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 选择了超出能力范围的项目 | 高估技术栈成熟度 | 使用决策矩阵评估 |
| 功能列表太模糊 | 使用主观词汇 | 写成"当用户做X，系统做Y" |
| 时间估算过于乐观 | 只算了编码时间 | 编码:调试:文档 = 5:3:2 |

---

## 📝 本章小结

- ✅ **选择项目** — 实用性 → 可行性 → 挑战性
- ✅ **需求分析** — P0 + P1 + P2 三层清晰分层
- ✅ **MVP 思维** — 先跑通核心链路，再优化体验

## ➡️ 下一章预告

> [第2章：架构设计与技术选型](./02-architecture.md)
