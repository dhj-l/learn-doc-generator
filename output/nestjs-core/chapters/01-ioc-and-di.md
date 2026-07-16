# 第1章 IoC 容器与依赖注入原理

> 预计学习时间：45 分钟

## 🎯 本章目标

学习完本章，你将能够：

- 理解 IoC（控制反转）和 DI（依赖注入）的底层机制
- 看穿 NestJS 的 `@Injectable()` 装饰器到底做了什么
- 掌握 NestJS IoC 容器的工作原理：从模块注册到实例化
- 理解循环依赖的产生原因和 `forwardRef` 的解决原理
- 了解自定义 Provider Token 的高级用法

## 📋 前置知识

> 你已经会写 NestJS 的 Service 和 Controller，知道使用 `@Injectable()` 和构造函数注入 —— 本章将从"能用的层面"深入到底层原理。

## 💡 核心概念

### 概念一：什么是 IoC（控制反转）？

#### 类比引入

想象你去餐厅吃饭：

- **传统方式（非 IoC）**：你走进厨房，自己拿菜、洗菜、切菜、炒菜、装盘 —— 你**控制**了整个流程
- **IoC 方式**：你坐在餐桌前点菜，厨师去完成所有工作，服务员把菜端给你 —— 你把**控制权反转**给了餐厅

在软件开发中，IoC 就是将"对象创建和依赖管理的控制权"从你的业务代码中转移给一个**容器**。

#### 概念讲解

**IoC（Inversion of Control，控制反转）** 是一种设计原则，核心思想是：

> **"别打给我，我会打给你"（Don't call us, we'll call you）**

在传统编程中，你的代码主动创建依赖对象：

```typescript
// 传统方式：服务自己创建依赖
class UsersService {
  private db: Database;
  
  constructor() {
    // UsersService 主动创建了 Database 实例
    this.db = new Database('mysql://localhost:3306');
  }
}
```

这种方式的问题：
1. **紧耦合**：`UsersService` 直接依赖于 `Database` 的具体实现
2. **难测试**：无法在单元测试中替换为 Mock 数据库
3. **难复用**：切换数据库需要修改 `UsersService` 的代码

在 IoC 模式下，对象不自己创建依赖，而是由容器注入：

```typescript
// IoC 方式：让容器注入依赖
class UsersService {
  constructor(private db: Database) {
    // UsersService 只声明"我需要一个 Database"
    // 由 IoC 容器来提供它
  }
}
```

#### IoC 容器是什么

NestJS 的 IoC 容器本质上是一个 **Map（键值对存储）**，它维护着：

```
IoC 容器内部 ≈ Map<Token, Instance>
```

| Token（标识符） | Instance（实例） |
|----------------|-----------------|
| `UsersService` | `UsersService { ... }` |
| `Database` | `Database { connection: ... }` |
| `'CONNECTION'` | `ConnectionPool { ... }` |

当你请求一个依赖时，容器查找这个 Map：

1. 根据 Token 找到对应的类定义
2. 解析该类的构造函数参数（递归处理所有依赖）
3. 实例化并缓存（对于 Singleton 作用域）
4. 返回实例

---

### 概念二：`@Injectable()` 到底做了什么？

#### 类比引入

`@Injectable()` 就像给一个物品贴上"可配送"的标签。超市仓库（IoC 容器）只配送贴了标签的商品。

#### 概念讲解

很多初学者的误解：**`@Injectable()` 告诉 NestJS"这个类可以被注入到其他类"**。

**这是错误的！**

正确的理解是：

> **`@Injectable()` 告诉 NestJS"这个类可以被 IoC 容器管理"**

这意味着两件事：
1. NestJS 会把它注册到 IoC 容器中，使其可以被**注入到其他类**
2. 当其他类需要注入它时，NestJS 知道如何**创建和管理它的实例**

来看源码级别发生了什么：

```typescript
// 你写的代码
@Injectable()
export class UsersService {
  findAll() { return []; }
}
```

