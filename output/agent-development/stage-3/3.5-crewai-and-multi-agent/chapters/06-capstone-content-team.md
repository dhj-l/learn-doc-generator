# 第6章：综合实战 — AI 内容生产团队

> 预计学习时间：120-150 分钟（全书最高潮）

## 💡 本章概览

**生活类比：** 一家成熟的杂志社有三个核心角色——**研究员**（收集资料、验证事实）、**写手**（撰写稿件）、**编辑**（审查修改、把控质量）。他们各司其职，协同完成一篇篇高质量的报道。

本章我们将用 CrewAI 构建一个完整的 **AI 内容生产团队**——研究员 Agent、写手 Agent、编辑 Agent 协同工作，从零开始完成一篇高质量的技术文章。我们会把前面五章学到的所有知识融会贯通：

- Agent 角色定义（第1-2章）
- 自定义工具开发（第3章）
- 编排模式设计（第4章）
- A2A 通信协议（第5章）

最终产出的是一个**可运行、可扩展、生产级**的 AI 内容生产系统。

## 📋 前置知识

> 建议先完成：第1-5章全部内容

---

## 一、项目架构

### 1.1 整体架构

```
┌──────────────────────────────────────────────────────┐
│                 AI 内容生产团队                        │
│                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  研究员 Agent │  │  写手 Agent  │  │  编辑 Agent  │ │
│  │  (Researcher) │  │  (Writer)   │  │  (Editor)   │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                 │          │
│         ▼                 ▼                 ▼          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ 搜索工具      │  │ 文件读取工具  │  │ 质量检查工具  │ │
│  │ 网页抓取工具  │  │ 结构化工具   │  │ 评分系统     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Pipeline 编排层                      │  │
│  │  顺序执行 → 条件判断 → 质量门禁 → 输出结果      │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 1.2 项目目录结构

```
ai-content-team/
├── main.py                    # 主入口
├── requirements.txt           # 依赖
├── config.py                  # 配置
├── agents/
│   ├── __init__.py
│   ├── researcher.py          # 研究员 Agent
│   ├── writer.py              # 写手 Agent
│   └── editor.py              # 编辑 Agent
├── tools/
│   ├── __init__.py
│   ├── search_tools.py        # 搜索工具
│   ├── file_tools.py          # 文件工具
│   └── quality_tools.py       # 质量检查工具
├── pipeline/
│   ├── __init__.py
│   └── content_pipeline.py    # 内容生产流水线
├── output/                    # 输出目录
│   ├── research/              # 研究报告
│   ├── drafts/                # 草稿
│   └── final/                 # 最终文章
└── tests/
    └── test_pipeline.py       # 集成测试
```

---

## 二、自定义工具开发

### 2.1 搜索与资料收集工具

```python
# tools/search_tools.py
import json
from typing import Type, Optional, List
from pydantic import BaseModel, Field
from crewai.tools import BaseTool


class WebSearchInput(BaseModel):
    """搜索输入参数"""
    query: str = Field(description="搜索关键词")
    num_results: int = Field(default=5, description="返回结果数量", ge=1, le=20)


class WebSearchTool(BaseTool):
    """互联网搜索工具——收集最新信息"""

    name: str = "互联网搜索"
    description: str = (
        "搜索互联网获取最新信息。当需要了解某个主题的最新动态、"
        "查找统计数据、获取行业报告时使用这个工具。"
        "返回搜索结果的标题、链接和摘要。"
    )
    args_schema: Type[BaseModel] = WebSearchInput

    def _run(self, query: str, num_results: int = 5) -> str:
        """模拟搜索引擎"""
        # 实际项目中可集成 SerperDevTool 或自定义搜索 API
        mock_results = [
            {
                "title": f"《{query}》—— 2024 年深度研究报告",
                "url": f"https://example.com/research/{i}",
                "snippet": f"这份报告深入分析了{query}的最新发展..."
            }
            for i in range(1, num_results + 1)
        ]

        output = f"🔍 搜索结果：{query}\n"
        output += "=" * 40 + "\n\n"
        for i, result in enumerate(mock_results, 1):
            output += f"{i}. {result['title']}\n"
            output += f"   链接：{result['url']}\n"
            output += f"   摘要：{result['snippet']}\n\n"

        return output


