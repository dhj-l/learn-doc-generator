# 第7章：综合实战 — 文档问答助手

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **综合运用前 6 章所有技能** — 构建生产级 RAG 应用
- **构建完整的文档摄取管线** — 加载 → 分割 → 嵌入 → 存储
- **实现智能问答引擎** — 检索 + 生成 + 流式输出
- **构建 Express API 服务** — 封装 RAG 为可调用的 HTTP 接口
- **支持多轮对话** — 记忆上下文，连续追问
- **实现 Token 成本追踪** — 监控每次查询的费用

## 📋 前置知识

> 建议先完成：
> - [第4章：文档加载器](./04-document-loaders.md) — 文档加载
> - [第5章：Retriever 检索器](./05-retrievers.md) — 检索策略
> - [第6章：Callbacks 与调试](./06-callbacks.md) — 监控和调试

---

## 💡 核心概念

### 概念一：RAG 文档问答助手的整体架构

**生活类比：** 这个项目就像建造一个"智能图书馆"。图书馆有两个主要部分：

1. **入库系统（Ingestion Pipeline）** — 类似图书管理员把新书编目、贴标签、上架
2. **咨询台（QA Engine）** — 类似读者问问题，图书管理员检索书架找到答案

```
┌────────────────────────────────────────────────────────────┐
│                  RAG 文档问答助手系统架构                      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  用户 → HTTP 请求                    ← 流式响应             │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────┐    ┌─────────────────────────────┐    │
│  │   Express API    │    │   QA Engine                 │    │
│  │   (HTTP 服务)    │───→│   ├─ Retriever (检索)       │    │
│  │                  │    │   ├─ LLM (生成)             │    │
│  │                  │    │   ├─ Memory (多轮对话)      │    │
│  │                  │    │   └─ Callback (成本追踪)    │    │
│  └─────────────────┘    └─────────────────────────────┘    │
│                                    ↑                       │
│  ┌─────────────────┐              │                        │
│  │  Ingestion       │              │                        │
│  │  Pipeline        │──────────────┘                        │
│  │  ├─ Document     │   向量存储                             │
│  │  │   Loader      │                                       │
│  │  ├─ TextSplitter │                                       │
│  │  └─ Embeddings   │                                       │
│  └─────────────────┘                                        │
└────────────────────────────────────────────────────────────┘
```

### 概念二：项目结构

```
doc-qa-assistant/
├── src/
│   ├── index.ts              # Express 服务入口
│   ├── ingestion/
│   │   └── pipeline.ts       # 文档摄取管线
│   ├── qa/
│   │   ├── engine.ts         # 问答引擎
│   │   └── memory.ts         # 对话记忆管理
│   ├── monitor/
│   │   └── cost-tracker.ts   # Token 成本追踪
│   └── types.ts              # 类型定义
├── data/                     # 文档存放目录
│   └── ...                   # PDF、TXT 等文件
└── package.json
```

---

## 🔨 实战演练

### 第一步：类型定义

```typescript
// src/types.ts
import { Document } from '@langchain/core/documents';

// 查询请求
export interface QueryRequest {
  question: string;
  sessionId?: string;    // 会话 ID，用于多轮对话
  topK?: number;         // 检索文档数量
}

// 查询响应
export interface QueryResponse {
  answer: string;
  sources: SourceInfo[];
  tokenUsage: TokenUsage;
  latency: number;
}

// 来源信息
export interface SourceInfo {
  content: string;
  metadata: Record<string, any>;
  relevanceScore?: number;
}

// Token 使用统计
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUSD: number;
}

// 文档摄取配置
export interface IngestionConfig {
  source: string;
  type: 'file' | 'directory' | 'url';
  chunkSize?: number;
  chunkOverlap?: number;
}
```

### 第二步：成本追踪 Callback