NestJS 在编译/运行时，实际上做了这些事情：

```typescript
// NestJS 内部的处理 ≈ 以下逻辑

// 1. Reflect.defineMetadata 记录类的依赖信息
// @Injectable() 装饰器会在 UsersService 上标记元数据
Reflect.defineMetadata('injectable', true, UsersService);

// 2. 当容器初始化时，读取构造函数参数的类型信息
// 通过 TypeScript 编译时生成的元数据（emitDecoratorMetadata）
// 编译器会生成类似这样的元数据：
Reflect.defineMetadata('design:paramtypes', [Database, Logger], UsersService);

// 3. 容器根据这些信息自动注入
```

**关键点：** `@Injectable()` 本质上是给类打一个**元数据标记**，让 IoC 容器能够：
- 识别该类是可管理的
- 读取其构造函数的参数类型
- 自动解析依赖树

#### 为什么有些类不需要 `@Injectable()`？

```typescript
// Controller 不需要 @Injectable()
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}
}

// 实际上，@Controller() 内部已经包含了 @Injectable()
// 源码类似于：
export function Controller(path: string) {
  return (target: object) => {
    Injectable()(target);  // 内部调用了 Injectable
    Reflect.defineMetadata('path', path, target);
  };
}
```

同理，`@Module()`、`@Gateway()` 等装饰器内部都包含了 `@Injectable()` 的逻辑。

---

### 概念三：依赖注入的完整流程

#### 组件注册阶段

```typescript
@Module({
  controllers: [UsersController],
  providers: [UsersService, Database],
})
export class AppModule {}
```

当 NestJS 解析这个模块时，IoC 容器内部大致经历以下步骤：

```
1. 扫描 @Module 装饰器的 metadata
   ↓
2. 收集 providers 数组中的每个类
   ↓
3. 对于每个 provider：
   a. 读取其构造函数参数（通过 reflect-metadata 的 design:paramtypes）
   b. 检查参数类型是否已在容器中注册
   c. 如果未注册，递归解析其依赖
   ↓
4. 构建完整的依赖图（Dependency Graph）
   ↓
5. 如果有循环依赖，检测并抛出错误（除非使用了 forwardRef）
```

#### 实例化阶段

当容器需要创建一个实例时，内部流程如下：

```typescript
// 伪代码：IoC 容器内部的核心逻辑
class IoCContainer {
  private instances = new Map<Token, any>();
  private providers = new Map<Token, ProviderDefinition>();

  // 注册 provider
  register(token: Token, definition: ProviderDefinition) {
    this.providers.set(token, definition);
  }

  // 获取实例（核心方法）
  get<T>(token: Token): T {
    // 1. 如果已有缓存实例，直接返回
    if (this.instances.has(token)) {
      return this.instances.get(token);
    }

    // 2. 获取 provider 定义
    const provider = this.providers.get(token);
    
    // 3. 获取构造函数的参数类型
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes', 
      provider.useClass
    );
    
    // 4. 递归解析每个依赖
    const dependencies = paramTypes.map(paramType => 
      this.get(paramType)  // 递归调用
    );
    
    // 5. 实例化（传入解析好的依赖）
    const instance = new provider.useClass(...dependencies);
    
    // 6. 缓存实例（如果是 Singleton）
    this.instances.set(token, instance);
    
    return instance;
  }
}
```

#### 实际调试验证

你可以通过以下代码看到 NestJS 在做什么：

```typescript
// 在任意 Service 的构造函数中添加
@Injectable()
export class UsersService {
  constructor(
    private db: Database,
    private logger: Logger,
  ) {
    // 在 NestJS 实例化时，观察 constructor 被调用的时机
    console.log(`[UsersService] 正在实例化...`);
    console.log(`[UsersService] db 已注入:`, db !== undefined);
    console.log(`[UsersService] logger 已注入:`, logger !== undefined);
  }
}
```

启动应用后，你会看到输出顺序反映了依赖图的解析顺序：

