# 第7章：综合实战 — 文档问答助手

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **综合运用 LangChain.js 全部核心能力** — 文档加载、分块、检索、生成、解析
- **构建生产级的 RAG 应用** — 多数据源、混合检索、错误处理、成本控制
- **实现完整的前后端问答系统** — API 接口 + 流式响应 + 对话历史

## 📋 前置知识

> 建议按顺序完成以下章节：
> - [第1-6章](./01-introduction.md) — 所有前置章节

---

## 💡 项目概述

我们将构建一个**技术文档问答助手**，功能包括：

```
┌─────────────────────────────────────────────────────┐
│            文档问答助手 — 功能架构                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  📂 数据源                                            │
│  ├── Markdown 文件（技术博客、API 文档）                │
│  ├── PDF 文件（白皮书、设计文档）                       │
│  └── 网页（官方文档站）                                 │
│                                                      │
│  ⚙️ 处理管线                                          │
│  ├── DocumentLoader → TextSplitter                   │
│  ├── Embedding → VectorStore                         │
│  └── Retriever → RAG Chain → OutputParser            │
│                                                      │
│  🔧 高级功能                                          │
│  ├── 多查询检索（提高召回率）                           │
│  ├── 对话历史（多轮对话）                               │
│  ├── 来源引用（标注答案出处）                           │
│  └── 成本追踪（Token 消耗统计）                        │
│                                                      │
│  🌐 API                                              │
│  ├── POST /ask — 提问（支持流式响应）                  │
│  ├── POST /ingest — 导入文档                          │
│  └── GET /stats — 查看统计数据                        │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## 🔨 实战演练

### 第一步：项目初始化

```bash
mkdir doc-qa-assistant && cd doc-qa-assistant
npm init -y
npm install langchain @langchain/core @langchain/anthropic @langchain/openai \
  @langchain/community express cors dotenv zod
npm install -D typescript @types/node @types/express tsx
npx tsc --init
```

```json
// package.json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "ingest": "tsx src/ingest.ts"
  }
}
```

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### 第二步：文档处理管线

```typescript
// src/ingestion.ts
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';

export class DocumentIngestor {
  private splitter: RecursiveCharacterTextSplitter;
  private embeddings: OpenAIEmbeddings;
  private vectorStore: MemoryVectorStore | null = null;

  constructor() {
    // 配置分块策略
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
      separators: ['\n\n', '\n', '。', '！', '？', '.', '!', '?', ' ', ''],
    });

    this.embeddings = new OpenAIEmbeddings({
      modelName: 'text-embedding-3-small',  // 性价比最高
    });
  }

  // 从本地目录加载
  async loadFromDirectory(path: string): Promise<Document[]> {
    console.log(`📂 加载目录: ${path}`);
    const loader = new DirectoryLoader(path, {
      '.txt': (p) => new TextLoader(p),
      '.md': (p) => new TextLoader(p),
      '.pdf': (p) => new PDFLoader(p),
    });

    const docs = await loader.load();
    console.log(`  加载了 ${docs.length} 个文件`);
    return docs;
  }

  // 从网页加载
  async loadFromUrls(urls: string[]): Promise<Document[]> {
    console.log(`🌐 加载 ${urls.length} 个网页...`);
    const results = await Promise.allSettled(
      urls.map(async (url) => {
        const loader = new CheerioWebBaseLoader(url);
        return loader.load();
      })
    );

    const docs = results
      .filter((r): r is PromiseFulfilledResult<Document[]> => r.status === 'fulfilled')
      .flatMap(r => r.value);

    console.log(`  成功加载 ${docs.length} 个页面`);
    return docs;
  }

  // 分块
  async split(docs: Document[]): Promise<Document[]> {
    console.log(`✂️ 分块中...`);
    const chunks = await this.splitter.splitDocuments(docs);
    console.log(`  ${docs.length} 个文档 → ${chunks.length} 个块`);
    return chunks;
  }

  // 构建向量存储
  async buildVectorStore(chunks: Document[]): Promise<MemoryVectorStore> {
    console.log(`🔢 生成 Embedding...`);
    this.vectorStore = await MemoryVectorStore.fromDocuments(chunks, this.embeddings);
    console.log(`  ✅ 向量存储就绪`);
    return this.vectorStore;
  }

  // 一键导入
  async ingest(config: {
    localPaths?: string[];
    webUrls?: string[];
  }): Promise<MemoryVectorStore> {
    const allDocs: Document[] = [];

    if (config.localPaths?.length) {
      for (const path of config.localPaths) {
        allDocs.push(...await this.loadFromDirectory(path));
      }
    }

    if (config.webUrls?.length) {
      allDocs.push(...await this.loadFromUrls(config.webUrls));
    }

    if (allDocs.length === 0) {
      throw new Error('没有加载到任何文档');
    }

    // 添加统一元数据
    const enrichedDocs = allDocs.map(doc => new Document({
      pageContent: doc.pageContent,
      metadata: {
        ...doc.metadata,
        ingestedAt: new Date().toISOString(),
      },
    }));

    const chunks = await this.split(enrichedDocs);
    return this.buildVectorStore(chunks);
  }

  getVectorStore(): MemoryVectorStore | null {
    return this.vectorStore;
  }
}
```

### 第三步：RAG 问答引擎

```typescript
// src/qa-engine.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { z } from 'zod';

