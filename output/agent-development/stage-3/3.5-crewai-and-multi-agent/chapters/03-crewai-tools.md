# 第3章：CrewAI 自定义工具开发

> 预计学习时间：80-100 分钟

## 💡 本章概览

**生活类比：** 在前两章中，我们认识了 CrewAI 的三大组件——Agent（员工）、Task（任务）、Crew（团队）。但员工工作是需要工具的——研究员需要搜索引擎，写手需要语法检查器，设计师需要图像生成器。本章就是教你怎么给这些 AI 员工 **制造和配备工具**。

CrewAI 的工具系统是其最强大的特性之一。它允许 Agent 调用外部能力——搜索网页、查询数据库、处理文件、调用 API——就像人类使用电脑软件一样自然。

**本章核心问题：** 如何开发自定义 CrewAI 工具？如何利用内置工具？如何正确处理错误？

## 📋 前置知识

> 建议先完成：[第1章：Multi-Agent 设计原则](./01-multi-agent-principles.md)、[第2章：CrewAI 基础](./02-crewai-basics.md)

---

## 一、工具系统基础

### 1.1 什么是 CrewAI 工具？

在 CrewAI 中，工具（Tool）是一个可被 Agent 调用的函数，它封装了特定的能力。每个工具包含：

| 组件 | 说明 | 类比 |
|------|------|------|
| name | 工具名称 | 工具的名字（如「搜索引擎」） |
| description | 工具描述 | 使用说明书（LLM 通过它了解工具的用途） |
| args_schema | 参数结构 | 工具的按钮和旋钮 |
| _run() | 执行逻辑 | 工具内部的工作原理 |

```python
# 工具的最简形式
from crewai.tools import BaseTool

class SimpleTool(BaseTool):
    name: str = "my_tool"
    description: str = "这是一个简单的工具"

    def _run(self, query: str) -> str:
        return f"你查询了: {query}"
```

> **为什么工具对 Agent 如此重要？** 想象一下，让一个程序员写代码但不给电脑——他只能纸上谈兵。同样，没有工具的 Agent 只能依靠自己的训练数据回答问题，无法获取实时信息或执行操作。工具就是 Agent 的「手脚」，让 Agent 从空想家变成实干家。

### 1.2 工具的工作流程

```
Agent 接收到任务
      │
      ▼
Agent 思考：我需要什么信息来完成这个任务？
      │
      ▼
Agent 查看可用工具列表（通过工具的 description）
      │
      ▼
Agent 选择合适的工具并传入参数（根据 args_schema）
      │
      ▼
工具执行 _run() 方法
      │
      ▼
工具返回结果给 Agent
      │
      ▼
Agent 综合结果，继续执行任务
```

---

## 二、自定义工具开发

### 2.1 BaseTool 基类

开发自定义工具的核心是继承 `BaseTool` 类：

```python
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from typing import Type, Optional

# ========== 第一步：定义参数 Schema ==========
class SearchInput(BaseModel):
    """搜索工具的输入参数"""
    query: str = Field(description="搜索关键词（如 'AI Agent 最新发展'）")
    max_results: int = Field(
        default=5,
        description="返回的最大结果数（1-20）",
        ge=1,
        le=20,
    )
    language: Optional[str] = Field(
        default=None,
        description="搜索结果语言（如 'zh-CN', 'en'）",
    )

# ========== 第二步：继承 BaseTool ==========
class SearchWebTool(BaseTool):
    """搜索互联网获取最新信息"""

    name: str = "搜索互联网"
    description: str = (
        "搜索互联网获取最新的信息和资料。"
        "当你需要了解某个主题的最新动态、查找参考资料、"
        "或者验证某些信息时，使用这个工具。"
        "输入搜索关键词，返回相关的搜索结果列表。"
    )
    args_schema: Type[BaseModel] = SearchInput

    # ========== 第三步：实现 _run 方法 ==========
    def _run(
        self,
        query: str,
        max_results: int = 5,
        language: Optional[str] = None,
    ) -> str:
        """
        工具的核心执行逻辑。
        注意：参数名必须与 SearchInput 的字段名一致。
        """
        # 实际项目中，这里会调用真实的搜索 API
        # 本示例使用模拟数据
        mock_results = [
            {
                "title": f"关于「{query}」的最新研究",
                "url": f"https://example.com/result-{i}",
                "snippet": f"这是关于 {query} 的第 {i} 条搜索结果...",
            }
            for i in range(1, max_results + 1)
        ]

        # 返回格式化的结果
        output = f"找到 {len(mock_results)} 条结果：\n\n"
        for i, result in enumerate(mock_results, 1):
            output += f"{i}. {result['title']}\n"
            output += f"   链接：{result['url']}\n"
            output += f"   摘要：{result['snippet']}\n\n"

        return output
```