```
[Database] 正在实例化...       ← Database 最先被创建（无依赖）
[Logger] 正在实例化...          ← Logger 被创建
[UsersService] 正在实例化...    ← UsersService 最后被创建（依赖前两者）
[UsersController] 正在实例化... ← Controller 最后被创建
```

---

### 概念四：依赖注入的几种方式

NestJS 支持三种注入方式（按推荐程度排序）：

#### 1. 构造函数注入 ✅（推荐）

```typescript
@Injectable()
export class UsersService {
  constructor(
    private readonly database: Database,   // 自动注入
    @Inject('CONFIG') private config: any, // 显式指定 Token
    private readonly logger: Logger,       // 自动注入
  ) {}
}
```

**原理**：NestJS 通过 `design:paramtypes` 元数据读取构造函数参数的类型信息，自动匹配容器中注册的 provider。

#### 2. 属性注入（通过 `@Inject`）

```typescript
@Injectable()
export class UsersService {
  @Inject(Database)        // 在属性上直接注入
  private readonly database!: Database;
  
  @Inject('CONFIG')
  private readonly config!: any;
}
```

**原理**：`@Inject()` 装饰器在属性上定义时，会在原型上记录需要注入的 Token，容器在创建实例后通过 `Object.defineProperty` 或直接赋值来完成注入。

#### 3. Setter 注入（较少使用）

```typescript
@Injectable()
export class UsersService {
  private database!: Database;
  
  @Inject()
  setDatabase(database: Database) {
    this.database = database;
  }
}
```

---

### 概念五：Provider Token 与 `@Inject` 装饰器

#### 为什么需要 `@Inject`？

当你的依赖**不是通过类名**来标识时，需要 `@Inject` 来**显式指定 Token**：

```typescript
@Injectable()
export class UsersService {
  // ✅ 可以自动注入：NestJS 通过 design:paramtypes 知道是 Database 类
  constructor(private db: Database) {}
  
  // ❌ 无法自动注入：'CONFIG' 是一个字符串，不是类
  // constructor(private config: any) {} // 编译后 paramtypes 是 [Object]
  
  // ✅ 必须使用 @Inject 显式指定 Token
  constructor(
    @Inject('CONFIG') private config: any,
    @Inject('DATABASE_CONNECTION') private connection: any,
  ) {}
}
```

#### Token 类型

Token 可以是任何类型，但常见的有：

```typescript
// 1. 类名（最常用）
providers: [UsersService]

// 2. 字符串
providers: [{ provide: 'CONFIG', useValue: { port: 3000 } }]

// 3. Symbol
export const CONNECTION = Symbol('CONNECTION');
providers: [{ provide: CONNECTION, useValue: connection }]

// 4. 抽象类（用于接口编程）
providers: [{ provide: DatabaseInterface, useClass: MySQLDatabase }]
```

---

### 概念六：循环依赖与 `forwardRef`

#### 循环依赖是怎么产生的

```typescript
// users.service.ts
@Injectable()
export class UsersService {
  constructor(private commonService: CommonService) {}
}

// common.service.ts
@Injectable()
export class CommonService {
  constructor(private usersService: UsersService) {}
}
```

当容器尝试创建 `UsersService` 时：
```
UsersService 需要 CommonService
  → 去创建 CommonService
    → CommonService 需要 UsersService
      → 去创建 UsersService（死循环！）
        → 又需要 CommonService...
```

#### `forwardRef` 的原理

```typescript
// users.service.ts
@Injectable()
export class UsersService {
  constructor(
    @Inject(forwardRef(() => CommonService))
    private commonService: CommonService,
  ) {}
}
```

`forwardRef` 的原理是**延迟解析**：

```
1. 容器解析 UsersService 时，发现注入的是 forwardRef(() => CommonService)
2. forwardRef 返回一个"占位符"：先记下"这里需要 CommonService，但是晚点再找"
3. 容器继续初始化 UsersService（但此时 commonService 还是 undefined）
4. 容器回头创建 CommonService（此时 UsersService 已经在容器中了）
5. 容器回到 UsersService，把真正的 CommonService 实例赋给 commonService
```

