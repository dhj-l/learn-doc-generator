# 第2章：LCEL 链式调用 — LangChain 的核心范式

> 预计学习时间：80-100 分钟

## 💡 LCEL（LangChain Expression Language）

### 管道操作符 `|`

```typescript
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

const model = new ChatAnthropic({ modelName: 'claude-sonnet-4-5-20241022' });
const prompt = ChatPromptTemplate.fromTemplate('用一句话解释：{concept}');
const parser = new StringOutputParser();

// LCEL 链式调用
const chain = prompt.pipe(model).pipe(parser);

// 执行
const result = await chain.invoke({ concept: '微服务' });
console.log(result); // "微服务是一种将应用拆分为小型独立服务的架构模式。"
```

### 并行执行

```typescript
import { RunnableParallel } from '@langchain/core/runnables';

// 并行执行多个链
const analysisChain = RunnableParallel.from({
  summary: prompt.pipe(model).pipe(parser),
  keywords: keywordPrompt.pipe(model).pipe(parser),
  difficulty: difficultyPrompt.pipe(model).pipe(parser),
});

const result = await analysisChain.invoke({ text: '...' });
// { summary: '...', keywords: '...', difficulty: '...' }
```

### 条件分支

```typescript
import { RunnableBranch } from '@langchain/core/runnables';

const branch = RunnableBranch.from([
  [isCodeQuestion, codeChain],
  [isMathQuestion, mathChain],
  generalChain,  // 默认分支
]);
```

### 流式处理

```typescript
const stream = await chain.stream({ concept: '量子计算' });
for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

---

## 📝 本章小结

- ✅ **管道操作符 `|`** — 将组件串联
- ✅ **RunnableParallel** — 并行执行
- ✅ **RunnableBranch** — 条件分支
- ✅ **流式处理** — `.stream()` 方法
