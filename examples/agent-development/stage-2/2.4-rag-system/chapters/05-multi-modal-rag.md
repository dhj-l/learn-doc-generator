# 第5章：多模态 RAG — 处理图片、表格和 PDF

> 预计学习时间：80-100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **构建 PDF 处理管线** — 从 PDF 中提取文本、表格、图片
- **实现多模态 Embedding** — 图文联合理解和检索
- **处理表格数据的结构化提取**

## 📋 前置知识

> 建议先完成：[第1章：RAG 基础](./01-rag-fundamentals.md)

---

## 💡 核心概念

### PDF 处理管线

```typescript
// 使用 pdf-parse 提取文本
import pdf from 'pdf-parse';

async function loadPDF(path: string): Promise<string[]> {
  const buffer = await fs.readFile(path);
  const data = await pdf(buffer);
  return splitByPages(data.text, data.numpages);
}

// 使用 LLM 处理 PDF 中的表格和图片
async function extractTableFromImage(imageBase64: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
        { type: 'text', text: '将这张图片中的表格转换为 Markdown 格式。' },
      ],
    }],
  });
  return response.content[0].type === 'text' ? response.content[0].text : '';
}
```

### 多模态 Embedding

```typescript
// 图片 + 文本的联合检索
async function multiModalSearch(query: string, images: string[]) {
  // 1. 用视觉模型描述图片
  const imageDescriptions = await Promise.all(
    images.map(img => describeImage(img))
  );

  // 2. 将描述存储到向量数据库
  await storeDescriptions(imageDescriptions);

  // 3. 用文本查询检索图片描述
  return await searchByDescription(query);
}

async function describeImage(imageBase64: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: '详细描述这张图片的内容。' },
      ],
    }],
  });
  return response.content[0].type === 'text' ? response.content[0].text : '';
}
```

**💡 为什么不是直接存储图片而是先描述？** 向量数据库无法直接比较「图片相似度」和「文本相似度」。先把图片转成文字描述，然后用文本 Embedding 统一检索。这是目前最实用的多模态 RAG 方案。

## 🔨 实战演练

**场景描述：**
你是公司的文档自动化工程师。公司收到大量包含表格和图表的 PDF 报告（月报、季报），需要将这些报告纳入 RAG 系统以便管理人员用自然语言查询数据。

**你的任务：**
1. 实现一个 PDF 加载器，能同时提取文本和表格
2. 对表格做结构化提取（用 LLM 辅助校验）
3. 对图片/图表做分层描述（整体 + 细节）
4. 实现一个统一的检索入口，支持"检索 2024Q3 的营收数据"这类跨文本和表格的查询

<details>
<summary>💡 参考实现要点</summary>

```typescript
async function processReportPDF(pdfPath: string) {
  const pages = await loadPDF(pdfPath);
  const results = { texts: [], tables: [], images: [] };

  for (const [pageNum, page] of pages.entries()) {
    const pageImages = await extractImagesFromPage(pdfPath, pageNum);
    for (const img of pageImages) {
      const analysis = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20241022',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: img.base64 } },
            { type: 'text', text: '这个页面包含什么？请提取：1) 表格数据 2) 图表关键数字 3) 主要结论' },
          ],
        }],
      });
      // 根据分析结果分别存入 texts/tables/images
    }
  }
  return results;
}
```

**检验标准：**
- 表格数据被正确提取且数字无误
- 对"2024Q3 营收"的查询能返回正确的表格行
- 对"趋势如何"的查询能引用图表中的关键数据
</details>

## ⚡ 进阶技巧

### 1. 表格的结构化提取与检索

将 PDF 中的表格提取为 Markdown 格式，并用结构化方式检索：

