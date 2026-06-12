# 第4章：多 Agent 编排模式 — Pipeline、Debate、Voting 与 Hierarchical

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解四种编排模式** — Pipeline（流水线）、Debate（辩论）、Voting（投票）、Hierarchical（层级管理）
- **在 CrewAI 中配置不同的 process 模式** — sequential 和 hierarchical
- **根据业务场景选择合适的编排模式** — 知道什么时候用哪种
- **实现自定义编排流程** — 在标准模式基础上做定制

## 📋 前置知识

> 建议先完成：
> - [第2章：CrewAI 基础](./02-crewai-basics.md) — 掌握 Agent、Task、Crew 基础
> - [第3章：自定义工具集成](./03-crewai-tools.md) — 了解如何给 Agent 配工具

---

## 💡 核心概念

### 为什么需要编排模式？

**生活类比：** 一个乐队（多 Agent 系统）需要有人指挥才能演奏和谐的乐章。编排模式就是「乐队指挥的风格」：
- 🎵 **Pipeline** — 像接力赛，一个人唱完下一人接上（流水线）
- 🎵 **Debate** — 像辩论赛，正反方交锋，裁判定胜负（辩论）
- 🎵 **Voting** — 像评委打分，每人独立评分取平均（投票）
- 🎵 **Hierarchical** — 像交响乐团，指挥分配任务，乐手各司其职（层级管理）

### Pipeline（流水线）模式

Pipeline 是最常用的模式——Agent 按顺序执行，每个人的输出是下个人的输入。

```
研究员 → 写手 → 编辑
  ↓        ↓       ↓
 报告     文章     发布稿
```

```python
from crewai import Agent, Task, Crew, Process

# Agent 1：研究员
researcher = Agent(
    role='研究员',
    goal='收集和整理主题相关信息',
    backstory='你擅长从多个来源提取关键信息。',
)

# Agent 2：写手
writer = Agent(
    role='技术写手',
    goal='将研究结果写成易读的文章',
    backstory='你擅长将复杂概念转化为通俗易懂的文字。',
)

# Agent 3：编辑
editor = Agent(
    role='编辑',
    goal='审核文章质量，修正错误',
    backstory='你是一位严谨的编辑，对语言准确性和逻辑性要求极高。',
)

# Task 1：研究（独立）
research_task = Task(
    description='研究「向量数据库在 RAG 中的应用」',
    expected_output='一份 500 字的研究摘要，包含关键技术和最佳实践',
    agent=researcher,
)

# Task 2：写作（依赖研究结果）
writing_task = Task(
    description='基于研究结果撰写技术博客',
    expected_output='一篇 800 字的博客文章',
    agent=writer,
    context=[research_task],  # 关键：依赖前一个任务
)

# Task 3：编辑（依赖写作结果）
editing_task = Task(
    description='审核文章，修正语法错误和逻辑问题',
    expected_output='最终发布版本的文章',
    agent=editor,
    context=[writing_task],  # 依赖写手任务
)

# Crew：按顺序执行
crew = Crew(
    agents=[researcher, writer, editor],
    tasks=[research_task, writing_task, editing_task],
    process=Process.sequential,  # 流水线模式
    verbose=True,
)

result = crew.kickoff()
```

**💡 什么时候用 Pipeline？** 当任务之间有明确的依赖关系时（先研究才能写、先写才能编辑），Pipeline 是最自然的选择。注意 `context=[...]` 参数——它定义了任务之间的数据流动方向。

### Debate（辩论）模式

多个 Agent 就同一问题从不同角度发表观点，最后由一个裁判 Agent 综合判断。

```python
# 正方 Agent
pro_agent = Agent(
    role='正方辩手',
    goal='论证使用 TypeScript 开发 Agent 的优势',
    backstory='你是 TypeScript 的坚定支持者，擅长论证其优势。',
)

# 反方 Agent
con_agent = Agent(
    role='反方辩手',
    goal='指出 TypeScript 开发 Agent 的劣势',
    backstory='你偏好 Python 生态，能理性地指出 TypeScript 的不足。',
)

# 裁判 Agent
judge_agent = Agent(
    role='技术决策者',
    goal='综合正反双方观点，给出客观建议',
    backstory='你是一位资深技术架构师，擅长权衡不同技术方案的利弊。',
)

# 辩论任务
pro_task = Task(
    description='论证使用 TypeScript 开发 AI Agent 的 3 个主要优势',
    expected_output='列出 3 个优势，每个附带具体例子',
    agent=pro_agent,
)

con_task = Task(
    description='指出使用 TypeScript 开发 AI Agent 的 3 个主要劣势',
    expected_output='列出 3 个劣势，每个附带具体例子',
    agent=con_agent,
)

# 裁判任务（参考双方观点）
judge_task = Task(
    description='综合正方和反方的观点，给出在什么场景下选择 TypeScript、什么场景下选择 Python 的建议',
    expected_output='一份技术选型建议报告',
    agent=judge_agent,
    context=[pro_task, con_task],  # 参考双方
)

crew = Crew(
    agents=[pro_agent, con_agent, judge_agent],
    tasks=[pro_task, con_task, judge_task],
    process=Process.sequential,  # 辩论也基于顺序执行
    verbose=True,
)
```

