# 第3章 Provider 高级用法 —— 自定义、工厂、作用域

> 预计学习时间：40 分钟

## 🎯 本章目标

学习完本章，你将能够：

- 掌握三种自定义 Provider 方式：`useClass` / `useValue` / `useFactory`
- 理解 Provider 作用域（DEFAULT / REQUEST / TRANSIENT）的原理和选择
- 理解作用域的"冒泡"机制
- 掌握可选 Provider、异步 Provider 等高级技巧
- 在面试中解释 Provider 作用域及其实现原理

## 📋 前置知识

> 你已经会写 `@Injectable()` 的基本 Provider，本章重点是其背后的高级用法。
>
> 建议先完成 [第1章 IoC 容器与依赖注入](./01-ioc-and-di.md) 的学习。

## 💡 核心概念

### 概念一：Provider 的四种定义方式

#### 类比引入

想象你是一个项目负责人，需要找一个前端开发人员：

- **useClass**：你招了一个前端工程师（类），每个项目组都分配同一个人
- **useValue**：你直接从隔壁团队借了一个现成的组件（已有实例），不需要自己招
- **useFactory**：你发布了一个招聘要求（工厂函数），HR 根据你的要求匹配合适的人
- **useExisting**：你的项目有两个名字相同但职能不同的岗位，它们实际上是同一个人

#### 1. useClass —— 类 Provider（默认方式）

这是你在 CRUD 中每天都在用的方式：

```typescript
// 简写形式（你平常用的）
@Module({
  providers: [UsersService],
})
// 等价于完整形式
@Module({
  providers: [
    {
      provide: UsersService,
      useClass: UsersService,
    },
  ],
})
```

**`useClass` 的真正用途**是**实现多态替换**：

```typescript
// 定义接口和多个实现
abstract class StorageService {
  abstract upload(file: File): Promise<string>;
}

class S3StorageService extends StorageService {
  async upload(file: File): Promise<string> {
    // AWS S3 实现
  }
}

class LocalStorageService extends StorageService {
  async upload(file: File): Promise<string> {
    // 本地文件系统实现
  }
}

// 根据环境动态选择
@Module({
  providers: [
    {
      provide: StorageService,
      useClass: process.env.NODE_ENV === 'production'
        ? S3StorageService
        : LocalStorageService,
    },
  ],
})
export class StorageModule {}
```

**原理**：IoC 容器在运行时调用 `new S3StorageService(...)`，并自动解析其构造函数依赖。

#### 2. useValue —— 值 Provider

当你需要注入一个已经存在的值（不是类实例）时使用：

```typescript
// 注入一个常量
@Module({
  providers: [
    {
      provide: 'APP_CONFIG',
      useValue: {
        port: 3000,
        apiPrefix: '/api/v1',
        corsEnabled: true,
      },
    },
  ],
})
export class AppModule {}
```

**常见使用场景**：

```typescript
// 场景1：测试 Mock
@Module({
  providers: [
    {
      provide: UsersService,
      useValue: {
        findAll: () => [{ id: 1, name: 'Test User' }],
        findOne: (id: number) => ({ id, name: 'Test User' }),
      },
    },
  ],
})
export class TestModule {}

// 场景2：注入第三方库的实例
const redisClient = new Redis({ host: 'localhost', port: 6379 });

@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useValue: redisClient,
    },
  ],
})
export class RedisModule {}
```

**原理**：`useValue` 是最简单的 Provider 方式。NestJS 直接把值存入容器的 Map 中，不做任何转换或实例化。

#### 3. useFactory —— 工厂 Provider

当你需要**运行时动态创建**实例时使用：

```typescript
@Module({
  providers: [
    {
      provide: DatabaseConnection,
      useFactory: (config: ConfigService) => {
        // 工厂函数可以包含任何逻辑
        const connection = new DatabaseConnection({
          host: config.get('DB_HOST'),
          port: config.get('DB_PORT'),
          retryAttempts: 3,
          poolSize: 10,
        });
        
        // 可以做一些异步初始化
        // return connection.connect(); // 如果 connect 是同步的
        
        return connection;
      },
      inject: [ConfigService],  // 工厂函数的依赖
    },
  ],
})
export class DatabaseModule {}
```

