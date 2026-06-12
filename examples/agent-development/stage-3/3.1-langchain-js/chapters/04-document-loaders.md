# 第4章：文档加载器 — 从各种数据源加载数据

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **理解文档加载器的工作原理** — Document 对象和 Loader 接口
- **从多种数据源加载文档** — 文本文件、PDF、网页、CSV、数据库
- **实现自定义文档加载器** — 处理特殊格式的数据源
- **掌握文档预处理技巧** — 元数据提取、格式清洗、编码处理

## 📋 前置知识

> 建议先完成：
> - [第1章：LangChain.js 概述](./01-introduction.md) — LangChain 基础概念

---

## 💡 核心概念

### 概念一：文档加载器是什么？

**生活类比：** 想象你是一个图书管理员，需要把不同格式的资料（纸质书、电子书、网页、PDF）统一整理到书架上。文档加载器就是你的「万能扫描仪」——不管输入是什么格式，它都会输出统一的 `Document` 对象。

```
文档加载器的统一输出格式：

Document {
  pageContent: "文档正文内容...",    // 文本内容
  metadata: {                       // 元数据
    source: "./data/report.pdf",    // 来源路径
    page: 3,                        // 页码（PDF）
    title: "2024年度报告",           // 标题
    ...
  }
}
```

> **💡 为什么需要 Document 对象？**
>
> LangChain 的下游组件（TextSplitter、VectorStore、Retriever）都期望接收 `Document[]` 格式的输入。统一格式意味着：
> 1. 任何数据源都能接入同一套处理管线
> 2. 元数据会贯穿整个处理流程（检索时可以根据元数据过滤）
> 3. 可以混合不同来源的文档

### 概念二：TextLoader — 文本文件加载

最简单的加载器，读取纯文本文件。

```typescript
// src/01-text-loader.ts
import { TextLoader } from 'langchain/document_loaders/fs/text';

// 加载单个文本文件
const loader = new TextLoader('./data/article.txt');
const docs = await loader.load();

console.log(docs.length);    // 1（一个文件 = 一个 Document）
console.log(docs[0].pageContent.slice(0, 100));  // 前 100 个字符
console.log(docs[0].metadata);
// { source: './data/article.txt' }

// 加载多个文件（使用 DirectoryLoader）
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';

const dirLoader = new DirectoryLoader('./data/articles', {
  '.txt': (path) => new TextLoader(path),
  '.md': (path) => new TextLoader(path),
});

const allDocs = await dirLoader.load();
console.log(allDocs.length);  // 文件夹中的所有 .txt 和 .md 文件数
```

### 概念三：PDFLoader — PDF 文档加载

```typescript
// src/02-pdf-loader.ts
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

// 基础用法：每页一个 Document
const loader = new PDFLoader('./data/report.pdf');
const docs = await loader.load();

console.log(`共 ${docs.length} 页`);
docs.forEach((doc, i) => {
  console.log(`第 ${i + 1} 页: ${doc.pageContent.slice(0, 50)}...`);
  console.log(`元数据:`, doc.metadata);
  // { source: './data/report.pdf', pdf: { version: '1.10.100', info: {...} }, loc: { pageNumber: 1 } }
});

// 高级用法：将所有页合并为一个 Document
const singleDocLoader = new PDFLoader('./data/report.pdf', {
  splitPages: false,  // 不按页分割
});
const singleDoc = await singleDocLoader.load();
console.log(singleDoc.length);  // 1（整个 PDF 作为一个 Document）
```

```bash
# 安装依赖
npm install pdf-parse @langchain/community
```

> **💡 PDF 加载的注意事项**
>
> 1. **扫描版 PDF**（纯图片）无法直接提取文本，需要 OCR
> 2. **加密 PDF** 可能无法读取
> 3. **大文件** 建议按页加载后分块，而非一次性加载

### 概念四：CheerioWebBaseLoader — 网页加载

使用 Cheerio（服务端 jQuery）解析 HTML，提取文本内容。

```typescript
// src/03-web-loader.ts
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';

// 加载单个网页
const loader = new CheerioWebBaseLoader('https://docs.anthropic.com/en/docs/about-claude/models');
const docs = await loader.load();

console.log(docs[0].pageContent.slice(0, 200));
console.log(docs[0].metadata);
// { source: 'https://docs.anthropic.com/...' }

// 高级：使用选择器提取特定区域
const selectiveLoader = new CheerioWebBaseLoader('https://example.com', {
  selector: 'article.main-content',  // 只提取 article 标签内的内容
});
```

