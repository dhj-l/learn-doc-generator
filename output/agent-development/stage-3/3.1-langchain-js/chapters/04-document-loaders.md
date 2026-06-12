# 第4章：文档加载器 — 让 LLM 读取各种数据源

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **掌握 LangChain 文档加载器架构** — 理解 Document 对象和加载器接口
- **加载多种格式文件** — 文本、PDF、CSV、网页等
- **使用自定义加载器** — 适配特殊格式的数据源
- **构建目录批量加载管线** — 高效处理大量文档

## 📋 前置知识

> 建议先完成：
> - [第1章：LangChain.js 概述](./01-introduction.md) — 理解 Model、Prompt、Chain 基础
> - [第2章：LCEL 链式调用](./02-lcel.md) — 理解管道操作符

---

## 💡 核心概念

### 概念一：Document 对象 — 数据的标准容器

**生活类比：** Document 对象就像一个有标签的文件袋。文件袋里装着文件内容（pageContent），袋面上贴着便签（metadata），写着文件名、来源、页码等信息。无论你装的是 PDF、网页还是 CSV，最终都用同样的文件袋装好，方便后续处理。

```typescript
// Document 接口定义
interface Document {
  pageContent: string;          // 文档的文本内容
  metadata: Record<string, any>; // 元数据：来源、页码、行号等
}
```

**为什么这样设计？** LangChain 的核心思想是**统一的数据抽象**。无论数据来源是什么（文件、网页、数据库、API），最终都转换成统一的 Document 对象。这样后续的文本分割、向量化、检索等步骤就不需要关心原始格式。

### 概念二：加载器接口 — 统一的加载方式

```typescript
// 所有加载器都遵循的接口
interface BaseDocumentLoader {
  load(): Promise<Document[]>;          // 单次加载所有文档
  loadAndSplit(): Promise<Document[]>;  // 加载并自动分割（配合 TextSplitter）
}
```

### 概念三：TextLoader — 最基础的文本加载器

**生活类比：** TextLoader 就像一把最简单的螺丝刀。它只能读纯文本文件，但正因为简单，所以可靠、快速、零依赖。

```typescript
// src/01-text-loader.ts
import { TextLoader } from 'langchain/document_loaders/fs/text';
import path from 'path';

// 创建加载器
const loader = new TextLoader(path.join(__dirname, './data.txt'));

// 加载文档
const docs = await loader.load();

console.log(`加载了 ${docs.length} 个文档`);
console.log(`内容长度: ${docs[0].pageContent.length} 字符`);
console.log(`元数据:`, docs[0].metadata);
// 元数据: { source: './data.txt' }
```

```
预期输出（假设 data.txt 包含"你好，世界！"）：
加载了 1 个文档
内容长度: 6 字符
元数据: { source: './data.txt' }
```

> **💡 你知道吗？**
>
> TextLoader 会自动检测文件编码（UTF-8、GBK 等），你不需要手动指定编码格式。

### 概念四：PDFLoader — PDF 文件加载

**生活类比：** PDFLoader 就像一台扫描仪加 OCR 的组合设备。它能把 PDF 的每一页扫描成文本，但要注意——扫描结果的质量取决于原始 PDF 的质量（是文本型 PDF 还是扫描图片型 PDF）。

```typescript
// src/02-pdf-loader.ts
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

// 加载单页 PDF
const loader = new PDFLoader('./document.pdf', {
  splitPages: true,       // 是否按页分割，默认 true
});

const docs = await loader.load();

console.log(`总页数: ${docs.length}`);
docs.forEach((doc, i) => {
  console.log(`第 ${i + 1} 页 (${doc.metadata.pageNumber}):`);
  console.log(doc.pageContent.slice(0, 100) + '...');
  console.log(`元数据:`, doc.metadata);
  // 元数据包含: source, pageNumber, totalPages 等
});
```

