# 第5章：多模态 RAG — 处理图片、表格和 PDF

> 预计学习时间：80-100 分钟

## 🎯 本章目标

理解多模态 RAG 的架构设计，掌握图文联合检索（CLIP）的原理，能够构建处理 PDF、图片和表格的混合模态知识库系统。

## 📋 前置知识

- 掌握基础 RAG 三阶段架构（第1章）
- 了解文档分块策略（第2章）
- 熟悉向量嵌入的基本概念（第3章）

## 💡 核心概念

### 为什么需要多模态 RAG？

现实世界中的知识以多种形式存在：
- **文本**：文章、报告、文档
- **图片**：产品图、示意图、流程图
- **表格**：数据报表、对比表
- **PDF**：混合了上述所有格式

基础 RAG 只能处理纯文本，而多模态 RAG 能够：

| 模态 | 检索方式 | 应用场景 |
|------|----------|----------|
| 文本↔文本 | 传统向量检索 | 文档问答 |
| 文本↔图片 | CLIP 联合嵌入 | "找一个红色跑步鞋的图片" |
| 图片↔图片 | 视觉特征检索 | "找和这张图风格相似的" |
| 表格 | 结构化语义检索 | "Q3 销售数据" |

### CLIP：多模态检索的核心技术

**CLIP**（Contrastive Language-Image Pre-training, Radford et al. 2021, OpenAI）是 OpenAI 提出的多模态对比学习模型。它通过**对比学习**在一个共享的向量空间中同时编码文本和图片。

```
                   余弦相似度
                  ╱         ╲
             文本向量       图片向量
               ↑              ↑
          文本编码器       图片编码器
          (Text Encoder)  (Image Encoder)
               ↑              ↑
          "一只可爱的猫"    [图片]
```

CLIP 的训练过程：
1. **Batch 构建**：从互联网收集 4 亿对 (图片, 文本) 数据
2. **双塔编码**：文本通过 Text Transformer，图片通过 Vision Transformer (ViT)
3. **对比损失**：最大化配对的 (图片, 文本) 相似度，最小化未配对的相似度
4. **零样本迁移**：训练后无需微调即可直接用于图文检索

### ColPali：视觉驱动的文档检索（2024）

**ColPali**（Faysse et al. 2024）代表了多模态检索的最新突破。与 CLIP 不同，ColPali 使用**视觉语言模型（VLM）直接嵌入整页文档图像**，无需先通过 OCR 或 PDF 解析器提取文本。

```
传统流程: PDF → OCR/解析 → 文本分块 → 文本嵌入 → 检索
                    ╰── 信息丢失 ──╯

ColPali:   PDF → 页面截图 → VLM 编码 → 视觉嵌入 → 检索
                    ╰── 无信息丢失 ──╯
```

ColPali 的核心创新：
1. **端到端视觉编码**：将文档页面渲染为图像后，直接用 VLM（如 PaliGemma）编码为向量，跳过所有文本提取步骤
2. **Late Interaction 机制**：保留 token 级别的细粒度匹配（类似 ColBERT），而非压缩为单一向量，支持更精确的页面区域定位
3. **Byaldi 库**（`byaldi`）：ColPali 的官方开源实现，与 Hugging Face 集成，几行代码即可部署

ColPali 在处理复杂 **PDF（表格、多栏布局、手写注释）** 时显著优于传统 OCR+Embedding 方案，因为后者在文本提取阶段就已丢失布局信息和视觉语义。

### 布局感知文档解析

现实文档的布局高度复杂——多栏文本、嵌套表格、页眉页脚、图文混排——而传统的"逐行提取"会彻底破坏这种结构。

**LayoutLM**（Xu et al. 2020, Microsoft）是第一代将**空间位置信息**融入预训练的文档理解模型。它在 BERT 的基础上引入了三种 Embedding：
- **文本 Embedding**：词汇的语义
- **位置 Embedding**：词汇在文本序列中的顺序
- **空间 Embedding**：词汇在页面上的 2D 坐标 (x₀, y₀, x₁, y₁)

这使得 LayoutLM 能够区分"表格标题"和"表格内容"、理解"左栏先于右栏"的阅读顺序。后续的 **LayoutLMv2/v3** 进一步加入了视觉 Embedding（页面截图的特征），实现了真正的图文融合理解。

| 工具 | 方法 | 适用场景 |
|------|------|----------|
| **LayoutLM** | 文本 + 空间位置联合预训练 | 文档布局理解、信息抽取 |
| **DocTR** (2022) | 端到端 OCR（文本检测 + 识别） | 高精度文字识别，支持多语言 |
| **Unstructured.io** | 规则 + ML 混合布局分析 | 批量 PDF/文档预处理管线 |

**DocTR**（Document Text Recognition）由 Mindee 开发，采用端到端深度学习：先通过 DBNet 检测文本区域，再通过 CRNN 识别文字。与 Tesseract 等传统 OCR 相比，DocTR 对复杂版面（倾斜文字、模糊扫描件）的鲁棒性更强。

