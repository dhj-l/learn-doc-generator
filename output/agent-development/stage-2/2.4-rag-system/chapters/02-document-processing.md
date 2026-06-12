# 第2章：文档处理管线 — 从原始文档到可检索的知识

> 预计学习时间：80-100 分钟

## 🎯 本章目标

掌握文档处理管线的完整流程，理解分块策略的理论基础，能够将原始文档转换为高质量的向量索引。

## 📋 前置知识

- 了解 RAG 三阶段架构（第1章）
- 熟悉 JavaScript/TypeScript 基础语法
- 了解 Embedding 的基本概念

## 💡 核心概念

### 五步处理流程

```
加载 → 清洗 → 分块 → 嵌入 → 存储
Load → Clean → Chunk → Embed → Store
```

### 分块理论：为什么块大小很重要

文档分块（Chunking）是 RAG 系统中**影响检索质量最关键的因素之一**。分块策略直接决定了：

- **检索精度**：块太大则多个主题混在一起，用户查询难以精确匹配
- **上下文完整性**：块太小则语义不完整，LLM 无法理解
- **系统成本**：块越多 → 向量越多 → 存储和检索成本越高

#### 语义边界 vs 语法边界

| 策略 | 语义边界 | 语法边界 |
|------|----------|----------|
| **定义** | 按自然语义段落分块 | 按标点、空行等语法标记分块 |
| **示例** | 按 Markdown 标题、段落主题切换 | 按句号、换行符、字符数 |
| **优点** | 块内语义完整，检索命中率高 | 实现简单，性能稳定 |
| **缺点** | 实现复杂，需额外 NLP 处理 | 可能截断语义完整的段落 |

**最佳实践**：先用语法边界进行粗略分块（递归分块），再用语义边界的块大小约束（500-1000 Token）做精细调整。

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

### 为什么重叠（Overlap）很重要

分块时添加重叠区域（通常为 10-15% 的块大小）可以解决**边界截断问题**。例如，如果一段重要信息恰好被从中间截断，没有重叠的话，两个块都不包含完整信息。重叠确保关键信息至少完整出现在一个块中。

- **推荐重叠比例**：块大小的 10-15%（如 500 Token 块 → 50-75 Token 重叠）
- **递归分块的优势**：自然分隔符作为断点，即使有重叠也保持语义完整

### 嵌入模型选择

| 模型 | 维度 | 适用场景 | 成本 |
|------|------|----------|------|
| `text-embedding-3-small` | 1536 | 通用场景 | 低 |
| `text-embedding-3-large` | 3072 | 高精度场景 | 中 |
| `bge-large-zh` | 1024 | 中文场景 | 免费（本地） |
| `jina-embeddings-v3` | 1024 | 多语言场景 | 免费（本地） |

### Late Chunking（延迟分块）

传统的"分块 → 嵌入"流程存在一个根本问题：**每个块独立嵌入，丢失了块间的上下文信息**。Late Chunking 改变了这一顺序，由 Khattab & Zaharia 在 2020 年的 ColBERT 论文 *"ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT"* 中提出。

**核心思想**：先对整个文档进行编码，然后在 token 级别选择片段用于检索。

```
传统分块：     分块 → [块1] → 嵌入(块1) → 向量1
                    → [块2] → 嵌入(块2) → 向量2   ← 每块独立编码，丢失上下文

Late Chunking： 全文档 → BERT编码 → [token1,...,tokenN]
                                       ↓
                                    按位置选取 token 子集 → 聚合 → 向量
                                    （保留全文档上下文信息）
```

**优势**：
- **上下文感知**：每个 token 的表示都由全文档上下文决定，不会被截断
- **检索精度更高**：在需要细粒度匹配的场景（如实体检索、事实验证）中显著优于传统分块
- **避免边界问题**：无需担心信息恰好落在分块边界上

**代价**：需要编码完整的文档，对于超长文档（>512 tokens）需要使用分段编码策略，增加计算开销。

**适用场景**：需要精准检索特定句子或事实的长文档，而非检索整个段落。

### Small-to-Big Chunking（小到大分块 / Parent-Child 分块）

Small-to-Big 分块（也称 Parent-Child 分块）通过**两层级联结构**来平衡检索精度和上下文完整性：

