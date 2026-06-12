# 第5章：A2A 通信协议 — Agent-to-Agent 标准化通信

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解 A2A 协议的核心概念** — Agent-to-Agent 通信的背景和设计目标
- **对比 MCP 和 A2A** — 知道两者的定位差异和互补关系
- **实现 A2A 通信模式** — 让多个独立 Agent 通过网络协议交换信息
- **在 CrewAI 中集成 A2A** — 扩展多 Agent 协作的网络通信能力

## 📋 前置知识

> 建议先完成：
> - [第3章：自定义工具集成](./03-crewai-tools.md) — 掌握 Agent 工具概念
> - 了解基本的 REST API 和 HTTP 通信

---

## 💡 核心概念

### 什么是 A2A 协议？

**生活类比：** MCP 协议是「USB 接口」——让 Agent 连接各种工具。A2A 协议是「对讲机」——让不同的 Agent 之间直接对话。

Google 在 2025 年初提出的 A2A（Agent-to-Agent）协议，解决的问题是：**不同厂商、不同技术栈的 Agent 如何互相通信？**

```
┌─────────────────────────────────────────────────┐
│                 A2A 协议全景                      │
│                                                   │
│  ┌──────────────┐        ┌──────────────┐       │
│  │  Agent A     │  A2A   │  Agent B     │       │
│  │  (CrewAI)    │◄──────►│  (LangGraph) │       │
│  └──────┬───────┘        └──────┬───────┘       │
│         │                       │                │
│    MCP  │                  MCP  │                │
│         ▼                       ▼                │
│  ┌──────────────┐        ┌──────────────┐       │
│  │  工具 Server  │        │  工具 Server  │       │
│  └──────────────┘        └──────────────┘       │
│                                                   │
│  MCP: Agent ↔ 工具       A2A: Agent ↔ Agent     │
└─────────────────────────────────────────────────┘
```

### MCP vs A2A — 定位差异

| 维度 | MCP | A2A |
|------|-----|-----|
| **连接什么** | Agent → 工具 | Agent → Agent |
| **类比** | USB 接口（设备连接） | 对讲机（人与人通话） |
| **发起方** | Agent（Client） | 双方（对等） |
| **通信模式** | 请求-响应 | 任务委派+状态更新 |
| **关注点** | 工具调用标准化 | Agent 协作标准化 |
| **适用场景** | 扩展 Agent 能力 | 多 Agent 系统协作 |

### A2A 的核心概念

A2A 协议定义了四个关键概念：

```
1. Agent Card — Agent 的能力声明（我能做什么）
2. Task — 任务单元（需要完成什么）
3. Message — 通信内容（agent 之间说什么）
4. Artifact — 任务产物（交付什么）
```

```python
# Agent Card — Agent 的能力声明
agent_card = {
    "name": "research-agent",
    "version": "1.0.0",
    "capabilities": {
        "skills": ["web_search", "data_analysis", "report_generation"],
        "max_tasks": 5,
    },
    "endpoints": [
        {
            "url": "https://research.internal.io/a2a",
            "protocol": "a2a/v1",
        }
    ],
}

# Task — 任务请求
task_request = {
    "id": "task-001",
    "type": "research",
    "input": {
        "query": "2025年 AI Agent 框架最新进展",
        "depth": "detailed",
    },
    "timestamp": "2026-06-11T10:00:00Z",
}

# Message — 通信消息
message = {
    "task_id": "task-001",
    "role": "agent",  # 或 "user"
    "content": "研究完成，已找到 5 篇相关技术博客和 2 篇论文。",
    "timestamp": "2026-06-11T10:05:00Z",
}

# Artifact — 任务产物
artifact = {
    "task_id": "task-001",
    "type": "report",
    "format": "markdown",
    "content": "# 2025 AI Agent 框架进展报告\n\n...",
    "references": ["https://...", "https://..."],
}
```

**💡 为什么需要 Agent Card？** 在一个多 Agent 系统中，Agent A 需要知道 Agent B「能做什么」才能正确委派任务。Agent Card 就是 Agent 的「简历」——声明自己的技能、限速、联系地址。

### 在 CrewAI 中实现 A2A 风格通信

CrewAI 本身不直接实现 A2A 协议，但你可以通过工具模式让 Agent 具备与远程 Agent 通信的能力：