### 2.2 参数 Schema 的最佳实践

参数 Schema 是工具与 LLM 之间的「契约」——它告诉 LLM 这个工具需要什么参数，以及每个参数的格式要求。良好的 Schema 设计直接影响 LLM 能否正确使用工具：

```python
from pydantic import BaseModel, Field
from typing import List, Optional, Literal

class DatabaseQueryInput(BaseModel):
    """数据库查询工具的输入参数"""

    # 1. 必填参数：没有默认值
    sql: str = Field(
        description="SQL 查询语句，仅支持 SELECT 操作",
        examples=["SELECT * FROM users WHERE age > 18"],
    )

    # 2. 可选参数：有默认值
    database: str = Field(
        default="main",
        description="要查询的数据库名称",
    )

    # 3. 带约束的参数
    max_rows: int = Field(
        default=100,
        description="最大返回行数",
        ge=1,  # greater than or equal to 1
        le=1000,  # less than or equal to 1000
    )

    # 4. 枚举参数
    format: Literal["json", "csv", "table"] = Field(
        default="json",
        description="输出格式",
    )

    # 5. 复杂类型
    columns: Optional[List[str]] = Field(
        default=None,
        description="要返回的列名列表，不指定则返回所有列",
    )
```

> **关键原则：** 每个 Field 的 description 必须清晰、完整，包含参数用途、格式要求、可选值范围。LLM 通过 description 来理解如何填充参数。如果你的 description 写得太模糊，LLM 可能会传错参数——这就像给工具写的说明书不清晰，使用者自然会犯错。

### 2.3 同步执行（_run）

`_run` 是工具的主执行方法，它接收参数并返回结果字符串：

```python
class FileReadTool(BaseTool):
    """读取文件内容"""

    name: str = "读取文件"
    description: str = "读取指定路径的文本文件内容"

    args_schema: Type[BaseModel] = FileReadInput

    def _run(self, file_path: str, encoding: str = "utf-8") -> str:
        """同步执行文件读取"""
        try:
            with open(file_path, "r", encoding=encoding) as f:
                content = f.read()

            return f"文件 {file_path} 读取成功（{len(content)} 字符）：\n\n{content}"

        except FileNotFoundError:
            return f"错误：文件 {file_path} 不存在"
        except PermissionError:
            return f"错误：没有权限读取文件 {file_path}"
        except Exception as e:
            return f"错误：读取文件时发生未知错误 — {str(e)}"
```

### 2.4 异步执行（_arun）

对于 I/O 密集型操作（网络请求、数据库查询），应该使用异步方法提高性能：