**`useFactory` + 可选依赖**：

```typescript
{
  provide: 'CONNECTION',
  useFactory: (
    optionsProvider: MyOptionsProvider,
    optionalProvider?: string,  // 可选依赖
  ) => {
    const options = optionsProvider.get();
    return new DatabaseConnection(options);
  },
  inject: [
    MyOptionsProvider,
    { token: 'SOME_OPTIONAL_PROVIDER', optional: true },
  ],
}
```

**原理**：NestJS 调用工厂函数，传入 `inject` 中指定的依赖作为参数，将返回值注册到容器中。

#### 4. useExisting —— 别名 Provider

```typescript
@Module({
  providers: [
    UsersService,
    {
      provide: 'USER_SERVICE_ALIAS',
      useExisting: UsersService,  // 指向同一个实例
    },
  ],
})
export class UsersModule {}
```

`useExisting` 不会创建新实例，而是创建一个**别名**指向已有实例。

---

### 概念二：Provider 作用域（Scope）

#### 类比引入

想象一家公司里的员工：

- **DEFAULT（Singleton）**：CEO —— 公司只有一个人，所有人都找他
- **REQUEST**：前台接待员 —— 每个访客来的时候，都分配一个专门的前台接待
- **TRANSIENT**：临时工 —— 每次需要搬东西，都找一个不同的临时工

#### 1. Singleton（默认作用域）

```typescript
@Injectable()
export class UsersService {
  // 默认作用域 = Singleton
  // 整个应用共享一个实例
}
```

**特点**：
- 整个应用只有**一个**实例
- 所有消费者共享该实例
- 适合无状态服务、工具类、配置服务

**内部实现**：

```typescript
// 容器对 Singleton 的处理
class IocContainer {
  private singletonCache = new Map<Token, any>();
  
  get<T>(token: Token): T {
    // 1. 检查缓存
    if (this.singletonCache.has(token)) {
      return this.singletonCache.get(token);
    }
    
    // 2. 创建实例并缓存
    const instance = this.createInstance(token);
    this.singletonCache.set(token, instance);
    
    return instance;
  }
}
```

#### 2. Request 作用域

```typescript
@Injectable({ scope: Scope.REQUEST })
export class RequestContextService {
  // 每个请求创建一个新实例
  // 可以在实例中存储请求级别的数据
  private requestId: string;
  
  setRequestId(id: string) {
    this.requestId = id;
  }
  
  getRequestId(): string {
    return this.requestId;
  }
}
```

**特点**：
- 每个 HTTP 请求创建一个**新**实例
- 请求处理完后，实例被垃圾回收
- 适合请求级别的上下文数据（如请求 ID、用户信息）

**内部实现**：

```typescript
// NestJS 使用 AsyncLocalStorage 来管理请求作用域
// 这是 Node.js 的异步上下文追踪机制

import { AsyncLocalStorage } from 'async_hooks';

class RequestScopeManager {
  private storage = new AsyncLocalStorage<Map<Token, any>>();
  
  run(handler: () => void) {
    // 为每个请求创建一个独立的作用域
    this.storage.run(new Map(), handler);
  }
  
  getInstance<T>(token: Token): T {
    const scope = this.storage.getStore();
    if (!scope) {
      throw new Error('Outside of request scope');
    }
    
    if (!scope.has(token)) {
      scope.set(token, this.createInstance(token));
    }
    
    return scope.get(token);
  }
}
```

#### 3. Transient 作用域

```typescript
@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService {
  // 每次注入都创建一个新实例
  private context: string;
  
  setContext(ctx: string) {
    this.context = ctx;
  }
}
```

**特点**：
- 每次被注入时都创建**新**实例
- 不同消费者获得不同实例
- 适合需要隔离状态的工具类

#### 作用域对比

