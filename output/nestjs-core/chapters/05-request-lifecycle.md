# 第5章 请求生命周期 —— 完整管道解析

> 预计学习时间：45 分钟

## 🎯 本章目标

学习完本章，你将能够：

- 完全掌握 HTTP 请求从进入到返回的完整链路
- 理解 Middleware → Guard → Interceptor → Pipe → Handler 的执行顺序
- 理解 Interceptor 在管道中的双向特性（请求前/响应后）
- 掌握 ExceptionFilter 的异常捕获流程
- 能在面试中清晰画出请求生命周期流程图

## 📋 前置知识

> 你已经写过拦截器（Interceptor），这是理解本章最直接的切入点。我们将从拦截器在管道中的位置开始，展开完整的请求生命周期。
>
> 建议先完成 [第1章 IoC 容器与依赖注入](./01-ioc-and-di.md) 和 [第4章 应用生命周期](./04-lifecycle-and-bootstrap.md) 的学习。

## 💡 核心概念

### 概念一：请求生命周期的完整顺序

#### 类比引入

想象你进入一家政府办事大厅办事：

```
保安（Middleware） → 检查身份证，看你是不是能进来

前台（Guard） → 判断你有没有权限办这件事

导办员（Interceptor 前置） → 记录谁来办事了、耗时多久

审核员（Pipe） → 检查你的材料格式对不对、完不完整

窗口办事员（Handler） → 实际办理你的业务

导办员（Interceptor 后置） → 给你办好的文件封装一下

投诉处理（ExceptionFilter） → 如果有问题，处理投诉
```

#### 概念讲解

NestJS 的请求生命周期顺序如下：

```
请求进入
    │
    ▼
──────────────────────────────────────
  1. Middleware（中间件）
     ├─ 全局中间件（app.use）
     ├─ 模块中间件（Module.configure）
     └─ 路由中间件（forRoutes）
──────────────────────────────────────
    │
    ▼
──────────────────────────────────────
  2. Guard（守卫）
     ├─ 全局 Guard
     ├─ Controller 级别 Guard
     └─ 方法级别 Guard
──────────────────────────────────────
    │
    ▼
──────────────────────────────────────
  3. Interceptor（拦截器 · 前置）
     ├─ 全局 Interceptor
     ├─ Controller 级别 Interceptor
     └─ 方法级别 Interceptor
──────────────────────────────────────
    │
    ▼
──────────────────────────────────────
  4. Pipe（管道）
     ├─ 全局 Pipe
     ├─ Controller 级别 Pipe
     ├─ 方法参数级别 Pipe
     └─ 路由参数级别 Pipe（@Body、@Param、@Query）
──────────────────────────────────────
    │
    ▼
  5. Route Handler（路由处理器）
     ├─ 处理业务逻辑
     └─ 调用 Service
    │
    ▼
──────────────────────────────────────
  6. Interceptor（拦截器 · 后置）
     └─ 响应转换 / 异常捕获
──────────────────────────────────────
    │
    ▼
──────────────────────────────────────
  7. Exception Filter（异常过滤器）
     └─ 捕获所有未处理的异常
──────────────────────────────────────
    │
    ▼
  响应返回
```

#### 代码验证

你可以通过以下代码来验证执行顺序：

```typescript
// middleware.ts
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: any, res: any, next: Function) {
    console.log('[1] Middleware: 请求进入');
    next();
  }
}

// auth.guard.ts
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    console.log('[2] Guard: 权限检查');
    return true;
  }
}

// logging.interceptor.ts
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    console.log('[3] Interceptor: 前置处理');
    return next.handle().pipe(
      tap(() => console.log('[6] Interceptor: 后置处理')),
    );
  }
}

// validation.pipe.ts
@Injectable()
export class ValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    console.log('[4] Pipe: 参数验证');
    return value;
  }
}

// controller.ts
@Controller('test')
@UseInterceptors(LoggingInterceptor)
export class TestController {
  @Get()
  @UseGuards(AuthGuard)
  @UsePipes(ValidationPipe)
  test() {
    console.log('[5] Handler: 处理业务');
    return { message: 'Hello' };
  }
}
```