```
                   检索粒度（小）             返回上下文（大）
                  ┌──────────────┐         ┌──────────────────┐
                  │  Child Chunk │         │   Parent Chunk   │
                  │  （小片段）    │ ──映射──→│   （大片段）      │
                  │  100-200 Tok │         │  500-1000 Tok    │
                  └──────────────┘         └──────────────────┘
```

**工作原理**：
1. **索引时**：将文档划分为 Parent Chunks（大块，如 800 tokens），再将每个 Parent 分割为多个 Child Chunks（小块，如 200 tokens）。Child 记录其对应的 Parent ID。
2. **检索时**：在 Child 粒度上执行向量搜索（精度高），找到最相关的 Child。
3. **返回时**：根据 Child 的 Parent ID，返回完整的 Parent Chunk 作为 LLM 的上下文。

**Trade-off 分析**：

| 策略 | 检索精度 | 上下文完整性 | 典型场景 |
|------|----------|-------------|----------|
| 仅用小块 | ✅ 高（精确匹配相关片段） | ❌ 低（上下文不完整） | 事实验证、实体链接 |
| 仅用大块 | ❌ 低（噪声多） | ✅ 高（信息完整） | 长文本理解 |
| **Small-to-Big** | ✅ 高（小块检索） | ✅ 高（大块返回） | 通用 RAG 最佳折衷 |

**实现要点**：
- Child 大小：100-300 tokens（确保单一片段聚焦）
- Parent 大小：500-1000 tokens（确保语义完整）
- Child 与 Parent 的映射关系使用元数据存储（而非嵌套向量）

### Contextual Retrieval（上下文检索）

**Contextual Retrieval** 由 Anthropic 在 2024 年提出，解决一个被长期忽视的问题：**单个文本块在脱离上下文后，语义可能完全不同的**。

例如，一个块的内容是"他们的收入增长了 20%"，如果没有上下文，我们不知道"他们"是谁。Contextual Retrieval 的解决方案是在嵌入之前，用 LLM 为每个块生成一个上下文前缀：

```
原始块:      "他们的收入增长了 20%"

上下文前缀:  「本文档是关于 Apple 公司 2024 年 Q4 财报的分析…」
             ↓
最终块:      "本文档是关于 Apple 公司 2024 年 Q4 财报的分析。
              他们的收入增长了 20%。"
             ↓
            嵌入 → 向量数据库
```

**实现方式**：

```typescript
// 用 LLM 为每个块生成上下文前缀
async function addContextPrefix(chunk: string, documentContext: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `文档的上下文是：
${documentContext.slice(0, 2000)}

下面是从该文档中抽取的一个块：
${chunk}

请用一句话描述这个块在文档中的具体上下文（不要重复块内容）：`,
    }],
  });
  const prefix = response.content[0].type === 'text' ? response.content[0].text : '';
  return `${prefix}\n\n${chunk}`;
}
```

**优势**：显著提升模糊性块（代词、衔接句）的检索召回率。代价是索引成本增加（需调用 LLM 生成前缀），但检索时无额外开销。

### CJK 分块的 Tokenization 考量

中文、日文、韩文（CJK）等语言与英文在 Tokenization 上存在根本差异，这直接影响分块策略：

| 特性 | 英文 | 中文 |
|------|------|------|
| **词边界** | 空格分隔，天然词边界 | **无空格边界**，需分词 |
| **Token/字符比** | 1 Token ≈ 4 字符 | 1 Token ≈ 1-2 字符 |
| **信息密度** | 每个 Token 信息量较高 | 每个 Token 信息量较低 |
| **分词工具** | BPE 分词（如 GPT-4 Tokenizer） | 需 Jieba/LAC 等中文分词器辅助 |

**关键问题**：CJK 文本在相同的 Token 限制下能容纳比英文多得多的"内容量"。例如，512 Tokens 的英文约 2000 字符，而 512 Tokens 的中文约 500-800 汉字，两者信息量并不对等。

**实践建议**：
- **按 Token 而非字符分块**：使用 `tiktoken` 或对应模型的分词器精确计算 Token 数，而非按字符长度硬切
- **CJK 块大小偏大**：中文场景建议 800-1000 Tokens（而非英文的 500 Tokens）
- **保留句子边界**：中文分句使用句号（。）、问号（？）、感叹号（！）作为分隔符
- **考虑混合内容**：中英混合文本（如技术文档）应使用 Token 计数而非字符计数
- **使用支持 CJK 的嵌入模型**：如 `bge-large-zh`（中国）、`jina-embeddings-v3`（多语言）、`text-embedding-3-small`（OpenAI，支持多语言）

