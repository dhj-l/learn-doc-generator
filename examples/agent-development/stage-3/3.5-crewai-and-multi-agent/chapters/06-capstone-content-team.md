# 第6章：综合实战 — AI 内容生产团队

> 预计学习时间：100-120 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **综合运用 CrewAI 全栈能力** — Agent、Task、Crew、Tools、Process 的完整配合
- **构建生产级的多 Agent 协作系统** — 角色分工、任务编排、质量控制的完整流程
- **实现端到端的内容生产流水线** — 从选题 → 调研 → 写作 → 审核 → 发布
- **掌握项目的组织和调试技巧** — 如何结构化 CrewAI 项目、如何调试多 Agent 协作

## 📋 前置知识

> 建议先完成本章之前的所有 CrewAI 章节：
> - [第1章：Multi-Agent 设计原则](./01-multi-agent-principles.md)
> - [第2章：CrewAI 基础](./02-crewai-basics.md)
> - [第3章：自定义工具集成](./03-crewai-tools.md)
> - [第4章：多 Agent 编排模式](./04-orchestration-patterns.md)
> - [第5章：A2A 通信协议](./05-a2a-protocol.md)

---

## 💡 项目概述

### 项目：AI 内容生产团队

我们将构建一个**三人 AI 内容团队**，自动化技术博客的生产流程：

```
用户输入主题
     │
     ▼
┌─────────────────┐
│  策划/选题       │  选题 Agent：分析主题价值，确定切入点
│  (选题管理者)    │
└────────┬────────┘
         │ 选题方向
         ▼
┌─────────────────┐
│  研究员          │  研究员 Agent：深度调研，收集事实
│  (研究专家)      │
└────────┬────────┘
         │ 研究报告
         ▼
┌─────────────────┐
│  写手/编辑       │  写手 Agent：撰写文章
│  (内容创作者)    │  编辑 Agent：审核质量
└────────┬────────┘
         │ 最终稿件
         ▼
     发布!
```

---

## 🔨 完整实现

### 项目结构

```
ai-content-team/
├── main.py              # 主入口
├── agents.py            # Agent 定义
├── tasks.py             # Task 定义
├── tools.py             # 自定义工具
├── config.py            # 配置
└── output/              # 输出目录
```

### 步骤 1：配置和工具

```python
# config.py
import os

# LLM 配置
LLM_CONFIG = {
    "model": os.getenv("CREWAI_LLM", "claude-3-sonnet"),
    "temperature": 0.3,
    "max_tokens": 4096,
}

# 内容质量标准
QUALITY_STANDARDS = {
    "min_word_count": 500,
    "max_word_count": 2000,
    "required_sections": ["摘要", "正文", "结论"],
    "citation_required": True,
}
```

```python
# tools.py
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from typing import Optional
import json

class WebSearchTool(BaseTool):
    """模拟的搜索引擎工具"""
    name: str = "网络搜索"
    description: str = "搜索互联网获取最新信息"

    def _run(self, query: str) -> str:
        mock_results = {
            "AI Agent 2025": """
1. 2025 年 AI Agent 市场报告 — MarketWatch
   - 市场规模达 280 亿美元
   - 年增长率 45%
2. 主流框架对比 — 2025-06
   - LangGraph、CrewAI、AutoGen 三足鼎立
3. 企业 adoption 率 — Gartner
   - 65% 的企业已在试点 AI Agent
""",
            "MCP 协议": """
1. MCP 正式成为 IETF 标准 — 2025-03
2. 主流框架集成 MCP — 2025-06
   - LangChain、CrewAI、Vercel AI SDK 均已支持
""",
        }

        # 查找最匹配的结果
        for key, result in mock_results.items():
            if any(word in query for word in key.split()):
                return result

        return f"搜索结果：找到 0 条关于「{query}」的结果。请尝试其他关键词。"

class FactCheckTool(BaseTool):
    """事实核查工具"""
    name: str = "事实核查"
    description: str = "核查文章中的事实和数据准确性"

    def _run(self, content: str) -> str:
        # 简化的核查逻辑
        issues = []
        if "100%" in content:
            issues.append("🔴 「100%」声称过于绝对，建议改为具体数据或添加限定条件")
        if "所有" in content and "技术" in content:
            issues.append("🟡 「所有技术」过于宽泛，建议限定范围")
        if "最佳" in content:
            issues.append("🟡 「最佳」是主观评价，建议用具体指标替代")

        if not issues:
            return "✅ 事实核查通过：未发现明显的事实问题。"

        return "事实核查报告：\n" + "\n".join(issues)
```

### 步骤 2：Agent 定义