```typescript
// src/monitor/cost-tracker.ts
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { Serialized } from '@langchain/core/load/serializable';
import { TokenUsage } from '../types';

export class CostTracker extends BaseCallbackHandler {
  name = 'CostTracker';

  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private sessionCosts: Map<string, TokenUsage> = new Map();
  private currentSessionId = 'default';

  // 模型定价 ($/1K tokens)
  private readonly PRICING: Record<string, { input: number; output: number }> = {
    'claude-sonnet-4-5-20241022': { input: 0.003, output: 0.015 },
    'claude-haiku': { input: 0.00025, output: 0.00125 },
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  };

  setSession(sessionId: string) {
    this.currentSessionId = sessionId;
    if (!this.sessionCosts.has(sessionId)) {
      this.sessionCosts.set(sessionId, {
        promptTokens: 0, completionTokens: 0, totalTokens: 0, costUSD: 0,
      });
    }
  }

  async handleLLMEnd(output: any) {
    const usage = output.llmOutput?.tokenUsage || {};
    const promptTokens = usage.promptTokens || 0;
    const completionTokens = usage.completionTokens || 0;
    const totalTokens = usage.totalTokens || 0;

    const modelName = output.llmOutput?.model || 'unknown';
    const pricing = this.PRICING[modelName] || { input: 0.001, output: 0.002 };
    const cost = (promptTokens / 1000) * pricing.input +
                 (completionTokens / 1000) * pricing.output;

    // 更新全局统计
    this.totalPromptTokens += promptTokens;
    this.totalCompletionTokens += completionTokens;

    // 更新会话统计
    const session = this.sessionCosts.get(this.currentSessionId)!;
    session.promptTokens += promptTokens;
    session.completionTokens += completionTokens;
    session.totalTokens += totalTokens;
    session.costUSD += cost;
  }

  getSessionUsage(sessionId: string): TokenUsage {
    return this.sessionCosts.get(sessionId) || {
      promptTokens: 0, completionTokens: 0, totalTokens: 0, costUSD: 0,
    };
  }

  getGlobalUsage() {
    return {
      promptTokens: this.totalPromptTokens,
      completionTokens: this.totalCompletionTokens,
      totalTokens: this.totalPromptTokens + this.totalCompletionTokens,
    };
  }
}
```

### 第三步：文档摄取管线

```typescript
// src/ingestion/pipeline.ts
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import path from 'path';

export class IngestionPipeline {
  private vectorStore: MemoryVectorStore | null = null;
  private embeddings: OpenAIEmbeddings;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      modelName: 'text-embedding-3-small',
    });
  }

  /**
   * 从目录加载所有文档
   */
  async loadDocuments(dataDir: string): Promise<Document[]> {
    console.log(`📂 正在扫描目录: ${dataDir}`);

    // 配置目录加载器
    const directoryLoader = new DirectoryLoader(dataDir, {
      '.txt': (path) => new TextLoader(path),
      '.md': (path) => new TextLoader(path),
      '.pdf': (path) => new PDFLoader(path),
      '.csv': (path) => new CSVLoader(path),
    });

    const docs = await directoryLoader.load();
    console.log(`✅ 加载了 ${docs.length} 个文件`);

    // 统计文件类型
    const stats: Record<string, number> = {};
    docs.forEach(doc => {
      const ext = path.extname(doc.metadata.source || '').toLowerCase();
      stats[ext] = (stats[ext] || 0) + 1;
    });
    console.log('📊 文件类型分布:', stats);

    return docs;
  }

  /**
   * 分割文档
   */
  async splitDocuments(docs: Document[], chunkSize = 500, chunkOverlap = 100): Promise<Document[]> {
    console.log(`✂️  正在分割文档 (chunkSize=${chunkSize}, overlap=${chunkOverlap})...`);

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators: ['\n\n', '\n', '。', '.', ' ', ''],
    });

    const splitDocs = await splitter.splitDocuments(docs);
    console.log(`✅ 分割完成: ${docs.length} 个文档 → ${splitDocs.length} 个片段`);

    return splitDocs;
  }

  /**
   * 生成嵌入并存入向量存储
   */
  async indexDocuments(splitDocs: Document[]): Promise<MemoryVectorStore> {
    console.log('🔮 正在生成嵌入向量...');

    const startTime = Date.now();
    this.vectorStore = await MemoryVectorStore.fromDocuments(
      splitDocs,
      this.embeddings
    );
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ 嵌入完成 (${elapsed}s): ${splitDocs.length} 个片段已索引`);

    return this.vectorStore;
  }

  /**
   * 完整摄取流程
   */
  async run(dataDir: string): Promise<MemoryVectorStore> {
    console.log('🚀 开始文档摄取流程\n');

    const docs = await this.loadDocuments(dataDir);
    const splitDocs = await this.splitDocuments(docs);
    const vectorStore = await this.indexDocuments(splitDocs);

    console.log('\n🎉 文档摄取完成！');
    return vectorStore;
  }

  getVectorStore(): MemoryVectorStore | null {
    return this.vectorStore;
  }
}
```

### 第四步：问答引擎（核心）

```typescript
// src/qa/engine.ts
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { Document } from '@langchain/core/documents';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { CostTracker } from '../monitor/cost-tracker';
import { QueryRequest, QueryResponse, SourceInfo } from '../types';