| 作用域 | 同一请求内多次注入 | 不同请求 | 不同模块 |
|--------|-------------------|---------|---------|
| DEFAULT | 同实例 | 同实例 | 同实例 |
| REQUEST | 同实例 ✅ | 不同实例 ✅ | 同实例 |
| TRANSIENT | 每次新实例 ✅ | 每次新实例 ✅ | 每次新实例 ✅ |

#### 🔬 核心机制：作用域冒泡（Scope Hierarchy）

这是 NestJS 面试的高频考点：

```typescript
@Injectable({ scope: Scope.REQUEST })
export class RequestScopedService {
  constructor(private logger: LoggerService) {}
}

@Injectable() // 默认 Singleton
export class UsersService {
  // ⚠️ 这里注入了一个 REQUEST 作用域的依赖
  constructor(private scoped: RequestScopedService) {}
}
```

**关键规则**：

```
REQUEST 作用域会"冒泡"：
1. 如果 Singleton 服务 A 注入了一个 REQUEST 作用域的服务 B
2. 服务 A 也会变成 REQUEST 作用域（为了能持有 B 的实例）
3. 这被称为"作用域污染"

但是 TRANSIENT 不会"冒泡"：
1. Singleton 服务 A 注入 TRANSIENT 作用域的服务 B
2. A 仍然是 Singleton
3. 每次 A 使用 B 时，容器注入 B 的当前实例
```

---

### 概念三：异步 Provider

`useFactory` 支持 `async`，让你能异步初始化资源：

```typescript
@Module({
  providers: [
    {
      provide: 'ASYNC_CONNECTION',
      useFactory: async (config: ConfigService) => {
        // 注意：工厂函数是 async
        const connection = new DatabaseConnection(config.get('DB_URL'));
        await connection.connect(); // 等待连接建立
        return connection;
      },
      inject: [ConfigService],
    },
  ],
})
export class DatabaseModule {}
```

**原理**：NestJS 会 `await` 工厂函数的返回值，确保在 provider 可用之前异步操作已完成。

---

### 概念四：自定义 Provider 的最佳实践

#### 使用 InjectionToken

```typescript
// 不推荐：字符串 Token 容易冲突
const DATABASE = 'DATABASE';

// 推荐：InjectionToken 提供类型安全
export const DATABASE_CONNECTION = new InjectionToken<DatabaseConnection>(
  'DATABASE_CONNECTION',  // 描述信息，用于调试
);

// 使用时
@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE_CONNECTION) private db: DatabaseConnection,
  ) {}
}
```

#### 按环境配置

```typescript
@Module({
  providers: [
    {
      provide: StorageService,
      useClass: process.env.STORAGE_TYPE === 's3'
        ? S3StorageService
        : LocalStorageService,
    },
  ],
})
export class StorageModule {}
```

---

## 🔨 实战演练

### 练习一：使用 useFactory 实现数据库连接池

**场景描述：**
在生产环境中，你需要一个可配置的数据库连接池。

<details>
<summary>🧑‍💻 先自己实现，再展开看参考</summary>

```typescript
// database.module.ts
import { Module, DynamicModule } from '@nestjs/common';

export interface DatabaseModuleOptions {
  host: string;
  port: number;
  poolSize?: number;
  database: string;
}

@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseModuleOptions): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [
        {
          provide: 'DATABASE_OPTIONS',
          useValue: options,
        },
        {
          provide: 'DATABASE_POOL',
          useFactory: async (opts: DatabaseModuleOptions) => {
            console.log(`[Database] 创建连接池: ${opts.host}:${opts.port}`);
            const pool = {
              host: opts.host,
              port: opts.port,
              poolSize: opts.poolSize ?? 10,
              database: opts.database,
              query: async (sql: string) => {
                console.log(`[Database] 执行查询: ${sql.substring(0, 50)}...`);
                return { rows: [] };
              },
              close: async () => {
                console.log('[Database] 关闭连接池');
              },
            };
            return pool;
          },
          inject: ['DATABASE_OPTIONS'],
        },
      ],
      exports: ['DATABASE_POOL'],
    };
  }
}
```

</details>

### 练习二：验证作用域行为

打开你的项目，创建一个 Request 作用域的服务，验证它的行为：

