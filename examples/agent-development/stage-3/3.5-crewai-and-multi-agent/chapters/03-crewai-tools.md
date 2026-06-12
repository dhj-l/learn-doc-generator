# 第3章：CrewAI 自定义工具集成 — 扩展 Agent 能力

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **创建 CrewAI 自定义工具** — 使用 BaseTool 基类构建自己的工具
- **集成第三方 API** — 将外部服务封装为 CrewAI 可调用工具
- **理解工具的生命周期** — 初始化、缓存、错误处理
- **使用 CrewAI 内置工具包** — crewai-tools 提供的现成工具

## 📋 前置知识

> 建议先完成：
> - [第2章：CrewAI 基础](./02-crewai-basics.md) — 掌握 Agent、Task、Crew 三大组件

---

## 💡 核心概念

### 为什么需要自定义工具？

**生活类比：** 你有一个超级助理（CrewAI Agent），他本来只会「看书查资料」。现在你想让他学会「用计算器」、「打电话订餐」、「发邮件」。自定义工具就是给助理配的各种装备——给他计算器他就能算账，给他电话他就能订餐。

CrewAI 的 Agent 默认只有 LLM 的知识，**没有执行外部操作的能力**。工具（Tools）就是 Agent 与外部世界交互的桥梁。

### BaseTool 基类

```python
from crewai.tools import BaseTool
from typing import Type, Optional
from pydantic import BaseModel, Field

# 定义工具的输入参数（使用 Pydantic）
class WeatherInput(BaseModel):
    """查询天气的输入参数"""
    city: str = Field(description="城市名称，如 '北京'、'上海'")
    unit: str = Field(
        default="celsius",
        description="温度单位: celsius（摄氏）或 fahrenheit（华氏）",
    )

# 定义工具
class WeatherTool(BaseTool):
    name: str = "天气查询工具"
    description: str = "查询指定城市的当前天气信息"
    args_schema: Type[BaseModel] = WeatherInput

    def _run(self, city: str, unit: str = "celsius") -> str:
        """
        执行工具的核心逻辑。
        注意：_run 是同步方法，对于异步操作使用 _arun
        """
        # 模拟天气查询
        weather_data = {
            "北京": {"temp": 25, "condition": "晴", "humidity": "45%"},
            "上海": {"temp": 28, "condition": "多云", "humidity": "60%"},
            "广州": {"temp": 32, "condition": "阵雨", "humidity": "75%"},
        }

        city_data = weather_data.get(city)
        if not city_data:
            return f"错误：未找到城市 '{city}' 的天气数据。支持的城市：{', '.join(weather_data.keys())}"

        temp = city_data["temp"]
        if unit == "fahrenheit":
            temp = round(temp * 9/5 + 32)

        unit_symbol = "°F" if unit == "fahrenheit" else "°C"
        return (
            f"{city} 当前天气：\n"
            f"🌡️ 温度：{temp}{unit_symbol}\n"
            f"🌤️ 天气：{city_data['condition']}\n"
            f"💧 湿度：{city_data['humidity']}"
        )

# 使用工具
weather_tool = WeatherTool()
result = weather_tool._run(city="北京", unit="celsius")
print(result)
# 输出：
# 北京 当前天气：
# 🌡️ 温度：25°C
# 🌤️ 天气：晴
# 💧 湿度：45%
```

**💡 为什么使用 Pydantic 定义输入参数？** CrewAI 的 Agent 需要知道工具「需要什么参数」才能正确调用。Pydantic 的 `Field(description=...)` 会作为工具的 Schema 暴露给 LLM，LLM 根据描述决定传什么参数。没有清晰的参数描述，Agent 可能会传错数据。

### 更复杂的工具：带缓存的数据库查询

```python
import json
import time
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from typing import Optional, List

class DatabaseQueryInput(BaseModel):
    sql: str = Field(description="SQL 查询语句（只允许 SELECT）")
    max_rows: int = Field(default=20, description="最大返回行数")

class DatabaseQueryTool(BaseTool):
    name: str = "数据库查询工具"
    description: str = "对业务数据库执行 SQL SELECT 查询并返回结果"
    
    # 缓存配置
    cache_function: dict = {
        "cache_strategy": "adaptive",  # 自适应缓存
        "ttl": 60,                     # 60 秒缓存
    }

    def _run(self, sql: str, max_rows: int = 20) -> str:
        # 安全检查：只允许 SELECT
        if not sql.strip().upper().startswith("SELECT"):
            return "错误：只允许执行 SELECT 查询"

        # 检查缓存
        cache_key = f"query:{hash(sql)}"
        cached = self._get_cache(cache_key)
        if cached:
            return f"[缓存结果] {cached}"

        # 模拟查询执行
        time.sleep(1)  # 模拟延迟
        mock_result = [
            {"id": 1, "name": "Alice", "role": "admin"},
            {"id": 2, "name": "Bob", "role": "user"},
        ][:max_rows]

        result = json.dumps(mock_result, ensure_ascii=False, indent=2)
        self._set_cache(cache_key, result)
        return result

    def _get_cache(self, key: str) -> Optional[str]:
        """从缓存获取（简化实现）"""
        return None

    def _set_cache(self, key: str, value: str) -> None:
        """写入缓存（简化实现）"""
        pass
```

