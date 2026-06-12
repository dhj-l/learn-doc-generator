# 第5章：A2A 通信协议 — Agent 间的通用语言

> 预计学习时间：80-100 分钟

## 💡 本章概览

**生活类比：** 假设你在一家跨国公司工作。你和隔壁工位的同事讲中文（同一个 Crew），但和其他分公司的同事就需要统一的商务语言——通常是英语。A2A（Agent-to-Agent）协议就是 AI Agent 之间的「商务英语」。

如果说 MCP（我们在 3.4 章节学习的协议）是 Agent 调用「工具」的标准协议，那么 A2A 就是 Agent 与 Agent 之间直接「对话」的标准协议。它们解决的是不同层面的问题：

- **MCP**：Agent → 工具（人使用工具）
- **A2A**：Agent ↔ Agent（人与人协作）

**本章核心问题：** 当多个 Agent 属于不同的系统、不同的团队、甚至不同的组织时，它们如何发现彼此、如何通信、如何协作完成同一个任务？

## 📋 前置知识

> 建议先完成：第1-4章内容，了解 Multi-Agent 基本原理和 CrewAI 框架

---

## 一、A2A 协议概述

### 1.1 什么是 A2A？

A2A（Agent-to-Agent）是由 Google 在 2024 年提出的标准化 Agent 通信协议。它定义了一套通用的「语言」和「社交礼仪」，让不同框架、不同厂商的 AI Agent 能够互相通信和协作。

**核心设计理念：**

```
┌─────────────────────────────────────────────────┐
│                  A2A 协议层                      │
│                                                   │
│  ┌─────────────┐         ┌─────────────┐        │
│  │ Agent A     │         │ Agent B     │        │
│  │ (CrewAI)    │ ◄─────► │ (LangGraph) │        │
│  │             │  A2A    │             │        │
│  └─────────────┘         └─────────────┘        │
│         │                      │                 │
│         ▼                      ▼                 │
│  ┌─────────────┐         ┌─────────────┐        │
│  │  MCP Tools  │         │  MCP Tools  │        │
│  └─────────────┘         └─────────────┘        │
└─────────────────────────────────────────────────┘
```

### 1.2 A2A 与 MCP 的对比

| 特性 | MCP (Model Context Protocol) | A2A (Agent-to-Agent) |
|------|------|------|
| **通信主体** | Agent ↔ 工具 | Agent ↔ Agent |
| **类比** | USB 接口（人用工具） | 电话/对讲机（人与人对话） |
| **消息类型** | 请求/响应（RPC） | 消息/任务/事件 |
| **通信方向** | 单向调用 | 双向对话 |
| **状态管理** | 无状态 | 有状态（会话） |
| **发现机制** | 预配置连接 | 服务发现/注册中心 |
| **适用场景** | Agent 执行操作 | Agent 协作完成任务 |
| **标准化组织** | Anthropic | Google |

### 1.3 A2A 的核心概念

```
┌───────────────────────────────────────────┐
│            A2A 消息结构                    │
│                                            │
│  {
│    "agent_id": "researcher-1",           │
│    "message_type": "task_request",       │
│    "task_id": "task-123",               │
│    "content": {                          │
│      "text": "请帮我搜索...",            │
│      "metadata": {                       │
│        "priority": "high",              │
│        "deadline": "2024-12-31"         │
│      }                                   │
│    },                                     │
│    "reply_to": "manager-1",             │
│    "timestamp": "2024-01-15T10:30:00Z"   │
│  }                                        │
└───────────────────────────────────────────┘
```

| 概念 | 说明 |
|------|------|
| **Agent ID** | Agent 的唯一标识符 |
| **Message Type** | 消息类型（请求、响应、通知、事件） |
| **Task** | 可追踪的工作单元，有状态和生命周期 |
| **Capability** | Agent 公开的能力声明 |
| **Discovery** | Agent 发现其他 Agent 的机制 |

---

## 二、A2A 消息传递

### 2.1 消息类型