export class QAEngine {
  private retriever: ReturnType<MemoryVectorStore['asRetriever']>;
  private model: ChatAnthropic;
  private chain: RunnableSequence;
  private costTracker: CostTracker;

  // 多轮对话：存储每个会话的历史消息
  private conversationHistories: Map<string, BaseMessage[]> = new Map();

  constructor(vectorStore: MemoryVectorStore, costTracker: CostTracker) {
    this.costTracker = costTracker;

    // 创建检索器
    this.retriever = vectorStore.asRetriever({
      k: 4,              // 返回 top-4 相关文档
      searchType: 'similarity',
    });

    // 初始化模型
    this.model = new ChatAnthropic({
      modelName: 'claude-sonnet-4-5-20241022',
      maxTokens: 2048,
      temperature: 0.3,   // 低温度：追求事实准确
    });

    // 构建 RAG 链
    this.chain = this.buildChain();
  }

  /**
   * 构建 RAG 链
   */
  private buildChain(): RunnableSequence {
    // RAG 提示模板 — 支持多轮对话
    const ragPrompt = ChatPromptTemplate.fromMessages([
      ['system', `你是一个智能文档问答助手。

请基于以下参考资料和对话历史来回答问题。

核心原则：
1. 基于事实 — 严格依据参考资料回答，不要编造信息
2. 引用来源 — 回答时引用[来源X]标注信息来源
3. 诚实透明 — 如果参考资料不足，请说"我找不到相关信息"
4. 保持上下文 — 结合对话历史理解用户意图

参考资料（按相关性排序）：
{context}

对话历史：
{chatHistory}

请用中文回答。`],
      ['user', '{question}'],
    ]);

    const parser = new StringOutputParser();

    return RunnableSequence.from([
      // 步骤 1：检索 + 格式化上下文和对话历史
      {
        context: async (input: { question: string; sessionId: string }) => {
          const docs = await this.retriever.invoke(input.question);
          return docs
            .map((doc, i) =>
              `[来源 ${i + 1}] (${doc.metadata.source || '未知来源'}, 相关度: ${(1 - (doc.metadata._score || 0)).toFixed(2)})
${doc.pageContent}`
            )
            .join('\n\n');
        },
        chatHistory: async (input: { question: string; sessionId: string }) => {
          const history = this.conversationHistories.get(input.sessionId) || [];
          if (history.length === 0) return '暂无对话历史。';
          return history
            .map(msg =>
              msg._getType() === 'human'
                ? `用户: ${msg.content}`
                : `助手: ${msg.content}`
            )
            .join('\n');
        },
        question: (input: { question: string; sessionId: string }) => input.question,
      },
      // 步骤 2-4：模板 → 模型 → 解析
      ragPrompt,
      this.model,
      parser,
    ]);
  }