**💡 什么时候用 Debate？** 当决策需要多角度评估时——技术选型、架构设计评审、代码审查。辩论模式能暴露单一视角的盲区。

### Voting（投票）模式

多个 Agent 独立执行相同任务，然后通过投票（或平均）获得更可靠的答案。

```python
# 三个独立的代码审查员
reviewer_1 = Agent(
    role='安全审查员', goal='检查代码安全漏洞',
    backstory='专注于安全领域，对常见漏洞模式非常敏感。',
)

reviewer_2 = Agent(
    role='性能审查员', goal='检查代码性能问题',
    backstory='关注代码效率和资源使用。',
)

reviewer_3 = Agent(
    role='可维护性审查员', goal='检查代码质量',
    backstory='关注代码可读性和可维护性。',
)

# 聚合 Agent
summary_agent = Agent(
    role='审查汇总者',
    goal='汇总所有审查意见，给出综合评分',
    backstory='你擅长整合不同维度的反馈。',
)

# 每个人独立审查同一段代码
code_to_review = """
def process_data(items):
    result = []
    for i in range(len(items)):
        if items[i] is not None:
            result.append(items[i] * 2)
    return result
"""

review_tasks = []
for i, reviewer in enumerate([reviewer_1, reviewer_2, reviewer_3]):
    task = Task(
        description=f'审查以下代码，发现所有问题：\n{code_to_review}',
        expected_output='列出发现的问题，按严重程度排序',
        agent=reviewer,
    )
    review_tasks.append(task)

# 汇总
summary_task = Task(
    description='汇总所有审查员的意见，给出最终评分（1-10）和修复建议',
    expected_output='一份汇总审查报告',
    agent=summary_agent,
    context=review_tasks,
)

crew = Crew(
    agents=[reviewer_1, reviewer_2, reviewer_3, summary_agent],
    tasks=[*review_tasks, summary_task],
    process=Process.sequential,
)
```

### Hierarchical（层级管理）模式

CrewAI 内置了 Hierarchical Process，其中一个 Agent 被指定为「管理者」，其他 Agent 为「员工」。管理者负责分配任务、审查结果。

```python
from crewai import Process

# 管理者 Agent
manager = Agent(
    role='项目经理',
    goal='高效管理团队，确保项目按时交付',
    backstory='你是一位有 10 年经验的技术经理，擅长任务分解和资源调配。',
    allow_delegation=True,  # 允许委派任务
)

# 员工 Agent
developer = Agent(
    role='前端开发者',
    goal='实现用户界面功能',
    backstory='你是 Vue.js 和 TypeScript 专家。',
    allow_delegation=False,
)

designer = Agent(
    role='UI 设计师',
    goal='设计用户界面',
    backstory='你擅长设计简洁、美观的用户界面。',
    allow_delegation=False,
)

tester = Agent(
    role='测试工程师',
    goal='确保功能质量',
    backstory='你擅长发现边界情况和潜在问题。',
    allow_delegation=False,
)

# 在 Hierarchical 模式下，不需要手动分配 Task 给 Agent
# 管理者会自动分配
task = Task(
    description='开发一个用户登录页面，包含表单设计、前端实现和功能测试',
    expected_output='完成登录页面的设计和开发',
)

crew = Crew(
    agents=[manager, developer, designer, tester],
    tasks=[task],  # 只需一个顶层任务，管理者会自动分解
    process=Process.hierarchical,  # 层级管理模式
    manager_llm='claude-3-sonnet',  # 管理者使用更强大的模型
    verbose=True,
)
```

---

## 🔨 实战演练

### 练习：新闻生产流水线

**场景描述：** 你的 AI 团队需要自动化生产技术新闻稿。使用 Pipeline 模式，构建一个包含选题→调研→写作→翻译→校对的多 Agent 流水线。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```python
from crewai import Agent, Task, Crew, Process

# ===== Agent 定义 =====
curator = Agent(
    role='新闻策划',
    goal='从最新技术趋势中筛选有报道价值的主题',
    backstory='你对技术趋势有敏锐的洞察力，能发现值得深入报道的话题。',
)

researcher = Agent(
    role='深度研究员',
    goal='对选定主题进行深度调研',
    backstory='你擅长从多个信源收集信息，并交叉验证事实准确性。',
)

writer = Agent(
    role='科技写手',
    goal='将调研结果写成引人入胜的文章',
    backstory='你是一位擅长用故事化手法写作的科技记者。',
)

translator = Agent(
    role='翻译',
    goal='将文章翻译成英文',
    backstory='你既是技术专家也是语言专家，擅长技术文档翻译。',
)

editor = Agent(
    role='终审编辑',
    goal='确保最终内容的准确性和可读性',
    backstory='你对细节有偏执般的追求，不允许任何错误。',
)

# ===== Task 定义 =====
topic_task = Task(
    description='分析当前 AI Agent 领域的最新趋势，选择一个最有报道价值的主题',
    expected_output='一个明确的主题和选择理由',
    agent=curator,
)

research_task = Task(
    description='对选定主题进行深入研究，收集至少 3 个可靠信息源',
    expected_output='包含关键事实、数据和引用的研究摘要',
    agent=researcher,
    context=[topic_task],
)

writing_task = Task(
    description='基于研究结果写一篇 800 字的技术文章，适合技术博客发布',
    expected_output='一篇结构完整、语言生动的文章',
    agent=writer,
    context=[research_task],
)

translation_task = Task(
    description='将文章翻译成英文，保持技术术语的准确性',
    expected_output='准确的英文翻译版本',
    agent=translator,
    context=[writing_task],
)

editing_task = Task(
    description='审核中文原文和英文翻译，修复事实错误和语言问题',
    expected_output='最终的中英文双版稿件',
    agent=editor,
    context=[writing_task, translation_task],
)

# ===== Crew 执行 =====
crew = Crew(
    agents=[curator, researcher, writer, translator, editor],
    tasks=[topic_task, research_task, writing_task, translation_task, editing_task],
    process=Process.sequential,
    verbose=True,
)

result = crew.kickoff()
```

