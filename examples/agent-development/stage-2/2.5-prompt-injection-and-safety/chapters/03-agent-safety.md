# 第3章：Agent 安全设计 — 工具权限与沙箱

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **实现工具权限控制** — 按工具粒度限制 Agent 的调用权限
- **设计敏感操作审批流程** — 高危险操作需要人工确认
- **实施输出审核机制** — 确保 Agent 输出内容安全合规

## 📋 前置知识

> 建议先了解防御策略的基础知识，推荐先完成：
> - [第2章：防御策略](./02-defense-strategies.md) 了解四层防御体系

---

## 💡 核心概念

### 概念一：工具权限控制

**生活类比：** 你把房子钥匙给你朋友（Agent），但你不是给他所有钥匙——他只有客厅钥匙（搜索工具），厨房可以进但不能用刀（只读权限），卧室门锁着（高危险操作需审批）。这就是权限最小化。

```typescript
class SecureToolExecutor {
  private permissions: Map<string, ToolPermission>;
  private callCounts: Map<string, number> = new Map();

  async execute(toolName: string, input: any): Promise<string> {
    const permission = this.permissions.get(toolName);
    if (!permission) return `错误: 工具 ${toolName} 未授权`;

    // 检查调用次数限制
    const count = this.callCounts.get(toolName) || 0;
    if (count >= permission.maxCallsPerSession) {
      return `错误: 工具 ${toolName} 调用次数已达上限`;
    }

    // 需要人工确认的工具
    if (permission.requiresApproval) {
      const approved = await requestHumanApproval(toolName, input);
      if (!approved) return '操作已被用户拒绝';
    }

    this.callCounts.set(toolName, count + 1);
    return await this.safeExecute(toolName, input);
  }

  private async safeExecute(toolName: string, input: any): Promise<string> {
    // 在沙箱环境中执行
    // 限制文件系统访问、网络访问等
    return await sandboxedExecute(toolName, input);
  }
}
```

**💡 为什么需要调用次数限制？** 即使 Agent 只有只读工具的权限，如果它可以无限调用，攻击者可以利用它做大量外部请求（如调用搜索 API 上万次），造成经济损失或 DDoS 下游服务。限制次数和频率是成本控制也是安全措施。

### 概念二：敏感操作审批流程

```typescript
// 人机协作确认
async function requestHumanApproval(
  action: string,
  details: any
): Promise<boolean> {
  // 在前端显示确认对话框
  console.log(`\n⚠️ Agent 请求执行敏感操作:`);
  console.log(`  操作: ${action}`);
  console.log(`  参数: ${JSON.stringify(details)}`);
  console.log(`  请输入 y 确认，n 拒绝：`);

  // 实际实现中通过前端 UI 获取用户确认
  return true; // 简化
}
```

**💡 为什么审批流程不能是「永远同意」？** 如果用户总是机械地点击确认，审批就失去了意义。好的设计是：1) 初始操作默认拒绝；2) 每次请求都清楚显示操作内容和影响；3) 提供「本次会话允许」和「永久允许」的区分。

### 概念三：输出内容审核

```typescript
async function contentModeration(output: string): Promise<{
  safe: boolean;
  categories: string[];
}> {
  // 检查输出是否包含有害内容
  const categories = [];

  if (containsPersonalInfo(output)) categories.push('pii');
  if (containsToxicContent(output)) categories.push('toxic');
  if (containsMisinformation(output)) categories.push('misinformation');

  return { safe: categories.length === 0, categories };
}
```

---

## 🔨 实战演练

**场景描述：** 你的团队正在开发一个企业级 AI 助手，它可以访问公司内部的文档、邮件和数据库。但安全团队要求：邮件只能发送不能删除，数据库只能查询不能修改，任何涉及财务数据的操作都需要经理审批。

**你的任务：**
1. 为 AI 助手的每个工具定义权限（工具类型、允许操作、是否需要审批）
2. 实现权限检查逻辑，确保 Agent 不能越权操作
3. 实现敏感操作的人机审批流程

<details>
<summary>🧑‍💻 先自己实现权限系统，再展开看参考答案</summary>

