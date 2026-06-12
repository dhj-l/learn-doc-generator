# CrewAI 速查表

## 🚀 安装

```bash
pip install crewai crewai-tools
```

## 📦 核心组件

| 组件 | 用途 | 关键参数 |
|------|------|----------|
| `Agent` | 角色定义 | role, goal, backstory, tools, llm, allow_delegation |
| `Task` | 任务定义 | description, expected_output, agent, context |
| `Crew` | 团队编排 | agents, tasks, process (sequential/hierarchical), verbose |
| `Tool` | 工具 | BaseTool 继承, _run 方法, args_schema |

## 🔄 Agent 配置

```python
Agent(
    role='研究员',
    goal='深入研究指定主题',
    backstory='你是一位资深研究员。',
    tools=[search_tool],
    llm='claude-3-sonnet',
    max_iter=5,
    allow_delegation=True,  # hierarchical 模式需要
    verbose=True,
)
```

## 📋 Task 配置

```python
Task(
    description='调研 AI Agent 最新趋势',
    expected_output='一份 500 字的研究报告',
    agent=researcher,
    context=[research_task],  # 依赖前置任务
)
```

## 🎬 Crew 执行

```python
crew = Crew(
    agents=[researcher, writer, editor],
    tasks=[research_task, writing_task, editing_task],
    process=Process.sequential,  # 或 Process.hierarchical
    manager_llm='claude-3-sonnet',  # hierarchical 模式需要
    verbose=True,
)
result = crew.kickoff()
```

## 🔧 自定义工具

```python
class MyTool(BaseTool):
    name: str = "工具名"
    description: str = "工具描述"
    args_schema: Type[BaseModel] = MyInput

    def _run(self, ...) -> str:
        # 同步实现
        return result

    async def _arun(self, ...) -> str:
        # 异步实现（可选）
        return result
```

## ⚡ 常用内置工具

| 工具 | 用途 | 来源 |
|------|------|------|
| `SerperDevTool` | 搜索引擎 | crewai-tools |
| `ScrapeWebsiteTool` | 网页抓取 | crewai-tools |
| `GithubSearchTool` | GitHub 搜索 | crewai-tools |
| `YoutubeChannelSearchTool` | YouTube 搜索 | crewai-tools |