```typescript
@Injectable({ scope: Scope.REQUEST })
export class RequestIdService {
  public requestId: string;
  
  constructor(@Inject(REQUEST) private request: Request) {
    // 每个请求进来时，生成唯一的请求 ID
    this.requestId = crypto.randomUUID();
    console.log(`[RequestIdService] 新实例: ${this.requestId}`);
  }
}

@Controller('test')
export class TestController {
  constructor(private reqIdService: RequestIdService) {}
  
  @Get()
  test() {
    return {
      message: '同一个请求中多次调用？',
      requestId: this.reqIdService.requestId,
    };
  }
}
```

启动两个浏览器窗口同时访问，观察是否产生不同的 requestId。

---

## ⚡ 进阶技巧

### 技巧一：Provider 的链式注入

```typescript
{
  provide: 'A',
  useFactory: (b: any) => `A depends on ${b}`,
  inject: ['B'],
},
{
  provide: 'B',
  useFactory: (c: any) => `B depends on ${c}`,
  inject: ['C'],
},
{
  provide: 'C',
  useValue: 'C is a value',
},
// 解析顺序：C → B → A
```

### 技巧二：Provider 的条件注册

```typescript
@Module({
  providers: [
    UsersService,
    // 只在开发环境注册调试服务
    ...(process.env.NODE_ENV === 'development'
      ? [{ provide: DebugService, useClass: DebugService }]
      : []),
  ],
})
export class AppModule {}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1: useClass、useValue、useFactory 三者的区别？**
> A: useClass 使用类定义创建实例（自动 DI）；useValue 直接注入已存在的值；useFactory 通过工厂函数动态创建实例（可包含复杂逻辑和异步操作）。

**Q2: REQUEST 作用域的实现原理是什么？**
> A: NestJS 使用 Node.js 的 `AsyncLocalStorage` 为每个请求创建独立的 DI 作用域。请求开始时创建新作用域，请求结束时销毁。同一个请求内多次注入获取同一实例，不同请求间实例隔离。

**Q3: 什么是作用域冒泡？**
> A: 当一个 Singleton 服务注入了一个 REQUEST 作用域的依赖时，Singleton 服务会被提升为 REQUEST 作用域。TRANSIENT 作用域不会冒泡。

**Q4: 什么场景下应该使用 TRANSIENT 作用域？**
> A: 当每个消费者需要独立的实例时。例如：日志记录器（每个服务有自己的 context）、状态隔离的工具类。

**Q5: 异步 Provider 的工作原理？**
> A: useFactory 返回 Promise 时，NestJS 的 IoC 容器会 await 这个 Promise，确保异步操作完成后再将结果注册到容器中。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Circular dependency in useFactory` | 工厂函数的 inject 中存在循环依赖 | 使用 `forwardRef()` |
| `A provider with the same token already exists` | 重复注册了同一个 provider token | 检查是否有不同模块提供相同 token |
| `Request-scoped provider when current context is not HTTP` | 在非 HTTP 上下文中使用了 REQUEST | 使用 `@Inject(REQUEST)` 前检查上下文 |
| `useFactory must return a value or a promise` | 工厂函数返回了 undefined | 确保工厂函数有明确的 return |

---

## 📝 本章小结

- ✅ Provider 有四种定义方式：useClass（默认）、useValue（值）、useFactory（工厂）、useExisting（别名）
- ✅ 三种作用域：DEFAULT(Singleton)、REQUEST（按请求）、TRANSIENT（按注入）
- ✅ REQUEST 作用域基于 `AsyncLocalStorage` 实现
- ✅ 作用域冒泡：REQUEST 依赖会提升消费者作用域，TRANSIENT 不会
- ✅ `InjectionToken` 提供类型安全的 provider token

## ➡️ 下一章预告

> 在下一章中，我们将探究 NestJS 的**应用生命周期** —— 从 `NestFactory.create()` 启动到优雅关闭的完整过程，以及各种生命周期钩子的执行时机和使用场景。
>
> [下一章：应用生命周期与启动过程](./04-lifecycle-and-bootstrap.md)
