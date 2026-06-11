# 第2章：文档处理管线 — 从原始文档到可检索的知识

> 预计学习时间：80-100 分钟

## 💡 五步处理流程

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

---

## 📝 本章小结

- ✅ **五步管线** — 加载→清洗→分块→嵌入→存储
- ✅ **分块策略** — 固定长度（简单）、递归（推荐）、语义（精确）
- ✅ **chunkSize 选择** — 500-1000 Token 通常效果最好

## ➡️ 下一章预告

> [第3章：检索策略](./03-retrieval-strategies.md)