**实现示例**：

```typescript
import { encoding_for_model } from 'tiktoken';

function cjkAwareChunk(text: string, maxTokens: number = 800): string[] {
  const enc = encoding_for_model('gpt-4');
  const tokens = enc.encode(text);
  const chunks: string[] = [];
  let start = 0;

  // CJK 句子边界：句号、问号、感叹号、换行
  const cjkSentenceBreaks = /[。？！\n]/;

  while (start < tokens.length) {
    let end = Math.min(start + maxTokens, tokens.length);
    // 尽量在句子边界处断开
    const chunkText = enc.decode(tokens.slice(start, end));
    const lastBreak = Math.max(
      chunkText.lastIndexOf('。'),
      chunkText.lastIndexOf('？'),
      chunkText.lastIndexOf('！'),
      chunkText.lastIndexOf('\n'),
    );
    if (lastBreak > maxTokens * 0.3) {
      // 重新计算 Token 边界
      const adjustedText = chunkText.slice(0, lastBreak + 1);
      end = start + enc.encode(adjustedText).length;
    }
    chunks.push(enc.decode(tokens.slice(start, end)));
    start = end - Math.floor(maxTokens * 0.1); // 10% 重叠
  }

  enc.free();
  return chunks;
}
```

## 🔨 实战演练

### 场景描述

你正在为一个法律文档管理平台构建文档处理管线。法律文档包含：合同条款（含编号）、法律条文引用（如"第X条"）、以及裁决案例摘要。这些文档通常很长（10-50 页），且内部结构层次分明。

### 你的任务

1. 设计一个 `LegalChunker` 类，支持按法律章节（`第X条`）为分隔符进行分块
2. 为每个块添加层级元数据：`{ chapter, section, article }`
3. 实现一个 `SmartOverlap` 函数：当断点落在句子中间时，回退到上一个完整句子再截断

<details>
<summary>💡 参考实现</summary>

```typescript
interface LegalMetadata {
  chapter?: string;
  section?: string;
  article?: string;
}

class LegalChunker {
  chunk(text: string): Array<{ content: string; metadata: LegalMetadata }> {
    const chunks: Array<{ content: string; metadata: LegalMetadata }> = [];
    const articles = text.split(/(?=第[一二三四五六七八九十百千]+条)/);

    for (const article of articles) {
      const articleMatch = article.match(/第[一二三四五六七八九十百千]+条/);
      const articleNum = articleMatch?.[0] || '';

      // 进一步拆分过长的条款
      const sentences = this.splitByLength(article, 800);
      for (const sentence of sentences) {
        chunks.push({
          content: sentence,
          metadata: { article: articleNum },
        });
      }
    }
    return chunks;
  }

  private splitByLength(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];
    const parts: string[] = [];
    // 在最后一个完整句子处断开
    while (text.length > maxLength) {
      const slice = text.slice(0, maxLength);
      const lastPeriod = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('；'));
      const breakPoint = lastPeriod > maxLength * 0.5 ? lastPeriod + 1 : maxLength;
      parts.push(text.slice(0, breakPoint));
      text = text.slice(breakPoint);
    }
    if (text) parts.push(text);
    return parts;
  }
}

// SmartOverlap: 最近的完整句子处断开
function smartOverlap(text: string, maxTokens: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxTokens;
    if (end >= text.length) {
      chunks.push(text.slice(start));
      break;
    }
    // 回退到上一个完整句子
    const searchWindow = text.slice(start, end);
    const lastSentenceEnd = Math.max(
      searchWindow.lastIndexOf('。'),
      searchWindow.lastIndexOf('\n'),
    );
    end = lastSentenceEnd > maxTokens * 0.3 ? start + lastSentenceEnd + 1 : end;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}
```

</details>

## ⚡ 进阶技巧

### 1. 动态分块大小

