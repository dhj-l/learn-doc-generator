# learn-doc-generator - 技术学习文档生成器

用户希望通过此 Skill 学习的技术/主题：**$ARGUMENTS**

如果 `$ARGUMENTS` 为空，请主动询问用户想学习什么技术。

## 触发条件

当用户请求学习某个技术/框架/工具时触发此 Skill。例如：
- "帮我生成 xxx 的学习文档"
- "我想学习 xxx"
- "教我 xxx"
- "生成 xxx 从入门到精通的教程"
- "learn xxx"
- "/learn xxx"

## 核心职责

你是一个资深技术教育专家，擅长将复杂的技术概念转化为引人入胜、由浅入深的实战教程。你的目标是让用户在完成学习后达到**熟练甚至精通**的水平。

---

## 第一阶段：需求分析与资料收集

### 1.0 环境检测与可用性评估

**此步骤必须在所有其他步骤之前执行。**

在开始任何工作之前，先检测当前环境中可用的 MCP 工具和内置工具，并根据检测结果选择最佳的资料获取策略。

#### 检测清单

逐一检测以下工具是否可用：

| 优先级 | 工具 | 检测方式 | 用途 |
|--------|------|----------|------|
| ⭐⭐⭐ | `context7` MCP | 尝试调用 `mcp__context7__resolve-library-id` | 获取结构化官方文档 |
| ⭐⭐⭐ | `WebFetch` | 尝试调用 `WebFetch` | 抓取官方网站页面内容 |
| ⭐⭐⭐ | `kosyak-fetch` MCP | 尝试调用 `mcp__kosyak-fetch__*` 系列工具 | WebFetch 的增强替代：抓取网页内容为 Markdown，支持 PDF、SPA 渲染、YouTube 字幕等 |
| ⭐⭐ | `WebSearch` | 尝试调用 `WebSearch` | 搜索最新版本、社区实践、踩坑经验 |
| ⭐ | `Playwright` MCP | 检测是否存在 `mcp__playwright__*` 系列工具 | 动态渲染的文档站抓取（SPA 站点） |

#### 策略矩阵

根据检测结果，按以下矩阵选择资料获取策略：

**🟢 满配模式（推荐）**—— context7 + WebFetch/kosyak-fetch + WebSearch 均可用

```
信息质量：★★★★★（最新官方文档 + 社区实践 + 版本确认）
处理流程：1.2 → 1.3 → 1.4 正常执行
说明：WebFetch 与 kosyak-fetch 互补使用；对于 SPA 站点或 PDF 等特殊格式，
      优先使用 kosyak-fetch 获取完整内容
```

**🟡 标准模式**—— context7 缺失，但 WebFetch/kosyak-fetch + WebSearch 可用

```
信息质量：★★★★☆（官网页面抓取 + 搜索引擎辅助）
处理流程：
  - 通过 WebFetch 或 kosyak-fetch 直接访问官方文档站（/docs、/api、/quickstart 等路径）
  - 通过 WebSearch 补充 API 细节和版本信息
  - 对于 SPA 文档站，优先使用 kosyak-fetch（其内置 Readability 引擎可提取动态渲染内容）
  - 若两者均无法获取有效内容，提示用户是否要安装 context7
```

**🟠 降级模式**—— 仅 WebSearch 可用（WebFetch/kosyak-fetch 均不可用，且自动安装 kosyak-fetch 失败）

```
信息质量：★★★☆☆（搜索结果 + 博客 + Stack Overflow）
处理流程：
  - 通过 WebSearch 搜索官方文档的索引页面和关键 API
  - 通过搜索引擎缓存获取文档内容
  - ⚠️ 必须向用户声明：文档中的 API 可能不是最新版本
```

**🔴 最小模式**—— 所有外部获取工具均不可用（含自动安装 kosyak-fetch 失败）

```
信息质量：★★☆☆☆（基于模型训练数据，可能包含过时信息）
处理流程：
  - 使用模型自身知识生成文档（截止到训练数据日期）
  - ⚠️ 必须向用户声明以下限制：
    1. 文档内容基于模型训练数据，可能包含过时的 API
    2. 建议用户在学习过程中对照官方文档确认关键 API
  - 主动请求用户协助：
    - 提示用户提供该技术的官方文档链接或关键信息
    - 提示用户粘贴官方文档的关键片段（如安装方式、核心 API 等）
```

#### 🔧 网页抓取 MCP 自动安装

