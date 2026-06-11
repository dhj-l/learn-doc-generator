# 第3-6章概要

## 第3章：自定义工具集成

```python
from crewai.tools import BaseTool

class DatabaseQueryTool(BaseTool):
    name: str = "数据库查询"
    description: str = "查询数据库中的数据"

    def _run(self, query: str) -> str:
        # 执行数据库查询
        return results
```

## 第4章：编排模式

| 模式 | 适用 | CrewAI 配置 |
|------|------|-------------|
| Sequential | 流水线 | `process='sequential'` |
| Hierarchical | 层级管理 | `process='hierarchical'` |

## 第5章：A2A 通信协议

Google 提出的 Agent-to-Agent 标准化通信协议。

## 第6章：综合实战 — AI 内容团队

构建一个研究员 + 写手 + 编辑的 AI 内容生产团队。

---

## 📎 附录

[速查表](../appendix/cheatsheet.md) | [排错指南](../appendix/troubleshooting.md)