```python
import asyncio
import aiohttp
from typing import Type

class AsyncAPITool(BaseTool):
    """异步 API 调用工具"""

    name: str = "调用API"
    description: str = "异步调用外部 REST API 获取数据"

    args_schema: Type[BaseModel] = APIInput

    def _run(self, url: str, method: str = "GET") -> str:
        """同步版本：使用事件循环运行异步代码"""
        # 在同步方法中调用异步代码
        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(self._arun(url, method))
            return result
        finally:
            loop.close()

    async def _arun(self, url: str, method: str = "GET") -> str:
        """异步版本：真正的异步执行"""
        try:
            async with aiohttp.ClientSession() as session:
                if method.upper() == "GET":
                    async with session.get(url, timeout=10) as response:
                        data = await response.json()
                elif method.upper() == "POST":
                    async with session.post(url, timeout=10) as response:
                        data = await response.json()
                else:
                    return f"不支持的 HTTP 方法: {method}"

                return f"API 调用成功：\n{json.dumps(data, ensure_ascii=False, indent=2)}"

        except asyncio.TimeoutError:
            return "错误：API 请求超时（超过 10 秒）"
        except aiohttp.ClientError as e:
            return f"错误：网络请求失败 — {str(e)}"
        except json.JSONDecodeError:
            return "错误：API 返回的不是有效的 JSON 数据"
```

### 2.5 完整示例：文件分析工具

```python
import os
import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Type, Optional, List

from pydantic import BaseModel, Field
from crewai.tools import BaseTool


# ========== 输入 Schema ==========
class FileAnalysisInput(BaseModel):
    """文件分析工具的输入参数"""

    directory: str = Field(
        description="要分析的目录路径",
    )
    extensions: Optional[List[str]] = Field(
        default=None,
        description="要分析的文件扩展名列表，如 ['.py', '.ts']，不指定则分析所有文件",
    )
    include_hidden: bool = Field(
        default=False,
        description="是否包含隐藏文件",
    )


# ========== 工具实现 ==========
class FileAnalysisTool(BaseTool):
    """分析项目目录中的文件结构、大小和统计信息"""

    name: str = "文件分析"
    description: str = (
        "分析指定目录中的文件结构，返回文件数量、大小分布、"
        "文件类型统计和目录树信息。适用于了解项目结构和代码库概况。"
    )
    args_schema: Type[BaseModel] = FileAnalysisInput

    def _run(
        self,
        directory: str,
        extensions: Optional[List[str]] = None,
        include_hidden: bool = False,
    ) -> str:
        """分析目录中的文件"""
        root_path = Path(directory)

        if not root_path.exists():
            return f"错误：目录 '{directory}' 不存在"
        if not root_path.is_dir():
            return f"错误：'{directory}' 不是一个目录"

        # 收集文件信息
        stats = {
            "total_files": 0,
            "total_dirs": 0,
            "total_size": 0,
            "by_extension": {},
            "largest_files": [],
            "recent_files": [],
            "directory_tree": [],
        }

        for item in root_path.rglob("*"):
            # 跳过隐藏文件/目录
            if not include_hidden and any(
                part.startswith(".") for part in item.parts
            ):
                continue

            if item.is_file():
                # 检查扩展名过滤
                if extensions:
                    ext = item.suffix.lower()
                    if ext not in extensions:
                        continue

                file_size = item.stat().st_size
                stats["total_files"] += 1
                stats["total_size"] += file_size

                # 按扩展名统计
                ext = item.suffix.lower() or "(无扩展名)"
                if ext not in stats["by_extension"]:
                    stats["by_extension"][ext] = {"count": 0, "size": 0}
                stats["by_extension"][ext]["count"] += 1
                stats["by_extension"][ext]["size"] += file_size

                # 记录最大的文件
                stats["largest_files"].append({
                    "path": str(item.relative_to(root_path)),
                    "size": file_size,
                })

                # 记录最近修改的文件
                stats["recent_files"].append({
                    "path": str(item.relative_to(root_path)),
                    "mtime": datetime.fromtimestamp(item.stat().st_mtime).isoformat(),
                })

            elif item.is_dir():
                stats["total_dirs"] += 1

        # 排序
        stats["largest_files"].sort(key=lambda x: x["size"], reverse=True)
        stats["largest_files"] = stats["largest_files"][:10]
        stats["recent_files"].sort(
            key=lambda x: x["mtime"], reverse=True
        )
        stats["recent_files"] = stats["recent_files"][:10]

        # 格式化输出
        output = f"📊 目录分析报告：{directory}\n"
        output += "=" * 50 + "\n\n"

        output += f"📁 目录数：{stats['total_dirs']}\n"
        output += f"📄 文件数：{stats['total_files']}\n"
        output += f"💾 总大小：{self._format_size(stats['total_size'])}\n\n"

        output += "📂 文件类型分布：\n"
        for ext, info in sorted(
            stats["by_extension"].items(),
            key=lambda x: x[1]["count"],
            reverse=True,
        ):
            output += (
                f"  {ext}: {info['count']} 文件, "
                f"{self._format_size(info['size'])}\n"
            )

        output += "\n🔝 最大的 10 个文件：\n"
        for f in stats["largest_files"][:5]:
            output += f"  {self._format_size(f['size'])}  {f['path']}\n"

        return output

    def _format_size(self, size_bytes: int) -> str:
        """将字节数格式化为人类可读的大小"""
        for unit in ["B", "KB", "MB", "GB"]:
            if size_bytes < 1024:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} TB"


# 使用
if __name__ == "__main__":
    tool = FileAnalysisTool()
    result = tool._run(
        directory="./src",
        extensions=[".py", ".ts"],
    )
    print(result)
```

