# 第4章：Vision 多模态 — 让 Claude 看懂图片

> 预计学习时间：70-90 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **发送图片给 Claude 分析** — 使用 Vision 能力理解图像内容
- **进行多模态对话** — 在同一对话中混合文本和图片
- **分析 PDF 文档** — 提取 PDF 中的文字和图表信息
- **构建图片分析应用** — 实现图片描述、OCR、图表解读等功能

## 📋 前置知识

> 建议先完成：[第1章：API 基础](./01-api-fundamentals.md)

---

## 💡 核心概念

### 概念一：Claude 的视觉能力

Claude 可以「看懂」图片——你可以把图片作为消息的一部分发送给它。

```
支持的图片格式：JPEG、PNG、GIF、WebP
图片来源：Base64 编码 或 URL 链接
最大图片大小：建议不超过 5MB
```

```typescript
// src/01-basic-vision.ts
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs/promises';

const client = new Anthropic();

// 方式 1：使用 Base64 编码（本地文件）
async function analyzeLocalImage(imagePath: string, question: string) {
  const imageData = await fs.readFile(imagePath);
  const base64 = imageData.toString('base64');
  const mediaType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64,
          },
        },
        {
          type: 'text',
          text: question,
        },
      ],
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}

// 方式 2：使用 URL（远程图片）
async function analyzeRemoteImage(imageUrl: string, question: string) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'url',
            url: imageUrl,
          },
        },
        {
          type: 'text',
          text: question,
        },
      ],
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}
```

### 概念二：多图片分析

一次请求可以发送多张图片进行对比或综合分析：

```typescript
// src/02-multi-image.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function compareDesigns(imageUrls: string[]) {
  const imageContent: Anthropic.ContentBlockParam[] = imageUrls.map((url, index) => ({
    type: 'image' as const,
    source: {
      type: 'url' as const,
      url,
    },
  }));

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        ...imageContent,
        {
          type: 'text',
          text: `以上是 ${imageUrls.length} 个 UI 设计方案。
请从以下维度对比分析：
1. 视觉层次
2. 用户体验
3. 可访问性
4. 品牌一致性

输出表格对比，最后推荐最佳方案。`,
        },
      ],
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}
```

### 概念三：图表和数据可视化分析

```typescript
// src/03-chart-analysis.ts
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs/promises';

const client = new Anthropic();

async function analyzeChart(chartPath: string) {
  const imageData = await fs.readFile(chartPath);
  const base64 = imageData.toString('base64');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: base64 },
        },
        {
          type: 'text',
          text: `请分析这张图表：
1. 图表类型是什么？
2. X 轴和 Y 轴分别表示什么？
3. 主要趋势和模式
4. 异常数据点（如有）
5. 关键数据提取（用 JSON 格式）
6. 基于数据的建议`,
        },
      ],
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}
```

### 概念四：OCR — 从图片中提取文字

```typescript
// src/04-ocr.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

interface OcrResult {
  rawText: string;
  structuredData: Record<string, string>;
  confidence: 'high' | 'medium' | 'low';
}

async function extractTextFromImage(
  imageBase64: string,
  format: 'receipt' | 'id_card' | 'invoice' | 'general' = 'general'
): Promise<OcrResult> {
  const formatPrompts = {
    receipt: '提取收据中的：商品名称、数量、单价、总计、日期、商家名称',
    id_card: '提取身份证中的：姓名、性别、民族、出生日期、住址、身份证号',
    invoice: '提取发票中的：发票号、日期、购买方、销售方、商品明细、金额',
    general: '提取图片中的所有文字',
  };

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: imageBase64 },
        },
        {
          type: 'text',
          text: `请从这张图片中提取文字信息。
${formatPrompts[format]}

输出 JSON 格式：
{
  "raw_text": "原始文字内容",
  "structured_data": { "key": "value" },
  "confidence": "high/medium/low"
}`,
        },
      ],
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  try {
    return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
  } catch {
    return { rawText: text, structuredData: {}, confidence: 'low' };
  }
}
```

---

## 🔨 实战演练

### 练习：构建一个图片描述生成器

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs/promises';

const client = new Anthropic();

interface ImageDescription {
  shortCaption: string;    // 一句话描述
  detailedDescription: string;  // 详细描述
  tags: string[];          // 标签
  colors: string[];        // 主色调
  mood: string;            // 氛围
}

async function generateImageDescription(imagePath: string): Promise<ImageDescription> {
  const imageData = await fs.readFile(imagePath);
  const base64 = imageData.toString('base64');
  const mediaType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20241022',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
        {
          type: 'text',
          text: `请为这张图片生成描述，输出 JSON 格式：
{
  "short_caption": "一句话描述（15字以内）",
  "detailed_description": "详细描述（100-200字）",
  "tags": ["标签1", "标签2", ...],
  "colors": ["主色调1", "主色调2"],
  "mood": "氛围描述"
}`,
        },
      ],
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
}

// 使用
const desc = await generateImageDescription('./photo.jpg');
console.log('📝 标题:', desc.shortCaption);
console.log('📖 描述:', desc.detailedDescription);
console.log('🏷️ 标签:', desc.tags.join(', '));
```

</details>

---

## 📝 本章小结

- ✅ **图片输入** — Base64 编码或 URL 链接
- ✅ **多模态消息** — content 数组可以混合 text 和 image 类型
- ✅ **多图对比** — 一次请求发送多张图片进行对比分析
- ✅ **图表分析** — 让 Claude 解读数据可视化图表
- ✅ **OCR** — 从图片中提取结构化文字信息

## ➡️ 下一章预告

> [第5章：高级特性](./05-advanced-features.md) — Prompt Caching、Extended Thinking、Batch API。
