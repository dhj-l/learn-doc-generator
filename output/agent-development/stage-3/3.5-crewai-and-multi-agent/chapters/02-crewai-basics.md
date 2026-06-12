# 第2章：CrewAI 基础 — Python 多 Agent 框架

> 预计学习时间：80-100 分钟

## 🎯 本章目标

完成本章学习后，你将能够：

- ✅ **安装** 并配置 CrewAI 开发环境
- ✅ **理解** CrewAI 三大核心组件：Agent、Task、Crew
- ✅ **编写** 你的第一个多 Agent 协作程序
- ✅ **掌握** 任务依赖与上下文传递机制
- ✅ **调优** Agent 的 LLM 参数和 backstory

## 📋 前置知识

- 熟悉 Python 3.9+ 语法和类型注解
- 理解多 Agent 设计原则（建议先学习 [第1章：Multi-Agent 设计原则](./01-multi-agent-principles.md)）
- 了解基本的 LLM API 调用概念

## 💡 核心概念

### 为什么选择 CrewAI？

CrewAI 是 Python 生态中最流行的多 Agent 框架之一，它的设计哲学是「让多 Agent 协作像组建一个团队一样简单」。如果把第 1 章学到的设计原则比作「建筑设计图」，那么 CrewAI 就是「施工队」——它提供了将设计图变为现实所需的一切工具和材料。

CrewAI 的核心优势：
- **声明式 API**：用简洁的 Python 代码定义 Agent 和 Task
- **内置编排引擎**：自动处理 Agent 间的任务调度和上下文传递
- **丰富的扩展性**：支持自定义工具、回调函数、中间件

### CrewAI 安装

```bash
pip install crewai crewai-tools
```

> 💡 建议在虚拟环境中安装。CrewAI 目前需要 Python 3.9 或更高版本。

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

#### 🎭 Agent（智能体）

Agent 是 CrewAI 中最基本的构建单元。每个 Agent 代表一个具有特定角色、目标和能力的 AI 实体。关键参数详解：

| 参数 | 说明 | 必填 |
|------|------|------|
| `role` | Agent 的角色名称，如「研究员」、「客服专员」 | ✅ |
| `goal` | Agent 的核心目标，指导其行为方向 | ✅ |
| `backstory` | 背景故事，赋予 Agent 「人设」和语境 | ✅ |
| `tools` | Agent 可以使用的工具列表 | ❌ |
| `llm` | 指定使用的大语言模型 | ❌ |
| `verbose` | 是否输出详细日志 | ❌ |

**backstory 的最佳实践：**
好的 backstory 就像给演员一份角色小传，能让 Agent 的表演更加自然连贯。例如：

```
# ❌ 不好的 backstory
backstory='你是一个助手。'

# ✅ 好的 backstory
backstory='你是一位在硅谷工作了 15 年的资深架构师，经历过从单体应用\
到微服务再到云原生的整个技术演进过程，擅长用通俗的语言解释复杂的技术概念。'
```

#### 📋 Task（任务）

Task 定义了 Agent 需要完成的具体工作单元。CrewAI 中的 Task 支持强大的依赖管理：

- **`description`**：详细的任务描述，告诉 Agent 需要做什么
- **`expected_output`**：期望的输出格式说明，帮助 Agent 组织回答
- **`agent`**：负责执行该任务的 Agent
- **`context`**：依赖的其他 Task 列表，框架会自动传递上下文
- **`tools`**：覆盖 Agent 的默认工具集，让特定任务使用不同的工具

#### 🏢 Crew（团队）

Crew 是 Agent 和 Task 的编排器，负责：
1. **任务调度**：根据任务依赖关系确定执行顺序
2. **上下文传递**：自动将前置任务的输出注入到后续任务
3. **结果聚合**：收集所有任务的输出并返回

### verbose 模式详解

```python
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    verbose=True,  # 输出详细的执行日志
)
```

开启 verbose 模式后，你可以在控制台看到：
- 每个 Agent 正在执行的任务
- Agent 的思考过程和中间输出
- LLM 调用的 token 消耗统计
- 任务执行时间

这对于调试和理解 Agent 行为非常有帮助。

## 🔨 实战演练：翻译团队

让我们用 CrewAI 搭建一个多语言翻译团队，展示组件之间的协作。

### 场景描述

需要将一篇英文技术文章翻译为中文、日语和法语，并由一位审校专家统一质量。