```
预期输出：
总页数: 3
第 1 页 (1):
本文档介绍了微服务架构的核心概念...
元数据: { source: './document.pdf', pageNumber: 1, totalPages: 3, pdf: {...} }
第 2 页 (2):
微服务架构的主要优势包括独立部署...
元数据: { source: './document.pdf', pageNumber: 2, totalPages: 3, pdf: {...} }
```

**为什么 PDFLoader 放在 @langchain/community 而不是核心包？** PDF 解析涉及 PDF.js 等重型依赖，不是每个项目都需要。LangChain 把这类"非核心但常用"的集成放到 community 包，让用户可以按需安装，避免基础包过于臃肿。

```bash
# 需要额外安装依赖
npm install pdfjs-dist
```

### 概念五：CheerioWebBaseLoader — 网页加载

**生活类比：** CheerioWebBaseLoader 就像一个网页爬虫助手。你给它一个 URL，它会去下载网页内容，然后像用剪刀剪报一样，只保留你关心的部分（通过 CSS 选择器）。

```typescript
// src/03-web-loader.ts
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';

// 加载整个网页
const loader = new CheerioWebBaseLoader('https://example.com');

const docs = await loader.load();

console.log(`网页标题: ${docs[0].metadata.title || '未知'}`);
console.log(`内容长度: ${docs[0].pageContent.length} 字符`);
console.log(`内容预览:`, docs[0].pageContent.slice(0, 200));

// 只提取特定区域（使用 CSS 选择器）
const articleLoader = new CheerioWebBaseLoader('https://example.com/article', {
  selector: 'article.main-content',  // 只提取 article.main-content 内的内容
});

const articleDocs = await articleLoader.load();
```

> **⚠️ 注意事项**
>
> - 网页加载依赖于 `cheerio` 包，需要安装：`npm install cheerio`
> - 部分网站会屏蔽爬虫，可以设置 User-Agent：`new CheerioWebBaseLoader(url, { baseUrl: url, ... })`
> - 动态渲染的网页（React/Vue SPA）无法用 Cheerio 加载，需要考虑 Puppeteer 或其他渲染方案

### 概念六：CSVLoader — 结构化数据加载

**生活类比：** CSVLoader 就像一张 Excel 表格的自动阅读器。它把每一行数据变成一段通顺的文字描述，让 LLM 可以"看懂"表格数据。

```typescript
// src/04-csv-loader.ts
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';

// 加载 CSV 文件
const loader = new CSVLoader('./data.csv');

const docs = await loader.load();

console.log(`总行数: ${docs.length}`);
docs.slice(0, 3).forEach((doc, i) => {
  console.log(`行 ${i + 1}:`);
  console.log(doc.pageContent);       // 格式: "column1: value1\ncolumn2: value2..."
  console.log(`元数据:`, doc.metadata);  // 包含行号
});
```

假设 `data.csv` 内容：
```csv
name,age,city
张三,28,北京
李四,32,上海
王五,25,深圳
```

预期输出：
```
总行数: 3
行 1:
name: 张三
age: 28
city: 北京
元数据: { source: './data.csv', row: 1, line: 2 }
行 2:
name: 李四
age: 32
city: 上海
元数据: { source: './data.csv', row: 2, line: 3 }
```

> **💡 CSVLoader 的巧妙设计**
>
> CSVLoader 不是简单地把 CSV 行拼接成文本，而是把每一行转换成 `列名: 值` 的键值对格式。这让 LLM 能理解"这一列是什么意思"，而不是只看到一串逗号分隔的数据。

### 概念七：自定义加载器 — 适配特殊数据源

**生活类比：** 自定义加载器就像做一个专用的模具。标准的加载器能处理常见格式，但当你的数据来自内部系统、数据库或特殊格式的 API 时，就需要打造自己的加载器。