```python
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from typing import Optional
import requests
import json

class A2AMessageInput(BaseModel):
    target_agent_url: str = Field(description="目标 Agent 的 A2A 端点 URL")
    task_description: str = Field(description="要委派给目标 Agent 的任务描述")
    expected_output: str = Field(description="期望的输出格式")

class A2AClientTool(BaseTool):
    name: str = "A2A 代理委派工具"
    description: str = "通过 A2A 协议将任务委派给其他 Agent，等待结果返回"

    def _run(self, target_agent_url: str, task_description: str, expected_output: str) -> str:
        """模拟 A2A 协议的任务委派"""
        try:
            # 1. 获取目标 Agent 的能力声明
            agent_card_response = requests.get(
                f"{target_agent_url}/.well-known/agent.json",
                timeout=5,
            )

            if agent_card_response.status_code != 200:
                return f"错误：无法获取目标 Agent 的能力声明（{agent_card_response.status_code}）"

            agent_card = agent_card_response.json()
            skills = agent_card.get("capabilities", {}).get("skills", [])

            # 2. 检查任务是否匹配 Agent 能力
            query_domain = task_description.split(" ")[0].lower()
            has_skill = any(query_domain in skill.lower() for skill in skills)

            if not has_skill:
                return (
                    f"能力不匹配：目标 Agent 具备 {', '.join(skills)} 能力，"
                    f"但你的任务涉及 '{task_description}' 领域，可能不在此 Agent 专长范围内。\n"
                    f"建议：检查任务描述是否准确，或选择其他 Agent。"
                )

            # 3. 委派任务（模拟）
            task_id = f"a2a-{hash(task_description)}"
            result = f"""
✅ 已通过 A2A 协议将任务委派给 {agent_card.get('name', '未知')}。

任务详情：
- 任务 ID：{task_id}
- 目标 Agent：{agent_card.get('name')}
- 任务描述：{task_description}
- Agent 能力匹配：{', '.join(skills)}

模拟执行结果（实际场景中需要等待异步任务完成）：
[完成] 已按照要求完成「{task_description}」
[输出] {expected_output}
"""
            return result

        except requests.ConnectionError:
            return f"连接错误：无法连接到 {target_agent_url}。请确认目标 Agent 在线。"
        except requests.Timeout:
            return "超时：目标 Agent 响应超时（5 秒），请稍后重试。"
        except Exception as e:
            return f"A2A 通信失败：{str(e)}"
```

---

## 🔨 实战演练

### 练习：构建 A2A 协作系统

**场景描述：** 你有两个 CrewAI Agent 团队——「研究团队」和「报告团队」。研究团队负责调研，报告团队负责写作。通过 A2A 工具让它们协作。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```python
from crewai import Agent, Task, Crew, Process
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from typing import Optional

# ===== A2A 通信工具 =====
class DelegateToResearchTeamInput(BaseModel):
    topic: str = Field(description="需要研究的主题")
    details: str = Field(description="研究的详细要求和关注点")

class DelegateToResearchTeamTool(BaseTool):
    name: str = "委派给研究团队"
    description: str = "将研究任务委派给专门的研究 Agent 团队，获取详细研究结果"
    args_schema: Type[BaseModel] = DelegateToResearchTeamInput

    def _run(self, topic: str, details: str) -> str:
        # 模拟研究团队返回结果
        return f"""
研究团队报告 — 主题：{topic}

关键发现：
1. MCP 协议在 2025 年获得广泛 adoption，主流 Agent 框架均已支持
2. A2A 协议填补了 Agent 间通信的空白，与 MCP 互补使用
3. 多 Agent 系统的生产效率提升 3-5 倍（基于早期用户数据）

数据来源：
- Anthropic 官方博客 (2025-12)
- Google Research A2A 白皮书
- CrewAI 社区案例研究
"""

# ===== 写手 Agent =====
researcher_agent = Agent(
    role='研究员协调员',
    goal='协调外部研究资源，获取准确信息',
    backstory='你负责与专业研究团队沟通，获取高质量的研究成果。',
    tools=[DelegateToResearchTeamTool()],
)

writer_agent = Agent(
    role='技术写手',
    goal='基于研究结果撰写高质量文章',
    backstory='你擅长将研究报告转化为引人入胜的技术文章。',
)

# ===== Task =====
research_task = Task(
    description='研究「MCP 和 A2A 协议的互补关系」这个主题',
    expected_output='一份详细的研究报告，包含关键发现和数据来源',
    agent=researcher_agent,
)

writing_task = Task(
    description='基于研究结果写一篇 500 字的技术博客，解释 MCP 和 A2A 如何协同工作',
    expected_output='一篇适合技术社区发布的技术文章',
    agent=writer_agent,
    context=[research_task],
)

# ===== Crew =====
crew = Crew(
    agents=[researcher_agent, writer_agent],
    tasks=[research_task, writing_task],
    process=Process.sequential,
    verbose=True,
)

result = crew.kickoff()
print(result)
```