### VLM 驱动的跨模态检索

现代**视觉语言模型（VLM）**——如 GPT-4V、Claude Vision、LLaVA——能够直接理解图像内容。在多模态 RAG 的语境下，VLM 带来了三种新的检索范式：

1. **图像级检索**：将图像通过 VLM 编码为向量，直接与文本向量在共享空间中进行相似度比较。例如，查询"日落时分的海滩"可直接匹配到对应的风景照片，无需文字描述。

2. **图文联合生成索引**：用 VLM 为每张图片生成多角度文字描述（视觉描述、风格标注、情绪标签），然后将描述与图片向量一同存储。检索时同时匹配文本向量和图像向量。

3. **跨模态推理检索**：将用户的自然语言查询转化为多模态查询。例如，"这张图中产品有哪些安全隐患？"——VLM 既理解图片中的视觉元素，又能进行语义推理，检索结果可以包含相关文本规范和类似案例图片。

```
VLM 跨模态检索的核心能力：
  文本查询 ──→ [VLM 编码器] ──→ 统一向量空间 ←── [VLM 编码器] ←── 图片
                      ↓                      ↓
                文本侧索引               视觉侧索引
                      ↓                      ↓
                 ───→ 混合融合与重排序 ←───
                            ↓
                      Top-K 结果
```

这种范式的优势在于**检索与理解合一**：传统流程中"先用元数据检索图片，再用 VLM 理解图片"是两步分离的，而 VLM 检索可以在一次匹配中完成语义理解，避免了信息在流水线中的逐级衰减。

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

多模态检索的核心是**将不同模态的数据映射到同一语义空间**。有两种实现路径：

| 路径 | 方法 | 优点 | 缺点 |
|------|------|------|------|
| **显式描述** | 用 LLM 描述图片内容，将描述存入向量库 | 实现简单，兼容纯文本检索 | 丢失视觉细节，依赖描述质量 |
| **CLIP 联合嵌入** | 用 CLIP 直接编码图片和文本 | 保留视觉语义，零样本效果好 | 需要额外模型，计算成本高 |

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

### 多模态 RAG 架构

```
用户查询 ──→ 文本编码器 ──→ 向量 ──┐
                                  ↓
                           统一向量空间 ←── CLIP 图片编码器 ←── 图片
                                  ↓
                           向量数据库 (混合索引)
                                  ↓
                           Top-K 结果 (文本+图片)
                                  ↓
                           LLM 生成回答
```

## 🔨 实战演练

### 场景描述

你正在为一家**电商平台**构建智能商品搜索系统。用户可以通过自然语言查询商品，例如"给我找一双适合跑步的红色运动鞋"或"这个风格的连衣裙有绿色的吗？"。平台有数千件商品的图片和描述文本。

### 你的任务

1. 实现一个 `ProductSearchEngine` 类，支持图文联合检索
2. 当用户上传图片时，使用 CLIP 风格的"以图搜图"功能
3. 实现结果融合：将文本检索和图片检索的结果用 RRF 混合排序

<details>
<summary>💡 参考实现</summary>

```typescript
interface Product {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  category: string;
  price: number;
}

class ProductSearchEngine {
  private textCollection: any;
  private imageCollection: any;

  async searchByText(query: string): Promise<Product[]> {
    // 文本检索
    const textResults = await this.textCollection.query({
      queryTexts: [query],
      nResults: 10,
    });
    return this.formatResults(textResults);
  }

  async searchByImage(imageBase64: string): Promise<Product[]> {
    // 1. 用 LLM 描述图片
    const description = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
          { type: 'text', text: '用 50 字以内描述这张图片中的商品。' },
        ],
      }],
    });

    // 2. 用描述检索
    return this.searchByText(
      description.content[0].type === 'text' ? description.content[0].text : ''
    );
  }

  async hybridSearch(query: string, imageBase64?: string): Promise<Product[]> {
    const textResults = await this.searchByText(query);
    let imageResults: Product[] = [];

    if (imageBase64) {
      imageResults = await this.searchByImage(imageBase64);
    }

    return this.rrfFusion(textResults, imageResults);
  }

  private rrfFusion(a: Product[], b: Product[], k: number = 60): Product[] {
    const scores = new Map<string, number>();
    a.forEach((p, i) => scores.set(p.id, (scores.get(p.id) || 0) + 1 / (k + i + 1)));
    b.forEach((p, i) => scores.set(p.id, (scores.get(p.id) || 0) + 1 / (k + i + 1)));
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => a.find(p => p.id === id) || b.find(p => p.id === id)!);
  }
}
```

</details>

## ⚡ 进阶技巧

### 1. 结构化数据提取与索引

