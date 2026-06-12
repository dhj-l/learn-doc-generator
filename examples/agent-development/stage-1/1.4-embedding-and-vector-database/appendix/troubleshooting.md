# 向量数据库常见错误排错指南

---

## 1. 检索结果不相关

**现象：** 搜索返回的结果和查询意图完全不符
**原因：** Embedding 模型不适合当前语言或领域
**解决方案：**
- 中文场景用 BGE-M3 或 BGE-large-zh
- 检查分块策略是否合理（chunkSize 太大或太小都会影响精度）
- 尝试混合检索（语义 + 关键词）

---

## 2. ChromaDB 查询慢

**现象：** 每次查询需要数秒甚至更久
**原因：** 数据量超过内存限制或没有创建索引
**解决方案：**
- 数据量 > 10 万条考虑切换 Pinecone/Milvus
- 确保使用 HNSW 索引（ChromaDB 默认开启）
- 检查是否意外使用全表扫描而非索引查询

---

## 3. Embedding API 调用失败 (429)

**现象：** `429 Rate limit exceeded`
**原因：** 批量请求超出速率限制
**解决方案：**
- 分批处理（每批 100 条）
- 添加重试逻辑和指数退避
- 使用本地 Embedding 模型（如 BGE-M3）避免 API 限流

---

## 4. 向量维度不匹配

**现象：** `Vector dimension mismatch` 错误
**原因：** 存储和查询时使用了不同维度的 Embedding
**解决方案：**
- 确保存储和查询使用同一个 Embedding 模型
- 创建 Collection 时指定正确的 dimension（如 text-embedding-3-small 为 1536 维）
- 维度缩减（如 `dimensions: 256`）后查询也要用同样的缩减配置

---

## 5. 元数据过滤不生效

**现象：** where 条件没有过滤掉预期的文档
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

**现象：** 检索到的内容在边界处不连贯，缺乏上下文
**原因：** chunkSize 太小或 overlap 不够
**解决方案：**
- 增大 chunkSize（500 → 1000）
- 增大 overlap（50 → 100）
- 使用按段落分块代替固定长度分块

---

## 7. Pinecone 索引创建后不可用

**现象：** 刚创建的索引立即查询返回空结果
**原因：** Serverless 索引需要初始化时间
**解决方案：**
- 创建后等待 1-2 分钟再使用
- 使用 Poll 方法检查索引状态 `describe_index()`
- 确认索引的 pod 类型和副本数满足查询量

---

## 8. RAG 回答质量差

**现象：** AI 的回答不准确或偏离主题
**排查顺序：**
1. 检查检索结果是否相关 → 调整 Embedding 模型或分块策略
2. 检查上下文是否完整 → 增加 topK 数量
3. 检查 Prompt 是否合理 → 优化 System Prompt

---

## 9. ChromaDB 持久化数据丢失

**现象：** 重启服务后之前存入的数据不见了
**原因：** ChromaDB 默认使用内存存储，未启用持久化
**解决方案：**
```typescript
// 正确初始化持久化 ChromaDB
import { ChromaClient } from 'chromadb';
const client = new ChromaClient({ path: './chroma_data' });
// 或在创建时指定 persist_directory
```

---

## 10. 大批量摄入文档时内存溢出

**现象：** 摄入大量文档（>1万条）时 Node.js 进程 OOM
**原因：** 一次性将所有文档加载到内存中处理
**解决方案：**
- 分批摄入（每批 500-1000 条）
- 使用流式处理，不要一次性加载全部
- 使用本地 Embedding 模型而非 API（减少并发连接数）

---

## 11. Pinecone 成本超出预期

**现象：** 月账单远高于估算
**原因：** Serverless 按读写单元计费，查询量超出免费额度
**解决方案：**
- 监控 `total_read_units` 和 `total_write_units` 指标
- 使用缓存减少重复查询
- 考虑降级到更低成本的 pod 类型

---

## 12. 多语言文档检索不准确

**现象：** 中文文档用英文查询找不到，反之亦然
**原因：** 使用的 Embedding 模型不支持多语言
**解决方案：**
- 使用多语言 Embedding 模型（如 Cohere embed-v3、BGE-M3）
- 查询和文档使用同一语言
- 或将所有文档先翻译为一种语言再索引

---

## 13. 查询相同内容的多次结果不一致

**现象：** 同样的查询词，两次返回的排名不同
**原因：** 使用了近似搜索（ANN）而非精确搜索，每次的近似路径不同
**解决方案：**
- 设置足够大的 `ef_search` 参数（HNSW 索引）
- 接受 ANN 的微小不一致性，这是性能与精度的权衡
- 对需要精确结果的场景使用暴力搜索（`exact_search: true`，慢但精确）

---

## 14. 删除文档后检索结果仍然包含已删除内容

**现象：** 已经删除的文档在搜索结果中仍然出现
**原因：** 向量数据库的变更不是实时生效的，某些实现存在延迟
**解决方案：**
- 删除后调用 `collection.delete()` 并确认返回的删除数量
- 使用软删除（在元数据中添加 `deleted: true` 标记），查询时用 where 过滤
- 定期重建索引清理已删除的记录

---

## 15. Collection 命名冲突

**现象：** `Collection already exists` 错误
**原因：** 重复创建同名的 Collection
**解决方案：**
```typescript
// 获取或创建（推荐）
const collection = await client.getOrCreateCollection({ name: 'my-docs' });
// 或先检查是否存在
const collections = await client.listCollections();
```