```typescript
// src/05-custom-loader.ts
import { Document } from '@langchain/core/documents';
import { BaseDocumentLoader } from 'langchain/document_loaders/base';
import fs from 'fs/promises';
import path from 'path';

// 自定义 Markdown 加载器：将 Markdown 按标题分割
class MarkdownSectionLoader extends BaseDocumentLoader {
  private filePath: string;

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
  }

  async load(): Promise<Document[]> {
    const content = await fs.readFile(this.filePath, 'utf-8');
    const docs: Document[] = [];

    // 按 ## 标题分割 Markdown
    const sections = content.split(/(?=^## )/m);

    for (const section of sections) {
      const titleMatch = section.match(/^## (.+)$/m);
      const title = titleMatch ? titleMatch[1] : '无标题';

      docs.push(new Document({
        pageContent: section.trim(),
        metadata: {
          source: this.filePath,
          title: title,
          sectionIndex: docs.length,
        },
      }));
    }

    return docs;
  }
}

// 使用自定义加载器
const mdLoader = new MarkdownSectionLoader('./docs/guide.md');
const mdDocs = await mdLoader.load();

console.log(`共分割出 ${mdDocs.length} 个章节：`);
mdDocs.forEach((doc, i) => {
  console.log(`  ${i + 1}. ${doc.metadata.title} (${doc.pageContent.length} 字符)`);
});
```

**为什么需要自定义加载器？** 现实世界的数据格式千奇百怪：
- 日志文件（.log）— 按时间戳分割
- 配置文件（.yaml/.toml）— 按配置项分割
- 数据库导出（.sql）— 按表分割
- 邮件导出（.eml）— 按邮件分割

自定义加载器让你可以为每种数据格式定制最佳的分割策略。

### 概念八：DirectoryLoader — 批量加载目录

**生活类比：** DirectoryLoader 就像一本自动整理的文件目录册。你给它一个文件夹路径，它会自动扫描文件夹下的所有文件，根据文件后缀选择合适的加载器读取。

```typescript
// src/06-directory-loader.ts
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { JSONLoader } from 'langchain/document_loaders/fs/json';

// 定义文件类型和对应的加载器
const directoryLoader = new DirectoryLoader('./data', {
  '.txt': (path) => new TextLoader(path),
  '.csv': (path) => new CSVLoader(path),
  '.json': (path) => new JSONLoader(path),
  '.md': (path) => new TextLoader(path),   // .md 也当文本处理
  // 可以混合使用自定义加载器
  '.log': (path) => new MarkdownSectionLoader(path),
});

// 加载所有文件
const allDocs = await directoryLoader.load();

// 按文件类型统计
const stats: Record<string, number> = {};
allDocs.forEach(doc => {
  const ext = doc.metadata.source?.split('.').pop() || 'unknown';
  stats[ext] = (stats[ext] || 0) + 1;
});

console.log('📊 加载统计:');
Object.entries(stats).forEach(([ext, count]) => {
  console.log(`  .${ext}: ${count} 个文档`);
});
console.log(`📄 总文档数: ${allDocs.length}`);
```

```
预期输出：
📊 加载统计:
  txt: 3 个文档
  csv: 2 个文档
  json: 1 个文档
  md: 5 个文档
📄 总文档数: 11 个文档
```

> **💡 DirectoryLoader 的最佳实践**
>
> 在实际项目中，建议按文档类型组织文件夹结构：
> ```
> data/
>   pdfs/        # PDF 文件
>   webpages/    # 网页抓取结果
>   csv_reports/ # 报表数据
>   internal/    # 内部文档
> ```
> 然后分别为每个子目录创建不同的加载器配置。

---

## 🔨 实战演练

### 练习：构建一个多源文档加载管线

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
// src/07-doc-ingestion-pipeline.ts
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { Document } from '@langchain/core/documents';
import fs from 'fs/promises';
import path from 'path';

// 步骤 1：定义文档加载配置
interface LoaderConfig {
  name: string;
  source: string;       // 文件路径或 URL
  type: 'file' | 'url';
  loader: string;       // 加载器类型
  options?: Record<string, any>;
}