```python
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, Any, Dict
from datetime import datetime
import json


class MessageType(str, Enum):
    """A2A 消息类型"""

    # ========== 任务相关 ==========
    TASK_REQUEST = "task_request"       # 请求其他 Agent 执行任务
    TASK_ACCEPT = "task_accept"         # 接受任务
    TASK_REJECT = "task_reject"         # 拒绝任务
    TASK_PROGRESS = "task_progress"     # 任务进度更新
    TASK_COMPLETE = "task_complete"     # 任务完成
    TASK_FAILED = "task_failed"         # 任务失败

    # ========== 信息相关 ==========
    INFO_REQUEST = "info_request"       # 请求信息
    INFO_RESPONSE = "info_response"     # 响应信息

    # ========== 协调相关 ==========
    DELEGATE = "delegate"               # 委派子任务
    SYNCHRONIZE = "synchronize"         # 同步状态
    QUERY_CAPABILITY = "query_capability"  # 查询能力
    CAPABILITY_RESPONSE = "capability_response"  # 能力响应

    # ========== 系统相关 ==========
    ERROR = "error"                     # 错误
    HEARTBEAT = "heartbeat"             # 心跳检测
    SHUTDOWN = "shutdown"               # 关闭


@dataclass
class A2AMessage:
    """A2A 消息结构"""

    # 发送方
    sender_id: str
    # 接收方（None 表示广播）
    receiver_id: Optional[str] = None
    # 消息类型
    message_type: MessageType = MessageType.TASK_REQUEST
    # 关联的任务 ID
    task_id: Optional[str] = None
    # 内容
    content: Dict[str, Any] = field(default_factory=dict)
    # 回复地址（用于异步回调）
    reply_to: Optional[str] = None
    # 时间戳
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    # 消息 ID
    message_id: str = field(default_factory=lambda: f"msg-{datetime.now().timestamp()}")

    def to_json(self) -> str:
        """序列化为 JSON"""
        return json.dumps({
            "sender_id": self.sender_id,
            "receiver_id": self.receiver_id,
            "message_type": self.message_type.value,
            "task_id": self.task_id,
            "content": self.content,
            "reply_to": self.reply_to,
            "timestamp": self.timestamp,
            "message_id": self.message_id,
        }, ensure_ascii=False)

    @classmethod
    def from_json(cls, json_str: str) -> "A2AMessage":
        """从 JSON 反序列化"""
        data = json.loads(json_str)
        return cls(
            sender_id=data["sender_id"],
            receiver_id=data.get("receiver_id"),
            message_type=MessageType(data["message_type"]),
            task_id=data.get("task_id"),
            content=data.get("content", {}),
            reply_to=data.get("reply_to"),
            timestamp=data.get("timestamp", datetime.now().isoformat()),
            message_id=data.get("message_id", f"msg-{datetime.now().timestamp()}"),
        )
```

### 2.2 消息传递实现