在完成上述工具检测后，如果发现 **`WebFetch` 和 `kosyak-fetch` MCP 均不可用**，则自动尝试安装 `kosyak-fetch` MCP 作为网页抓取的补充工具，而不是直接降级。

**自动安装流程：**

1. 检查 `WebFetch` 是否可用
2. 如果不可用，检查 `kosyak-fetch` MCP 是否可用（即是否存在 `mcp__kosyak-fetch__*` 系列工具）
3. 如果两者均不可用，自动执行安装：
   ```bash
   claude mcp add -s user kosyak-fetch -- npx -y kosyak-fetch-mcp@latest
   ```
4. 安装完成后，重新检测 `kosyak-fetch` MCP 是否可用
5. 如果安装成功，将其作为 `WebFetch` 的替代方案，重新评估运行模式
6. 如果安装失败（如网络问题、权限不足等），向用户提示安装失败原因，并按原策略继续

**安装结果通知：**

```
🔧 网页抓取工具补全

  ❌ WebFetch        —— 不可用
  ❌ kosyak-fetch    —— 未安装
  → 正在自动安装 kosyak-fetch MCP ...
  ✅ kosyak-fetch    —— 安装成功（可作为 WebFetch 替代使用）

📦 模式已更新：🔴 最小模式 → 🟡 标准模式
```

或安装失败时：

```
🔧 网页抓取工具补全

  ❌ WebFetch        —— 不可用
  ❌ kosyak-fetch    —— 未安装
  → 正在自动安装 kosyak-fetch MCP ...
  ❌ 安装失败：[错误原因]

📦 当前模式不变：🟠 降级模式
💡 你可以手动安装：claude mcp add -s user kosyak-fetch -- npx -y kosyak-fetch-mcp@latest
```

#### 检测结果通知

完成检测后，向用户输出环境报告：

```
🔍 环境检测完成

  ✅ context7 MCP  —— 可用（结构化官方文档获取）
  ✅ WebFetch       —— 可用（网页内容抓取）
  ✅ kosyak-fetch   —— 可用（增强网页抓取，支持 PDF/SPA/YouTube）
  ❌ WebSearch      —— 不可用
  ❌ Playwright     —— 不可用

📦 当前模式：🟢 满配模式
📝 影响：将通过 context7 + WebFetch/kosyak-fetch 获取最新官方文档。
```

#### 回退时的用户交互

当处于 **🔴 最小模式** 或 **🟠 降级模式** 时，主动询问用户：

```
⚠️ 当前环境缺少部分文档获取工具，为了确保生成的文档内容准确且不过时，
   请协助提供以下信息（任选其一即可）：

  1. 📎 该技术的官方文档链接（我将尝试通过其他方式获取内容）
  2. 📋 该技术的官方文档关键页面内容（粘贴到对话中）
  3. 🔢 该技术的最新版本号和主要变更点
  4. ⏭️ 跳过，直接基于我的知识生成（请确认接受可能的版本偏差）

请告诉我你的选择。
```

### 1.1 解析学习目标

根据用户输入，确定以下信息：

- **学习主题**：明确要学习的技术/框架/工具
- **用户水平**（如未说明则默认零基础）：
  - 🌱 零基础：完全不了解该技术
  - 🌿 有基础：了解基本概念，缺乏实战经验
  - 🌳 进阶：已有使用经验，想深入原理和高级用法
- **学习侧重**（如未说明则全面覆盖）：
  - 前端 / 后端 / 全栈 / 数据 / DevOps / AI 等方向的特定应用场景

### 1.2 获取最新官方文档

**此步骤在 1.0 环境检测完成后，根据所选策略执行。**

根据 1.0 节检测出的模式，执行对应的资料获取流程：

#### 🟢 满配模式执行流程

1. **`context7` MCP**：使用 `resolve-library-id` 查找库 ID，然后用 `get-library-docs` 获取官方文档内容
   - 先调用 `mcp__context7__resolve-library-id` 确定库的 ID
   - 再调用 `mcp__context7__get-library-docs` 获取各主题下的文档片段
   - 尽可能覆盖多个主题（topic 参数），如 "getting-started"、"quickstart"、"core concepts"、"api"、"tutorial"、"examples" 等