输出结果：

```
[1] Middleware: 请求进入
[2] Guard: 权限检查
[3] Interceptor: 前置处理
[4] Pipe: 参数验证
[5] Handler: 处理业务
[6] Interceptor: 后置处理
```

---

### 概念二：各阶段详解

#### 1. Middleware（中间件）

中间件是请求管道的**第一道关卡**，它在路由匹配之前执行。

```typescript
// 函数式中间件 —— 无依赖时使用
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
}

// 类中间件 —— 需要 DI 时使用
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  constructor(private configService: ConfigService) {}
  
  use(req: Request, res: Response, next: NextFunction) {
    const isLoggingEnabled = this.configService.get('LOGGING_ENABLED');
    if (isLoggingEnabled) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
  }
}
```

**注册中间件**：

```typescript
@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware, corsMiddleware)
      .exclude('auth/login')  // 排除某些路由
      .forRoutes('*');        // 对所有路由生效
  }
}
```

**中间件与 Interceptor 的区别**：

| 特性 | Middleware | Interceptor |
|------|-----------|-------------|
| 执行时机 | 路由匹配前 | Guard 之后、Pipe 之前 |
| 访问请求对象 | ✅ 完全访问 | ✅ 通过 ExecutionContext |
| 访问响应对象 | ✅ 可以修改响应 | ✅ 可以修改响应流 |
| 依赖注入 | ✅（类中间件） | ✅ |
| 异常处理 | try/catch | RxJS catchError |
| 执行路由匹配 | ❌ 不知道路由 | ✅ 知道具体路由方法 |

#### 2. Guard（守卫）

Guard 负责**认证和授权**的决策。

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  
  canActivate(context: ExecutionContext): boolean {
    // canActivate 返回布尔值
    // true → 允许访问 | false → 拒绝访问
    const roles = this.reflector.get<string[]>('roles', context.getHandler());
    if (!roles) return true;
    
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    return roles.includes(user.role);
  }
}
```

**Guard 的实现要求**：必须实现 `CanActivate` 接口，`canActivate` 方法返回 `boolean | Promise<boolean> | Observable<boolean>`。

#### 3. Interceptor（拦截器）

拦截器利用 RxJS 实现 **面向切面编程（AOP）**。你已经在使用拦截器了，所以这里重点讲你**可能还不知道的特性**：

```typescript
// 拦截器的完整能力
@Injectable()
export class AdvancedInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // 1. 请求前处理
    const start = Date.now();
    const request = context.switchToHttp().getRequest();
    
    // 2. 可以完全绕过 handler
    if (request.headers['x-mock'] === 'true') {
      return of({ mocked: true }); // 不执行后续步骤
    }
    
    // 3. 可以修改返回的响应流
    return next.handle().pipe(
      tap({
        next: (data) => {
          // 记录成功响应
          console.log(`✅ 成功: ${Date.now() - start}ms`);
        },
        error: (err) => {
          // 记录失败的响应
          console.log(`❌ 失败: ${err.message}`);
        },
      }),
      // 转换响应格式
      map(data => ({
        code: 200,
        data,
        timestamp: new Date().toISOString(),
      })),
      // 捕获异常并转换
      catchError(err => {
        return throwError(() => new BusinessException(err.message));
      }),
      // 超时控制
      timeout(5000),
    );
  }
}
```

**Interceptor 的双向特性（最重要！）**：

```
请求链路（从上到下）：
  Interceptor 的 intercept() 开始执行
    │
    ├─ 请求前代码（比 handler 先执行）
    │
    ├─ next.handle() — 执行后续管道（Guard → Pipe → Handler）
    │     │
    │     └─ 返回 Observable
    │
    ├─ RxJS pipe 操作符（响应后执行）
    │     ├─ map() — 修改响应
    │     ├─ tap() — 执行副作用
    │     ├─ catchError() — 异常处理
    │     └─ timeout() — 超时控制
    │
    └─ intercept() 返回 Observable

响应链路（从下到上）：
  响应经过 pipe 操作符
    → Interceptor 后置代码
    → 返回给客户端
