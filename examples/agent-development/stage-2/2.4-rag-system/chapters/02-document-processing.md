# 第2章：文档处理管线 — 从原始文档到可检索的知识

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **掌握文档加载与清洗** — 从多种格式（纯文本、Markdown、PDF）中提取内容
- **理解不同分块策略** — 固定长度、递归分块、语义分块的优劣和适用场景
- **实现 Embedding 生成与向量存储** — 将文本转为向量并存入 ChromaDB
- **构建完整的文档处理管线** — 从原始文档到可检索知识的完整流程

## 📋 前置知识

> 建议先完成：[第1章：RAG 基础](./01-rag-fundamentals.md)

## 💡 核心概念

### 概念一：五步处理流程

```
加载 → 清洗 → 分块 → 嵌入 → 存储
Load → Clean → Chunk → Embed → Store
```

### 文档加载器

```typescript
// src/loaders.ts
import * as fs from 'fs/promises';

interface Document {
  content: string;
  metadata: { source: string; type: string; [key: string]: any };
}

// 纯文本加载
async function loadTextFile(path: string): Promise<Document> {
  return { content: await fs.readFile(path, 'utf-8'), metadata: { source: path, type: 'text' } };
}

// Markdown 加载
async function loadMarkdown(path: string): Promise<Document> {
  const content = await fs.readFile(path, 'utf-8');
  // 清除 Markdown 格式标记，保留纯文本
  const cleaned = content
    .replace(/#{1,6}\s/g, '')   // 标题
    .replace(/\*\*(.+?)\*\*/g, '$1')  // 粗体
    .replace(/\[(.+?)\]\(.+?\)/g, '$1'); // 链接
  return { content: cleaned, metadata: { source: path, type: 'markdown' } };
}
```

### 文档清洗

```typescript
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')           // 多个空白 → 单个空格
    .replace(/\n{3,}/g, '\n\n')      // 多个空行 → 两个空行
    .replace(/[^\S\n]+/g, ' ')       // 行内多余空白
    .trim();
}
```

### 分块策略对比

```typescript
// 固定长度分块
function fixedChunk(text: string, size = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size - overlap) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

// 递归分块（推荐）
function recursiveChunk(text: string, size = 500, overlap = 50): string[] {
  const separators = ['\n\n', '\n', '。', '. ', '；', '; ', ' '];

  if (text.length <= size) return [text];

  for (const sep of separators) {
    const parts = text.split(sep);
    if (parts.length > 1) {
      const chunks: string[] = [];
      let current = '';

      for (const part of parts) {
        if (current.length + part.length > size && current.length > 0) {
          chunks.push(current.trim());
          current = current.slice(-overlap) + sep + part;
        } else {
          current += (current ? sep : '') + part;
        }
      }
      if (current.trim()) chunks.push(current.trim());
      return chunks;
    }
  }

  return fixedChunk(text, size, overlap);
}

// 语义分块（基于 Embedding 相似度）
async function semanticChunk(text: string, threshold = 0.8): Promise<string[]> {
  const sentences = text.split(/[。！？.!?]/).filter(s => s.trim());
  const chunks: string[] = [];
  let currentChunk = sentences[0] || '';

  for (let i = 1; i < sentences.length; i++) {
    // 如果当前句子和下一个句子的语义相似度低于阈值，开始新块
    const similarity = await calculateSimilarity(currentChunk, sentences[i]);
    if (similarity < threshold) {
      chunks.push(currentChunk.trim());
      currentChunk = sentences[i];
    } else {
      currentChunk += '。' + sentences[i];
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
}
```


## 🔨 实战演练

**场景描述：**
你是公司的知识管理工程师。公司每天有大量 Markdown 格式的技术文档需要导入到 RAG 系统。这些文档包含代码示例、表格和层级标题。你需要设计一个健壮的文档处理管线。

**你的任务：**
1. 实现一个递归分块函数，能根据 Markdown 标题层级自动分块
2. 对包含代码块的文档特殊处理（代码块单独成块并标注类型）
3. 为每个块生成 Embedding 并存入 ChromaDB，同时保留文档标题作为元数据
4. 编写一个验证函数，检查分块后的内容是否完整（没有截断代码块等）

<details>
<summary>💡 参考实现要点</summary>