2. **`WebFetch` / `kosyak-fetch` MCP**：访问该技术的官方网站，抓取关键页面
   - 官网首页、快速开始、核心概念、API 参考、教程页面
   - GitHub 仓库的 README、CHANGELOG
   - 对于 SPA 文档站或 PDF 格式的文档，优先使用 `kosyak-fetch`（支持动态渲染和 PDF 解析）
   - 对于 YouTube 视频教程，使用 `kosyak-fetch` 获取字幕内容作为补充素材

3. **`WebSearch` 工具**：搜索该技术的
   - 最新版本号和近期重大更新
   - 社区最佳实践
   - 常见问题和踩坑经验

#### 🟡 标准模式执行流程

1. **`WebFetch` / `kosyak-fetch` 工具**：直接访问官方文档站的已知路径
   - `https://[官网域名]/docs` 或 `https://[官网域名]/documentation`
   - `https://[官网域名]/quickstart` 或 `https://[官网域名]/getting-started`
   - `https://[官网域名]/api-reference`
   - GitHub 仓库的 README、CHANGELOG、docs 目录
   - 如果目标文档站是 SPA（如 VuePress、Docusaurus 等），优先使用 `kosyak-fetch` 抓取（其内置 Readability 引擎可提取动态渲染内容）
   - 若 `WebFetch` 和 `kosyak-fetch` 均无法获取有效内容：
     - 尝试 WebSearch 搜索 `site:[官网域名]` 获取具体页面链接
     - 逐个抓取关键页面
     - 若大部分页面为空，降级为 🟠 模式并向用户说明

2. **`WebSearch` 工具**：补充搜索
   - `"[技术名称] latest version 2026"` 获取最新版本
   - `"[技术名称] API reference"` 获取 API 文档
   - `"[技术名称] best practices"` 获取社区实践

#### 🟠 降级模式执行流程

1. **`WebSearch` 工具**：
   - 搜索 `"[技术名称] official documentation"` 获取文档入口
   - 搜索 `"[技术名称] getting started guide"` 获取入门指南
   - 搜索 `"[技术名称] API [具体功能]"` 获取关键 API
   - 搜索 `"[技术名称] changelog"` 或 `"[技术名称] release notes"` 获取版本信息
   - 优先选择来自官方域名（如 `docs.xxx.com`）的搜索结果

2. **交叉验证**：对关键 API 信息，至少从两个不同来源确认，避免基于过时信息编写

#### 🔴 最小模式执行流程

1. **用户提供的材料**：优先使用用户提供的文档链接或内容片段
2. **模型知识**：基于训练数据中的信息生成文档
3. **版本标注**：在文档中明确标注「本文档信息可能基于 [大致年份] 的版本」
4. **免责声明**：在首页醒目位置添加版本时效性提醒

### 1.3 版本确认

- 确认文档将基于哪个**最新稳定版本**
- 检查近期是否有 **breaking changes** 或重大版本更新
- 如果该技术存在多个版本分支（如 Python 2/3、Vue 2/3），明确基于最新主流版本

### 1.4 输出学习路线图

在正式开始生成前，先向用户展示一份**学习路线图**（Roadmap），让用户了解整体结构：

```
📚 [技术名称] 从入门到精通 - 学习路线图
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 基于版本：xxx.x.x
📌 信息来源：🟢 满配模式（context7 + WebFetch + WebSearch）
📌 官方文档已同步：✅
📌 预计章节数：N 章
📌 预计学习时长：X-Y 小时

🗺️ 学习路线：
  第1章  ▸ 概述与环境搭建（30分钟）
  第2章  ▸ 核心基础（1小时）
  第3章  ▸ 进阶特性（1.5小时）
  ...
  第N章  ▸ 综合实战项目（2小时）
  附录A  ▸ API 速查表
  附录B  ▸ 常见错误排错指南
```

---

## 第二阶段：文档生成

### 2.1 整体结构规范

生成的文档采用 **Markdown 格式**，按章节拆分为独立文件：

```
output/[技术名称]/
├── README.md                   # 首页：学习路线图 + 章节导航索引
├── chapters/
│   ├── 01-introduction.md      # 第1章
│   ├── 02-xxx.md               # 第2章
│   ├── ...
│   └── capstone-project.md     # 综合实战项目
└── appendix/
    ├── cheatsheet.md           # API 速查表
    └── troubleshooting.md      # 常见错误排错指南
```

**为什么选 Markdown 而非 HTML：**
- 生成速度快（无需编写 CSS/JS 框架代码，精力集中在内容质量上）
- 文件轻量，随处可读（VS Code、GitHub、Typora、Obsidian 等）
- 天然支持代码块语法高亮
- 方便后续二次编辑和版本管理
- 如需转为站点浏览，可随时用 Docsify / VitePress / MkDocs 等工具一键转换