  /**
   * 执行查询
   */
  async query(request: QueryRequest): Promise<QueryResponse> {
    const startTime = Date.now();
    const sessionId = request.sessionId || 'default';
    const topK = request.topK || 4;

    // 更新检索器参数（如果指定了 topK）
    if (topK !== 4) {
      this.retriever = (this.retriever as any).vectorStore.asRetriever({
        k: topK,
        searchType: 'similarity',
      });
    }

    // 设置会话追踪
    this.costTracker.setSession(sessionId);

    console.log(`\n🔍 [${sessionId}] 查询: "${request.question}"`);

    // 获取原始文档（供 sources 使用）
    const rawDocs = await this.retriever.invoke(request.question);

    // 执行 RAG 链
    const answer = await this.chain.invoke(
      {
        question: request.question,
        sessionId: sessionId,
      },
      {
        callbacks: [this.costTracker],
        metadata: { sessionId },
        tags: ['rag', sessionId],
      }
    );

    // 记录对话历史
    this.addToHistory(sessionId, new HumanMessage(request.question));
    this.addToHistory(sessionId, new AIMessage(answer));

    // 计算延迟
    const latency = Date.now() - startTime;

    // 获取 Token 统计
    const tokenUsage = this.costTracker.getSessionUsage(sessionId);

    // 格式化来源信息
    const sources: SourceInfo[] = rawDocs.map((doc: Document) => ({
      content: doc.pageContent,
      metadata: doc.metadata,
    }));

    console.log(`✅ [${sessionId}] 完成 (${latency}ms, Tokens: ${tokenUsage.totalTokens})`);

    return {
      answer,
      sources,
      tokenUsage,
      latency,
    };
  }

  /**
   * 流式查询（支持逐 Token 输出）
   */
  async streamQuery(
    request: QueryRequest,
    onToken: (token: string) => void,
    onComplete: (response: QueryResponse) => void
  ): Promise<void> {
    const startTime = Date.now();
    const sessionId = request.sessionId || 'default';

    this.costTracker.setSession(sessionId);

    // 先检索文档（供 sources 使用）
    const rawDocs = await this.retriever.invoke(request.question);

    // 构建流式链
    const streamingModel = new ChatAnthropic({
      modelName: 'claude-sonnet-4-5-20241022',
      maxTokens: 2048,
      temperature: 0.3,
      streaming: true,
    });

    const streamingChain = RunnableSequence.from([
      {
        context: async () => {
          const docs = await this.retriever.invoke(request.question);
          return docs
            .map((doc, i) => `[来源 ${i + 1}] ${doc.pageContent}`)
            .join('\n\n');
        },
        chatHistory: async () => '暂无对话历史。',
        question: () => request.question,
      },
      ChatPromptTemplate.fromMessages([
        ['system', '基于参考资料回答问题：\n\n{context}'],
        ['user', '{question}'],
      ]),
      streamingModel,
      new StringOutputParser(),
    ]);

    let fullAnswer = '';

    const stream = await streamingChain.stream(
      { question: request.question, sessionId },
      { callbacks: [this.costTracker] }
    );

    for await (const chunk of stream) {
      fullAnswer += chunk;
      onToken(chunk);
    }

    // 记录对话历史
    this.addToHistory(sessionId, new HumanMessage(request.question));
    this.addToHistory(sessionId, new AIMessage(fullAnswer));

    const latency = Date.now() - startTime;
    const tokenUsage = this.costTracker.getSessionUsage(sessionId);

    onComplete({
      answer: fullAnswer,
      sources: rawDocs.map((doc: Document) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
      })),
      tokenUsage,
      latency,
    });
  }

  /**
   * 添加消息到对话历史
   */
  private addToHistory(sessionId: string, message: BaseMessage) {
    if (!this.conversationHistories.has(sessionId)) {
      this.conversationHistories.set(sessionId, []);
    }
    const history = this.conversationHistories.get(sessionId)!;
    history.push(message);

    // 限制历史长度（防止 Token 超限）
    if (history.length > 10) {
      // 保留最近的 10 条消息（5 轮对话）
      this.conversationHistories.set(sessionId, history.slice(-10));
    }
  }

  /**
   * 清空对话历史
   */
  clearHistory(sessionId: string) {
    this.conversationHistories.delete(sessionId);
    console.log(`🗑️  已清空会话 ${sessionId} 的历史`);
  }
}
```

### 第五步：对话记忆管理

```typescript
// src/qa/memory.ts
import { BaseMessage } from '@langchain/core/messages';

/**
 * 对话记忆管理器
 * 负责管理多轮对话的上下文窗口
 */
