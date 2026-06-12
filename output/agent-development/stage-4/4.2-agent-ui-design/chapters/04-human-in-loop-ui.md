# 第4章：人机协作界面 — 在 Agent 流程中嵌入人工审批

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **设计「人在回路中」（Human-in-the-Loop）交互模式** — 在关键步骤嵌入人工审批
- **实现 Agent 请求确认、人工干预、审批流程** — 三种常见的 HITL 模式
- **确保关键操作不自动执行** — 安全第一的设计原则

## 📋 前置知识

> 建议先完成：
> - [第2章：Agent 状态展示](./02-status-display.md) — 了解 Agent 的 awaiting_input 状态
> - [第3章：工具调用可视化](./03-tool-visualization.md) — 了解工具调用的生命周期

---

## 💡 核心概念

### Human-in-the-Loop 的三种模式

**生活类比：** 想象你让助手帮你订机票。

- **确认前执行**：助手说「我找到一趟航班，价格 1200 元，时间 14:00，要订吗？」你说「订」——这就是确认前执行。助手先拿出方案等你确认再执行。
- **执行中暂停**：你授权助手全权操作，但到了付款步骤，助手暂停说「需要输入支付密码」——这就是执行中暂停。助手在关键步骤停下来等你介入。
- **执行后审核**：助手订完票后给你发消息「已预订：航班 CA1234，14:00 北京→上海」——这就是执行后审核。你信任助手的大部分操作，但最后检查一遍。

这三种模式的信任度和自动化程度不同，选择哪种取决于操作的**风险和可逆性**。

| 模式 | 说明 | 适用场景 | 风险级别 |
|------|------|----------|----------|
| **确认前执行** | Agent 先提方案 → 用户确认 → 执行 | 删除操作、写文件、发消息 | 高（不可逆） |
| **执行中暂停** | Agent 执行到关键步骤时暂停等待 | 支付、权限变更 | 中 |
| **执行后审核** | Agent 执行完，用户审核结果 | 批量处理、内容生成 | 低（可修改） |

```vue
<!-- ApprovalPanel.vue — 通用审批面板 -->
<template>
  <div class="human-in-loop">
    <div class="approval-request">
      <div class="header">
        <span class="mode-badge" :class="mode">
          {{ mode === 'pre_confirm' ? '🔐 确认前' :
             mode === 'mid_pause' ? '⏸️ 执行中' : '📋 审核' }}
        </span>
        <h3>Agent 需要你的{{ mode === 'post_review' ? '审核' : '确认' }}</h3>
      </div>

      <!-- 上下文预览 -->
      <div class="context">
        <div class="field">
          <label>操作</label>
          <p>{{ actionDescription }}</p>
        </div>
        <div class="field">
          <label>影响范围</label>
          <p>{{ impactScope }}</p>
        </div>
        <pre v-if="preview" class="preview">{{ preview }}</pre>
      </div>

      <!-- 操作按钮 -->
      <div class="actions">
        <button @click="approve" class="primary">✅ 确认执行</button>
        <button @click="modify">✏️ 修改后再执行</button>
        <button @click="reject" class="danger">🚫 拒绝</button>
      </div>
    </div>
  </div>
</template>
```

> **💡 为什么需要三种 HITL 模式而不是一种？** 不同类型操作的风险和可逆性不同。删除数据库记录（不可逆）需要「确认前执行」；生成推荐文案（可修改）只需要「执行后审核」。一刀切的模式要么不安全（没有确认直接执行高危险操作），要么效率太低（连发个通知都要先确认）。

### 确认前的上下文展示

