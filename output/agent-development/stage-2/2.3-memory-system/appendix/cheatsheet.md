# 记忆系统速查表

> 涵盖 Agent 的短期记忆、长期记忆、知识图谱等核心概念与实现方式。

---

## 🧠 三类记忆模型

| 记忆类型 | 存储介质 | 生命周期 | 容量 | 典型用途 |
|----------|----------|----------|------|----------|
| 短期记忆（Short-term） | messages 数组（上下文窗口） | 单次会话内 | 有限（取决于模型 context window） | 对话上下文、当前任务状态 |
| 长期记忆（Long-term） | 向量数据库 / KV 存储 | 跨会话持久化 | 几乎无限 | 用户偏好、知识积累、历史行为 |
| 工作记忆（Working） | 内存变量 / Redis | 任务执行期间 | 很小（临时） | 中间计算结果、步骤追踪 |

## 📊 对话压缩策略

```typescript
// 滑动窗口策略：保留最近 N 轮对话
function slidingWindow(messages: Message[], windowSize: number = 20): Message[] {
  const systemMessages = messages.filter(m => m.role === 'system');
  const recentMessages = messages
    .filter(m => m.role !== 'system')
    .slice(-windowSize);
  return [...systemMessages, ...recentMessages];
}

// 摘要压缩策略
async function summarizeMessages(
  messages: Message[],
  llm: Client
): Promise<string> {
  const response = await llm.messages.create({
    model: 'claude-3-haiku-20240307',
    messages: [
      { role: 'user', content: `请对以下对话进行摘要（保留关键信息、用户偏好、决策记录）：\n${messages.map(m => m.content).join('\n')}` }
    ],
  });
  return response.content[0].text;
}
```

| 压缩策略 | 原理 | 优点 | 缺点 | 适用场景 |
|----------|------|------|------|----------|
| 滑动窗口 | 保留最近 N 轮对话 | 实现简单，速度快 | 丢失早期重要信息 | 简短对话、实时聊天 |
| 摘要压缩 | LLM 压缩旧消息为摘要 | 保留关键信息 | 增加 LLM 调用成本 | 长对话、复杂任务 |
| 选择性保留 | 按重要性分数过滤 | 精准控制 | 需要重要性评估逻辑 | 知识密集型对话 |
| Token 预算 | 按 token 数裁剪 | 精确控制用量 | 可能截断关键内容 | token 敏感的 API 调用 |

## 📦 长期记忆存储方案

```typescript
// 基于向量数据库的记忆存储（ChromaDB 示例）
interface Memory {
  id: string;
  userId: string;
  content: string;
  embedding: number[];
  importance: number;  // 1-10
  timestamp: Date;
  metadata: Record<string, string>;
}

// 存储记忆
async function storeMemory(
  collection: Collection,
  memory: Omit<Memory, 'id' | 'embedding'>
): Promise<void> {
  // 1. 生成 embedding
  const embedding = await generateEmbedding(memory.content);
  // 2. 存储到向量数据库
  await collection.add({
    ids: [crypto.randomUUID()],
    embeddings: [embedding],
    metadatas: [{
      userId: memory.userId,
      importance: memory.importance.toString(),
      timestamp: memory.timestamp.toISOString(),
      ...memory.metadata,
    }],
    documents: [memory.content],
  });
}

// 检索记忆
async function retrieveMemories(
  collection: Collection,
  query: string,
  userId: string,
  topK: number = 5
): Promise<Memory[]> {
  const queryEmbedding = await generateEmbedding(query);
  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK,
    where: { userId: { $eq: userId } },
  });
  return results.documents[0].map((doc, i) => ({
    content: doc,
    importance: parseInt(results.metadatas[0][i].importance),
    timestamp: new Date(results.metadatas[0][i].timestamp),
    id: results.ids[0][i],
    userId,
    embedding: [],
    metadata: results.metadatas[0][i],
  }));
}
```

## 🔗 知识图谱记忆

