# 第4章：编排模式 — 从流水线到自适应工作流

> 预计学习时间：90-110 分钟

## 💡 本章概览

**生活类比：** 假设你要开一家餐厅。你可以选择不同的运营模式：
- **流水线模式（Sequential）：** 洗菜 → 切菜 → 炒菜 → 装盘。每个人只做一件事，做完传给下一个人。
- **层级管理（Hierarchical）：** 主厨指挥热菜组、冷菜组、甜品组，各组领班再指挥组员。
- **自适应模式（Conditional）：** 如果客人是素食者，走素食菜单流程；如果客人有过敏，走过敏菜单流程。

在 CrewAI 中，这些模式叫做 **编排（Orchestration）**——它定义了 Agent 之间如何协作、任务如何流转。选择正确的编排模式，直接决定了整个多 Agent 系统的效率和质量。

## 📋 前置知识

> 建议先完成：[第1章：Multi-Agent 设计原则](./01-multi-agent-principles.md)、[第2章：CrewAI 基础](./02-crewai-basics.md)

---

## 一、编排模式总览

### 1.1 CrewAI 支持的编排模式

| 模式 | 关键词 | 适用场景 | 复杂度 |
|------|--------|---------|--------|
| **Sequential** | 串行流水线 | 步骤固定的任务 | ⭐ 低 |
| **Hierarchical** | 层级管理 | 需要管理者的场景 | ⭐⭐ 中 |
| **Conditional** | 条件分支 | 根据结果决定后续 | ⭐⭐⭐ 高 |
| **Async** | 异步并行 | 独立任务并发执行 | ⭐⭐⭐ 高 |
| **Custom** | 自定义流程 | 特殊业务需求 | ⭐⭐⭐⭐ 极高 |

### 1.2 核心概念回顾

```python
from crewai import Agent, Task, Crew, Process

# 创建 Agent
researcher = Agent(
    role="研究员",
    goal="收集和分析信息",
    backstory="资深研究员",
)

writer = Agent(
    role="写手",
    goal="撰写文章",
    backstory="专业写手",
)

# 创建 Task
research_task = Task(
    description="研究 AI Agent 的发展趋势",
    expected_output="一份研究报告",
    agent=researcher,
)

writing_task = Task(
    description="基于研究结果撰写文章",
    expected_output="一篇 1000 字的文章",
    agent=writer,
)

# 不同的 Process 决定了不同的编排方式
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    process=Process.sequential,  # 关键：编排模式
    verbose=True,
)
```

---

## 二、Sequential 流程（顺序执行）

### 2.1 工作原理

**生活类比：** 汽车装配流水线——车身焊接 → 喷漆 → 安装发动机 → 安装内饰。每一步都依赖上一步的完成。

```
  输入                   输出
    │                      ▲
    ▼                      │
┌─────────┐   ┌─────────┐   ┌─────────┐
│ Agent 1 │──▶│ Agent 2 │──▶│ Agent 3 │
│ 研究员  │   │  写手   │   │  编辑   │
└─────────┘   └─────────┘   └─────────┘
    结果 1        结果 2        最终结果
```

### 2.2 基础 Sequential 实现

