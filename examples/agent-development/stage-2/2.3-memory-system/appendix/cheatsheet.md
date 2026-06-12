# 记忆系统速查表

---

## 🧠 三种记忆类型

| 类型 | 存储 | 生命周期 | 用途 | 核心操作 |
|------|------|----------|------|----------|
| 短期记忆 | messages 数组 | 会话内 | 对话上下文 | `messages.push({ role, content })` |
| 长期记忆 | 向量数据库 | 持久化 | 用户偏好、知识 | `collection.add({ ids, documents })` |
| 工作记忆 | Map/变量 | 任务内 | 当前任务状态 | `taskMemory.set('step', 3)` |

## 📦 对话压缩策略

| 策略 | 原理 | 代码实现 | 适用场景 |
|------|------|----------|----------|
| 滑动窗口 | 保留最近 N 轮 | `messages.slice(-20)` | 短对话 |
| 摘要压缩 | LLM 压缩旧消息 | `await llm.summarize(oldMessages)` | 长对话 |
| 选择性保留 | 过滤不重要消息 | `.filter(m => m.role !== 'tool')` | 复杂对话 |

## 🔑 记忆存储实现

```typescript
// ChromaDB — 长期记忆（向量检索）
const collection = await client.getOrCreateCollection({ name: 'user_memories' });
await collection.add({
  ids: ['mem_001'],
  documents: ['用户喜欢 TypeScript，对 Python 不感兴趣'],
  metadatas: [{ userId: 'u001', timestamp: Date.now() }],
});

// Redis — 高频会话状态
await redis.set(`session:${sessionId}`, JSON.stringify(currentState), 'EX', 3600);

// SQLite — 结构化用户数据
await db.run('INSERT INTO user_preferences (id, key, value) VALUES (?, ?, ?)', [userId, 'theme', 'dark']);
```

## 💡 记忆读写模式

```typescript
// 写入长期记忆
async function saveMemory(userId: string, key: string, value: string) {
  const embedding = await openai.embeddings.create({ model: 'text-embedding-3-small', input: value });
  await memories.add({
    ids: [`${userId}_${key}`],
    embeddings: [embedding.data[0].embedding],
    metadatas: [{ userId, key, timestamp: Date.now() }],
    documents: [value],
  });
}

// 读取相关记忆
async function recallMemories(userId: string, query: string, topK = 5) {
  return await memories.query({ queryTexts: [query], nResults: topK, where: { userId } });
}
```

## 🔗 记忆管理工具

| 工具 | 用途 | 示例 |
|------|------|------|
| `summarizeMessages()` | 压缩对话历史 | `const summary = await summarize(longHistory)` |
| `pruneHistory()` | 裁剪过长的 history | `messages = pruneHistory(messages, maxTokens=4000)` |
| `mergeMemories()` | 合并重复记忆 | `mergeMemories(existing, newMemories)` |
| `expireMemories()` | 清除过期记忆 | `memories.delete({ where: { expiresAt: { $lt: now } } })` |
| `searchMemory()` | 语义搜索记忆 | `const results = await searchMemory('用户偏好', topK=3)` |

## ⚠️ 注意事项

- 短期记忆不要超过 8K tokens（否则 LLM 处理变慢）
- 长期记忆写入前做去重（相同内容不重复存储）
- 工作记忆在任务完成后及时清理
- 敏感记忆（密码等）需要加密存储或不上传
- 定期做记忆碎片整理（合并相似的记忆条目）
