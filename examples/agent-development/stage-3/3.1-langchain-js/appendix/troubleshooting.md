# LangChain.js 常见错误排错指南

## 1. 模块导入错误

**错误信息：**
```
Error: Cannot find module '@langchain/core/prompts'
```

**原因：** 未安装对应的包，或包版本不兼容。

**解决方案：**
```bash
# 确保安装了核心包
npm install langchain @langchain/core

# 如果使用特定提供商
npm install @langchain/anthropic
npm install @langchain/openai

# 检查 package.json 中的版本
cat node_modules/@langchain/core/package.json | grep version
```

---

## 2. LCEL 链类型不匹配

**错误信息：**
```
TypeError: Cannot read properties of undefined (reading 'invoke')
```

**原因：** `.pipe()` 链中某个组件返回了非 Runnable 的类型。

**解决方案：**
```typescript
// ❌ 错误：函数返回值不是 Runnable
const chain = prompt.pipe(model).pipe((output) => output.content.toUpperCase());

// ✅ 正确：使用 RunnableLambda 包装
import { RunnableLambda } from '@langchain/core/runnables';
const chain = prompt.pipe(model).pipe(
  RunnableLambda.from((output) => output.content.toUpperCase())
);

// ✅ 或使用 StringOutputParser 提取文本后再处理
const chain = prompt.pipe(model).pipe(new StringOutputParser()).pipe(
  RunnableLambda.from((text) => text.toUpperCase())
);
```

---

## 3. DocumentLoader 加载返回空数组

**错误信息：** `load()` 返回 `[]`，没有任何文档。

**原因：**
- 文件路径不存在或拼写错误
- 文件编码不是 UTF-8
- PDF 是扫描版（纯图片），无法提取文本

**解决方案：**
```typescript
import path from 'path';

// 使用绝对路径
const loader = new TextLoader(path.resolve(__dirname, '../data/article.txt'));

// 验证文件存在
import fs from 'fs';
const filePath = './data/article.txt';
if (!fs.existsSync(filePath)) {
  console.error(`文件不存在: ${filePath}`);
}

// 对于扫描版 PDF，需要 OCR 预处理
```

---

## 4. 向量检索结果不相关

**问题：** `similaritySearch()` 返回的文档与查询不相关。

**原因和解决方案：**

```typescript
// 原因 1：chunkSize 太大，混合了不同主题
// → 减小 chunkSize
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 300,  // 从 1000 减到 300
  chunkOverlap: 30,
});

// 原因 2：Embedding 模型质量不好
// → 使用更好的 Embedding 模型
const embeddings = new OpenAIEmbeddings({
  modelName: 'text-embedding-3-small',  // 推荐
});

// 原因 3：查询太短或太模糊
// → 使用多查询检索
const multiQuery = `将以下问题扩展为 3 个不同角度的查询：${question}`;
```

---

## 5. withStructuredOutput 返回不正确

**错误信息：** Zod 验证失败，或返回字段缺失。

**原因：** 模型没有按照 Schema 要求输出。

**解决方案：**
```typescript
// 确保 describe() 描述清晰
const schema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral'])
    .describe('情感倾向，只能是这三个值之一'),  // ← 明确约束
  score: z.number().min(0).max(10)
    .describe('0-10 之间的整数评分'),  // ← 明确范围
});

// 使用 includeRaw 获取原始输出用于调试
const structured = model.withStructuredOutput(schema, { includeRaw: true });
const result = await structured.invoke('...');
console.log(result.raw);  // 查看模型的原始输出
```

---

## 6. 流式输出不完整

**问题：** `chain.stream()` 输出的内容不完整或乱序。

**原因：** 并行链的流式输出需要特殊处理。

**解决方案：**
```typescript
// 使用 streamEvents 获取结构化的事件流
const stream = await chain.streamEvents(input, { version: 'v2' });

for await (const event of stream) {
  if (event.event === 'on_chat_model_stream') {
    // 只处理 LLM 的 Token 输出
    process.stdout.write(event.data?.chunk?.content || '');
  }
}
```

---

## 7. PDF 加载中文乱码

**错误信息：** 加载的 PDF 内容显示为乱码。

**原因：** PDF 使用了非标准字体或嵌入了图片文字。

