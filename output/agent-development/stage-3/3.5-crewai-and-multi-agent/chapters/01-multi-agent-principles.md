# 第1章：Multi-Agent 设计原则

> 预计学习时间：70-90 分钟

## 💡 核心概念

### Multi-Agent 的三大要素

```
角色定义（Role）    — 每个 Agent 擅长什么
任务分配（Task）    — 谁做什么
通信机制（Message） — Agent 之间如何交流
```

### 四种编排模式

```typescript
// 1. Pipeline（流水线）— 串行执行
// 研究员 → 写手 → 编辑
const pipeline = [researcher, writer, editor];

// 2. Debate（辩论）— 多个 Agent 对同一问题辩论
// 正方 Agent vs 反方 Agent → 裁判 Agent
const debaters = [proAgent, conAgent];
const judge = judgeAgent;

// 3. Voting（投票）— 多个 Agent 独立回答，取共识
const voters = [agent1, agent2, agent3];
const answer = majorityVote(voters);

// 4. Division of Labor（分工协作）— 并行处理
const workers = [agent1, agent2, agent3];
const results = await Promise.all(workers.map(a => a.execute(task)));
```

---

## 📝 本章小结

- ✅ **三大要素** — 角色、任务、通信
- ✅ **编排模式** — Pipeline、Debate、Voting、Division of Labor
