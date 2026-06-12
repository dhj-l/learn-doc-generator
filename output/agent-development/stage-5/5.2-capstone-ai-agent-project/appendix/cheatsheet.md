# 🎯 AI Agent 综合实战项目速查表

## 📋 项目选项对比

| 维度 | 智能代码助手 | AI 研究助手 | 智能客服 | 工作流平台 |
|------|-------------|-------------|---------|-----------|
| 前端 | Vue 3 + Monaco | React | Vue 3 | React + ReactFlow |
| Agent | LangGraph ReAct | LangGraph Multi-Agent | Vercel AI SDK | LangGraph |
| MCP | filesystem + code-search | web-search + 论文检索 | 知识库 + 工单 | 自定义连接器 |
| 难度 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |

## 🏗️ 通用架构
```
前端 → API层(Hono) → Agent层(LangGraph) → MCP工具
                                    ↓
                              数据层(PG/Chroma/Redis)
```

## 🤖 Agent 核心代码
```typescript
const workflow = new StateGraph(AgentState)
  .addNode('agent', agentNode).addNode('tools', toolNode)
  .addEdge('__start__', 'agent')
  .addConditionalEdges('agent', router)
  .addEdge('tools', 'agent').compile();
```

## 🛠️ MCP 工具集成
```json
{"servers": {"filesystem": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]}}}
```

## ✅ 验收清单
- P0 功能完整 ✅ ≥3 MCP 工具 ✅ TypeScript 严格模式 ✅
- API Key 服务端 ✅ Zod 验证 ✅ 流式输出 ✅
- 前端 Vercel ✅ 后端 Docker ✅ README 完整 ✅

## 📁 推荐目录结构
```
agent-project/
├── frontend/ (components/ + stores/ + api/)
├── api/ (routes/ + agent/ + tools/)
├── docker-compose.yml + .env.example + README.md
```