```typescript
// 完整的权限控制实现
interface ToolPolicy {
  toolName: string;
  allowedOperations: string[];
  rateLimit: { maxCalls: number; windowMs: number };
  requiresApproval: boolean;
  approvalExpiresMs: number;
}

class PermissionManager {
  private policies = new Map<string, ToolPolicy>();
  private callLog = new Map<string, number[]>();
  private approvals = new Map<string, number>(); // toolName -> expiry timestamp

  setPolicy(policy: ToolPolicy) {
    this.policies.set(policy.toolName, policy);
  }

  async checkAndExecute(toolName: string, operation: string): Promise<boolean> {
    const policy = this.policies.get(toolName);
    if (!policy) return false;

    // 检查操作权限
    if (!policy.allowedOperations.includes(operation) && !policy.allowedOperations.includes('*')) {
      console.log(`❌ ${toolName}: 操作 ${operation} 未授权`);
      return false;
    }

    // 检查频率限制
    const now = Date.now();
    const calls = (this.callLog.get(toolName) || []).filter(t => now - t < policy.rateLimit.windowMs);
    if (calls.length >= policy.rateLimit.maxCalls) {
      console.log(`❌ ${toolName}: 超过速率限制`);
      return false;
    }

    // 检查审批
    if (policy.requiresApproval) {
      const expiresAt = this.approvals.get(toolName) || 0;
      if (now > expiresAt) {
        const approved = await requestHumanApproval(toolName, { operation });
        if (!approved) return false;
        this.approvals.set(toolName, now + policy.approvalExpiresMs);
      }
    }

    this.callLog.set(toolName, [...calls, now]);
    return true;
  }
}

// 测试
const pm = new PermissionManager();
pm.setPolicy({
  toolName: 'email',
  allowedOperations: ['send', 'read'],
  rateLimit: { maxCalls: 10, windowMs: 60000 },
  requiresApproval: true,
  approvalExpiresMs: 300000,
});

console.log(await pm.checkAndExecute('email', 'send')); // true (需审批)
console.log(await pm.checkAndExecute('email', 'delete')); // false
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：分级权限体系

```typescript
// 根据用户角色动态调整权限
function getPermissionsForRole(role: 'admin' | 'user' | 'auditor'): ToolPolicy[] {
  const basePolicies = getBasePolicies();
  if (role === 'admin') return basePolicies.map(p => ({ ...p, requiresApproval: false }));
  if (role === 'auditor') return basePolicies.filter(p => p.toolName === 'search');
  return basePolicies; // 普通用户标准权限
}
```

### 技巧二：审计日志

```typescript
// 记录所有工具调用的审计日志
async function auditLog(entry: {
  agentId: string;
  toolName: string;
  input: string;
  output: string;
  approved: boolean;
  timestamp: number;
}) {
  await db.collection('audit_logs').insertOne(entry);
  // 特定高风险操作触发实时告警
  if (['delete', 'write', 'execute'].includes(entry.toolName)) {
    await sendAlert(entry);
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Agent 安全设计和传统 API 安全设计有什么不同？**

> A：传统 API 安全假设调用者是「有意图的执行者」，权限在调用前检查一次即可。Agent 安全更复杂——Agent 可能被注入攻击操纵去调用它原本不会调用的工具。所以需要运行时动态权限检查、调用频率限制、操作内容审核等多层防护。

**Q2：为什么需要「审批过期时间」？**

> A：防止「一次审批，永久使用」。如果用户审批了发送一封邮件，半小时后 Agent 又在发另一封（可能被劫持了），不应该自动通过。设置审批过期时间（如 5 分钟）确保每次敏感操作都在用户知情下执行。

**Q3：沙箱执行所有工具调用是否可行？**

> A：不是所有场景都可行。沙箱可以限制文件系统和网络访问，但对 AI Agent 的核心能力（如调用 LLM API）沙箱效果有限。建议对系统级操作（文件读写、命令执行）使用沙箱，对 API 调用使用权限控制。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 权限粒度太粗（所有工具同等对待） | 图省事统一配置 | 为每个工具单独定义权限策略，高风险工具收紧 |
| 没有审计日志，出问题无法追溯 | 最小化实现忽略了日志 | 所有工具调用写入审计日志，高风险操作实时告警 |
| 审批流程中用户盲目点击确认 | 审批信息不够清晰 | 显示操作的影响范围和风险等级，帮助用户判断 |
| 速率限制只在单进程实现 | 多实例部署时限制失效 | 使用 Redis 等共享存储实现分布式速率限制 |
| 沙箱配置过于严格导致正常功能不可用 | 安全团队和生产团队的博弈失衡 | 对每个工具评估「最小必要权限」，合理配置白名单 |

---

## 📝 本章小结

- ✅ **工具权限** — 按工具粒度控制调用权限
- ✅ **审批流程** — 敏感操作需人工确认，有过期机制
- ✅ **输出审核** — 检查输出中的有害内容
- ✅ **沙箱执行** — 限制工具的系统级权限
- ✅ **审计日志** — 所有调用可追溯

## ➡️ 下一章预告

> [第4章：Guardrails 框架](./04-guardrails.md)
