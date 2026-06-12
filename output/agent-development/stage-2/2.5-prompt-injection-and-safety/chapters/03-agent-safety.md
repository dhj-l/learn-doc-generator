# 第3章：Agent 安全设计 — 工具权限与沙箱

> 预计学习时间：70-90 分钟

## 🎯 本章目标

- 理解 AI Agent 安全设计的核心挑战：能力越大，风险越大
- 掌握沙箱化（Sandboxing）执行环境的实现原理
- 学会设计人机协作（Human-in-the-Loop, HITL）审批流程
- 理解工具调用中的权限隔离和上下文隔离
- 掌握 Agent 输出内容审核的最佳实践

## 📋 前置知识

- 第1章：Prompt Injection 攻击分类（理解 Agent 面临的主要威胁）
- 第2章：四层防御体系（理解防御的全局框架）
- 基本的 TypeScript 异步编程知识
- 了解 Function Calling / Tool Use 的基本概念

## 💡 核心概念

### Agent 安全的三大挑战

AI Agent（相比单纯的对话模型）面临三个额外的安全挑战：

```
┌─────────────────────────────────────────────────────┐
│                     AI Agent                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐        │
│  │   LLM     │──▶│  Tool    │──▶│  External │        │
│  │   Model   │   │  Executor│   │  Systems  │        │
│  └──────────┘   └──────────┘   └──────────┘        │
│        │              │               │              │
│        ▼              ▼               ▼              │
│  ⚠️ Prompt     ⚠️ 工具权限    ⚠️ 外部系统      │
│     Injection     越界调用      联动攻击       │
└─────────────────────────────────────────────────────┘
```

1. **Prompt Injection → 工具劫持** — 注入指令导致 Agent 调用非预期的工具
2. **权限越界** — Agent 使用合法工具执行意外操作（如 search 工具被用于搜索敏感文件）
3. **连锁攻击** — 间接注入通过 Agent 的工具链触发多米诺效应

### 工具调用权限控制

```typescript
class SecureToolExecutor {
  private permissions: Map<string, ToolPermission>;
  private callCounts: Map<string, number> = new Map();
  private contextStack: string[] = [];  // 追踪调用上下文

  async execute(toolName: string, input: any): Promise<string> {
    const permission = this.permissions.get(toolName);
    if (!permission) return `错误: 工具 ${toolName} 未授权`;

    // 检查调用次数限制
    const count = this.callCounts.get(toolName) || 0;
    if (count >= permission.maxCallsPerSession) {
      return `错误: 工具 ${toolName} 调用次数已达上限`;
    }

    // 检查速率限制
    if (permission.rateLimit) {
      const recentCalls = this.getRecentCalls(toolName, permission.rateLimit.windowMs);
      if (recentCalls >= permission.rateLimit.maxCalls) {
        return `错误: 工具 ${toolName} 请求过于频繁，请稍后重试`;
      }
    }

    // 检查目标白名单
    if (permission.allowedTargets && input.target) {
      if (!permission.allowedTargets.includes(input.target)) {
        return `错误: 目标 ${input.target} 不在允许列表中`;
      }
    }

    // 需要人工确认的工具
    if (permission.requiresApproval) {
      const approved = await requestHumanApproval(toolName, input);
      if (!approved) return '操作已被用户拒绝';
    }

    this.callCounts.set(toolName, count + 1);
    this.contextStack.push(toolName);
    
    try {
      return await this.safeExecute(toolName, input);
    } finally {
      this.contextStack.pop();
    }
  }

  private async safeExecute(toolName: string, input: any): Promise<string> {
    // 在沙箱环境中执行
    // 限制文件系统访问、网络访问等
    return await sandboxedExecute(toolName, input);
  }
}
```

### 沙箱化执行（Sandboxing）

沙箱化是将 Agent 的工具执行限制在一个受控环境中的技术。它的核心原则是：**即使工具代码被恶意利用，也不能影响宿主系统。**

