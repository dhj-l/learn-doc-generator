# 第7章：综合实战 — 多 Agent 研究助手系统

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **综合运用 LangGraph 全部核心概念** — State、Node、Edge、Subgraph、Checkpoint
- **构建完整的 Supervisor + Specialist 多 Agent 系统** — 真实世界的 Agent 协作
- **实现研究流程** — 规划→搜索→分析→写作的端到端流水线
- **掌握生产级实践** — 错误处理、日志、配置管理

---

## 💡 项目概述

### 概念一：系统架构

**生活类比：** 这个系统就像一家小型研究咨询公司。项目经理（Supervisor）接到客户需求后，制定研究计划，分配给研究员（Research Specialist）搜集资料，数据分析师（Analysis Specialist）处理数据，撰稿人（Writing Specialist）撰写报告，最后由项目经理汇总交付。

```
                     ┌─────────────────────────────┐
                     │        用户输入研究问题       │
                     └────────────┬────────────────┘
                                  │
                     ┌────────────▼────────────────┐
                     │    Supervisor Agent         │
                     │  - 理解需求 / 制定计划       │
                     │  - 分配任务 / 汇总结果       │
                     └──┬──────────┬──────────┬────┘
                        │          │          │
              ┌─────────▼──┐ ┌─────▼────┐ ┌──▼──────────┐
              │  Research  │ │ Analysis │ │   Writing    │
              │  Specialist│ │ Specialist│ │  Specialist  │
              │  搜索/收集  │ │ 分析/整理 │ │  撰写/格式化 │
              └─────────┬──┘ └─────┬────┘ └──┬──────────┘
                        │          │          │
                        └──────────┼──────────┘
                                   │
                     ┌────────────▼────────────────┐
                     │        最终研究报告输出       │
                     └─────────────────────────────┘
```

> **💡 为什么这样设计？**
>
> 将研究任务拆分为搜索、分析、写作三个阶段，符合人类研究工作流的自然规律。Supervisor 作为"项目经理"协调全局，每个 Specialist Agent 专注自身领域，既保证了专业性，又通过 Supervisor 保持了整体一致性。

---

## 🏗 系统实现

### 概念二：状态定义与模型

```typescript
import { StateGraph, START, END, Annotation, MemorySaver } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';

// ============ 研究系统状态 ============
const ResearchState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, curr) => [...prev, ...curr], default: () => [],
  }),
  researchPlan: Annotation<string[]>({
    reducer: (prev, curr) => curr, default: () => [],
  }),
  currentPhase: Annotation<string>({
    reducer: (_, curr) => curr, default: () => 'planning',
  }),
  searchResults: Annotation<string[]>({
    reducer: (prev, curr) => [...prev, ...curr], default: () => [],
  }),
  analysisResults: Annotation<string>({
    reducer: (_, curr) => curr, default: () => '',
  }),
  draftReport: Annotation<string>({
    reducer: (_, curr) => curr, default: () => '',
  }),
  finalReport: Annotation<string>({
    reducer: (_, curr) => curr, default: () => '',
  }),
  iterationCount: Annotation<number>({
    reducer: (prev, curr) => prev + curr, default: () => 0,
  }),
  errors: Annotation<string[]>({
    reducer: (prev, curr) => [...prev, ...curr], default: () => [],
  }),
});
type RS = typeof ResearchState.State;

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022', temperature: 0.2 });
```

### 概念三：Supervisor 节点

```typescript
async function supervisorNode(state: RS) {
  const lastUserMsg = state.messages.filter(m => m._getType() === 'human').pop();

  if (state.currentPhase === 'planning') {
    // 制定研究计划
    const response = await model.invoke([
      new SystemMessage(`你是研究项目经理。为用户需求制定3-6个具体研究步骤。