class FactCheckInput(BaseModel):
    """事实核查输入参数"""
    statement: str = Field(description="需要核查的事实陈述")
    sources: List[str] = Field(description="参考资料列表")


class FactCheckTool(BaseTool):
    """事实核查工具——验证信息的准确性"""

    name: str = "事实核查"
    description: str = (
        "核查某个陈述或数据是否准确。"
        "在写入最终文章之前，应该对关键数据进行验证。"
    )
    args_schema: Type[BaseModel] = FactCheckInput

    def _run(self, statement: str, sources: List[str]) -> str:
        """核查事实"""
        # 模拟核查过程
        output = f"✅ 事实核查报告\n"
        output += "=" * 40 + "\n\n"
        output += f"陈述：{statement}\n\n"
        output += "核查结果：\n"
        output += f"- 交叉验证 {len(sources)} 个来源\n"
        output += "- 信息一致性：高（与 3 个来源一致）\n"
        output += "- 置信度：95%\n"
        output += "- 建议：可以放心引用\n"

        return output
```

### 2.2 质量检查工具

```python
# tools/quality_tools.py
from typing import Type, List
from pydantic import BaseModel, Field
from crewai.tools import BaseTool


class QualityCheckInput(BaseModel):
    """质量检查输入参数"""
    content: str = Field(description="要检查的文章内容")
    min_length: int = Field(default=500, description="最小字数要求")
    require_sections: bool = Field(default=True, description="是否要求分节")


class QualityScoreTool(BaseTool):
    """文章质量评分工具"""

    name: str = "质量评分"
    description: str = (
        "对文章进行多维度质量评估，包括："
        "完整性（是否覆盖所有要点）、"
        "可读性（语言是否通俗易懂）、"
        "准确性（事实和数据是否准确）、"
        "结构性（是否有清晰的逻辑结构）。"
        "输出 0-100 的综合评分和改进建议。"
    )
    args_schema: Type[BaseModel] = QualityCheckInput

    def _run(self, content: str, min_length: int = 500, require_sections: bool = True) -> str:
        """评估文章质量"""
        scores = {}
        suggestions = []

        # 1. 完整性评分
        word_count = len(content)
        if word_count >= min_length:
            scores["完整性"] = 90
        else:
            scores["完整性"] = max(0, int((word_count / min_length) * 50))
            suggestions.append(
                f"字数不足：当前 {word_count} 字，建议至少 {min_length} 字"
            )

        # 2. 结构性评分
        has_sections = "##" in content or "###" in content or "一、" in content
        if require_sections and has_sections:
            scores["结构性"] = 85
        elif require_sections:
            scores["结构性"] = 40
            suggestions.append("建议添加标题层级（## 或 ###）来组织内容结构")
        else:
            scores["结构性"] = 70

        # 3. 可读性评分
        avg_sentence_length = sum(
            len(s) for s in content.split("。")
        ) / max(len(content.split("。")), 1)

        if avg_sentence_length < 50:
            scores["可读性"] = 85
        elif avg_sentence_length < 80:
            scores["可读性"] = 70
        else:
            scores["可读性"] = 50
            suggestions.append("部分句子过长，建议拆分，提高可读性")

        # 4. 示例/数据评分
        has_examples = "例如" in content or "比如" in content or "如" in content
        has_data = "%" in content or "数据" in content or "统计" in content

        if has_examples and has_data:
            scores["例证丰富度"] = 90
        elif has_examples or has_data:
            scores["例证丰富度"] = 65
            if not has_examples:
                suggestions.append("建议添加具体例子来支撑论点")
            if not has_data:
                suggestions.append("建议引用数据来增强说服力")
        else:
            scores["例证丰富度"] = 30
            suggestions.append("严重缺乏案例和数据支撑")

        # 综合评分
        total_score = sum(scores.values()) / len(scores)

        # 评级
        if total_score >= 85:
            rating = "🟢 优秀"
        elif total_score >= 70:
            rating = "🟡 良好（建议微调）"
        elif total_score >= 55:
            rating = "🟠 一般（需要修改）"
        else:
            rating = "🔴 不合格（需要重写）"

        output = f"📊 文章质量评估报告\n"
        output += "=" * 40 + "\n\n"
        output += f"综合评分：{total_score:.1f}/100 | 评级：{rating}\n\n"

        output += "维度评分：\n"
        for dim, score in scores.items():
            bar = "█" * (score // 10) + "░" * (10 - score // 10)
            output += f"  {dim}：{score:3d} {bar}\n"

        if suggestions:
            output += f"\n💡 改进建议（{len(suggestions)} 条）：\n"
            for i, suggestion in enumerate(suggestions, 1):
                output += f"  {i}. {suggestion}\n"

        return output


class PlagiarismCheckInput(BaseModel):
    """查重输入参数"""
    content: str = Field(description="要检查的文章内容")


class PlagiarismCheckTool(BaseTool):
    """抄袭检测工具（简化版）"""

    name: str = "原创性检查"
    description: str = "检查文章的原创性，检测是否存在抄袭"

    args_schema: Type[BaseModel] = PlagiarismCheckInput

    def _run(self, content: str) -> str:
        """检查原创性"""
        # 实际项目中集成查重API

        return (
            "🔍 原创性检查报告\n"
            + "=" * 40 + "\n\n"
            + "✅ 原创性评分：92/100\n"
            + "✅ 未检测到明显的抄袭内容\n"
            + "✅ 引用标注建议：文中引用部分建议添加引用标记\n"
        )
```

### 2.3 文件管理工具

```python
# tools/file_tools.py
import os
from typing import Type
from datetime import datetime
from pydantic import BaseModel, Field
from crewai.tools import BaseTool


class SaveContentInput(BaseModel):
    """保存内容输入参数"""
    content: str = Field(description="要保存的内容")
    file_path: str = Field(description="文件保存路径")
    file_type: str = Field(default="markdown", description="文件类型")


class SaveContentTool(BaseTool):
    """保存内容到文件"""

    name: str = "保存文件"
    description: str = "将内容保存到指定路径的文件中。支持 markdown、txt、json 格式。"
    args_schema: Type[BaseModel] = SaveContentInput

    def _run(self, content: str, file_path: str, file_type: str = "markdown") -> str:
        """保存文件"""
        try:
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)

            return f"✅ 文件已保存：{file_path} ({len(content)} 字符)"
        except Exception as e:
            return f"❌ 保存失败：{str(e)}"