| 组件 | 说明 | 存储方式 |
|------|------|----------|
| 实体（Entity） | 人、地点、概念、事物 | 节点（Neo4j / 图数据库） |
| 关系（Relation） | 实体之间的连接 | 边（带类型和属性） |
| 三元组（Triple） | (实体 A, 关系, 实体 B) | (subject, predicate, object) |
| 权重（Weight） | 关系的置信度/重要程度 | 边属性 |

```typescript
// 知识图谱记忆操作
interface KnowledgeTriple {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  timestamp: Date;
}

// 从对话中提取知识
async function extractKnowledge(
  conversation: string,
  llm: Client
): Promise<KnowledgeTriple[]> {
  const response = await llm.messages.create({
    model: 'claude-3-haiku-20240307',
    messages: [{
      role: 'user',
      content: `从以下对话中提取事实三元组（subject, predicate, object），只提取确定的事实：\n${conversation}`,
    }],
  });
  return parseTriples(response.content[0].text);
}
```

## 🧩 记忆系统架构模式

| 模式 | 架构 | 适用场景 |
|------|------|----------|
| 单层记忆 | 短期记忆 + 长期记忆 | 简单问答机器人 |
| 分层记忆 | 工作记忆 + 短期记忆 + 长期记忆 + 知识图谱 | 复杂 Agent 系统 |
| 混合记忆 | 向量检索 + SQL 查询 + 图查询 | 需要多维度检索 |
| 记忆蒸馏 | 定期将短期记忆提炼为长期记忆 | 持续学习的 Agent |

## ⚖️ 重要性评估机制

```typescript
// 记忆重要性评分
function evaluateImportance(content: string): number {
  const highPriorityPatterns = [
    /密码|账号|邮箱|电话|地址/,
    /喜欢|不喜欢|偏好|习惯/,
    /项目|任务|截止日期|约定/,
    /重要|紧急|必须|务必/,
  ];
  
  let score = 5; // 基础分
  for (const pattern of highPriorityPatterns) {
    if (pattern.test(content)) score += 1;
  }
  // 长度调整：过长的内容可能信息量大
  if (content.length > 200) score += 1;
  if (content.length > 500) score += 1;
  
  return Math.min(score, 10); // 上限 10
}

// 只存储高重要性记忆
if (evaluateImportance(memoryContent) >= 5) {
  await storeMemory(collection, { content: memoryContent, ... });
}
```

## 🔄 记忆合并与去重

| 策略 | 方法 | 优点 |
|------|------|------|
| 时间戳优先 | 相同实体/关键词，保留最新 | 反映最新状态 |
| 置信度优先 | 保留置信度高的记忆 | 提高准确率 |
| LLM 合并 | 让 LLM 判断是否为重复/矛盾记忆 | 灵活但成本高 |
| 向量相似度 | 相似度 > 阈值即为重复 | 自动去重 |

## 🔑 关键 API 速查

| API / 组件 | 用途 | 示例 |
|------------|------|------|
| `ChromaDB collection.add()` | 存储向量和文档 | `collection.add({ ids, embeddings, documents })` |
| `ChromaDB collection.query()` | 向量相似度检索 | `collection.query({ queryEmbeddings, nResults })` |
| `generateEmbedding(text)` | 生成文本向量 | `model.encode(text)` |
| `slidingWindow(messages, N)` | 截取最近 N 轮 | `messages.slice(-20)` |
| `evaluateImportance(content)` | 记忆重要性评分 | `score = importanceFn(content)` |
| `llm.messages.create()` | LLM 压缩/摘要 | 传入摘要 prompt |
| `Neo4j session.run()` | 图数据库查询 | `session.run('MATCH ...')` |
| `Redis.set/get` | 高频缓存访问 | `redis.set(sessionKey, memory)` |
| `cosineSimilarity(a, b)` | 向量相似度计算 | `cosineSim(emb1, emb2)` |
| `memory.merge()` | 合并新旧记忆 | 自定义合并策略 |