输出JSON数组：["步骤1：...","步骤2：...",...]
第一步通常是资料搜索，最后一步是撰写报告。`),
      new HumanMessage(lastUserMsg?.content || '请制定计划'),
    ]);
    try {
      const plan = JSON.parse(response.content as string);
      return {
        researchPlan: plan,
        currentPhase: 'research',
        messages: [new AIMessage(`📋 计划制定完成，共 ${plan.length} 步`)],
      };
    } catch {
      return { researchPlan: ['搜索资料', '整理分析', '撰写报告'], currentPhase: 'research' };
    }
  }

  if (state.currentPhase === 'research') return { currentPhase: 'analysis', messages: [new AIMessage('进入分析阶段')] };
  if (state.currentPhase === 'analysis') return { currentPhase: 'writing', messages: [new AIMessage('进入写作阶段')] };

  return { currentPhase: 'complete', finalReport: state.draftReport, messages: [new AIMessage('研究报告已完成！')] };
}
```

### 概念四：Research Specialist（研究专家）

```typescript
// 模拟知识库
const knowledgeBase: Record<string, string> = {
  '量子计算': '量子计算利用量子力学原理。2024年Google实现量子纠错里程碑，IBM发布1121量子比特处理器。在药物研发、金融建模、密码学领域潜力巨大。',
  '人工智能': '2024-2025年AI大模型持续演进。GPT-4o多模态、Claude 3.5编程卓越、Gemini 2.0原生多模态。AI Agent是最热门方向。',
  '区块链': '区块链从加密货币向实体经济转型。以太坊PoS降低能耗，Layer 2提升吞吐量。DeFi、NFT、RWA是主要方向。',
};

async function searchWeb(query: string): Promise<string> {
  const results: Record<string, string> = {
    '量子计算 金融': '投资组合优化、风险分析（蒙特卡洛加速1000倍）、欺诈检测',
    'AI 医疗': '医学影像诊断（准确率超95%）、药物研发（AlphaFold）、个性化治疗',
    '区块链 供应链': '溯源追踪、智能合约结算、供应链金融、防伪验证',
  };
  for (const [key, val] of Object.entries(results)) {
    if (query.includes(key)) return val;
  }
  return `关于"${query}"的搜索结果：暂无缓存数据。`;
}

async function researchSpecialistNode(state: RS) {
  const plan = state.researchPlan;
  const searchResults: string[] = [];

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    try {
      const keywordResp = await model.invoke([
        new SystemMessage('从研究步骤中提取搜索关键词，仅返回关键词。'),
        new HumanMessage(step),
      ]);
      const keyword = (keywordResp.content as string).trim();

      let result = '';
      for (const [topic, data] of Object.entries(knowledgeBase)) {
        if (keyword.includes(topic) || step.includes(topic)) { result = `[知识库] ${data}`; break; }
      }
      if (!result) result = await searchWeb(keyword);

      searchResults.push(`步骤${i+1} (${step}): ${result}`);
    } catch (error) {
      searchResults.push(`步骤${i+1} (${step}): ❌ 搜索失败`);
    }
  }

  return { searchResults, iterationCount: 1, messages: [new AIMessage(`🔬 研究完成，共 ${plan.length} 步`)], };
}
```

### 概念五：Analysis Specialist（分析专家）

```typescript
async function analysisSpecialistNode(state: RS) {
  const allResults = state.searchResults.join('\n\n');

  const response = await model.invoke([
    new SystemMessage(`你是数据分析专家。对研究资料进行深入分析。

## 输出格式
📊 **核心发现**: ...
📈 **趋势分析**: ...
🔍 **关键数据**: ...
⚖️ **多角度对比**: ...
💡 **分析结论**: ...`),
    new HumanMessage(`请分析以下资料：\n\n${allResults}`),
  ]);

  return {
    analysisResults: response.content as string,
    messages: [new AIMessage(`📊 分析完成，已提取关键发现和趋势。`)],
  };
}
```

### 概念六：Writing Specialist（写作专家）

```typescript
async function writingSpecialistNode(state: RS) {
  const response = await model.invoke([
    new SystemMessage(`你是专业报告撰写专家。基于分析结果撰写研究报告。