export class ConversationMemory {
  private histories: Map<string, BaseMessage[]> = new Map();
  private maxTurns: number;

  constructor(maxTurns = 5) {
    this.maxTurns = maxTurns;
  }

  add(sessionId: string, message: BaseMessage): void {
    if (!this.histories.has(sessionId)) {
      this.histories.set(sessionId, []);
    }

    const history = this.histories.get(sessionId)!;
    history.push(message);

    // 超过最大轮数时，删除最早的消息对
    if (this.getMessageCount(sessionId) > this.maxTurns * 2) {
      this.histories.set(sessionId, history.slice(-this.maxTurns * 2));
    }
  }

  getHistory(sessionId: string): BaseMessage[] {
    return this.histories.get(sessionId) || [];
  }

  getMessageCount(sessionId: string): number {
    return this.histories.get(sessionId)?.length || 0;
  }

  clear(sessionId: string): void {
    this.histories.delete(sessionId);
  }

  /**
   * 将历史格式化为 LLM 可读的文本
   */
  formatForPrompt(sessionId: string): string {
    const history = this.getHistory(sessionId);
    if (history.length === 0) return '暂无历史对话。';

    return history
      .map(msg => {
        const role = msg._getType() === 'human' ? '用户' : '助手';
        return `${role}: ${msg.content}`;
      })
      .join('\n');
  }

  /**
   * 获取所有活跃会话数
   */
  getActiveSessionCount(): number {
    return this.histories.size;
  }
}
```

### 第六步：Express API 服务器

```typescript
// src/index.ts
import express from 'express';
import { IngestionPipeline } from './ingestion/pipeline';
import { QAEngine } from './qa/engine';
import { CostTracker } from './monitor/cost-tracker';
import { QueryRequest, QueryResponse } from './types';
import path from 'path';

async function main() {
  // 初始化组件
  const costTracker = new CostTracker();
  const ingestionPipeline = new IngestionPipeline();

  // 加载文档
  console.log('📚 正在初始化知识库...');
  const dataDir = path.join(__dirname, '../data');
  const vectorStore = await ingestionPipeline.run(dataDir);

  // 初始化问答引擎
  const qaEngine = new QAEngine(vectorStore, costTracker);

  // 创建 Express 应用
  const app = express();
  app.use(express.json());

  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      documentCount: ingestionPipeline.getVectorStore() ? 'ready' : 'empty',
      activeSessions: 0,
    });
  });

  // 查询接口
  app.post('/api/query', async (req, res) => {
    try {
      const { question, sessionId, topK } = req.body as QueryRequest;

      if (!question || typeof question !== 'string') {
        return res.status(400).json({ error: '请提供 question 参数' });
      }

      const response = await qaEngine.query({
        question,
        sessionId: sessionId || `session-${Date.now()}`,
        topK: topK || 4,
      });

      res.json(response);
    } catch (error) {
      console.error('❌ 查询失败:', error);
      res.status(500).json({
        error: '内部服务器错误',
        message: (error as Error).message,
      });
    }
  });

  // 流式查询接口
  app.post('/api/query/stream', async (req, res) => {
    try {
      const { question, sessionId } = req.body as QueryRequest;

      if (!question) {
        return res.status(400).json({ error: '请提供 question 参数' });
      }

      // 设置 SSE 头部
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // 执行流式查询
      await qaEngine.streamQuery(
        { question, sessionId: sessionId || `session-${Date.now()}` },
        // onToken: 向前端推送每个 Token
        (token: string) => {
          res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
        },
        // onComplete: 推送最终结果
        (response: QueryResponse) => {
          res.write(`data: ${JSON.stringify({ type: 'complete', ...response })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      );
    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: (error as Error).message })}\n\n`);
      res.end();
    }
  });

  // 获取 Token 使用统计
  app.get('/api/stats', (req, res) => {
    const sessionId = req.query.sessionId as string;

    if (sessionId) {
      return res.json(costTracker.getSessionUsage(sessionId));
    }

    res.json({
      global: costTracker.getGlobalUsage(),
      sessions: {},  // 生产环境可返回汇总
    });
  });

  // 清空对话历史
  app.post('/api/session/clear', (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: '请提供 sessionId' });
    }

    qaEngine.clearHistory(sessionId);
    res.json({ message: `会话 ${sessionId} 已清空` });
  });

  // 启动服务器
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`
🚀 RAG 文档问答助手已启动
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖  API 文档:
   POST /api/query           — 普通查询
   POST /api/query/stream    — 流式查询 (SSE)
   GET  /api/health          — 健康检查
   GET  /api/stats           — Token 统计
   POST /api/session/clear   — 清空对话历史
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   服务运行在: http://localhost:${PORT}
`);
  });
}

