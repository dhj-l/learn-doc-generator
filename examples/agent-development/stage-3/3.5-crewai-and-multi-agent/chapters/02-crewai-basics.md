# 第2章：CrewAI 基础 — Python 多 Agent 框架

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 CrewAI 框架的定位** — 知道它和 LangChain/LangGraph 的区别
- **掌握 Agent、Task、Crew 三大核心组件** — 会用 Python 定义和组合
- **编写一个简单的 CrewAI 多 Agent 程序** — 让两个 Agent 协作完成任务
- **为自定义工具和高级编排做好准备**

## 📋 前置知识

> 建议先完成：
> - [第1章：Multi-Agent 设计原则](./01-multi-agent-principles.md) — 理解角色、任务、通信三大要素

---

## 💡 核心概念

### 安装

CrewAI 是一个 Python 框架，安装非常简单。核心包 crewai 提供了 Agent、Task、Crew 等基础组件，而 crewai-tools 则包含了一系列预置的工具，比如搜索引擎接入（SerperDevTool）、网页抓取（ScrapeWebsiteTool）、GitHub 搜索（GithubSearchTool）等。如果你只需要基础的多 Agent 编排功能，只安装 crewai 就足够了。当你的 Agent 需要调用外部工具时，再安装 crewai-tools 来使用这些预置的工具集成。

```bash
pip install crewai crewai-tools
```

安装完成后，你可以在 Python 代码中通过 `from crewai import Agent, Task, Crew` 来导入这些核心类。CrewAI 底层依赖 LangChain 来与各种 LLM 模型交互，所以安装 crewai 时会自动安装 langchain 及其相关依赖。

### CrewAI 三大组件

CrewAI 围绕三个核心概念来组织多 Agent 系统——Agent（智能体）、Task（任务）和 Crew（团队）。这三个组件的设计哲学是：把复杂的工作流程拆解成一个个独立的职能单元（Agent），每个单元负责特定的工作内容（Task），然后通过一个统一的调度器（Crew）来协调这些单元之间的协作关系。

这种设计的优势在于关注点分离——你可以独立地定义每个 Agent 的性格和能力，独立地描述每个 Task 的目标和要求，然后再把它们组合在一起。这意味着修改一个 Agent 的角色描述不会影响其他 Agent 的配置，增加一个新的 Task 也不需要重写已有的代码。这种模块化的设计让 CrewAI 非常适合构建长期维护的多 Agent 系统，因为每次需求变更只需要修改对应的组件即可。

为了更好地理解这三个组件，我们来看一个具体的例子。假设我们要创建一个「技术内容创作团队」，由研究员和写手两个角色组成。研究员负责深入调研某个技术主题并整理出关键信息，写手则基于研究员提供的信息撰写一篇通俗易懂的文章。这个例子虽然简单，但它包含了多 Agent 协作的所有核心要素——角色分工、任务依赖、结果传递。

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

**代码分析：** 在上面的例子中，我们首先创建了两个 Agent——researcher 负责调研，writer 负责写作。每个 Agent 都通过 `role` 定义了身份，通过 `goal` 明确了目标，通过 `backstory` 设定了专业背景。这些参数共同构成了 Agent 的系统提示，决定了它在执行任务时的行为风格和思考方式。注意 researcher 的 `tools` 参数传入了一个工具列表——这意味着它可以在执行过程中调用外部工具来获取信息，这是 Agent 与普通 LLM 调用的关键区别之一。

接着我们创建了两个 Task——research_task 描述了需要调研的内容和预期输出，writing_task 则定义了写作任务。注意 writing_task 的 `context` 参数引用了 research_task，这意味着 CrewAI 会先执行 research_task，然后把它的输出作为上下文传递给 writing_task。这种依赖关系机制是实现多步骤工作流的基础。如果不设置 context，两个 Task 会同时执行，writing_task 就无法获取 research_task 的结果。

最后，我们通过 Crew 将 Agent 和 Task 组合在一起，调用 `kickoff()` 方法启动执行。CrewAI 会自动按照 Task 的依赖关系安排执行顺序，并把每个 Agent 的输出传递给下游 Task。`verbose=True` 参数让执行过程在控制台输出详细的日志信息，方便我们了解每个步骤的执行情况。

---

## 🔨 实战演练

### 练习：构建一个技术翻译团队

**场景描述：** 你有一个英文技术文档需要翻译成中文，同时希望保持技术准确性。你需要两个 Agent 协作：一个翻译员负责初译，一个审校员负责检查术语和流畅度。这个场景在真实开发中非常常见——技术文档、API 变更日志、开源项目 README 的翻译都需要多人协作才能保证质量。

**为什么用 CrewAI 而不是手动处理？** 传统工作流中，你需要先发给翻译员，等回复，再发给审校员，再等回复，整个过程可能需要数天。使用 CrewAI 的 Pipeline 模式，两个 Task 按顺序自动执行，整个流程在几分钟内完成，而且 Agent 之间通过 context 参数自动传递翻译结果，无需人工干预。

**你的任务：** 使用 CrewAI 的 Agent、Task、Crew 三个组件，构建这个翻译团队。

<details>
<summary>🧑‍💻 参考答案</summary>