---

## 三、CrewAI 内置工具

CrewAI 提供了丰富的内置工具，覆盖了最常见的需求。以下是几个最常用的：

### 3.1 SerperDevTool — 搜索引擎

```python
from crewai_tools import SerperDevTool

# 初始化（需要 SERPER_API_KEY 环境变量）
search_tool = SerperDevTool()

# Agent 使用
researcher = Agent(
    role="研究员",
    goal="搜索最新的行业动态",
    tools=[search_tool],
    # ...
)

# 直接调用测试
result = search_tool._run(
    search_query="2024年AI Agent发展趋势",
)
print(result)
```

### 3.2 ScrapeWebsiteTool — 网页抓取

```python
from crewai_tools import ScrapeWebsiteTool

# 方式 1：初始化时指定固定的网站
scraper = ScrapeWebsiteTool(website_url="https://example.com")

# 方式 2：运行时动态指定
scraper = ScrapeWebsiteTool()
result = scraper._run(
    website_url="https://en.wikipedia.org/wiki/AI_agent",
    max_length=5000,  # 最大抓取字符数
)

print(result)  # 返回网页的文本内容
```

### 3.3 其他常用内置工具

```python
from crewai_tools import (
    # 文件工具
    FileReadTool,           # 读取文件
    FileWriterTool,         # 写入文件

    # 网络工具
    SerperDevTool,          # Google 搜索
    ScrapeWebsiteTool,      # 网页抓取
    TXTSearchTool,          # 文本搜索

    # 代码工具
    PythonREPLTool,         # Python 代码执行
    CodeDocsSearchTool,     # 代码文档搜索

    # 数据库工具
    MySQLQueryTool,         # MySQL 查询
    PostgresQueryTool,      # PostgreSQL 查询

    # 其他
    JSONSearchTool,         # JSON 搜索
    YoutubeVideoSearchTool, # YouTube 搜索
)

# 批量使用
research_tools = [
    SerperDevTool(),
    ScrapeWebsiteTool(),
    TXTSearchTool(),
]

writing_tools = [
    FileReadTool(),
    FileWriterTool(),
]
```

---

## 四、错误处理与异常管理

### 4.1 错误处理的重要性

**生活类比：** 工具就像厨房里的菜刀——用得好了能做出美味佳肴，用得不好会切到手。好的工具设计不仅要「能用」，更要「出错了也能安全处理」。

