# 第4-7章概要

## 第4章：文档加载器

```typescript
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';

// 加载文本文件
const textDocs = await new TextLoader('./data.txt').load();

// 加载 PDF
const pdfDocs = await new PDFLoader('./document.pdf').load();

// 加载网页
const webDocs = await new CheerioWebBaseLoader('https://example.com').load();
```

## 第5章：Retriever 检索器

```typescript
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';

// 创建向量存储
const vectorStore = await MemoryVectorStore.fromDocuments(docs, new OpenAIEmbeddings());

// 创建检索器
const retriever = vectorStore.asRetriever({ k: 5 });

// RAG 链
const ragChain = RunnableSequence.from([
  {
    context: retriever.pipe(docs => docs.map(d => d.pageContent).join('\n')),
    question: new RunnablePassthrough(),
  },
  prompt,
  model,
  new StringOutputParser(),
]);
```

## 第6章：Callbacks 与调试

```typescript
const chain = prompt.pipe(model).pipe(parser);

await chain.invoke(
  { concept: 'TypeScript' },
  {
    callbacks: [{
      handleLLMStart: (llm, prompts) => console.log('LLM 开始:', prompts),
      handleLLMEnd: (output) => console.log('LLM 结束:', output),
      handleLLMError: (err) => console.error('LLM 错误:', err),
    }],
  }
);
```

## 第7章：综合实战 — 文档问答助手

```typescript
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });

const prompt = ChatPromptTemplate.fromTemplate(`
基于以下上下文回答问题。如果上下文中没有相关信息，请说明。

上下文：
{context}

问题：{question}
`);

// RAG Chain
const ragChain = RunnableSequence.from([
  {
    context: async (input: { question: string }) => {
      const docs = await retriever.invoke(input.question);
      return docs.map(d => d.pageContent).join('\n\n');
    },
    question: (input: { question: string }) => input.question,
  },
  prompt,
  model,
  new StringOutputParser(),
]);

const answer = await ragChain.invoke({ question: '什么是微服务？' });
console.log(answer);
```