```python
from crewai import Agent, Task, Crew, Process

# ========== Agent 定义 ==========
researcher = Agent(
    role="高级分析师",
    goal="深入研究指定主题，提供准确、全面的分析报告",
    backstory=(
        "你是一位拥有 20 年经验的行业分析师。"
        "你擅长从海量信息中提取关键洞察，"
        "你的报告以数据精准、分析深入著称。"
    ),
    verbose=True,
)

writer = Agent(
    role="技术作家",
    goal="将复杂的技术内容转化为通俗易懂的文章",
    backstory=(
        "你是一位擅长科普写作的技术作家。"
        "你能把最复杂的 AI 概念用生动的类比"
        "和清晰的语言解释给普通读者。"
    ),
    verbose=True,
)

editor = Agent(
    role="主编",
    goal="确保内容的质量、准确性和可读性",
    backstory=(
        "你是一位严厉但公正的主编。"
        "你对文章的要求是：准确无误、逻辑清晰、语言流畅。"
        "你总是能发现别人忽略的错误。"
    ),
    verbose=True,
)

# ========== Task 定义（带上下文依赖）==========
research_task = Task(
    description=(
        "深入研究「AI Agent 在企业自动化中的应用」这个主题。"
        "需要覆盖以下方面：\n"
        "1. 当前主流的企业 AI Agent 平台\n"
        "2. 实际落地的应用案例（至少 3 个）\n"
        "3. ROI 分析：企业部署 AI Agent 的投入产出比\n"
        "4. 面临的挑战和解决方案\n"
        "5. 2024-2025 年的发展趋势预测"
    ),
    expected_output=(
        "一份 500 字以上的研究报告，包含数据支撑和具体案例。"
        "格式要求：Markdown 格式，有标题层级。"
    ),
    agent=researcher,
)

writing_task = Task(
    description=(
        "基于研究员提供的研究报告，撰写一篇面向技术管理者的文章。"
        "文章需要包含：\n"
        "- 引人入胜的开头（用具体的场景或数据引入）\n"
        "- 核心内容的展开（用类比和实际案例）\n"
        "- 可操作的建议（读者看完可以立即执行）\n"
        "- 引人思考的结尾"
    ),
    expected_output="一篇 800-1000 字的博客文章，适合在技术社区发布。",
    agent=writer,
    # 关键：依赖前一个任务的输出
    context=[research_task],
)

editing_task = Task(
    description=(
        "审查写手完成的文章，确保：\n"
        "1. 技术准确性——所有数据和事实是否正确\n"
        "2. 逻辑连贯性——段落之间的过渡是否自然\n"
        "3. 语言表达——是否有语病、冗余或歧义\n"
        "4. 目标受众匹配——内容是否适合技术管理者阅读\n\n"
        "列出所有修改建议，并说明修改原因。"
    ),
    expected_output="一份编辑反馈报告，包含具体的修改建议和改进说明。",
    agent=editor,
    context=[research_task, writing_task],  # 依赖多个任务
)

# ========== Crew 编排 ==========
content_crew = Crew(
    agents=[researcher, writer, editor],
    tasks=[research_task, writing_task, editing_task],
    process=Process.sequential,
    verbose=True,
)

# ========== 执行 ==========
result = content_crew.kickoff()
print("=== 最终结果 ===")
print(result)
```

### 2.3 Sequential 的优缺点

```
✅ 优点：
  - 简单直观，易于理解和调试
  - 天然满足依赖关系（后一步依赖前一步）
  - 资源消耗可控（一次只运行一个 Agent）

❌ 缺点：
  - 效率低（不能并行）
  - 任意一步失败则整个流程中断
  - 不适用于需要双向反馈的场景
```

---

## 三、Hierarchical 流程（层级管理）

### 3.1 工作原理

**生活类比：** 一家软件开发公司的典型结构——CTO（管理 Agent）制定技术战略，分配任务给各个技术组长（中级 Agent），技术组长再指派给开发人员（执行 Agent）。

```
                 ┌─────────────┐
                 │  管理 Agent  │
                 │  (Manager)  │
                 └──────┬──────┘
                        │ 任务分配
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Agent A  │  │ Agent B  │  │ Agent C  │
    │ 研究员   │  │ 数据分析 │  │ 写手    │
    └──────────┘  └──────────┘  └──────────┘
          │             │             │
          └─────────────┼─────────────┘
                        ▼
                  ┌──────────┐
                  │  最终结果 │
                  └──────────┘
```

### 3.2 Hierarchical 实现