```typescript
// 沙箱环境配置
interface SandboxConfig {
  // 文件系统限制
  allowedPaths: string[];
  readOnly: boolean;
  maxFileSize: number;
  
  // 网络限制
  allowedHosts: string[];
  allowedPorts: number[];
  maxRequests: number;
  
  // 资源限制
  maxMemory: number;        // MB
  maxCpuTime: number;       // ms
  maxOutputSize: number;    // KB
  timeout: number;          // ms
  
  // 系统调用限制
  allowExec: boolean;       // 禁止执行子进程
  allowNetwork: boolean;    // 是否允许网络
  allowFilesystem: boolean; // 是否允许文件系统
}

// 沙箱执行器
class SandboxedExecutor {
  private config: SandboxConfig;

  async execute(toolName: string, input: any): Promise<string> {
    const sandboxId = crypto.randomUUID();
    
    // 创建隔离上下文
    const context = {
      sandboxId,
      startTime: Date.now(),
      memoryUsed: 0,
      networkCalls: [],
    };

    // 设置执行超时
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('执行超时')), this.config.timeout);
    });

    try {
      const result = await Promise.race([
        this.runInSandbox(toolName, input, context),
        timeoutPromise,
      ]);
      return result;
    } catch (error) {
      return `沙箱执行错误: ${error.message}`;
    }
  }

  private async runInSandbox(toolName: string, input: any, context: any): Promise<string> {
    // 在实际实现中，这里会：
    // 1. 使用 VM2 或 Worker Threads 创建隔离的 JavaScript 运行环境
    // 2. 限制 global 对象的访问
    // 3. 拦截 fs、net、child_process 等模块
    // 4. 注入自定义的、受限的 API
    // 5. 监控资源使用
    
    // 伪代码示例：
    // const vm = new VM({
    //   timeout: this.config.timeout,
    //   sandbox: {
    //     fs: createRestrictedFS(this.config.allowedPaths),
    //     http: createRestrictedHTTP(this.config.allowedHosts),
    //     console: createAuditedConsole(context.sandboxId),
    //   },
    // });
    // return await vm.run(toolCode);
    
    return '沙箱执行结果';
  }
}
```

### 人机协作（Human-in-the-Loop）

HITL 是 Agent 安全中最重要的原则之一。**关键操作必须有人类的明确授权才能执行。**

```typescript
// 人机协作确认 — 完整版
interface ApprovalRequest {
  id: string;
  toolName: string;
  input: any;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  context: {
    conversationId: string;
    turnNumber: number;
    previousActions: string[];
  };
  timestamp: Date;
  expiresAt: Date;  // 审批超时
}

// 分级审批策略
const approvalStrategy = {
  low: {
    requiresApproval: false,
    loggingLevel: 'info',
  },
  medium: {
    requiresApproval: true,
    timeout: 300000,     // 5 分钟
    allowedApprovers: ['user'],
  },
  high: {
    requiresApproval: true,
    timeout: 600000,     // 10 分钟
    allowedApprovers: ['user', 'admin'],
    requiresReason: true, // 需要用户输入理由
  },
  critical: {
    requiresApproval: true,
    timeout: 1200000,    // 20 分钟
    allowedApprovers: ['admin'],
    requiresReason: true,
    requireMfa: true,     // 多因素认证
  },
};

async function requestHumanApproval(
  action: string,
  details: any,
  riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium'
): Promise<boolean> {
  // 在前端显示确认对话框
  console.log(`\n⚠️ Agent 请求执行敏感操作:`);
  console.log(`  危险等级: ${riskLevel}`);
  console.log(`  操作: ${action}`);
  console.log(`  参数: ${JSON.stringify(details)}`);

  // 根据风险等级决定是否需要详细确认
  if (riskLevel === 'critical') {
    console.log(`  🔐 需要管理员双因素认证`);
  }

  // 实际实现中通过前端 UI 获取用户确认
  return true; // 简化
}
```

### 输出内容审核

```typescript
async function contentModeration(output: string): Promise<{
  safe: boolean;
  categories: string[];
  details?: string;
}> {
  const categories: string[] = [];

  // PII 检测
  if (containsPersonalInfo(output)) {
    categories.push('pii');
  }

  // 毒性内容
  if (containsToxicContent(output)) {
    categories.push('toxic');
  }

  // 错误信息（Misinformation）
  if (containsMisinformation(output)) {
    categories.push('misinformation');
  }

  // 代码注入（XSS/SQLi）
  if (containsCodeInjection(output)) {
    categories.push('code_injection');
  }

  // 指令重复 Agent 不应复述的指令
  if (containsRestrictedInstructions(output)) {
    categories.push('instruction_leak');
  }

  return { 
    safe: categories.length === 0, 
    categories,
    details: categories.length > 0 
      ? `检测到问题类别: ${categories.join(', ')}` 
      : undefined,
  };
}

// 辅助检测函数
function containsPersonalInfo(text: string): boolean {
  const patterns = [
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,     // 手机号
    /\b[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/, // 邮箱
    /\b\d{18}[\dXx]\b/,                     // 身份证
  ];
  return patterns.some(p => p.test(text));
}

function containsCodeInjection(text: string): boolean {
  const patterns = [
    /<script[\s>]/i,
    /javascript:/i,
    /on\w+\s*=\s*"/i,
    /DROP\s+TABLE/i,
    /UNION\s+SELECT/i,
  ];
  return patterns.some(p => p.test(text));
}
```

---

## 🔨 实战演练

### 场景描述

你正在为一家金融科技公司设计 Agent 安全系统。该 Agent 可以执行以下操作：
1. 查询客户账户余额和交易记录（只读）
2. 发起**内部转账**（需要客户确认）
3. 修改客户联系方式（需要双因素认证）
4. 生成交易报告（只读）

