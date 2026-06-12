# 第2-6章概要

## 第2章：浏览器端 AI

```typescript
// 使用 Transformers.js 在浏览器中运行模型
import { pipeline } from '@xenova/transformers';

const classifier = await pipeline('sentiment-analysis');
const result = await classifier('I love this product!');
// { label: 'POSITIVE', score: 0.999 }
```

## 第3章：AI 组件设计

- 智能搜索组件（语义搜索）
- AI 表单（自动填充、智能验证）
- 推荐组件（个性化推荐）

## 第4章：状态管理

```typescript
// AI 状态与 UI 状态同步
const useAIState = () => {
  const [isThinking, setIsThinking] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [toolCalls, setToolCalls] = useState([]);
};
```

## 第5章：边缘 AI

在 Edge Runtime（Cloudflare Workers、Vercel Edge Functions）上运行 AI 推理。

## 第6章：前端安全

- API Key 不要暴露在前端
- 使用后端代理转发 AI 请求
- 输入净化防止 XSS

---

## 📎 附录

[速查表](../appendix/cheatsheet.md) | [排错指南](../appendix/troubleshooting.md)
