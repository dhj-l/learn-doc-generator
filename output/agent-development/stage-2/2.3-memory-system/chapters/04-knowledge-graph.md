# 第4章：知识图谱基础 — 结构化记忆

> 预计学习时间：80-100 分钟

## 🎯 本章目标

- 理解知识图谱与向量记忆的本质区别及其互补关系
- 掌握图论基础（节点、边、路径、子图）在 Agent 记忆中的应用
- 理解语义网络理论（Semantic Networks）对知识图谱设计的启发
- 能够实现从对话中自动提取实体和关系并构建知识图谱
- 掌握基于图结构的记忆检索（路径查询、子图匹配）

## 📋 前置知识

- 第 1 章中长期记忆的存储方式
- 基本的 JSON 数据格式
- LLM 的基本调用（用于实体提取）
- 熟悉图的基本概念（节点、边）

## 💡 核心概念

### 从向量到图：两种知识表征范式

向量检索和知识图谱代表了两种完全不同的知识表征范式：

```
向量记忆（连接主义范式）：
  ┌──────────────────────────────┐
  │ "用户喜欢 TypeScript"        │
  │        → [0.2, 0.8, ...]     │
  │  优点：语义模糊匹配，容错性强    │
  │  缺点：无法回答关系性问题        │
  │  （"谁在使用 TypeScript?"）    │
  └──────────────────────────────┘

知识图谱（符号主义范式）：
  ┌──────────────────────────────┐
  │  (用户) --偏好--> (TypeScript)│
  │  (用户) --开发--> (Vue 3 项目)│
  │  优点：精确关系查询，可解释性强  │
  │  缺点：实体提取可能遗漏或不准确  │
  └──────────────────────────────┘
```

**最佳实践是两者结合**：向量检索做宽泛的语义召回，知识图谱做精确的关系推理。

### 图论基础：Agent 记忆的图视角

```
图 G = (V, E)
  V = 节点集合（实体）
  E = 边集合（关系）

示例子图：
  ┌───────┐      "正在使用"      ┌───────────┐
  │ 小明   │ ─────────────────→ │ TypeScript │
  └───┬───┘                     └───────────┘
      │                              │
      │ "正在开发"                    │ "是"
      ▼                              ▼
  ┌──────────┐                 ┌──────────┐
  │ Vue 项目  │                 │ 静态类型  │
  └──────────┘                 └──────────┘
```

**图论核心概念在 Agent 记忆中的应用：**

| 图论概念 | 定义 | 在 Agent 记忆中的应用 |
|----------|------|----------------------|
| **节点（Node/Vertex）** | 实体 | 人、技术、项目、概念、文档 |
| **边（Edge）** | 关系 | 使用、偏好、开发、属于 |
| **路径（Path）** | 节点间的连接序列 | 推理链："小明 → TypeScript → 静态类型" |
| **子图（Subgraph）** | 图的一部分 | 特定主题的知识簇 |
| **度（Degree）** | 节点的连接数 | 知识广度——高度节点表示关键概念 |
| **社区（Community）** | 密集连接的节点组 | 主题分类（前端技术、后端技术） |

### 语义网络理论

语义网络（Semantic Networks）是知识图谱的前身，由 Quillian 在 1968 年提出。核心思想：

1. **节点代表概念**（concept），边代表语义关系（如 IS-A, PART-OF, PREFERS）
2. **继承**：子节点自动继承父节点的属性（如 TypeScript IS-A 编程语言，所以 TypeScript 有"需要编译"的属性）
3. **扩散激活**（Spreading Activation）：当你想到一个概念时，相邻的概念也会被"激活"。这正是图检索的理论基础

```
扩散激活过程：
  用户问："TypeScript 适合什么项目？"
  
  激活节点: [TypeScript]
     │
     ▼ 沿着"IS-A"边
  编程语言（被激活）
     │
     ▼ 沿着"被用于"边
  前端项目、大型项目、企业项目（被激活）
  
  最终返回：被激活的节点中与当前查询最相关的
```

### 知识图谱 vs 向量记忆