```

#### 4. Pipe（管道）

Pipe 负责**数据验证和转换**：

```typescript
// 自定义参数验证 Pipe
@Injectable()
export class ParseIdPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const id = parseInt(value, 10);
    if (isNaN(id)) {
      throw new BadRequestException('ID 必须是数字');
    }
    return id;  // 把 string 转成了 number
  }
}

// 使用
@Get(':id')
findOne(@Param('id', ParseIdPipe) id: number) {
  // 此时 id 已经是 number 类型
  return this.service.findOne(id);
}
```

**Pipe 的两种用途**：

```typescript
// 1. 数据验证（Validation）
// 输入: "abc" → 抛出 BadRequestException

// 2. 数据转换（Transformation）
// 输入: "123" → 输出: 123 (number)
// 输入: "1,2,3" → 输出: [1, 2, 3] (array)
```

**Pipe 的 ArgumentMetadata**：

```typescript
interface ArgumentMetadata {
  type: 'body' | 'query' | 'param' | 'custom';
  metatype?: Type<unknown>;  // 参数的类型（如 CreateUserDto）
  data?: string;             // 装饰器传入的数据（如 @Param('id') 的 'id'）
}
```

#### 5. Route Handler

路由处理器是你的**业务逻辑入口**，通常如下：

```typescript
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}
  
  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateUserDto) {
    // 此时：
    // ✅ Middleware 已完成请求预处理
    // ✅ Guard 已确认有权限
    // ✅ Interceptor 已记录日志
    // ✅ Pipe 已验证数据格式
    // 你可以专注于业务逻辑
    return this.usersService.create(dto);
  }
}
```

#### 6. Exception Filter（异常过滤器）

ExceptionFilter 是响应返回前的**最后一道关卡**：

```typescript
// 自定义异常过滤器
@Catch(HttpException)
export class CustomExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    
    response.status(status).json({
      statusCode: status,
      message: exception.message,
      timestamp: new Date().toISOString(),
      path: ctx.getRequest<Request>().url,
    });
  }
}
```

**异常过滤器绑定级别**：

```typescript
// 1. 方法级别
@Get()
@UseFilters(CustomExceptionFilter)
findAll() {}

// 2. Controller 级别
@Controller('users')
@UseFilters(CustomExceptionFilter)
export class UsersController {}

// 3. 全局级别
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new CustomExceptionFilter());
}
```

**异常过滤器的执行顺序**（从窄到宽）：

```
方法级别 Filter → Controller 级别 Filter → 全局 Filter
```

---

### 概念三：全局绑定 vs Controller 绑定 vs 方法绑定

```typescript
// main.ts — 全局绑定
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalGuards(new AuthGuard());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalFilters(new ExceptionFilter());
  
  await app.listen(3000);
}

// controller — Controller 级别绑定
@Controller('users')
@UseGuards(AdminGuard)    // 所有路由都需要 Admin 权限
@UseInterceptors(TransformInterceptor)
export class UsersController {
  
  // 方法级别（覆盖 Controller 级别）
  @Get()
  @UseGuards(PublicGuard)  // 这个方法用 PublicGuard 而不是 AdminGuard
  findAll() {}
}
```

---

## 🔨 实战演练

### 练习一：画出你项目的请求生命周期

打开你写的 NestJS 项目，找出每个阶段你用到的组件：

```typescript
// 你的 main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 检查你用了哪些全局绑定？
  // app.useGlobalPipes(...)
  // app.useGlobalGuards(...)
  // app.useGlobalInterceptors(...)
  // app.useGlobalFilters(...)
  
  await app.listen(3000);
}
```

然后逐个检查每个 Controller 上的装饰器，画出完整的请求链路。

### 练习二：实现一个完整的请求日志拦截器

结合你已有的拦截器经验，实现一个记录完整请求链路的拦截器：

<details>
<summary>🧑‍💻 先自己写，再展开看参考</summary>

```typescript
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const start = Date.now();
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const controllerName = context.getClass().name;
    const handlerName = context.getHandler().name;
    
    console.log(`
╔══════════════════════════════════════
║ 📥 请求开始
║ ${method} ${url}
║ Controller: ${controllerName}.${handlerName}
╚══════════════════════════════════════
    `);
    
    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - start;
          console.log(`
╔══════════════════════════════════════
║ 📤 响应完成 (${duration}ms)
║ ${method} ${url} → ${JSON.stringify(data).substring(0, 100)}
╚══════════════════════════════════════
          `);
        },
        error: (err) => {
          const duration = Date.now() - start;
          console.error(`
╔══════════════════════════════════════
║ ❌ 请求失败 (${duration}ms)
║ ${method} ${url} → ${err.message}
╚══════════════════════════════════════
          `);
        },
      }),
    );
  }
}
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：在 Interceptor 中实现超时控制

