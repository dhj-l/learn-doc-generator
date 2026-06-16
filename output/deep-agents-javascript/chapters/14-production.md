# 第14章 生产环境部署

> 预计学习时间：1 小时

## 🎯 本章目标

学习完本章，你将能够：
- 理解 Managed Deep Agents（LangSmith 托管）的工作原理
- 配置 LangSmith Deployment 部署自定义 Agent
- 使用 `langgraph.json` 配置依赖和 Graph
- 实现认证、Webhooks、Cron Jobs
- 配置可观测性和追踪

## 📋 前置知识

> 如果你还没有学习以下内容，建议先完成：
> - [第10章 权限系统](./10-permissions.md) —— 了解生产环境的权限和安全配置
> - [第7章 后端系统详解](./07-backend.md) —— 了解 FilesystemBackend 用于生产部署

## 💡 核心概念

**用一个类比来理解：**

> 部署 Agent 就像开连锁餐厅——在开发环境下，你只需要一个临时的摊位试做几道菜（本地测试），看着没问题就行了。但要正式开业（生产部署），你需要考虑选址装修（基础设施选型）、办理营业执照（认证与安全配置）、招聘员工并培训（监控运维体系建立）、制定标准操作流程（自动化部署与 CI/CD 流水线）。没有标准化的部署方案，每个"餐厅"都会各自为政，管理混乱。
>
> **生产部署 = 将 Agent 从"厨房试做"升级为"正式餐厅运营"。** 就像连锁餐厅需要统一的后厨标准、供应链管理和质量监控一样，生产环境中的 Agent 也需要可靠的基础设施、认证授权、性能监控和故障恢复机制。

> **💡 为什么这样做？**
> 开发环境中运行 Agent 和在生产环境中运行 Agent 是完全不同的两回事。在开发时，你可以容忍偶尔的重启、手动配置环境变量、甚至直接在终端中调试。但在生产环境中，你需要考虑：服务意外中断后能否自动恢复（高可用性）？大量用户同时访问时系统是否会崩溃（可伸缩性）？敏感数据在传输和存储过程中是否安全（安全性）？Managed Deep Agents 和 LangSmith Deployment 正是为了解决这些生产级问题而设计的——它们提供了开箱即用的基础设施能力，让你专注于 Agent 的业务逻辑本身，而不必从零搭建整套运维体系。

### 14.1 部署选项

将 Agent 从开发环境部署到生产环境，需要考虑很多实际问题：如何保证服务持续稳定运行不出故障？如何全面监控性能指标和及时捕获错误？如何处理用户认证和访问权限控制？如何确保敏感数据的传输和存储安全？Deep Agents 提供了两种生产部署方案，分别适用于不同的场景和需求：

```
┌─────────────────────────────────────────────────────────┐
│                   生产部署选项                            │
├─────────────────────────┬───────────────────────────────┤
│   🚀 Managed Deep Agents │   ⚙️ LangSmith Deployment    │
│                         │                              │
│   API-first 托管运行时    │   自定义应用部署               │
│   零配置快速启动          │   完整控制权                  │
│   内置线程/运行/存储      │   支持认证/Webhooks/Cron      │
│   无需管理基础设施        │   支持 MCP / A2A 协议        │
└─────────────────────────┴───────────────────────────────┘
```

> **💡 如何选择部署方式？**
> - 如果你的需求比较简单，不需要复杂的自定义路由和认证逻辑，选择 **Managed Deep Agents**，它零配置、启动快、无需管理基础设施，可以在几分钟内完成部署
> - 如果你需要完全控制部署过程，包括自定义路由、Webhooks、Cron Jobs 等企业级功能，选择 **LangSmith Deployment** 可以获得最大的灵活性
> - 一个实用的建议是：先在 Managed Deep Agents 上快速验证原型，当需要更复杂的配置时再迁移到 LangSmith Deployment，这样可以最大限度地降低初期的部署成本

| 特性 | Managed Deep Agents | LangSmith Deployment |
|------|-------------------|---------------------|
| 配置复杂度 | 低（零配置） | 中（需配置 langgraph.json） |
| 自定义路由 | 有限 | 完全控制 |
| 认证 | ✅ 内置 | ✅ 内置 |
| Webhooks | ✅ | ✅ |
| Cron Jobs | ❌ | ✅ |
| 可观测性 | ✅ LangSmith | ✅ LangSmith |
| MCP/A2A | ✅ | ✅ |