### 使用 Built-in 工具包

CrewAI 提供了 `crewai-tools` 包，包含大量现成的工具：

```python
from crewai_tools import (
    SerperDevTool,           # 搜索引擎
    ScrapeWebsiteTool,        # 网页抓取
    SeleniumScrapingTool,     # Selenium 网页抓取
    BrowserbaseTool,          # 浏览器自动化
    CodeDocsSearchTool,       # 代码文档搜索
    GithubSearchTool,         # GitHub 搜索
    YoutubeChannelSearchTool, # YouTube 频道搜索
)

# 一行代码即可创建工具
search_tool = SerperDevTool()
scraper_tool = ScrapeWebsiteTool()

# 给 Agent 配备多个工具
researcher = Agent(
    role='互联网研究员',
    goal='从互联网获取准确、及时的信息',
    backstory='你擅长使用搜索引擎和网页抓取工具获取信息。',
    tools=[search_tool, scraper_tool],  # 多个工具
    llm='claude-3-sonnet',
)
```

---

## 🔨 实战演练

### 练习：构建一个 GitHub 仓库分析工具

**场景描述：** 你的团队需要分析 GitHub 仓库的健康状况。构建一个 CrewAI 工具，可以获取仓库的 star 数、最近提交、Issue 统计等信息。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```python
import json
from crewai.tools import BaseTool
from crewai import Agent, Task, Crew
from pydantic import BaseModel, Field
from typing import Optional
import urllib.request
import urllib.error

class GitHubAnalyzerInput(BaseModel):
    owner: str = Field(description="GitHub 仓库所有者（用户名或组织名）")
    repo: str = Field(description="GitHub 仓库名称")

class GitHubAnalyzerTool(BaseTool):
    name: str = "GitHub 仓库分析工具"
    description: str = "分析 GitHub 仓库的健康状况：star 数、最近更新、Issue 统计"
    args_schema: Type[BaseModel] = GitHubAnalyzerInput

    def _run(self, owner: str, repo: str) -> str:
        try:
            # 调用 GitHub API
            url = f"https://api.github.com/repos/{owner}/{repo}"
            req = urllib.request.Request(url, headers={
                "User-Agent": "CrewAI-Analyzer",
                "Accept": "application/vnd.github.v3+json",
            })
            
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())

            # 提取关键指标
            analysis = {
                "仓库": f"{owner}/{repo}",
                "⭐ Stars": data.get("stargazers_count", 0),
                "🍴 Forks": data.get("forks_count", 0),
                "🐛 Open Issues": data.get("open_issues_count", 0),
                "📅 最后更新": data.get("updated_at", "未知"),
                "📝 描述": data.get("description", "无描述"),
                "🔤 主要语言": data.get("language", "未知"),
                "📋 License": data.get("license", {}).get("spdx_id", "未指定") if data.get("license") else "未指定",
            }

            # 健康评分
            health_score = 0
            if analysis["⭐ Stars"] > 1000: health_score += 20
            if analysis["🍴 Forks"] > 100: health_score += 20
            if analysis["🐛 Open Issues"] < 50: health_score += 20
            if analysis["📝 描述"] != "无描述": health_score += 20
            if analysis["📋 License"] != "未指定": health_score += 20

            analysis["💚 健康评分"] = f"{health_score}/100"

            return json.dumps(analysis, ensure_ascii=False, indent=2)

        except urllib.error.HTTPError as e:
            return f"GitHub API 错误 ({e.code})：{e.reason}。请检查仓库名称是否正确。"
        except urllib.error.URLError as e:
            return f"网络错误：无法连接到 GitHub API。请检查网络连接。"
        except Exception as e:
            return f"分析失败：{str(e)}"

# 集成到 Crew
analyzer_tool = GitHubAnalyzerTool()

agent = Agent(
    role='代码库分析师',
    goal='全面分析 GitHub 仓库',
    backstory='你是一位经验丰富的开源项目维护者',
    tools=[analyzer_tool],
)

task = Task(
    description='分析 GitHub 仓库 vercel/next.js 的健康状况',
    expected_output='一份包含 star 数、fork 数、issue 统计和健康评分的分析报告',
    agent=agent,
)

crew = Crew(
    agents=[agent],
    tasks=[task],
    verbose=True,
)

result = crew.kickoff()
print(result)
```