```

---

## 三、Agent 定义

### 3.1 研究员 Agent

```python
# agents/researcher.py
from crewai import Agent
from tools.search_tools import WebSearchTool, FactCheckTool
from tools.file_tools import SaveContentTool


def create_researcher() -> Agent:
    """创建研究员 Agent"""

    return Agent(
        role="高级研究员",
        goal=(
            "深入研究指定主题，提供全面、准确、有洞察力的研究分析。"
            "你的研究必须包含：\n"
            "1. 行业背景和市场规模\n"
            "2. 关键技术或核心概念的解释\n"
            "3. 主要玩家和竞争格局\n"
            "4. 实际案例和数据分析\n"
            "5. 未来趋势预测"
        ),
        backstory=(
            "你是一位拥有 15 年行业经验的首席研究员。"
            "你曾在顶级咨询公司和研究机构工作，"
            "擅长从海量信息中提取关键洞察。"
            "你的研究报告以「深度、准确、可读性强」著称。"
            "你总是能找到其他研究员忽略的关键信息。"
            "你习惯用数据说话，每个观点都有数据支撑。"
        ),
        tools=[
            WebSearchTool(),
            FactCheckTool(),
            SaveContentTool(),
        ],
        verbose=True,
        allow_delegation=False,
        max_iter=3,
    )
```

### 3.2 写手 Agent

```python
# agents/writer.py
from crewai import Agent
from tools.file_tools import SaveContentTool