```python
# agents.py
from crewai import Agent
from tools import WebSearchTool, FactCheckTool

class ContentTeam:
    """内容生产团队的 Agent 工厂"""

    @staticmethod
    def create_planner() -> Agent:
        return Agent(
            role='内容策划',
            goal='从用户输入的主题中挖掘出最有价值的切入角度，制定内容大纲',
            backstory=(
                '你是一位拥有 10 年经验的内容策划编辑，曾在知名科技媒体担任主编。'
                '你擅长把一个模糊的主题打磨成结构清晰、目标明确的内容方案。'
                '你特别注重内容的「读者价值」——读者读完能获得什么。'
            ),
            tools=[WebSearchTool()],
            llm='claude-3-sonnet',
            max_iter=3,
            verbose=True,
        )

    @staticmethod
    def create_researcher() -> Agent:
        return Agent(
            role='深度研究员',
            goal='围绕选题方向进行扎实的调研，提供有数据支撑的研究报告',
            backstory=(
                '你是一位严谨的技术研究员，曾在顶级实验室工作。'
                '你的信条是「没有数据支撑的结论都是废话」。'
                '你不仅收集信息，还会交叉验证信源的可靠性。'
                '你输出的研究报告至少包含 3 个独立信源。'
            ),
            tools=[WebSearchTool(), FactCheckTool()],
            llm='claude-3-sonnet',
            max_iter=5,
            verbose=True,
        )

    @staticmethod
    def create_writer() -> Agent:
        return Agent(
            role='技术写手',
            goal='将研究报告转化为引人入胜、深入浅出的技术文章',
            backstory=(
                '你是一位擅长把复杂技术讲清楚的写手。'
                '你相信「最好的技术文章是让读者感觉自己在变聪明」。'
                '你善于使用类比、示例和故事化手法，让技术内容不再枯燥。'
                '你要求每篇文章都有一个清晰的主线和贯穿全文的比喻。'
            ),
            llm='claude-3-sonnet',
            max_iter=3,
            verbose=True,
        )

    @staticmethod
    def create_editor() -> Agent:
        return Agent(
            role='内容编辑',
            goal='确保最终内容的质量：准确性、可读性、完整性',
            backstory=(
                '你是一位严苛的编辑，对文字有极致的追求。'
                '你能一眼看出逻辑漏洞、数据引用问题和表达不清的段落。'
                '你的审核清单包括：事实准确性、逻辑连贯性、语言流畅性、'
                '目标读者适配度、行动号召有效性。'
                '你会在放手之前问自己：「这篇文章值得读者花时间吗？」'
            ),
            tools=[FactCheckTool()],
            llm='claude-3-sonnet',
            max_iter=3,
            verbose=True,
        )
```

### 步骤 3：Task 定义

```python
# tasks.py
from crewai import Task

class ContentPipeline:
    """内容生产流水线的 Task 工厂"""

    @staticmethod
    def create_planning_task(agent, topic: str) -> Task:
        return Task(
            description=f"""
分析主题「{topic}」并制定内容方案。

要求：
1. 分析这个主题的读者群体是谁？他们最关心什么？
2. 确定文章的切入角度——是新手教程、深度分析、还是最佳实践？
3. 制定文章大纲：至少包含 5 个核心章节
4. 指出需要哪些关键数据和研究支撑

当前趋势参考（通过搜索工具获取）：
- 该主题最新的行业动态
- 读者关注的热点问题
""",
            expected_output=(
                '一份完整的内容方案，包含：\n'
                '- 目标读者分析\n'
                '- 切入角度\n'
                '- 文章大纲（5+ 章节）\n'
                '- 所需研究清单'
            ),
            agent=agent,
        )

    @staticmethod
    def create_research_task(agent, planning_result: Task) -> Task:
        return Task(
            description=(
                '基于内容策划提供的大纲，进行深度调研。\n\n'
                '要求：\n'
                '1. 查找至少 3 个独立信源\n'
                '2. 验证关键数据的准确性\n'
                '3. 收集实战案例和代码示例\n'
                '4. 标记有争议或不确定的信息\n'
                '5. 提供可引用的原文出处'
            ),
            expected_output=(
                '一份详细的研究报告，包含：\n'
                '- 每个章节需要的核心信息\n'
                '- 至少 3 个信源引用\n'
                '- 事实核查标记\n'
                '- 可用的代码示例或案例'
            ),
            agent=agent,
            context=[planning_result],
        )

    @staticmethod
    def create_writing_task(agent, research_result: Task) -> Task:
        return Task(
            description=(
                '基于研究报告撰写一篇完整的技术文章。\n\n'
                '写作要求：\n'
                '1. 使用「问题驱动」的开头——先描述读者面临的真实问题\n'
                '2. 用类比引入复杂概念，让读者建立直觉\n'
                '3. 每个技术点都配可运行的代码示例\n'
                '4. 包含「为什么这样做」的解释段落\n'
                '5. 文章长度：800-1500 字\n'
                '6. 风格：专业但不晦涩，有温度但不随意'
            ),
            expected_output=(
                '一篇完整的 Markdown 技术文章，包含：\n'
                '- 引人入胜的标题\n'
                '- 问题驱动的开头\n'
                '- 核心概念讲解（含类比+代码）\n'
                '- 实战示例\n'
                '- 总结与下一步建议'
            ),
            agent=agent,
            context=[research_result],
        )

    @staticmethod
    def create_review_task(agent, writing_result: Task) -> Task:
        return Task(
            description=(
                '审核文章质量，确保达到发布标准。\n\n'
                '审核清单：\n'
                '1. 事实准确性：所有数据是否有可靠来源？\n'
                '2. 逻辑连贯性：文章段落之间是否有自然过渡？\n'
                '3. 代码正确性：示例代码是否可运行？有无明显错误？\n'
                '4. 语言质量：有无语法错误、表达不清？\n'
                '5. 目标读者适配：对目标读者来说是否太简单或太难？\n'
                '6. 完整性：文章是否有明确的结论和行动建议？'
            ),
            expected_output=(
                '审核报告，包含：\n'
                '- 每个维度的评分（1-10）\n'
                '- 需要修改的具体问题列表\n'
                '- 最终建议：直接发布 / 修改后发布 / 需要重写'
            ),
            agent=agent,
            context=[writing_result],
        )
```

