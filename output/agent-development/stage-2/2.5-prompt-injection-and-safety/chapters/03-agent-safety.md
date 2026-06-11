# 第3章：Agent 安全设计 — 工具权限与沙箱

> 预计学习时间：70-90 分钟

## 💡 核心概念

### 工具调用权限控制

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

### 敏感操作审批流程

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

### 输出内容审核

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

## 📝 本章小结

- ✅ **工具权限** — 按工具粒度控制调用权限
- ✅ **审批流程** — 敏感操作需人工确认
- ✅ **输出审核** — 检查输出中的有害内容
- ✅ **沙箱执行** — 限制工具的系统级权限