```python
import asyncio
from typing import Callable, Awaitable, Dict, List, Optional
from collections import defaultdict


class A2AChannel:
    """
    A2A 通信通道

    **生活类比：** 这就像一个企业内部的对讲机系统——
    每个人有一个频道号（Agent ID），可以：
    - 单独呼叫某人（点对点）
    - 在公共频道广播（广播）
    - 监听特定频道（订阅）
    """

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        # 消息处理器
        self._handlers: Dict[MessageType, List[Callable]] = defaultdict(list)
        # 消息队列（异步消息）
        self._message_queue: asyncio.Queue = asyncio.Queue()
        # 连接的 Agent
        self._peers: Dict[str, "A2AChannel"] = {}
        # 运行状态
        self._running = False

    # ========== 连接管理 ==========

    def connect(self, peer: "A2AChannel"):
        """连接另一个 Agent"""
        self._peers[peer.agent_id] = peer
        peer._peers[self.agent_id] = self
        print(f"🔗 {self.agent_id} <-> {peer.agent_id} 已连接")

    def disconnect(self, peer_id: str):
        """断开与某个 Agent 的连接"""
        if peer_id in self._peers:
            peer = self._peers.pop(peer_id)
            peer._peers.pop(self.agent_id, None)
            print(f"🔌 {self.agent_id} -/-> {peer_id} 已断开")

    # ========== 消息发送 ==========

    async def send(self, message: A2AMessage):
        """发送消息给指定 Agent"""
        if message.receiver_id is None:
            # 广播给所有连接的 Agent
            tasks = [
                self._deliver(peer_id, message)
                for peer_id in self._peers
            ]
            await asyncio.gather(*tasks)
        else:
            # 发送给指定的 Agent
            await self._deliver(message.receiver_id, message)

    async def _deliver(self, receiver_id: str, message: A2AMessage):
        """投递消息到指定 Agent"""
        if receiver_id not in self._peers:
            error_msg = A2AMessage(
                sender_id=self.agent_id,
                receiver_id=self.agent_id,
                message_type=MessageType.ERROR,
                content={
                    "error": f"Agent '{receiver_id}' 未连接",
                    "original_message_id": message.message_id,
                },
            )
            await self._message_queue.put(error_msg)
            return

        peer = self._peers[receiver_id]
        await peer._message_queue.put(message)
        print(f"📨 {self.agent_id} → {receiver_id}: {message.message_type.value}")

    # ========== 消息接收与处理 ==========

    def on(self, message_type: MessageType, handler: Callable[["A2AChannel", A2AMessage], Awaitable[None]]):
        """注册消息处理器"""
        self._handlers[message_type].append(handler)

    async def _process_message(self, message: A2AMessage):
        """处理收到的消息"""
        handlers = self._handlers.get(message.message_type, [])
        if not handlers:
            print(f"⚠️ {self.agent_id}: 未注册 {message.message_type.value} 的处理器")
            return

        for handler in handlers:
            await handler(self, message)

    async def start(self):
        """启动消息处理循环"""
        self._running = True
        print(f"▶️ {self.agent_id} 消息处理已启动")
        while self._running:
            try:
                message = await asyncio.wait_for(
                    self._message_queue.get(),
                    timeout=1.0,
                )
                await self._process_message(message)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"❌ {self.agent_id} 处理消息异常: {e}")

    def stop(self):
        """停止消息处理"""
        self._running = False
        print(f"⏹️ {self.agent_id} 消息处理已停止")
```

### 2.3 基于 A2A 的 Agent 实现

```python
class A2AAgent:
    """
    支持 A2A 协议的 Agent

    继承自 CrewAI 的 Agent，增加了 A2A 通信能力。
    """

    def __init__(self, agent_id: str, role: str, goal: str, backstory: str):
        self.agent_id = agent_id
        self.role = role
        self.goal = goal
        self.backstory = backstory
        self.channel = A2AChannel(agent_id)

        # 注册默认的消息处理器
        self._register_default_handlers()

        # 记录收到的任务
        self.pending_tasks: Dict[str, dict] = {}
        self.completed_tasks: Dict[str, dict] = {}

    def _register_default_handlers(self):
        """注册默认处理器"""

        @self.channel.on(MessageType.TASK_REQUEST)
        async def handle_task_request(channel: A2AChannel, message: A2AMessage):
            """处理任务请求"""
            task_desc = message.content.get("description", "")
            print(f"\n📋 {self.agent_id} 收到任务: {task_desc[:50]}...")

            # 检查是否能接受任务
            if self._can_handle(message.content):
                # 接受任务
                accept_msg = A2AMessage(
                    sender_id=self.agent_id,
                    receiver_id=message.sender_id,
                    message_type=MessageType.TASK_ACCEPT,
                    task_id=message.task_id,
                    content={
                        "status": "accepted",
                        "estimated_time": "5分钟",
                    },
                )
                await channel.send(accept_msg)

                # 执行任务（实际应用中由 CrewAI 执行）
                result = await self._execute_task(message.task_id, message.content)
            else:
                # 拒绝任务
                reject_msg = A2AMessage(
                    sender_id=self.agent_id,
                    receiver_id=message.sender_id,
                    message_type=MessageType.TASK_REJECT,
                    task_id=message.task_id,
                    content={
                        "reason": f"不擅长此任务：{task_desc[:30]}...",
                        "suggestions": ["尝试联系 data-analyst-agent"],
                    },
                )
                await channel.send(reject_msg)

        @self.channel.on(MessageType.INFO_REQUEST)
        async def handle_info_request(channel: A2AChannel, message: A2AMessage):
            """处理信息请求"""
            query = message.content.get("query", "")
            response_msg = A2AMessage(
                sender_id=self.agent_id,
                receiver_id=message.sender_id,
                message_type=MessageType.INFO_RESPONSE,
                task_id=message.task_id,
                content={
                    "query": query,
                    "answer": f"{self.role} 的回答：关于「{query}」的信息...",
                    "confidence": 0.85,
                },
            )
            await channel.send(response_msg)

    def _can_handle(self, task_content: dict) -> bool:
        """判断是否能处理某个任务"""
        # 实际应用中可以根据 role 和 goal 来判断
        return True

    async def _execute_task(self, task_id: str, content: dict) -> str:
        """执行任务（模拟）"""
        await asyncio.sleep(2)  # 模拟任务执行
        return f"{self.role} 已完成任务"

    async def request_task(self, target_id: str, description: str, **kwargs) -> Optional[dict]:
        """向其他 Agent 请求任务执行"""
        task_id = f"task-{self.agent_id}-{datetime.now().timestamp()}"

        request = A2AMessage(
            sender_id=self.agent_id,
            receiver_id=target_id,
            message_type=MessageType.TASK_REQUEST,
            task_id=task_id,
            content={
                "description": description,
                **kwargs,
            },
        )

        await self.channel.send(request)

        # 等待响应（实际应用中应有超时机制）
        # 这里简化处理
        return {"task_id": task_id, "status": "submitted"}

    async def start(self):
        """启动 Agent"""
        print(f"🤖 {self.agent_id} ({self.role}) 已启动")
        await self.channel.start()
```