**预期输出：**
```
研究员协调员 → 通过 A2A 工具向研究团队发起委派
→ 获取研究报告（MCP 与 A2A 的互补关系）
技术写手 → 阅读研究报告 → 撰写技术文章
→ 产出：《MCP 和 A2A：AI Agent 生态的双引擎》
```

</details>

---

## ⚡ 进阶技巧

### Agent 发现机制

在大型多 Agent 系统中，需要一个注册中心让 Agent 互相发现：

```python
class AgentRegistry:
    """Agent 注册中心 — 让 Agent 互相发现"""
    def __init__(self):
        self.agents: dict = {}

    def register(self, agent_id: str, agent_card: dict):
        self.agents[agent_id] = {
            **agent_card,
            "registered_at": "2026-06-11T10:00:00Z",
            "status": "online",
        }

    def discover(self, skill: str) -> list[dict]:
        """按技能搜索 Agent"""
        results = []
        for agent_id, card in self.agents.items():
            if skill in card.get("capabilities", {}).get("skills", []):
                results.append({"id": agent_id, **card})
        return results

    def health_check(self) -> dict:
        """返回所有 Agent 的状态"""
        return {
            agent_id: {"status": info["status"], "skills": info["capabilities"]["skills"]}
            for agent_id, info in self.agents.items()
        }

# 使用
registry = AgentRegistry()
registry.register("research-team", {
    "name": "Research Team",
    "capabilities": {"skills": ["research", "analysis", "fact_checking"]},
})
registry.register("writing-team", {
    "name": "Writing Team",
    "capabilities": {"skills": ["writing", "editing", "translation"]},
})

# Agent 发现可写文章的团队
writers = registry.discover("writing")
print(f"找到 {len(writers)} 个写作团队")
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：MCP 和 A2A 可以同时使用吗？**

> A：可以，而且这正是推荐的做法。MCP 让 Agent 接入各种工具（文件系统、数据库、API），A2A 让 Agent 之间互相通信和委派任务。一个完整的 Agent 系统通常同时使用两者——用 MCP 扩展能力，用 A2A 实现协作。

**Q2：A2A 的 Agent Card 解决了什么问题？**

> A：在多 Agent 系统中，一个 Agent 需要知道「把任务交给谁」。没有 Agent Card，Agent 只能通过硬编码地址通信，或者广播给所有 Agent。Agent Card 相当于一个「技能目录」，让 Agent 能根据任务类型智能匹配合适的执行者。

**Q3：CrewAI 是否原生支持 A2A 协议？**

> A：CrewAI 当前没有直接实现 Google 的 A2A 协议，但可以通过工具模式（如本章的 A2AClientTool）来模拟 A2A 风格的通信。对于需要严格遵循 A2A 标准的场景，需要自行实现协议细节或使用专门的 A2A 框架。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Agent 之间通信无限循环 | A 委派给 B，B 又委派回 A | 设置 max_delegation_depth（最大委派深度） |
| 委派后长时间无响应 | 目标 Agent 执行超时 | 设置超时时间，超时后尝试其他 Agent |
| 任务结果格式不匹配 | 委派时没明确 expected_output | 在 task_description 中详细说明输出格式 |
| Agent 发现到已离线的 Agent | 注册中心信息过期 | 定期执行健康检查，更新状态 |

---

## 📝 本章小结

- ✅ **A2A 协议** — Google 提出的 Agent-to-Agent 标准化通信协议
- ✅ **MCP vs A2A** — MCP 连接工具，A2A 连接 Agent，两者互补而非竞争
- ✅ **核心概念** — Agent Card（能力声明）、Task（任务单元）、Message（通信消息）、Artifact（任务产物）
- ✅ **CrewAI 集成** — 通过自定义工具实现 A2A 风格的 Agent 间通信
- ✅ **Agent 发现** — 注册中心让 Agent 按技能互相发现

## ➡️ 下一章预告

> 在下一章——也就是本主题的最后一章中，我们将综合运用所有 CrewAI 知识，构建一个包含研究员、写手、编辑的完整 AI 内容生产团队，实现端到端的自动化内容生产流程。
> [第6章：综合实战 — AI 内容团队](./06-capstone-content-team.md)