```
向量记忆：非结构化，基于相似度检索
  "用户喜欢 TypeScript" → [0.2, 0.8, ...]

知识图谱：结构化，基于关系查询
  (用户) --偏好--> (TypeScript)
  (用户) --正在开发--> (Vue 3 项目)
```

### 从对话中提取实体和关系

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

interface Entity {
  name: string;
  type: 'person' | 'technology' | 'project' | 'concept';
}

interface Relation {
  source: string;
  target: string;
  type: string;
}

async function extractKnowledge(text: string): Promise<{
  entities: Entity[];
  relations: Relation[];
}> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1000,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: `从以下文本中提取实体和关系：

${text}

输出 JSON：
{
  "entities": [{"name": "...", "type": "person|technology|project|concept"}],
  "relations": [{"source": "...", "target": "...", "type": "关系类型"}]
}`
    }],
  });

  return JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '{"entities":[],"relations":[]}');
}

// 使用
const knowledge = await extractKnowledge(
  '小明正在用 Vue 3 和 TypeScript 开发一个电商项目，他之前学过 React'
);
// entities: [{name:"小明",type:"person"}, {name:"Vue 3",type:"technology"}, ...]
// relations: [{source:"小明",target:"Vue 3",type:"正在使用"}, ...]
```

### 图谱查询与推理

基于构建好的知识图谱，可以进行复杂的图查询：

```typescript
class KnowledgeGraph {
  private entities: Map<string, Entity> = new Map();
  private adjacency: Map<string, Relation[]> = new Map();

  addEntity(entity: Entity) {
    this.entities.set(entity.name, entity);
    if (!this.adjacency.has(entity.name)) {
      this.adjacency.set(entity.name, []);
    }
  }

  addRelation(relation: Relation) {
    this.adjacency.get(relation.source)?.push(relation);
  }

  // BFS 路径查询：找出两个实体之间的最短关系路径
  findPath(source: string, target: string): Relation[] | null {
    const visited = new Set<string>();
    const queue: { entity: string; path: Relation[] }[] = [{ entity: source, path: [] }];
    visited.add(source);

    while (queue.length > 0) {
      const { entity, path } = queue.shift()!;
      if (entity === target) return path;

      const neighbors = this.adjacency.get(entity) || [];
      for (const rel of neighbors) {
        if (!visited.has(rel.target)) {
          visited.add(rel.target);
          queue.push({ entity: rel.target, path: [...path, rel] });
        }
      }
    }
    return null; // 未找到路径
  }

  // 子图提取：返回与某节点直接相连的所有节点和关系
  getSubgraph(nodeName: string, depth: number = 1): { entities: Entity[]; relations: Relation[] } {
    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<Relation>();
    const queue: { name: string; d: number }[] = [{ name: nodeName, d: 0 }];
    visitedNodes.add(nodeName);

    while (queue.length > 0) {
      const { name, d } = queue.shift()!;
      if (d >= depth) continue;

      const edges = this.adjacency.get(name) || [];
      for (const edge of edges) {
        visitedEdges.add(edge);
        if (!visitedNodes.has(edge.target)) {
          visitedNodes.add(edge.target);
          queue.push({ name: edge.target, d: d + 1 });
        }
      }
    }

    return {
      entities: Array.from(visitedNodes).map(n => this.entities.get(n)!).filter(Boolean),
      relations: Array.from(visitedEdges),
    };
  }
}
```

---

## 🔨 实战演练

**场景描述：**
你正在构建一个**知识增强型 Agent**，它不仅需要"记住"用户的偏好（向量检索），还需要理解用户世界中的实体和它们之间的关系（知识图谱）。Agent 需要将知识图谱作为"第二大脑"——当向量检索返回模糊结果时，通过图推理进行精确的关系查询。

**你的任务：**
1. 实现一个 `HybridMemory` 类，同时包含向量存储（ChromaDB）和知识图谱（`KnowledgeGraph`）
2. 当用户提到一个实体时，自动执行**扩散激活**：找出该实体相邻的所有节点和关系，作为上下文注入
3. 实现一个简单的**推理链**：当用户问"为什么推荐这个？"，Agent 可以沿着图路径解释推荐理由

<details>
<summary>💡 参考实现思路</summary>

```typescript
class HybridMemory {
  private vectorStore: ChromaClient;
  private kg: KnowledgeGraph;