```typescript
async function extractAndStoreTables(pdfPath: string) {
  const tables = await extractTablesFromPDF(pdfPath); // 返回 Array<{ headers: string[]; rows: string[][] }>
  for (const table of tables) {
    // 将表格转为结构化文本
    const markdownTable = [
      `| ${table.headers.join(' | ')} |`,
      `| ${table.headers.map(() => '---').join(' | ')} |`,
      ...table.rows.map(row => `| ${row.join(' | ')} |`),
    ].join('\n');

    // 同时存储 Markdown 格式和自然语言描述
    const nlDescription = `表格包含列: ${table.headers.join(', ')}，共 ${table.rows.length} 行数据。`;
    await collection.add({
      ids: [`table-${Date.now()}`],
      documents: [markdownTable],
      metadatas: [{ type: 'table', description: nlDescription }],
    });
  }
}
```

### 2. 图片的层级描述策略

对图片进行分层描述，先整体后局部：

```typescript
async function hierarchicalImageDesc(imageBase64: string): Promise<{ overall: string; details: string[] }> {
  // 第一层：整体描述
  const overall = await askLLM(imageBase64, '用一句话概括这张图片的内容');

  // 第二层：局部细节
  const detailsPrompt = `仔细分析这张图片，列出 3-5 个关键细节，每个细节用一句话描述。`;
  const detailsText = await askLLM(imageBase64, detailsPrompt);
  const details = detailsText.split('\n').filter(l => l.trim());

  return { overall: overall.trim(), details };
}
```

### 3. 混合模态检索的 Query Routing

根据用户问题的类型，路由到不同的检索通道：

```typescript
async function routeQuery(query: string) {
  const intent = await classifyIntent(query); // 'text' | 'image' | 'table' | 'mixed'
  switch (intent) {
    case 'image': return await searchImages(query);
    case 'table': return await searchTables(query);
    case 'mixed': return await Promise.all([
      searchText(query), searchImages(query), searchTables(query)
    ]).then(r => r.flat());
    default: return await searchText(query);
  }
}
```

## 🧠 知识检查点

1. **为什么多模态 RAG 中通常先"以图转文"再检索？而不是直接做图片到图片的相似度匹配？**

<details>
<summary>点击展开答案</summary>

当前的向量数据库缺少统一的跨模态（文本→图片）相似度比较能力。文本的 Embedding 和图片的 Embedding 不在同一个向量空间。把图片先用视觉模型（如 Claude、GPT-4V）转为文字描述，再用文本 Embedding 统一检索，是目前最实用、效果最好的多模态 RAG 方案。
</details>

2. **PDF 处理中最棘手的三个问题是什么？**

<details>
<summary>点击展开答案</summary>

1. **表格提取** — PDF 中的表格没有语义标记，只能靠坐标推断
2. **多栏布局** — 双栏/多栏 PDF 的文本流容易交叉混乱
3. **非嵌入式字体** — 某些 PDF 的字体未嵌入，导致文本提取为乱码或无法提取
</details>

3. **图片描述的质量如何影响检索效果？**

<details>
<summary>点击展开答案</summary>

图片描述的质量直接决定了检索效果。描述过短（"一张图表"）无法区分不同图片，描述过长（包含大量无关细节）会引入噪声。最佳实践是先做整体描述（用于粗筛），再做关键细节提取（用于精排），并在描述中包含图片中的文字信息（如表格中的数字、图表中的标签）。
</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| PDF 表格提取后数据错误 | 依赖纯坐标解析，未语义校验提取结果 | 提取后用 LLM 校验表格内容的合理性，修正明显异常值 |
| 图片描述过于泛化 | 使用了通用 Prompt（"描述这张图片"），缺少领域指导 | 根据图片类型定制 Prompt：对图表要求"列出所有数据点和标签"，对截图要求"提取所有按钮和文字" |
| 多模态检索延迟过高 | 每张图片都调用视觉模型描述，导致大量 API 调用 | 缓存已描述过的图片（用图片哈希索引），批量处理而非逐张处理 |

## 📝 本章小结

- ✅ **PDF 处理** — 文本提取 + 表格识别 + 图片分析
- ✅ **多模态 Embedding** — 图文联合理解和检索
- ✅ **图片先转描述再检索** — 统一文本和图片的检索方式

## ➡️ 下一章预告

> [第6章：RAG 评估](./06-rag-evaluation.md) — 衡量检索质量和生成质量的指标体系

---