```python
from crewai import Agent, Task, Crew, Process

# ========== 管理 Agent ==========
manager = Agent(
    role="项目总监",
    goal=(
        "协调团队高效完成任务，确保质量和进度。"
        "你需要把大任务分解为可执行的小任务，"
        "分派给最合适的团队成员，并监督执行过程。"
    ),
    backstory=(
        "你是一位经验丰富的 AI 项目经理，擅长管理复杂的"
        "技术项目。你知道每个团队成员的专长，"
        "能合理分配任务，并在关键时刻提供指导。"
    ),
    allow_delegation=True,  # 关键：允许任务委派
    verbose=True,
)

# ========== 执行 Agent ==========
data_analyst = Agent(
    role="数据分析师",
    goal="从数据中提取有价值的洞察",
    backstory="数据分析专家，精通 Python 和 SQL",
    verbose=True,
)

market_researcher = Agent(
    role="市场研究员",
    goal="分析市场趋势和竞争格局",
    backstory="资深市场分析专家",
    verbose=True,
)

report_writer = Agent(
    role="报告撰写师",
    goal="撰写结构清晰、数据详实的分析报告",
    backstory="专业商业报告写手",
    verbose=True,
)

# ========== 高层任务（由 Manager 分解）===========
main_task = Task(
    description=(
        "为一家正在进行数字化转型的制造业公司，"
        "制定一份「AI 技术应用路线图」商业报告。\n\n"
        "报告需要包含：\n"
        "1. 行业现状分析——制造业 AI 应用的市场规模、主要玩家\n"
        "2. 关键技术分析——哪些 AI 技术最适合制造业\n"
        "3. 落地路线图——分三个阶段给出建议\n"
        "4. ROI 预测——投入产出分析和风险提示\n\n"
        "这份报告将提交给公司的 CIO 和 CTO 决策使用。"
    ),
    expected_output="一份完整的商业分析报告（Markdown 格式，2000 字以上）",
    agent=manager,  # Manager 会自行委派给合适的 Agent
)

# ========== 使用 Hierarchical 模式 ==========
project_crew = Crew(
    agents=[data_analyst, market_researcher, report_writer],
    tasks=[main_task],
    process=Process.hierarchical,
    manager_agent=manager,  # 指定管理 Agent
    verbose=True,
)

# 执行
result = project_crew.kickoff()
print(result)
```

### 3.3 Hierarchical 配置详解

```python
# 高级配置：使用自定义 Manager LLM
from langchain_openai import ChatOpenAI

crew = Crew(
    agents=[agent1, agent2, agent3],
    tasks=[main_task],
    process=Process.hierarchical,

    # ========== 关键配置 ==========
    # 1. 管理 Agent（可选）
    # 如果不指定，CrewAI 会使用默认的管理 Agent
    manager_agent=manager_agent,

    # 2. 管理 Agent 的 LLM（可选）
    # 推荐使用比执行 Agent 更强的模型
    manager_llm=ChatOpenAI(model="gpt-4-turbo"),

    # 3. 任务委派轮次（可选）
    # 最多允许多少轮委派迭代
    max_rpm=10,

    # 4. 共享资源
    share_crew=True,  # Agent 之间共享执行上下文
)
```

---

## 四、条件任务（Conditional Tasks）

### 4.1 为什么需要条件分支？

**生活类比：** 医院的急诊分诊系统——病人来了先评估（检查），根据结果走不同路径：
- 轻症 → 普通门诊
- 重症 → 急诊抢救
- 需要手术 → 手术室

在 CrewAI 中，不是所有任务都需要顺序执行。有时候我们需要根据中间结果决定下一步做什么：

```python
from typing import List
from crewai import Agent, Task, Crew

# ========== 模拟条件分支 ==========
class ConditionalCrew:
    """带有条件分支的 Crew 实现"""

    def __init__(self):
        # 创建所有 Agent
        self.quality_checker = Agent(
            role="质量检查员",
            goal="检查产品质量并分类",
            backstory="严格的质量控制专家",
            verbose=True,
        )

        self.worker_a = Agent(
            role="流水线工人 A",
            goal="处理标准产品",
            backstory="效率很高的熟练工",
            verbose=True,
        )

        self.worker_b = Agent(
            role="流水线工人 B",
            goal="处理返修产品",
            backstory="擅长处理问题产品的专家",
            verbose=True,
        )

        self.manager = Agent(
            role="生产经理",
            goal="处理特殊情况和升级问题",
            backstory="经验丰富的生产管理者",
            verbose=True,
        )

    def run(self, product_description: str) -> str:
        """执行业务流程"""
        # 第一步：质量检查（总是执行）
        check_task = Task(
            description=f"检查以下产品的质量：{product_description}\n"
                        "请输出检查结果和分类：'合格', '需返修', 或 '不合格'",
            expected_output="质量检查结果",
            agent=self.quality_checker,
        )

        check_crew = Crew(
            agents=[self.quality_checker],
            tasks=[check_task],
            process=Process.sequential,
            verbose=True,
        )
        check_result = check_crew.kickoff()

        # 第二步：根据检查结果走不同分支
        result_text = str(check_result)

        if "合格" in result_text:
            # 分支 A：标准处理
            process_task = Task(
                description=f"产品通过了质量检查，进行标准包装处理。\n"
                            f"检查结果：{result_text}",
                expected_output="包装完成确认",
                agent=self.worker_a,
            )
        elif "需返修" in result_text:
            # 分支 B：返修处理
            process_task = Task(
                description=f"产品需要返修。请执行以下步骤：\n"
                            f"1. 记录问题\n"
                            f"2. 执行返修\n"
                            f"3. 重新检查\n"
                            f"检查结果：{result_text}",
                expected_output="返修完成报告",
                agent=self.worker_b,
            )
        else:
            # 分支 C：升级处理
            process_task = Task(
                description=f"产品不合格，需要升级处理。请：\n"
                            f"1. 记录缺陷\n"
                            f"2. 决定处置方案（报废/降级使用）\n"
                            f"检查结果：{result_text}",
                expected_output="处置方案报告",
                agent=self.manager,
            )

        # 执行分支任务
        branch_crew = Crew(
            agents=[self.worker_a, self.worker_b, self.manager],
            tasks=[process_task],
            process=Process.sequential,
            verbose=True,
        )

        final_result = branch_crew.kickoff()
        return f"检查结果：{result_text}\n处理结果：{final_result}"


# 使用
conditional_crew = ConditionalCrew()
result = conditional_crew.run("iPhone 15 Pro Max — 屏幕有细微划痕")
print(result)
```