## 要求
- 包含：摘要、背景、核心发现、详细分析、结论与建议
- 使用 Markdown 格式
- 800-1500 字
- 语言生动严谨
- 适当使用列表和引用`),
    new HumanMessage(`资料：${state.searchResults.join('\n')}\n分析：${state.analysisResults}\n请撰写报告。`),
  ]);

  return { draftReport: response.content as string, messages: [new AIMessage(`📝 报告草稿完成`)], };
}

// 最终审核
async function finalReviewNode(state: RS) {
  const response = await model.invoke([
    new SystemMessage('审核并润色研究报告，确保事实准确、结构完整、表达流畅。输出最终报告。'),
    new HumanMessage(state.draftReport),
  ]);

  return {
    finalReport: response.content as string,
    currentPhase: 'complete',
    messages: [new AIMessage(`✅ 最终报告已通过审核`)],
  };
}
```

### 概念七：路由与图组装

```typescript
function phaseRouter(state: RS): string {
  switch (state.currentPhase) {
    case 'planning': return 'supervisor';
    case 'research': return 'research_specialist';
    case 'analysis': return 'analysis_specialist';
    case 'writing': return 'writing_specialist';
    case 'complete': return 'final_review';
    default: return 'supervisor';
  }
}

// 构建完整图
const researchSystem = new StateGraph(ResearchState)
  .addNode('supervisor', supervisorNode)
  .addNode('research_specialist', researchSpecialistNode)
  .addNode('analysis_specialist', analysisSpecialistNode)
  .addNode('writing_specialist', writingSpecialistNode)
  .addNode('final_review', finalReviewNode)
  .addEdge(START, 'supervisor')
  .addConditionalEdges('supervisor', phaseRouter, {
    supervisor: 'supervisor',
    research_specialist: 'research_specialist',
    analysis_specialist: 'analysis_specialist',
    writing_specialist: 'writing_specialist',
    final_review: 'final_review',
  })
  .addEdge('research_specialist', 'supervisor')
  .addEdge('analysis_specialist', 'supervisor')
  .addEdge('writing_specialist', 'supervisor')
  .addEdge('final_review', END)
  .compile({ checkpointer: new MemorySaver() });
```

---

## 🔨 完整使用示例

```typescript
async function runResearchTask(userQuery: string) {
  const threadId = `research-${Date.now()}`;

  console.log('🚀 启动多 Agent 研究系统...\n');
  console.log(`📝 任务: ${userQuery}\n`);

  const result = await researchSystem.invoke(
    { messages: [new HumanMessage(userQuery)] },
    { configurable: { thread_id: threadId } }
  );

  console.log('📋 执行摘要:');
  console.log(`  计划步骤: ${result.researchPlan.length}`);
  console.log(`  搜索结果: ${result.searchResults.length}`);

  console.log('\n📊 分析结果:');
  console.log(result.analysisResults.slice(0, 200) + '...');

  console.log('\n📄 最终报告:');
  console.log(result.finalReport);

  return result;
}

// 流式执行（观察每个阶段）
async function streamResearchTask(userQuery: string) {
  const stream = await researchSystem.stream(
    { messages: [new HumanMessage(userQuery)] },
    { configurable: { thread_id: `stream-${Date.now()}` } }
  );

  for await (const event of stream) {
    for (const [nodeName, output] of Object.entries(event)) {
      console.log(`\n📍 [${nodeName}]`);
      if (output.messages) {
        for (const msg of output.messages) {
          const content = typeof msg.content === 'string' ? msg.content.slice(0, 200) : '';
          if (content) console.log(`   ${content}`);
        }
      }
    }
  }
}

// 执行
runResearchTask('研究人工智能在医疗领域的应用现状，重点关注诊断、药物研发和个性化治疗三个方向。');
```

<details>
<summary>🧑‍💻 预期执行流程</summary>

```
📍 [supervisor] 📋 计划制定完成，共 5 步
📍 [research_specialist] 🔬 研究完成，共 5 步
📍 [supervisor] 进入分析阶段
📍 [analysis_specialist] 📊 分析完成
📍 [supervisor] 进入写作阶段
📍 [writing_specialist] 📝 报告草稿完成
📍 [final_review] ✅ 最终报告已通过审核
```