---

## 三、任务委派与协作

### 3.1 任务委派模式

```python
class TaskDelegationDemo:
    """
    A2A 任务委派示例

    **场景：** 一个研究任务需要多个 Agent 协作完成。
    Manager Agent 将任务分解并委派给 Specialist Agent。
    """

    async def run(self):
        # ========== 创建 Agent ==========
        manager = A2AAgent(
            agent_id="manager-1",
            role="项目经理",
            goal="协调团队完成研究任务",
            backstory="资深的 AI 项目经理",
        )

        researcher = A2AAgent(
            agent_id="researcher-1",
            role="研究员",
            goal="深入研究 AI Agent 技术",
            backstory="AI 领域专家",
        )

        data_analyst = A2AAgent(
            agent_id="analyst-1",
            role="数据分析师",
            goal="分析数据并提取洞察",
            backstory="数据科学专家",
        )

        writer = A2AAgent(
            agent_id="writer-1",
            role="技术写手",
            goal="撰写高质量的技术报告",
            backstory="专业科技写手",
        )

        # ========== 建立 A2A 连接 ==========
        manager.channel.connect(researcher.channel)
        manager.channel.connect(data_analyst.channel)
        manager.channel.connect(writer.channel)
        print("\n" + "=" * 50)
        print("A2A 团队已组建！")
        print("=" * 50 + "\n")

        # ========== 启动所有 Agent 的消息处理 ==========
        tasks = [
            asyncio.create_task(manager.start()),
            asyncio.create_task(researcher.start()),
            asyncio.create_task(data_analyst.start()),
            asyncio.create_task(writer.start()),
        ]

        # ========== Manager 委派任务 ==========
        print("\n📋 Manager 开始委派任务...\n")

        # 1. 委派研究任务
        await manager.request_task(
            "researcher-1",
            "研究 2024 年 Multi-Agent 系统的最新进展，"
            "包括主流框架（CrewAI、AutoGen、LangGraph）的对比",
        )

        await asyncio.sleep(1)

        # 2. 委派数据分析任务
        await manager.request_task(
            "analyst-1",
            "分析 AI Agent 框架的性能 benchmark 数据",
        )

        await asyncio.sleep(1)

        # 3. 给所有 Agent 广播同步消息
        sync_msg = A2AMessage(
            sender_id="manager-1",
            message_type=MessageType.SYNCHRONIZE,
            content={
                "action": "status_check",
                "message": "请汇报当前进度",
            },
        )
        await manager.channel.send(sync_msg)

        await asyncio.sleep(2)

        # 关闭
        for agent in [manager, researcher, data_analyst, writer]:
            agent.channel.stop()

        for t in tasks:
            t.cancel()


# 运行
asyncio.run(TaskDelegationDemo().run())
```

