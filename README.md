# 📚 Learn Doc Generator

> 一个 Claude Code 自定义 Skill，能够为任意技术/框架生成**系统化、实战驱动、由浅入深**的学习文档，并可选以本地站点方式在浏览器中阅读。

## ✨ 特性

- 🎯 **实战驱动** —— 60% 以上内容为实战演练，每学一个知识点立刻动手练习
- 📖 **系统完整** —— 由浅入深，每个教程 30,000+ 字起步，不是敷衍的速成笔记
- 🔄 **自动获取最新文档** —— 通过 context7 / WebFetch / kosyak-fetch / WebSearch 自动同步官方最新文档，避免过时 API
- 🛡️ **环境自适应** —— 自动检测可用工具，四档策略矩阵（满配/标准/降级/最小），缺失网页抓取工具时自动安装 kosyak-fetch MCP
- 📝 **Markdown 原生** —— 生成纯 Markdown 文件，VS Code / GitHub / Typora / Obsidian 均可直接阅读
- 🌐 **可选站点预览** —— 需要时一键生成 Docsify 配置，在浏览器中浏览
- 🧩 **章节拆分** —— 内容按章节独立文件，不堆在一个巨型文件中
- ✅ **代码可运行** —— 每段代码完整可复制，附带预期输出和中文注释
- 🧪 **知识检查点** —— 每章末尾自测题，折叠式答案
- 📋 **附录齐全** —— API 速查表 + 常见错误排错指南

## 📖 生成示例

查看 [`examples/`](./examples/) 目录中由该 Skill 实际生成的学习文档：

| 示例 | 技术 | 章节数 | 格式 |
|------|------|--------|------|
| [LangChain.js](./examples/langchain-js/) | LangChain.js | 10 章 + 附录 | HTML 静态站点 |

> 在 `examples/langchain-js/` 目录下运行 `npx serve .` 或 `python -m http.server 8080` 即可在浏览器中预览。

## 📦 安装

### 方式一：用户级安装（推荐，所有项目通用）

```bash
# 将 skill 文件复制到 Claude Code 用户命令目录
cp learn-doc-generator.md ~/.claude/commands/
```

### 方式二：项目级安装（仅当前项目可用）

```bash
# 在项目根目录下创建命令目录并复制
mkdir -p .claude/commands/
cp learn-doc-generator.md .claude/commands/
```

### 前提条件

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI 已安装并可正常使用

**可选依赖**（缺失时 Skill 会自动降级或自动安装）：

| 工具 | 作用 | 安装方式 |
|------|------|----------|
| [context7](https://github.com/upstash/context7) MCP | 获取结构化官方文档 | Claude Code MCP 配置 |
| WebFetch（内置） | 抓取网页内容 | Claude Code 内置 |
| [kosyak-fetch](https://github.com/kosyakdev/fetch-mcp) MCP | WebFetch 增强替代，支持 PDF/SPA/YouTube | 自动安装（当 WebFetch 不可用时） |
| WebSearch（内置） | 搜索最新信息 | Claude Code 内置 |

## 🚀 使用

在 Claude Code 对话中：

```bash
# 用户级命令
/user:learn-doc-generator LangChain

# 项目级命令（如果安装到项目目录）
/project:learn-doc-generator React
```

也可以直接用自然语言：

```
我想学习 LangChain，帮我生成学习文档
```

### 使用示例

```
/user:learn-doc-generator FastAPI
/user:learn-doc-generator Vue 3
/user:learn-doc-generator Docker
/user:learn-doc-generator PyTorch
```

## ⚙️ 工作流程

```
用户输入学习主题
       │
       ▼
┌──────────────────┐
│  1. 环境检测       │  检查 context7 / WebFetch / kosyak-fetch / WebSearch 可用性
└────────┬─────────┘
         ▼
┌──────────────────┐
│  2. 工具补全       │  若 WebFetch/kosyak-fetch 均不可用，自动安装 kosyak-fetch MCP
└────────┬─────────┘
         ▼
┌──────────────────┐
│  3. 选择策略       │  🟢满配 / 🟡标准 / 🟠降级 / 🔴最小
└────────┬─────────┘
         ▼
┌──────────────────┐
│  4. 获取官方文档   │  按策略自动拉取最新文档内容
└────────┬─────────┘
         ▼
┌──────────────────┐
│  5. 展示路线图     │  章节规划 + 预计时长，等用户确认
└────────┬─────────┘
         ▼
┌──────────────────┐
│  6. 逐章生成文档   │  Markdown 格式，含代码 + 练习 + 自测
└────────┬─────────┘
         ▼
┌──────────────────┐
│  7. 可选站点预览   │  用户选择后生成 Docsify 配置并启动
└──────────────────┘
```

## 📁 生成的文档结构

```
output/[技术名称]/
├── README.md                   # 首页：学习路线图 + 章节索引
├── chapters/
│   ├── 01-introduction.md      # 第1章
│   ├── 02-xxx.md               # 第2章
│   ├── ...
│   └── capstone-project.md     # 综合实战项目
└── appendix/
    ├── cheatsheet.md           # API 速查表
    └── troubleshooting.md      # 常见错误排错指南
```

## 📋 单章节结构

每章包含以下标准模块：

| 模块 | 说明 |
|------|------|
| 🎯 本章目标 | 学完本章你能做什么 |
| 📋 前置知识 | 需要先学完哪些章节 |
| 💡 核心概念 | 类比引入 → 概念讲解 → 代码示例 |
| 🔨 实战演练 | 真实业务场景 + 动手练习 + 折叠参考答案 |
| ⚡ 进阶技巧 | 高级用法和最佳实践 |
| 🧠 知识检查点 | 3-5 道自测题（折叠答案） |
| 🐛 常见错误 | 本章高频踩坑及解决方案 |
| 📝 本章小结 | 要点回顾 |
| ➡️ 下一章预告 | 衔接引导 |

## 🛡️ 环境自适应策略

Skill 启动时会自动检测可用工具，并选择最佳策略：

| 模式 | 条件 | 信息质量 | 行为 |
|------|------|----------|------|
| 🟢 满配 | context7 + WebFetch/kosyak-fetch + WebSearch | ★★★★★ | 自动获取最新官方文档 |
| 🟡 标准 | WebFetch/kosyak-fetch + WebSearch | ★★★★☆ | 直接抓取官网页面（SPA 站点用 kosyak-fetch） |
| 🟠 降级 | 仅 WebSearch | ★★★☆☆ | 搜索引擎辅助，声明版本风险 |
| 🔴 最小 | 全部不可用 | ★★☆☆☆ | 请求用户提供文档链接，标注免责声明 |

> **自动补全机制**：当 `WebFetch` 和 `kosyak-fetch` MCP 均不可用时，Skill 会自动安装 `kosyak-fetch-mcp`，避免不必要的降级。

## ❓ FAQ

**Q: 生成一篇教程需要多长时间？**
A: 取决于章节数量和内容深度，一个 10 章的完整教程通常需要 10-20 分钟。

**Q: 生成的文档质量如何保证？**
A: Skill 会先通过 MCP 工具获取最新官方文档，再基于实际文档内容生成教程。所有代码示例都要求完整可运行。

**Q: 可以只生成某个章节吗？**
A: 可以。在对话中说明你想学习的具体章节或主题范围即可。

**Q: 生成后可以修改吗？**
A: 所有文档都是纯 Markdown 文件，可以随时用任何编辑器修改。

## 📄 License

MIT

---

> Built with ❤️ for [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