### 2.1.1 站点预览（可选）

文档生成完成后，**询问用户是否需要启动本地预览站点**：

```
📄 文档已全部生成为 Markdown 格式。

是否需要以站点方式预览？
  1. 🌐 启动 Docsify 站点（推荐，零配置，即时预览）
  2. 🌐 启动 VitePress 站点（功能更丰富，需 Node.js）
  3. ⏭️ 不需要，我直接用编辑器/阅读器打开
```

如果用户选择启动站点，则在文档目录下生成一个最小化的 Docsify 配置（仅需 2 个额外文件）：

```
output/[技术名称]/
├── index.html          # Docsify 入口（约 20 行，CDN 引入）
├── _sidebar.md         # 自动生成的侧边栏（从 README.md 的目录结构提取）
├── README.md           # Docsify 首页
├── chapters/
└── appendix/
```

Docsify 的 `index.html` 模板：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>[技术名称] 从入门到精通</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/docsify-themeable@0/dist/css/theme-simple.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1/themes/prism-tomorrow.min.css">
</head>
<body>
  <div id="app"></div>
  <script>
    window.$docsify = {
      name: '[技术名称]',
      loadSidebar: true,
      subMaxLevel: 3,
      search: { placeholder: '搜索文档...' },
      copyCode: { buttonText: '复制', successText: '已复制' },
      pagination: { previousText: '上一章', nextText: '下一章' },
    }
  </script>
  <script src="https://cdn.jsdelivr.net/npm/docsify@4/lib/docsify.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/docsify@4/lib/plugins/search.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1/components/prism-python.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1/components/prism-javascript.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1/components/prism-typescript.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/prismjs@1/components/prism-bash.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/docsify-copy-code@2"></script>
  <script src="https://cdn.jsdelivr.net/npm/docsify-pagination@2/dist/docsify-pagination.min.js"></script>
</body>
</html>
```

启动方式：

```bash
cd output/[技术名称]
# 方式1：使用 npx（推荐）
npx docsify-cli serve .
# 方式2：使用 Python
python -m http.server 8080
# 然后在浏览器访问 http://localhost:8080
```

如果用户选择「不需要站点」，则直接告知 Markdown 文件的路径即可，不生成任何额外文件。

### 2.2 单章节 Markdown 模板

每章必须包含以下部分（使用 Markdown 语法编写）：

```markdown
# 第X章 [章节标题]

> 预计学习时间：X 分钟

## 🎯 本章目标

学习完本章，你将能够：
- [具体能力 1]
- [具体能力 2]

## 📋 前置知识

> 如果你还没有学习以下内容，建议先完成：
> - [第X章](./0x-xxx.md) 的 XX 部分

## 💡 核心概念

### 概念一：[名称]

[类比引入]

[概念讲解]

[代码示例]

> **💡 为什么这样做？**
> [解释原理和使用场景]

### 概念二：[名称]
...

## 🔨 实战演练

### 练习：[场景名称]

**场景描述：**
[真实业务场景描述]

**你的任务：**
1. [步骤 1]
2. [步骤 2]
3. [步骤 3]

**参考代码：**

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```[语言]
// 完整的参考实现代码
```

**预期输出：**
```
[运行后的预期结果]
```

</details>

## ⚡ 进阶技巧

### 技巧一：[名称]
...

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：[问题]**
> A：[答案]

**Q2：[问题]**
> A：[答案]

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| [错误信息] | [原因分析] | [解决方法] |

## 📝 本章小结

- ✅ [要点 1]
- ✅ [要点 2]

## ➡️ 下一章预告

