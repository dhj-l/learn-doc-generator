# 第6章：综合实战 Capstone — 构建全栈 AI 编程助手

> 预计学习时间：120–150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **构建完整的 Next.js + Vercel AI SDK 全栈应用**
- **集成多模型切换、工具调用、流式输出三大核心能力**
- **实现对话历史管理和错误处理**
- **理解从零到一搭建生产级 AI 应用的全流程**

---

## 📋 项目概览

我们将构建一个名为 **CodeMate** 的 AI 编程助手，具备以下功能：

```
功能清单：
✅ 多轮对话（useChat + streamText）
✅ 多模型切换（Claude / GPT / Gemini）
✅ 工具调用（代码分析、搜索、执行等）
✅ 流式输出（打字机效果）
✅ 对话历史管理（本地存储 + 加载）
✅ 错误处理和重试
✅ 现代化 UI（Tailwind CSS）
```

### 技术栈

| 层次 | 技术 | 用途 |
|------|------|------|
| 框架 | Next.js 14 (App Router) | 全栈框架 |
| AI | Vercel AI SDK | LLM 统一调用 |
| 样式 | Tailwind CSS | UI 样式 |
| 存储 | localStorage | 对话历史 |
| 语言 | TypeScript | 类型安全 |

---

## 🔨 第一步：项目初始化

```bash
# 创建 Next.js 项目
npx create-next-app@latest codemate --typescript --tailwind --eslint
cd codemate

# 安装 AI SDK 依赖
npm install ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google zod

# 启动开发服务器
npm run dev
```