### 3.2 能力发现机制

Agent 需要知道其他 Agent 能做什么，才能正确委派任务：

```python
class CapabilityRegistry:
    """
    Agent 能力注册中心

    **生活类比：** 就像一家公司的员工目录——
    上面写着每个人的职位、技能和联系方式。
    """

    def __init__(self):
        self._capabilities: Dict[str, Dict[str, any]] = {}

    def register(
        self,
        agent_id: str,
        skills: List[str],
        description: str,
        endpoint: str = None,
    ):
        """注册 Agent 的能力"""
        self._capabilities[agent_id] = {
            "agent_id": agent_id,
            "skills": skills,
            "description": description,
            "endpoint": endpoint,
            "status": "online",
            "registered_at": datetime.now().isoformat(),
        }
        print(f"📝 已注册: {agent_id} ({', '.join(skills)})")

    def find_agent(self, required_skill: str) -> Optional[Dict]:
        """查找具备特定技能的 Agent"""
        suitable = []
        for agent_id, info in self._capabilities.items():
            if info["status"] != "online":
                continue
            if required_skill.lower() in [s.lower() for s in info["skills"]]:
                suitable.append(info)

        if not suitable:
            return None

        # 返回最匹配的（按技能匹配度排序）
        return max(suitable, key=lambda x: len(x["skills"]))

    def find_team(self, required_skills: List[str]) -> List[Dict]:
        """为一组技能需求找到最合适的 Agent 团队"""
        assigned = []
        remaining_skills = set(required_skills)

        while remaining_skills:
            best_agent = None
            best_match = set()

            for agent_id, info in self._capabilities.items():
                if info["status"] != "online":
                    continue
                if any(a["agent_id"] == agent_id for a in assigned):
                    continue

                agent_skills = set(s.lower() for s in info["skills"])
                match = remaining_skills & agent_skills
                if len(match) > len(best_match):
                    best_match = match
                    best_agent = info

            if best_agent is None:
                break

            assigned.append(best_agent)
            remaining_skills -= best_match

        return assigned


# 使用能力注册中心
registry = CapabilityRegistry()

registry.register(
    "researcher-1",
    skills=["研究", "文献综述", "技术分析"],
    description="AI 技术研究员",
)

registry.register(
    "analyst-1",
    skills=["数据分析", "数据可视化", "统计建模"],
    description="数据分析专家",
)

registry.register(
    "writer-1",
    skills=["写作", "编辑", "翻译"],
    description="技术写手",
)

# 查找
team = registry.find_team(["研究", "写作", "数据分析"])
print(f"推荐团队: {[a['agent_id'] for a in team]}")
```

---

## 四、A2A vs MCP 对比分析

### 4.1 它们解决不同的问题

```
MCP 的世界：
┌─────────┐   调用    ┌──────────┐
│ Agent   │ ────────► │ 工具     │
│         │           │ (API)    │
│ "帮我   │           │          │
│  查天气"│           │ 天气 API │
└─────────┘           └──────────┘

A2A 的世界：
┌─────────┐   对话    ┌─────────┐
│ Agent A │ ◄──────► │ Agent B │
│         │           │         │
│ "帮我研  │           │ "好的， │
│  究一下" │           │  我来做"│
└─────────┘           └─────────┘
```

### 4.2 实际应用中如何配合