### 4.2 条件任务的最佳实践

条件分支的核心要点：

```python
class ConditionPatterns:
    """
    条件任务的最佳实践模式

    模式 1：结果分类（如上例）
    模式 2：阈值触发
    模式 3：多条件组合
    """

    @staticmethod
    def threshold_pattern(score: float) -> str:
        """根据分数阈值决定下一步"""
        if score >= 0.9:
            return "自动通过"
        elif score >= 0.7:
            return "人工审核"
        else:
            return "退回修改"

    @staticmethod
    def multi_condition_pattern(
        has_data: bool,
        is_complete: bool,
        quality_score: float,
    ) -> str:
        """多条件组合决策"""
        conditions = []

        if not has_data:
            conditions.append("缺少数据")
        if not is_complete:
            conditions.append("内容不完整")
        if quality_score < 0.6:
            conditions.append("质量不达标")

        if not conditions:
            return "ALL_PASS"  # 所有条件满足
        else:
            return f"NEEDS_FIX: {', '.join(conditions)}"
```

---

## 五、异步执行与并行任务

### 5.1 异步 Crew 执行

对于相互独立的任务，可以并行执行以提高效率：

```python
import asyncio
from crewai import Agent, Task, Crew, Process

# ========== 并行执行独立任务 ==========
async def run_parallel_crews():
    """并行运行多个独立的 Crew"""

    # Crew 1：市场分析
    market_analyst = Agent(
        role="市场分析师",
        goal="分析市场数据",
        backstory="市场分析专家",
    )

    market_task = Task(
        description="分析 2024 年 AI 芯片市场规模",
        expected_output="市场分析报告",
        agent=market_analyst,
    )

    market_crew = Crew(
        agents=[market_analyst],
        tasks=[market_task],
        verbose=True,
    )

    # Crew 2：技术分析
    tech_analyst = Agent(
        role="技术分析师",
        goal="分析技术趋势",
        backstory="技术分析专家",
    )

    tech_task = Task(
        description="分析 AI 芯片技术发展趋势",
        expected_output="技术分析报告",
        agent=tech_analyst,
    )

    tech_crew = Crew(
        agents=[tech_analyst],
        tasks=[tech_task],
        verbose=True,
    )

    # Crew 3：竞争分析
    competition_analyst = Agent(
        role="竞争分析师",
        goal="分析竞争对手",
        backstory="竞争情报专家",
    )

    competition_task = Task(
        description="分析主要 AI 芯片厂商的竞争格局",
        expected_output="竞争分析报告",
        agent=competition_analyst,
    )

    competition_crew = Crew(
        agents=[competition_analyst],
        tasks=[competition_task],
        verbose=True,
    )

    # ========== 并行执行三个独立的 Crew ==========
    print("开始并行执行...")
    results = await asyncio.gather(
        asyncio.to_thread(market_crew.kickoff),
        asyncio.to_thread(tech_crew.kickoff),
        asyncio.to_thread(competition_crew.kickoff),
    )

    print(f"三个分析任务全部完成！")
    return {
        "market": results[0],
        "tech": results[1],
        "competition": results[2],
    }


# 运行
results = asyncio.run(run_parallel_crews())
```