```typescript
// 关键验证函数
function validateChunks(chunks: Array<{ content: string; metadata: any }>): string[] {
  const errors: string[] = [];
  chunks.forEach((chunk, i) => {
    const backticks = (chunk.content.match(/```/g) || []).length;
    if (backticks % 2 !== 0) errors.push(`Chunk ${i} has unclosed code block`);
    const openBraces = (chunk.content.match(/\{/g) || []).length;
    const closeBraces = (chunk.content.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) errors.push(`Chunk ${i} has unbalanced braces`);
  });
  return errors;
}
```

**检验标准：**
- 没有代码块被截断（``` 成对出现）
- 每个块包含完整的标题路径（如 "3.2 → 分块策略 → 递归分块"）
- 验证函数能捕获常见的分块错误
</details>

---

## ⚡ 进阶技巧

### 1. 并行化文档加载

处理大量文档时使用并发加载，大幅提升吞吐量：

```typescript
async function loadDocumentsInParallel(paths: string[]): Promise<Document[]> {
  const results = await Promise.allSettled(
    paths.map(async (path) => {
      const ext = path.split('.').pop();
      if (ext === 'md') return loadMarkdown(path);
      if (ext === 'txt') return loadTextFile(path);
      if (ext === 'pdf') return loadPDF(path);
      throw new Error(`Unsupported format: ${ext}`);
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<Document> => r.status === 'fulfilled')
    .map(r => r.value);
}
```

### 2. 分块后的上下文保留策略

在分块时保留标题层级信息作为元数据，避免丢失文档结构：

```typescript
function chunkWithHierarchy(markdown: string): Array<{ content: string; metadata: { heading: string; level: number } }> {
  const lines = markdown.split('\n');
  const chunks: Array<{ content: string; metadata: { heading: string; level: number } }> = [];
  let currentHeader = { text: '', level: 0 };
  let currentContent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      if (currentContent.length > 0) {
        chunks.push({ content: currentContent.join('\n'), metadata: { heading: currentHeader.text, level: currentHeader.level } });
        currentContent = [];
      }
      currentHeader = { text: headerMatch[2], level: headerMatch[1].length };
    }
    currentContent.push(line);
  }
  if (currentContent.length > 0) {
    chunks.push({ content: currentContent.join('\n'), metadata: { heading: currentHeader.text, level: currentHeader.level } });
  }
  return chunks;
}
```

### 3. Embedding 批处理优化

大批量文档嵌入时采用批次处理，避免 API 限流：

```typescript
async function batchEmbed(texts: string[], batchSize = 20): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    });
    results.push(...response.data.map(d => d.embedding));
    // 批次间短暂延迟避免限流
    if (i + batchSize < texts.length) await new Promise(r => setTimeout(r, 200));
  }
  return results;
}
```

## 🧠 知识检查点

1. **什么是递归分块（Recursive Chunking）？它比固定长度分块好在哪里？**

<details>
<summary>点击展开答案</summary>

递归分块是从大到小依次尝试用不同分隔符（段落→句子→标点→空格）分割文本，尽量在语义完整的边界处切分。相比固定长度分块（可能从句子中间截断），递归分块产生的片段语义更完整，检索效果更好。
</details>

2. **chunk_size 和 overlap 参数如何影响检索质量？**

<details>
<summary>点击展开答案</summary>

- **chunk_size**（块大小）：块太小则缺乏上下文语义，块太大则单块包含多个主题、向量表示模糊。500-1000 Token 通常最优。
- **overlap**（重叠）：块之间保留重叠可以让被切分到边界的语义信息不丢失。通常设为 chunk_size 的 10-20%。
</details>

3. **为什么需要文档清洗？清洗不当会有什么后果？**

<details>
<summary>点击展开答案</summary>

文档清洗去除噪声（多余空白、特殊字符、格式标记），确保进入 Embedding 模型的文本质量。清洗不当会导致：Embedding 向量包含噪声、检索时被无关字符干扰、LLM 生成时被格式污染、Token 浪费在无意义字符上。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 分块破坏了代码/表格结构 | 没有意识到代码和表格需要按语法结构分块而非按字符 | 对代码使用按函数/类分块，对表格每行作为一个独立块 |
| Embedding 成本过高 | 对所有文档不加区分地全部嵌入，包括大量无用内容 | 先做文档筛选和去重，只嵌入高质量内容；使用更便宜的 Embedding 模型 |
| 文档更新后向量库未同步 | 没有实现增量更新机制，重新全量索引成本高 | 为每个文档维护版本号，检测变更后只重新嵌入变更的文档块 |

## 📝 本章小结

- ✅ **五步管线** — 加载→清洗→分块→嵌入→存储
- ✅ **分块策略** — 固定长度（简单）、递归（推荐）、语义（精确）
- ✅ **chunkSize 选择** — 500-1000 Token 通常效果最好

## ➡️ 下一章预告

> [第3章：检索策略](./03-retrieval-strategies.md)