**预期工作流：**
```
新闻策划 → 筛选出 "MCP 协议改变 Agent 工具生态" 主题
深度研究员 → 收集 MCP 协议的技术细节、社区 adoption 情况
科技写手 → 写成博客文章《为什么 MCP 是 AI Agent 的 USB-C 接口》
翻译 → 翻译为英文 "Why MCP Is the USB-C of AI Agents"
终审编辑 → 检查事实、语法、风格一致性，发布中英双语版本
```

</details>

---

## ⚡ 进阶技巧

### 混合编排模式

并非所有任务都只能用单一模式。你可以将一个大的工作流拆分为多个阶段，每个阶段使用不同的模式：

```python
# 阶段 1：投票模式 — 多个 Agent 独立提出方案
# 阶段 2：辩论模式 — 评审方案
# 阶段 3：Pipeline — 执行方案

# 这种混合模式需要你手动编排 Crew 的多次 kickoff() 调用
phase1_crew = Crew(agents=[...], tasks=[...], process=Process.sequential)
phase1_result = phase1_crew.kickoff()

phase2_crew = Crew(agents=[...], tasks=[...], process=Process.sequential)
phase2_result = phase2_crew.kickoff()

# 阶段 3 使用阶段 2 的结果
phase3_task = Task(
    description=f'基于评审结果执行方案：{phase2_result}',
    ...
)
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：CrewAI 的 Process.sequential 和 Process.hierarchical 有什么区别？**

> A：sequential（顺序执行）要求你明确定义每个 Task 的依赖关系（通过 context 参数），Agent 严格按照 Task 列表的顺序执行。hierarchical（层级管理）则只需要一个顶层 Task，管理者 Agent 会自动分解任务并分配给员工 Agent，适合任务结构不确定的场景。

**Q2：Pipeline 模式中，Task 的 context 参数是必须的吗？**

> A：不是必须的。没有 context 的任务是独立任务，可以并行执行。有 context 的任务会等待依赖的任务完成后才开始。你可以在一个 Crew 中混合独立任务和有依赖的任务——独立任务会并行执行，依赖任务会等待。

**Q3：Debate 模式和 Voting 模式的核心区别是什么？**

> A：Debate 中 Agent 扮演不同角色（正/反），观点是对抗的，最终由一个裁判综合。Voting 中所有 Agent 执行相同任务，观点是独立的，最终通过汇总/平均得到结果。Debate 适合需要多角度评估，Voting 适合需要提高答案可靠性的场景。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Task 之间没有传递数据 | 忘记设置 context 参数 | 检查 Task 的 context，确保引用了前置 Task |
| Hierarchical 模式下 Agent 不执行 | 管理者 Agent 没有 allow_delegation=True | 给管理者设置 allow_delegation=True |
| 多个 Agent 输出相同结果 | Prompt 设计导致 Agent 缺乏差异化 | 每个 Agent 的 role/backstory 要鲜明不同 |
| 辩论模式中一方观点过强 | Agent 角色扮演失败 | 强化 backstory 中的立场描述 |
| Pipeline 中一个 Task 失败导致全流程中断 | 没有错误恢复机制 | 添加异常处理，让失败的 Task 返回错误描述而非抛出异常 |

---

## 📝 本章小结

- ✅ **Pipeline 模式** — 串行执行，task 间通过 context 传递数据
- ✅ **Debate 模式** — 多角色辩论，裁判综合，适合技术选型评审
- ✅ **Voting 模式** — 独立执行后汇总，提高结果可靠性
- ✅ **Hierarchical 模式** — 管理者自动分配任务，适合结构不明确的工作
- ✅ **混合模式** — 将大工作流拆为多阶段，各阶段使用不同模式

## ➡️ 下一章预告

> 在下一章中，我们将学习 A2A（Agent-to-Agent）通信协议——Google 提出的标准化 Agent 通信方案，以及它和 MCP 协议的关系与区别。
> [第5章：A2A 通信协议](./05-a2a-protocol.md)