**预期输出：**
```
{
  "仓库": "vercel/next.js",
  "⭐ Stars": 130000,
  "🍴 Forks": 28000,
  "🐛 Open Issues": 1200,
  "📅 最后更新": "2026-06-11T10:00:00Z",
  "📝 描述": "The React Framework for Production",
  "🔤 主要语言": "TypeScript",
  "📋 License": "MIT",
  "💚 健康评分": "80/100"
}
```

</details>

---

## ⚡ 进阶技巧

### 异步工具（_arun）

对于 I/O 密集型的工具（网络请求、文件读写），使用异步方法更高效：

```python
import aiohttp
import asyncio

class AsyncWeatherTool(BaseTool):
    name: str = "异步天气查询"
    description: str = "异步查询天气信息"

    async def _arun(self, city: str) -> str:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"https://wttr.in/{city}?format=j1"
            ) as response:
                data = await response.json()
                return f"{city} 天气：{data['current_condition'][0]}"

# 使用 _arun
result = await weather_tool._arun(city="北京")
```

### 工具错误重试

```python
from tenacity import retry, stop_after_attempt, wait_exponential

class RobustTool(BaseTool):
    name: str = "稳定工具"
    description: str = "带自动重试的工具"

    @retry(
        stop=stop_after_attempt(3),     # 最多重试 3 次
        wait=wait_exponential(multiplier=1, min=2, max=10),  # 指数退避
    )
    def _run(self, url: str) -> str:
        # 如果失败会自动重试
        response = urllib.request.urlopen(url, timeout=5)
        return response.read().decode()
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：BaseTool 的 _run 和 _arun 有什么区别？**

> A：`_run` 是同步方法，适合 CPU 密集型或快速的操作。`_arun` 是异步方法，适合 I/O 密集型操作（网络请求、文件读写）。如果定义了 _arun，CrewAI 在异步环境中会优先使用 _arun。建议对耗时操作实现 _arun 以提高并发性能。

**Q2：为什么工具的描述（description）如此重要？**

> A：CrewAI 的 LLM Agent 通过 description 来判断「什么时候使用这个工具」。描述越清晰，Agent 就越能在正确的场景选择正确的工具。例如「天气查询工具」的描述中应该包含「仅用于查询当前天气，不用于历史天气查询」这样的约束。

**Q3：工具缓存（cache_function）有什么作用？**

> A：缓存可以避免重复执行相同的工具调用。对于价格昂贵的操作（如调用 GPT API）或耗时操作（如爬取网页），缓存能大幅提升效率和降低成本。CrewAI 支持设置 TTL（过期时间）和缓存策略。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Agent 不调用已注册的工具 | 工具描述不清晰，LLM 不理解用途 | 重写 description，加入「什么时候用」「返回什么」 |
| 工具返回的内容 Agent 无法理解 | 返回格式太复杂（如 JSON 嵌套过深） | 格式化输出，加中文说明字段 |
| _run 方法超时导致 Agent 卡死 | 工具内部没有超时控制 | 给所有网络请求设置 timeout 参数 |
| 多个工具同名参数混淆 | Agent 传错了参数类型 | 用 Pydantic Field 的 description 明确说明每个参数 |
| cache_function 导致返回过期数据 | TTL 设置过长 | 根据数据变化频率设置合理的 TTL |

---

## 📝 本章小结

- ✅ **BaseTool 基类** — 继承 BaseTool 并实现 _run 方法即可创建自定义工具
- ✅ **Pydantic 参数定义** — 用 Field(description=...) 让 LLM 知道怎么传参
- ✅ **内置工具包** — crewai-tools 提供搜索引擎、网页抓取、GitHub 等现成工具
- ✅ **异步支持** — 实现 _arun 方法支持异步工具调用
- ✅ **缓存与重试** — cache_function 控制缓存，tenacity 库实现自动重试

## ➡️ 下一章预告

> 在下一章中，我们将学习多 Agent 的编排模式——Pipeline、Debate、Voting、Hierarchical 四种模式的区别和适用场景，以及如何在 CrewAI 中配置。
> [第4章：多 Agent 编排模式](./04-orchestration-patterns.md)