```python
from crewai import Agent, Task, Crew

# 定义翻译团队
chinese_translator = Agent(
    role='中英翻译专家',
    goal='将英文技术文档精确翻译为中文',
    backstory='你是一位拥有 10 年经验的技术翻译专家，专精于 AI 领域的中英互译。',
    llm='claude-3-sonnet',
)

japanese_translator = Agent(
    role='日英翻译专家',
    goal='将英文技术文档精确翻译为日语',
    backstory='你是一位精通 AI 术语的日英翻译专家，在东京工作多年。',
    llm='claude-3-sonnet',
)

reviewer = Agent(
    role='质量审校',
    goal='检查翻译质量，确保术语一致性',
    backstory='你是一位技术文档质量经理，擅长多语言翻译的质量控制。',
    llm='claude-3-sonnet',
)

# 定义任务
translate_cn = Task(
    description='将以下英文文章翻译为中文：{article}',
    expected_output='流畅准确的中文翻译',
    agent=chinese_translator,
)

translate_jp = Task(
    description='将以下英文文章翻译为日语：{article}',
    expected_output='自然地道的日语翻译',
    agent=japanese_translator,
)

review_task = Task(
    description='审校中译和日译的质量，检查术语一致性',
    expected_output='包含修改建议的质量报告',
    agent=reviewer,
    context=[translate_cn, translate_jp],
)

# 组建团队并执行
translation_crew = Crew(
    agents=[chinese_translator, japanese_translator, reviewer],
    tasks=[translate_cn, translate_jp, review_task],
    verbose=True,
)

result = translation_crew.kickoff(inputs={'article': '...'})
print(result)
```

## ⚡ 进阶技巧

### LLM 参数详解

```python
researcher = Agent(
    role='研究员',
    goal='...',
    backstory='...',
    llm='claude-3-sonnet',
    llm_config={
        'temperature': 0.3,   # 越低越确定，适合事实性任务
        'max_tokens': 4096,   # 控制生成长度
        'top_p': 0.9,        # 采样策略
    },
)
```

- **temperature**：创意型任务（头脑风暴、文案创作）可设 0.7-0.9，事实型任务（数据提取、分类）设 0.0-0.3
- **max_tokens**：根据任务的预期输出长度调整，避免被截断
- **top_p**：通常与 temperature 配合使用，一般保持默认即可

### verbose 模式的应用

开发阶段始终开启 verbose=True，进入生产环境后关闭。verbose 输出的信息包括：
- Agent 的任务分配情况
- 每一步的输入输出
- 错误和异常信息
- Token 消耗统计

### backstory 的最佳实践

1. **包含专业背景**：告诉 Agent 它有什么经验
2. **设定沟通风格**：正式、友好、幽默等
3. **明确价值观**：Agent 应该遵循什么原则
4. **给予身份认同**：让 Agent 对自己的「专业身份」有自豪感

## 🧠 知识检查点

1. CrewAI 的三大组件是什么？它们之间的关系如何？
2. Task 的 `context` 参数有什么作用？如果不设置会发生什么？
3. 为什么说 backstory 是 Agent 设计中「性价比最高」的参数？
4. 如何在 Crew 中实现并行执行多个独立任务？

## 🐛 常见错误

- ❌ **忘记安装依赖**：某些工具需要额外的 Python 包，需提前安装
- ❌ **LLM 配置错误**：API key 未设置或模型名称拼写错误
- ❌ **上下文断裂**：Task 的 context 遗漏了某个依赖任务，导致 Agent 缺少关键信息
- ❌ **角色冲突**：多个 Agent 的角色定义过于相似，导致行为雷同失去分工意义
- ❌ **verbose 过度依赖**：生产环境开启 verbose 可能导致日志过多和性能下降

## 📝 本章小结

- ✅ **Agent** — 定义角色、目标、背景故事，是系统的基本智能单元
- ✅ **Task** — 定义任务描述、期望输出、执行者，支持上下文依赖
- ✅ **Crew** — 编排 Agent 和 Task 的执行流程，是系统的调度中枢
- ✅ **实战演练** — 通过翻译团队案例完整演示了 CrewAI 的使用流程
- ✅ **进阶技巧** — LLM 参数调优、verbose 调试、backstory 打磨

CrewAI 让多 Agent 系统的搭建变得前所未有的简单。下一章我们将在此基础上，学习如何编写自定义工具来扩展 Agent 的能力边界。

## ➡️ 下一章预告

> [第3章：CrewAI 工具与高级用法](./03-crewai-tools.md) — 学习如何编写自定义工具、使用工具链、以及 CrewAI 的高级编排功能