```python
class HybridArchitecture:
    """
    混合架构：MCP + A2A 协同工作

    **架构说明：**
    - Agent 通过 MCP 调用工具（获取数据、执行操作）
    - Agent 之间通过 A2A 通信（委派任务、协调工作）
    - MCP Server 提供原子能力
    - A2A Agent 提供组合能力
    """

    def __init__(self):
        # MCP 工具列表
        self.mcp_tools = {
            "web_search": "搜索互联网",
            "file_read": "读取文件",
            "db_query": "查询数据库",
            "code_analyze": "分析代码",
        }

        # A2A Agent 列表
        self.a2a_agents = {
            "researcher": "调研分析专家",
            "writer": "内容创作专家",
            "analyst": "数据分析专家",
        }

    def decide_communication(self, task: str) -> str:
        """根据任务类型决定使用 MCP 还是 A2A"""
        # 需要实时数据的任务 → MCP
        mcp_keywords = ["搜索", "查询", "读取", "执行", "计算"]
        # 需要协作推理的任务 → A2A
        a2a_keywords = ["分析", "研究", "撰写", "讨论", "评估"]

        for kw in mcp_keywords:
            if kw in task:
                return "MCP"
        for kw in a2a_keywords:
            if kw in task:
                return "A2A"

        return "MCP"  # 默认走 MCP

    def explain_choice(self, task: str) -> str:
        """解释为什么选择某种通信方式"""
        choice = self.decide_communication(task)

        if choice == "MCP":
            return (
                f"任务「{task}」选择了 MCP 协议。\n"
                f"原因：这是一个需要执行具体操作的任务，"
                f"Agent 直接调用工具即可完成，不需要其他 Agent 协作。\n"
                f"就像一个人用工具修水管，不需要叫同事。"
            )
        else:
            return (
                f"任务「{task}」选择了 A2A 协议。\n"
                f"原因：这是一个需要多方协作的复杂任务，"
                f"需要多个 Agent 分工合作。\n"
                f"就像建一栋房子需要设计师、施工队、质检员协作。"
            )


# 演示
hybrid = HybridArchitecture()

tasks = [
    "搜索 2024 年 AI 论文",
    "分析 AI 行业发展趋势并撰写报告",
    "查询数据库中的用户数据",
    "讨论 AI 伦理问题并给出建议",
]

for task in tasks:
    print(f"\n📌 任务: {task}")
    print(hybrid.explain_choice(task))
```

---

## 五、网络通信实现

### 5.1 基于 HTTP 的 A2A

生产环境中，A2A 通常通过 HTTP/WebSocket 进行网络通信：