  async onUserMessage(message: string) {
    // 1. 提取实体和关系
    const knowledge = await extractKnowledge(message);
    for (const entity of knowledge.entities) this.kg.addEntity(entity);
    for (const rel of knowledge.relations) this.kg.addRelation(rel);

    // 2. 向量检索（语义）
    const semanticResults = await this.vectorStore.query({
      queryTexts: [message],
      nResults: 3,
    });

    // 3. 图检索（结构化）
    const entities = knowledge.entities;
    const graphContext = entities.flatMap(e => {
      const subgraph = this.kg.getSubgraph(e.name, 2);
      return subgraph.relations.map(r =>
        `(${r.source}) -[${r.type}]-> (${r.target})`
      );
    });

    // 4. 融合返回
    return {
      memories: semanticResults.documents[0],
      graphRelations: [...new Set(graphContext)],
    };
  }

  // 推理链解释
  async explainRecommendation(itemName: string, userName: string): Promise<string> {
    const path = this.kg.findPath(userName, itemName);
    if (!path) return '没有找到直接的关联路径';

    return path.map(r => `→ ${r.type} → ${r.target}`).join(' ');
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 1. 时序知识图谱（Temporal Knowledge Graph）

关系会随着时间变化。为每条边加上时间戳，让 Agent 可以回答"用户过去用什么技术栈"和"用户现在用什么技术栈"：

```typescript
interface TemporalRelation extends Relation {
  fromTime: number;   // 成立时间
  toTime?: number;    // 失效时间（可选，表示关系不再成立）
  confidence: number; // 0-1 置信度
}

// 查询某时刻的关系
function queryAtTime(entity: string, timestamp: number): TemporalRelation[] {
  return allTemporalRelations.filter(r =>
    r.source === entity &&
    r.fromTime <= timestamp &&
    (!r.toTime || r.toTime >= timestamp)
  );
}
```

### 2. 图 Embedding（Knowledge Graph Embedding）

将知识图谱的结构信息编码为向量，使得图上的"语义相似"（有共同邻居的节点）在向量空间中也相近：

```typescript
// 使用 TransE 思想：如果 (h, r, t) 成立，则 h + r ≈ t
// 例如：Vec("小明") + Vec("正在使用") ≈ Vec("TypeScript")
async function computeGraphEmbedding(entity: Entity): Promise<number[]> {
  const neighbors = adjacencyList.get(entity.name) || [];
  const neighborEmbeddings = await Promise.all(
    neighbors.map(n => getEmbedding(n.target))
  );
  // 平均邻居的嵌入作为当前节点的图嵌入
  return averageVectors(neighborEmbeddings);
}
```

### 3. 分层知识图谱

将知识图谱分层为"通用知识"和"用户特定知识"，减少不同用户之间的干扰：

```
知识层级 0（全局层）：
  TypeScript IS-A 编程语言
  编程语言 HAS 编译器

知识层级 1（用户层）：
  小明 PREFERS TypeScript
  小明 WORKS_ON Vue 项目

查询策略：优先返回用户层，用户层没有时回退到全局层
```

---

## 🧠 知识检查点

### Q1: 知识图谱和向量数据库在记忆检索中如何互补？能否只用其中一种？

<details>
<summary>查看答案</summary>

两者解决的是不同类型的查询：

| 查询类型 | 适用系统 | 示例 |
|----------|---------|------|
| 模糊语义匹配 | 向量数据库 | "推荐一个和 TypeScript 类似的语言" |
| 精确关系查询 | 知识图谱 | "小明用什么框架开发？" |
| 多跳推理 | 知识图谱 | "小明的技术栈中哪些和 React 相关？" |
| 概念泛化 | 向量数据库 | "用户喜欢什么类型的语言？" |

**不能只用一种**：纯向量检索无法回答精确关系问题（如"小明的项目依赖哪些库？"）；纯知识图谱无法处理语义近似的模糊查询（如"用户喜欢什么"和"用户的偏好"是同一个意思但不同表达）。最佳实践是**混合架构**：向量做语义召回→图做精确筛选+推理。
</details>

### Q2: "扩散激活"（Spreading Activation）和图论中的 BFS 有什么联系和区别？

<details>
<summary>查看答案</summary>

**联系**：扩散激活的搜索过程在形式上等价于图的广度优先搜索（BFS）——从起始节点出发，逐层探索相邻节点。

**区别**：
1. **衰减**：BFS 的所有层权重相同，而扩散激活中每扩散一层，激活强度衰减（乘以衰减因子 $α < 1$）
2. **汇聚**：多个来源的激活可以叠加（如果一个节点被两个相邻节点同时激活，其激活强度是两者之和）
3. **阈值**：只有激活强度超过阈值的节点才会继续扩散，防止"语义爆炸"
4. **终止条件**：BFS 停止于找到目标，扩散激活停止于激活值低于阈值

在 Agent 中，扩散激活更适合做"知识发现"（"和这个主题相关的还有什么？"），BFS 更适合做"路径查找"（"A 和 B 之间有什么关系？"）。
</details>

### Q3: 实体提取（Named Entity Recognition）有哪些常见的失败模式？对构建知识图谱有什么影响？

<details>
<summary>查看答案</summary>

常见的失败模式包括：

1. **共指消解失败**：同一个人在不同对话中被称为"小明"、"Xiao Ming"、"他"，如果识别为三个不同实体，图谱会出现分裂
2. **歧义多义词**："Apple"可能指水果（生活中）或公司（工作中），如果混为同一节点会引入噪声
3. **关系方向错误**："小明用 Vue"应提取为 (小明 → 使用 → Vue)，但可能错误提取为 (Vue → 被用 → 小明)
4. **过度提取**：将非实体（"这个"、"那个"）也当作实体，引入噪声节点

**应对策略**：
- 在提取前加入实体规范化（Normalization）步骤
- 使用实体解析（Entity Resolution）合并同指实体
- 对关系方向进行二次校验
- 设置置信度阈值，低置信度的关系延迟存入或标记为"待确认"
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 将知识图谱和向量数据库视为"二选一"，只用其中一种 | 不理解两者分别擅长模糊语义匹配和精确关系查询，是互补关系而非替代关系 | 采用混合架构：向量数据库做语义召回，知识图谱做关系推理；或者用向量检索结果作为种子，在图谱上执行扩散激活 |
| 知识图谱只增不减，导致图规模失控 | 没有建立关系衰减或合并机制，实体和关系持续膨胀 | 为关系设置置信度和时效性（Temporal Graph），低置信度或已经过时的关系定期清理或降权 |
| 实体提取不做规范化（Normalization），同义实体产生冗余节点 | 缺乏实体解析（Entity Resolution）步骤，同一个人/物因名称变体而生成多个节点 | 在提取后加入规范化步骤：统一大小写、别名映射（"TS"→"TypeScript"）、共指消解（"他"→"小明"） |

---

## 📝 本章小结

- ✅ **知识图谱** — 结构化存储实体和关系
- ✅ **实体提取** — 从对话中自动识别人、技术、项目
- ✅ **关系提取** — 识别实体之间的关系
- ✅ **图论基础** — 节点、边、路径、子图在 Agent 记忆中的应用
- ✅ **扩散激活** — 从激活节点出发沿边扩散，发现相关知识
- ✅ **混合架构** — 向量检索做语义召回，知识图谱做精确推理
- ✅ **时序知识图谱** — 为关系加上时间维度，支持"当时"和"现在"的对比查询

## ➡️ 下一章预告

> [第5章：记忆框架 — Mem0 与 Zep](./05-memory-frameworks.md) — 主流记忆框架对比、LangChain Memory 集成、生产级记忆管理方案。