```typescript
interface ApprovalRequest {
  id: string
  actionType: 'delete' | 'write' | 'send' | 'payment' | 'permission'
  description: string     // 操作描述
  preview: string         // 操作预览
  impact: string          // 影响范围
  riskLevel: 'low' | 'medium' | 'high'

  // 自动撤销超时（秒）
  autoRevokeTimeout?: number
}

// 高风险操作的审核流程
async function requestApproval(request: ApprovalRequest) {
  // 设置自动撤销倒计时
  if (request.riskLevel === 'high' && !request.autoRevokeTimeout) {
    request.autoRevokeTimeout = 300 // 5 分钟超时自动撤销
  }

  // 通知用户
  notifyUser({
    type: 'approval_required',
    request,
  })

  // 等待用户响应
  return new Promise<{ decision: 'approve' | 'reject' | 'modify'; modification?: string }>(
    (resolve) => {
      userResponseCallback = resolve
      // 超时自动拒绝
      if (request.autoRevokeTimeout) {
        setTimeout(() => resolve({ decision: 'reject' }), request.autoRevokeTimeout * 1000)
      }
    }
  )
}
```

### 执行中暂停的实现

```typescript
// Agent 在执行关键步骤时暂停
interface AgentPausePoint {
  stepId: string
  stepName: string
  reason: string
  context: Record<string, any>
  resumeOptions: {
    continueAfterApproval: boolean  // 是否通过确认继续
    skipStep: boolean               // 是否可以跳过此步骤
    modifyInput: boolean            // 是否可以修改输入参数
  }
}

class AgentWorkflow {
  private pausePoints: AgentPausePoint[] = []

  async execute(config: { requireApproval: boolean }) {
    // 步骤 1：数据加载
    await this.loadData()
    // 步骤 2：分析处理（关键步骤，需要暂停）
    if (config.requireApproval) {
      await this.pauseForApproval({
        stepId: 'analysis',
        stepName: '数据分析',
        reason: '需要确认分析方向和参数',
        context: { dataSource: 'sales_2024.csv', metrics: ['revenue', 'growth'] },
        resumeOptions: { continueAfterApproval: true, skipStep: false, modifyInput: true },
      })
    }
    await this.runAnalysis()
    // 步骤 3：生成报告
    await this.generateReport()
  }

  private async pauseForApproval(pausePoint: AgentPausePoint) {
    this.pausePoints.push(pausePoint)
    // 发送暂停信号给前端
    emit('pause', pausePoint)
    // 等待前端用户决策
    const decision = await waitForUserDecision()
    if (decision.type === 'modify') {
      // 用户修改了输入参数
      this.updateConfig(decision.modifications)
    } else if (decision.type === 'skip') {
      return // 跳过此步骤
    }
  }
}
```

---

## 🔨 实战演练

### 练习：构建一个「邮件助手」的人机协作流程

**场景描述：** 你开发了一个 AI 邮件助手，它可以自动处理邮件（分类、回复、转发、存档）。但涉及「发送邮件」和「删除邮件」等高风险操作时，需要用户确认后才执行。

