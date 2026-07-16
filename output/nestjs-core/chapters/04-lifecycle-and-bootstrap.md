# 第4章 应用生命周期与启动过程

> 预计学习时间：35 分钟

## 🎯 本章目标

学习完本章，你将能够：

- 理解 `NestFactory.create()` 背后的完整启动流程
- 掌握所有生命周期钩子的执行时机和用途
- 理解 NestJS 是如何将 Express/Fastify 集成起来的
- 学会在项目中合理使用生命周期钩子

## 💡 核心概念

### 概念一：NestFactory.create() 的内部机制

#### 类比引入

`NestFactory.create()` 就像一家餐厅的开业流程：

```
1. 装修布局（配置 IoC 容器）
2. 招聘员工（注册 providers）
3. 培训员工（初始化依赖）
4. 菜单定价（注册路由）
5. 开门营业（启动 HTTP 服务器）
```

#### 概念讲解

当你调用 `NestFactory.create()` 时，NestJS 内部经历了以下步骤：

```typescript
// 你写的入口
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

**简化后的内部流程**：

```typescript
// NestJS 内部 NestFactory.create() 的核心实现 ≈ 
class NestFactory {
  static async create(module: any): Promise<INestApplication> {
    // Step 1: 初始化 IoC 容器
    const container = new NestContainer();
    
    // Step 2: 扫描并注册所有模块
    const scanner = new DependenciesScanner();
    await scanner.scan(module, container);
    
    // Step 3: 初始化模块（创建各模块的 DI 作用域）
    const instanceLoader = new InstanceLoader(container);
    await instanceLoader.initialize();
    
    // Step 4: 创建 HTTP 适配器（如果检测到 Express/Fastify）
    const adapter = new ExpressAdapter();
    
    // Step 5: 解析中间件
    const middlewaresResolver = new MiddlewaresResolver(adapter);
    await middlewaresResolver.resolve(container);
    
    // Step 6: 解析路由（注册 Controller）
    const routesResolver = new RoutesResolver(adapter);
    await routesResolver.resolve(container);
    
    // Step 7: 返回 NestApplication 实例
    return new NestApplication(container, adapter);
  }
}
```

#### 更详细的启动序列

```
bootstrap()
  │
  ├─ 1. NestFactory.create(AppModule)
  │     │
  │     ├─ 1.1 创建 IoC 容器 (NestContainer)
  │     │     └─ 创建 Module 的 Map
  │     │
  │     ├─ 1.2 DependenciesScanner.scan()
  │     │     ├─ 遍历所有模块（递归处理 imports）
  │     │     ├─ 收集每个模块的 providers、controllers
  │     │     ├─ 建立完整的依赖图
  │     │     └─ 检测循环依赖
  │     │
  │     ├─ 1.3 InstanceLoader.initialize()
  │     │     ├─ 创建模块实例（ModuleFactory）
  │     │     ├─ 解析模块的 providers（递归构造依赖）
  │     │     ├─ 触发 OnModuleInit 钩子 ← 你的业务代码在这里执行
  │     │     └─ 创建 Controller 实例
  │     │
  │     ├─ 1.4 创建 HTTP 适配器
  │     │     ├─ 默认使用 Express（expressAdapter）
  │     │     └─ 如果有 FastifyAdapter 参数则使用 Fastify
  │     │
  │     ├─ 1.5 解析路由（RoutesResolver）
  │     │     ├─ 读取 Controller 的 @Controller 装饰器（路由前缀）
  │     │     ├─ 读取每个方法的 @Get/@Post 等装饰器
  │     │     ├─ 注册路由到 Express/Fastify
  │     │     └─ 绑定全局 Guards/Pipes/Interceptors
  │     │
  │     └─ 1.6 返回 NestApplication 实例
  │
  ├─ 2. 执行中间件配置
  │     └─ 你实现的 configure() 方法（如果有）
  │
  ├─ 3. app.listen(3000)
  │     ├─ 3.1 检测是否调用了 enableShutdownHooks()
  │     ├─ 3.2 触发 onApplicationBootstrap 钩子 ← 应用就绪
  │     └─ 3.3 启动 HTTP 服务器 (Express listen)
  │
  └─ 4. 应用开始处理请求
