# 第2章：CrewAI 基础 — Python 多 Agent 框架

> 预计学习时间：80-100 分钟

## 💡 核心概念

### CrewAI 安装

```bash
pip install crewai crewai-tools
```

### CrewAI 三大组件

```python
from crewai import Agent, Task, Crew

# 1. Agent — 角色定义
researcher = Agent(
    role='研究员',
    goal='深入研究指定主题，提供准确的信息',
    backstory='你是一位资深研究员，擅长从海量信息中提取关键要点。',
    tools=[search_tool, web_scraper],
    llm='claude-3-sonnet',
)

writer = Agent(
    role='写手',
    goal='根据研究结果撰写高质量的文章',
    backstory='你是一位经验丰富的技术写手，擅长将复杂概念通俗化。',
    llm='claude-3-sonnet',
)

# 2. Task — 任务定义
research_task = Task(
    description='研究 AI Agent 的最新发展趋势',
    expected_output='包含 5 个关键趋势的研究报告',
    agent=researcher,
)

writing_task = Task(
    description='基于研究结果撰写一篇技术博客',
    expected_output='一篇 1000 字的技术文章',
    agent=writer,
    context=[research_task],  # 依赖研究任务的结果
)

# 3. Crew — 团队编排
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    verbose=True,
)

# 执行
result = crew.kickoff()
print(result)
```

---

## 📝 本章小结

- ✅ **Agent** — 定义角色、目标、背景故事
- ✅ **Task** — 定义任务描述、期望输出、执行者
- ✅ **Crew** — 编排 Agent 和 Task 的执行流程