> **⚠️ 警告**：循环依赖通常是设计问题的信号。在大多数情况下，可以通过提取公共模块或引入 Events/消息队列来消除循环依赖。

---

### 🔬 深入理解：NestJS 的 DI 容器 vs 其他框架

| 特性 | NestJS（TypeScript） | Spring（Java） | Angular |
|------|---------------------|---------------|---------|
| 容器类型 | 轻量级 IoC 容器 | 重型 IoC 容器 | 分层 DI 系统 |
| 依赖识别 | 通过 reflect-metadata + design:paramtypes | 通过字节码分析或 XML 配置 | 通过 TypeScript emitDecoratorMetadata |
| 作用域 | Singleton / Request / Transient | Singleton / Prototype / Request / Session | Singleton / Factory |
| 自动注入 | 基于 TypeScript 编译信息 | 基于 @Autowired 注解 | 基于构造函数类型 |
| 延迟加载 | 默认启动时初始化 | 支持 @Lazy | 支持工厂函数 |

---

## 🔨 实战演练

### 练习一：理解你项目中的 DI 链

**场景描述：**
打开你自己的 NestJS 项目，找出从 Controller → Service → Repository/Provider 的完整依赖链。

**你的任务：**
1. 在自己的项目中，找出一条最长的依赖链
2. 画出依赖关系图
3. 思考：哪些类用了 `@Injectable()`？哪些没有？为什么？

**参考：**
```
UsersController
  └─ UsersService
       └─ PrismaService / TypeOrmRepository
            └─ ConfigService
                 └─ Database Config
```

<details>
<summary>🧑‍💻 先自己分析，再对比答案</summary>

**分析思路：**
1. `UsersController` 有 `@Controller()` 装饰器（内部包含 `@Injectable()`）
2. `UsersService` 必须有 `@Injectable()` 才能被注入
3. `PrismaService` 或 `Repository` 也必须有 `@Injectable()`
4. `ConfigService` 如果是 NestJS 内置的，由 `ConfigModule` 提供

**关键发现：**
- Controller 虽然没写 `@Injectable()`，但因为 `@Controller()` 内部调用了它，所以也是容器管理的
- GUI/工具类通常不需要 `@Injectable()`，因为它们不是容器管理的
</details>

### 练习二：理解 Singleton 行为

**场景描述：**
在 NestJS 中（默认 Singleton 作用域），同一个 Provider 不论被注入多少次，都是同一个实例。

**你的任务：**
1. 在两个不同的 Controller 中注入同一个 Service
2. 在该 Service 中设置一个计数器属性
3. 观察两个 Controller 是否共享同一个实例

```typescript
@Injectable()
export class CounterService {
  private count = 0;
  
  increment() {
    this.count++;
    console.log(`当前计数: ${this.count}`);
    return this.count;
  }
}

@Controller('api-a')
export class ApiAController {
  constructor(private counter: CounterService) {}
  
  @Get()
  call() {
    return { count: this.counter.increment() };
  }
}

@Controller('api-b')
export class ApiBController {
  constructor(private counter: CounterService) {}
  
  @Get()
  call() {
    return { count: this.counter.increment() };
  }
}
```

预期结果：每次请求 `/api-a` 或 `/api-b`，计数器都会递增，证明是同一个实例。

**原理**：Singleton 是默认作用域，IoC 容器在第一次实例化后，将实例缓存在 Map 中，后续所有注入都返回同一个实例。

</details>

---

## ⚡ 进阶技巧

### 技巧一：Optional Provider（可选的依赖注入）

```typescript
@Injectable()
export class UsersService {
  constructor(
    @Optional() @Inject('REDIS_OPTIONS')
    private redisOptions?: RedisOptions,
  ) {
    // RedisOptions 可能不存在，不会抛出错误
    // redisOptions 会是 undefined
  }
}
```