### 14.2 `langgraph.json` 配置

LangSmith Deployment 使用 `langgraph.json` 配置文件：

```json
{
  "dependencies": ["early_access_features"],
  "graphs": {
    "agent": "./src/agent.ts:agent"
  },
  "env": ".env"
}
```

| 字段 | 说明 |
|------|------|
| `dependencies` | 额外的依赖包 |
| `graphs` | Graph 映射（名称 → 文件路径:导出变量名） |
| `env` | 环境变量文件路径 |

### 14.3 创建可部署的 Agent

Agent 文件需要导出 graph 对象：

```typescript
// src/agent.ts
import { createDeepAgent } from "deepagents";

export const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  tools: [searchTool, calculator],
  systemPrompt: "You are a helpful assistant.",
  memory: ["./AGENTS.md"],
});

// LangSmith Deployment 需要导出 graph
// 然后配置 langgraph.json:
// {
//   "graphs": {
//     "agent": "./src/agent.ts:agent"
//   }
// }
```

### 14.4 前端集成（useStream 连接生产环境）

```tsx
import { useStream } from "@langchain/react";

function App() {
  const stream = useStream<typeof agent>({
    apiUrl: "https://your-deployment.langsmith.dev",  // 部署 URL
    assistantId: "agent",
    reconnectOnMount: true,     // 页面刷新后自动恢复流
    fetchStateHistory: true,    // 加载完整对话历史
  });
  // ...
}
```

### 14.5 Webhooks（生产事件）

生产环境中的 Webhook 用于接收外部事件触发：

```typescript
// Next.js API Route 处理 Webhook
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;

    // 处理不同事件类型
    if (payload.triggerSlug === 'GITHUB_COMMIT_EVENT') {
      const commitData = payload.payload;
      // 调用 Agent 处理 commit
      await agent.invoke({
        messages: [{ role: "user", content: `Review this commit: ${commitData.message}` }],
      });
    }

    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

### 14.6 认证与安全

LangSmith Deployment 提供内置的认证机制：

```bash
# 配置 API Key 认证
# 在 LangSmith 控制台生成 API Key
# 所有请求需要在 Header 中携带

curl -X POST https://your-deployment.langsmith.dev/agent/invoke \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### 14.7 可观测性

生产环境中，所有的 Agent 调用自动被 LangSmith 追踪：

```typescript
// 无需额外配置 —— 部署到 LangSmith 后自动启用
// 功能包括：
// - 完整的调用链路追踪
// - Token 用量统计
// - 延迟监控
// - 错误率告警
// - 用户反馈收集

// 收集用户反馈
// LangSmith 提供了反馈收集接口
```

---

## 🔨 实战演练

### 练习 1：部署到 LangSmith

**场景描述：**
将一个带搜索功能的 Deep Agent 部署到 LangSmith 生产环境，使其可以通过 HTTPS 对外提供服务。

**你的任务：**
1. 创建一个包含搜索工具的 Deep Agent，导出为 `agent` 变量
2. 编写 `langgraph.json` 配置文件，指定依赖包和 Graph 映射
3. 配置 `.env` 环境变量文件，填入 API Key
4. 将代码推送到 LangSmith 控制台完成部署

<details>
<summary>🧑‍💻 先自己尝试，写完再展开看参考答案</summary>

**参考代码：**

```typescript
// src/agent.ts
import { createDeepAgent } from "deepagents";
import { tool } from "langchain";
import { z } from "zod";

const searchTool = tool(
  async ({ query }) => `Results for: ${query}`,
  {
    name: "search",
    description: "Search for information",
    schema: z.object({ query: z.string() }),
  }
);

export const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  tools: [searchTool],
  systemPrompt: "You are a research assistant. 你是一个研究助手，帮助用户搜索和整理信息。",
});
```