### 环境变量配置

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxx
GOOGLE_API_KEY=xxxxxxxxxxxx
```

---

## 🔨 第二步：后端 API Route

```typescript
// app/api/chat/route.ts
import { streamText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// ============================================
// 1. 模型注册表
// ============================================
const models = {
  'claude-sonnet': anthropic('claude-sonnet-4-5-20241022'),
  'claude-haiku': anthropic('claude-haiku-4-5-20251001'),
  'gpt-4o': openai('gpt-4o'),
  'gpt-4o-mini': openai('gpt-4o-mini'),
} as const;

type ModelId = keyof typeof models;

// ============================================
// 2. 工具定义
// ============================================
const analyzeCode = tool({
  description: '分析 TypeScript/JavaScript 代码，返回代码质量评分和改进建议',
  parameters: z.object({
    code: z.string().describe('要分析的代码内容'),
    language: z.enum(['typescript', 'javascript', 'python', 'unknown'])
      .optional().describe('代码语言'),
  }),
  execute: async ({ code, language = 'unknown' }) => {
    const lines = code.split('\n');
    const issues: string[] = [];

    // 基础代码分析
    if (lines.some(l => l.includes('console.log'))) {
      issues.push('包含 console.log，建议生产环境移除');
    }
    if (lines.some(l => l.includes('any'))) {
      issues.push('使用了 any 类型，建议使用更具体的类型');
    }
    if (lines.some(l => l.includes('TODO'))) {
      issues.push('包含 TODO 注释，需要跟进处理');
    }
    if (lines.length > 100) {
      issues.push('代码超过 100 行，考虑拆分为更小的函数');
    }

    return {
      lineCount: lines.length,
      characterCount: code.length,
      issues,
      score: Math.max(1, 10 - issues.length * 2),
      suggestions: issues.length > 0
        ? '建议修复以上问题以提升代码质量'
        : '代码质量良好，继续保持！',
    };
  },
});

const explainConcept = tool({
  description: '用简单语言解释编程概念，适合教学场景',
  parameters: z.object({
    concept: z.string().describe('要解释的概念名称'),
    level: z.enum(['beginner', 'intermediate', 'advanced'])
      .optional().describe('解释的深度级别'),
  }),
  execute: async ({ concept, level = 'intermediate' }) => {
    // 这里会由 LLM 自己生成解释内容
    // 工具的主要作用是触发模型使用结构化的解释方式
    return { concept, level, triggered: true };
  },
});

// ============================================
// 3. API 路由处理
// ============================================
export async function POST(req: Request) {
  try {
    const { messages, modelId = 'claude-sonnet' } = await req.json();

    // 验证模型 ID
    const model = models[modelId as ModelId];
    if (!model) {
      return new Response(
        JSON.stringify({ error: `不支持的模型: ${modelId}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 创建流式响应
    const result = streamText({
      model,
      system: `你是一个专业的编程助手 CodeMate。
你擅长回答编程问题、分析代码、解释技术概念。

使用工具时注意：
1. 当用户粘贴代码时，调用 analyzeCode 进行分析
2. 当用户询问概念时，调用 explainConcept 来组织回答
3. 回答要简洁、准确、有代码示例`,
      messages,
      tools: {
        analyzeCode,
        explainConcept,
      },
      maxSteps: 5,
    });

    // 返回 Data Stream
    return result.toDataStreamResponse();

  } catch (error) {
    console.error('API Error:', error);

    // 友好的错误响应
    return new Response(
      JSON.stringify({
        error: '服务暂时不可用',
        detail: error instanceof Error ? error.message : '未知错误',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
```

---

## 🔨 第三步：前端主界面

```tsx
// app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CodeMate - AI 编程助手',
  description: '基于 Vercel AI SDK 的全栈 AI 编程助手',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

```tsx
// app/page.tsx
'use client';
import { ChatWindow } from '@/components/ChatWindow';
import { Sidebar } from '@/components/Sidebar';
import { useState } from 'react';

// 对话会话类型
interface Conversation {
  id: string;
  title: string;
  modelId: string;
  createdAt: number;
}

export default function Home() {
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState('claude-sonnet');
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('codemate-conversations');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const saveConversation = (id: string, title: string) => {
    const updated = [...conversations];
    const existing = updated.find(c => c.id === id);
    if (existing) {
      existing.title = title;
    } else {
      updated.unshift({
        id,
        title,
        modelId: currentModel,
        createdAt: Date.now(),
      });
    }
    setConversations(updated);
    localStorage.setItem('codemate-conversations', JSON.stringify(updated));
  };

  const deleteConversation = (id: string) => {
    const updated = conversations.filter(c => c.id !== id);
    setConversations(updated);
    localStorage.setItem('codemate-conversations', JSON.stringify(updated));
    if (currentConversation === id) {
      setCurrentConversation(null);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      <Sidebar
        conversations={conversations}
        currentId={currentConversation}
        onSelect={setCurrentConversation}
        onDelete={deleteConversation}
        onNew={() => setCurrentConversation(null)}
      />
      <main className="flex-1 flex flex-col">
        <ChatWindow
          key={currentConversation || 'new'}
          conversationId={currentConversation}
          modelId={currentModel}
          onModelChange={setCurrentModel}
          onTitleChange={(title) => {
            if (currentConversation) {
              saveConversation(currentConversation, title);
            }
          }}
          onConversationCreated={saveConversation}
        />
      </main>
    </div>
  );
}
```

---

## 🔨 第四步：Sidebar 组件

```tsx
// components/Sidebar.tsx
import { Conversation } from '@/app/page';

interface SidebarProps {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

export function Sidebar({
  conversations,
  currentId,
  onSelect,
  onDelete,
  onNew,
}: SidebarProps) {
  return (
    <aside className="w-72 bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* 标题 */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold flex items-center gap-2">
          🤖 CodeMate
        </h1>
        <p className="text-xs text-gray-400 mt-1">AI 编程助手</p>
      </div>

      {/* 新建对话按钮 */}
      <button
        onClick={onNew}
        className="mx-4 mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700
          rounded-lg text-sm font-medium transition-colors"
      >
        ✨ 新建对话
      </button>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {conversations.length === 0 ? (
          <p className="text-gray-500 text-sm text-center mt-8">
            暂无对话历史
          </p>
        ) : (
          conversations.map(conv => (
            <div
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                currentId === conv.id
                  ? 'bg-blue-600/20 border border-blue-500/30'
                  : 'hover:bg-gray-700/50 border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium truncate flex-1">
                  {conv.title || '新对话'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  className="text-gray-500 hover:text-red-400 ml-2 text-xs"
                >
                  ✕
                </button>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {new Date(conv.createdAt).toLocaleDateString('zh-CN')}
                {' · '}
                <span className="text-blue-400">{conv.modelId}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
```

---

## 🔨 第五步：ChatWindow 核心组件

```tsx
// components/ChatWindow.tsx
'use client';
import { useChat } from 'ai/react';
import { useEffect, useRef, useState } from 'react';
import { MessageBubble } from './MessageBubble';
import { ModelSelector } from './ModelSelector';
import { ToolCallCard } from './ToolCallCard';

interface ChatWindowProps {
  conversationId: string | null;
  modelId: string;
  onModelChange: (model: string) => void;
  onTitleChange: (title: string) => void;
  onConversationCreated: (id: string, title: string) => void;
}

export function ChatWindow({
  conversationId,
  modelId,
  onModelChange,
  onTitleChange,
  onConversationCreated,
}: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [toolCallStates, setToolCallStates] = useState<Map<string, any>>(new Map());

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    setMessages,
  } = useChat({
    api: '/api/chat',
    body: { modelId },
    onFinish: (message) => {
      // 自动保存对话
      if (!conversationId && messages.length <= 2) {
        const id = `conv_${Date.now()}`;
        const title = message.content.slice(0, 50) || '新对话';
        onConversationCreated(id, title);
      }
    },
    onError: (error) => {
      console.error('Chat error:', error);
      // 错误消息会通过 messages 数组中的系统消息体现
    },
  });

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 加载历史对话
  useEffect(() => {
    if (conversationId && !isInitialized) {
      const saved = localStorage.getItem(`codemate-msg-${conversationId}`);
      if (saved) {
        try {
          setMessages(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to load messages:', e);
        }
      }
      setIsInitialized(true);
    }
  }, [conversationId, isInitialized, setMessages]);

  // 保存消息到 localStorage
  useEffect(() => {
    if (conversationId && messages.length > 0) {
      localStorage.setItem(
        `codemate-msg-${conversationId}`,
        JSON.stringify(messages)
      );
    }
  }, [messages, conversationId]);

  // 提取工具调用状态
  useEffect(() => {
    const newStates = new Map<string, any>();
    for (const msg of messages) {
      if (msg.role === 'assistant' && 'toolCalls' in msg) {
        const calls = (msg as any).toolCalls || [];
        for (const call of calls) {
          newStates.set(call.toolCallId || call.id, {
            name: call.toolName,
            args: call.args,
            status: 'completed',
          });
        }
      }
      if (msg.role === 'tool') {
        const existing = newStates.get(msg.toolCallId || '');
        if (existing) {
          existing.result = msg.content;
        }
      }
    }
    setToolCallStates(newStates);
  }, [messages]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // 如果是新对话，自动生成 ID
    if (!conversationId) {
      const id = `conv_${Date.now()}`;
      onConversationCreated(id, input.slice(0, 50));
    }

    handleSubmit(e);
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* 顶部栏 */}
      <header className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">
            {messages.length > 0
              ? 'CodeMate 对话'
              : '开始新的对话'}
          </h2>
        </div>
        <ModelSelector value={modelId} onChange={onModelChange} />
      </header>

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-2xl font-bold text-gray-300 mb-2">
              欢迎使用 CodeMate
            </h2>
            <p className="text-gray-500 mb-8">
              我是一个 AI 编程助手，可以帮助你：
            </p>
            <div className="grid grid-cols-2 gap-4 max-w-lg">
              {[
                { icon: '💻', text: '分析代码质量' },
                { icon: '📚', text: '解释技术概念' },
                { icon: '🐛', text: '调试错误' },
                { icon: '🔧', text: '重构建议' },
              ].map((item, i) => (
                <div key={i}
                  className="p-4 bg-gray-800 rounded-lg border border-gray-700
                    hover:border-blue-500/50 transition-colors cursor-pointer"
                  onClick={() => {
                    handleInputChange({
                      target: { value: item.text }
                    } as any);
                  }}
                >
                  <div className="text-2xl mb-1">{item.icon}</div>
                  <div className="text-sm text-gray-300">{item.text}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id}>
              <MessageBubble message={msg} />
              {/* 工具调用卡片 */}
              {msg.role === 'assistant' && (msg as any).toolCalls?.length > 0 && (
                <div className="ml-12 mt-1 space-y-1">
                  {(msg as any).toolCalls.map((call: any, i: number) => (
                    <ToolCallCard key={i} call={call} />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="border-t border-gray-700 p-4">
        <form onSubmit={onSubmit} className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={handleInputChange}
              placeholder="输入你的编程问题..."
              className="w-full p-3 pr-12 bg-gray-800 border border-gray-600
                rounded-xl text-white placeholder-gray-500 resize-none
                focus:outline-none focus:border-blue-500 transition-colors"
              rows={3}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(e);
                }
              }}
            />
          </div>
          <div className="flex gap-2">
            {isLoading ? (
              <button
                type="button"
                onClick={stop}
                className="px-4 py-3 bg-red-600 hover:bg-red-700
                  rounded-xl text-white transition-colors"
              >
                ⏹ 停止
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-700
                  disabled:bg-gray-600 rounded-xl text-white transition-colors"
              >
                📤 发送
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
```

---

## 🔨 第六步：子组件

```tsx
// components/ModelSelector.tsx
interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const MODELS = [
  { id: 'claude-sonnet', label: 'Claude Sonnet', provider: 'Anthropic', icon: '🟣' },
  { id: 'claude-haiku', label: 'Claude Haiku', provider: 'Anthropic', icon: '🟣' },
  { id: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI', icon: '🟢' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI', icon: '🟢' },
];

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2
        text-sm text-white focus:outline-none focus:border-blue-500"
    >
      {MODELS.map(model => (
        <option key={model.id} value={model.id}>
          {model.icon} {model.label} ({model.provider})
        </option>
      ))}
    </select>
  );
}
```

```tsx
// components/MessageBubble.tsx
import { Message } from 'ai/react';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.role === 'system' &&
    message.content.toLowerCase().includes('error');

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* 头像 */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center
        justify-center text-sm ${isUser ? 'bg-blue-600' : 'bg-gray-600'}`}>
        {isUser ? '👤' : '🤖'}
      </div>

      {/* 消息内容 */}
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`p-3 rounded-2xl ${
          isError
            ? 'bg-red-900/50 border border-red-700 text-red-200'
            : isUser
              ? 'bg-blue-600/20 border border-blue-500/30'
              : 'bg-gray-800 border border-gray-700'
        }`}>
          {/* 角色标签 */}
          <div className="text-xs mb-1 opacity-60">
            {isUser ? '你' : 'CodeMate'}
          </div>

          {/* 消息文本 */}
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {message.content || (
              <span className="italic text-gray-400">（思考中...）</span>
            )}
          </div>
        </div>

        {/* 时间戳 */}
        <div className="text-xs text-gray-600 mt-1 px-1">
          {new Date(message.createdAt || Date.now()).toLocaleTimeString('zh-CN')}
        </div>
      </div>
    </div>
  );
}
```

```tsx
// components/ToolCallCard.tsx
interface ToolCallCardProps {
  call: {
    toolName: string;
    args: Record<string, unknown>;
    result?: unknown;
  };
}

const TOOL_ICONS: Record<string, string> = {
  analyzeCode: '📊',
  explainConcept: '📚',
};

export function ToolCallCard({ call }: ToolCallCardProps) {
  const icon = TOOL_ICONS[call.toolName] || '🔧';

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5
      bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-xs">
      <span>{icon}</span>
      <span className="text-yellow-300 font-medium">{call.toolName}</span>
      <span className="text-gray-400">
        {JSON.stringify(call.args).slice(0, 60)}
      </span>
      <span className="text-green-400">✅</span>
    </div>
  );
}
```

---

## 🔨 第七步：错误边界与全局错误处理

```tsx
// components/ErrorBoundary.tsx
'use client';
import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-8">
            <div className="text-6xl mb-4">💥</div>
            <h2 className="text-xl font-bold text-red-400 mb-2">
              出了点问题
            </h2>
            <p className="text-gray-400 mb-4">
              {this.state.error?.message || '未知错误'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700
                transition-colors"
            >
              🔄 重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

```tsx
// app/error.tsx
'use client';
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">500</h1>
            <p className="text-gray-400 mb-4">
              服务器内部错误，请稍后重试
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              重试
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
```

---

## 🔨 第八步：加载状态与骨架屏

```tsx
// components/LoadingSkeleton.tsx
export function LoadingSkeleton() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex gap-3">
          <div className="w-8 h-8 bg-gray-700 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className={`h-4 bg-gray-700 rounded w-3/4 ${
              i % 2 === 0 ? 'ml-auto' : ''
            }`} />
            <div className={`h-4 bg-gray-700 rounded w-1/2 ${
              i % 2 === 0 ? 'ml-auto' : ''
            }`} />
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## 🔨 第九步：样式定制

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* 自定义滚动条 */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: #1f2937;
}
::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #6b7280;
}

/* 打字动画 */
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.typing-cursor::after {
  content: '▌';
  animation: blink 1s step-end infinite;
  color: #60a5fa;
}

/* 消息淡入动画 */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.message-enter {
  animation: fadeIn 0.3s ease-out;
}
```

---

## 🔨 第十步：运行与测试

```bash
# 开发模式
npm run dev

# 生产构建
npm run build
npm start
```

### 功能测试清单

```
测试场景：
1. □ 发送消息后 AI 流式回复
2. □ 切换模型后使用新模型回复
3. □ 粘贴代码触发 analyzeCode 工具
4. □ 询问概念触发 explainConcept 工具
5. □ 停止按钮终止正在生成的回复
6. □ 对话历史保存和加载
7. □ 删除对话
8. □ 新建对话
9. □ 网络错误时显示友好提示
10. □ 超时自动停止
```

---

## 🎯 项目架构总结

```
codemate/
├── app/
│   ├── api/chat/route.ts    # AI API 路由（流式 + 工具）
│   ├── error.tsx             # 全局错误页面
│   ├── globals.css           # 全局样式
│   ├── layout.tsx            # 根布局
│   └── page.tsx              # 主页面（对话管理）
├── components/
│   ├── ChatWindow.tsx        # 聊天窗口核心
│   ├── ErrorBoundary.tsx     # 错误边界
│   ├── LoadingSkeleton.tsx   # 加载骨架屏
│   ├── MessageBubble.tsx     # 消息气泡
│   ├── ModelSelector.tsx     # 模型选择器
│   ├── Sidebar.tsx           # 侧边栏
│   └── ToolCallCard.tsx      # 工具调用卡片
├── .env.local                # 环境变量
└── package.json
```

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 前端 `useChat` 传入的 `body` 参数在编译时丢失 | Next.js 的序列化过程中某些字段被忽略 | 确保 `body` 中所有字段都是 JSON 可序列化的，避免传入函数或 Symbol 类型 |
| API Route 中的 `streamText` 未正确调用 `toDataStreamResponse()` | 直接返回 `streamText` 的结果而非流式响应 | 使用 `const result = await streamText(...)` 后返回 `result.toDataStreamResponse()` |
| 多模型切换时前端状态未重置导致历史消息混淆 | 切换模型后保留了旧的对话历史 | 在切换模型时调用 `useChat` 的 `reset()` 方法清空对话历史 |
| `localStorage` 存储的对话历史超出存储限额 | 未对历史消息做截断或压缩处理 | 限制保存的对话条数（如最近 50 条），超出时自动丢弃最早的消息 |

---

## 📝 本章小结

通过本 Capstone 项目，我们完整实践了：

- ✅ **后端 API Route** — `streamText` + `tool()` + `toDataStreamResponse()`
- ✅ **前端 useChat** — 流式消息、停止生成、错误处理
- ✅ **多模型切换** — 动态 `body` 参数实现模型选择
- ✅ **工具调用** — 代码分析 + 概念解释 + 前端展示
- ✅ **对话历史** — `localStorage` 持久化 + 加载/删除
- ✅ **错误处理** — ErrorBoundary + 全局错误页面 + 友好提示
- ✅ **UI 体验** — Tailwind CSS 暗色主题 + 骨架屏 + 动画

### 扩展方向

本项目是 AI 编程助手的基础框架，你可以继续扩展：

1. **数据库持久化** — 用 Prisma + SQLite 替代 localStorage
2. **用户认证** — 集成 NextAuth.js
3. **更多工具** — 添加代码执行沙箱、Git 操作等
4. **多模态** — 支持图片上传和分析
5. **Prompt 模板** — 预设常用提示词模板
6. **流式中间件** — 添加敏感词过滤和内容审核

---

> 🎉 恭喜你完成了 Vercel AI SDK 全部 6 章的学习！
>
> 现在你已经掌握了从**基础调用**到**全栈应用**的完整技能链：
> **第1章** Core API → **第2章** UI Hooks → **第3章** 多模型 → **第4章** 流式 → **第5章** 工具调用 → **第6章** 综合实战
>
> 下一阶段，你可以在 [Stage 4：高级 Agent 模式](../../stage-4/README.md) 中学习更复杂的多 Agent 协作系统。