### 5.2 扇出-聚合模式

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

class FanOutCrew:
    """
    扇出-聚合模式：
    多个 Agent 独立处理同一问题的不同方面，然后汇总结果。
    """

    def __init__(self):
        self.agents = {
            "技术": Agent(
                role="技术专家",
                goal="从技术角度分析问题",
                backstory="技术领域专家",
            ),
            "商业": Agent(
                role="商业分析师",
                goal="从商业角度分析问题",
                backstory="MBA 背景的商业顾问",
            ),
            "法律": Agent(
                role="法律顾问",
                goal="从法律和合规角度分析问题",
                backstory="资深企业法律顾问",
            ),
            "用户": Agent(
                role="用户体验专家",
                goal="从用户角度分析问题",
                backstory="UX 研究专家",
            ),
        }

        self.synthesizer = Agent(
            role="综合分析员",
            goal="整合多角度分析结果，给出综合建议",
            backstory="擅长跨学科综合分析的战略顾问",
        )

    def analyze(self, problem: str) -> str:
        """从多个角度并行分析问题，然后综合"""
        results = {}

        # 第一阶段：并行分析
        print("🔄 第一阶段：多角度并行分析")
        with ThreadPoolExecutor(max_workers=4) as executor:
            future_to_agent = {}
            for perspective, agent in self.agents.items():
                task = Task(
                    description=(
                        f"请从「{perspective}」角度分析以下问题：\n\n{problem}\n\n"
                        f"请输出详细的分析报告，包含具体的数据和建议。"
                    ),
                    expected_output=f"从{perspective}角度的分析报告",
                    agent=agent,
                )
                crew = Crew(
                    agents=[agent],
                    tasks=[task],
                    verbose=False,
                )
                future = executor.submit(crew.kickoff)
                future_to_agent[future] = perspective

            for future in as_completed(future_to_agent):
                perspective = future_to_agent[future]
                try:
                    results[perspective] = future.result()
                    print(f"  ✅ {perspective} 分析完成")
                except Exception as e:
                    results[perspective] = f"分析失败: {e}"
                    print(f"  ❌ {perspective} 分析失败: {e}")

        # 第二阶段：综合
        print("\n🔄 第二阶段：综合所有分析结果")
        combined = "\n\n".join([
            f"=== {p} 视角 ===\n{r}"
            for p, r in results.items()
        ])

        synthesis_task = Task(
            description=(
                f"以下是针对以下问题从四个角度进行的分析：\n\n"
                f"问题：{problem}\n\n"
                f"分析结果：\n{combined}\n\n"
                f"请综合所有角度的分析，给出完整的战略建议。"
            ),
            expected_output="综合战略建议报告",
            agent=self.synthesizer,
        )

        synthesis_crew = Crew(
            agents=[self.synthesizer],
            tasks=[synthesis_task],
            verbose=True,
        )

        return synthesis_crew.kickoff()


# 使用
analyzer = FanOutCrew()
result = analyzer.analyze(
    "我们公司计划在 2025 年推出一个 AI 驱动的客服系统，"
    "需要评估这个计划的可行性。"
)
print(result)
```

---

## 六、自定义工作流

### 6.1 基于回调的流程控制

对于更复杂的场景，可以通过代码实现完全自定义的流程控制：

```python
class CustomWorkflow:
    """
    完全自定义的工作流引擎

    **生活类比：** 就像编程中的 if-else 和 for 循环——
    你可以组合任何逻辑来控制 Agent 的执行流程。
    """

    def __init__(self):
        self.agents = {}
        self.history = []

    def add_agent(self, name: str, agent: Agent):
        self.agents[name] = agent

    def execute_step(
        self,
        agent_name: str,
        task_description: str,
        context: dict = None,
    ) -> dict:
        """执行单个步骤"""
        agent = self.agents[agent_name]
        task = Task(
            description=task_description,
            expected_output="任务结果",
            agent=agent,
        )
        crew = Crew(
            agents=[agent],
            tasks=[task],
            verbose=False,
        )
        result = crew.kickoff()

        step_record = {
            "step": len(self.history) + 1,
            "agent": agent_name,
            "result": str(result),
        }
        self.history.append(step_record)

        return {"result": str(result), "history": self.history}

    def run_workflow(self, max_iterations: int = 5) -> str:
        """
        运行一个自适应工作流——Agent 根据上一步结果
        决定下一步做什么，直到满足终止条件。
        """
        current_task = "分析初始需求并制定执行计划"
        final_result = None

        for i in range(max_iterations):
            print(f"\n📋 迭代 {i + 1}/{max_iterations}")
            print(f"当前任务: {current_task}")

            # 执行
            step_result = self.execute_step("planner", current_task)

            # 检查结果
            result_text = step_result["result"]

            # 检查终止条件
            if "任务完成" in result_text or "FINAL" in result_text:
                print("✅ 所有任务已完成！")
                final_result = result_text
                break

            # 根据结果决定下一步
            if "需要更多信息" in result_text:
                current_task = "搜索更多信息并补充分析"
            elif "遇到问题" in result_text:
                current_task = "分析问题原因并提出解决方案"
            else:
                current_task = f"基于当前进展继续下一步：{result_text}"

        return final_result or "达到最大迭代次数"


