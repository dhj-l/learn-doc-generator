# 🚀 Agent UI 设计 — API 速查表

> 按使用频率排序，每个 API 附带一行最简示例

---

## Agent 状态类型

```typescript
type AgentStatus =
  | 'idle'              // 💤 空闲
  | 'thinking'          // 🧠 思考中
  | 'calling_tool'      // 🔧 调用工具
  | 'waiting_approval'  // ⚠️ 等待确认
  | 'streaming'         // ✍️ 流式输出
  | 'completed'         // ✅ 完成
  | 'error'             // ❌ 错误
  | 'cancelled';        // 🚫 已取消
```

## Agent 状态设计配置

```typescript
const statusDesign = {
  idle:       { icon: '💤', color: 'gray',   message: '等待你的指令...' },
  thinking:   { icon: '🧠', color: 'blue',   message: '正在思考...' },
  calling_tool: { icon: '🔧', color: 'orange', message: '正在调用工具...' },
  waiting_approval: { icon: '⚠️', color: 'yellow', message: '需要你的确认' },
  streaming:  { icon: '✍️', color: 'green',  message: '正在生成回复...' },
  completed:  { icon: '✅', color: 'green',  message: '任务完成' },
  error:      { icon: '❌', color: 'red',    message: '出现错误' },
  cancelled:  { icon: '🚫', color: 'gray',   message: '已取消' },
};
```

## 四种交互模式

| 模式 | 核心组件 | 适用场景 |
|------|---------|---------|
| 对话式 (Chat UI) | `ChatMessage.vue` | 通用问答、代码生成 |
| 任务面板 (Task Panel) | `TaskPanel.vue` | 数据分析、批量处理 |
| 工作流可视化 | `WorkflowVisualization.vue` | 复杂 Agent 流程 |
| 混合模式 | Chat + Task Panel 组合 | 综合场景 |

## 工具调用卡片

```vue
<ToolCallCard :tool="{ name: 'search', status: 'running', args: {...}, result: '...' }" />
```

## Human-in-the-Loop 三种模式

| 模式 | 时机 | 示例 |
|------|------|------|
| 确认前执行 | Agent 提方案后 | 删除操作、写文件 |
| 执行中暂停 | 关键步骤时 | 支付、权限变更 |
| 执行后审核 | Agent 完成后 | 批量处理、内容生成 |

## Capstone 项目结构参考

```
agent-console/
├── components/
│   ├── AgentStatus.vue
│   ├── ToolCallCard.vue
│   ├── HumanInLoop.vue
│   └── ChatPanel.vue
├── stores/agent-store.ts
├── App.vue
└── main.ts
```
