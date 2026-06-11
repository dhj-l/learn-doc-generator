# RAG 系统常见错误排错指南

## 1. 检索不到相关文档
**方案：** 检查分块质量、换用更好的 Embedding 模型、尝试混合检索

## 2. 回答出现幻觉
**方案：** 在 Prompt 中强调「只基于文档回答」，使用 Faithfulness 评估

## 3. 回答不够详细
**方案：** 增加 topK、增大 chunkSize、使用 Multi-hop RAG

## 4. 检索延迟太高
**方案：** 使用缓存、优化向量索引、减少 topK

## 5. Token 成本太高
**方案：** 精简检索结果、使用 Prompt Caching、用便宜模型做重排