```typescript
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeout: number = 10000) {}
  
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(this.timeout),
      catchError(err => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException('请求超时'));
        }
        return throwError(() => err);
      }),
    );
  }
}
```

### 技巧二：在 Guard 中使用 Reflector 实现细粒度权限控制

```typescript
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  
  canActivate(context: ExecutionContext): boolean {
    // 先检查方法级别的权限
    const methodPermissions = this.reflector.get<string[]>(
      'permissions', 
      context.getHandler(),
    );
    
    if (methodPermissions) {
      return this.checkPermissions(methodPermissions, context);
    }
    
    // 再回退到 Controller 级别的权限
    const controllerPermissions = this.reflector.get<string[]>(
      'permissions', 
      context.getClass(),
    );
    
    if (controllerPermissions) {
      return this.checkPermissions(controllerPermissions, context);
    }
    
    return true; // 没有设置权限要求就放行
  }
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1: 请求生命周期的完整顺序？**
> A: Middleware → Guard → Interceptor(前置) → Pipe → Handler → Interceptor(后置) → ExceptionFilter

**Q2: Interceptor 中 next.handle() 前后的代码分别在什么时候执行？**
> A: next.handle() 之前的代码在 Guard 之后、Pipe 之前执行；next.handle() 之后的 RxJS pipe 代码在 Handler 返回后执行。

**Q3: Guard 和 Interceptor 的区别？**
> A: Guard 做权限决策（返回 true/false），执行时机比 Interceptor 早；Interceptor 做 AOP 切面处理，可以修改请求/响应流。

**Q4: 如何跳过某个中间件的执行？**
> A: 使用 `.exclude('path')` 方法排除特定路由。

**Q5: 异常过滤器的执行顺序？**
> A: 方法级别 → Controller 级别 → 全局级别。先匹配最具体的，再回退到全局。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Interceptor 中无法获取响应数据` | 在 pipe 中使用了不正确的操作符 | 使用 `map` 修改数据、`tap` 记录日志、`catchError` 处理异常 |
| `Guard 返回了 undefined` | canActivate 缺少 return | 确保 canActivate 返回 `true` 或 `false` |
| `Pipe 转换后类型不匹配` | Pipe 的 transform 返回值类型错误 | 确保 transform 返回正确的类型 |
| `全局 Filter 没有生效` | 在 main.ts 中绑定的时机不对 | 确保在 `app.listen()` 之前使用 `useGlobalFilters()` |

---

## 📝 本章小结

- ✅ 请求生命周期：Middleware → Guard → Interceptor(前置) → Pipe → Handler → Interceptor(后置) → ExceptionFilter
- ✅ Middleware 在路由匹配前执行，是最早的关卡
- ✅ Guard 做权限决策，返回 boolean
- ✅ Interceptor 是 AOP 核心，利用 RxJS 实现双向处理
- ✅ Pipe 做数据验证和转换
- ✅ ExceptionFilter 是异常处理的最后防线

## ➡️ 下一章预告

> 在下一章中，我们将探索 NestJS 的**元数据反射系统**——了解 Reflector、SetMetadata、ExecutionContext 和自定义装饰器的内部机制。这也是你写自定义装饰器时需要的底层知识。
>
> [下一章：元数据反射与自定义装饰器](./06-metadata-and-reflector.md)
