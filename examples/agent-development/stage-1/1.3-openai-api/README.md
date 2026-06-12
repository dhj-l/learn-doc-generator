# 1.3 OpenAI API — OpenAI 及兼容接口完全指南

> 🎯 **学习目标**：掌握 OpenAI API 及其兼容接口（国产模型等）
> ⏱️ **预计学习时间**：7-10 小时
> 📊 **内容规模**：5 章 + 2 附录，约 15,000 字
> ✅ **信息来源**：基于 OpenAI 官方文档 + context7（🟡 标准模式）

---

## 📍 你在学习路线中的位置

```
阶段 1: AI 基础能力
  ✓ 1.1 prompt-engineering
  ✓ 1.2 claude-api
  ► 1.3 openai-api           ← 你在这里
  ○ 1.4 embedding-and-vector-database
```

## 🗺️ 章节导航

| 章节 | 标题 | 核心内容 | 预计时间 |
|------|------|----------|----------|
| [第1章](./chapters/01-chat-completions.md) | Chat Completions API | 基础调用、参数、响应结构 | 60-80 min |
| [第2章](./chapters/02-compatible-models.md) | 国产模型兼容接口 | 通义千问、DeepSeek、GLM 等兼容 API | 70-90 min |
| [第3章](./chapters/03-structured-outputs.md) | 结构化输出 | JSON Schema、Zod 验证、Response Format | 70-90 min |
| [第4章](./chapters/04-multi-model-gateway.md) | 多模型网关设计 | 统一接口抽象、模型路由、降级策略 | 80-100 min |
| [第5章](./chapters/05-capstone-gateway.md) | 综合实战：多模型 API 网关 | 完整的多模型网关实现 | 120-150 min |

## 📎 附录

- [OpenAI API 速查表](./appendix/cheatsheet.md)
- [常见错误排错指南](./appendix/troubleshooting.md)

## 🎓 学完本主题你能做到

- 使用 OpenAI Chat Completions API 构建应用
- 对接国产模型（通义千问、DeepSeek、GLM 等）
- 使用结构化输出获取 JSON 格式数据
- 设计和实现统一的多模型 API 网关
- 理解 Token 计算和成本控制策略
