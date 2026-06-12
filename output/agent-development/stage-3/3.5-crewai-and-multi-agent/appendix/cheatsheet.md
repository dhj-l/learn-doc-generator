# CrewAI 速查表

## 🚀 安装
```bash
pip install crewai crewai-tools
```

## 📦 核心组件

| 组件 | 用途 |
|------|------|
| Agent | 角色定义（role, goal, backstory） |
| Task | 任务定义（description, expected_output, agent） |
| Crew | 团队编排（agents, tasks, process） |
| Tool | 工具（search, code execution 等） |

## 🔄 执行模式

| 模式 | 说明 |
|------|------|
| sequential | 按顺序执行 |
| hierarchical | 管理者分配 |