**你的任务：**
1. 实现三种 HITL 模式的审批界面
2. 高风险操作（删除）需要用户确认
3. 中风险操作（发送）在执行中暂停
4. 低风险操作（分类/存档）执行后审核

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```vue
<!-- EmailAgentApproval.vue -->
<script setup lang="ts">
import { ref } from 'vue'

type ActionType = 'delete' | 'send' | 'archive' | 'classify'
type HitlMode = 'pre_confirm' | 'mid_pause' | 'post_review'

interface PendingAction {
  id: string
  type: ActionType
  mode: HitlMode
  description: string
  preview: string
  isRisky: boolean
}

const pendingActions = ref<PendingAction[]>([])
const history = ref<Array<{ action: string; result: string }>>([])

// 模拟 Agent 自动处理邮件
function processEmails() {
  // 低风险：自动分类（执行后审核）
  pendingActions.value.push({
    id: '1', type: 'classify', mode: 'post_review',
    description: '将邮件「Q3 预算审批」归类为「财务」',
    preview: '发件人: finance@company.com\n主题: Q3 预算审批\n分类: 财务',
    isRisky: false,
  })

  // 中风险：发送邮件（执行中暂停）
  pendingActions.value.push({
    id: '2', type: 'send', mode: 'mid_pause',
    description: '回复邮件「会议邀请确认」',
    preview: '收件人: team@company.com\n正文: 收到，我会参加周一的会议。',
    isRisky: true,
  })

  // 高风险：删除邮件（确认前执行）
  pendingActions.value.push({
    id: '3', type: 'delete', mode: 'pre_confirm',
    description: '删除 3 封垃圾邮件',
    preview: '将永久删除以下邮件：\n- 广告：xxx\n- 通知：xxx\n- 推广：xxx',
    isRisky: true,
  })
}

function handleDecision(id: string, decision: 'approve' | 'reject' | 'modify') {
  const action = pendingActions.value.find(a => a.id === id)
  if (!action) return

  if (decision === 'approve') {
    history.value.push({ action: action.description, result: '✅ 已执行' })
  } else if (decision === 'reject') {
    history.value.push({ action: action.description, result: '🚫 已拒绝' })
  }

  pendingActions.value = pendingActions.value.filter(a => a.id !== id)
}
</script>

<template>
  <div class="email-agent">
    <div class="controls">
      <h3>📧 AI 邮件助手</h3>
      <button @click="processEmails" class="run-btn">
        🚀 模拟处理邮件
      </button>
    </div>

    <!-- 待处理审批列表 -->
    <div class="pending-list" v-if="pendingActions.length">
      <h4>⏳ 待处理操作 ({{ pendingActions.length }})</h4>

      <div v-for="action in pendingActions" :key="action.id"
        class="approval-card"
        :class="{ risky: action.isRisky, [action.mode]: true }"
      >
        <div class="card-header">
          <span class="mode-tag">
            {{ action.mode === 'pre_confirm' ? '🔐 确认前执行' :
               action.mode === 'mid_pause' ? '⏸️ 执行中暂停' : '📋 执行后审核' }}
          </span>
          <span v-if="action.isRisky" class="risk-badge">⚠️ 高风险</span>
        </div>

        <p class="description">{{ action.description }}</p>
        <pre class="preview">{{ action.preview }}</pre>

        <div class="actions">
          <template v-if="action.mode === 'post_review'">
            <button @click="handleDecision(action.id, 'approve')" class="primary">
              ✅ 确认
            </button>
            <button @click="handleDecision(action.id, 'reject')" class="danger">
              ❌ 退回
            </button>
          </template>
          <template v-else>
            <button @click="handleDecision(action.id, 'approve')" class="primary">
              ✅ 确认执行
            </button>
            <button @click="handleDecision(action.id, 'modify')" class="secondary">
              ✏️ 修改
            </button>
            <button @click="handleDecision(action.id, 'reject')" class="danger">
              🚫 拒绝
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- 执行历史 -->
    <div class="history" v-if="history.length">
      <h4>📜 执行记录</h4>
      <div v-for="(item, i) in history" :key="i" class="history-item">
        <span>{{ item.result }}</span>
        <span>{{ item.action }}</span>
      </div>
    </div>

    <p v-if="!pendingActions.length && !history.length" class="hint">
      点击「模拟处理邮件」按钮，查看三种 HITL 模式的审批流程。
    </p>
  </div>
</template>

<style scoped>
.email-agent { padding: 16px; border: 1px solid #e0e0e0; border-radius: 8px; }
.controls { display: flex; justify-content: space-between; align-items: center; }
.run-btn { padding: 8px 16px; background: #4a90d9; color: white; border: none; border-radius: 4px; cursor: pointer; }
.approval-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
}
.approval-card.risky {
  border-left: 4px solid #e74c3c;
}
.card-header { display: flex; gap: 8px; margin-bottom: 8px; }
.mode-tag { font-size: 12px; padding: 2px 8px; background: #f0f0f0; border-radius: 4px; }
.risk-badge { font-size: 12px; padding: 2px 8px; background: #fff0f0; color: #e74c3c; border-radius: 4px; }
.description { font-weight: 600; }
.preview {
  background: #fafafa;
  padding: 12px;
  border-radius: 4px;
  font-size: 13px;
  white-space: pre-wrap;
}
.actions { display: flex; gap: 8px; margin-top: 12px; }
button { padding: 6px 14px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; }
.primary { background: #27ae60; color: white; border-color: #27ae60; }
.danger { background: #e74c3c; color: white; border-color: #e74c3c; }
.secondary { background: #f39c12; color: white; border-color: #f39c12; }
.history-item {
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  gap: 12px;
  font-size: 14px;
}
.hint { color: #888; text-align: center; padding: 24px; }
</style>
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：审批超时自动降级

```typescript
// 用户 5 分钟未响应，自动拒绝高风险操作
const APPROVAL_TIMEOUT = 300000 // 5 分钟