```python
from crewai import Agent, Task, Crew

# Agent 1：翻译员
translator = Agent(
    role='技术翻译员',
    goal='将英文技术文档准确翻译为中文',
    backstory='你是一位有 10 年经验的技术翻译，精通计算机术语，
擅长在保持技术准确性的同时让译文自然流畅。',
    llm='claude-3-sonnet',
)

# Agent 2：审校员
reviewer = Agent(
    role='技术审校员',
    goal='检查译文的术语准确性和语言流畅度',
    backstory='你是一位资深技术编辑，精通中英双语，
擅长发现翻译中的术语错误和表达问题。',
    llm='claude-3-sonnet',
)

# Task 1：翻译
translation_task = Task(
    description='将以下英文文档翻译为中文，保持技术术语的准确性：
"""
ReAct (Reasoning + Acting) is a pattern where an LLM
iteratively thinks about what action to take, executes it,
and observes the result before deciding the next step.
"""',
    expected_output='准确流畅的中文翻译，保留所有技术术语的英文原名',
    agent=translator,
)

# Task 2：审校
review_task = Task(
    description='检查翻译结果的术语准确性和语言流畅度，
修正任何不准确或不自然的表达',
    expected_output='经过审校的最终中文翻译，附带修改说明',
    agent=reviewer,
    context=[translation_task],
)

# Crew 编排
crew = Crew(
    agents=[translator, reviewer],
    tasks=[translation_task, review_task],
    verbose=True,
)

result = crew.kickoff()
print('=== 最终翻译结果 ===')
print(result)
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：Agent 的 llm 参数详解

| 参数值 | 说明 |
|--------|------|
| `'claude-3-sonnet'` | Claude 3 Sonnet（平衡性价比） |
| `'claude-3-haiku'` | Claude 3 Haiku（快速廉价） |
| `'gpt-4o'` | OpenAI GPT-4o |
| `'gpt-4o-mini'` | OpenAI GPT-4o Mini（廉价版） |
| 自定义 provider | 通过 langchain 集成其他模型 |

### 技巧二：Crew 的 verbose 模式

`verbose=True` 可以输出每个 Agent 的思考过程和工具调用日志，对调试非常有帮助。生产环境中建议关闭或设置为 `verbose=False`，因为 verbose 输出会增加 Token 消耗，而且在生产环境中我们通常使用专门的日志收集系统来记录 Agent 的执行情况，而不是依赖控制台输出。

### 技巧三：Agent 配置的最佳实践

为 Agent 编写 backstory 时，有几点值得注意。首先，backstory 应该具体而不泛泛——不要写「你是一个有用的助手」，而要写「你是一位有十年经验的 Python 后端工程师，精通 FastAPI 和 PostgreSQL，擅长设计高并发系统架构」。越具体的 backstory，Agent 的行为就越可控。

其次，Agent 的 goal 应该与 Task 的 expected_output 对齐。如果 goal 要求「提供准确信息」，但 Task 要求「生成创意文案」，Agent 可能会在两个目标之间摇摆不定。好的做法是让 goal 描述 Agent 的长期使命，让 Task 描述当前的具体任务，两者互补而不冲突。

最后，合理设置 max_iter 参数（默认为 15）可以避免 Agent 陷入无限循环。对于大多数任务，3-5 次迭代已经足够。如果 Agent 在 5 次迭代后仍未完成任务，通常说明提示词不够明确，而不是迭代次数不够。

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：CrewAI 的三大核心组件是什么？各自的作用是什么？**

> A：Agent（角色定义）——设定 AI 的身份、目标和背景故事；Task（任务定义）——描述要完成的具体任务和期望输出；Crew（团队编排）——将 Agent 和 Task 组织在一起，控制执行流程。

**Q2：Task 的 context 参数有什么作用？**

> A：context 参数定义了 Task 之间的依赖关系。下游 Task 通过 context 引用上游 Task，Crew 会确保上游 Task 先执行，并将上游的输出传递给下游。

**Q3：Agent 的 backstory 为什么重要？**

> A：backstory 是 Agent 的系统提示核心，它定义了 Agent 的专业背景和行为风格。一个详细的 backstory 能让 Agent 更好地理解自己的角色，输出更符合预期的内容。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Agent 忽略了自己的角色 | backstory 不够具体 | 在 backstory 中加入具体经验和专长描述 |
| Task 输出不符合预期 | expected_output 太模糊 | 给出明确的输出格式和示例 |
| Crew 执行顺序混乱 | Task 的 context 依赖缺失 | 检查每个 Task 的 context 参数 |
| API Key 错误 | 环境变量未设置 | 检查 ANTHROPIC_API_KEY 等环境变量 |
| 多个 Task 使用同一个 Agent 实例 | Agent 的状态被后续 Task 覆盖 | 不同角色的任务使用不同的 Agent 实例 |

---

## 📝 本章小结

- ✅ **Agent** — 定义角色、目标、背景故事，是系统的基本智能单元
- ✅ **Task** — 定义任务描述、期望输出、执行者，通过 context 参数建立依赖关系
- ✅ **Crew** — 编排 Agent 和 Task 的执行流程，控制协作方式

## ➡️ 下一章预告

> 在下一章中，我们将学习如何给 CrewAI Agent 添加自定义工具，让 Agent 能够搜索网络、读写文件、调用 API——从一个「只能说话」的 Agent 变成一个「能动手」的 Agent。
> [第3章：CrewAI 自定义工具集成](./03-crewai-tools.md)
