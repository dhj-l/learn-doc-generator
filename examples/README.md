# 📂 Examples

此目录包含由 `learn-doc-generator` Skill 实际生成的学习文档示例。

## 可用示例

### [LangChain.js 从入门到精通](./langchain-js/)

基于 LangChain.js 官方文档生成的完整教程，采用 HTML 静态站点格式。

**内容概览：**

| 章节 | 主题 |
|------|------|
| 第1章 | 概述与环境搭建 |
| 第2章 | Agent 基础 |
| 第3章 | 模型（Models） |
| 第4章 | 消息（Messages） |
| 第5章 | 工具（Tools） |
| 第6章 | 流式输出（Streaming） |
| 第7章 | 结构化输出（Structured Output） |
| 第8章 | 中间件（Middleware） |
| 第9章 | 记忆（Memory） |
| 第10章 | 综合实战项目（Capstone） |
| 附录A | API 速查表 |
| 附录B | 常见错误排错指南 |

**本地预览：**

```bash
cd examples/langchain-js

# 方式一：使用 npx
npx serve .

# 方式二：使用 Python
python -m http.server 8080

# 然后访问 http://localhost:8080
```

> ⚠️ 注意：此示例基于较早版本的 Skill 生成（HTML 格式），当前版本 Skill 已默认生成 Markdown 格式。