**解决方案：**
```bash
# 安装支持更多字体的 PDF 解析器
npm install pdf-parse

# 如果仍然乱码，使用 OCR 方案
npm install tesseract.js
```

---

## 8. Embedding API 超时

**错误信息：** `TimeoutError: Request timed out`

**原因：** 一次性发送太多文本给 Embedding API。

**解决方案：**
```typescript
// 分批处理
async function embedInBatches(vectorStore: MemoryVectorStore, docs: Document[], batchSize = 50) {
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    console.log(`处理第 ${Math.floor(i / batchSize) + 1} 批...`);
    await vectorStore.addDocuments(batch);
    if (i + batchSize < docs.length) {
      await new Promise(r => setTimeout(r, 1000));  // 避免限流
    }
  }
}
```

---

## 9. MemoryVectorStore 数据丢失

**问题：** 重启程序后向量存储中的数据消失。

**原因：** `MemoryVectorStore` 存储在内存中，进程退出即丢失。

**解决方案：**
```typescript
// 方案 1：使用持久化向量数据库
import { ChromaClient } from 'chromadb';  // 或 Pinecone

// 方案 2：序列化到文件
const data = await vectorStore.serialize();
fs.writeFileSync('./vector-store.json', JSON.stringify(data));

// 恢复
const restored = await MemoryVectorStore.deserialize(
  JSON.parse(fs.readFileSync('./vector-store.json', 'utf-8')),
  embeddings
);
```

---

## 10. LangSmith 追踪不显示

**问题：** 设置了环境变量，但 LangSmith 控制台没有数据。

**解决方案：**
```bash
# 确认所有必要的环境变量都设置了
echo $LANGCHAIN_TRACING_V2     # 应该是 "true"
echo $LANGCHAIN_API_KEY        # 应该是 "ls-..."
echo $LANGCHAIN_PROJECT        # 项目名称

# 确认 API Key 有效
curl -H "Authorization: Bearer $LANGCHAIN_API_KEY" https://api.smith.langchain.com/info

# 确认网络可以访问 LangSmith
curl https://api.smith.langchain.com/health
```

---

## 11. Callback 中的异步问题

**错误信息：** Callback 中的日志没有按顺序输出。

**解决方案：**
```typescript
// 确保所有 Callback 方法都是 async
class MyCallback extends BaseCallbackHandler {
  // ✅ 正确：async 方法
  async handleLLMEnd(output: any) {
    await someAsyncOperation();
  }

  // ❌ 错误：同步方法中调用异步操作
  handleLLMEnd(output: any) {
    someAsyncOperation();  // 没有 await，不会等待完成
  }
}
```

---

## 12. 多轮对话上下文丢失

**问题：** Agent 在多轮对话中「忘记」了之前的对话内容。

**解决方案：**
```typescript
// 手动维护对话历史
const history: Array<{ role: string; content: string }> = [];

async function chat(question: string) {
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', '你是一个助手。'],
    new MessagesPlaceholder('history'),
    ['user', '{question}'],
  ]);

  const chain = prompt.pipe(model).pipe(parser);
  const answer = await chain.invoke({
    question,
    history: history.map(h => [h.role, h.content]),
  });

  // 更新历史
  history.push({ role: 'user', content: question });
  history.push({ role: 'assistant', content: answer });

  return answer;
}

## 13. 上下文窗口超出限制
**现象：** 调用 LLM 时返回 "context length exceeded" 错误
**原因：** 累积的消息或文档块超过了模型的最大上下文窗口
**方案：** 减少传递给 LLM 的文档数量，使用更小的 chunk_size，或启用对话历史裁剪

## 14. 流式输出在 SSR 环境下报错
**现象：** 在 Next.js 服务端组件中使用 streamText 时报错
**原因：** streamText 依赖于浏览器环境或 Node.js 流，在 SSR 中不兼容
**方案：** 确保流式调用仅在客户端组件或 API Route 中使用，服务端使用 generateText

## 15. RunnableSequence 与 pipe 混用导致类型错误
**现象：** RunnableSequence.from() 与 .pipe() 混用时 TypeScript 报类型不匹配
**原因：** RunnableSequence 是类式写法，pipe 是函数式写法，两者的类型推断机制不同
**方案：** 统一使用 pipe 操作符，避免混用两种链式写法
```