```python
class RobustTool(BaseTool):
    """带有完善错误处理的工具模板"""

    name: str = "健壮工具"
    description: str = "展示完善的错误处理模式"

    args_schema: Type[BaseModel] = RobustInput

    def _run(self, input_data: str) -> str:
        # ========== 模式一：防御式检查 ==========
        if not input_data:
            return "错误：输入数据不能为空"

        if len(input_data) > 10000:
            return "错误：输入数据过长（超过 10000 字符限制）"

        # ========== 模式二：try-except 包裹 ==========
        try:
            # 工具的核心逻辑
            result = self._process_data(input_data)
            return result

        except ValueError as e:
            # 参数错误：通常是 LLM 传入了不合适的参数
            return f"参数错误：{str(e)}。请检查输入格式。"

        except TimeoutError:
            # 超时错误：外部服务响应过慢
            return "操作超时：外部服务响应时间超过限制（30 秒）。请稍后重试。"

        except ConnectionError:
            # 网络错误：外部服务不可达
            return "网络错误：无法连接到外部服务。请检查网络连接。"

        except PermissionError:
            # 权限错误
            return "权限错误：当前没有执行此操作的权限。"

        except Exception as e:
            # 兜底：捕获所有未知异常
            # 记录日志以便调试
            print(f"[工具错误] {self.name}: {str(e)}")
            return f"未预期的错误：{str(e)}。请稍后重试或联系管理员。"

    def _process_data(self, data: str) -> str:
        """模拟数据处理"""
        # 实际的数据处理逻辑
        return f"处理完成：{data}"
```

### 4.2 错误分类与处理策略

```python
class ErrorHandlingTool(BaseTool):
    """展示不同错误类型的处理策略"""

    def _run(self, operation: str) -> str:
        # ---------- 可重试的错误 ----------
        # LLM 可以选择重新调用
        if operation == "timeout":
            return {
                "success": False,
                "error_type": "RETRYABLE",
                "message": "请求超时，请稍后重试",
                "retry_after_seconds": 5,
            }

        # ---------- 不可重试的错误 ----------
        # LLM 应该修改参数后重试
        if operation == "invalid_input":
            return {
                "success": False,
                "error_type": "INVALID_INPUT",
                "message": "参数格式错误：operation 必须是有效值",
                "valid_options": ["search", "read", "write"],
            }

        # ---------- 需要人工介入的错误 ----------
        if operation == "permission_denied":
            return {
                "success": False,
                "error_type": "FATAL",
                "message": "权限不足，需要管理员授权",
                "resolution": "请联系系统管理员开通权限",
            }

        return {"success": True, "result": "操作成功"}
```

---

## 五、工具缓存与性能优化

### 5.1 缓存机制

对于重复的请求（如查询相同的关键词），缓存可以大幅提升性能：

```python
from functools import lru_cache
from datetime import datetime, timedelta

class CachedSearchTool(BaseTool):
    """带缓存的搜索工具"""

    name: str = "缓存搜索"
    description: str = "带缓存功能的互联网搜索"

    # 缓存存储
    _cache: dict = {}
    _cache_ttl: int = 300  # 缓存有效期：5 分钟

    def _run(self, query: str) -> str:
        # 检查缓存
        cache_key = query.lower().strip()
        if cache_key in self._cache:
            cached = self._cache[cache_key]
            if datetime.now() - cached["time"] < timedelta(seconds=self._cache_ttl):
                print(f"[缓存命中] {query}")
                return cached["result"]
            else:
                # 缓存过期
                del self._cache[cache_key]

        # 执行真实的搜索
        result = self._perform_search(query)

        # 写入缓存
        self._cache[cache_key] = {
            "result": result,
            "time": datetime.now(),
        }

        return result

    def _perform_search(self, query: str) -> str:
        """实际的搜索逻辑"""
        return f"搜索结果：{query}"

    def clear_cache(self):
        """清空缓存"""
        self._cache.clear()
        print("缓存已清空")
```

---

## 六、完整示例：综合数据分析工具