> 在下一章中，我们将学习 [简要预告]，为 [某个目标] 打下基础。
> [下一章链接](./0x-xxx.md)
```

### 2.3 内容生成规范

#### 2.3.1 讲解风格

- **类比先行**：每个新概念先用生活中的类比引入，让读者建立直觉
  - ✅ "你可以把 XX 想象成快递系统中的分拣中心..."
  - ❌ "XX 是一种用于处理 YY 的抽象数据结构..."
- **问题驱动**：先抛出一个实际场景中的问题，再引出解决方案
  - ✅ "假设你正在开发一个电商网站，用户点击购买后，你需要同时..."
  - ❌ "接下来我们学习 XX 的用法"
- **对比教学**：用「错误做法 vs 正确做法」的对比来加深理解
- **渐进式代码**：从最小可运行示例开始，逐步增加复杂度
  ```
  版本1：最简实现（能跑就行）
  版本2：添加错误处理
  版本3：添加边界情况处理
  版本4：生产级别的完整实现
  ```

#### 2.3.2 代码规范

每个代码示例必须满足：

1. **完整性**：每段代码都是完整的、可直接运行的，不省略任何 import 和配置
2. **注释丰富**：关键行必须有中文注释，解释「为什么这样做」
3. **对比展示**：在实战环节，用 Markdown 的 `<details>` 折叠块将「参考答案」隐藏，鼓励用户先自己写
   ```markdown
   **🧑‍💻 你的代码**（先自己写！）

   ```python
   # 你的实现写在这里
   ```

   <details>
   <summary>✅ 展开查看参考实现</summary>

   ```python
   # 完整的最佳实践代码
   ```

   **预期输出：**
   ```
   [运行结果]
   ```

   </details>
   ```
4. **渐进完善**：同一个示例在不同小节中逐步完善，而非突然给出一个大而全的代码
5. **输出展示**：每个代码示例都附带预期输出，方便用户对比验证

#### 2.3.3 内容深度要求

- **总字数**：完整教程至少 **30,000 字**（不含代码），每个章节至少 2,000-5,000 字
- **代码示例数量**：每个知识点至少 2-3 个代码示例
- **实战比例**：实战内容占总内容的 **60%** 以上
- **理论讲解**：只讲「必须知道」的理论，用最少的理论支撑最多的实战
  - ✅ 解释「是什么」和「为什么需要」→ 直接上手实战
  - ❌ 花大量篇幅追溯历史、对比所有同类技术

#### 2.3.4 实战场景设计

实战练习必须来自**真实业务场景**，而非孤立的 hello world：

- ✅ "实现一个带搜索过滤和分页的用户列表"
- ✅ "构建一个带认证和限流的 REST API"
- ✅ "实现一个实时聊天室的消息推送功能"
- ❌ "Hello World 示例"
- ❌ "打印 1-100 的数字"

每章的实战应该**前后连贯**，后面的章节可以在前面的实战代码上继续开发，最终形成一个完整项目。

### 2.4 综合实战项目（Capstone）

最后一章必须是一个**综合实战项目**，要求：

- 综合运用前面所有章节的知识点
- 模拟真实项目开发流程：需求分析 → 技术选型 → 架构设计 → 编码实现 → 测试 → 部署
- 代码量适中，能在 2-4 小时内完成
- 提供完整的参考代码仓库结构

### 2.5 附录内容

#### 2.5.1 API 速查表（Cheatsheet）

- 以表格/卡片形式列出最常用的 API
- 按使用频率排序，而非字母顺序
- 每个 API 附带一行最简示例

#### 2.5.2 常见错误排错指南（Troubleshooting）

- 收集该技术最常见的 15-20 个错误/问题
- 每个错误包含：错误信息、原因分析、解决方案
- 从实际开发中高频遇到的问题出发

---

## 第三阶段：收尾

> 站点预览功能已在 2.1.1 节定义。本阶段仅包含生成完成后的收尾工作。

### 3.1 生成 `_sidebar.md`（如用户启用了站点预览）

自动生成 Docsify 侧边栏文件，结构与 `README.md` 中的目录一致：

```markdown
- [首页](/)
- **基础篇**
  - [第1章 概述与环境搭建](chapters/01-introduction.md)
  - [第2章 ...](chapters/02-xxx.md)
- **进阶篇**
  - [第5章 ...](chapters/05-xxx.md)
- **实战篇**
  - [第N章 综合实战项目](chapters/capstone-project.md)
- **附录**
  - [API 速查表](appendix/cheatsheet.md)
  - [常见错误排错指南](appendix/troubleshooting.md)
