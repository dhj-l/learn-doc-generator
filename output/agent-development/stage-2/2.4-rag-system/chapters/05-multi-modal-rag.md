# 第5章：多模态 RAG — 处理图片、表格和 PDF

> 预计学习时间：80-100 分钟

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
  // 1. 用 Claude 描述每张图片
  const imageDescriptions = await Promise.all(
    images.map(img => describeImage(img))
  );

  // 2. 将描述存储到向量数据库
  await storeDescriptions(imageDescriptions);

  // 3. 用文本查询检索图片描述
  return await searchByDescription(query);
}
```

---

## 📝 本章小结

- ✅ **PDF 处理** — 文本提取 + 表格识别 + 图片分析
- ✅ **多模态 Embedding** — 图文联合理解和检索