// 回答 Schema（结构化输出）
const answerSchema = z.object({
  answer: z.string().describe('对用户问题的回答'),
  sources: z.array(z.string()).describe('回答依据的文档来源'),
  confidence: z.enum(['high', 'medium', 'low']).describe('回答的置信度'),
});

interface QAEngineConfig {
  vectorStore: MemoryVectorStore;
  modelName?: string;
  topK?: number;
}

export class QAEngine {
  private model: ChatAnthropic;
  private retriever: any;
  private chain: any;
  private costTracker: CostTrackerCallback;

  constructor(config: QAEngineConfig) {
    this.model = new ChatAnthropic({
      modelName: config.modelName || 'claude-sonnet-4-5-20241022',
      maxTokens: 2048,
    });

    this.retriever = config.vectorStore.asRetriever({
      k: config.topK || 3,
      searchType: 'mmr',  // 使用 MMR 增加多样性
      searchKwargs: { fetchK: 10, lambda: 0.5 },
    });

    this.costTracker = new CostTrackerCallback();

    this.buildChain();
  }

  private buildChain() {
    // RAG 提示模板
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `你是一个技术文档问答助手。基于以下检索到的文档片段回答用户问题。

规则：
1. 只基于提供的文档内容回答，不要编造信息
2. 如果文档中没有相关信息，明确告知用户
3. 回答要准确、简洁、有条理
4. 引用具体文档来源

检索到的文档：
{context}`],
      new MessagesPlaceholder('chat_history'),  // 对话历史
      ['user', '{question}'],
    ]);

    // 格式化文档
    const formatDocs = (docs: any[]) =>
      docs.map((doc, i) => {
        const source = doc.metadata.source || '未知来源';
        return `[文档 ${i + 1}] (来源: ${source})\n${doc.pageContent}`;
      }).join('\n\n---\n\n');

    // 构建链
    this.chain = RunnableSequence.from([
      {
        context: async (input: any) => {
          const docs = await this.retriever.invoke(input.question);
          return formatDocs(docs);
        },
        question: new RunnablePassthrough(),
        chat_history: (input: any) => input.chat_history || [],
      },
      prompt,
      this.model,
      new StringOutputParser(),
    ]);
  }

  async ask(
    question: string,
    chatHistory: Array<{ role: string; content: string }> = []
  ) {
    const start = Date.now();

    const answer = await this.chain.invoke(
      { question, chat_history: chatHistory },
      { callbacks: [this.costTracker] }
    );

    const elapsed = Date.now() - start;

    return {
      answer,
      elapsed,
      cost: this.costTracker.getLastCost(),
    };
  }

  // 流式问答
  async *askStream(
    question: string,
    chatHistory: Array<{ role: string; content: string }> = []
  ) {
    const stream = await this.chain.streamEvents(
      { question, chat_history: chatHistory },
      { version: 'v2' }
    );

    for await (const event of stream) {
      if (event.event === 'on_chat_model_stream') {
        const content = event.data?.chunk?.content;
        if (content) yield content;
      }
    }
  }

  getStats() {
    return {
      totalCost: this.costTracker.getTotalCost(),
      totalCalls: this.costTracker.getCallCount(),
    };
  }
}

// 成本追踪 Callback
class CostTrackerCallback extends BaseCallbackHandler {
  name = 'CostTracker';
  private totalCost = 0;
  private lastCost = 0;
  private callCount = 0;

  async handleLLMEnd(output: any) {
    const usage = output.llmOutput?.usage;
    if (usage) {
      const cost = ((usage.input_tokens || 0) * 3 + (usage.output_tokens || 0) * 15) / 1_000_000;
      this.totalCost += cost;
      this.lastCost = cost;
      this.callCount++;
    }
  }

  getTotalCost() { return this.totalCost; }
  getLastCost() { return this.lastCost; }
  getCallCount() { return this.callCount; }
}
```

### 第四步：API 服务

```typescript
// src/server.ts
import express from 'express';
import cors from 'cors';
import { DocumentIngestor } from './ingestion';
import { QAEngine } from './qa-engine';

const app = express();
app.use(cors());
app.use(express.json());

// 全局状态
let qaEngine: QAEngine | null = null;
const conversationHistory: Map<string, Array<{ role: string; content: string }>> = new Map();

