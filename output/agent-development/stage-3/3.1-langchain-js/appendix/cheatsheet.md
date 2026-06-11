# LangChain.js 速查表

## 🚀 安装
```bash
npm install langchain @langchain/core @langchain/anthropic
```

## 🔗 LCEL 基础
```typescript
const chain = prompt.pipe(model).pipe(parser);
const result = await chain.invoke({ input: '...' });
```

## 📦 核心组件

| 组件 | 用途 |
|------|------|
| ChatModel | LLM 调用 |
| PromptTemplate | 提示词模板 |
| OutputParser | 输出解析 |
| DocumentLoader | 文档加载 |
| TextSplitter | 文本分块 |
| VectorStore | 向量存储 |
| Retriever | 文档检索 |
| Chain | 组件串联 |

## 🌊 流式
```typescript
for await (const chunk of await chain.stream({})) { ... }
```
