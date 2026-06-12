# 1.2 Claude API — Anthropic Claude API 完全指南

> 🎯 **学习目标**：熟练使用 Anthropic Claude API 进行应用开发
> ⏱️ **预计学习时间**：9-12 小时
> 📊 **内容规模**：6 章 + 2 附录，约 18,000 字
> ✅ **信息来源**：基于 Anthropic SDK TypeScript 官方文档（context7）

---

## 📍 你在学习路线中的位置

```
阶段 1: AI 基础能力
  ✓ 1.1 prompt-engineering
  ► 1.2 claude-api           ← 你在这里
  ○ 1.3 openai-api
  ○ 1.4 embedding-and-vector-database
```

## 🗺️ 章节导航

| 章节 | 标题 | 核心内容 | 预计时间 |
|------|------|----------|----------|
| [第1章](./chapters/01-api-fundamentals.md) | API 基础 | SDK 安装、初始化、Messages API、模型选择 | 60-80 min |
| [第2章](./chapters/02-multi-turn-conversations.md) | 多轮对话 | 消息历史管理、上下文窗口控制、对话摘要 | 80-100 min |
| [第3章](./chapters/03-streaming.md) | 流式输出 | SSE 流式响应、实时渲染、中断处理 | 80-100 min |
| [第4章](./chapters/04-vision-multimodal.md) | Vision 多模态 | 图像理解、PDF 分析、多模态对话 | 70-90 min |
| [第5章](./chapters/05-advanced-features.md) | 高级特性 | Prompt Caching、Extended Thinking、Batch API | 90-120 min |
| [第6章](./chapters/06-capstone-chat-app.md) | 综合实战：多模型聊天应用 | 完整聊天应用开发 | 120-150 min |

## 📎 附录

- [Claude API 速查表](./appendix/cheatsheet.md)
- [常见错误排错指南](./appendix/troubleshooting.md)

## 🎓 学完本主题你能做到

- 使用 Claude Messages API 构建对话应用
- 实现多轮对话和上下文管理
- 使用流式输出实现实时交互
- 集成 Vision 能力处理图像和 PDF
- 使用 Prompt Caching 优化成本
- 使用 Extended Thinking 进行深度推理
- 构建一个完整的多模型聊天应用

## 📋 前置知识

- [1.1 Prompt Engineering](../1.1-prompt-engineering/README.md) — Prompt 设计基础
- TypeScript 基础 — async/await、模块导入
- HTTP 基础 — 理解 REST API 概念
