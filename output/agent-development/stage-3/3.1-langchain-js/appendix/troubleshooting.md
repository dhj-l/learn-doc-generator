# LangChain.js 常见错误排错指南

## 1. 模块导入错误
**现象：** 导入 `@langchain/xxx` 时报 "Cannot find module" 错误
**原因：** 缺少对应的 npm 包
**方案：** 检查 package.json，确保安装了对应的包，如 `@langchain/core`、`@langchain/anthropic` 等

## 2. 模型 API 调用超时
**现象：** 调用 model.invoke() 时长时间无响应或超时
**原因：** 网络延迟或 API 限流
**方案：** 添加重试机制，使用 `.withFallbacks()` 降级到备用模型

## 3. Prompt 模板渲染失败
**现象：** ChatPromptTemplate.fromTemplate() 运行时抛出变量替换错误
**原因：** 模板中的变量名与 invoke 传入的参数名不匹配
**方案：** 检查模板中的 `{variable}` 名称与 invoke 参数名称完全一致

## 4. Chain 的输出类型不符合预期
**现象：** 链的输出是一个复杂对象而不是字符串
**原因：** pipe 串联时最后一个 Runnable 的输出类型不是字符串
**方案：** 在链的末尾添加 `pipe(new StringOutputParser())`

## 5. 向量数据库检索结果为空
**现象：** retriever.invoke() 返回空数组
**原因：** Embedding 模型不匹配或向量库尚未填充数据
**方案：** 确保使用同一个 Embedding 模型生成索引和查询；检查文档是否已写入

## 6. 流式输出在 SSR 环境下报错
**现象：** 在 Next.js 服务端组件中使用 streamText 时报错
**原因：** streamText 依赖于 Node.js 流，在 SSR 中不兼容
**方案：** 确保流式调用仅在客户端组件或 API Route 中使用

## 7. 回调函数未触发
**现象：** 注册的 Callback Handler 没有被调用
**原因：** Callback 注册在错误的层级（模型级 vs 调用级）
**方案：** 在 chain.invoke() 的 options 中传入 callbacks 参数

## 8. RunnableSequence 与 pipe 混用导致类型错误
**现象：** RunnableSequence.from() 与 .pipe() 混用时 TypeScript 报类型不匹配
**原因：** 两种链式写法的类型推断机制不同
**方案：** 统一使用 pipe 操作符，避免混用

## 9. 上下文窗口超出限制
**现象：** 调用 LLM 时返回 "context length exceeded" 错误
**原因：** 累积的消息过多，超过了模型的最大上下文窗口
**方案：** 减少传递的文档数量，使用更小的 chunk_size，或裁剪对话历史

## 10. 文档加载器返回空内容
**现象：** loader.load() 返回的文档内容为空
**原因：** 文件路径错误或加载器不支持该文件格式
**方案：** 检查文件路径是否正确，确认加载器支持该文件类型

## 11. 内存向量数据库在服务重启后数据丢失
**现象：** 服务重启后检索不到之前的数据
**原因：** MemoryVectorStore 的数据只保存在内存中
**方案：** 使用持久化向量数据库（如 Chroma、Pinecone），或在重启前序列化保存

## 12. 多查询检索结果重复
**现象：** MultiQueryRetriever 返回大量重复文档
**原因：** 多个查询生成了相似的结果
**方案：** 对结果进行去重，或使用 MMR 检索来增加多样性

## 13. PDF 加载返回乱码
**现象：** PDFLoader 加载中文 PDF 出现乱码
**原因：** PDF 中文字体未正确解析
**方案：** 安装 pdf-parse 的字体包，或使用 OCR 方式处理扫描版 PDF

## 14. 链式调用中某个步骤报错导致整条链中断
**现象：** 链中的 LLM 调用或工具调用出错，整条链抛出异常
**原因：** 没有设置错误处理和降级机制
**方案：** 使用 `.withFallbacks()` 设置备用链，使用 `.withRetry()` 设置重试

## 15. LangSmith 追踪不生效
**现象：** 设置了环境变量但 LangSmith 上看不到调用记录
**原因：** LANGCHAIN_API_KEY 或 LANGCHAIN_PROJECT 环境变量未正确设置
**方案：** 检查 LANGCHAIN_API_KEY、LANGCHAIN_TRACING_V2=true、LANGCHAIN_PROJECT 是否正确配置