// 导入文档
app.post('/ingest', async (req, res) => {
  try {
    const { localPaths, webUrls } = req.body;
    const ingestor = new DocumentIngestor();
    const vectorStore = await ingestor.ingest({ localPaths, webUrls });
    qaEngine = new QAEngine({ vectorStore });

    res.json({ success: true, message: '文档导入成功' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 提问
app.post('/ask', async (req, res) => {
  if (!qaEngine) {
    return res.status(400).json({ error: '请先导入文档' });
  }

  const { question, sessionId = 'default', stream = false } = req.body;

  // 获取对话历史
  if (!conversationHistory.has(sessionId)) {
    conversationHistory.set(sessionId, []);
  }
  const history = conversationHistory.get(sessionId)!;

  if (stream) {
    // 流式响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullAnswer = '';
    for await (const chunk of qaEngine.askStream(question, history)) {
      fullAnswer += chunk;
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    // 更新对话历史
    history.push({ role: 'user', content: question });
    history.push({ role: 'assistant', content: fullAnswer });

    // 限制历史长度
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } else {
    // 非流式响应
    const result = await qaEngine.ask(question, history);

    // 更新对话历史
    history.push({ role: 'user', content: question });
    history.push({ role: 'assistant', content: result.answer });

    res.json({
      answer: result.answer,
      elapsed: result.elapsed,
      cost: result.cost,
    });
  }
});

// 统计
app.get('/stats', (req, res) => {
  res.json(qaEngine?.getStats() || { message: '引擎未初始化' });
});

// 启动
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 文档问答助手运行在 http://localhost:${PORT}`);
  console.log(`\nAPI:`);
  console.log(`  POST /ingest  — 导入文档`);
  console.log(`  POST /ask     — 提问`);
  console.log(`  GET  /stats   — 统计`);
});
```

### 第五步：使用和测试

```typescript
// src/ingest.ts — 独立的导入脚本
import 'dotenv/config';
import { DocumentIngestor } from './ingestion';

async function main() {
  const ingestor = new DocumentIngestor();

  await ingestor.ingest({
    localPaths: ['./docs'],
    webUrls: [
      'https://docs.anthropic.com/en/docs/about-claude/models',
    ],
  });

  console.log('✅ 文档导入完成！');
}

main().catch(console.error);
```

```bash
# 1. 导入文档
npm run ingest

# 2. 启动服务
npm run dev

# 3. 测试提问
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Claude 有哪些模型？"}'

# 4. 流式提问
curl -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Vue 3 的 Composition API 怎么用？", "stream": true}'
```

---

## ⚡ 进阶技巧

### 技巧一：分批导入大量文档

```typescript
// 处理大量文档时，分批生成 Embedding 以避免 API 限流
async function batchEmbed(chunks: Document[], batchSize = 100): Promise<void> {
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    console.log(`处理第 ${i / batchSize + 1} 批 (${batch.length} 个块)...`);
    await vectorStore.addDocuments(batch);
    await new Promise(r => setTimeout(r, 1000));  // 避免限流
  }
}
```

### 技巧二：回答质量评估

```typescript
// 用另一个 LLM 调用来评估回答质量
const evaluatePrompt = ChatPromptTemplate.fromTemplate(
  `评估以下回答的质量（1-10 分）。

问题：{question}
回答：{answer}
参考文档：{context}

评分标准：
- 准确性（是否基于文档）：__分
- 完整性（是否回答了问题）：__分
- 清晰度（是否易懂）：__分

返回 JSON: { "score": number, "feedback": "string" }`
);
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：为什么需要先对文档进行分块（chunking）再生成 Embedding？**

> A：LLM 的上下文窗口有限，且检索精度要求文档块小且语义完整。不分块直接 Embedding 会导致：(1) 长文档的语义信息被压缩到单个向量中，检索精度下降；(2) 即使检索到了长文档，也会占用大量上下文 Token。分块策略的关键是选择合适的分块大小和重叠率。

**Q2：为什么使用 MMR 作为检索策略？**

> A：MMR（最大边际相关性）在检索时综合考虑相关性和多样性，避免返回的内容高度相似（都是同一个话题的不同说法）。这样 LLM 在生成回答时可以基于更全面的信息。

**Q3：流式响应和成本追踪如何提升产品体验？**

> A：流式响应让用户无需等待完整输出就能看到内容，极大降低感知延迟。成本追踪帮助开发者了解每次问答的成本，对定价和优化很有价值。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 检索结果与问题不相关 | 分块过大或 Embedding 模型不匹配 | 减小 chunk_size，改用 text-embedding-3-large |
| 对话历史过长导致 Token 超限 | 没有限制对话历史长度 | 设置最大历史轮数（如 20 轮），使用滑动窗口 |
| 流式响应中途断开 | SSE 连接超时或服务器错误 | 添加重连机制和超时处理 |

---

## 📝 本章小结

- ✅ **文档处理管线** — 加载 → 分块 → Embedding → 向量存储
- ✅ **RAG 问答引擎** — 检索 + 生成 + 结构化输出
- ✅ **多轮对话** — 对话历史管理
- ✅ **流式响应** — SSE 实时输出
- ✅ **成本追踪** — Token 消耗统计
- ✅ **生产级架构** — Express API + 错误处理

## ➡️ 下一步

恭喜你完成了 LangChain.js 的全部学习！接下来可以：
- 📘 [3.2 LangGraph](../3.2-langgraph/README.md) — 构建复杂的 Agent 工作流
- 📗 [3.3 Vercel AI SDK](../3.3-vercel-ai-sdk/README.md) — 前端 AI 集成框架
- 📙 [2.4 RAG 系统](../../stage-2/2.4-rag-system/README.md) — 深入 RAG 高级技术