Agent 需要通过第三方 API 获取汇率信息（外部数据源，存在间接注入风险）。

### 你的任务

1. 为每个工具设计权限控制策略（工具、操作、范围、审批等级）
2. 为"内部转账"工具实现人机协作审批流程
3. 为汇率查询 API 的响应实现沙箱化，防止间接注入
4. 实现输出审核，防止 Agent 泄露其他客户的信息

<details>
<summary>💡 参考思路</summary>

```typescript
// 金融 Agent 权限配置
const financePermissions: ToolPermission[] = [
  // 只读查询 — 低风险
  {
    toolName: 'query_account',
    allowedActions: ['get_balance', 'get_transactions'],
    requiresApproval: false,
    maxCallsPerSession: 100,
    rateLimit: { windowMs: 60000, maxCalls: 30 },
    allowedTargets: ['accounts'], // 限定数据库表
  },
  // 转账 — 高风险，需要审批 + 双因素
  {
    toolName: 'transfer_money',
    allowedActions: ['internal_transfer'],
    requiresApproval: true,
    maxCallsPerSession: 5,
    rateLimit: { windowMs: 60000, maxCalls: 1 },
    allowedTargets: ['same_bank'], // 只允许行内转账
    // 审批流程: 用户确认 → OTP 验证
  },
  // 汇率查询 — 高风险（外部数据源）
  {
    toolName: 'fetch_exchange_rate',
    allowedActions: ['get_rate'],
    requiresApproval: false,
    maxCallsPerSession: 50,
    rateLimit: { windowMs: 60000, maxCalls: 10 },
    // 对响应进行沙箱化处理
    sandboxResponse: true,  // 过滤外部数据源可能的注入
  },
];

// 沙箱化外部响应
function sandboxExternalResponse(response: any): any {
  // 1. 只提取预期字段
  const safeResponse = {
    rate: response.rate ?? response.exchange_rate ?? null,
    currency: response.currency ?? response.from ?? null,
    timestamp: response.timestamp ?? Date.now(),
  };
  
  // 2. 移除所有非预期字段（可能包含隐藏注入）
  // 3. 验证字段类型和范围
  if (typeof safeResponse.rate !== 'number' || safeResponse.rate <= 0) {
    return { error: '无效的汇率数据' };
  }
  
  return safeResponse;
}
```
</details>

---

## ⚡ 进阶技巧

### 1. 使用上下文感知的调用追踪检测异常链

```typescript
// 追踪 Agent 的工具调用链，检测异常模式
class CallChainAnalyzer {
  private callGraph: Map<string, CallNode[]> = new Map();
  
  detectAnomalousChain(context: ExecutionContext): boolean {
    const recentCalls = this.callGraph.get(context.sessionId) || [];
    
    // 检测模式 1: 短时间内调用大量不同工具
    if (new Set(recentCalls.map(c => c.tool)).size > 5 && 
        recentCalls.length < 10) {
      return true; // 可能是指令注入了"尝试所有工具"
    }
    
    // 检测模式 2: 读写工具的不合理组合
    const hasRead = recentCalls.some(c => c.type === 'read');
    const hasWrite = recentCalls.some(c => c.type === 'write');
    if (hasRead && hasWrite && recentCalls.length < 3) {
      return true; // 读后立即写，可能是数据窃取
    }
    
    return false;
  }
}
```

### 2. 实现工具调用超时 + 回滚机制

```typescript
// 为每个工具调用设置超时和回滚
interface ToolTransaction {
  id: string;
  toolName: string;
  input: any;
  timestamp: Date;
  status: 'pending' | 'committed' | 'rolled_back';
  rollbackFn?: () => Promise<void>;  // 回滚函数
}

class TransactionalExecutor {
  private transactions: ToolTransaction[] = [];

  async executeWithRollback(
    toolName: string, 
    input: any, 
    rollbackFn: () => Promise<void>
  ): Promise<string> {
    const tx: ToolTransaction = {
      id: crypto.randomUUID(),
      toolName,
      input,
      timestamp: new Date(),
      status: 'pending',
      rollbackFn,
    };
    
    try {
      const result = await this.executeWithTimeout(toolName, input);
      tx.status = 'committed';
      return result;
    } catch (error) {
      tx.status = 'rolled_back';
      if (rollbackFn) await rollbackFn();
      throw error;
    } finally {
      this.transactions.push(tx);
    }
  }
}
```

### 3. 使用隔离的 Agent 工作空间（Workspace Isolation）

