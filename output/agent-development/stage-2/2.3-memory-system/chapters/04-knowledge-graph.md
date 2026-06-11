# 第4章：知识图谱基础 — 结构化记忆

> 预计学习时间：80-100 分钟

## 💡 核心概念

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

---

## 📝 本章小结

- ✅ **知识图谱** — 结构化存储实体和关系
- ✅ **实体提取** — 从对话中自动识别人、技术、项目
- ✅ **关系提取** — 识别实体之间的关系
