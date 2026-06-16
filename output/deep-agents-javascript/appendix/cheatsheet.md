# 附录A：API 速查表

> 快速查找 Deep Agents 最常用的 API、参数和配置。

---

## 一、`createDeepAgent` 参数表

```typescript
const agent = createDeepAgent({
  model,              // string - 必填 模型标识 provider:model_id
  systemPrompt,       // string - 可选 系统提示词
  tools,              // Tool[] - 可选 工具列表
  subagents,          // SubAgentConfig[] - 可选 子代理配置
  memory,             // string[] - 可选 记忆文件路径
  skills,             // string[] - 可选 技能目录路径
  backend,            // Backend - 可选 文件系统后端
  checkpointer,       // BaseCheckpointSaver - 可选 状态检查点
  store,              // BaseStore - 可选 存储后端
  contextSchema,      // ZodSchema - 可选 运行时上下文 Schema
  permissions,        // FilesystemPermission[] - 可选 文件系统权限
  middleware,         // Middleware[] - 可选 中间件列表
});
```

### 核心参数速查

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `model` | `string` | — | ✅ | `anthropic:claude-sonnet-4-6` |
| `systemPrompt` | `string` | `""` | ❌ | Agent 角色和行为定义 |
| `tools` | `Tool[]` | `[]` | ❌ | 工具列表 |
| `subagents` | `SubAgentConfig[]` | `[]` | ❌ | 子代理 |
| `memory` | `string[]` | `[]` | ❌ | AGENTS.md 文件路径 |
| `skills` | `string[]` | `[]` | ❌ | 技能目录路径 |
| `backend` | `Backend` | `StateBackend` | ❌ | 文件系统后端 |
| `checkpointer` | `BaseCheckpointSaver` | `null` | ❌ | MemorySaver |
| `contextSchema` | `ZodSchema` | `null` | ❌ | 运行时上下文 |
| `permissions` | `FilesystemPermission[]` | `[]` | ❌ | 权限规则 |

---

## 二、模型提供商速查

| 提供商 | 前缀 | 环境变量 | 示例 |
|--------|------|---------|------|
| Anthropic | `anthropic:` | `ANTHROPIC_API_KEY` | `anthropic:claude-sonnet-4-6` |
| OpenAI | `openai:` | `OPENAI_API_KEY` | `openai:gpt-5.5` |
| Google Gemini | `google_genai:` | `GOOGLE_API_KEY` | `google_genai:gemini-3.5-flash` |
| OpenRouter | `openrouter:` | `OPENROUTER_API_KEY` | `openrouter:anthropic/claude-sonnet-4-6` |
| Baseten | `baseten:` | `BASETEN_API_KEY` | `baseten:zai-org/GLM-5` |
| Fireworks | `fireworks:` | `FIREWORKS_API_KEY` | `fireworks:accounts/fireworks/models/...` |
| Ollama | `ollama:` | 无 | `ollama:devstral-2` |

---

## 三、Backend 类型对比

| Backend | 导入路径 | 持久化 | 适用场景 |
|---------|---------|--------|---------|
| `StateBackend` | `deepagents` | ❌ | 内存文件系统（默认） |
| `FilesystemBackend` | `deepagents` | ✅ | 真实文件系统 |
| `StoreBackend` | `deepagents` | ✅ | 多租户 Store |
| `CompositeBackend` | `deepagents` | 取决于子 Backend | 路径路由组合 |
| `DaytonaSandbox` | `@langchain/daytona` | ❌ | 代码执行沙箱 |
| `DenoSandbox` | `@langchain/deno` | ❌ | JS/TS 沙箱 |

---

## 四、文件系统工具

| 工具 | 功能 | 类似命令 |
|------|------|---------|
| `ls` | 列出目录内容 | `ls -la` |
| `read_file` | 读取文件内容 | `cat` |
| `write_file` | 写入/创建文件 | `echo >` |
| `edit_file` | 编辑文件（替换文本） | `sed -i` |
| `grep` | 搜索文件内容 | `grep -r` |
| `glob` | 查找匹配的文件 | `find` |

---

## 五、权限规则语法

```typescript
interface FilesystemPermission {
  operations: ("read" | "write")[];  // 控制的操作
  paths: string[];                    // glob 路径模式
  mode: "allow" | "deny";            // 允许或拒绝
}
```

### 常用规则模式

```typescript
// 全部拒绝写
[{ operations: ["write"], paths: ["/**"], mode: "deny" }]

// 白名单：只允许 src/
[
  { operations: ["read", "write"], paths: ["/workspace/src/**"], mode: "allow" },
  { operations: ["read", "write"], paths: ["/**"], mode: "deny" },
]

// 保护敏感文件
[
  { operations: ["read", "write"], paths: ["/workspace/.env"], mode: "deny" },
  { operations: ["read", "write"], paths: ["/workspace/**"], mode: "allow" },
  { operations: ["read", "write"], paths: ["/**"], mode: "deny" },
]
```

> ⚠️ 规则需要 `deepagents >= 1.9.1`，按数组顺序评估。

---

## 六、ACP CLI 选项

```bash
npx deepagents-acp \
  --name <agent-name> \       # Agent 名称
  --model <provider:model> \  # 模型
  --skills <path> \           # 技能目录
  --debug                     # 调试模式
```

---

## 七、`dcode` 命令速查

```bash
dcode --agent <name>          # 使用指定 Agent
dcode --model <provider:id>   # 指定模型
dcode -y                      # 自动确认工具调用

# 技能管理
dcode skills create <name>                # 创建用户技能
dcode skills create <name> --project      # 创建项目技能
dcode skills list                         # 列出用户技能
dcode skills list --project               # 列出项目技能
dcode skills info <name>                  # 查看技能详情
dcode skills delete <name>                # 删除技能（加 -f 强制）

# Agent 管理
dcode agents list                         # 列出所有 Agent
dcode agents reset --agent <name>         # 清除 Agent 记忆
dcode update                              # 检查更新
```

---

## 八、安装命令速查

```bash
# Deep Agents 核心
npm install deepagents langchain @langchain/core

# 模型提供商
npm install @langchain/anthropic          # Claude
npm install @langchain/openai             # GPT
npm install @langchain/google-genai       # Gemini

# 沙箱
npm install @langchain/daytona            # Daytona 沙箱
npm install @langchain/deno               # Deno 沙箱

# 前端
npm install @langchain/react              # React useStream Hook

# ACP 服务端
npm install deepagents-acp                # ACP 服务端

# 搜索
npm install @langchain/tavily             # Tavily 搜索
```