```bash
# 安装依赖
npm install cheerio @langchain/community
```

```typescript
// 批量加载多个网页
const urls = [
  'https://docs.anthropic.com/en/docs/about-claude/models',
  'https://docs.anthropic.com/en/docs/build-with-claude/overview',
  'https://docs.anthropic.com/en/api/getting-started',
];

const loaders = urls.map(url => new CheerioWebBaseLoader(url));
const allDocs = await Promise.all(loaders.map(loader => loader.load()));
const flatDocs = allDocs.flat();

console.log(`共加载 ${flatDocs.length} 个页面`);
```

### 概念五：CSVLoader — 表格数据加载

```typescript
// src/04-csv-loader.ts
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';

const loader = new CSVLoader('./data/users.csv');
const docs = await loader.load();

// 每行数据变成一个 Document
console.log(`共 ${docs.length} 行`);
console.log(docs[0].pageContent);
// "name: 张三\nemail: zhangsan@example.com\nage: 28\nrole: 前端工程师"
console.log(docs[0].metadata);
// { source: './data/users.csv', line: 1 }
```

### 概念六：自定义文档加载器

当内置加载器不能满足需求时，实现自己的加载器。

```typescript
// src/05-custom-loader.ts
import { Document } from '@langchain/core/documents';
import { BaseDocumentLoader } from 'langchain/document_loaders/base';

// 自定义加载器：从 API 获取数据
class ApiDocumentLoader extends BaseDocumentLoader {
  constructor(
    private apiUrl: string,
    private headers: Record<string, string> = {}
  ) {
    super();
  }

  async load(): Promise<Document[]> {
    const response = await fetch(this.apiUrl, {
      headers: this.headers,
    });
    const data = await response.json();

    // 假设 API 返回 { items: [{ id, title, content }] }
    return data.items.map((item: any) =>
      new Document({
        pageContent: item.content,
        metadata: {
          source: this.apiUrl,
          id: item.id,
          title: item.title,
          fetchedAt: new Date().toISOString(),
        },
      })
    );
  }
}

// 使用
const loader = new ApiDocumentLoader('https://api.example.com/articles', {
  'Authorization': 'Bearer token123',
});
const docs = await loader.load();
```

```typescript
// 更简单的自定义方式：使用 Document 的静态方法
import { Document } from '@langchain/core/documents';

// 直接从内存中的数据创建 Document 数组
const docs = [
  new Document({
    pageContent: 'Vue 3 引入了 Composition API...',
    metadata: { source: 'blog', category: 'frontend' },
  }),
  new Document({
    pageContent: 'TypeScript 5.5 改进了类型推断...',
    metadata: { source: 'blog', category: 'typescript' },
  }),
];
```

---

## 🔨 实战演练

### 练习：构建一个多数据源文档聚合器

**场景描述：** 你正在构建一个知识库系统，需要从文件夹、网站和 API 同时加载数据。

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/document-aggregator.ts
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { Document } from '@langchain/core/documents';

interface AggregatorConfig {
  localPaths?: string[];
  webUrls?: string[];
}

class DocumentAggregator {
  private config: AggregatorConfig;

  constructor(config: AggregatorConfig) {
    this.config = config;
  }

  // 加载本地文件
  private async loadLocal(): Promise<Document[]> {
    const docs: Document[] = [];
    for (const path of this.config.localPaths || []) {
      if (path.endsWith('.pdf')) {
        const loader = new PDFLoader(path);
        docs.push(...await loader.load());
      } else {
        const loader = new TextLoader(path);
        docs.push(...await loader.load());
      }
    }
    return docs;
  }