const approvalTimer = setTimeout(() => {
  if (pendingAction.status === 'awaiting') {
    pendingAction.status = 'auto_rejected'
    notifyUser(`操作「${pendingAction.description}」因超时已自动拒绝`)
  }
}, APPROVAL_TIMEOUT)
```

### 技巧二：批量审批模式

```typescript
// 将多个类似操作合并为一次审批
function batchApproval(actions: ApprovalRequest[]) {
  return {
    type: 'batch',
    count: actions.length,
    summary: `将 ${actions.length} 封邮件归类为「财务」`,
    details: actions.map(a => a.description),
    // 用户一次确认 = 全部执行
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：什么操作必须使用「确认前执行」模式？**

> A：不可逆的高风险操作——删除数据、发送消息给客户、执行支付、修改权限。这些操作一旦执行无法撤回，必须让用户确认后再执行。一个简单判断标准：如果操作影响了真实世界（发消息、付钱、删数据），就必须用确认前执行。

**Q2：「执行中暂停」和「确认前执行」有什么区别？**

> A：确认前执行是在 Agent 执行任何操作之前先问用户。执行中暂停是 Agent 已经开始执行了，到某个关键步骤时停下来。前者适用于用户需要完全控制的操作，后者适用于用户已授权 Agent 但需要对特定步骤把关的场景。

**Q3：如何设计好的审批预览信息？**

> A：回答用户四个问题：(1) 要做什么？(2) 为什么做？(3) 影响什么？(4) 如果不做会怎样？预览信息要足够让用户做出决策，但又不能太多。一个简单模板：操作内容 + 对用户的影响 + 原始数据预览。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 所有操作混用同一审批模式 | 未按风险等级区分 | 高风险用确认前、中风险用执行中暂停、低风险用执行后审核 |
| 审批信息不完整 | 只告诉用户「要做什么」，没说「影响范围」 | 保证预览信息包含：操作内容 + 影响范围 + 原始数据 |
| 没有审批超时机制 | 用户离开后审批卡住，Agent 无法继续 | 设置 5 分钟超时自动拒绝或降级 |
| 批量修改时缺少撤销选项 | 用户误操作后无法撤回 | 所有操作都提供 undo 窗口（5-30 秒） |
| 频繁打断用户操作 | 连发邮件分类这种低风险操作都来问用户 | 低风险操作执行后审核，减少用户被打断次数 |

---

## 📝 本章小结

- ✅ **三种 HITL 模式** — 确认前执行、执行中暂停、执行后审核
- ✅ **风险分级** — 高风险操作必须确认前执行
- ✅ **审批预览** — 展示操作内容 + 影响范围 + 数据预览
- ✅ **自动超时** — 5 分钟超时自动拒绝，防止流程卡住
- ✅ **批量审批** — 合并同类操作，减少用户被打断次数

## ➡️ 下一章预告

> 本章学习了人机协作界面。在下一章中，我们将综合运用本章所学，构建一个完整的 Agent 控制台 UI——综合实战项目。
> [第5章：综合实战 — Agent 控制台](./05-capstone-dashboard.md)