def create_writer() -> Agent:
    """创建写手 Agent"""

    return Agent(
        role="资深技术写手",
        goal=(
            "将复杂的技术概念和研究结果转化为"
            "通俗易懂、引人入胜的文章。"
            "你的文章必须同时具备深度和可读性。"
        ),
        backstory=(
            "你是一位获奖技术作家，有 10 年科技媒体撰稿经验。"
            "你擅长用生动的类比解释复杂概念——"
            "比如把 Transformer 模型比作「阅读理解的注意力机制」，"
            "把多 Agent 系统比作「交响乐团」。"
            "你的文章风格特点是：\n"
            "1. 开头用故事或场景引入，立刻抓住读者\n"
            "2. 核心概念用类比解释，让外行也能理解\n"
            "3. 案例和数据穿插其中，增加可信度\n"
            "4. 段落之间过渡自然，读起来像流水一样顺畅\n"
            "5. 结尾有总结和行动建议，给读者留下思考"
        ),
        tools=[
            SaveContentTool(),
        ],
        verbose=True,
        allow_delegation=False,
        max_iter=4,
    )
```

### 3.3 编辑 Agent

```python
# agents/editor.py
from crewai import Agent
from tools.quality_tools import QualityScoreTool, PlagiarismCheckTool


def create_editor() -> Agent:
    """创建编辑 Agent"""

    return Agent(
        role="主编",
        goal=(
            "确保每一篇输出文章都达到最高标准——"
            "内容准确、逻辑清晰、语言流畅、符合目标受众需求。"
            "你的工作是在发布前发现并修复所有问题。"
        ),
        backstory=(
            "你是一位以严苛著称的主编，有 20 年编辑经验。"
            "你曾经是《自然》杂志的资深编辑，"
            "对文章的要求堪称「变态」级别的严格。\n\n"
            "你审查文章的五个维度：\n"
            "1. 🔴 技术准确性——所有事实、数据、引用必须准确无误\n"
            "2. 🟡 逻辑连贯性——论点之间要有清晰的因果关系\n"
            "3. 🟢 语言表达——用词精准，没有语病和歧义\n"
            "4. 🔵 目标匹配——内容是否适合目标读者群\n"
            "5. 🟣 原创性——是否提供了新的见解或角度\n\n"
            "你给的修改意见虽然严格，但每一条都是为了让文章更好。"
        ),
        tools=[
            QualityScoreTool(),
            PlagiarismCheckTool(),
        ],
        verbose=True,
        allow_delegation=False,
        max_iter=3,
    )
```

---

## 四、内容生产流水线

### 4.1 Pipeline 核心设计

```python
# pipeline/content_pipeline.py
import os
import json
from datetime import datetime
from typing import Optional

from crewai import Task, Crew, Process

from agents.researcher import create_researcher
from agents.writer import create_writer
from agents.editor import create_editor


