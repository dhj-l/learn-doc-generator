# 向量数据库常见错误排错指南

---

## 1. 检索结果不相关

**原因：** Embedding 模型不适合当前语言或领域

**解决方案：**
- 中文场景用 BGE-M3 或 BGE-large-zh
- 检查分块策略是否合理
- 尝试混合检索（语义 + 关键词）

---

## 2. ChromaDB 查询慢

**原因：** 数据量超过内存限制或没有创建索引

**解决方案：**
- 数据量 > 10 万条考虑切换 Pinecone/Milvus
- 确保使用 HNSW 索引（ChromaDB 默认开启）

---

## 3. Embedding API 调用失败 (429)

**原因：** 批量请求超出速率限制

**解决方案：**
- 分批处理（每批 100 条）
- 添加重试逻辑和指数退避
- 使用本地 Embedding 模型

---

## 4. 向量维度不匹配

**错误：** `Vector dimension mismatch`

**解决方案：**
- 确保存储和查询使用同一个 Embedding 模型
- 创建 Collection 时指定正确的 dimension

---

## 5. 元数据过滤不生效

**原因：** ChromaDB 的 where 过滤器语法错误

**解决方案：**
```typescript
// ✅ 正确
where: { category: { $eq: 'frontend' } }
// ❌ 错误
where: { category: 'frontend' }
```

---

## 6. 分块后上下文丢失

**原因：** chunkSize 太小或 overlap 不够

**解决方案：**
- 增大 chunkSize（500 → 1000）
- 增大 overlap（50 → 100）
- 使用按段落分块代替固定长度分块

---

## 7. Pinecone 索引创建后不可用

**原因：** Serverless 索引需要初始化时间

**解决方案：**
- 创建后等待 1-2 分钟再使用
- 使用 Poll 方法检查索引状态

---

## 8. RAG 回答质量差

**排查顺序：**
1. 检查检索结果是否相关 → 调整 Embedding 模型或分块策略
2. 检查上下文是否完整 → 增加 topK 数量
3. 检查 Prompt 是否合理 → 优化 System Prompt
