# 第4章：知识图谱基础 — 结构化记忆

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解知识图谱 vs 向量记忆的区别** — 结构化 vs 非结构化的选择
- **从对话中自动提取实体和关系**
- **用知识图谱实现关联推理**

## 📋 前置知识

> 建议先完成：[第1章：记忆类型概述](./01-memory-types.md)

---

## 💡 核心概念

### 知识图谱 vs 向量记忆

**生活类比：** 向量记忆就像一个「便利贴墙」——每张贴纸上有一些信息，你通过颜色（相似度）找相关的贴纸。知识图谱就像一个「家族树」——每个人在树上有确定的位置和关系，你可以沿着关系找到他们要的信息。

```
向量记忆：非结构化，基于相似度检索
  "用户喜欢 TypeScript" → [0.2, 0.8, ...] → 找到相似内容

知识图谱：结构化，基于关系查询
  (用户) --偏好--> (TypeScript)
  (用户) --正在开发--> (Vue 3 项目)
  → 沿着关系找到"用户和Vue 3项目的关系"
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
      content: `从以下文本中提取实体和关系，输出 JSON：
${text}

格式：
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

**💡 什么时候用知识图谱？** 当记忆之间存在「明确的关系」时——如用户 A 是项目 B 的成员、技术 C 依赖技术 D。知识图谱能回答「用户 A 的所有项目有哪些？」这类关系查询，向量数据库做不到。

---

## 🔨 实战演练

<details>
<summary>🧑‍💻 构建简单的知识图谱记忆</summary>

```typescript
class KnowledgeGraphMemory {
  private entities = new Map<string, Entity>();
  private relations: Relation[] = [];

  async addConversation(text: string) {
    const knowledge = await extractKnowledge(text);
    for (const entity of knowledge.entities) {
      this.entities.set(entity.name, entity);
    }
    this.relations.push(...knowledge.relations);
  }

  query(entityName: string): { related: string[]; relations: Relation[] } {
    const related = this.relations
      .filter(r => r.source === entityName || r.target === entityName)
      .map(r => r.source === entityName ? r.target : r.source);
    return {
      related: [...new Set(related)],
      relations: this.relations.filter(r => r.source === entityName || r.target === entityName),
    };
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 1. 关系路径推理 — 多跳查询

知识图谱的威力在于多跳推理。实现一个 BFS 遍历，找到两个实体之间的最短路径：

```typescript
function findPath(graph: KnowledgeGraphMemory, from: string, to: string, maxDepth = 3): string[] {
  const queue: { entity: string; path: string[] }[] = [{ entity: from, path: [from] }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { entity, path } = queue.shift()!;
    if (entity === to) return path;  // 找到路径
    if (path.length > maxDepth) continue;
    const neighbors = graph.query(entity).related;
    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push({ entity: n, path: [...path, n] });
      }
    }
  }
  return []; // 未找到
}
// 示例: findPath(graph, "小明", "React") → ["小明", "Vue 3", "前端框架", "React"]
```

### 2. 图谱与向量混合查询

先用向量检索找到相关文档，再从中提取实体用于图谱查询，两个结果加权合并：

```typescript
async function hybridQuery(userQuery: string) {
  // 1. 向量检索找到相关记忆
  const memories = await vectorDB.query({ queryTexts: [userQuery], nResults: 5 });
  // 2. 从记忆文本中提取实体名，在图谱中查询其邻接实体
  const entities = extractEntitiesFromDocs(memories.documents);
  const graphResults = entities.flatMap(e => graphMemory.query(e).relations);
  // 3. 合并：向量结果按相似度排序，图谱结果赋予固定权重
  return {
    vectorResults: memories.documents,
    graphRelations: graphResults.slice(0, 10),
  };
}
```

### 3. 实体消歧 — 同名不同义

用户在不同上下文中提到"Apple"可能指水果或公司。用 LLM 根据上下文消歧：

```typescript
async function disambiguate(name: string, context: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 50,
    messages: [{
      role: 'user',
      content: `在以下语境中，"${name}" 最可能指什么？（回答 1-3 个字）
语境：${context}`
    }],
  });
  return response.content[0].type === 'text' ? response.content[0].text.trim() : name;
}
```

## 🧠 知识检查点

<details>
<summary><strong>Q1: 知识图谱相比向量记忆的最大优势是什么？</strong></summary>

**A:** 知识图谱能回答**关系型问题**，比如"小明的所有项目有哪些？""TypeScript 和 Vue 3 谁依赖谁？"。向量记忆只能按"相似度"查找，无法表达和查询实体之间的明确关系。适合场景：用户档案管理、代码依赖分析、业务知识库建设。
</details>

<details>
<summary><strong>Q2: extractKnowledge 中为什么要求 LLM 以 JSON 格式输出？</strong></summary>

**A:** JSON 格式能确保实体和关系的数据结构是**可编程消费**的——可以直接 `JSON.parse()` 后遍历 `entities` 和 `relations` 数组存入图谱。如果 LLM 以自然语言输出，就需要额外的解析步骤，增加了出错概率。结合 `response_format: { type: 'json_object' }` 可以进一步提高结构化的成功率。
</details>

<details>
<summary><strong>Q3: 关系抽取中「关系方向」为什么很重要？</strong></summary>

**A:** 关系是有方向的："小明→使用→Vue 3"和"Vue 3→使用→小明"含义完全不同。`Relation` 接口中的 `source` 和 `target` 字段明确了方向。在 `query()` 方法中要区分 `r.source === entityName`（出边）和 `r.target === entityName`（入边），才能正确返回"小明使用的技术"和"使用了小明的人"这样的不同查询结果。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 实体名大小写不一致导致查询遗漏 | "TypeScript"和"typescript"在图谱中被视为两个实体 | 存储时统一小写或维护一个实体别名映射表 |
| 关系冗余爆炸 | 同一关系被重复提取（用户说了 3 次"我用 Vue 3"，图谱里存了 3 条相同的边） | 添加 `addConversation` 时做去重：检查 `(source, target, type)` 组合是否已存在 |
| 图谱查询结果为空 | `query()` 只查精确实体名，但用户输入有偏差（"小明" vs "小明同学"） | 结合模糊匹配（Levenshtein 距离 < 2）或 LLM 实体对齐 |

## 📝 本章小结

- ✅ **知识图谱** — 结构化存储实体和关系
- ✅ **实体提取** — 从对话中自动识别人、技术、项目
- ✅ **关系提取** — 识别实体之间的关系，支持关联推理
- ✅ **向量 vs 图谱** — 非结构化检索用向量，关系查询用图谱

---

## ➡️ 下一章预告

> [第5章：记忆框架](./05-memory-frameworks.md) — Mem0 与 Zep 框架的使用和选型对比。