### 步骤 4：主程序

```python
# main.py
from crewai import Crew, Process
from agents import ContentTeam
from tasks import ContentPipeline
import json
from datetime import datetime

class ContentProductionSystem:
    """内容生产系统"""

    def __init__(self):
        self.team = ContentTeam()
        self.pipeline = ContentPipeline()

    def produce_article(self, topic: str) -> dict:
        """全流程生产一篇文章"""
        print(f"\n{'='*60}")
        print(f"📝 开始内容生产：{topic}")
        print(f"📅 时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}")
        print(f"{'='*60}\n")

        # 1. 创建 Agent
        planner = self.team.create_planner()
        researcher = self.team.create_researcher()
        writer = self.team.create_writer()
        editor = self.team.create_editor()

        # 2. 创建 Task
        plan_task = self.pipeline.create_planning_task(planner, topic)
        research_task = self.pipeline.create_research_task(researcher, plan_task)
        write_task = self.pipeline.create_writing_task(writer, research_task)
        review_task = self.pipeline.create_review_task(editor, write_task)

        # 3. 组建 Crew
        crew = Crew(
            agents=[planner, researcher, writer, editor],
            tasks=[plan_task, research_task, write_task, review_task],
            process=Process.sequential,
            verbose=True,
        )

        # 4. 执行
        result = crew.kickoff()

        # 5. 保存结果
        output = {
            "topic": topic,
            "produced_at": datetime.now().isoformat(),
            "content": str(result),
            "agents_used": ["planner", "researcher", "writer", "editor"],
        }

        # 保存到文件
        filename = f"output/{topic.replace(' ', '_')[:30]}.json"
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

        print(f"\n✅ 文章已保存到 {filename}")
        return output

    def batch_produce(self, topics: list[str]) -> list[dict]:
        """批量生产多篇文章"""
        results = []
        for i, topic in enumerate(topics, 1):
            print(f"\n📄 正在生产第 {i}/{len(topics)} 篇：{topic}")
            try:
                result = self.produce_article(topic)
                results.append(result)
                print(f"✅ 第 {i} 篇完成\n")
            except Exception as e:
                print(f"❌ 第 {i} 篇失败：{str(e)}")
                continue
        return results


if __name__ == "__main__":
    import os
    os.makedirs("output", exist_ok=True)

    system = ContentProductionSystem()

    # 单篇生产
    system.produce_article("MCP 协议如何改变 AI Agent 的工具生态")

    # 或者批量生产
    # topics = [
    #     "MCP 协议入门指南",
    #     "CrewAI 多 Agent 最佳实践",
    #     "从零构建 AI Agent 系统",
    # ]
    # system.batch_produce(topics)
```

---

## 💡 架构设计解读

### 为什么这样设计？

```
1. 「工厂模式」组织 Agent 和 Task
   - agents.py 中的 ContentTeam 是一个静态工厂
   - 好处：Agent 的创建逻辑集中在同一处，修改角色描述只需改一个地方
   - 对比：如果在 main.py 中分散创建，改一个角色要改多处

2. 「Pipeline 模式」编排流程
   - 策划 → 研究 → 写作 → 审核 四个阶段
   - 每个阶段产出是下一个阶段的输入（通过 context）
   - 好处：可以随时在任意阶段插入新的 Agent（比如加一个「翻译」阶段）

3. 「约定优于配置」的输出管理
   - 所有输出自动保存到 output/ 目录
   - 文件名基于主题自动生成
   - 好处：不需要手动管理文件命名和存储路径
```