```python
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ========== A2A 的 HTTP API 定义 ==========
app = FastAPI(title="A2A Agent API")


class A2ARequest(BaseModel):
    """A2A HTTP 请求体"""
    sender_id: str
    message_type: str
    task_id: str = None
    content: dict = {}
    reply_to: str = None


class A2AResponse(BaseModel):
    """A2A HTTP 响应体"""
    status: str
    message: str = ""
    result: dict = {}


# ========== Agent 的 HTTP API 实现 ==========
@app.post("/a2a/message", response_model=A2AResponse)
async def receive_message(request: A2ARequest):
    """接收来自其他 Agent 的消息"""
    print(f"📩 收到 A2A 消息: [{request.message_type}] 来自 {request.sender_id}")

    # 根据消息类型处理
    if request.message_type == "task_request":
        # 接受任务
        return A2AResponse(
            status="accepted",
            message=f"任务 {request.task_id} 已被接受",
            result={
                "task_id": request.task_id,
                "estimated_completion": "5min",
            },
        )
    elif request.message_type == "info_request":
        # 返回信息
        return A2AResponse(
            status="success",
            result={
                "answer": f"关于「{request.content.get('query', '')}」的分析结果...",
            },
        )
    else:
        raise HTTPException(status_code=400, detail=f"不支持的消息类型: {request.message_type}")


@app.get("/a2a/capabilities")
async def get_capabilities():
    """返回 Agent 的能力声明"""
    return {
        "agent_id": "research-agent-1",
        "name": "AI 研究助手",
        "version": "1.0.0",
        "capabilities": [
            {
                "name": "文献搜索",
                "description": "搜索学术论文和技术文章",
                "input_type": "search_query",
                "output_type": "paper_list",
            },
            {
                "name": "技术分析",
                "description": "分析技术趋势和对比框架",
                "input_type": "topic",
                "output_type": "analysis_report",
            },
        ],
        "a2a_protocol_version": "1.0",
    }


# ========== 发送 A2A 消息的客户端 ==========
class A2AClient:
    """A2A HTTP 客户端"""

    def __init__(self, base_url: str, agent_id: str):
        self.base_url = base_url.rstrip("/")
        self.agent_id = agent_id
        self.client = httpx.AsyncClient()

    async def send_message(
        self,
        target_url: str,
        message_type: str,
        content: dict,
        task_id: str = None,
    ) -> dict:
        """发送 A2A 消息到其他 Agent"""
        request = A2ARequest(
            sender_id=self.agent_id,
            message_type=message_type,
            task_id=task_id,
            content=content,
        )

        try:
            response = await self.client.post(
                f"{target_url}/a2a/message",
                json=request.dict(),
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()
        except httpx.TimeoutException:
            return {"status": "error", "message": "请求超时"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def query_capabilities(self, target_url: str) -> dict:
        """查询其他 Agent 的能力"""
        try:
            response = await self.client.get(
                f"{target_url}/a2a/capabilities",
                timeout=10.0,
            )
            return response.json()
        except Exception as e:
            return {"error": str(e)}

    async def close(self):
        await self.client.aclose()
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：A2A 和 MCP 的核心区别一句话说清楚？**

> A：MCP 是 Agent「使用工具」的标准接口（人用螺丝刀），A2A 是 Agent「与 Agent 对话」的标准协议（人与人交流）。MCP 关注的是 Agent 如何调用外部能力，A2A 关注的是 Agent 之间如何协作。

**Q2：在实际系统中，A2A 和 MCP 可以共存吗？如何共存？**

> A：不仅可以共存，而且应该共存。典型的架构是：每个 Agent 通过 MCP 调用自己的工具（搜索、数据库、文件操作），然后 Agent 之间通过 A2A 通信来协调工作。就像一家公司的员工——每个人用自己的工具干活（MCP），但同事之间需要沟通协作（A2A）。两者解决的是不同层面的问题，互为补充。

**Q3：A2A 的能力发现机制为什么重要？**

> A：能力发现相当于 Agent 的「简历」或「名片」。当一个新的 Agent 加入系统时，其他 Agent 需要知道「它会什么、适合干什么工作」。没有能力发现，任务委派就是盲目的——你可能把一个编程任务委派给了只会写文章的 Agent。能力注册中心（Capability Registry）解决了这个问题，让 Agent 能够根据技能找到最合适的协作伙伴。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| A2A 消息中缺少 `messageId` 或 `senderId` 导致无法追踪 | 消息格式不符合 A2A 协议规范的最小要求 | 每条消息必须包含 `messageId`、`senderId`、`timestamp` 和 `content` 四个必填字段 |
| 任务委派时接收方 Agent 未正确处理拒绝响应 | 接收方拒绝任务后发起方没有备用计划 | 在任务委派中实现 fallback 逻辑：被拒后自动寻找其他具备相同能力的 Agent |
| 能力发现注册时能力描述过于笼统导致匹配失败 | 注册的技能关键词太宽泛（如「搜索」而非「学术论文搜索」） | 使用精确的技能名称和标签，并在描述中注明适用场景和限制条件 |
| A2A 通信中未处理网络超时导致整个系统挂起 | 同步等待远程 Agent 响应，网络延迟阻塞流程 | 使用异步通信模式，设置超时回调，超时后切换到备用 Agent 或继续使用已有结果 |

---

## 📝 本章小结

- ✅ **A2A 协议基础** — Agent-to-Agent 标准化通信、消息类型定义
- ✅ **消息传递实现** — A2AChannel、消息路由、异步处理
- ✅ **任务委派** — 任务请求/接受/拒绝/完成的全生命周期
- ✅ **能力发现** — Capability Registry、技能匹配、团队组建
- ✅ **A2A vs MCP** — 不同层面的协议，解决不同问题
- ✅ **网络通信** — 基于 HTTP 的 A2A 实现

## ➡️ 下一章预告

> [第6章：综合实战 — AI 内容生产团队](./06-capstone-content-team.md) — 构建研究员 + 写手 + 编辑的完整 AI 内容生产流水线。