main().catch(console.error);
```

### 第七步：使用示例

```typescript
// 示例客户端调用
async function demo() {
  const BASE_URL = 'http://localhost:3000';

  // 1. 健康检查
  const health = await fetch(`${BASE_URL}/api/health`).then(r => r.json());
  console.log('健康状态:', health);

  // 2. 单轮查询
  const query1 = await fetch(`${BASE_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: '什么是微服务架构？',
      sessionId: 'demo-session',
    }),
  }).then(r => r.json()) as QueryResponse;

  console.log(`\n❓ 问题: 什么是微服务架构？`);
  console.log(`💬 回答: ${query1.answer}`);
  console.log(`📊 Token: ${query1.tokenUsage.totalTokens}`);
  console.log(`💰 费用: \$${query1.tokenUsage.costUSD.toFixed(6)}`);
  console.log(`⏱️  延迟: ${query1.latency}ms`);

  // 3. 多轮查询（追问）
  const query2 = await fetch(`${BASE_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: '它和单体架构相比有什么优缺点？',
      sessionId: 'demo-session',  // 同一个 sessionId
    }),
  }).then(r => r.json()) as QueryResponse;

  console.log(`\n❓ 追问: 它和单体架构相比有什么优缺点？`);
  console.log(`💬 回答: ${query2.answer}`);
  console.log(`📊 Token: ${query2.tokenUsage.totalTokens}`);
  console.log(`💰 费用: \$${query2.tokenUsage.costUSD.toFixed(6)}`);

  // 4. 查看统计
  const stats = await fetch(`${BASE_URL}/api/stats?sessionId=demo-session`)
    .then(r => r.json());
  console.log(`\n📊 会话统计:`, stats);

  // 5. 清空对话
  await fetch(`${BASE_URL}/api/session/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'demo-session' }),
  });

  console.log('✅ 演示完成');
}
```

---

## ⚡ 进阶技巧

### 技巧一：文档更新和增量索引

```typescript
// 支持增量更新文档
class IncrementalIngestionPipeline extends IngestionPipeline {
  private documentHashes: Map<string, string> = new Map();

  async incrementalUpdate(dataDir: string): Promise<number> {
    const docs = await this.loadDocuments(dataDir);
    let newDocs = 0;

    for (const doc of docs) {
      const hash = this.hashContent(doc.pageContent);
      const source = doc.metadata.source as string;

      if (this.documentHashes.get(source) !== hash) {
        // 文档已更新或新增，重新索引
        await this.indexDocuments([doc]);
        this.documentHashes.set(source, hash);
        newDocs++;
      }
    }

    return newDocs;
  }

  private hashContent(content: string): string {
    // 简单的哈希函数
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }
}
```

### 技巧二：混合检索（关键词 + 向量）

```typescript
// 同时使用 BM25 关键词检索和向量检索
import { EnsembleRetriever } from 'langchain/retrievers/ensemble';

function createHybridRetriever(vectorStore: MemoryVectorStore) {
  const vectorRetriever = vectorStore.asRetriever({ k: 3 });

  const ensembleRetriever = new EnsembleRetriever({
    retrievers: [vectorRetriever],  // 可添加 BM25Retriever
    weights: [1.0],
  });

  return ensembleRetriever;
}
```

### 技巧三：使用环境变量配置

```typescript
// .env 文件
// ANTHROPIC_API_KEY=sk-ant-...
// OPENAI_API_KEY=sk-...
// LANGCHAIN_TRACING_V2=true
// LANGCHAIN_API_KEY=ls_...
// LANGCHAIN_PROJECT=doc-qa-assistant
// PORT=3000
// DATA_DIR=./data

// 加载配置
import dotenv from 'dotenv';
dotenv.config();

const config = {
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  openaiKey: process.env.OPENAI_API_KEY,
  port: parseInt(process.env.PORT || '3000'),
  dataDir: process.env.DATA_DIR || './data',
  langSmith: process.env.LANGCHAIN_TRACING_V2 === 'true',
};
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：本项目的核心架构分为哪几个部分？**

> A：三个核心部分：（1）**Ingestion Pipeline（摄取管线）**— 加载文档 → 分割 → 生成嵌入 → 存入向量存储；（2）**QA Engine（问答引擎）**— 检索相关文档 → RAG 链生成回答 → 流式输出；（3）**Express API 服务**— 封装为 HTTP 接口，支持普通查询和 SSE 流式查询。

**Q2：多轮对话是如何实现的？**

> A：使用 `Map<string, BaseMessage[]>` 存储每个会话的历史消息。每次查询时，将历史消息格式化为文本嵌入提示词中，让 LLM 理解上下文。同时设置最大轮数限制（10 条消息/5 轮对话），防止 Token 超限。

**Q3：流式查询（SSE）和普通查询有什么区别？**

> A：普通查询等待 LLM 生成完整回答后一次性返回。流式查询使用 `stream()` 方法逐 Token 返回，通过 SSE（Server-Sent Events）协议实时推送给前端。流式查询的响应头包含 `Content-Type: text/event-stream`，前端可以用 `EventSource` 或 `fetch` 的 `ReadableStream` 接收。

**Q4：Token 费用是如何计算的？**

> A：在 `CostTracker` 回调中，`handleLLMEnd` 事件触发时获取 `tokenUsage` 数据（包含 promptTokens 和 completionTokens）。然后根据预定义的模型定价表（如 Claude Sonnet: $0.003/1K input, $0.015/1K output）计算每次调用的费用，并累加到会话级别和全局级别。

**Q5：本项目的生产环境部署需要考虑哪些改进？**

> A：（1）使用持久化向量数据库（如 Pinecone、Chroma）替代 MemoryVectorStore；（2）添加用户认证和速率限制；（3）使用 Redis 存储对话历史（支持多实例）；（4）使用 LangSmith 进行生产监控；（5）添加文档版本管理和增量更新；（6）使用 pm2 或 Docker 进行进程管理。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `Cannot find module @langchain/community` | 缺少 community 包 | `npm install @langchain/community` |
| `No documents in vector store` | 摄取管线未执行或 data 目录为空 | 检查 `data/` 目录是否有文件，确认摄取管线已运行 |
| `ECONNREFUSED` 连接服务器失败 | Express 服务未启动 | 先运行 `npm start` 或 `ts-node src/index.ts` |
| `Token limit exceeded` | 对话历史过长 + 检索文档过多 | 减少 `maxTurns` 或 `topK` 参数 |
| SSE 连接断开 | 服务器超时或网络问题 | 检查 `res.end()` 是否正确调用，添加心跳机制 |

---

## 📝 本章小结

- ✅ **完整 RAG 应用架构** — 摄取管线 + 问答引擎 + API 服务
- ✅ **文档摄取管线** — 加载 → 分割 → 嵌入 → 存储
- ✅ **智能问答引擎** — 检索增强生成 + 多轮对话
- ✅ **流式输出** — SSE 协议实时推送 Token
- ✅ **Token 成本追踪** — 自定义 Callback 精确统计费用
- ✅ **Express API** — RESTful + 流式双接口
- ✅ **多轮对话** — 记忆上下文，连续追问
- ✅ **来源引用** — 回答附带引用来源
- ✅ **会话管理** — 独立会话，可清空历史

## ➡️ 下一章预告

> 在下一章中，我们将进入新的学习阶段，探索 Agent（智能代理）——如何让 LLM 自主调用工具、规划任务、执行多步骤操作。
>
> 恭喜你完成了 LangChain.js 基础阶段的学习！🎉