const configs: LoaderConfig[] = [
  { name: '产品文档', source: './docs/product.txt', type: 'file', loader: 'text' },
  { name: '技术白皮书', source: './docs/whitepaper.pdf', type: 'file', loader: 'pdf' },
  { name: '数据报表', source: './data/report.csv', type: 'file', loader: 'csv' },
  { name: '官方网站', source: 'https://example.com/docs', type: 'url', loader: 'web' },
];

// 步骤 2：智能加载器工厂
function createLoader(config: LoaderConfig) {
  switch (config.loader) {
    case 'text':
      return new TextLoader(config.source);
    case 'pdf':
      return new PDFLoader(config.source, config.options);
    case 'csv':
      return new CSVLoader(config.source, config.options);
    case 'web':
      return new CheerioWebBaseLoader(config.source, config.options);
    default:
      throw new Error(`未知加载器类型: ${config.loader}`);
  }
}

// 步骤 3：批量加载所有文档
async function loadAllDocuments(configs: LoaderConfig[]): Promise<{
  documents: Document[];
  stats: { name: string; docCount: number; totalChars: number }[];
}> {
  const results = [];
  const stats = [];

  for (const config of configs) {
    console.log(`🔍 正在加载: ${config.name} (${config.source})`);

    try {
      const loader = createLoader(config);
      const docs = await loader.load();

      const totalChars = docs.reduce((sum, d) => sum + d.pageContent.length, 0);

      results.push(...docs);
      stats.push({
        name: config.name,
        docCount: docs.length,
        totalChars,
      });

      console.log(`  ✅ 加载完成: ${docs.length} 个文档, ${totalChars} 字符`);
    } catch (error) {
      console.error(`  ❌ 加载失败: ${(error as Error).message}`);
      stats.push({
        name: config.name,
        docCount: 0,
        totalChars: 0,
      });
    }
  }

  return { documents: results, stats };
}

// 步骤 4：执行加载并生成报告
const { documents, stats } = await loadAllDocuments(configs);

console.log('\n📊 加载报告:');
console.log('=' .repeat(60));
console.log(`| ${'数据源'.padEnd(16)} | ${'文档数'.padEnd(8)} | ${'字符数'.padEnd(12)} |`);
console.log('|' + '-'.repeat(18) + '|' + '-'.repeat(10) + '|' + '-'.repeat(14) + '|');
stats.forEach(s => {
  console.log(`| ${s.name.padEnd(16)} | ${String(s.docCount).padEnd(8)} | ${String(s.totalChars).padEnd(12)} |`);
});
console.log('=' .repeat(60));
console.log(`📄 总计: ${documents.length} 个文档`);
```

**预期输出：**
```
🔍 正在加载: 产品文档 (./docs/product.txt)
  ✅ 加载完成: 1 个文档, 2340 字符
🔍 正在加载: 技术白皮书 (./docs/whitepaper.pdf)
  ✅ 加载完成: 5 个文档, 15890 字符
🔍 正在加载: 数据报表 (./data/report.csv)
  ✅ 加载完成: 120 个文档, 45600 字符