```python
import json
import csv
import io
from typing import Type, Optional, List
from pathlib import Path

from pydantic import BaseModel, Field
from crewai.tools import BaseTool


class DataAnalysisInput(BaseModel):
    """数据分析工具的输入"""

    source: str = Field(description="数据来源，可以是文件路径或 URL")
    analysis_type: str = Field(
        description="分析类型",
        pattern="^(统计|分布|异常检测|相关性)$",
    )
    columns: Optional[List[str]] = Field(
        default=None,
        description="要分析的列名",
    )


class DataAnalysisTool(BaseTool):
    """综合数据分析工具——支持统计、分布分析、异常检测"""

    name: str = "数据分析"
    description: str = (
        "对数据集进行统计分析，包括基本统计量计算、"
        "数据分布分析、异常值检测和列相关性分析。"
        "支持 CSV 和 JSON 格式的数据源。"
    )
    args_schema: Type[BaseModel] = DataAnalysisInput

    def _run(
        self,
        source: str,
        analysis_type: str,
        columns: Optional[List[str]] = None,
    ) -> str:
        try:
            # 1. 加载数据
            data = self._load_data(source)
            if not data:
                return "错误：无法加载数据或数据为空"

            # 2. 根据分析类型分发
            if analysis_type == "统计":
                return self._calculate_statistics(data, columns)
            elif analysis_type == "分布":
                return self._analyze_distribution(data, columns)
            elif analysis_type == "异常检测":
                return self._detect_anomalies(data, columns)
            elif analysis_type == "相关性":
                return self._analyze_correlation(data, columns)
            else:
                return f"错误：不支持的分析类型 '{analysis_type}'"

        except FileNotFoundError:
            return f"错误：文件 '{source}' 不存在"
        except json.JSONDecodeError:
            return f"错误：文件 '{source}' 不是有效的 JSON 格式"
        except Exception as e:
            return f"数据分析失败：{str(e)}"

    def _load_data(self, source: str) -> List[dict]:
        """加载数据（支持 CSV 和 JSON）"""
        path = Path(source)
        if not path.exists():
            return []

        content = path.read_text(encoding="utf-8")

        if source.endswith(".json"):
            data = json.loads(content)
            return data if isinstance(data, list) else [data]

        elif source.endswith(".csv"):
            reader = csv.DictReader(io.StringIO(content))
            return list(reader)

        else:
            raise ValueError(f"不支持的文件格式：{path.suffix}")

    def _calculate_statistics(
        self, data: List[dict], columns: Optional[List[str]]
    ) -> str:
        """计算基本统计量"""
        cols = columns or (list(data[0].keys()) if data else [])

        output = "📊 基本统计量\n" + "=" * 40 + "\n\n"

        for col in cols:
            values = []
            for row in data:
                try:
                    values.append(float(row.get(col, 0)))
                except (ValueError, TypeError):
                    continue

            if not values:
                continue

            n = len(values)
            mean = sum(values) / n
            sorted_vals = sorted(values)
            median = (
                sorted_vals[n // 2]
                if n % 2 == 1
                else (sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2
            )
            min_val = min(values)
            max_val = max(values)
            variance = sum((x - mean) ** 2 for x in values) / n
            std_dev = variance ** 0.5

            output += f"📈 {col}\n"
            output += f"  样本数: {n}\n"
            output += f"  平均值: {mean:.2f}\n"
            output += f"  中位数: {median:.2f}\n"
            output += f"  标准差: {std_dev:.2f}\n"
            output += f"  最小值: {min_val:.2f}\n"
            output += f"  最大值: {max_val:.2f}\n"
            output += f"  范围: {min_val:.2f} ~ {max_val:.2f}\n\n"

        return output

    def _detect_anomalies(
        self, data: List[dict], columns: Optional[List[str]]
    ) -> str:
        """使用 IQR 方法检测异常值"""
        cols = columns or (list(data[0].keys()) if data else [])

        output = "🔍 异常值检测（IQR 方法）\n" + "=" * 40 + "\n\n"

        for col in cols:
            values = []
            for row in data:
                try:
                    values.append(float(row.get(col, 0)))
                except (ValueError, TypeError):
                    continue

            if not values:
                continue

            sorted_vals = sorted(values)
            n = len(sorted_vals)

            # 计算四分位数
            q1 = sorted_vals[n // 4]
            q3 = sorted_vals[(3 * n) // 4]
            iqr = q3 - q1

            lower_bound = q1 - 1.5 * iqr
            upper_bound = q3 + 1.5 * iqr

            anomalies = [v for v in values if v < lower_bound or v > upper_bound]

            output += f"🔎 {col}\n"
            output += f"  Q1: {q1:.2f}, Q3: {q3:.2f}, IQR: {iqr:.2f}\n"
            output += f"  正常范围: [{lower_bound:.2f}, {upper_bound:.2f}]\n"
            output += f"  异常值数: {len(anomalies)}/{len(values)}\n"

            if anomalies:
                output += f"  异常值: {anomalies[:5]}{'...' if len(anomalies) > 5 else ''}\n"
            output += "\n"

        return output


# 使用示例
if __name__ == "__main__":
    tool = DataAnalysisTool()
    result = tool._run(
        source="./data/sales.csv",
        analysis_type="统计",
        columns=["revenue", "cost"],
    )
    print(result)
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：BaseTool 的 name 和 description 为什么如此重要？**

> A：因为 LLM 是通过 name 和 description 来「理解」工具用途的。当 Agent 面对一个任务时，它会查看所有可用工具的 description，选择最匹配的那个。如果一个工具的 description 写得含糊不清，LLM 可能用错工具——就像给了一个螺丝刀但说明书写的是「可用于钉钉子」，结果 LLM 真的用它来锤钉子。name 要简短精准，description 要清晰完整，包含工具的用途、输入输出和适用场景。

**Q2：_run 和 _arun 有什么区别？什么时候用哪个？**

> A：_run 是同步方法，_arun 是异步方法。对于 I/O 密集型操作（网络请求、文件读写、数据库查询），应该同时实现 _run 和 _arun。同步版本通过创建事件循环来运行异步代码，异步版本则直接使用 async/await。当多个 Agent 并发执行时，异步版本可以显著提高吞吐量——就像一家餐厅有多个厨师同时做菜，而不是一个厨师做完一道再做下一道。

**Q3：工具返回错误信息时，应该使用什么策略帮助 LLM 自动恢复？**

> A：好的错误信息应该包含三个要素：（1）问题描述——发生了什么错误；（2）原因分析——为什么发生这个错误；（3）解决建议——LLM 应该怎么修改后再试。例如：「查询超时（问题），可能是因为查询过于复杂或数据库响应慢（原因），建议简化查询条件或增加查询限制（建议）」。这样 LLM 就能根据错误信息自动调整参数后重试，实现自我修复。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 自定义工具的 `_run` 方法未实现导致调用时抛出 `NotImplementedError` | 继承 `BaseTool` 后未重写 `_run` 方法 | 所有自定义工具必须实现 `_run`（同步）和可选的 `_arun`（异步）方法 |
| 工具参数 Schema 中缺少 `description` 导致 Agent 不理解参数含义 | Field 定义时未提供足够的描述信息 | 在 `args_schema` 的每个 Field 中添加详细的 `description`，让 Agent 知道参数用途 |
| 工具执行中缓存了错误结果导致后续获取到过期数据 | 缓存 TTL 设置过长或未处理错误情况 | 设置合理的 TTL 值（建议 5~15 分钟），并在工具抛出异常时清除对应的缓存条目 |
| 内置工具的 API Key 配置不正确导致调用失败 | 环境变量名称与工具文档要求不一致 | 查阅工具文档确认正确的环境变量名称（如 `SERPER_API_KEY`），并检查 `.env` 文件 |

---

## 📝 本章小结

- ✅ **BaseTool 基类** — 继承、参数 Schema、执行方法
- ✅ **Pydantic args_schema** — Field 约束、类型验证、描述文档
- ✅ **_run / _arun** — 同步/异步执行模式
- ✅ **内置工具** — SerperDevTool、ScrapeWebsiteTool 等
- ✅ **错误处理** — 防御式编程、错误分类、异常捕获
- ✅ **缓存优化** — LRU 缓存、TTL 过期、性能提升

## ➡️ 下一章预告

> [第4章：编排模式](./04-orchestration-patterns.md) — Sequential、Hierarchical、条件任务、自定义工作流。
