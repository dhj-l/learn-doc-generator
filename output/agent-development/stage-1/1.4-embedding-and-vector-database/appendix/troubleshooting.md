# 向量数据库常见错误排错指南

---

## 1. 检索结果不相关

**错误信息：** 查询返回的文档与搜索意图明显不匹配

**原因分析：** Embedding 模型不适合当前语言或领域，或者分块策略不合理

**解决方案：**
- 中文场景用 BGE-M3 或 BGE-large-zh，而不是英文优化的模型
- 检查分块策略是否合理（chunkSize 太小会丢失上下文，太大则噪声多）
- 尝试混合检索（语义 + 关键词）来补偿语义检索的盲区

---

## 2. ChromaDB 查询慢

**错误信息：** 查询耗时从几毫秒增长到几秒

**原因分析：** 数据量超过了内存限制，或者没有创建合适的索引

**解决方案：**
- 数据量大于 10 万条时考虑切换到 Pinecone 或 Milvus
- 确保使用 HNSW 索引（ChromaDB 默认开启）
- 减小 topK 值（从 20 降到 10）

---

## 3. Embedding API 调用失败 (429)

**错误信息：** `429 Rate Limit` 或 `Too Many Requests`

**原因分析：** 批量请求超出了 API 提供商的速率限制

**解决方案：**
- 分批处理（每批 100 条，降低并发数）
- 添加重试逻辑和指数退避
- 切换到本地 Embedding 模型（完全不受限流影响）

---

## 4. 向量维度不匹配

**错误信息：** `Vector dimension mismatch` 或 `Expected 1536 dimensions, got 1024`

**原因分析：** 存储和查询使用了不同的 Embedding 模型

**解决方案：**
- 确保存储和查询使用同一个 Embedding 模型和同一版本
- 创建 Collection 时明确指定 `dimension` 参数
- 建议将模型名称和维度作为元数据一起存储

---

## 5. 元数据过滤不生效

**错误信息：** 过滤条件被忽略或返回空结果

**原因分析：** ChromaDB 的 `where` 过滤器语法使用错误

**解决方案：**
```typescript
// 正确用法（使用 $eq 操作符）
where: { category: { $eq: 'frontend' } }
// 错误用法（直接赋值不会生效）
where: { category: 'frontend' }
```

---

## 6. 分块后上下文丢失

**现象：** 检索到的片段内容不完整，缺少关键上下文

**原因分析：** chunkSize 太小或 overlap 不够，导致相关句子被拆分到不同块

**解决方案：**
- 增大 chunkSize（500 到 1000）
- 增大 overlap（50 到 100）
- 使用按段落分块代替固定长度分块
- 考虑使用语义分块（Sentence Transformers）

---

## 7. Pinecone 索引创建后不可用

**错误信息：** `Index not ready` 或查询返回 503

**原因分析：** Serverless 索引需要初始化时间（通常 1-3 分钟）

**解决方案：**
- 创建索引后等待 1-2 分钟再使用
- 使用轮询方法检查索引状态：`describeIndex()`
- 使用 Pod 类型索引（初始化更快）

---

## 8. RAG 回答质量差

**现象：** LLM 基于检索结果生成的答案质量不佳

**错误信息：** 无显式错误，但回答内容不准确

**排查顺序：**
1. 检查检索结果是否相关：调整 Embedding 模型或分块策略
2. 检查上下文是否完整：增加 topK 数量（3 → 5）
3. 检查 Prompt 是否合理：优化 System Prompt，加入明确的指令

---

## 9. 批量 Embedding 顺序错乱

**现象：** 返回的向量与输入文本的顺序不对应

**原因分析：** API 返回结果没有按原始顺序排序

**解决方案：** 始终对返回结果按 `index` 字段排序：
```typescript
response.data.sort((a, b) => a.index - b.index)
```

---

## 10. 本地模型内存溢出

**错误信息：** `OutOfMemory` 或进程崩溃

**原因分析：** 模型文件太大（如 BGE-M3 约 1.3GB），超出了可用内存

**解决方案：**
- 使用量化版本（INT8 约 350MB）
- 切换到更轻量的模型（nomic-embed-text 仅 137MB）
- 分批处理文本，避免同时加载过多数据

---

## 11. Collection 重复创建

**现象：** 每次重启应用都创建新的 Collection，旧数据丢失

**原因分析：** 没有检查 Collection 是否已存在

**解决方案：**
```typescript
// 正确做法：先检查是否存在
const collections = await client.listCollections();
if (!collections.includes('my-collection')) {
  await client.createCollection({ name: 'my-collection' });
}
// 或使用 getOrCreateCollection
await client.getOrCreateCollection({ name: 'my-collection' });
```

---

## 12. 语义搜索返回重复结果

**现象：** 同一个文档在搜索结果中出现多次

**原因分析：** 同一文档的不同分块被分别计算为独立结果

**解决方案：**
- 在元数据中添加 `documentId` 字段
- 在应用层去重（按 `documentId` 聚合后取最高分块）
- 增加分块重叠检查逻辑

---

## 13. 混合检索权重调优困难

**现象：** 语义检索和关键词检索的结果无法有效融合

**原因分析：** 两种检索的分数不在同一量纲，直接相加没有意义

**解决方案：**
```typescript
// 对两种分数分别做归一化后再加权融合
const semanticScore = normalize(semanticResults);
const keywordScore = normalize(keywordResults);
const combined = 0.7 * semanticScore + 0.3 * keywordScore;
```

---

## 14. 向量索引构建时间长

**现象：** 插入大量数据后，查询速度没有立即提升

**原因分析：** 向量索引（如 HNSW）需要在后台构建，数据量大时耗时较长

**解决方案：**
- 在低峰期批量插入数据
- 使用支持增量索引的数据库（如 Milvus）
- 将 `M` 参数调小（如 16 到 8）可加快索引构建，但会略微降低召回率

---

## 15. Embedding 模型版本不兼容

**现象：** 旧数据的向量与新数据的向量无法一起检索

**原因分析：** 升级了 Embedding 模型版本后，新旧向量的语义空间不一致

**解决方案：**
- 在 Collection 的元数据中记录使用的模型名称和版本
- 模型升级后，重新生成所有旧数据的 Embedding
- 或为不同版本的向量创建独立的 Collection