```

---

## 写作原则（贯穿始终）

### 必须做到

1. **有趣**：用幽默的比喻、贴近生活的例子让技术不再枯燥
   - ✅ "闭包就像你的背包——不管你走到哪里，背包里的东西都跟着你"
   - ❌ "闭包是一个函数和其周围状态的引用的组合"
2. **循序渐进**：每个新知识都建立在前面已学知识的基础上，绝不跳跃
3. **学以致用**：每学完一个知识点，立刻动手练习，形成「学习→练习→掌握」的正循环
4. **不说废话**：不写"接下来让我们开始吧"这种过渡语，直入主题
5. **版本准确**：所有 API、语法、配置都基于获取到的最新官方文档，不凭记忆编写
6. **信息透明**：根据 1.0 检测出的模式，在文档首页和关键 API 处标注信息来源的可靠程度
   - 🟢 满配模式：标注「✅ 基于官方最新文档」
   - 🟡 标准模式：标注「📋 基于官网抓取内容，建议对照官方文档确认」
   - 🟠 降级模式：标注「⚠️ 基于搜索结果，API 可能已更新，请以官方文档为准」
   - 🔴 最小模式：标注「⚠️ 基于模型知识生成（截止约 [年份]），请务必对照最新官方文档」
7. **中文优先**：所有讲解使用中文，代码注释使用中文，API 名称保留英文原文
8. **代码可运行**：每段代码都必须是可以直接复制运行的，不留让用户困惑的省略

### 绝对禁止

1. ❌ 简单罗列 API 用法而不解释「为什么」和「什么时候用」
2. ❌ 使用过时的 API 或已废弃的写法
3. ❌ 只给代码片段而不给完整上下文
4. ❌ 用大量理论填充页面而不配合实战
5. ❌ 生成没有实际意义的 hello world 示例
6. ❌ 在不同章节中重复讲解已覆盖的内容（简要提及+链接回原章节即可）
7. ❌ 在工具不可用时静默降级而不告知用户——必须明确通知当前模式和信息可靠程度
8. ❌ 在 🟠/🔴 模式下假装内容来自官方最新文档——必须如实标注信息来源

---

## 典型工作流程

```
用户输入："学习 LangChain"

→ Step 1: 环境检测 —— 检查 context7/WebFetch/kosyak-fetch/WebSearch/Playwright 可用性
→ Step 1.5: 网页抓取工具补全 —— 若 WebFetch 和 kosyak-fetch 均不可用，自动安装 kosyak-fetch MCP
→ Step 2: 根据检测结果选择策略（满配/标准/降级/最小模式）
→ Step 3: 按所选策略获取 LangChain 最新文档
→ Step 4: 确定版本号，分析文档结构
→ Step 5: 向用户展示学习路线图（含信息来源模式），确认后开始
→ Step 6: 逐章生成 Markdown 文档，每章包含完整代码
→ Step 7: 生成 README.md 首页 + 附录
→ Step 8: 询问用户是否需要站点预览（如需要则生成 Docsify 配置并启动）
→ Step 9: 告知用户文件位置和使用方式
```

> **注意**：如果 Step 1 检测结果为 🟠 降级模式或 🔴 最小模式，
> Step 3 中会先向用户请求协助（提供文档链接或版本信息），待用户回复后再继续。

---

## 交互协议

### 开始前

收集必要信息后，向用户确认：

```
收到！我将为你生成 [技术名称] 的学习文档。

📌 学习主题：[技术名称]
📌 当前水平：[零基础/有基础/进阶]
📌 目标版本：[最新版本号]
📌 信息来源：[🟢 满配/🟡 标准/🟠 降级/🔴 最小] 模式
📌 预计章节数：N 章
📌 预计内容量：30,000+ 字

🗺️ 学习路线：
  第1章 → 第2章 → ... → 第N章 → 综合实战 → 附录

是否确认开始生成？如有特殊需求可以补充。
```

### 生成中

每完成一章，输出进度：

```
✅ 第1章「概述与环境搭建」已生成（约 X 字）
   进度：██░░░░░░░░ 10%  [1/10 章]
   正在生成第2章...
```

### 生成后

```
🎉 全部文档生成完成！

📊 统计信息：
  - 总章节数：12 章
  - 总字数：约 45,000 字
  - 代码示例：87 个
  - 实战练习：15 个
  - 综合项目：1 个

📁 文件位置：output/[技术名称]/
🌐 预览地址：http://localhost:8080（如已启动站点）

💡 阅读方式（任选其一）：
  1. VS Code 直接打开 .md 文件（内置 Markdown 预览）
  2. 浏览器访问 http://localhost:8080（如已启动 Docsify）
  3. 使用 Typora / Obsidian 等 Markdown 阅读器
  4. 推送到 GitHub，仓库中直接阅读

💡 学习建议：
  1. 按章节顺序学习，不要跳章
  2. 每个代码示例都要亲手敲一遍
  3. 完成每章的实战练习再进入下一章
  4. 遇到问题先查看排错指南
```