**原理**：`@Optional()` 告诉容器：如果找不到这个 provider，不要报错，直接注入 `undefined`。

### 技巧二：自定义 Provider Token 的最佳实践

```typescript
// 最佳实践1：使用 InjectionToken 类（推荐）
export const DATABASE_CONNECTION = new InjectionToken<string>('DATABASE_CONNECTION');

// 最佳实践2：使用 Symbol
export const CACHE_MANAGER = Symbol('CACHE_MANAGER');

// 最佳实践3：使用字符串常量（传统方式）
export const CONFIG_OPTIONS = 'CONFIG_OPTIONS';
```

**推荐使用 `InjectionToken`**，因为它：
- 提供了类型安全性
- 在调试时有更好的可读性
- 避免了字符串冲突（不同的库可能使用相同的字符串 Token）

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1: `@Injectable()` 的作用是什么？**
> A: 标记一个类为可以被 IoC 容器管理的 provider。它通过 reflect-metadata API 在类上注册元数据，使得 NestJS 能够识别它、读取其构造函数参数，并自动管理其依赖和生命周期。

**Q2: 为什么 Controller 不需要写 `@Injectable()`？**
> A: 因为 `@Controller()` 装饰器内部已经调用了 `@Injectable()`。所以 Controller 也是容器管理的，可以注入其他依赖。

**Q3: NestJS 如何知道构造函数参数的类型？**
> A: 通过 TypeScript 编译时的 `emitDecoratorMetadata` 选项。开启后，TypeScript 编译器会生成 `design:paramtypes` 元数据（使用 reflect-metadata），记录构造函数参数的类型信息。

**Q4: `forwardRef` 解决循环依赖的原理是什么？**
> A: `forwardRef` 使用了延迟解析（Lazy Resolution）策略。它创建了一个"占位符"，容器先不解析该依赖，等到所有模块都初始化完成后，再回填真正的实例。这打破了循环依赖的"先有鸡还是先有蛋"问题。

**Q5: Singleton 作用域是如何实现的？**
> A: IoC 容器内部使用一个 `Map<Token, Instance>` 缓存。当第一次解析一个 provider 时，创建实例并存入缓存；后续所有注入直接从缓存返回该实例，不再重新创建。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Nest can't resolve dependencies...` | 某个依赖未在模块的 providers 中注册 | 检查 `@Module({ providers: [...] })` 是否包含了该 provider |
| `Nest cannot create a circular dependency...` | 存在循环依赖且未使用 forwardRef | 使用 `forwardRef(() => XxxService)` 或重构设计 |
| `This constructor is not compatible with Angular Dependency Injection...` | 构造函数参数类型丢失 | 在 `tsconfig.json` 中开启 `emitDecoratorMetadata: true` 和 `experimentalDecorators: true` |
| `Optional dependency was not found...` | 未添加 `@Optional()` 但依赖不存在 | 添加 `@Optional()` 装饰器或注册该 provider |
| `Cannot resolve dependencies — please make sure that the "xx" argument is available` | 使用了字符串 Token 但未使用 `@Inject()` | 在构造函数参数上添加 `@Inject('XX')` 装饰器 |

---

## 📝 本章小结

- ✅ IoC（控制反转）是一种设计原则，将依赖管理权交给容器
- ✅ `@Injectable()` 标记类为容器可管理，而非"可被注入"
- ✅ NestJS 通过 reflect-metadata 读取参数类型实现自动注入
- ✅ 使用 `@Inject()` 显式指定非类类型的 Token
- ✅ `forwardRef` 通过延迟解析解决循环依赖
- ✅ 默认作用域是 Singleton，容器缓存实例供复用

## ➡️ 下一章预告

> 在下一章中，我们将深入 NestJS 的**模块系统**——理解 `@Module` 装饰器的本质、静态模块和动态模块的区别、全局模块的工作原理，以及 `ModuleRef` 的灵活用法。这些是理解 NestJS 架构设计的关键。
>
> [下一章：模块系统深入](./02-module-system.md)