```typescript
// 根据文档类型动态调整分块大小
function getChunkSize(docType: string): number {
  const sizes: Record<string, number> = {
    'code': 200,       // 代码文档：小块，精确匹配
    'legal': 800,      // 法律文档：大块，保持条款完整
    'general': 500,    // 通用文档：中等
    'faq': 300,        // FAQ：小块，一问一答
  };
  return sizes[docType] || 500;
}
```

### 2. 元数据传播

```typescript
// 确保子块继承父文档的元数据
async function indexWithMetadataPropagation(doc: Document) {
  const chunks = recursiveChunk(doc.content, 500, 50);
  const ids = chunks.map((_, i) => `${doc.metadata.id}_${i}`);
  const metadatas = chunks.map((chunk) => ({
    ...doc.metadata,
    chunkIndex: i,
    // 从块内容中自动提取标签
    tags: extractTags(chunk),
    // 块内是否包含标题
    hasHeading: /^#/.test(chunk.trim()),
  }));
  await collection.add({ ids, documents: chunks, metadatas });
}
```

### 3. 使用 tiktoken 精确计算 Token

```typescript
import { encoding_for_model } from 'tiktoken';

function chunksByToken(text: string, maxTokens: number = 500): string[] {
  const enc = encoding_for_model('gpt-4');
  const tokens = enc.encode(text);
  const chunks: string[] = [];
  let start = 0;

  while (start < tokens.length) {
    const end = Math.min(start + maxTokens, tokens.length);
    const chunkTokens = tokens.slice(start, end);
    chunks.push(enc.decode(chunkTokens));
    start = end - Math.floor(maxTokens * 0.1); // 10% overlap
  }

  enc.free();
  return chunks;
}
```

## 🧠 知识检查点

### Q1: 为什么分块时需要设置重叠（Overlap）？推荐比例是多少？

<details>
<summary>查看答案</summary>

**答案：** 重叠解决**边界截断问题**——如果一段重要信息恰好被从中间截断，没有重叠的话，两个块都不包含完整信息。推荐重叠比例为块大小的 **10-15%**（如 500 Token 块 → 50-75 Token 重叠）。

</details>

### Q2: 递归分块（Recursive Chunking）相比固定长度分块有哪些优势？

<details>
<summary>查看答案</summary>

**答案：** 递归分块按自然分隔符的优先级（段落 > 句子 > 标点 > 字符）切分，优势在于：1) **块内语义更完整**——不会在句子中间截断；2) **内容可读性更好**——保留了自然语言结构；3) **检索命中率更高**——因为每个块都是语义完整的单元。固定长度分块虽然简单，但经常截断关键信息。

</details>

### Q3: 什么情况下应该选择语义分块（Semantic Chunking）而非递归分块？

<details>
<summary>查看答案</summary>

**答案：** 语义分块在以下场景更适用：1) **文档主题频繁切换**（如会议纪要、新闻摘要）——每个语义块可以对应一个独立话题；2) **检索精度要求极高**——语义阈值可以精确控制块内一致性。但代价是计算成本高（需要多次 Embedding 计算），实时处理场景下递归分块是更好的默认选择。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| ❌ 分块后检索结果不完整 | 块大小设置过小（<200 Token），关键信息被截断或分散 | 设置块大小为 500-1000 Token，并根据文档类型调整 |
| ❌ 不同文档的元数据格式不一致 | 未在索引阶段统一元数据结构 | 定义统一的 `Document` 接口，使用 `metadata` 字段标准化 |
| ❌ 特殊字符导致 Embedding 质量下降 | 文档中包含 HTML 标签、特殊 Unicode 字符 | 在清洗阶段使用 `cleanText()` 函数进行归一化处理 |

## 📝 本章小结

- ✅ **五步管线** — 加载→清洗→分块→嵌入→存储
- ✅ **分块策略** — 固定长度（简单）、递归（推荐）、语义（精确）
- ✅ **分块理论** — 块大小决定检索精度与成本；重叠解决边界截断
- ✅ **语义边界 vs 语法边界** — 先按语法边界粗略分块，再用块大小约束精细调整
- ✅ **chunkSize 选择** — 500-1000 Token 通常效果最好，中文场景建议偏大（800-1000）
- ✅ **元数据管理** — 为每个块添加层级元数据，支持按类别/来源过滤检索

## ➡️ 下一章预告

> [第3章：检索策略](./03-retrieval-strategies.md) — 深入对比稠密检索、稀疏检索和混合检索的原理与实践。