  // 加载网页
  private async loadWeb(): Promise<Document[]> {
    const urls = this.config.webUrls || [];
    const loaders = urls.map(url => new CheerioWebBaseLoader(url));
    const results = await Promise.allSettled(
      loaders.map(loader => loader.load())
    );

    return results
      .filter((r): r is PromiseFulfilledResult<Document[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .map(doc => {
        doc.metadata.loader = 'web';
        return doc;
      });
  }

  // 聚合所有数据源
  async loadAll(): Promise<Document[]> {
    const [localDocs, webDocs] = await Promise.all([
      this.loadLocal(),
      this.loadWeb(),
    ]);

    console.log(`📊 加载统计:`);
    console.log(`  本地文档: ${localDocs.length} 个`);
    console.log(`  网页文档: ${webDocs.length} 个`);
    console.log(`  总计: ${localDocs.length + webDocs.length} 个`);

    return [...localDocs, ...webDocs];
  }
}

// 使用
const aggregator = new DocumentAggregator({
  localPaths: [
    './data/guide.txt',
    './data/faq.pdf',
  ],
  webUrls: [
    'https://docs.anthropic.com/en/docs/about-claude/models',
  ],
});

const allDocs = await aggregator.loadAll();
console.log(`\n📄 文档预览:`);
allDocs.slice(0, 3).forEach((doc, i) => {
  console.log(`\n[${i + 1}] 来源: ${doc.metadata.source}`);
  console.log(`    内容: ${doc.pageContent.slice(0, 80)}...`);
});
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：错误处理和重试

```typescript
// 加载网页时的容错处理
async function loadWebWithRetry(url: string, maxRetries = 3): Promise<Document[]> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const loader = new CheerioWebBaseLoader(url);
      return await loader.load();
    } catch (error) {
      console.warn(`⚠️ 加载失败 (${i + 1}/${maxRetries}): ${url}`);
      if (i === maxRetries - 1) {
        console.error(`❌ 放弃加载: ${url}`);
        return [];  // 返回空数组而非抛出异常
      }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));  // 指数退避
    }
  }
  return [];
}
```

### 技巧二：添加元数据

```typescript
import { Document } from '@langchain/core/documents';

// 给所有文档添加统一的元数据
function enrichDocs(docs: Document[], extraMetadata: Record<string, any>): Document[] {
  return docs.map(doc => new Document({
    pageContent: doc.pageContent,
    metadata: {
      ...doc.metadata,
      ...extraMetadata,
      loadedAt: new Date().toISOString(),
    },
  }));
}

const enrichedDocs = enrichDocs(docs, {
  project: 'knowledge-base',
  version: '1.0',
});
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：不同类型的文档加载器（TextLoader、PDFLoader、CheerioWebBaseLoader）的区别是什么？**

> A：TextLoader 用于纯文本文件，PDFLoader 用于 PDF 文档（调用 pdf-parse 库提取文本），CheerioWebBaseLoader 用于网页抓取（使用 cheerio 解析 HTML）。每种加载器针对不同数据源的格式进行优化。

**Q2：什么是「文档加载器 → 文本分块 → Embedding」的典型管线？**

> A：1）使用 Loader 从数据源加载原始文档；2）使用 TextSplitter 将长文档切分成语义完整的短块；3）将每个块通过 Embedding 模型转为向量；4）存入向量数据库供后续检索。

**Q3：自定义加载器应该继承哪个基类？需要实现什么方法？**

> A：继承 `BaseDocumentLoader` 类，至少需要实现 `load()` 方法，返回 `Document[]` 数组。每个 Document 包含 `pageContent`（文本内容）和 `metadata`（元数据，如来源路径）。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Error: ENOENT: no such file` | 文件路径不存在 | 检查路径是否正确，使用 `path.resolve()` |
| PDF 加载返回空内容 | 扫描版 PDF（纯图片） | 使用 OCR 工具预处理，或安装 `tesseract.js` |
| 网页加载超时 | 网站响应慢或被反爬 | 添加超时重试，更换 User-Agent |
| CSV 中文乱码 | 编码不是 UTF-8 | 使用 `iconv-lite` 转码后再加载 |

---

## 📝 本章小结

- ✅ **Document 对象** — `pageContent` + `metadata`，LangChain 的统一文档格式
- ✅ **TextLoader** — 纯文本文件加载
- ✅ **PDFLoader** — PDF 文档加载，支持按页或整文档
- ✅ **CheerioWebBaseLoader** — 网页内容提取
- ✅ **CSVLoader** — CSV 表格数据加载
- ✅ **自定义加载器** — 继承 BaseDocumentLoader，处理任意数据源

## ➡️ 下一章预告

> 在下一章中，我们将学习 Retriever 检索器——如何从大量文档中快速找到最相关的内容，这是 RAG 系统的核心组件。
> [第5章：Retriever 检索器](./05-retrievers.md)