🔍 正在加载: 官方网站 (https://example.com/docs)
  ✅ 加载完成: 1 个文档, 8900 字符

📊 加载报告:
============================================================
| 数据源            | 文档数    | 字符数          |
|------------------|----------|---------------|
| 产品文档          | 1         | 2340          |
| 技术白皮书        | 5         | 15890         |
| 数据报表          | 120       | 45600         |
| 官方网站          | 1         | 8900          |
============================================================
📄 总计: 127 个文档
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：加载器与文本分割器配合

```typescript
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

// 加载后自动分割
const loader = new TextLoader('./large-document.txt');
const rawDocs = await loader.load();

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,      // 每段最多 1000 字符
  chunkOverlap: 200,    // 段与段之间重叠 200 字符
});

const splitDocs = await splitter.splitDocuments(rawDocs);
console.log(`分割后: ${splitDocs.length} 段`);

// 或者使用加载器的快捷方法
const autoSplitDocs = await loader.loadAndSplit(splitter);
```

### 技巧二：为文档添加自定义元数据

```typescript
async function enrichDocuments(docs: Document[]): Promise<Document[]> {
  return docs.map((doc, index) => {
    doc.metadata = {
      ...doc.metadata,
      // 添加自定义元数据
      docId: `doc-${Date.now()}-${index}`,
      loadTimestamp: new Date().toISOString(),
      language: detectLanguage(doc.pageContent),
      wordCount: doc.pageContent.split(/\s+/).length,
      // 如果是从 URL 加载的，提取域名
      domain: doc.metadata.source?.startsWith('http')
        ? new URL(doc.metadata.source).hostname
        : undefined,
    };
    return doc;
  });
}
```

### 技巧三：断点续传（大文档加载）

```typescript
import { JSONLoader } from 'langchain/document_loaders/fs/json';

async function loadWithResume(filePath: string): Promise<Document[]> {
  // 先检查是否有缓存
  const cachePath = `${filePath}.cache.json`;

  try {
    const cached = await fs.readFile(cachePath, 'utf-8');
    const docs = JSON.parse(cached).map((d: any) => new Document(d));
    console.log('📦 从缓存恢复');
    return docs;
  } catch {
    console.log('🔄 重新加载...');
    const loader = new JSONLoader(filePath);
    const docs = await loader.load();

    // 保存缓存
    await fs.writeFile(cachePath, JSON.stringify(docs.map(d => ({
      pageContent: d.pageContent,
      metadata: d.metadata,
    }))));

    return docs;
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Document 对象的两个核心字段是什么？**

> A：`pageContent`（文档文本内容）和 `metadata`（文档元数据，如来源、页码等）。metadata 是键值对可扩展的，可以添加任意自定义字段。

**Q2：TextLoader 和 PDFLoader 获取到的 Document 有什么不同？**

> A：TextLoader 通常返回 1 个 Document（整个文件作为一段），metadata 只包含 source。PDFLoader 如果设置 `splitPages: true`（默认），每页返回 1 个 Document，metadata 包含 pageNumber、totalPages 等额外信息。

**Q3：什么时候应该使用 DirectoryLoader？**

> A：当你有大量文件需要批量处理时。DirectoryLoader 可以自动识别文件后缀并调用对应的加载器，省去手动创建每个加载器的麻烦。特别适合 RAG 应用的文档索引阶段。

**Q4：自定义加载器需要实现什么接口？**

> A：需要继承 `BaseDocumentLoader` 并实现 `load(): Promise<Document[]>` 方法。也可以选择实现 `loadAndSplit()` 方法以获得分割功能。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `Cannot find module 'pdfjs-dist'` | 未安装 PDF 解析依赖 | `npm install pdfjs-dist` |
| `Error: net::ERR_NAME_NOT_RESOLVED` | 网络问题或 URL 错误 | 检查 URL 是否可访问 |
| `The document appears to be empty` | 文件不存在或为空 | 检查文件路径和内容 |
| `CORS policy blocked request` | 网页加载时跨域限制 | 使用服务端代理或设置合适的 User-Agent |
| `MemoryError` | 加载超大文件 | 使用流式加载或增加分割粒度 |

---

## 📝 本章小结

- ✅ **Document 对象** — 统一的文本数据容器（pageContent + metadata）
- ✅ **TextLoader** — 纯文本文件加载
- ✅ **PDFLoader** — PDF 文件按页加载
- ✅ **CheerioWebBaseLoader** — 网页内容抓取
- ✅ **CSVLoader** — 结构化数据加载
- ✅ **自定义加载器** — 继承 BaseDocumentLoader 适配特殊格式
- ✅ **DirectoryLoader** — 批量加载目录下的多类型文件
- ✅ **加载与分割配合** — `loadAndSplit()` 一站式处理

## ➡️ 下一章预告

> 在下一章中，我们将学习 Retriever（检索器）—— 如何从大量文档中快速检索出最相关的信息，为 RAG 应用打下基础。
> [第5章：Retriever 检索器](./05-retrievers.md)