</details>

---

## ⚙️ 生产级增强

### 概念八：错误重试与日志

```typescript
// 带重试的包装器
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { return await fn(); }
    catch (error) {
      if (attempt === maxRetries) throw error;
      console.warn(`⚠️ 第${attempt}次失败，${delay}ms后重试...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('重试耗尽');
}

// 日志节点
async function loggingNode(nodeName: string, fn: Function, state: RS) {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] 🔄 ${nodeName}`);
  try {
    const result = await fn(state);
    console.log(`[${new Date().toISOString()}] ✅ ${nodeName} (${Date.now() - start}ms)`);
    return result;
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ❌ ${nodeName} 失败:`, e);
    throw e;
  }
}
```

---

## ⚠️ 常见陷阱与最佳实践

| 陷阱 | 解决方案 |
|------|----------|
| Agent 间信息丢失 | 使用 `searchResults`、`analysisResults` 等字段传递阶段性成果 |
| Supervisor 路由复杂 | 使用 `currentPhase` 状态分阶段控制，保持路由逻辑简单 |
| 报告格式不一致 | 在 Writing Specialist 系统提示中明确定义格式模板 |
| 缺乏错误处理 | 每个节点使用 try-catch，错误信息存入 `errors` 数组 |
| 检查点未配置 | 生产环境始终配置持久化检查点，支持中断恢复 |

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么 Supervisor 需要作为节点而非单纯的路由函数？**

> A：Supervisor 作为节点可以使用 LLM 进行智能决策（制定计划、评估进度），而路由函数只能做固定条件判断。LLM Supervisor 可动态调整策略。

**Q2：如何扩展系统支持更多的 Specialist Agent？**

> A：1）状态中增加新字段存储新 Agent 输出；2）定义新 Agent 节点函数；3）在 Supervisor 路由中增加新阶段值；4）在图中添加新节点和边。

**Q3：流式执行和普通执行有何不同？**

> A：流式执行实时观察每个阶段输出，适合调试和展示。对于多 Agent 系统特别有价值，可看到每个 Agent 的工作过程。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 研究 Agent 生成的研究报告过于笼统，缺乏深度 | 未指定搜索范围或信息来源筛选条件 | 在 Research Agent 的 Prompt 中明确要求「查找最新数据、权威来源、多角度观点」 |
| 分析 Agent 与写作 Agent 的输出风格不一致 | 两个 Agent 使用不同的系统 Prompt，风格不统一 | 在规划阶段定义统一的风格指南，写入共享状态供所有 Agent 参考 |
| 阶段切换时上一阶段的成果未正确传递 | 状态中缺少专用的阶段性成果字段 | 在 State 中增加 `researchResults`、`analysis`、`draft` 等专用字段存储各阶段产出 |
| 超长上下文导致 Token 耗尽 | 研究阶段收集了大量资料未做筛选直接传给下一阶段 | 在阶段之间增加摘要和过滤步骤，只传递关键信息而非原始数据 |

---

## 📝 本章小结

- ✅ **完整多 Agent 研究系统** — Supervisor + Research + Analysis + Writing
- ✅ **分阶段任务编排** — planning → research → analysis → writing → review
- ✅ **专业化 Agent 设计** — 每个 Specialist 专注一个领域
- ✅ **结构化状态管理** — 用专用字段传递阶段性成果
- ✅ **条件路由** — 基于 `currentPhase` 动态调度
- ✅ **错误处理** — withRetry 模式和错误记录
- ✅ **生产级增强** — 日志、监控、检查点

## 🎉 恭喜完成！

> 通过本章学习，你已经掌握了使用 LangGraph 构建复杂多 Agent 系统的完整技能。从核心概念到子图模块化，从 Human-in-the-Loop 到多 Agent 协作，你现在有能力构建真实世界中的 AI Agent 应用了！🚀