```json
// langgraph.json
{
  "dependencies": ["early_access_features"],
  "graphs": {
    "agent": "./src/agent.ts:agent"
  },
  "env": ".env"
}
```

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
LANGSMITH_API_KEY=lsv2-...
```

</details>

**预期输出：**

```
在 LangSmith 控制台中，你应该能看到：
- Deployment 状态变为 "Active"
- 可以通过 https://your-deployment.langsmith.dev/agent/invoke 调用 Agent
- 每次调用都会在 LangSmith 中生成完整的调用链路追踪记录
```

### 练习 2：生产前端集成

**场景描述：**
为一个已部署到 LangSmith 的 Agent 构建前端聊天界面，支持实时流式输出、错误处理和自动重连。

**你的任务：**
1. 使用 `useStream` Hook 连接生产环境的 Agent 部署 URL
2. 配置自动重连和对话历史加载功能
3. 添加错误状态的 UI 展示
4. 实现输入框和发送按钮的消息交互界面

<details>
<summary>🧑‍💻 先自己尝试，写完再展开看参考答案</summary>

**参考代码：**

```tsx
import { useStream } from "@langchain/react";

const API_URL = "https://your-deployment.langsmith.dev";

function ProductionChat() {
  const stream = useStream<typeof agent>({
    apiUrl: API_URL,
    assistantId: "agent",
    reconnectOnMount: true,
    fetchStateHistory: true,
  });

  const [input, setInput] = useState("");

  return (
    <div className="chat-container">
      <div className="messages">
        {stream.messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.type}`}>
            <p>{msg.text}</p>
          </div>
        ))}
      </div>
      {stream.error && <div className="error">⚠️ {stream.error.message}</div>}
      <div className="input-area">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              stream.submit(input);
              setInput("");
            }
          }}
          placeholder="Type a message..."
        />
        <button onClick={() => { stream.submit(input); setInput(""); }}>
          Send
        </button>
      </div>
    </div>
  );
}
```
</details>

**预期输出：**

```
一个完整的生产环境聊天界面，包含：
- 消息列表区显示用户和 AI 的消息气泡
- 输入框支持 Enter 键发送消息
- 发送按钮点击后清空输入框
- 页面刷新后自动恢复之前的对话（reconnectOnMount）
- 加载完整的对话历史（fetchStateHistory）
- 错误状态下显示 ⚠️ 提示信息
```

---

## ⚡ 进阶技巧

### 技巧一：多环境配置

在生产和开发环境中使用不同的配置是一个基本的最佳实践。通过独立的 .env 文件管理不同环境的环境变量，可以避免在代码中硬编码 API Key 等敏感信息，也能防止将开发环境的配置意外部署到生产环境。建议至少维护 development、staging 和 production 三套独立的配置方案，每套配置使用不同的 API Key 和数据库连接参数：

```bash
# .env.development —— 开发环境
ANTHROPIC_API_KEY=sk-ant-dev-...
LANGSMITH_API_KEY=lsv2-dev-...

# .env.production —— 生产环境
ANTHROPIC_API_KEY=sk-ant-prod-...
LANGSMITH_API_KEY=lsv2-prod-...
```

### 技巧二：Cron Jobs 定时任务

Cron Jobs 允许你按预设的时间计划自动触发 Agent 执行任务。这在需要定期生成报告、发送通知、清理数据等场景中非常有用：

> **💡 Cron Jobs 的典型场景：**
> - **每日报告**：每天早上 9 点自动生成业务分析报告并发送到指定邮箱
> - **定时巡检**：每小时检查系统状态，发现异常自动告警
> - **数据清理**：每天凌晨清理过期的临时文件和缓存数据
> - **同步任务**：定期从外部系统同步数据到本地数据库

在 LangSmith Deployment 控制台中配置 Cron Jobs 非常简单直接——不需要修改任何代码，只需要在控制台界面中设置触发时间（支持标准的 cron 表达式语法）和要调用的 Agent 名称即可。Cron Jobs 的执行记录也可以在控制台中查看，方便排查定时任务执行失败的原因。

### 技巧三：监控与告警配置

生产环境的 Agent 需要持续监控才能确保稳定运行。LangSmith 提供了内置的可观测性功能，可以追踪每一次 Agent 调用的完整链路、统计 Token 消耗量、监控响应延迟和错误率。建议在生产部署后定期查看这些指标，及时发现和解决潜在问题，防止小问题演变成大故障。

**监控的关键指标包括：**
- **调用成功率**：如果成功率突然下降，说明 Agent 可能遇到了异常或模型暂时不可用，需要立即检查原因并处理
- **平均响应时间**：响应时间逐渐变长可能意味着模型负载过高或工具调用出现了性能瓶颈问题
- **Token 消耗趋势**：Token 用量突然大幅增加可能意味着 Agent 陷入了不必要的工具调用循环或输入的提示词过长
- **错误类型分布**：不同类型的错误需要不同的处理策略（如超时、限流、参数错误）
- **用户满意度**：通过用户反馈或评分数据评估 Agent 的整体表现

**设置告警规则：** 当某个关键指标超过预设的阈值时（例如错误率超过 5% 或平均响应时间超过 10 秒），通过 LangSmith 的告警功能自动发送通知给运维人员，确保问题在影响最终用户之前就被及时发现并得到妥善解决。

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Deep Agents 提供了哪两种生产部署方式？**
> A：Managed Deep Agents（API-first 托管运行时，零配置，适合快速部署）和 LangSmith Deployment（自定义部署，完全控制，适合需要定制化配置的场景）。

**Q2：`langgraph.json` 文件的作用是什么？**
> A：它是 LangSmith Deployment 的核心配置文件，用于指定依赖包、Graph 映射关系和环境变量。部署时 LangSmith 根据这个文件构建和启动你的 Agent 服务。

**Q3：生产环境的 Agent 如何启用追踪？**
> A：部署到 LangSmith 后追踪自动启用，无需额外配置。它会自动收集调用链路、Token 用量统计、响应延迟、错误率等关键监控指标。

**Q4：`useStream` 在生产环境中如何配置？**
> A：需要将 apiUrl 指向 LangSmith Deployment 提供的 URL，同时设置 reconnectOnMount 为 true（页面刷新后自动恢复连接）和 fetchStateHistory 为 true（加载完整的对话历史记录）。

**Q5：生产环境中应该如何配置权限？**
> A：生产环境应该使用严格模式，只允许 Agent 访问它绝对需要的文件和目录（最小权限原则），同时禁用所有不必要的命令执行权限。建议结合第10章的 FilesystemPermission 配置。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Deployment not found` | LangSmith Deployment 名称错误 | 检查 LangSmith 控制台中的部署名 |
| `Authentication failed` | API Key 无效或过期 | 在 LangSmith 控制台重新生成 |
| `Graph 'agent' not exported` | agent.ts 中未正确导出 | 确保 `export const agent = ...` |
| `Environment variables missing` | .env 文件未配置 | 检查环境变量是否正确设置 |
| 部署后 Agent 行为与本地不一致 | 生产环境和开发环境的模型配置不同 | 确认 langgraph.json 中的模型名称和 API Key 配置正确 |

---

## 📝 本章小结

- ✅ Managed Deep Agents：API-first 托管模式，零配置即可快速启动，适合标准化部署
- ✅ LangSmith Deployment：自定义部署，通过 langgraph.json 配置文件管理依赖和 Graph
- ✅ `langgraph.json` 定义依赖包、Graph 映射关系和环境变量，是部署的核心配置文件
- ✅ 生产环境内置认证、Webhooks、Cron Jobs 等企业级功能
- ✅ 部署到 LangSmith 后自动获得可观测性能力（调用追踪、Token 统计、延迟和错误率监控）
- ✅ `useStream` 的生产配置需开启 reconnectOnMount 和 fetchStateHistory 提升体验
- ✅ 多环境配置策略：通过 .env.development 和 .env.production 等文件区分不同部署环境的配置
- ✅ 监控与告警：关注调用成功率、响应时间、Token 消耗趋势和错误类型分布
- ✅ 定期检查 LangSmith 控制台的监控面板和日志记录，及时发现并处理异常，保障服务长期稳定性
- ✅ LangSmith Deployment 支持 Webhooks、Cron Jobs 和认证管理等企业级功能，灵活扩展
- ✅ Cron Jobs 可以实现定时任务自动化和定期执行，如每日报告生成和系统自动巡检

## ➡️ 下一章预告

> 在下一章中，我们将对比 Deep Agents 与 Claude Agent SDK 的差异，以及学习 LangChain v1 的迁移指南——帮助现有项目顺利升级。
>
> [第15章 生态对比与 LangChain v1 迁移](./15-comparison-migration.md)