```typescript
// 将表格数据同时存储为文本描述和结构化 JSON
function indexTable(headers: string[], rows: string[][]) {
  const textDescription = `表格：${headers.join(' | ')}\n` +
    rows.map(r => r.join(' | ')).join('\n');

  const structured = {
    headers,
    rows,
    summary: `共 ${rows.length} 行数据，列包含：${headers.join(', ')}`,
  };

  return {
    text: textDescription,
    metadata: { type: 'table', columns: headers.length, rows: rows.length },
    structured,
  };
}
```

### 2. 图片分块与区域检索

```typescript
// 对大型图片（如图表、架构图）进行分块检索
async function chunkedImageSearch(imageBase64: string, query: string): Promise<string> {
  // 将图片分割为 4 个象限
  const quadrants = splitImageIntoGrid(imageBase64, 2, 2);
  const descriptions = await Promise.all(
    quadrants.map(q => describeImageRegion(q))
  );

  // 检索与查询最相关的区域
  const relevant = await semanticSearch(query, descriptions);
  return relevant[0]?.description || '';
}
```

### 3. 多模态 RAG 的 Fallback 策略

```typescript
// 当图片质量差时自动降级为文本检索
async function robustMultiModalSearch(query: string, imageBase64?: string) {
  if (!imageBase64) return textOnlySearch(query);

  // 验证图片质量
  const quality = await assessImageQuality(imageBase64);
  if (quality < 0.3) {
    console.warn('⚠️ 图片质量过低，降级为纯文本检索');
    return textOnlySearch(query);
  }

  return hybridSearch(query, imageBase64);
}
```

## 🧠 知识检查点

### Q1: CLIP 如何实现图片和文本的联合编码？其训练目标是什么？

<details>
<summary>查看答案</summary>

**答案：** CLIP 使用双塔架构——文本编码器（Text Transformer）和图片编码器（Vision Transformer/ViT），将图片和文本映射到同一个向量空间。训练使用**对比学习 (Contrastive Learning)** 目标：对 Batch 内的 N 对 (图片, 文本)，最大化配对对的余弦相似度，同时最小化其他 N²-N 个非配对对的相似度（InfoNCE 损失）。CLIP 使用 4 亿对 (图片, 文本) 数据训练，支持零样本迁移。

</details>

### Q2: 多模态 RAG 的"显式描述"路径和"CLIP 联合嵌入"路径各有什么优缺点？

<details>
<summary>查看答案</summary>

**答案：** **显式描述路径**（先用 LLM 描述图片再检索文本描述）优点是实现简单、兼容纯文本检索基础设施、描述包含语义推理；缺点是丢失了纯视觉细节（颜色、纹理、构图），且依赖 LLM 的描述质量。**CLIP 联合嵌入路径**优点是保留完整的视觉语义、支持零样本图文检索；缺点是需要额外的 CLIP 模型部署、向量维度可能不兼容、计算成本更高。实践中常混合使用两种路径。

</details>

### Q3: 处理 PDF 文档时，如何应对表格和图片内容不可检索的问题？

<details>
<summary>查看答案</summary>

**答案：** PDF 中的表格和图片通常无法被文本提取工具直接读取。常用的应对策略包括：1) **PDF 转图片后 OCR+LLM 提取**——将 PDF 页面转为图片，用 OCR 提取文字，用 LLM 理解表格结构；2) **多模态 Embedding**——用 CLIP 对 PDF 页面截图进行编码，直接检索视觉特征；3) **混合索引**——同时存储提取的文本（用于关键词匹配）和页面截图向量（用于视觉匹配）。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| ❌ 图片检索返回的结果与文本描述不符 | CLIP/LLM 对图片的理解有偏差，描述丢失了关键细节 | 对图片进行多角度描述（如同时描述内容和风格）；使用图片+描述联合嵌入 |
| ❌ PDF 文本提取后表格数据混乱 | PDF 文本提取工具（如 pdf-parse）不能保序提取表格 | 使用专门的 PDF 表格提取工具（如 Camelot、Tabula）；或将 PDF 转为图片后用 LLM 提取 |
| ❌ 多模态检索结果不相关 | 不同模态的 Embedding 未对齐到同一语义空间 | 确保文本和图片使用同一模型编码（如 CLIP）；或使用同一个 LLM 统一描述后再编码 |

## 📝 本章小结

- ✅ **多模态 RAG 必要性** — 现实知识以文本、图片、表格、PDF 混合形式存在
- ✅ **CLIP 原理** — 对比学习双塔架构（Radford et al. 2021），文本+图片联合编码
- ✅ **PDF 处理** — 文本提取 + 表格识别 + 图片分析的三层处理策略
- ✅ **图文联合检索** — 显式描述路径 vs CLIP 联合嵌入路径
- ✅ **混合模态融合** — 文本检索和图片检索的 RRF 融合排序
- ✅ **Fallback 策略** — 图片质量低时自动降级为纯文本检索

## ➡️ 下一章预告

> [第6章：RAG 评估](./06-rag-evaluation.md) — 学习如何用 RAGAS 等框架系统评估 RAG 系统的质量。