---

## ⚡ 生产化增强

```python
# 生产环境配置：错误恢复、重试、监控
import time
from functools import wraps

def retry_on_failure(max_retries=2, delay=5):
    """重试装饰器：Agent 调用失败时自动重试"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    print(f"⚠️ 尝试 {attempt + 1}/{max_retries + 1} 失败：{e}")
                    if attempt < max_retries:
                        print(f"⏳ {delay} 秒后重试...")
                        time.sleep(delay)
            raise last_error
        return wrapper
    return decorator

class ProductionContentSystem(ContentProductionSystem):
    """生产级内容系统（带监控和重试）"""

    def __init__(self):
        super().__init__()
        self.metrics = {
            "total_articles": 0,
            "successful": 0,
            "failed": 0,
            "total_time": 0,
        }

    @retry_on_failure(max_retries=2)
    def produce_article(self, topic: str) -> dict:
        start = time.time()
        try:
            result = super().produce_article(topic)
            self.metrics["successful"] += 1
            return result
        except Exception as e:
            self.metrics["failed"] += 1
            raise
        finally:
            self.metrics["total_articles"] += 1
            self.metrics["total_time"] += time.time() - start

    def report(self) -> str:
        avg_time = self.metrics["total_time"] / max(self.metrics["total_articles"], 1)
        return f"""
📊 生产统计报告
━━━━━━━━━━━━━━━━━━━━━━━
总生产数：{self.metrics['total_articles']}
成功：{self.metrics['successful']}
失败：{self.metrics['failed']}
平均耗时：{avg_time:.1f} 秒/篇
成功率：{self.metrics['successful'] / max(self.metrics['total_articles'], 1) * 100:.0f}%
"""
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么 Agent 的 backstory（背景故事）比 role（角色名）对输出质量影响更大？**

> A：Backstory 决定了 Agent 的「行为风格」和「决策逻辑」。两个「研究员」Agent，一个 backstory 是「你曾在顶级实验室工作，追求数据严谨」，另一个是「你是个快速阅读者，擅长找出核心观点」——他们的输出风格完全不同。Role 只是分类，backstory 才是行为的核心驱动。

**Q2：Pipeline 模式中 Task 的 context 参数如果设置错了会怎样？**

> A：如果 Task A 的 context 引用了 Task B，但 Task B 在 Task A 之后执行，CrewAI 会报错。如果 Task A 应该引用 Task B 但没设置，Task A 将无法获取 Task B 的输出。如果 Task A 引用了不相关的 Task，会增加 Token 消耗。所以 context 的依赖关系必须与 Task 列表的顺序一致。

**Q3：多 Agent 系统中如何防止「废话循环」——Agent 之间互相输出没有新信息的反馈？**

> A：三个策略：（1）设置明确的 expected_output，让 Agent 知道「够了就停」；（2）使用 max_iter 限制每轮迭代次数；（3）在 Task 描述中强调「如果没有什么可补充的，请直接说'无需修改'」。事实核查 Agent 尤其容易陷入「总能找到问题」的循环。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Agent 输出偏离主题 | Role/backstory 不够聚焦 | 在 backstory 中加入「你只关注 XX 方面，其他方面交给队友」 |
| Task 执行顺序错乱 | Task 列表和 context 依赖不匹配 | 画依赖图，确保每个 Task 的 context 在列表中排在前面 |
| Token 消耗过高 | 多轮 Agent 对话累积大量历史 | 使用 max_iter 控制迭代次数，精简 expected_output |
| Agent 输出过短 | 没有明确要求输出长度 | 在 expected_output 中指定「至少 500 字」或「不少于 5 个要点」 |
| 多个 Agent 输出雷同 | Role 差异化不够 | 重新设计每个 Agent 的 role/goal/backstory，确保视角不重叠 |

---

## 📝 本章小结

- ✅ **项目架构** — 使用工厂模式组织 Agent 和 Task，Pipeline 模式编排流程
- ✅ **内容生产流水线** — 策划 → 研究 → 写作 → 审核 的完整链路
- ✅ **角色设计** — 通过 role、goal、backstory 让每个 Agent 有鲜明的差异化定位
- ✅ **Task 链** — 通过 context 参数建立任务之间的数据依赖
- ✅ **生产化** — 错误重试、监控统计、文件输出管理

## ➡️ 下一步

> 恭喜你完成了 CrewAI 与多 Agent 协作的全部学习！你现在已经掌握了从单 Agent 构建到多 Agent 编排再到生产级部署的全栈能力。
>
> 接下来，你可以进入 [阶段 4：前端 + Agent 融合](../stage-4/README.md)，学习如何将 Agent 能力融入前端应用，打造 AI-Native 产品体验。
