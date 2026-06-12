# 第4章：生产监控 — 实时监控 Agent 健康状态

> 预计学习时间：60-80 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **建立生产监控仪表盘** — 实时监控 Agent 的关键指标
- **配置告警规则** — 在 Agent 表现异常时及时通知
- **实现日志聚合和分析** — 从分散的日志中提取有价值的信息

## 📋 前置知识

> 建议先完成：
> - [第3章：可观测性工具](./03-observability-tools.md) — 了解 LangSmith 和 LangFuse 的基本使用

---

## 💡 核心概念

### 生产监控的关键指标

```typescript
interface ProductionMetrics {
  // 可用性
  uptime: number;              // 正常运行时间百分比
  errorRate: number;           // 错误率（%）
  successRate: number;         // 成功率（%）

  // 性能
  p50Latency: number;          // 中位延迟
  p95Latency: number;          // 95 分位延迟
  p99Latency: number;          // 99 分位延迟

  // 业务指标
  totalRequests: number;       // 总请求数
  activeUsers: number;         // 活跃用户数
  avgUserSatisfaction: number; // 用户满意度

  // 成本
  dailyCost: number;           // 每日 AI API 成本
  avgCostPerRequest: number;   // 每次请求平均成本
}

// 告警配置
interface AlertRule {
  metric: keyof ProductionMetrics;
  condition: '>' | '<' | '==' | '>=' | '<=';
  threshold: number;
  duration: number;       // 持续时间（秒）
  severity: 'info' | 'warning' | 'critical';
  notify: string[];       // 通知渠道
}
```

### 结构化日志

```typescript
interface AgentLogEntry {
  timestamp: string;
  requestId: string;
  userId: string;
  sessionId: string;
  type: 'llm_call' | 'tool_call' | 'error' | 'user_feedback';
  duration: number;
  tokens?: { prompt: number; completion: number };
  toolName?: string;
  toolSuccess?: boolean;
  error?: string;
}

// 日志收集器
class AgentLogger {
  private logBuffer: AgentLogEntry[] = [];
  private flushInterval = 5000; // 每 5 秒批量写入

  log(entry: AgentLogEntry) {
    this.logBuffer.push(entry);

    if (this.logBuffer.length >= 100) {
      this.flush();
    }
  }

  async flush() {
    if (this.logBuffer.length === 0) return;

    const batch = [...this.logBuffer];
    this.logBuffer = [];

    // 发送到日志服务
    await fetch('/api/logs/batch', {
      method: 'POST',
      body: JSON.stringify(batch),
    });
  }
}
```

---

## 🔨 实战演练

<details>
<summary>🧑‍💻 构建简单监控面板</summary>

```typescript
// monitor-panel.ts
class MonitorPanel {
  private metrics: ProductionMetrics;
  private alerts: AlertRule[];

  constructor() {
    this.metrics = this.loadMetrics();
    this.alerts = this.loadAlerts();
  }

  checkAlerts(): AlertRule[] {
    return this.alerts.filter(rule => {
      const currentValue = this.metrics[rule.metric];
      switch (rule.condition) {
        case '>': return currentValue > rule.threshold;
        case '<': return currentValue < rule.threshold;
        default: return false;
      }
    });
  }

  getStatus(): 'healthy' | 'warning' | 'critical' {
    const activeAlerts = this.checkAlerts();
    if (activeAlerts.some(a => a.severity === 'critical')) return 'critical';
    if (activeAlerts.some(a => a.severity === 'warning')) return 'warning';
    return 'healthy';
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：SLA 仪表盘

```typescript
interface SLAConfig {
  uptime: { target: 0.999 }               // 99.9% 可用性
  p95Latency: { target: 3000 }            // 95% 请求在 3 秒内
  errorRate: { target: 0.01 }             // 错误率 < 1%
  costPerUser: { target: 0.05 }           // 每用户成本 < $0.05
}

function checkSLA(metrics: ProductionMetrics, sla: SLAConfig) {
  const violations = []
  if (metrics.uptime < sla.uptime.target) violations.push('可用性不达标')
  if (metrics.p95Latency > sla.p95Latency.target) violations.push('延迟不达标')
  if (metrics.errorRate > sla.errorRate.target) violations.push('错误率不达标')
  return violations
}
```

### 技巧二：用户行为追踪

```typescript
// 追踪用户与 Agent 的交互模式
interface UserInteraction {
  userId: string
  sessionCount: number
  avgMessagesPerSession: number
  avgSatisfaction: number
  topQueries: string[]
  churnRisk: 'low' | 'medium' | 'high'
}

function calculateChurnRisk(user: UserInteraction): string {
  if (user.sessionCount < 3) return 'low'           // 新用户，还未建立习惯
  if (user.avgSatisfaction < 3) return 'high'       // 满意度低，可能流失
  if (user.sessionCount > 20 && user.avgSatisfaction > 4) return 'low'  // 忠诚用户
  return 'medium'
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：P50、P95、P99 延迟分别关注什么？**

> A：P50（中位延迟）反映「大多数用户的体验」；P95 反映「较差的用户体验」——95% 的请求在这个时间内完成；P99 反映「极端情况」。在 Agent 监控中，更重要的是 P95 和 P99，因为 LLM 调用的延迟波动很大。

**Q2：告警应该设置多敏感？**

> A：不推荐基于单次异常触发告警（噪音太大）。建议：连续 5 分钟超过阈值、且至少有 100 个请求样本时才触发。告警级别分级：info（通知群）、warning（@值班人）、critical（电话通知）。

**Q3：如何判断 Agent 质量在退化？**

> A：设置「用户追问率」指标——如果用户需要多次追问才能得到满意答案，说明 Agent 质量在下降。同时对比基线：任务完成率下降 >5% 视为退化。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 告警太频繁导致团队疲劳 | 阈值设置过低，或基于单次异常触发 | 设置持续时间和最小样本量，分级告警 |
| 监控面板的指标太多 | 没有聚焦关键指标 | 只保留 5-8 个核心指标，按业务场景分组 |
| 日志不够结构化 | 纯文本日志难以聚合和分析 | 使用 JSON 格式的结构化日志 |
| 没有设置基线对比 | 无法判断当前指标是好是坏 | 每次版本发布后更新基线，与基线对比展示 |
| 用户反馈数据缺失 | 前端未实现评价收集 UI | 在每次 Agent 回复后嵌入简单的评价按钮 |

---

## 📝 本章小结

- ✅ **生产监控指标** — 可用性、性能、业务、成本四类指标
- ✅ **告警规则** — 基于阈值的多级告警
- ✅ **日志聚合** — 结构化日志批量写入

## ➡️ 下一章预告

> [第5章：成本优化](./05-cost-optimization.md)
