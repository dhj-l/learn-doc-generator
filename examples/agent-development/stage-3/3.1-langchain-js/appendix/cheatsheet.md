# LangChain.js 速查表

## 🚀 安装

```bash
# 核心包
npm install langchain @langchain/core

# 模型提供商（选择需要的）
npm install @langchain/anthropic    # Claude
npm install @langchain/openai       # GPT / OpenAI 兼容模型

# 文档处理
npm install @langchain/community    # 社区集成（PDF、网页等）

# 向量存储
npm install @langchain/pinecone     # Pinecone
# 或
npm install chromadb                # ChromaDB

# 工具
npm install zod                     # Schema 验证
```

## 🔗 LCEL 管道操作

```typescript
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

// 基础管道
const chain = prompt.pipe(model).pipe(parser);
const result = await chain.invoke({ key: 'value' });

// 并行执行
import { RunnableParallel } from '@langchain/core/runnables';
const parallel = RunnableParallel.from({ a: chainA, b: chainB });
const results = await parallel.invoke({ input: '...' });

// 序列执行
import { RunnableSequence } from '@langchain/core/runnables';
const seq = RunnableSequence.from([step1, step2, step3]);

// 条件分支
import { RunnableBranch } from '@langchain/core/runnables';
const branch = RunnableBranch.from([
  [condition1, chain1],
  [condition2, chain2],
  defaultChain,  // 默认分支
]);

// 流式处理
for await (const chunk of await chain.stream({})) { process.stdout.write(chunk); }

// 批量处理
const results = await chain.batch([{ input: 'a' }, { input: 'b' }]);

// 降级 + 重试
const safe = chain.withFallbacks([fallbackChain]);
const retry = chain.withRetry({ stopAfterAttempt: 3 });
```

## 📦 核心组件速查

| 组件 | 包 | 用途 | 常用方法 |
|------|-----|------|----------|
| ChatAnthropic | `@langchain/anthropic` | Claude 模型 | `.invoke()`, `.stream()` |
| ChatOpenAI | `@langchain/openai` | GPT 模型 | `.invoke()`, `.stream()` |
| ChatPromptTemplate | `@langchain/core/prompts` | 提示词模板 | `.fromTemplate()`, `.fromMessages()` |
| StringOutputParser | `@langchain/core/output_parsers` | 文本输出 | `.invoke()` |
| JsonOutputParser | `@langchain/core/output_parsers` | JSON 输出 | `.invoke()` |
| StructuredOutputParser | `langchain/output_parsers` | Schema 输出 | `.fromNamesAndDescriptions()` |
| TextLoader | `langchain/document_loaders/fs/text` | 文本文件 | `.load()` |
| PDFLoader | `@langchain/community/document_loaders/fs/pdf` | PDF 文件 | `.load()` |
| CheerioWebBaseLoader | `@langchain/community/document_loaders/web/cheerio` | 网页 | `.load()` |
| RecursiveCharacterTextSplitter | `langchain/text_splitter` | 文本分块 | `.splitDocuments()` |
| MemoryVectorStore | `langchain/vectorstores/memory` | 内存向量库 | `.fromDocuments()`, `.similaritySearch()` |
| OpenAIEmbeddings | `@langchain/openai` | Embedding | `.embedQuery()`, `.embedDocuments()` |

## 🔍 检索策略

```typescript
// 相似度检索
const retriever = vectorStore.asRetriever({ k: 3, searchType: 'similarity' });

// MMR（多样性检索）
const mmr = vectorStore.asRetriever({ k: 3, searchType: 'mmr', searchKwargs: { fetchK: 10, lambda: 0.5 } });

// 带过滤
const filtered = vectorStore.asRetriever({ k: 3, filter: { category: 'frontend' } });
```

## 📝 输出解析

```typescript
// Zod Schema + withStructuredOutput（推荐）
import { z } from 'zod';
const schema = z.object({ answer: z.string(), score: z.number() });
const structured = model.withStructuredOutput(schema);
const result = await structured.invoke('...');  // 类型安全
```

## 🔄 Callback

```typescript
import { ConsoleCallbackHandler } from '@langchain/core/tracers/console';

// 传入回调
await chain.invoke(input, { callbacks: [new ConsoleCallbackHandler()] });

// 环境变量启用 LangSmith
// LANGCHAIN_TRACING_V2=true
// LANGCHAIN_API_KEY=ls-...
```

## 📐 分块参数参考

| 场景 | chunkSize | chunkOverlap |
|------|-----------|--------------|
| 精确问答 | 200-500 | 50 |
| 长文分析 | 1000-2000 | 100-200 |
| 代码文档 | 500-1000 | 100 |
| 通用推荐 | 500 | 50 |