# 使用自定义工作流
workflow = CustomWorkflow()
workflow.add_agent("planner", Agent(
    role="任务规划器",
    goal="逐步完成任务，并在完成时输出'任务完成'",
    backstory="系统化的任务执行专家",
))
result = workflow.run_workflow()
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Sequential 和 Hierarchical 的核心区别是什么？**

> A：Sequential 是「流水线」——流程由开发者定义，Agent 按固定顺序执行，每个 Agent 知道自己上一步和下一步是谁。Hierarchical 是「管理层」——有一个 Manager Agent 负责动态分配任务给其他 Agent，执行者之间可能不知道彼此的存在。简单来说：Sequential 是「谁先谁后已经排好了」，Hierarchical 是「领导看着办」。Sequential 适合流程固定的场景（如内容生产流水线），Hierarchical 适合需要灵活指挥的场景（如复杂项目）。

**Q2：什么场景应该使用条件任务？**

> A：条件任务适用于「执行结果会影响下一步走向」的场景。典型例子：（1）质量检查——合格走 A 流程，不合格走 B 流程；（2）风险评估——高风险需要人工介入，低风险自动处理；（3）数据验证——完整数据直接分析，不完整数据先补充再分析。如果流程的每一步都是固定的、可预测的，用 Sequential 就够了。

**Q3：异步并行执行时需要注意什么问题？**

> A：三个关键问题：（1）独立性——并行的任务必须彼此独立，不能有数据依赖；（2）资源竞争——多个 Agent 同时调用同一个外部 API 要注意限流；（3）结果聚合——并行任务需要设计好「最后一步如何合并结果」。此外，Python 的全局解释器锁（GIL）意味着 CPU 密集型任务无法真正并行，但对于 I/O 密集型任务（等待 API 响应、数据库查询），异步并行的效率提升非常显著。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Sequential 流程中下游任务等待上游结果时超时 | 上游任务执行时间过长未设置超时限制 | 为每个任务设置 `timeout` 参数，并在超时后触发错误处理或回退逻辑 |
| Hierarchical 流程的 Manager Agent 任务分配不合理 | Manager 的 Prompt 未明确说明如何分配任务 | 为 Manager Agent 提供清晰的分配规则和任务优先级说明，限制每次分配的任务数量 |
| 条件任务的判断条件过于模糊导致路由错误 | 分支条件函数返回了非预期的结果 | 使用明确的枚举值（如 `Route.APPROVED` / `Route.REJECTED`）作为条件判断输出 |
| 异步并行任务中聚合结果时发生数据竞争 | 多个并行任务的输出同时写入同一变量 | 为每个并行任务使用独立的输出字段，聚合时按任务 ID 或名称逐个合并 |

---

## 📝 本章小结

- ✅ **Sequential 流程** — 串行流水线，任务之间有明确依赖
- ✅ **Hierarchical 流程** — 层级管理，Manager Agent 动态分配任务
- ✅ **条件任务** — 根据检查结果走不同分支路径
- ✅ **异步并行** — 独立任务并发执行，扇出-聚合模式
- ✅ **自定义工作流** — 基于回调的完全灵活控制

## ➡️ 下一章预告

> [第5章：A2A 通信协议](./05-a2a-protocol.md) — Google 提出的 Agent-to-Agent 标准化通信协议，消息传递与任务委托。