```

---

### 概念二：HTTP 适配器模式

NestJS 的一个核心设计是**平台无关性**：

```typescript
// 默认使用 Express
const app = await NestFactory.create(AppModule);

// 可选使用 Fastify（性能更高）
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),
);
```

**适配器模式的核心接口**：

```typescript
// 适配器模式的核心抽象
interface HttpServer {
  // 所有 HTTP 框架都要实现的接口
  listen(port: number): Promise<void>;
  close(): Promise<void>;
  get(handler: Function): void;
  post(handler: Function): void;
  // ...
}

// Express 适配器
class ExpressAdapter implements HttpServer {
  private app: express.Application;
  
  constructor() {
    this.app = express();
  }
  
  listen(port: number) {
    return new Promise(resolve => this.app.listen(port, resolve));
  }
  
  // 将 Express 的 API 适配到 NestJS 的统一接口
}

// Fastify 适配器
class FastifyAdapter implements HttpServer {
  private app: fastify.FastifyInstance;
  
  // Fastify 版本的实现
}
```

**关键理解**：NestJS 通过适配器模式，抽象出了 HTTP 层的统一接口。你的业务代码（Controller、Service）不需要关心底层是 Express 还是 Fastify。

---

### 概念三：生命周期钩子

#### 类比引入

钩子就像你手机里的"起床闹钟序列"：

```
07:00 震动叫醒（onModuleInit）—— 模块开始准备
07:10 关闭闹钟（onApplicationBootstrap）—— 应用就绪
22:00 勿扰模式（onModuleDestroy）—— 模块开始关闭
22:01 清理后台（beforeApplicationShutdown）—— 关闭前准备
22:05 关机（onApplicationShutdown）—— 应用关闭
```

#### 钩子序列

```typescript
// 完整生命周期序列
// ──── 启动阶段 ────
// 
// 1. constructor()               ← 类实例化（最优先）
// 2. onModuleInit()              ← 模块初始化完成
// 3. onApplicationBootstrap()    ← 所有模块就绪，应用启动
// 
// ──── 关闭阶段 ────
// 
// 4. onModuleDestroy()           ← 模块开始销毁
// 5. beforeApplicationShutdown() ← 应用即将关闭
// 6. onApplicationShutdown()     ← 应用关闭（释放资源）
```

#### 每个钩子的代码实现

**OnModuleInit** —— 模块初始化后执行：

```typescript
@Injectable()
export class DatabaseService implements OnModuleInit {
  async onModuleInit() {
    // 在模块所有依赖都解析完成后调用
    // 适合：建立数据库连接、缓存预热
    console.log('[Database] 连接数据库...');
    await this.connectToDatabase();
    console.log('[Database] 连接成功');
  }
}
```

**OnApplicationBootstrap** —— 应用启动后执行：

```typescript
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  async onApplicationBootstrap() {
    // 所有模块都初始化完成后调用
    // 适合：数据初始化、种子数据、同步配置
    console.log('[Seed] 开始填充初始数据...');
    await this.seedData();
    console.log('[Seed] 数据填充完成');
  }
}
```

**OnModuleDestroy** —— 模块销毁时执行：

```typescript
@Injectable()
export class PubSubService implements OnModuleDestroy {
  async onModuleDestroy() {
    // 收到关闭信号后调用
    // 适合：取消订阅、停止消费消息
    console.log('[PubSub] 取消订阅...');
    await this.unsubscribe();
  }
}
```

**OnApplicationShutdown** —— 应用关闭时执行：

```typescript
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string) {
    // 应用关闭时调用（需要 enableShutdownHooks）
    // signal 参数：'SIGTERM' | 'SIGINT' | 'SIGHUP' 等
    console.log(`[Database] 收到 ${signal}，关闭连接池...`);
    await this.closePool();
    console.log('[Database] 连接池已关闭');
  }
}
```

**启用关闭钩子**：

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // ⚠️ 必须显式启用，关闭钩子才能工作
  app.enableShutdownHooks();
  
  await app.listen(3000);
}
```