```typescript
// 每个用户会话创建独立的 Agent 工作空间
class AgentWorkspace {
  private workspaceId: string;
  private sessionToken: string;
  
  constructor(userId: string) {
    // 每个会话生成独立的凭证
    this.workspaceId = `ws_${crypto.randomUUID()}`;
    this.sessionToken = crypto.randomUUID();
    
    // 创建临时目录（会话结束后清理）
    // 创建数据库临时 Schema
    // 分配独立的 API 调用配额
  }
  
  async cleanup(): Promise<void> {
    // 删除临时文件
    // 回收数据库 Schema
    // 撤销 API Token
  }
}
```

---

## 🧠 知识检查点

### Q1: 为什么 Agent 安全比纯对话 LLM 安全更具挑战性？

<details>
<summary>查看答案</summary>

**因为 Agent 具有"行动能力"（Agency），而不仅仅是"生成能力"。** 具体挑战包括：

1. **工具调用权** — Agent 可以调用外部工具（数据库、API、文件系统），注入指令可能导致实际的操作后果（如转账、删文件）
2. **间接注入面扩大** — Agent 读取的所有外部数据（网页、文档、API 响应）都可能携带注入指令
3. **攻击链连锁** — 一次成功的注入可能触发多个工具的顺序调用，产生放大效应
4. **审计复杂度** — Agent 执行的每一步都需要审计（工具调用链），而不仅仅是对话记录
5. **回滚困难** — 对话中的错误回复可以撤回，但工具调用（如发送邮件）无法撤回
</details>

### Q2: 什么是沙箱化（Sandboxing）？在 Agent 安全中如何应用？

<details>
<summary>查看答案</summary>

沙箱化是将代码或进程执行限制在一个隔离的环境中的技术。在 Agent 安全中，沙箱化应用于以下层面：

1. **执行环境隔离** — 工具代码在独立的 VM/Worker Thread 中运行，无法访问宿主系统的资源
2. **文件系统隔离** — Agent 只能访问指定目录，且通常是只读的
3. **网络隔离** — Agent 只能访问白名单中的域名和端口
4. **资源限制** — 限制 CPU、内存、执行时间，防止 DoS 攻击
5. **语义隔离** — 外部数据源的响应被严格"净化"，只保留预期的字段和类型

**关键原则：沙箱应该是"默认拒绝"的——任何未明确授权的操作都应该被禁止。**
</details>

### Q3: Human-in-the-Loop（HITL）的三种主要模式是什么？

<details>
<summary>查看答案</summary>

三种主要模式：

1. **事先审批（Proactive Approval）** — Agent 在执行操作前询问用户确认。适用于高风险操作（转账、发邮件、删文件）。

2. **事后审核（Reactive Audit）** — Agent 自动执行操作，但所有操作都记录在审计日志中供后续审查。适用于低风险操作（搜索、读取知识库）。

3. **分级授权（Tiered Authorization）** — 根据操作的风险等级使用不同的审批策略：
   - **低风险**：自动执行，仅记录日志
   - **中风险**：用户一键确认
   - **高风险**：用户确认 + 输入原因
   - **严重风险**：管理员审批 + 双因素认证

**选择原则：风险和效率的平衡——过度审批会降低用户体验，过少审批会带来安全风险。**
</details>

---

## 🐛 常见错误

| 错误 | 后果 | 正确做法 |
|------|------|----------|
| Agent 工具调用没有超时限制 | 恶意代码执行死循环或发起 DoS 攻击 | 为所有工具调用设置合理的超时时间（通常 5-30 秒） |
| 所有工具使用同一个 API Token | 任意工具都能访问所有资源 | 每个工具使用独立的、权限受限的凭证 |
| 直接信任外部数据源的响应 | 间接注入通过第三方数据渗透 Agent | 对所有外部响应进行"净化"（只提取预期字段和类型） |
| 审批流程设计为先执行后确认 | 操作在用户拒绝前就已经完成 | 高风险操作必须**事先阻塞等待**确认 |

---

## 📝 本章小结

- ✅ **Agent 安全的三大挑战** — 工具劫持、权限越界、连锁攻击，远超纯对话模型的风险面
- ✅ **沙箱化执行** — 通过隔离执行环境、文件系统、网络和资源限制，限制攻击的损害范围
- ✅ **人机协作（HITL）** — 分级审批策略，从一键确认到双因素认证，平衡安全与效率
- ✅ **上下文感知的调用链检测** — 监控工具调用模式，检测异常行为链
- ✅ **事务性执行和回滚** — 为关键操作提供失败回滚能力，减少不可逆的损害
- ✅ **外部数据源净化** — 对第三方响应进行严格字段提取和类型验证，防止间接注入

## ➡️ 下一章预告

> [第4章：Guardrails 框架 — 安全护栏](./04-guardrails.md)
>
> 下一章将介绍成熟的 Guardrails 框架（NeMo、Guardrails AI、LLM Guard）以及如何将它们集成到你的 Agent 安全体系中，实现开箱即用的安全防护。