class ContentPipeline:
    """
    AI 内容生产流水线

    **流程：**
    研究员研究 → 写手撰写 → 编辑审查 → 质量评分 →
    ┌─ 合格 → 输出最终文章
    └─ 不合格 → 退回写手修改 → 编辑再审 → 直到合格
    """

    def __init__(self, output_dir: str = "./output"):
        self.output_dir = output_dir
        self._ensure_directories()

        # 创建 Agent
        self.researcher = create_researcher()
        self.writer = create_writer()
        self.editor = create_editor()

        # 记录执行历史
        self.execution_history = []

    def _ensure_directories(self):
        """创建输出目录"""
        for subdir in ["research", "drafts", "final"]:
            os.makedirs(os.path.join(self.output_dir, subdir), exist_ok=True)

    def _save_intermediate(self, subdir: str, filename: str, content: str):
        """保存中间结果"""
        filepath = os.path.join(self.output_dir, subdir, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        return filepath

    # ========== 阶段一：研究 ==========
    def _research_phase(self, topic: str) -> str:
        """
        第一阶段：研究员深入研究主题

        生成研究报告，包含背景、数据、案例、趋势等。
        """
        print("\n" + "=" * 60)
        print("📚 第一阶段：研究阶段")
        print("=" * 60)

        research_task = Task(
            description=(
                f"请对以下主题进行深入研究：\n\n"
                f"**{topic}**\n\n"
                f"请覆盖以下方面：\n"
                f"1. 行业背景——这个领域的现状是什么？\n"
                f"2. 核心概念——需要理解的关键技术或理念\n"
                f"3. 市场数据——规模、增长率、主要玩家\n"
                f"4. 实际案例——至少 3 个具体的应用案例\n"
                f"5. 发展趋势——未来 1-3 年的预测\n\n"
                f"格式要求：Markdown 格式，用 ## 和 ### 分节。"
            ),
            expected_output=(
                "一份 500 字以上的研究报告。"
                "必须包含具体数据、案例和引用来源。"
            ),
            agent=self.researcher,
        )

        research_crew = Crew(
            agents=[self.researcher],
            tasks=[research_task],
            process=Process.sequential,
            verbose=True,
        )

        result = research_crew.kickoff()
        result_str = str(result)

        # 保存研究报告
        filepath = self._save_intermediate(
            "research",
            f"research-{datetime.now().strftime('%Y%m%d-%H%M%S')}.md",
            result_str,
        )

        self.execution_history.append({
            "phase": "research",
            "result": result_str,
            "filepath": filepath,
        })

        print(f"\n✅ 研究报告已完成：{filepath}")
        return result_str

    # ========== 阶段二：撰写 ==========
    def _writing_phase(self, topic: str, research: str) -> str:
        """
        第二阶段：基于研究报告撰写文章

        目标是写出一篇既有深度又有可读性的技术文章。
        """
        print("\n" + "=" * 60)
        print("✍️  第二阶段：撰写阶段")
        print("=" * 60)

        writing_task = Task(
            description=(
                f"请基于以下研究报告，撰写一篇面向技术管理者的文章。\n\n"
                f"主题：{topic}\n\n"
                f"研究报告：\n{research}\n\n"
                f"写作要求：\n"
                f"1. **引人入胜的开头**——用具体场景、故事或惊人的数据开头\n"
                f"2. **清晰的逻辑结构**——至少 4 个节，每节有明确主题\n"
                f"3. **生动的类比**——复杂概念用生活化的类比来解释\n"
                f"4. **数据支撑**——关键论点必须有数据或案例佐证\n"
                f"5. **可操作的建议**——读者看完能从中获得实用信息\n"
                f"6. **共情的结尾**——总结核心观点，引发读者思考\n\n"
                f"格式：Markdown，用 ## 分节。"
            ),
            expected_output="一篇 800-1500 字的完整技术文章。",
            agent=self.writer,
            context=[research],  # 依赖研究报告
        )

        writing_crew = Crew(
            agents=[self.writer],
            tasks=[writing_task],
            process=Process.sequential,
            verbose=True,
        )

        result = writing_crew.kickoff()
        result_str = str(result)

        # 保存草稿
        filepath = self._save_intermediate(
            "drafts",
            f"draft-{datetime.now().strftime('%Y%m%d-%H%M%S')}.md",
            result_str,
        )

        self.execution_history.append({
            "phase": "writing",
            "result": result_str,
            "filepath": filepath,
        })

        print(f"\n✅ 初稿已完成：{filepath}")
        return result_str

    # ========== 阶段三：编辑与质量检查 ==========
    def _editing_phase(self, topic: str, research: str, draft: str) -> tuple:
        """
        第三阶段：编辑审查 + 质量评分

        返回：(审查报告, 质量评分)
        """
        print("\n" + "=" * 60)
        print("🔍 第三阶段：编辑与质量审查")
        print("=" * 60)

        # 3a. 编辑审查
        editing_task = Task(
            description=(
                f"请审查以下文章，给出详细的修改建议。\n\n"
                f"主题：{topic}\n\n"
                f"文章：\n{draft}\n\n"
                f"研究报告（供参考）：\n{research[:1000]}...\n\n"
                f"审查维度：\n"
                f"1. 🔴 技术准确性——数据和事实是否正确？\n"
                f"2. 🟡 逻辑连贯性——论点之间的逻辑关系是否清晰？\n"
                f"3. 🟢 语言表达——是否有语病、冗余或歧义？\n"
                f"4. 🔵 结构完整性——是否覆盖了所有该讲的内容？\n\n"
                f"输出格式：\n"
                f"- 总体评价（通过/修改/重写）\n"
                f"- 具体问题列表（按严重程度排序）\n"
                f"- 修改建议（直接给出修改后的文本）"
            ),
            expected_output="一份详细的编辑审查报告。",
            agent=self.editor,
            context=[research, draft],
        )

        # 3b. 质量评分
        quality_task = Task(
            description=(
                f"请对以下文章进行质量评分：\n\n"
                f"{draft}\n\n"
                f"使用质量评分工具给出完整的评分报告。"
            ),
            expected_output="质量评分报告。",
            agent=self.editor,
        )

        edit_crew = Crew(
            agents=[self.editor],
            tasks=[editing_task, quality_task],
            process=Process.sequential,
            verbose=True,
        )

        result = edit_crew.kickoff()
        result_str = str(result)

        self.execution_history.append({
            "phase": "editing",
            "result": result_str,
        })

        print(f"\n✅ 编辑审查已完成")
        return result_str

    # ========== 主流程 ==========
    def produce_article(
        self,
        topic: str,
        max_revision_rounds: int = 2,
    ) -> dict:
        """
        完整的内容生产流程

        Args:
            topic: 文章主题
            max_revision_rounds: 最大修改轮数

        Returns:
            {
                "topic": 主题,
                "research": 研究报告,
                "draft": 最终文章,
                "edit_report": 编辑报告,
                "rounds": 修改轮数,
                "output_path": 输出路径,
            }
        """
        print(f"\n{'=' * 60}")
        print(f"🚀 AI 内容生产团队开始工作！")
        print(f"📌 主题：{topic}")
        print(f"{'=' * 60}\n")

        # 阶段一：研究
        research = self._research_phase(topic)

        # 阶段二：撰写初稿
        draft = self._writing_phase(topic, research)

        # 阶段三：编辑审查 + 迭代修改
        current_draft = draft
        final_edit_report = ""

        for round_num in range(max_revision_rounds):
            print(f"\n{'=' * 60}")
            print(f"🔄 修改轮次 {round_num + 1}/{max_revision_rounds}")
            print(f"{'=' * 60}")

            edit_report = self._editing_phase(topic, research, current_draft)

            # 检查是否通过
            if "通过" in edit_report or "PASS" in edit_report.upper():
                print("\n✅ 文章已通过审查！")
                final_edit_report = edit_report
                break

            # 需要修改：重新撰写
            print(f"\n📝 需要进行第 {round_num + 1} 轮修改...")
            revision_task = Task(
                description=(
                    f"请根据编辑的审查意见修改以下文章。\n\n"
                    f"原文：\n{current_draft}\n\n"
                    f"编辑意见：\n{edit_report}\n\n"
                    f"请根据所有修改建议重写文章。"
                ),
                expected_output="修改后的文章。",
                agent=self.writer,
                context=[current_draft, edit_report],
            )

            revision_crew = Crew(
                agents=[self.writer],
                tasks=[revision_task],
                process=Process.sequential,
                verbose=True,
            )

            current_draft = str(revision_crew.kickoff())
            final_edit_report = edit_report

        # 保存最终文章
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        final_path = self._save_intermediate(
            "final",
            f"article-{timestamp}.md",
            current_draft,
        )

        # 生成执行报告
        print(f"\n{'=' * 60}")
        print("🎉 内容生产完成！")
        print(f"{'=' * 60}")

        return {
            "topic": topic,
            "research": research,
            "draft": current_draft,
            "edit_report": final_edit_report,
            "rounds": len(self.execution_history),
            "output_path": final_path,
            "history": self.execution_history,
        }
```

### 4.2 主入口

```python
# main.py
import sys
from pipeline.content_pipeline import ContentPipeline


def main():
    """AI 内容生产团队 —— 主入口"""
    print(r"""
    ╔══════════════════════════════════════════╗
    ║     🤖 AI 内容生产团队 v1.0             ║
    ║     研究员 + 写手 + 编辑                ║
    ╚══════════════════════════════════════════╝
    """)

    # 从命令行参数获取主题
    if len(sys.argv) > 1:
        topic = " ".join(sys.argv[1:])
    else:
        topic = input("📌 请输入文章主题：").strip()

    if not topic:
        print("❌ 主题不能为空！")
        return

    # 创建流水线并执行
    pipeline = ContentPipeline(output_dir="./output")

    try:
        result = pipeline.produce_article(
            topic=topic,
            max_revision_rounds=2,
        )

        print(f"\n✅ 最终文章已保存到：{result['output_path']}")
        print(f"📊 执行统计：{result['rounds']} 个步骤")

        # 显示文章预览
        print("\n📝 文章预览：")
        print("-" * 40)
        print(result["draft"][:500] + "...")
        print("-" * 40)

    except Exception as e:
        print(f"\n❌ 内容生产失败：{str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
```

### 4.3 依赖和配置

```python
# config.py
"""项目配置"""

import os
from dotenv import load_dotenv

load_dotenv()

# LLM 配置
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4")

# 输出配置
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "./output")

# Pipeline 配置
MAX_REVISION_ROUNDS = int(os.getenv("MAX_REVISION_ROUNDS", "2"))
MIN_ARTICLE_LENGTH = int(os.getenv("MIN_ARTICLE_LENGTH", "800"))
```

```text
# requirements.txt
crewai>=0.30.0
crewai-tools>=0.0.10
python-dotenv>=1.0.0
pydantic>=2.0.0
```

---

## 五、运行与使用

### 5.1 运行命令

```bash
# 安装依赖
pip install -r requirements.txt

# 配置 API Key
export OPENAI_API_KEY=your-api-key-here

# 运行（交互式输入主题）
python main.py

# 运行（直接指定主题）
python main.py "2024 年 Multi-Agent 系统的发展趋势"

# 指定输出目录
OUTPUT_DIR=./my-articles python main.py "AI Agent 企业应用实战"
```

### 5.2 运行示例输出

```
╔══════════════════════════════════════════╗
║     🤖 AI 内容生产团队 v1.0             ║
║     研究员 + 写手 + 编辑                ║
╚══════════════════════════════════════════╝

📌 请输入文章主题：2024年Multi-Agent系统的发展趋势

============================================================
🚀 AI 内容生产团队开始工作！
📌 主题：2024年Multi-Agent系统的发展趋势
============================================================

============================================================
📚 第一阶段：研究阶段
============================================================
[研究员 Agent 正在工作...]
- 使用「互联网搜索」工具搜索 Multi-Agent 系统的行业报告
- 收集了 CrewAI、AutoGen、LangGraph 等框架的对比数据
- 分析了 3 个企业级应用案例
✅ 研究报告已完成：./output/research/research-20240115-143022.md

============================================================
✍️  第二阶段：撰写阶段
============================================================
[写手 Agent 正在工作...]
- 用「交响乐团」类比解释多 Agent 协作
- 穿插了 Google、Microsoft、Anthropic 的实际案例
- 给出了企业采纳多 Agent 系统的分阶段路线图
✅ 初稿已完成：./output/drafts/draft-20240115-144103.md

============================================================
🔍 第三阶段：编辑与质量审查
============================================================
[编辑 Agent 正在工作...]
- 发现了一处数据引用不准确（已标注更正）
- 建议在第三部分增加一个具体的代码示例
- 整体评价：内容扎实，语言生动，建议微调后发布
✅ 文章已通过审查！

🎉 内容生产完成！
✅ 最终文章已保存到：./output/final/article-20240115-145230.md
```

---

## 六、扩展与定制

### 6.1 添加新的 Agent 角色

```python
# 示例：添加 SEO 优化 Agent
seo_agent = Agent(
    role="SEO 优化师",
    goal="优化文章的关键词分布和搜索引擎排名",
    backstory="SEO 专家，精通搜索引擎优化技术",
    tools=[KeywordAnalysisTool(), MetaDataGeneratorTool()],
)

# 在 Pipeline 中添加
class EnhancedPipeline(ContentPipeline):
    def _seo_phase(self, draft: str) -> str:
        """SEO 优化阶段"""
        seo_task = Task(
            description=f"优化以下文章的 SEO：\n\n{draft}",
            expected_output="SEO 优化后的文章",
            agent=seo_agent,
        )
        # ... 执行优化
```

### 6.2 支持多种内容格式

```python
# 扩展支持：新闻稿、技术文档、社交媒体帖子
CONTENT_TEMPLATES = {
    "blog": "技术博客（800-1500 字，适合开发者阅读）",
    "newsletter": "邮件通讯（300-500 字，简洁精炼）",
    "whitepaper": "白皮书（3000-5000 字，深度研究）",
    "social": "社交媒体帖子（100-200 字，抓眼球）",
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么内容生产流水线要设计为「研究 → 撰写 → 编辑 → 可能循环」的形式？**

> A：这是因为内容生产的本质是一个「信息处理漏斗」——从大量的原始信息（研究阶段）浓缩为结构化的知识（撰写阶段），再经过精细打磨（编辑阶段）变成高质量内容。而编辑后可能需要回头修改，就形成了反馈循环。这个模式模仿了人类专业出版机构的工作流程，已经被验证为最高效的内容生产方式。如果所有步骤一步到位，质量往往不可控。

**Q2：质量评分工具中的多个维度（完整性、结构性、可读性等）是怎么确定的？为什么需要这些维度？**

> A：这些维度来自专业编辑行业的质量评估标准。完整性确保内容不遗漏关键要点；结构性确保读者能跟上逻辑脉络；可读性确保目标受众能轻松理解；例证丰富度确保观点有事实支撑。一个好的编辑不是凭感觉判断文章好不好，而是从这些可量化的维度进行评估。多维度评分比单一总分更有价值——因为它能告诉作者具体在哪个方面需要改进。

**Q3：如果文章质量评分很低，Pipeline 的循环机制最多会修改几次？会不会陷入死循环？**

> A：我们设置了 `max_revision_rounds=2`，最多修改 2 轮（加上初稿共 3 次写作机会）。这是为了防止死循环——如果 3 次都写不好，说明 Agent 的能力不足以处理这个主题，或者工具/数据源有问题。实际项目中还可以加入「质量阈值」机制：如果评分超过某个值（如 70 分）就通过，否则进入修改循环，但不超过最大轮数。这样既保证了质量，又防止了无限循环。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 研究员 Agent 的输出格式不符合写手 Agent 的输入要求 | 两个 Agent 的 Prompt 中未约定统一的输出/输入格式 | 在 Pipeline 中增加格式转换节点，或为所有 Agent 定义统一的结构化数据 Schema |
| 事实核查工具误判正确信息为错误 | 工具的验证规则过于严格或数据源不完整 | 配置多数据源交叉验证，设置置信度阈值，低置信度时标记为「需人工核查」而非直接拒绝 |
| 质量评分工具返回的分数与编辑判断不一致 | 评分工具的评分标准与编辑的评估维度不匹配 | 在评分工具的 Prompt 中明确列出与编辑一致的评分维度（如准确性、完整性、可读性）|
| 内容修改循环陷入无限迭代 | 每次修改后评分仍不满足阈值，触发反复修改 | 设置最大迭代次数（如 3 轮），超出后输出当前最佳版本并标记未达标的项 |

---

## 📝 本章小结

- ✅ **完整项目架构** — 研究员 + 写手 + 编辑 三层内容生产团队
- ✅ **自定义工具** — 搜索、事实核查、质量评分、原创性检查
- ✅ **角色定义** — 每个 Agent 有明确的角色、目标和背景故事
- ✅ **Pipeline 设计** — 研究 → 撰写 → 编辑 → 质量门禁 → 迭代
- ✅ **质量控制** — 多维度评分、编辑审查、修改循环
- ✅ **可扩展性** — 易于添加新角色、新格式、新工具

## 🎉 全书总结

恭喜你完成了 CrewAI 多 Agent 系统的全部六章学习！

从 Multi-Agent 的设计原则，到 CrewAI 的基础使用，再到自定义工具开发、编排模式设计、A2A 协议通信，最后到完整的内容生产平台——你已经掌握了构建企业级多 Agent 系统的完整技能。

**多 Agent 系统的核心思想：** 就像一家优秀的企业需要不同角色的员工协作一样，复杂的 AI 任务需要多个专业化的 Agent 协同完成。CrewAI 让构建这样的 AI 团队变得简单而优雅。

## 📎 附录

> [速查表](../appendix/cheatsheet.md) | [排错指南](../appendix/troubleshooting.md)