---

### 概念四：应用上下文（ApplicationContext）

有些场景你不需要 HTTP 服务器（如定时任务、CLI 工具、测试）：

```typescript
// 不需要启动 HTTP 服务器
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  // 直接获取并使用 Service
  const usersService = app.get(UsersService);
  const users = await usersService.findAll();
  
  console.log(users);
}

bootstrap();
```

**原理**：`createApplicationContext` 会执行除了"创建 HTTP 适配器"和"启动服务器"之外的所有步骤。它只初始化 IoC 容器和模块。

---

## 🔨 实战演练

### 练习一：使用生命周期管理数据库连接

在你的项目中添加数据库连接管理：

```typescript
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  async onModuleInit() {
    console.log('[Prisma] 连接数据库...');
    await this.$connect();
    console.log('[Prisma] 已连接');
  }

  async onApplicationShutdown(signal?: string) {
    console.log(`[Prisma] 收到 ${signal}，断开数据库...`);
    await this.$disconnect();
    console.log('[Prisma] 已断开');
  }
}
```

### 练习二：验证生命周期顺序

```typescript
@Injectable()
export class LifecycleTesterService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy, OnApplicationShutdown
{
  constructor() {
    console.log('1. constructor');
  }

  onModuleInit() {
    console.log('2. onModuleInit');
  }

  onApplicationBootstrap() {
    console.log('3. onApplicationBootstrap');
  }

  onModuleDestroy() {
    console.log('4. onModuleDestroy');
  }

  onApplicationShutdown(signal: string) {
    console.log(`5. onApplicationShutdown (signal: ${signal})`);
  }
}
```

启动后观察输出顺序。可在 `main.ts` 中通过 `app.close()` 触发关闭流程验证。

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1: NestFactory.create() 的内部流程？**
> A: 创建 IoC 容器 → 扫描模块/收集 providers → 初始化模块（解析依赖树）→ 创建 HTTP 适配器 → 解析路由 → 返回应用实例。

**Q2: onModuleInit 和 onApplicationBootstrap 的区别？**
> A: onModuleInit 在模块的依赖解析完成后、模块级别执行；onApplicationBootstrap 在所有模块都初始化完成后执行。前者是模块级别，后者是应用级别。

**Q3: 为什么需要 enableShutdownHooks()？**
> A: 因为监听系统信号可能干扰底层 HTTP 服务器的正常关闭流程。NestJS 默认不启用，需要显式调用 `app.enableShutdownHooks()` 来激活。

**Q4: createApplicationContext 和 create 的区别？**
> A: createApplicationContext 不创建 HTTP 适配器，不启动服务器。只初始化 IoC 容器和模块，适合非 HTTP 场景。

</details>

---

## 📝 本章小结

- ✅ NestFactory.create() 经历了容器初始化 → 模块扫描 → 依赖解析 → 路由注册的完整流程
- ✅ 适配器模式使 NestJS 可以切换底层 HTTP 框架（Express/Fastify）
- ✅ 5 个生命周期钩子：onModuleInit、onApplicationBootstrap、onModuleDestroy、beforeApplicationShutdown、onApplicationShutdown
- ✅ createApplicationContext 用于非 HTTP 场景
- ✅ shutdown hooks 需要显式 enable

## ➡️ 下一章预告

> 在下一章中，我们将深入 **请求生命周期（Request Lifecycle）**—— 从请求进入应用到响应返回的完整链路：Middleware → Guard → Interceptor → Pipe → Handler → Interceptor → ExceptionFilter。这是面试中的高频考点，也是你理解 NestJS 架构的关键。
>
> [下一章：请求生命周期](./05-request-lifecycle.md)
